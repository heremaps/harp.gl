/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { LoggerManager, LogLevel } from "@here/harp-utils";
import { assert } from "chai";
import * as sinon from "sinon";

/**
 * Check if we're executing in Web Browser environment (but not in Web Worker)
 *
 * https://stackoverflow.com/questions/17575790/environment-detection-node-js-or-browser
 */
export function inBrowserContext() {
    return function (this: any) {
        return typeof window !== "undefined" && this === window;
    }.call(undefined);
}

/**
 * Check if we're executing in Web Worker environment.
 */
export function inWebWorkerContext() {
    return typeof self !== "undefined" && typeof (self as any).importScripts === "function";
}

/**
 * Define a suite that is executed only in Node.JS environment.
 */
export function inNodeContext() {
    return function (this: any) {
        return typeof global !== "undefined" && this === global;
    }.call(undefined);
}

declare const global: any;

/**
 * Create stub of global constructor managed by sandbox.
 *
 * A `prototype` preserving, node/browser environment aware version of
 * `sandbox.stub(window | global, name).
 *
 * Use to stub global constructors like `Worker` or `XMLHttpRequest`.
 *
 * @param sandbox - `sinon.Sandbox` instance, required for proper cleanup after test
 * @param name - name of global symbol to be constructor
 */
export function stubGlobalConstructor(sandbox: sinon.SinonSandbox, name: string) {
    const theGlobal: any = typeof window !== "undefined" ? window : global;
    let prototype = theGlobal[name].prototype;
    const stub = sandbox.stub(theGlobal, name);
    while (prototype && prototype !== Object.prototype) {
        Object.getOwnPropertyNames(prototype).forEach(key => {
            stub.prototype[key] = sandbox.stub();
        });
        prototype = prototype.__proto__;
    }
    return stub;
}

/**
 * Last error encountered by `willEventually` that forbidden progress in test.
 *
 * Rethrown in [[maybeReportUnmetAssertion]] at the end of test.
 * @hidden
 */
let lastWaitedError: Error | undefined;

/**
 * Internal flag used to in
 * @hidden
 */
let afterHandlerInstalled: boolean = false;

/**
 * Internal - current test instance used by [[willEventually]]
 *
 * @hidden
 */
let mochaCurrentTest: any; // any is used to skip import of whole 'Mocha' for one small typedef

/**
 * Repeats block of code until it passes without `AssertionError`.
 *
 * Additionally, if test fails due to timeout, last error that was encountered is rethrown, so any
 * error that have constructor called `AssertionError` (matches chai assertions) will cause `test`
 * to be repeated after 1ms delay.
 *
 * The last error that blocked `willEventually` from resolving will be rethrown in `afterEach` to
 * mark which assertion didn't hold (see [[reportWillEventuallyBlockingAssertion]]).
 *
 * Use for APIs that are internally asynchronous without explicit means to monitor completion of
 * tasks.
 *
 * Example:
 *
 *   const foo = someCodeThatIsAsync({count: 6})
 *
 *   await willEventually(() => {
 *       assert.equals(foo.readyCount, 6);
 *   });
 *
 * @param test - closure with assertions that must pass
 * @returns promise that resolves when `test` passes without any error
 */
export function willEventually<T = void>(test: () => T): Promise<T> {
    lastWaitedError = undefined;
    const currentTest = mochaCurrentTest;

    if (!afterHandlerInstalled) {
        afterEach(reportAsyncFailuresAfterTestEnd);
        afterHandlerInstalled = true;
    }

    return new Promise<T>((resolve, reject) => {
        function iteration() {
            // Ensure that we're still running out test, because Mocha could abort our test due to
            // timeout or any other reason.
            if (
                currentTest !== mochaCurrentTest ||
                (currentTest !== undefined && currentTest.state !== undefined)
            ) {
                return;
            }
            try {
                const r = test();
                lastWaitedError = undefined;
                resolve(r);
            } catch (error) {
                if (error.constructor.name === "AssertionError") {
                    lastWaitedError = error;
                    setTimeout(iteration, 1);
                } else {
                    lastWaitedError = undefined;
                    reject(error);
                }
            }
        }
        setTimeout(iteration, 1);
    });
}

/**
 * Assert that promise is rejected.
 *
 * Check that promise `v` (passed directly or result of function) is eventually rejected with error
 * that matches `errorMessagePattern`.
 */
export async function assertRejected(
    v: Promise<any> | (() => Promise<any>),
    errorMessagePattern: string | RegExp
) {
    let r: any;
    try {
        r = await Promise.resolve(typeof v === "function" ? v() : v);
    } catch (error) {
        if (typeof errorMessagePattern === "string") {
            errorMessagePattern = new RegExp(errorMessagePattern);
        }
        assert.match(error.message, errorMessagePattern);
        return;
    }
    assert.fail(`expected exception that matches ${errorMessagePattern}, but received '${r}'`);
}

type IConsoleLike = Pick<Console, "error" | "info" | "log" | "warn">;

/**
 * Assert that synchronous test function `fn` will logs specfic message.
 *
 * Captures error messages of `type` from `channel` and asserts that at least one contain
 * message that matches `errorMessagePattern`.
 *
 * Swallows matching messages, so they don't appear in actual output so "test log" is clean from
 * expected messages.
 *
 * Example with `console.warn`
 * ```
 *   assertWillLogSync(() => {
 *       console.warn("error: fooBar"),
 *       console,
 *       "warn"
 *       /error/
 *   );
 * ```
 *
 * @param fn - test function that shall provoke certain log output
 * @param channel - `Console` like object
 * @param type - type of console message i.e `"log" | "error" | "warn" | "info`
 * @param errorMessagePattern - string or regular expression that we look for in logs
 */
