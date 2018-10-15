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

describe("WorkerChannel", () => {
    beforeEach(() => {
        if (typeof self === "undefined") {
            global.self = {
                postMessage() {
                    // stubbed implementation
                }
            };
        }
    });

    afterEach(() => {
        if (Object.keys(self).length === 1) {
            delete global.self;
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
