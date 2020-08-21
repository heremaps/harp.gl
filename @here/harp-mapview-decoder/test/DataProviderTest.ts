/*
 * Copyright (C) 2020 HERE Europe B.V.
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

describe("DataProvider", function() {
    const clients = [{}, {}];

    it("calls connect only on first registered client", function() {
        const dataProvider = new FakeDataProvider();
        const connectSpy = sinon.spy(dataProvider, "connect");

        dataProvider.register(clients[0]);
        expect(connectSpy.calledOnce).is.true;

        dataProvider.register(clients[0]);
        dataProvider.register(clients[1]);
        expect(connectSpy.calledOnce).is.true;
    });

    it("calls dispose only on last unregistered client", function() {
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
});
