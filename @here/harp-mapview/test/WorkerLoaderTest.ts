/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import {
    assertRejected,
    getTestResourceUrl,
    silenceLoggingAroundFunction,
    stubGlobalConstructor
} from "@here/harp-test-utils";
import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
chai.use(chaiAsPromised);
const { expect, assert } = chai;
import * as sinon from "sinon";

import { WorkerLoader } from "../lib/workers/WorkerLoader";
import { FakeWebWorker, willExecuteWorkerScript } from "./FakeWebWorker";

declare const global: any;

const workerDefined = typeof Worker !== "undefined" && typeof Blob !== "undefined";
const describeWithWorker = workerDefined ? describe : xdescribe;

const testWorkerUrl = getTestResourceUrl("@here/harp-mapview", "test/resources/testWorker.js");

describeWithWorker("Web Worker API", function () {
    it("Worker is able to load worker from blob", done => {
        // note, for this test to work, CSP (Content Security Policy)
        // must allow for executing workers from blob:
        // example:
        //   child-src blob:   (legacy)
        //   worker-src: blob: (new, but not yet recognized by browsers)
        const script = `
            self.postMessage({ hello: 'world' });
        `;
        assert.isDefined(Blob);

        const blob = new Blob([script], { type: "application/javascript" });
        assert.isTrue(blob.size > 0);
        const worker = new Worker(URL.createObjectURL(blob));
        worker.addEventListener("message", event => {
            assert.isDefined(event.data);
            assert.equal(event.data.hello, "world");
            done();
        });
        worker.addEventListener("error", msg => {
            done(new Error("received error event"));
        });
    });

    it("Worker is able to load worker from URL", done => {
        const worker = new Worker(testWorkerUrl);
        worker.addEventListener("message", event => {
            assert.isDefined(event.data);
            assert.equal(event.data.hello, "world");
            done();
        });
        worker.addEventListener("error", msg => {
            done(new Error("received error event"));
        });
    });
});

