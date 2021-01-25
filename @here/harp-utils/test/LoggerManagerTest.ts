/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";
import * as sinon from "sinon";

import { ConsoleChannel } from "../lib/Logger/ConsoleChannel";
import { ILogger, LogLevel } from "../lib/Logger/ILogger";
import { ILoggerManager } from "../lib/Logger/ILoggerManager";
import { LoggerManager } from "../lib/Logger/LoggerManager";
import { LoggerManagerImpl } from "../lib/Logger/LoggerManagerImpl";
import { MultiChannel } from "../lib/Logger/MultiChannel";

describe("LoggerManager", function () {
    function printAll(logger: ILogger, msg: string) {
        logger.error(msg);
        logger.warn(msg);
        logger.info(msg);
        logger.log(msg);
        logger.debug(msg);
        logger.trace(msg);
    }

    it("Update All", function () {
        // Arrange
        const manager = new LoggerManagerImpl();
        const loggerA = manager.create("A");
        const loggerB = manager.create("B");

        // Act
        manager.updateAll({ enabled: false, level: LogLevel.Error });

        // Assert
        assert.equal(loggerA.enabled, false);
        assert.equal(loggerB.enabled, false);
        assert.equal(loggerA.level, LogLevel.Error);
        assert.equal(loggerB.level, LogLevel.Error);
    });

    it("Update named loggers", function () {
        // Arrange
        const manager = new LoggerManagerImpl();
        const loggerA = manager.create("A");
        const loggerB = manager.create("B");

        // Act
        manager.update("A", { enabled: false, level: LogLevel.Error });

        // Assert
        assert.equal(loggerA.enabled, false);
        assert.equal(loggerB.enabled, true);
        assert.equal(loggerA.level, LogLevel.Error);
        assert.equal(loggerB.level, LogLevel.Trace);
    });

    it("Override defaults", function () {
        // Arrange
        const manager = new LoggerManagerImpl();

        // Act
        const loggerA = manager.create("A", { enabled: false, level: LogLevel.Warn });
        const loggerB = manager.create("B");

        // Assert
        assert.equal(loggerA.enabled, false);
        assert.equal(loggerB.enabled, true);
        assert.equal(loggerA.level, LogLevel.Warn);
        assert.equal(loggerB.level, LogLevel.Trace);
    });

    it("Dispose logger", function () {
        // Arrange
        const manager = new LoggerManagerImpl();
        const loggerA = manager.create("A");
        const loggerB = manager.create("B");

        // Act
        manager.dispose(loggerA);
        manager.updateAll({ enabled: false, level: LogLevel.Error });

        // Assert
        assert.equal(loggerA.enabled, true);
        assert.equal(loggerB.enabled, false);
        assert.equal(loggerA.level, LogLevel.Trace);
        assert.equal(loggerB.level, LogLevel.Error);
    });

    it("Create LoggerManager instance", function () {
        // Arrange
        const manager = LoggerManager.instance;

        // Assert
        assert.exists(manager);
    });

    it("Check default console channel", function () {
        const manager = LoggerManager.instance;
        assert.equal(manager.channel instanceof ConsoleChannel, true);
    });

    it("Replace default console channel", function () {
        const manager = LoggerManager.instance;
        const multiChannel = new MultiChannel();
        LoggerManager.instance.setChannel(multiChannel);

        assert.equal(manager.channel instanceof ConsoleChannel, false);
    });

    describe("Check channel compliancy", function () {
        const sandbox = sinon.createSandbox();
        let loggerManager: ILoggerManager;

        beforeEach(() => {
            loggerManager = new LoggerManagerImpl();
        });

        afterEach(() => {
            sandbox.restore();
        });

        it("Check channels logging abilities", function () {
            // Arrange
            const consoleChannel = loggerManager.channel;
            const stubs = sandbox.stub(consoleChannel);
            const logger = loggerManager.create("foo", { level: LogLevel.Trace });

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

        it("Check channels logging abilities after switching channels", function () {
            // Arrange
            const oldChannel = loggerManager.channel;
            const oldChannelStub = sandbox.stub(oldChannel);

            const newChannel = new ConsoleChannel();
            const newChannelStub = sandbox.stub(newChannel);

            loggerManager.setChannel(newChannel);

            const logger = loggerManager.create("foo", { level: LogLevel.Trace });

            // Act
            printAll(logger, "some message");

            // Assert
            assert.isFalse(oldChannelStub.error.called);
            assert.isFalse(oldChannelStub.warn.called);
            assert.isFalse(oldChannelStub.info.called);
            assert.isFalse(oldChannelStub.log.called);
            assert.isFalse(oldChannelStub.debug.called);
            assert.isFalse(oldChannelStub.trace.called);
            assert.isTrue(newChannelStub.error.calledWithMatch("foo:", "some message"));
            assert.isTrue(newChannelStub.warn.calledWithMatch("foo:", "some message"));
            assert.isTrue(newChannelStub.info.calledWithMatch("foo:", "some message"));
            assert.isTrue(newChannelStub.log.calledWithMatch("foo:", "some message"));
            assert.isTrue(newChannelStub.debug.calledWithMatch("foo:", "some message"));
            assert.isTrue(newChannelStub.trace.calledWithMatch("foo:", "some message"));
        });

        it("Check MultiChannel logging abilities", function () {
            // Arrange
            const channel1 = new ConsoleChannel();
            const channel2 = new ConsoleChannel();
            const multiChannel = new MultiChannel(channel1, channel2);

            const channel1Stub = sandbox.stub(channel1);
            const channel2Stub = sandbox.stub(channel2);

            loggerManager.setChannel(multiChannel);

            const logger = loggerManager.create("foo", { level: LogLevel.Trace });

            // Act
            printAll(logger, "some message");

            // Assert
            assert.isTrue(channel1Stub.error.calledWithMatch("foo:", "some message"));
            assert.isTrue(channel1Stub.warn.calledWithMatch("foo:", "some message"));
            assert.isTrue(channel1Stub.info.calledWithMatch("foo:", "some message"));
            assert.isTrue(channel1Stub.log.calledWithMatch("foo:", "some message"));
            assert.isTrue(channel1Stub.debug.calledWithMatch("foo:", "some message"));
            assert.isTrue(channel1Stub.trace.calledWithMatch("foo:", "some message"));
            assert.isTrue(channel2Stub.error.calledWithMatch("foo:", "some message"));
            assert.isTrue(channel2Stub.warn.calledWithMatch("foo:", "some message"));
            assert.isTrue(channel2Stub.info.calledWithMatch("foo:", "some message"));
            assert.isTrue(channel2Stub.log.calledWithMatch("foo:", "some message"));
            assert.isTrue(channel2Stub.debug.calledWithMatch("foo:", "some message"));
            assert.isTrue(channel2Stub.trace.calledWithMatch("foo:", "some message"));
        });
    });
});
