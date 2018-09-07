/*
 * Copyright (C) 2017-2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

import { assert } from "chai";
import * as sinon from "sinon";
import { LogLevel } from "../lib/Logger/ILogger";
import { LoggerManager } from "../lib/Logger/LoggerManager";
import {
    IWorkerChannelMessage,
    WorkerChannel,
    WORKERCHANNEL_MSG_TYPE
} from "../lib/Logger/WorkerChannel";

describe("WorkerChannel", () => {
    beforeEach(() => {
        if (typeof self === "undefined") {
            (global as any).self = {
                postMessage() {
                    // stubbed implementation
                }
            };
        }
    });

    afterEach(() => {
        if (Object.keys(self).length === 1) {
            delete (global as any).self;
        }
    });

    it("The WorkerChannel post messages with the exact format of IWorkerChannelMessage.", () => {
        const message1 = "My message : ";
        const message2 = "is original.";
        const loggerName = "myLogger";

        const expectedMessage: IWorkerChannelMessage = {
            message: [`${loggerName}:`, message1, message2],
            type: WORKERCHANNEL_MSG_TYPE,
            level: LogLevel.Log
        };

        const stubbedPost = sinon.stub(self, "postMessage");

        LoggerManager.instance.setChannel(new WorkerChannel());
        const logger = LoggerManager.instance.create(loggerName);
        logger.log(message1, message2);

        assert.equal(stubbedPost.callCount, 1);
        assert.isTrue(stubbedPost.alwaysCalledWithExactly(expectedMessage));
    });
});
