/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { copySync, ensureDirSync, removeSync } from "fs-extra";
import { glob } from "glob";
import { gt } from "semver";

const fetch = require("node-fetch");

//This script prepares the documentation and harp.gl website to be deployed to S3
// Precondition: documentation ready on /dist folder
// including docs and examples (e.g. after yarn run build && yarn run typedoc)

// See: https://docs.github.com/en/actions/reference/environment-variables
const branch = process.env.GITHUB_REF;
const commitHash = execSync("git rev-parse --short HEAD").toString().trimRight();
// We store releases using the short commit hash
const isReleaseBranch = branch?.includes("release");
const refName = isReleaseBranch ? commitHash : "master";

// create the following directory structure
// dist
// ├──s3_deploy (to be deployed to s3)
// │   ├── [ master | {githash} ] (folder with docs and examples)
// │   ├── index.html (and assets for minisite)
// │   ├── releases.json (list all releases in order)

const targetFolder = `dist/s3_deploy/`;

removeSync(targetFolder);
ensureDirSync(targetFolder);
copySync("www/dist/", `${targetFolder}/`);
copySync("dist/doc/", `${targetFolder}/docs/${refName}/doc`);
copySync("dist/doc-snippets/", `${targetFolder}/docs/${refName}/doc-snippets/`);
copySync("dist/examples/", `${targetFolder}/docs/${refName}/examples/`);

// create (or update) the releases.json file containing a json object
// listing all releases with the following format
// [
//   {
//    "date": "{timestamp}",
//    "hash": "{githash}"
//    "version": "{currentVersion}"
//   }
// ]
// ordered so that the most recent is always the first one
// note: master is not included

interface Release {
    date: string;
    hash: string;
    version: string;
}

if (isReleaseBranch) {
    const now = new Date();
    // WARNING, dates are 0 indexed, hence +1
    const dateString = `${now.getDate()}-${now.getMonth() + 1}-${now.getFullYear()}`;
    const allPackages = glob.sync("@here/*/package.json");
    const newRelease: Release = {
        date: dateString,
        hash: commitHash,
        version: ""
    };
    for (const testPackage of allPackages) {
        const mapviewPackage = require(testPackage);
        if (newRelease.version === "" || gt(mapviewPackage.version, newRelease.version)) {
            newRelease.version = mapviewPackage.version;
        }
    }

    fetch("https://www.harp.gl/releases.json")
        .then((res: Response) => {
            return res.json();
        })
        .then((releases: Release[]) => {
            const newReleases = [newRelease, ...releases];
            writeFileSync(
                `${targetFolder}/releases.json`,
                JSON.stringify(newReleases, undefined, 2)
            );
        });
}
