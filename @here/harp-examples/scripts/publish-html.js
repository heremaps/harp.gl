/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

const ncp = require("ncp");
const path = require("path");
const fs = require("fs");
const util = require("util");

const asyncCopyFiles = util.promisify(ncp);

const destination = process.argv[2];
if (destination === undefined) {
    console.log("Usage:", process.argv[1], "[destination]");
    process.exit(1);
}

async function run() {
    try {
        fs.mkdirSync(destination);
    } catch {
    }

    [ "index.html", "codebrowser.html", "files.js", "config.ts" ]
        .map(file => fs.copyFileSync(file, path.join(destination, file)));

    await asyncCopyFiles("dist", path.join(destination, "dist"));
    await asyncCopyFiles("src", path.join(destination, "src"));
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
