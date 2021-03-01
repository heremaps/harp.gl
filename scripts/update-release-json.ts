/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { glob } from "glob";
import { gt } from "semver";

const fetch = require("node-fetch");

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

const commitHash = execSync("git rev-parse --short HEAD").toString().trimRight();
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

const targetFolder = `dist/s3_deploy/`;
fetch("https://www.harp.gl/releases.json")
    .then((res: Response) => {
        return res.json();
    })
    .then((releases: Release[]) => {
        const newReleases = [newRelease, ...releases];
        writeFileSync(`${targetFolder}/releases.json`, JSON.stringify(newReleases, undefined, 2));
    });
