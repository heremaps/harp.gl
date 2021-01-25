/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { assert } from "chai";

declare const global: any;

//    lots of stubs are needed which are just placeholders and are empty

/**
 * Fake `Worker` class to be used in Node environment with [[stubGlobalConstructor]].
 */
export class FakeWebWorker {
    addEventListener() {}
    removeEventListener() {}
    postMessage() {}
    terminate() {}
    dispatchEvent() {}
}

type Listener = EventListener | EventListenerObject;

/**
 * Simple message queue that holds messages until some listener is registered.
 *
 * Required to simulate behavior of Worker's onmessage/postMessage pairs which to so
 * to prevent race condition between adding first listener and posting first message.
 */
class MessageQueue {
    listeners: Listener[] = [];
    messageQueue: any[] = [];

    dispatchEvent(message: any) {
        this.messageQueue.push(message);
        if (this.listeners.length > 0) {
            this.processPendingMessages();
        }
    }

    addListener(listener: Listener) {
        this.listeners.push(listener);
        this.processPendingMessages();
    }

    removeListener(listener: Listener) {
        this.listeners = this.listeners.filter(elem => elem !== listener);
    }

    processPendingMessages() {
        while (this.messageQueue.length > 0) {
            const event = this.messageQueue.shift();
            this.listeners.forEach(listener => {
                if (typeof listener === "function") {
                    listener(event);
                } else {
                    listener.handleEvent(event);
                }
            });
        }
        this.messageQueue = [];
    }
}

interface ListenerMap {
    [name: string]: MessageQueue;
}

interface FakeWorkerData extends Worker {
    /**
     * Listeners registered for Worker->Main channel by `Worker#addEventListener`.
     */
    extListeners: ListenerMap;

    /**
     * Listeners registered for Main->Worker channel by workers internal `onmessage`.
     */
    intListeners: ListenerMap;
}

/**
 * Fake worker script `self` executed by stubs creates using [[willExecuteWorkerScript]]
 * implements basic functionality via this interface.
 */
export interface LimitedWorkerScope {
    onmessage?: (event: MessageEvent) => void;
    onerror?: (event: ErrorEvent) => void;

    postMessage(message: any): void;
}

/**
 * Instruments empty stub, so it behaves like `Worker` constructor.
 *
 * Supports:
 *  * Worker interface: add/removeEventListener/postMessage
 *  * inner worker API:
 *    ** self.onmessage = () => {}
 *    ** self.postMessage(msg())
 *
 * Executes `workerScript` in context that looks like Web Worker context.
 *
 * Execution of `workerScript` and `setTimeout`, `setInterval` callbacks scheduled from within
 * "worker script" has `self` faked using [[FakeWebWorker.fakeSelf]] .
 *
 * Perfect for race condition testing, because it starts worker script immediately in next
 * 'microtask' after construction (which indeed can happen in real environment, when worker code is
 * already available and computer is slow).
 *
 * @param workerConstructorStub - worker constructor stub to be instrumented
 * @param workerScript -  fake worker script to be executed
 */
export function willExecuteWorkerScript(
    workerConstructorStub: any,
    workerScript: (self: LimitedWorkerScope, scriptUrl: string) => void
) {
    workerConstructorStub.callsFake(function (this: FakeWorkerData, scriptUrl: string) {
        const intListeners: ListenerMap = {
            message: new MessageQueue(),
            error: new MessageQueue()
        };
        const extListeners: ListenerMap = {
            message: new MessageQueue(),
            error: new MessageQueue()
        };
        this.intListeners = intListeners;
        this.extListeners = extListeners;

        const workerSelf: LimitedWorkerScope = {
            set onmessage(listener: any) {
                intListeners.message.addListener(listener);
            },
            set onerror(listener: any) {
                intListeners.error.addListener(listener);
            },
            postMessage(message: any) {
                extListeners.message.dispatchEvent({ type: "message", data: message });
            }
        };

        const workerStartScript = () => {
            FakeWorkerSelf.fakeSelf(workerSelf);
            try {
                workerScript(workerSelf, scriptUrl);
                FakeWorkerSelf.restoreSelf();
            } catch (error) {
                FakeWorkerSelf.restoreSelf();
                extListeners.error.dispatchEvent({ type: "error", message: error });
            }
        };
        setTimeout(workerStartScript, 1);
    });

    workerConstructorStub.prototype.postMessage.callsFake(function (
        this: FakeWorkerData,
        message: any
    ) {
        this.intListeners.message.dispatchEvent({ type: "message", data: message });
    });

    workerConstructorStub.prototype.addEventListener.callsFake(function (
        this: FakeWorkerData,
        type: string,
        listener: Listener
    ) {
        assert.oneOf(type, ["message", "error"]);
        this.extListeners[type].addListener(listener);
    });

    workerConstructorStub.prototype.removeEventListener.callsFake(function (
        this: FakeWorkerData,
        type: string,
        listener: Listener
    ) {
        assert.oneOf(type, ["message", "error"]);
        this.extListeners[type].removeListener(listener);
    });

    workerConstructorStub.prototype.dispatchEvent.callsFake(function (
        this: FakeWorkerData,
        event: any
    ) {
        this.extListeners.message.dispatchEvent(event);
    });
}

class FakeWorkerSelf {
    static originalSelf: any;
    static shouldRestoreSelf: boolean = false;
    static originalSetTimeout: any;
    static originalSetInterval: any;

    /**
     * Sets new `self` to be used.
     *
     * Also, fakes `setTimeout` and `setInterval` so any callback registered when `self` is faked
     * will have also `self` faked when it's run.
     *
     * Call to [[restoreSelf]] call is mandatory, otherwise strange things happen.
     *
     * @param newSelf -
     */
    static fakeSelf(newSelf: LimitedWorkerScope) {
        if (!this.shouldRestoreSelf) {
            this.originalSelf = global.self;
            this.originalSetTimeout = setTimeout;
            this.originalSetInterval = setInterval;
        }

        this.shouldRestoreSelf = true;
        global.self = newSelf;
        global.setTimeout = (callback: () => void, timeout: number) => {
            return this.originalSetTimeout.call(
                null,
                () => {
                    this.fakeSelf(newSelf);
                    try {
                        callback();
                    } finally {
                        this.restoreSelf();
                    }
                },
                timeout
            );
        };

        global.setInterval = (callback: () => void, timeout: number) => {
            return this.originalSetInterval.call(
                null,
                () => {
                    this.fakeSelf(newSelf);
                    try {
                        callback();
                    } finally {
                        this.restoreSelf();
                    }
                },
                timeout
            );
        };
    }

    static restoreSelf() {
        if (this.shouldRestoreSelf) {
            this.shouldRestoreSelf = false;
            global.self = this.originalSelf;
            global.setTimeout = this.originalSetTimeout;
            global.setInterval = this.originalSetInterval;
        }
    }
}