describe("WorkerLoader", function () {
    let sandbox: sinon.SinonSandbox;
    beforeEach(function () {
        sandbox = sinon.createSandbox();
        if (typeof window === "undefined") {
            // fake Worker constructor for node environment
            global.Worker = FakeWebWorker;
        }
    });

    afterEach(function () {
        sandbox.restore();
        if (typeof window === "undefined") {
            delete global.Worker;
        }
        WorkerLoader.directlyFallbackToBlobBasedLoading = false;
    });

    describe("works in mocked environment", function () {
        it("#startWorker starts worker not swalling first message", async function () {
            const workerConstructorStub = stubGlobalConstructor(sandbox, "Worker");
            willExecuteWorkerScript(workerConstructorStub, (self, scriptUrl) => {
                self.postMessage({ hello: "world" });
            });

            const worker = await WorkerLoader.startWorker(testWorkerUrl);
            await new Promise<void>((resolve, reject) => {
                worker.addEventListener("message", event => {
                    assert.isDefined(event.data);
                    assert.equal(event.data.hello, "world");
                    resolve();
                });
                worker.addEventListener("error", msg => {
                    reject(new Error("received error event"));
                });
            });

            assert.equal(workerConstructorStub.callCount, 1);
            assert.equal(workerConstructorStub.firstCall.args[0], testWorkerUrl);
        });

        it("#startWorker fails on timeout", async function () {
            const workerConstructorStub = stubGlobalConstructor(sandbox, "Worker");
            willExecuteWorkerScript(workerConstructorStub, () => {
                // We intentionally do not send anything, so waitForWorkerInitialized
                // should raise timeout error.
                // self.postMessage({ hello: "world" });
            });

            await assertRejected(WorkerLoader.startWorker(testWorkerUrl, 10), /timeout/i);
        });

        it("#startWorker fails on error in script", async function () {
            const workerConstructorStub = stubGlobalConstructor(sandbox, "Worker");
            willExecuteWorkerScript(workerConstructorStub, () => {
                // We intentionally throw error in global context to see if it is caught by
                // workerLoader.

                (null as any).foo = "aa";
            });

            await assertRejected(
                WorkerLoader.startWorker(testWorkerUrl, 50),
                /Error during worker initialization/i
            );
        });
    });

    describeWithWorker("real Workers integration", function () {
        describe("basic operations", function () {
            it("#startWorker starts worker not swalling first message", async function () {
                const script = `
                    self.postMessage({ hello: 'world' });
                `;
                assert.isDefined(Blob);

                const blob = new Blob([script], { type: "application/javascript" });

                const worker = await WorkerLoader.startWorker(URL.createObjectURL(blob));
                await new Promise<void>((resolve, reject) => {
                    worker.addEventListener("message", event => {
                        assert.isDefined(event.data);
                        assert.equal(event.data.hello, "world");
                        resolve();
                    });
                    worker.addEventListener("error", msg => {
                        reject(new Error("received error event"));
                    });
                });
            });
            it("#startWorker fails on timeout", async function () {
                const script = `
                    // We intentionally throw error in global context to see if it is caught by
                    // workerLoader.
                    //self.postMessage({ hello: 'world' });
                `;
                assert.isDefined(Blob);

                const blob = new Blob([script], { type: "application/javascript" });

                await assertRejected(
                    WorkerLoader.startWorker(URL.createObjectURL(blob), 10),
                    /timeout/i
                );
            });

            it("#startWorker catches error in worker global context", function () {
                const script = `
                    // We intentionally do not send anything, so waitForWorkerInitialized
                    // should raise timeout error.
                    null.foo = "aa";
                `;
                assert.isDefined(Blob);

                const blob = new Blob([script], { type: "application/javascript" });

                const listener = () => {
                    (Mocha as any).process.removeListener("uncaughtException", listener);
                };
                (Mocha as any).process.on("uncaughtException", listener);

                return expect(
                    WorkerLoader.startWorker(URL.createObjectURL(blob))
                ).to.be.rejectedWith(Error);
            });
        });

        describe("loading of cross-origin scripts", function () {
            const cspTestScriptUrl = "https://example.com/foo.js";

            it("#startWorker falls back to blob in case of sync error", async function () {
                // setup an environment in which any attempt to load worker from from non-blob,
                // cross-origin URL which fails, so we check if WorkerLoader will attempt to
                // load using blob: fallback
                //
                // sync version - mimics Chrome, which in case of CSP violation throws error
                // immediately from Worker constructor

                const originalWorkerConstructor = Worker;
                const workerConstructorStub = stubGlobalConstructor(sandbox, "Worker") as any;
                workerConstructorStub.callsFake(function (this: Worker, scriptUrl: string) {
                    if (!scriptUrl.startsWith("blob:")) {
                        throw new Error("content policy violated, ouch");
                    } else {
                        return new originalWorkerConstructor(scriptUrl);
                    }
                });

                const originalFetch = fetch;
                const fetchStub = sandbox.stub(window, "fetch");
                fetchStub.callsFake(async (url: RequestInfo) => {
                    assert.equal(url, cspTestScriptUrl);
                    return await originalFetch(testWorkerUrl);
                });

                await silenceLoggingAroundFunction("WorkerLoader", async () => {
                    const worker = await WorkerLoader.startWorker(cspTestScriptUrl);
                    await new Promise<void>((resolve, reject) => {
                        worker.addEventListener("message", event => {
                            assert.isDefined(event.data);
                            assert.equal(event.data.hello, "world");
                            resolve();
                        });
                        worker.addEventListener("error", msg => {
                            reject(new Error("received error event"));
                        });
                    });

                    assert.isTrue(fetchStub.calledOnce);
                    assert.equal(workerConstructorStub.callCount, 2);
                    assert.equal(workerConstructorStub.firstCall.args[0], cspTestScriptUrl);
                    assert(workerConstructorStub.secondCall.args[0].startsWith, "blob:");
                });
            });

            it("#startWorker falls back to blob in case of async error", async function () {
                // setup an environment in which any attempt to load worker from from non-blob,
                // cross-origin URL which fails, so we check if WorkerLoader will attempt to
                // load using blob: fallback
                //
                // async version - mimics Firefox, which in case of CSP violation signals error
                // asynchronously with 'error' event

                const originalWorkerConstructor = Worker;
                const workerConstructorStub = stubGlobalConstructor(sandbox, "Worker") as any;
                workerConstructorStub.callsFake(function (this: Worker, scriptUrl: string) {
                    const actualWorker = new originalWorkerConstructor(scriptUrl);
                    if (!scriptUrl.startsWith("blob:")) {
                        setTimeout(() => {
                            actualWorker.dispatchEvent(new ErrorEvent("error"));
                        }, 0);
                    }
                    return actualWorker;
                });

                const originalFetch = fetch;
                const fetchStub = sandbox.stub(window, "fetch");
                fetchStub.callsFake(async (url: RequestInfo) => {
                    assert.equal(url, cspTestScriptUrl);
                    return await originalFetch(testWorkerUrl);
                });

                await silenceLoggingAroundFunction("WorkerLoader", async () => {
                    const worker = await WorkerLoader.startWorker(cspTestScriptUrl);

                    await new Promise<void>((resolve, reject) => {
                        worker.addEventListener("message", event => {
                            assert.isDefined(event.data);
                            assert.equal(event.data.hello, "world");
                            resolve();
                        });
                        worker.addEventListener("error", msg => {
                            reject(new Error("received error event"));
                        });
                    });
                    assert.isTrue(fetchStub.calledOnce);
                    assert.equal(workerConstructorStub.callCount, 2);
                    assert.equal(workerConstructorStub.firstCall.args[0], cspTestScriptUrl);
                    assert(workerConstructorStub.secondCall.args[0].startsWith, "blob:");
                });
            });
        });
    });
});
