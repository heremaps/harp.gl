/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    RequestController,
    WorkerDecoderProtocol,
    WorkerServiceProtocol
} from "@here/harp-datasource-protocol";
import { assertRejected, stubGlobalConstructor, willEventually } from "@here/harp-test-utils";
import { Logger, LogLevel, WorkerChannel, WORKERCHANNEL_MSG_TYPE } from "@here/harp-utils";
import { assert } from "chai";
import * as sinon from "sinon";

import { ConcurrentWorkerSet, isLoggingMessage } from "../lib/ConcurrentWorkerSet";
import { FakeWebWorker, willExecuteWorkerScript } from "./FakeWebWorker";

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

declare const global: any;

const isInitializedMessage: WorkerServiceProtocol.InitializedMessage = {
    service: "service-id",
    type: WorkerServiceProtocol.ServiceMessageName.Initialized
};

const sampleMessage: WorkerServiceProtocol.ServiceMessage = {
    type: WorkerServiceProtocol.ServiceMessageName.Request,
    service: "service-id"
};

const sampleRequest: WorkerDecoderProtocol.DecodeTileRequest = {
    type: WorkerDecoderProtocol.Requests.DecodeTileRequest,
    tileKey: 10,
    data: new ArrayBuffer(0),
    projection: "bar"
};

