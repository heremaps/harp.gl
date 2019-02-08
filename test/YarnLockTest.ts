/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from "fs";
import * as path from "path";

import { assert } from "chai";

// tslint:disable:only-arrow-functions

describe("YarnLockFile", function() {
    it("Contains only public paths", function() {
        const yarnLock = fs.readFileSync(path.join(__dirname, "..", "yarn.lock"));
        assert.isFalse(yarnLock.includes("in.here.com"));
    });
});
