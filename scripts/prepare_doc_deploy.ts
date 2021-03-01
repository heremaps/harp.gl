/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from "child_process";
import { copySync, ensureDirSync, removeSync } from "fs-extra";

//This script prepares the documentation and harp.gl website to be deployed
// by Travis to S3
// Precondition: documentation ready on /dist folder
// including docs and examples (e.g. after yarn run build && yarn run typedoc)

const branch = process.env.TRAVIS_BRANCH;
const commitHash = execSync("git rev-parse --short HEAD").toString().trimRight();
const refName = branch !== "master" ? commitHash : "master";

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
