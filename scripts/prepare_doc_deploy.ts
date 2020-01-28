/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { copySync, ensureDirSync, removeSync } from "fs-extra";

// tslint:disable-next-line:no-var-requires
const fetch = require("node-fetch");

//This script prepares the documentation to be deployed by Travis to S3 and
//gh-pages.
// Precondition: documentation ready on /dist folder
// including docs and examples (e.g. after yarn run build && yarn run typedoc)

const branch = process.env.TRAVIS_BRANCH;
const commitHash = execSync("git rev-parse --short HEAD")
    .toString()
    .trimRight();
const folderName = branch !== "master" ? commitHash : "master";

// create the following directory structure
// dist
// ├──s3_deploy (to be deployed to s3)
// │   ├── [ master | {githash} ] (folder with docs and examples)
// ├──gh_deploy (to be deployed to gh-pages)
// │   ├── index.html (and assets for minisite)
// │   ├── releases.json (list all releases in order)

const targetFolderGh = `dist/gh_deploy`;
const targetFolderS3 = `dist/s3_deploy/${folderName}`;

removeSync(targetFolderGh);
ensureDirSync(targetFolderGh);
copySync("www/dist/", `${targetFolderGh}/`);

removeSync(targetFolderS3);
ensureDirSync(targetFolderS3);
copySync("dist/doc/", `${targetFolderS3}/doc`);
copySync("dist/doc-snippets/", `${targetFolderS3}/doc-snippets/`);
copySync("dist/examples/", `${targetFolderS3}/examples/`);

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

if (branch !== "master") {
    const now = new Date();
    const dateString = `${now.getDate()}-${now.getMonth()}-${now.getFullYear()}`;
    // tslint:disable-next-line: no-implicit-dependencies no-var-requires
    const mapviewPackage = require("@here/harp-mapview/package.json");
    const newRelease: Release = {
        date: dateString,
        hash: commitHash,
        version: mapviewPackage.version
    };

    fetch("https://heremaps.github.io/harp.gl/releases.json")
        .then((res: Response) => {
            return res.json();
        })
        .then((releases: Release[]) => {
            const newReleases = [newRelease, ...releases];
            writeFileSync(
                `${targetFolderGh}/releases.json`,
                JSON.stringify(newReleases, undefined, 2)
            );
        });
}
