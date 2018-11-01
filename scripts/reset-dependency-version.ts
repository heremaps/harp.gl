/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import fs = require("fs");
import glob = require("glob");
import path = require("path");

// tslint:disable:no-console

function writePackageJson(fileName: string, contents: any) {
    fs.writeFileSync(fileName, JSON.stringify(contents, null, 2) + "\n");
}

function usage() {
    console.log(`Usage: ${process.argv[1]} [package name] [new semver]`);
    console.log("Changes a dependency or devDependency to a new semantic version.");
    console.log();
    console.log(`Example: ${process.argv[1]} three ^0.87.0`);
}

const newPackage = process.argv[2];
if (newPackage === undefined) {
    usage();
    process.exit(1);
}

const newPackageVersion = process.argv[3];
if (newPackageVersion === undefined) {
    usage();
    process.exit(1);
}

const packageFiles = glob.sync(__dirname + "/../@here/*/package.json");
packageFiles.push(__dirname + "/../package.json");

/* Bump all dependencies */

function bump(dependencies: any[], packageFile: string) {
    for (const dep in dependencies) {
        if (dep !== newPackage) {
            continue;
        }
        if (newPackageVersion === "-") {
            delete dependencies[dep];
            console.log(`Removed ${newPackage} from ${path.relative(process.cwd(), packageFile)}`);
        } else if (dependencies[dep] !== newPackageVersion) {
            dependencies[dep] = newPackageVersion;
            console.log(`Updated ${newPackage} in ${path.relative(process.cwd(), packageFile)}`);
        }
    }
}

for (const packageFile of packageFiles) {
    // tslint:disable-next-line:no-var-requires
    const pkg = require(packageFile);

    bump(pkg.dependencies, packageFile);
    bump(pkg.devDependencies, packageFile);
    bump(pkg.peerDependencies, packageFile);

    writePackageJson(packageFile, pkg);
}
