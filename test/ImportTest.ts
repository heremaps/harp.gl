/*
 * Copyright (C) 2018-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { assert } from "chai";
import * as fs from "fs";
import * as glob from "glob";
import * as path from "path";

// these dependencies are ok to include in files using node.js
const nodeDependencyWhitelist: { [moduleName: string]: boolean } = {
    http: true,
    https: true,
    util: true,
    url: true,
    fs: true,
    path: true
};

function checkImports() {
    // first, read all package.json files and remember the dependencies
    const packageDependencies: { [moduleName: string]: any } = {};
    const packageConfigs: { [moduleName: string]: any } = {};
    const packageJsonFiles = [...glob.sync(__dirname + "/../@here/*/package.json")];

    for (const packageJsonFile of packageJsonFiles) {
        const moduleName = "@here/" + packageJsonFile.split(path.sep).slice(-2, -1)[0];
        packageConfigs[moduleName] = JSON.parse(fs.readFileSync(packageJsonFile, "utf-8"));
    }

    // recursively gets all direct and indirect dependencies
    function getDependencies(moduleName: string, deps: any) {
        if (deps[moduleName]) {
            return;
        }
        deps[moduleName] = true;

        const config = packageConfigs[moduleName];
        if (config) {
            for (const dep in config.dependencies) {
                getDependencies(dep, deps);
            }
            for (const dep in config.peerDependencies) {
                getDependencies(dep, deps);
            }
        }
    }

    for (const moduleName in packageConfigs) {
        const config = packageConfigs[moduleName];

        const dependencies = {};
        for (const dep in config.dependencies) {
            getDependencies(dep, dependencies);
        }
        for (const dep in config.devDependencies) {
            getDependencies(dep, dependencies);
        }
        for (const dep in config.peerDependencies) {
            getDependencies(dep, dependencies);
        }

        packageDependencies[moduleName] = dependencies;
    }

    // now, iterate all typescript source files
    const sourceFiles = glob
        .sync(__dirname + "/../@here/**/*.ts")
        .filter(
            sourcePath =>
                !sourcePath.includes("node_modules") && !sourcePath.includes("generator-harp.gl")
        );

    // regular expression catching all imported modules
    const importRE = /(.*)?import\s*{[\s\S]*?}\s*from\s+["'](.*)["']/gi;
    const environmentRE = /@here:check-imports:environment:(.*)/gi;

    const errors = new Array<string>();

    for (const sourceFile of sourceFiles) {
        const contents = fs.readFileSync(sourceFile, "utf-8");
        let env = "browser";
        const relativePath = path.relative(__dirname + "/../@here", sourceFile);
        const moduleName = "@here/" + relativePath.split(path.sep)[0];
        const modulePath = path.resolve(__dirname + "/../", moduleName);

        const environmentMatch = environmentRE.exec(contents);
        if (environmentMatch) {
            env = environmentMatch[1];
            if (env !== "browser" && env !== "node") {
                errors.push(
                    `Error: ${relativePath} unknown '@here:environment:' type: ${env}. Supported types: 'node', 'browser'`
                );
                env = "browser";
            }
        }

        // iterate through all matched imported modules
        let matches;
        while ((matches = importRE.exec(contents)) != null) {
            const beginningOfLine = matches[1] || "";

            // If the line is a comment, ignore it
            if (
                beginningOfLine.includes("//") ||
                beginningOfLine.includes("/*") ||
                beginningOfLine.includes("*")
            ) {
                continue;
            }

            const importedModule = matches[2];

            // 1) Make sure we don't self-import
            if (importedModule === moduleName) {
                errors.push(
                    `Error: ${relativePath} contains wrong module import "${importedModule}", change it to a relative import`
                );
            }

            // 2) Make sure we don't include unknown dependencies
            const localModule = importedModule.startsWith(".");
            const allowedNodeModule = env === "node" && nodeDependencyWhitelist[importedModule];

            if (!localModule && !allowedNodeModule) {
                const importedModuleName = importedModule.startsWith("@")
                    ? importedModule.split("/").slice(0, 2).join("/")
                    : importedModule.split("/")[0];

                if (
                    packageDependencies[moduleName] !== undefined &&
                    packageDependencies[moduleName][importedModuleName] === undefined
                ) {
                    errors.push(
                        `Error: unknown module ${importedModuleName} used in ${moduleName}: ` +
                            `${relativePath}`
                    );
                }
            }

            // 3) Make sure we don't include other @here modules via relative paths
            if (importedModule.startsWith("..")) {
                const resolvedImportedModule = path.resolve(
                    path.dirname(sourceFile),
                    importedModule
                );

                if (!path.dirname(resolvedImportedModule).startsWith(modulePath)) {
                    errors.push(
                        `Error: the module ${importedModule} is imported via a relative path in ${sourceFile}`
                    );
                }
            }
        }
    }

    // 4) Look for circular dependencies (Tarjan's SCC algorithm)

    function detectCircularDependencies() {
        let index = 0;
        const stack = new Array<any>();
        const modules = new Map<string, any>();

        for (const moduleName in packageConfigs) {
            const dependencies = Object.keys(packageDependencies[moduleName]).filter(
                dependencyName =>
                    dependencyName.startsWith("@here/") && dependencyName !== moduleName
            );

            const module = {
                name: moduleName,
                index: undefined,
                lowLink: undefined,
                onStack: false,
                dependencies
            };
            modules.set(moduleName, module);
        }

        modules.forEach(function (module) {
            if (module.index === undefined) {
                strongConnect(module);
            }
        });

        function strongConnect(module: any) {
            module.index = index;
            module.lowLink = index;
            index++;
            stack.push(module);
            module.onStack = true;

            for (let i = 0; i < module.dependencies.length; i++) {
                const successorName = module.dependencies[i];

                const successor = modules.get(successorName);

                if (successor === undefined) {
                    continue;
                }

                if (successor.index === undefined) {
                    strongConnect(successor);
                    module.lowLink = Math.min(module.lowLink, successor.lowLink);
                } else if (stack.includes(successor)) {
                    module.lowLink = Math.min(module.lowLink, successor.index);
                }
            }

            if (module.lowLink === module.index) {
                // module is a root node
                let circularDependency = false;
                let errorMessage = `Loop detected: ${module.name}`;
                let dependency = stack.pop();
                while (dependency !== undefined && dependency.name !== module.name) {
                    module.onStack = false;
                    errorMessage += ` -> ${dependency.name}`;
                    dependency = stack.pop();
                    circularDependency = true;
                }

                if (circularDependency) {
                    errorMessage += ` -> ${module.name}`;
                    errors.push(errorMessage);
                }
            }
        }
    }

    detectCircularDependencies();

    return errors;
}

describe("ImportCheck", function () {
    it("Uses correct imports", function () {
        const errors = checkImports();
        assert.deepEqual(errors, []);
    });
});
