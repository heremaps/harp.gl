/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";
import * as sinon from "sinon";

import { ILogger, LogLevel } from "../lib/Logger/ILogger";
import { Logger } from "../lib/Logger/Logger";

describe("Logger", function () {
    const sandbox = sinon.createSandbox();

    function printAll(logger: ILogger, msg: string) {
        logger.error(msg);
        logger.warn(msg);
        logger.info(msg);
        logger.log(msg);
        logger.debug(msg);
        logger.trace(msg);
    }

    afterEach(function () {
        sandbox.restore();
    });

    describe("Apply log level", function () {
        afterEach(function () {
            sandbox.restore();
        });

        it("check defaults", function () {
            // Arrange
            const logger = new Logger("foo", console);

            // Assert
            assert.isTrue(logger.enabled);
            assert.equal(logger.level, LogLevel.Trace);
        });

        it("error should be written to output", function () {
            // Arrange
            const stubs = sandbox.stub(console);

            const logger = new Logger("foo", console, { enabled: true });
            logger.level = LogLevel.Error;

            // Act
            printAll(logger, "some message");

            // Assert
            assert.isTrue(stubs.error.calledOnce);
            assert.isFalse(stubs.warn.called);
            assert.isFalse(stubs.info.called);
            assert.isFalse(stubs.log.called);
            assert.isFalse(stubs.debug.called);
            assert.isFalse(stubs.trace.called);
        });

        it("warning and error should be written to output ", function () {
            // Arrange
            const stubs = sandbox.stub(console);

            const logger = new Logger("foo", console, { enabled: true });
            logger.level = LogLevel.Warn;

            // Act
            printAll(logger, "some message");

            // Assert
            assert.isTrue(stubs.error.calledOnce);
            assert.isTrue(stubs.warn.calledOnce);
            assert.isFalse(stubs.info.called);
            assert.isFalse(stubs.log.called);
            assert.isFalse(stubs.debug.called);
            assert.isFalse(stubs.trace.called);
        });

        it("info, warning, error should be written to output", function () {
            // Arrange
            const stubs = sandbox.stub(console);

            const logger = new Logger("foo", console, { enabled: true });
            logger.level = LogLevel.Info;

            // Act
            printAll(logger, "some message");

            // Assert
            assert.isTrue(stubs.error.calledOnce);
            assert.isTrue(stubs.warn.calledOnce);
            assert.isTrue(stubs.info.calledOnce);
            assert.isFalse(stubs.log.called);
            assert.isFalse(stubs.debug.called);
            assert.isFalse(stubs.trace.called);
        });

        it("log, info, warning and error should be written", function () {
            // Arrange
            const stubs = sandbox.stub(console);

            const logger = new Logger("foo", console, { enabled: true });
            logger.level = LogLevel.Log;

            // Act
            printAll(logger, "some message");

            // Assert
            assert.isTrue(stubs.error.calledOnce);
            assert.isTrue(stubs.warn.calledOnce);
            assert.isTrue(stubs.info.calledOnce);
            assert.isTrue(stubs.log.calledOnce);
            assert.isFalse(stubs.debug.called);
            assert.isFalse(stubs.trace.called);
        });

        it("debug, log, info, warning and error should be written", function () {
            // Arrange
            const stubs = sandbox.stub(console);

            const logger = new Logger("foo", console, { enabled: true });
            logger.level = LogLevel.Debug;

            // Act
            printAll(logger, "some message");

            // Assert
            assert.isTrue(stubs.error.calledOnce);
            assert.isTrue(stubs.warn.calledOnce);
            assert.isTrue(stubs.info.calledOnce);
            assert.isTrue(stubs.log.calledOnce);
            assert.isTrue(stubs.debug.calledOnce);
            assert.isFalse(stubs.trace.called);
        });

        it("trace, debug, log, info, warning and error should be written", function () {
            // Arrange
            const stubs = sandbox.stub(console);

            const logger = new Logger("foo", console, { enabled: true });
            logger.level = LogLevel.Trace;

            // Act
            printAll(logger, "some message");

            // Assert
            assert.isTrue(stubs.error.calledOnce);
            assert.isTrue(stubs.warn.calledOnce);
            assert.isTrue(stubs.info.calledOnce);
            assert.isTrue(stubs.log.calledOnce);
            assert.isTrue(stubs.debug.calledOnce);
            assert.isTrue(stubs.trace.calledOnce);
        });
    });

    describe("Enable / disable", function () {
        afterEach(function () {
            sandbox.restore();
        });

        it("Enable all outputs", function () {
            // Arrange
            const stubs = sandbox.stub(console);

            const logger = new Logger("foo", console, { enabled: true });
            logger.enabled = true;

            // Act
            printAll(logger, "some message");

            // Assert
            assert.isTrue(stubs.error.calledOnce);
            assert.isTrue(stubs.warn.calledOnce);
            assert.isTrue(stubs.info.calledOnce);
            assert.isTrue(stubs.log.calledOnce);
            assert.isTrue(stubs.debug.calledOnce);
            assert.isTrue(stubs.trace.calledOnce);
        });

        it("Disable all outputs", function () {
            // Arrange
            const stubs = sandbox.stub(console);

            const logger = new Logger("foo", console, { enabled: true });
            logger.enabled = false;

            // Act
            printAll(logger, "some message");

            // Assert
            assert.isFalse(stubs.error.called);
            assert.isFalse(stubs.warn.called);
            assert.isFalse(stubs.info.called);
            assert.isFalse(stubs.log.called);
            assert.isFalse(stubs.debug.called);
            assert.isFalse(stubs.trace.called);
        });
    });
    it("Name is written to output", function () {
        // Arrange
        const stubs = sandbox.stub(console);
        const logger = new Logger("foo", console, { enabled: true, level: LogLevel.Trace });

        // Act
        printAll(logger, "some message");

        // Assert
        assert.isTrue(stubs.error.calledWithMatch("foo:", "some message"));
        assert.isTrue(stubs.warn.calledWithMatch("foo:", "some message"));
        assert.isTrue(stubs.info.calledWithMatch("foo:", "some message"));
        assert.isTrue(stubs.log.calledWithMatch("foo:", "some message"));
        assert.isTrue(stubs.debug.calledWithMatch("foo:", "some message"));
        assert.isTrue(stubs.trace.calledWithMatch("foo:", "some message"));
    });
});
