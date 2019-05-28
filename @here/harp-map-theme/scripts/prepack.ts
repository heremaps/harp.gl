/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { ncp } from "ncp";
import * as path from "path";

// tslint:disable:no-console

function onCopyError(err: Error) {
    if (err === null) {
        return;
    }

    console.error("Unable to copy files:", err);
    process.exitCode = 1;
}

const fontDir = path.dirname(require.resolve("@here/harp-fontcatalog/package.json"));

ncp(path.join(fontDir, "resources"), path.join(__dirname, "..", "resources", "fonts"), onCopyError);
