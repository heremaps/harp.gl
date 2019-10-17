/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { ensureDirSync, moveSync } from "fs-extra";

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

ensureDirSync("dist/gh_deploy");
moveSync("dist/index.html", "dist/gh_deploy/index.html");
moveSync("dist/css", "dist/gh_deploy/css");
moveSync("dist/resources", "dist/gh_deploy/resources");
moveSync("dist/js", "dist/gh_deploy/js");
moveSync("dist/redirect_examples", "dist/gh_deploy/examples");
moveSync("dist/redirect_docs", "dist/gh_deploy/docs");

moveSync("dist/_config.yml", "dist/gh_deploy/_config.yml");

ensureDirSync(`dist/s3_deploy/${folderName}`);
moveSync("dist/doc", `dist/s3_deploy/${folderName}/doc`);
moveSync("dist/doc-snippets", `dist/s3_deploy/${folderName}/doc-snippets`);
moveSync("dist/examples", `dist/s3_deploy/${folderName}/examples`);

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
                "dist/gh_deploy/releases.json",
                JSON.stringify(newReleases, undefined, 2)
            );
        });
}
