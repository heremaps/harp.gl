/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from "fs";
import * as mkpath from "mkpath";
import * as path from "path";

// tslint:disable:no-console
// tslint:disable:no-empty

function syncIfNeeded(source: fs.PathLike, target: fs.PathLike) {
    if (!fs.existsSync(source)) {
        console.warn(source, "does not exist, creating dangling link");
    }

    try {
        fs.lstatSync(target);
        return; // no exception means that the symlink exists.
    } catch {}

    fs.symlinkSync(source, target);
}

interface SyncFilesOptions {
    sourceDir: string;
    destDir: string;
    files: string[];
}

function syncFiles({ sourceDir, destDir, files }: SyncFilesOptions) {
    const source = path.resolve(__dirname, sourceDir);
    const dest = path.resolve(__dirname, destDir);

    files.forEach(file => {
        syncIfNeeded(path.resolve(source, file), path.resolve(dest, file));
    });
}

interface SyncDirsOptions {
    sourceDir: string;
    destDir: string;
}

function syncDirs({ sourceDir, destDir }: SyncDirsOptions) {
    mkpath.sync(destDir);
    const source = path.resolve(__dirname, sourceDir);
    const dest = path.resolve(__dirname, destDir);
    const files = fs.readdirSync(source);

    files.forEach(file => {
        const srcFile = path.resolve(source, file);
        const dstFile = path.resolve(dest, file);
        if (fs.lstatSync(srcFile).isDirectory()) {
            syncDirs({ sourceDir: srcFile, destDir: dstFile });
        }
        syncIfNeeded(srcFile, dstFile);
    });
}

function syncDirsIfNeeded({ sourceDir, destDir }: SyncDirsOptions) {
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
            syncDirs({ sourceDir: srcFile, destDir: dstFile });
        }
        syncIfNeeded(srcFile, dstFile);
    });
}

//
// Install fonts
//
syncDirsIfNeeded({
    sourceDir: "../node_modules/@here/harp-font-resources/resources/fonts",
    destDir: "../@here/harp-map-theme/resources/fonts"
});

syncDirsIfNeeded({
    sourceDir: "../@here/harp-text-canvas/node_modules/@here/harp-font-resources/resources/fonts",
    destDir: "../@here/harp-text-canvas/resources/fonts"
});

//
// harp-examples
//
mkpath.sync("dist/harp-examples/dist/resources");

syncIfNeeded(
    path.resolve(__dirname, "../node_modules/three/build/three.min.js"),
    path.resolve(__dirname, "../dist/harp-examples/dist/three.min.js")
);

syncIfNeeded(
    path.resolve(__dirname, "../@here/harp-map-theme/resources/reducedNight.json"),
    path.resolve(__dirname, "../dist/harp-examples/dist/resources/theme.json")
);

syncDirsIfNeeded({
    sourceDir: `../@here/harp-map-theme/resources`,
    destDir: `../dist/harp-examples/dist/resources`
});

syncDirsIfNeeded({
    sourceDir: `../@here/harp-text-canvas/resources`,
    destDir: `../dist/harp-examples/dist/resources/harp-text-canvas`
});

syncDirsIfNeeded({
    sourceDir: `../@here/harp-examples/resources`,
    destDir: `../dist/harp-examples/dist/resources`
});

syncFiles({
    sourceDir: "../@here/harp-examples",
    destDir: "../dist/harp-examples",
    files: ["index.html", "codebrowser.html", "src"]
});

//
// install test data
//
[
    "harp-mapview",
    "harp-test-utils",
    "harp-omv-datasource",
    "harp-map-theme",
    "harp-text-canvas"
].forEach(module => {
    mkpath.sync(`dist/test/${module}/resources`);
    mkpath.sync(`dist/test/${module}/test/resources`);

    syncDirsIfNeeded({
        sourceDir: `../@here/${module}/resources`,
        destDir: `../dist/test/${module}/resources`
    });

    syncDirsIfNeeded({
        sourceDir: `../@here/${module}/test/resources`,
        destDir: `../dist/test/${module}/test/resources`
    });
});
