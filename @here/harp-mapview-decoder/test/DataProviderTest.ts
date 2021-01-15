/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { expect } from "chai";
import * as sinon from "sinon";

import { DataProvider } from "../index";

class FakeDataProvider extends DataProvider {
    /** @override */ async connect() {
        // empty implementation
    }

    ready(): boolean {
        return true;
    }

    async getTile(): Promise<ArrayBufferLike | {}> {
        return await Promise.resolve({});
    }

    /** @override */ dispose() {
        // Nothing to be done here.
    }
}

class TimedFakeDataProvider extends FakeDataProvider {
    /** @override */ async connect(): Promise<void> {
        const promise = new Promise<void>(resolve => {
            setTimeout(() => {
                resolve();
            }, 100);
        });
        return promise;
    }
}

describe("DataProvider", function () {
    const clients = [{}, {}];

    it("calls connect only on first registered client", function () {
        const dataProvider = new FakeDataProvider();
        const connectSpy = sinon.spy(dataProvider, "connect");

        dataProvider.register(clients[0]);
        expect(connectSpy.calledOnce).is.true;

        dataProvider.register(clients[0]);
        dataProvider.register(clients[1]);
        expect(connectSpy.calledOnce).is.true;
    });

    it("calls dispose only on last unregistered client", function () {
        const dataProvider = new FakeDataProvider();
        const disposeSpy = sinon.spy(dataProvider, "dispose");

        dataProvider.register(clients[0]);
        dataProvider.register(clients[1]);

        dataProvider.unregister(clients[0]);
        dataProvider.unregister(clients[0]);
        expect(disposeSpy.called).is.false;

        dataProvider.unregister(clients[1]);
        expect(disposeSpy.calledOnce).is.true;
        dataProvider.unregister(clients[1]);
        expect(disposeSpy.calledOnce).is.true;
    });

    it("calls connect only on first registered client", async function () {
        const dataProvider = new TimedFakeDataProvider();
        const connectSpy = sinon.spy(dataProvider, "connect");

        await dataProvider.register(clients[0]);
        expect(connectSpy.calledOnce).is.true;

        await dataProvider.register(clients[0]);
        await dataProvider.register(clients[1]);
        expect(connectSpy.calledOnce).is.true;
    });

    it("calls connect again after unregister", async function () {
        const dataProvider = new TimedFakeDataProvider();
        const connectSpy = sinon.spy(dataProvider, "connect");

        dataProvider.register(clients[0]);
        expect(connectSpy.calledOnce).is.true;

        dataProvider.unregister(clients[0]);
        expect(connectSpy.calledOnce).is.true;

        dataProvider.register(clients[0]);
        expect(connectSpy.calledTwice).is.true;
    });

    it("calls connect after one provider call unregister", async function () {
        const dataProvider = new TimedFakeDataProvider();

        const promise0 = dataProvider.register(clients[0]);
        const promise1 = dataProvider.register(clients[1]);
        dataProvider.unregister(clients[0]);

        let promise0Resolved = false;
        await promise0.then(() => {
            promise0Resolved = true;
        });

        let promise1Resolved = false;
        await promise1.then(() => {
            promise1Resolved = true;
        });

        expect(promise0Resolved, "unregistered provider resolve not called").to.be.true;
        expect(promise1Resolved, "registered provider resolve not called after an unregister").to.be
            .true;
    });

    it("subsequent register operations wait for connect", async function () {
        const dataProvider = new TimedFakeDataProvider();
        const connectSpy = sinon.spy(dataProvider, "connect");

        const promise0 = dataProvider.register(clients[0]);
        const promise1 = dataProvider.register(clients[1]);

        let promise0Resolved = false;

        const _promise2 = promise0.then(() => {
            promise0Resolved = true;
        });

        expect(promise0Resolved, "promise resolved immediately").to.be.false;

        // Assert that when promise1 is resolved, promise0 is also resolved.
        await promise1;

        // Assert that at this stage, promise0Resolved is true. State of promise2 can be ignored
        // here.
        expect(promise0Resolved, "subsequent promises resolve before the first").to.be.true;
        expect(connectSpy.calledOnce).is.true;
    });
});
