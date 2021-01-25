/*
 * Copyright (C) 2018-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

describe("YarnLockFile", function () {
    it("Contains only public paths", function () {
        const yarnLock = fs.readFileSync(path.join(__dirname, "..", "yarn.lock"));
        assert.isFalse(yarnLock.includes("in.here.com"));
    });
});
