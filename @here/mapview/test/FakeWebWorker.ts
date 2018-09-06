/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

import { assert } from "chai";

// tslint:disable:no-empty
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

type Listener = (message: any) => void;
interface ListenerMap {
    [name: string]: Listener[];
}

interface FakeWorkerData extends Worker {
    extListeners: ListenerMap;
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
 * Execution of `workerScript` and `setTimeout`, `setImmediate` callbacks scheduled from within
 * "worker script" has `self` faked using [[FakeWebWorker.fakeSelf]] .
 *
 * Perfect for race condition testing, because it starts worker script immediately in next
 * 'microtask' after contruction (which indeed can happen in real environment, when worker code is
 * already available and computer is laggy).
 *
 * @param workerConstructorStub worker constructor stub to be instrumented
 * @param workerScript  fake worker script to be executed
 */
export function willExecuteWorkerScript(
    workerConstructorStub: any,
    workerScript: (self: LimitedWorkerScope) => void
) {
    workerConstructorStub.callsFake(function(this: FakeWorkerData) {
        const intListeners: ListenerMap = {
            message: [],
            error: []
        };
        const extListeners: ListenerMap = {
            message: [],
            error: []
        };
        this.intListeners = intListeners;
        this.extListeners = extListeners;

        const workerSelf: LimitedWorkerScope = {
            set onmessage(listener: Listener) {
                intListeners.message.push(listener);
            },
            set onerror(listener: any) {
                intListeners.error.push(listener);
            },
            postMessage(message: any) {
                setImmediate(() => {
                    extListeners.message.forEach(listener => {
                        listener({ type: "message", data: message });
                    });
                });
            }
        };

        setTimeout(() => {
            FakeWorkerSelf.fakeSelf(workerSelf);
            try {
                workerScript(workerSelf);
            } catch (error) {
                FakeWorkerSelf.restoreSelf();
                extListeners.error.forEach(listener => {
                    listener({ type: "error", message: error });
                });
            } finally {
                FakeWorkerSelf.restoreSelf();
            }
        }, 1);
    });

    workerConstructorStub.prototype.postMessage.callsFake(function(
        this: FakeWorkerData,
        message: any
    ) {
        setImmediate(() => {
            this.intListeners.message.forEach(listener => {
                listener({ type: "message", data: message });
            });
        });
    });

    workerConstructorStub.prototype.addEventListener.callsFake(function(
        this: FakeWorkerData,
        type: string,
        listener: Listener
    ) {
        assert.oneOf(type, ["message", "error"]);
        this.extListeners[type].push(listener);
    });

    workerConstructorStub.prototype.removeEventListener.callsFake(function(
        this: FakeWorkerData,
        type: string,
        listener: Listener
    ) {
        this.extListeners[type] = this.extListeners[type].filter(elem => elem !== listener);
    });

    workerConstructorStub.prototype.dispatchEvent.callsFake(function(
        this: FakeWorkerData,
        event: any
    ) {
        this.extListeners.message.forEach(listener => {
            listener(event);
        });
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
     * Also, fakes `setTimetout` and `setInterval` so any callback registered when `self` is faked
     * will have also `self` faked when it's run.
     *
     * Call to [[restoreSelf]] call is mandatory, otherwise strange things happen.
     *
     * @param newSelf
     */
    static fakeSelf(newSelf: LimitedWorkerScope) {
        if (!this.shouldRestoreSelf) {
            this.originalSelf = (global as any).self;
            this.originalSetTimeout = setTimeout;
            this.originalSetInterval = setInterval;
        }

        this.shouldRestoreSelf = true;
        (global as any).self = newSelf;
        (global as any).setTimeout = (callback: () => void, timeout: number) => {
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

        (global as any).setInterval = (callback: () => void, timeout: number) => {
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
            (global as any).self = this.originalSelf;
            (global as any).setTimeout = this.originalSetTimeout;
            (global as any).originalSetInterval = this.originalSetInterval;
        }
    }
}
