/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

import { ncp } from "ncp";
import * as path from "path";

function onCopyError(err: Error[] | null) {
    if (err === null) {
        return;
    }

    console.error("Unable to copy files:", err);
    process.exitCode = 1;
}

const fontDir = path.dirname(require.resolve("@here/harp-fontcatalog/package.json"));

ncp(path.join(fontDir, "resources"), path.join(__dirname, "..", "resources", "fonts"), onCopyError);