describe("ConcurrentWorkerSet", function () {
    let sandbox: sinon.SinonSandbox;
    beforeEach(function () {
        sandbox = sinon.createSandbox();
        if (typeof window === "undefined") {
            // fake Worker constructor for node environment
            global.Worker = FakeWebWorker;
        }
    });

    afterEach(function () {
        if (typeof window === "undefined") {
            delete global.Worker;
        }
        sandbox.restore();
    });

    it("The constructor creates a defined set of workers.", async function () {
        // Arrange
        const workerConstructorStub = stubGlobalConstructor(sandbox, "Worker");

        willExecuteWorkerScript(workerConstructorStub, self => {
            self.postMessage(isInitializedMessage);
        });

        const victim = new ConcurrentWorkerSet({
            scriptUrl: "./foo.js",
            workerCount: 3
        });

        // Act
        await victim.connect("service-id");

        // Assert
        assert.equal(workerConstructorStub.callCount, 3);
        assert.isAtLeast(workerConstructorStub.prototype.addEventListener.callCount, 3);
        assert(workerConstructorStub.alwaysCalledWith("./foo.js"));
    });

    it("#connect throws if any of workers fail in initialization context.", async function () {
        // Arrange
        const workerConstructorStub = stubGlobalConstructor(sandbox, "Worker");

        let count = 0;
        willExecuteWorkerScript(workerConstructorStub, self => {
            if (count++ === 1) {
                throw new Error("fooBar");
            }
            self.postMessage(isInitializedMessage);
        });

        const victim = new ConcurrentWorkerSet({ scriptUrl: "./foo.js", workerCount: 4 });

        await assertRejected(
            victim.connect("service-id"),
            /Error during worker initialization: .*fooBar/
        );
    });

    it("#connect throws if any of Worker fail directly.", async function () {
        // Arrange
        const workerConstructorStub = stubGlobalConstructor(sandbox, "Worker");

        workerConstructorStub.callsFake(() => {
            throw new Error("failed to load script: someError");
        });

        const victim = new ConcurrentWorkerSet({ scriptUrl: "./foo.js" });

        await assertRejected(victim.connect("service-id"), /failed to load script: someError/);
    });

    it("#connect throws if any of will not send any message.", async function () {
        // Arrange
        const workerConstructorStub = stubGlobalConstructor(sandbox, "Worker");

        workerConstructorStub.callsFake(() => {
            // no message!
        });

        const victim = new ConcurrentWorkerSet({
            scriptUrl: "./foo.js",
            workerConnectionTimeout: 5
        });

        await assertRejected(victim.connect("service-id"), /timeout/i);
    });

    it("#add/removeReference: terminates workers when reference counts == 0", async function () {
        const workerConstructorStub = stubGlobalConstructor(sandbox, "Worker");

        willExecuteWorkerScript(workerConstructorStub, self => {
            self.postMessage(isInitializedMessage);
        });

        const victim = new ConcurrentWorkerSet({
            scriptUrl: "./foo.js",
            workerCount: 3
        });
        assert.equal(workerConstructorStub.callCount, 3);
        assert.equal(workerConstructorStub.prototype.terminate.callCount, 0);
        victim.addReference();
        assert.equal(workerConstructorStub.prototype.terminate.callCount, 0);
        victim.addReference();

        victim.removeReference();
        assert.equal(workerConstructorStub.prototype.terminate.callCount, 0);
        victim.removeReference();

        await willEventually(() => {
            assert.equal(workerConstructorStub.prototype.terminate.callCount, 3);
        });
    });

    it("#stop terminates all workers", async function () {
        // Arrange
        const workerConstructorStub = stubGlobalConstructor(sandbox, "Worker");
        willExecuteWorkerScript(workerConstructorStub, self => {
            self.postMessage(isInitializedMessage);
        });

        const victim = new ConcurrentWorkerSet({
            scriptUrl: "./bar.js",
            workerCount: 5
        });

        assert.equal(workerConstructorStub.callCount, 5);
        assert(workerConstructorStub.alwaysCalledWith("./bar.js"));

        await victim.stop();

        // Assert
        assert.throws(() => {
            victim.invokeRequest("foo-service", sampleRequest);
        });

        assert.throws(() => {
            victim.broadcastMessage(sampleMessage);
        });

        assert.throws(() => {
            victim.invokeRequest("service-id", sampleRequest);
        });

        await willEventually(() => {
            // check that workers were really terminated
            assert.equal(workerConstructorStub.prototype.terminate.callCount, 5);
        });

        // and postMessage was not called
        assert.equal(workerConstructorStub.prototype.postMessage.callCount, 0);
    });

    it("#destroy immediately terminates all workers", async function () {
        // Arrange
        const workerConstructorStub = stubGlobalConstructor(sandbox, "Worker");
        willExecuteWorkerScript(workerConstructorStub, self => {
            self.postMessage(isInitializedMessage);
        });
        const victim = new ConcurrentWorkerSet({
            scriptUrl: "./bar.js",
            workerCount: 7
        });

        assert.equal(workerConstructorStub.callCount, 7);
        assert(workerConstructorStub.alwaysCalledWith("./bar.js"));

        victim.destroy();

        // Assert

        await willEventually(() => {
            // check that workers were really terminated
            assert.equal(workerConstructorStub.prototype.terminate.callCount, 7);
        });

        assert.throws(() => {
            victim.invokeRequest("foo-service", sampleRequest);
        });

        assert.throws(() => {
            victim.broadcastMessage(sampleMessage);
        });

        assert.throws(() => {
            victim.invokeRequest("service-id", sampleRequest);
        });
        // and postMessage was not called
        assert.equal(workerConstructorStub.prototype.postMessage.callCount, 0);
    });

    it("#invokeRequest sends message to one random worker", async function () {
        // Arrange
        const workerConstructorStub = stubGlobalConstructor(sandbox, "Worker");
        willExecuteWorkerScript(workerConstructorStub, self => {
            self.postMessage(isInitializedMessage);
        });

        // Act
        const victim = new ConcurrentWorkerSet({
            scriptUrl: "./foo.js",
            workerCount: 3
        });

        await victim.connect(isInitializedMessage.service);
        victim.invokeRequest("foo-service", sampleRequest);

        // Assert
        await willEventually(() => {
            assert.equal(workerConstructorStub.prototype.postMessage.callCount, 1);
            assert.deepInclude(workerConstructorStub.prototype.postMessage.args[0][0], {
                type: WorkerServiceProtocol.ServiceMessageName.Request,
                messageId: 0,
                request: sampleRequest
            });
        });
    });

    it("#broadcastMessage sends message to all workers", async function () {
        // Arrange
        const workerConstructorStub = stubGlobalConstructor(sandbox, "Worker");
        willExecuteWorkerScript(workerConstructorStub, self => {
            self.postMessage(isInitializedMessage);
        });

        // Act
        const victim = new ConcurrentWorkerSet({
            scriptUrl: "./foo.js",
            workerCount: 3
        });
        await victim.connect(isInitializedMessage.service);

        victim.broadcastMessage(sampleMessage);

        // Assert
        await willEventually(() => {
            assert.equal(workerConstructorStub.prototype.postMessage.callCount, 3);
            assert(workerConstructorStub.prototype.postMessage.alwaysCalledWith(sampleMessage));
        });
    });

    it("#invokeRequest basic scenario", async function () {
        // Arrange
        const workerConstructorStub = stubGlobalConstructor(sandbox, "Worker");

        willExecuteWorkerScript(workerConstructorStub, self => {
            self.postMessage(isInitializedMessage);

            self.onmessage = (event: any) => {
                const message = event.data;
                assert.equal(message.type, "request");
                assert.equal(message.service, "service-id");
                assert.isDefined(message.messageId);
                assert.isDefined(message.request);

                const responseMessage: WorkerServiceProtocol.ResponseMessage = {
                    type: WorkerServiceProtocol.ServiceMessageName.Response,
                    service: message.service,
                    messageId: message.messageId,
                    response: {
                        // DecodedTile
                        foo: "bar",
                        geometries: [],
                        techniques: []
                    }
                };

                self.postMessage(responseMessage);
            };
        });

        const victim = new ConcurrentWorkerSet({
            scriptUrl: "./foo.js",
            workerCount: 3
        });

        await victim.connect(isInitializedMessage.service);

        //
        // Act
        //
        const promises: Array<Promise<any>> = [];
        for (let i = 0; i < 10; i++) {
            const request: WorkerDecoderProtocol.DecodeTileRequest = {
                type: WorkerDecoderProtocol.Requests.DecodeTileRequest,
                tileKey: i,
                data: new ArrayBuffer(0),
                projection: "bar"
            };
            const p = victim.invokeRequest("service-id", request);
            promises.push(p);
        }

        const responses = await Promise.all(promises);
        // Assert
        assert.equal(responses.length, 10);
        responses.forEach(response => {
            assert.equal(response.foo, "bar");
            assert.deepEqual(response.geometries, []);
            assert.deepEqual(response.techniques, []);
        });

        assert.equal(workerConstructorStub.prototype.postMessage.callCount, 10);
    });

    it("#invokeRequest error scenario", async function () {
        // Arrange
        const workerConstructorStub = stubGlobalConstructor(sandbox, "Worker");

        willExecuteWorkerScript(workerConstructorStub, self => {
            self.postMessage(isInitializedMessage);

            self.onmessage = (event: any) => {
                const message = event.data;
                const responseMessage: WorkerServiceProtocol.ResponseMessage = {
                    type: WorkerServiceProtocol.ServiceMessageName.Response,
                    service: message.service,
                    messageId: message.messageId,
                    errorMessage: "some error"
                };
                self.postMessage(responseMessage);
            };
        });

        const victim = new ConcurrentWorkerSet({
            scriptUrl: "./foo.js",
            workerCount: 3
        });
        await victim.connect(isInitializedMessage.service);

        //
        // Act
        //

        const promises: Array<Promise<any>> = [];
        for (let i = 0; i < 10; i++) {
            const p = victim.invokeRequest("service-id", sampleRequest);
            promises.push(p);
        }

        const responses = await Promise.all(
            promises.map(p => {
                return p
                    .then(() => {
                        assert(false, "this path shouldn't be reached");
                    })
                    .catch(error => {
                        assert.equal(error.message, "some error");
                    });
            })
        );

        // Assert
        assert.equal(responses.length, 10);

        assert.equal(workerConstructorStub.prototype.postMessage.callCount, 10);
    });

    it("properly drains queue with many aborts", async function () {
        // Arrange
        const workerConstructorStub = stubGlobalConstructor(sandbox, "Worker");

        // This worker will reply to all `ConcurrentWorkerSet.invokeRequest` by echoing
        // request as response.
        willExecuteWorkerScript(workerConstructorStub, self => {
            self.postMessage(isInitializedMessage);

            self.onmessage = (messageEvent: MessageEvent) => {
                const message = messageEvent.data;
                assert.isTrue(WorkerServiceProtocol.isRequestMessage(message));

                const request = message as WorkerServiceProtocol.RequestMessage;
                setTimeout(() => {
                    const response: WorkerServiceProtocol.ResponseMessage = {
                        service: request.service,
                        type: WorkerServiceProtocol.ServiceMessageName.Response,
                        messageId: request.messageId,
                        response: request.request
                    };
                    self.postMessage(response);
                }, 1);
            };
        });

        // Act
        const victim = new ConcurrentWorkerSet({
            scriptUrl: "./foo.js",
            workerCount: 10
        });

        const N = 100;
        await victim.connect(isInitializedMessage.service);
        const promises: Array<Promise<void>> = [];
        let responses = 0;
        for (let i = 0; i < N; i++) {
            const rq = new RequestController();
            const p = victim
                .invokeRequest("echo-service", sampleRequest, undefined, rq)
                .then(() => {
                    responses += 1;
                })
                .catch(() => {
                    responses += 1;
                    return;
                });
            promises.push(p as any);
            if (i % 2 === 1) {
                rq.abort();
            }
        }
        await Promise.all(promises);

        // Assert
        assert.equal(responses, N);
    });

    describe("log forwarding", function () {
        it("The worker set recognizes the logging message.", function () {
            assert.isTrue(
                isLoggingMessage({
                    message: [`myLogger:`, "foo", "bar"],
                    type: WORKERCHANNEL_MSG_TYPE,
                    level: LogLevel.Log
                })
            );
        });

        it("The messages from the workers are logged.", async function () {
            const workerConstructorStub = stubGlobalConstructor(sandbox, "Worker");

            willExecuteWorkerScript(workerConstructorStub, self => {
                // prepare worker
                const workerChannel = new WorkerChannel();

                // execute worker
                self.postMessage(isInitializedMessage);

                setTimeout(() => {
                    workerChannel.log("test-message-from-worker");
                }, 2);
            });

            let expectedMessagesCount = 0;
            const loggerLogStub = sandbox.stub(Logger.prototype, "log");
            loggerLogStub.callsFake((msg: any) => {
                if (msg === "test-message-from-worker") {
                    expectedMessagesCount++;
                }
            });

            new ConcurrentWorkerSet({
                scriptUrl: "foot.js",
                workerCount: 200
            });

            await willEventually(() => {
                assert.equal(expectedMessagesCount, 200);
            });
        });
    });
});
