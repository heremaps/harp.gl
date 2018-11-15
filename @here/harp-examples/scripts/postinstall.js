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

function resolveExternalPackagePath(id, moduleFilePath) {
    const packaJsonPath = require.resolve(`${id}/package.json`);
    return path.resolve(path.dirname(packaJsonPath), moduleFilePath);
}

async function copyResources() {
    if (!fs.existsSync("dist")) fs.mkdirSync("dist");

    await asyncCopyfiles(resolveExternalPackagePath("@here/harp-map-theme", "resources"), "dist/resources");
    await asyncCopyfiles("resources", "dist/resources");

    fs.copyFileSync(resolveExternalPackagePath("three", "build/three.min.js"), "dist/three.min.js");

    fs.copyFileSync(
        resolveExternalPackagePath("@here/harp-map-theme", "resources/reducedNight.json"),
        "dist/resources/theme.json"
    );
}

copyResources().catch(err => {
    console.log("Error", err);
    process.exit(1);
});
