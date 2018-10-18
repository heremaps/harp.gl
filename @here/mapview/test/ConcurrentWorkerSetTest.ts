/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { assert } from "chai";
import * as sinon from "sinon";

import { Logger, LogLevel, WorkerChannel, WORKERCHANNEL_MSG_TYPE } from "@here/utils";
import { ConcurrentWorkerSet, isLoggingMessage } from "../lib/ConcurrentWorkerSet";

import {
    DecodedTileMessageName,
    DecodeTileRequest,
    InitializedMessage,
    Requests,
    ResponseMessage
} from "@here/datasource-protocol";
import { stubGlobalConstructor, willEventually } from "@here/test-utils";
import { FakeWebWorker, willExecuteWorkerScript } from "./FakeWebWorker";

declare const global: any;

const isInitializedMessage: InitializedMessage = {
    service: "service-id",
    type: DecodedTileMessageName.Initialized
};

const sampleMessage = {
    type: DecodedTileMessageName.Configuration,
    service: "service-id"
};

const sampleRequest: DecodeTileRequest = {
    type: Requests.DecodeTileRequest,
    tileKey: 10,
    data: new ArrayBuffer(0),
    projection: "bar"
};

describe("ConcurrentWorkerSet", () => {
    let sandbox: sinon.SinonSandbox;
    beforeEach(() => {
        sandbox = sinon.createSandbox();
        if (typeof window === "undefined") {
            // fake Worker constructor for node environment
            global.Worker = FakeWebWorker;
        }
    });

    afterEach(() => {
        if (typeof window === "undefined") {
            delete global.Worker;
        }
        sandbox.restore();
    });

    it("The constructor creates a defined set of workers.", async () => {
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

    it("#add/removeReference: terminates workers when reference counts reaches 0", async () => {
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

    it("#stop terminates all workers", async () => {
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
            victim.postMessage(sampleMessage);
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

    it("#destroy immediately terminates all workers", async () => {
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
            victim.postMessage(sampleMessage);
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

    it("#postMessage sends message to one random worker", async () => {
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
        victim.postMessage(sampleMessage);

        // Assert
        await willEventually(() => {
            assert.equal(workerConstructorStub.prototype.postMessage.callCount, 1);
            assert(workerConstructorStub.prototype.postMessage.alwaysCalledWith(sampleMessage));
        });
    });

    it("#broadcastMessage sends message to all workers", async () => {
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

    it("#invokeRequest basic scenario", async () => {
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

                const responseMessage: ResponseMessage = {
                    type: DecodedTileMessageName.Response,
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
            const request: DecodeTileRequest = {
                type: Requests.DecodeTileRequest,
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

    it("#invokeRequest error scenario", async () => {
        // Arrange
        const workerConstructorStub = stubGlobalConstructor(sandbox, "Worker");

        willExecuteWorkerScript(workerConstructorStub, self => {
            self.postMessage(isInitializedMessage);

            self.onmessage = (event: any) => {
                const message = event.data;
                const responseMessage: ResponseMessage = {
                    type: DecodedTileMessageName.Response,
                    service: message.service,
                    messageId: message.messageId,
                    error: "some error" as any
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

    describe("log forwarding", () => {
        it("The worker set recognizes the logging message.", () => {
            assert.isTrue(
                isLoggingMessage({
                    message: [`myLogger:`, "foo", "bar"],
                    type: WORKERCHANNEL_MSG_TYPE,
                    level: LogLevel.Log
                })
            );
        });

        it("The messages from the workers are logged.", async () => {
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

            // tslint:disable-next-line:no-unused-expression
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