export function assertLogsSync(
    fn: () => void,
    channel: IConsoleLike,
    type: keyof IConsoleLike,
    errorMessagePattern: string | RegExp
) {
    const errorMessageRe =
        typeof errorMessagePattern === "string"
            ? new RegExp(errorMessagePattern)
            : errorMessagePattern;
    const capturedMessages: string[] = [];
    const original = channel[type];
    const stub = sinon.stub(channel, type).callsFake((...args: any[]) => {
        const message = args.join(" ");
        if (errorMessageRe.test(message)) {
            capturedMessages.push(message);
        } else {
            original.apply(channel, args as [any?, ...any[]]);
        }
    });
    const cleanup = () => {
        stub.restore();
    };

    try {
        fn();
        cleanup();
        const hasMatching = capturedMessages.find(message => errorMessageRe.test(message));
        assert(hasMatching, `expected log message matching '${errorMessagePattern}' to be logged`);
    } catch (error) {
        cleanup();
        throw error;
    }
}

export interface EventSource<T> {
    addEventListener(type: string, listener: (event: T) => void): void;
    removeEventListener(type: string, listener: (event: T) => void): void;
}

/**
 * Wait for particular event on `THREE.EventDispatcher` or DOM `EventTarget` compatible objects.
 *
 * Automatically unregisters itself receiving the event.
 *
 * @param source - event source or target that has add/removeEventListener(type, listener) method.
 *     protocol
 * @param eventType - type of event
 * @returns promise that resolves to first event that is received
 */
export function waitForEvent<T>(source: EventSource<T>, eventType: string): Promise<T> {
    const currentTest = mochaCurrentTest;

    waitEventWaitedEvent = eventType;
    if (!afterHandlerInstalled) {
        afterEach(reportAsyncFailuresAfterTestEnd);
        afterHandlerInstalled = true;
    }

    return new Promise<T>(resolve => {
        const listener = (event: any) => {
            if (
                currentTest !== mochaCurrentTest ||
                (currentTest !== undefined && currentTest.state !== undefined)
            ) {
                return;
            }

            if (waitEventCleanup !== undefined) {
                waitEventCleanup();
                waitEventCleanup = undefined;
            }

            resolve(event as T);
        };
        waitEventCleanup = () => {
            source.removeEventListener(eventType, listener);
        };
        source.addEventListener(eventType, listener);
    });
}

let waitEventCleanup: (() => void) | undefined;
let waitEventWaitedEvent: string | undefined;

/**
 * Rethrows last assertion that blocked [[willEventually]] or [[waitForEvent]]. It is called
 * automatically after each `Mocha` test execution.
 *
 *  Note: Must be called only as `Mocha` `afterEach` hook. It expects `this` to be
 * `IHookCallbackContext`.
 */
function reportAsyncFailuresAfterTestEnd(this: any) {
    mochaCurrentTest = undefined;

    if (waitEventCleanup && waitEventWaitedEvent !== undefined) {
        waitEventCleanup();
        waitEventCleanup = undefined;

        // Note, this is actually mocha.IHookCallbackContext but it's not imported to not include
        // whole mocha dependency only for this very declaration.
        this.test.error(
            new Error(`waitEvent didn't receive '${waitEventWaitedEvent}' before test timeouted`)
        );
    }

    if (lastWaitedError) {
        mochaCurrentTest = undefined;
        const tmp = lastWaitedError;
        tmp.message = `willEventually couldn't pass through: ${tmp.toString()}`;
        lastWaitedError = undefined;
        // Note, this is actually IHookCallbackContext but it's not imported to not include whole
        // mocha dependency only for this very declaration.
        this.test.error(tmp);
    }
    return {};
}

if (typeof beforeEach !== "undefined") {
    beforeEach(function (this: Mocha.Context) {
        // Save current test so willEventually && waitForEvent can check that current test is still
        // executing.
        mochaCurrentTest = this.currentTest;
    });
}

/**
 * Sets the specified loggers to only log at the given minLogLevel. Only use this function when you
 * know that you can safely ignore a warning, otherwise you should consider to fix the issue. All
 * previous logging levels are reset after the function is executed.
 * @param loggerName The loggerName, or array of names to set to error
 * @param func The function to execute with the changed logging
 * @param minLogLevel The minimum log level that is shown, defaults to LogLevel.Error
 */
export async function silenceLoggingAroundFunction(
    loggerName: string | string[],
    func: () => void,
    minLogLevel: LogLevel = LogLevel.Error
) {
    const previousLogLevels: Array<{ level: LogLevel; loggerName: string }> = [];
    const loggers = !Array.isArray(loggerName) ? [loggerName] : loggerName;
    for (const loggerName of loggers) {
        const logger = LoggerManager.instance.getLogger(loggerName);
        if (logger) {
            previousLogLevels.push({ loggerName, level: logger.level });
            LoggerManager.instance.setLogLevel(loggerName, minLogLevel);
        }
    }

    try {
        await func();
    } finally {
        for (const logger of previousLogLevels) {
            LoggerManager.instance.setLogLevel(logger.loggerName, logger.level);
        }
    }
}
