/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
chai.use(chaiAsPromised);
const { expect } = chai;

import { DeferredPromise } from "../src/DeferredPromise";

function delay(timeout: number) {
    return new Promise(resolve => {
        setTimeout(resolve, timeout);
    });
}

describe("DeferredPromise", function () {
    it("does not settle Promise unless exec() was called.", async function () {
        let isSettled = false;
        const deferred = new DeferredPromise(() => {
            isSettled = true;
            return Promise.resolve();
        });

        // Delay execution
        await delay(1);

        expect(deferred.promise).to.not.be.undefined;
        expect(isSettled).to.be.false;
    });

    it("settles a Promise when exec() is called.", async function () {
        let isSettled = false;
        const deferred = new DeferredPromise(() => {
            isSettled = true;
            return Promise.resolve();
        });

        deferred.exec();
        await expect(deferred.promise).to.eventually.be.fulfilled;

        expect(isSettled).to.be.true;
    });

    it("handles a rejected Promise.", async function () {
        let isSettled = false;
        const deferred = new DeferredPromise(() => {
            isSettled = true;
            return Promise.reject("Some error happened.");
        });

        deferred.exec();
        await expect(deferred.promise).to.eventually.be.rejectedWith("Some error happened.");

        expect(isSettled).to.be.true;
    });
});
