/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// @here:check-imports:environment:node

import * as fs from "fs";
import * as path from "path";

declare const TEST_RESOURCES_DIR: string | undefined;

/**
 * Base path from which test resources are loaded.

 * @hidden
 */
export const testResourcesRoot =
    typeof TEST_RESOURCES_DIR === "undefined" ? "" : TEST_RESOURCES_DIR;

/**
 * Get URL of test resource.
 *
 * Calculates URL of test resource in same way as [[loadTestResource]].
 *
 * @param moduleName -: module name, `@here/<module_name>` (e.g. @here/harp-vectortile-datasource)
 * @param fileName -: file relative to module path (e.g. `test/resources/berlin.bin)`
 */
export function getTestResourceUrl(module: string, fileName: string) {
    const modulePath = path.dirname(require.resolve(module + "/package.json"));
    const resultPath = path.join(testResourcesRoot, modulePath, fileName);
    if (resultPath.includes("\\")) {
        // node-fetch on windows, needs proper URL
        return "file://" + resultPath.replace(/\\/g, "/");
    } else {
        // node-fetch on unix is ok with just a absolute file path
        return resultPath;
    }
}

/**
 * Function which runs a cross-environment resource loader which gets the static resources
 * requested. (e.g. needed for tests purposes).
 *
 * The following folders are mapped in test environment for resources that are needed for testing
 * purposes:
 *  * `@here/${module}/test/resources`
 *  * `@here/${module}/resources`
 *
 * The `fileName` must be relative to package root.
 *
 * Exemplary methods invocation:
 * ```
 * const binaryData = await loadTestResourceWeb('test-utils', 'test/resources/test.bin', 'binary');
 *
 * const textData = await  loadTestResourceWeb('test-utils', 'test/resources/test.txt', 'text');
 *
 * const theme = await loadTestResource('map-theme', 'resources/berlin_tilezen_base.json', 'json');
 * ```
 *
 * These locations above are mapped in the same way regardless of the runtime environment used
 * (node.js or browser).
 *
 * Internally this function loads resources in an environment-agnostic way, using the following:
 *
 *   * `fs` module when run in a node.js environment
 *   * `fetch` module when run in a browser environment
 *
 * @param module -: module name, @here/<module_name> (e.g. @here/harp-vectortile-datasource)
 * @param fileName -: the requested resource,
 *                  (e.g. @here/harp-vectortile-datasource/test/resources/berlin.bin)
 */
export const loadTestResource = loadTestResourceNode;

/** @hidden */
export function loadTestResourceNode(
    module: string,
    fileName: string,
    type: "arraybuffer"
): Promise<ArrayBuffer>;

/** @hidden */
export function loadTestResourceNode(
    module: string,
    fileName: string,
    type: "text"
): Promise<string>;

/** @hidden */
export function loadTestResourceNode(module: string, fileName: string, type: "json"): Promise<any>;

/** @hidden */
export function loadTestResourceNode(
    module: string,
    fileName: string,
    type: "arraybuffer" | "text" | "json"
): Promise<any> {
    const modulePath = path.dirname(require.resolve(module + "/package.json"));
    const filePath = path.join(modulePath, fileName);

    return new Promise((resolve, reject) => {
        const encoding = type === "arraybuffer" ? null : "utf-8";
        return fs.readFile(filePath, { encoding }, (err, data) => {
            if (err) {
                reject(err);
                return;
            }
            switch (type) {
                case "arraybuffer":
                    resolve(new Uint8Array(data as Buffer).buffer);
                    break;
                case "json":
                    resolve(JSON.parse(data as string));
                    break;
                case "text":
                    resolve(data as string);
                    break;
                default:
                    throw new Error(`Unrecognized response type: ${type}`);
            }
        });
    });
}
