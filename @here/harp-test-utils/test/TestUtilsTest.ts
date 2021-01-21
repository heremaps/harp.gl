/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";

import { inBrowserContext, inNodeContext, inWebWorkerContext } from "../lib/TestUtils";

describe("@here/harp-test-utils", function () {
    describe("#in(Node,Browser, WebWorker)Context", function () {
        const platformAnswers = {
            inBrowser: inBrowserContext(),
            inWebWorker: inWebWorkerContext(),
            inNode: inNodeContext()
        };
        let oldWindow: any;
        let noRestoreWindow = false;
        let oldProcess: any;

        before(function () {
            oldWindow = (global as any).window;
            oldProcess = (global as any).process;
        });

        function cleanup() {
            if (oldProcess === undefined) {
                delete (global as any).process;
            } else {
                (global as any).process = oldProcess;
            }

            if (!noRestoreWindow) {
                (global as any).window = oldWindow;
            }
        }
        after(function () {
            cleanup();
        });

        it(`are not faked by window & process stubs stub`, async function () {
            try {
                (global as any).window = { foo: "bar" };
            } catch {
                noRestoreWindow = true;
            }
            (global as any).process = { env: { NODE_ENV: "foo" } };
            assert.equal(platformAnswers.inBrowser, inBrowserContext());
            assert.equal(platformAnswers.inNode, inNodeContext());
            assert.equal(platformAnswers.inWebWorker, inWebWorkerContext());

            cleanup();
        });
    });
});
