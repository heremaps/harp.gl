/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

import * as path from "path";
import { ncp } from "ncp";

function onCopyError(err: Error[] | null) {
    if (err === null) {
        return;
    }

    console.error("Unable to copy files:", err);
    process.exitCode = 1;
}

const fontDir = path.dirname(require.resolve("@here/harp-fontcatalog/package.json"));

ncp(path.join(fontDir, "resources"), path.join(__dirname, "..", "resources", "fonts"), onCopyError);
