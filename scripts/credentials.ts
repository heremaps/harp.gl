/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

import * as fs from "fs";

import { apikey } from "../@here/harp-examples/config";

function usage() {
    console.log(`Usage: ${process.argv[1]} targetDir`);
    console.log("Generate credentials.js in the specified directory.");
}

const targetDir = process.argv[2];
if (targetDir === undefined) {
    usage();
    process.exit(1);
}

const credentialsResult = `const apikey = '${apikey}'`;
fs.mkdirSync(targetDir, { recursive: true });
fs.writeFileSync(`${targetDir}/credentials.js`, credentialsResult, { encoding: "utf8" });
