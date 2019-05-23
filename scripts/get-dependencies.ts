/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * get-dependencies.ts
 *
 * Emits all names of dependent packages of given project.
 *
 * Example
 *
 *     $ npx ts-node ./scripts/get-dependencies.ts @here/harp-mapview/package.json
 *     @here/harp-datasource-protocol
 *     @here/harp-geoutils
 *     ...
 */

import * as path from "path";

// tslint:disable:forin

function getDeepDependencies(startPackage: string) {
    // first, read all package.json files and remember the dependencies
    const packageDependencies: { [moduleName: string]: boolean } = {};
    const packageConfigs: { [moduleName: string]: any } = {};
    const packageJsonFiles = [path.resolve(process.cwd(), startPackage)];

    for (const packageJsonFile of packageJsonFiles) {
        const packageJsonContent = require(packageJsonFile);
        const moduleName = packageJsonContent.name;
        packageConfigs[moduleName] = packageJsonContent;
    }

    // recursively gets all direct and indirect dependencies
    function getDependencies(moduleName: string) {
        if (packageDependencies[moduleName]) {
            return;
        }
        packageDependencies[moduleName] = true;

        let config = packageConfigs[moduleName];
        if (!config) {
            config = require(moduleName + "/package.json");
            packageConfigs[moduleName] = config;
        }
        if (config) {
            for (const dep in config.dependencies) {
                getDependencies(dep);
            }
        }
    }

    for (const moduleName in packageConfigs) {
        const config = packageConfigs[moduleName];

        for (const dep in config.dependencies) {
            getDependencies(dep);
        }
    }

    return Object.keys(packageDependencies);
}

process.stdout.write(getDeepDependencies(process.argv[2]).join("\n") + "\n");
