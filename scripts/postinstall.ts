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
    } catch {
    }

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

function syncDirsIfNeeded({ sourceDir, destDir }: SyncDirsOptions) {
    const source = path.resolve(__dirname, sourceDir);
    const dest = path.resolve(__dirname, destDir);

    if (!fs.existsSync(source)) {
        return;
    }

    const files = fs.readdirSync(source);

    files.forEach(file => {
        syncIfNeeded(path.resolve(source, file), path.resolve(dest, file));
    });
}

//
// harp-examples
//
mkpath.sync("dist/harp-examples/dist/resources");

syncIfNeeded(
    path.resolve(__dirname, "../node_modules/three/build/three.min.js"),
    path.resolve(__dirname, "../dist/harp-examples/dist/three.min.js")
);

syncIfNeeded(
    path.resolve(__dirname, "../@here/map-theme/resources/reducedNight.json"),
    path.resolve(__dirname, "../dist/harp-examples/dist/resources/theme.json")
);

syncDirsIfNeeded({
    sourceDir: `../@here/map-theme/resources`,
    destDir: `../dist/harp-examples/dist/resources`
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
["mapview", "test-utils", "omv-datasource", "map-theme"].forEach(module => {
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
