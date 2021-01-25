/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";
import * as sinon from "sinon";

import { LogLevel } from "../lib/Logger/ILogger";
import { LoggerManager } from "../lib/Logger/LoggerManager";
import {
    IWorkerChannelMessage,
    WorkerChannel,
    WORKERCHANNEL_MSG_TYPE
} from "../lib/Logger/WorkerChannel";

declare const global: any;

describe("WorkerChannel", function () {
    beforeEach(function () {
        if (typeof self === "undefined") {
            global.self = {
                postMessage() {
                    // stubbed implementation
                }
            };
        }
    });

    afterEach(function () {
        if (Object.keys(self).length === 1) {
            delete global.self;
        }
    });

    it("The WorkerChannel post messages with the format of IWorkerChannelMessage.", function () {
        const message1 = "My message : ";
        const message2 = "is original.";
        const loggerName = "myLogger";

        const expectedMessage: IWorkerChannelMessage = {
            message: [`${loggerName}:`, message1, message2],
            type: WORKERCHANNEL_MSG_TYPE,
            level: LogLevel.Log
        };

        const stubbedPost = sinon.stub(self, "postMessage") as any;

        LoggerManager.instance.setChannel(new WorkerChannel());
        const logger = LoggerManager.instance.create(loggerName);
        logger.log(message1, message2);

        assert.equal(stubbedPost.callCount, 1);
        assert.isTrue(stubbedPost.alwaysCalledWithExactly(expectedMessage));
    });
});
