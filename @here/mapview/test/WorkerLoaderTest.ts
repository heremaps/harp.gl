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
import * as sinon from "sinon";

import { getTestResourceUrl, stubGlobalConstructor } from "@here/test-utils";

import { WorkerLoader } from "../lib/workers/WorkerLoader";
import { FakeWebWorker, willExecuteWorkerScript } from "./FakeWebWorker";

const workerDefined = typeof Worker !== "undefined" && typeof Blob !== "undefined";
const describeWithWorker = workerDefined ? describe : xdescribe;

describe("WorkerLoader", () => {

    let sandbox: sinon.SinonSandbox;
    beforeEach(() => {
        sandbox = sinon.sandbox.create();
        if (typeof window === "undefined") {
            // fake Worker constructor for node environment
            (global as any).Worker = FakeWebWorker;
        }
    });

    afterEach(() => {
        sandbox.restore();
        if (typeof window === "undefined") {
            delete (global as any).Worker;
        }

        WorkerLoader.directlyFallbackToBlobBasedLoading = false;
    });

    const testWorkerUrl = getTestResourceUrl("mapview", "test/resources/testWorker.js");

    it("WorkerLoader falls back to blob / sync", async () => {
        // setup an environment in which any attempt to load worker from from non-blob URL
        // fails, so we check if WorkerLoader does it's job
        //
        // sync version - mimics Chrome, which in case of CSP violation throws error
        // immediately from Worker constructor

        const workerConstructorStub = stubGlobalConstructor(sandbox, "Worker");
        willExecuteWorkerScript(workerConstructorStub, (self) => {
            self.postMessage({hello: 'world'});
        });

        const worker = await WorkerLoader.startWorker(testWorkerUrl);
        await new Promise((resolve, reject) => {
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

    describeWithWorker("real Workers integration", () => {

        it("WorkerLoader falls back to blob / sync", async () => {
            // setup an environment in which any attempt to load worker from from non-blob URL
            // fails, so we check if WorkerLoader does it's job
            //
            // sync version - mimics Chrome, which in case of CSP violation throws error
            // immediately from Worker constructor

            const originalWorkerConstructor = Worker;
            const workerConstructorStub = stubGlobalConstructor(sandbox, "Worker");
            workerConstructorStub.callsFake(function(this: Worker, scriptUrl: string) {
                if (!scriptUrl.startsWith("blob:")) {
                    throw new Error("content policy violated, ouch");
                } else {
                    return new originalWorkerConstructor(scriptUrl);
                }
            });

            const worker = await WorkerLoader.startWorker(testWorkerUrl);
            await new Promise((resolve, reject) => {
                worker.addEventListener("message", event => {
                    assert.isDefined(event.data);
                    assert.equal(event.data.hello, "world");
                    resolve();
                });
                worker.addEventListener("error", msg => {
                    reject(new Error("received error event"));
                });
            });

            assert.equal(workerConstructorStub.callCount, 2);
            assert.equal(workerConstructorStub.firstCall.args[0], testWorkerUrl);
            assert(workerConstructorStub.secondCall.args[0].startsWith, "blob:");
        });

        it("WorkerLoader falls back to blob / async", async () => {
            // setup an environment in which any attempt to load worker from from non-blob URL
            // fails, so we check if WorkerLoader does it's job
            //
            // async version - mimics Firefox, which in case of CSP violation signals error
            // asynchronously with 'error' event

            const originalWorkerConstructor = Worker;
            const workerConstructorStub = stubGlobalConstructor(sandbox, "Worker");
            workerConstructorStub.callsFake(function(this: Worker, scriptUrl: string) {
                const actualWorker = new originalWorkerConstructor(scriptUrl);
                if (!scriptUrl.startsWith("blob:")) {
                    setImmediate(() => {
                        actualWorker.dispatchEvent(new ErrorEvent("error"));
                    });
                }
                return actualWorker;
            });
            const worker = await WorkerLoader.startWorker(testWorkerUrl);

            await new Promise((resolve, reject) => {
                worker.addEventListener("message", event => {
                    assert.isDefined(event.data);
                    assert.equal(event.data.hello, "world");
                    resolve();
                });
                worker.addEventListener("error", msg => {
                    reject(new Error("received error event"));
                });
            });
            assert.equal(workerConstructorStub.callCount, 2);
            assert.equal(workerConstructorStub.firstCall.args[0], testWorkerUrl);
            assert(workerConstructorStub.secondCall.args[0].startsWith, "blob:");
        });

        it("browser is able to load worker from blob", done => {
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

        it("browser is able to load worker from URL", done => {
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
});
