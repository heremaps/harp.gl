/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

const ncp = require("ncp");
const fs = require("fs");
const path = require("path");

function asyncCopyfiles(source, destination) {
    return new Promise((resolve, reject) => {
        ncp(source, destination, err => {
            if (err) {
                reject(err);
            }
            resolve();
        });
    });
}

function getModuleDir() {
    const tscRealPath = require.resolve("typescript");
    return path.resolve(path.dirname(tscRealPath), "../..");
}

const moduleDir = getModuleDir();

async function copyResources() {
    if (!fs.existsSync("dist")) fs.mkdirSync("dist");

    await asyncCopyfiles(moduleDir + "/@here/harp-map-theme/resources", "dist/resources");
    await asyncCopyfiles("resources", "dist/resources");

    fs.copyFileSync(moduleDir + "/three/build/three.min.js", "dist/three.min.js");

    fs.copyFileSync(
        moduleDir + "/@here/harp-map-theme/resources/reducedNight.json",
        "dist/resources/theme.json"
    );

    fs.copyFileSync(
        moduleDir + "/@here/harp-map-theme/resources/reducedDay.json",
        "dist/resources/reducedDay.json"
    );

    fs.copyFileSync(moduleDir + "/@here/harp-map-theme/resources/day.json", "dist/resources/day.json");
}

copyResources().catch(err => {
    console.log("Error", err);
    process.exit(1);
});
