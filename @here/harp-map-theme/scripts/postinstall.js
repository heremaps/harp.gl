/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

const fs = require("fs");
const mkpath = require("mkpath");
const path = require("path");

// tslint:disable:no-console
// tslint:disable:no-empty

function syncIfNeeded(source, target) {
    if (!fs.existsSync(source)) {
        console.warn(source, "does not exist, creating dangling link");
    }

    try {
        fs.lstatSync(target);
        return; // no exception means that the symlink exists.
    } catch (error) {}

    fs.symlinkSync(source, target);
}

function syncDirs({
    sourceDir,
    destDir
}) {
    mkpath.sync(destDir);
    const source = path.resolve(__dirname, sourceDir);
    const dest = path.resolve(__dirname, destDir);
    const files = fs.readdirSync(source);

    files.forEach(file => {
        const srcFile = path.resolve(source, file);
        const dstFile = path.resolve(dest, file);
        if (fs.lstatSync(srcFile).isDirectory()) {
            syncDirs({
                sourceDir: srcFile,
                destDir: dstFile
            });
        }
        syncIfNeeded(srcFile, dstFile);
    });
}

function syncDirsIfNeeded({
    sourceDir,
    destDir
}) {
    const source = path.resolve(__dirname, sourceDir);
    const dest = path.resolve(__dirname, destDir);
    mkpath.sync(dest);

    if (!fs.existsSync(source)) {
        return;
    }

    const files = fs.readdirSync(source);

    files.forEach(file => {
        const srcFile = path.resolve(source, file);
        const dstFile = path.resolve(dest, file);
        if (fs.lstatSync(srcFile).isDirectory()) {
            syncDirs({
                sourceDir: srcFile,
                destDir: dstFile
            });
        }
        syncIfNeeded(srcFile, dstFile);
    });
}

function resolveExternalPackagePath(id, moduleFilePath) {
    const packaJsonPath = require.resolve(`${id}/package.json`);
    return path.resolve(path.dirname(packaJsonPath), moduleFilePath);
}

//
// Link fonts
//
syncDirsIfNeeded({
    sourceDir: resolveExternalPackagePath("@here/harp-font-resources", "resources/fonts"),
    destDir: "../resources/fonts"
});
