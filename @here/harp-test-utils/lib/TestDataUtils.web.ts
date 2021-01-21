/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// @here:check-imports:environment:node

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
    return testResourcesRoot + module + "/" + fileName;
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
 * @param fileName -: the requested resource
 *                  (e.g. @here/harp-vectortile-datasource/test/resources/berlin.bin)
 */
export const loadTestResource = loadTestResourceWeb;

/** @hidden */
export function loadTestResourceWeb(
    module: string,
    fileName: string,
    type: "arraybuffer"
): Promise<ArrayBuffer>;

/** @hidden */
export function loadTestResourceWeb(
    module: string,
    fileName: string,
    type: "text"
): Promise<string>;

/** @hidden */
export function loadTestResourceWeb(module: string, fileName: string, type: "json"): Promise<any>;

/** @hidden */
export function loadTestResourceWeb(
    module: string,
    fileName: string,
    type: "arraybuffer" | "text" | "json"
): Promise<any> {
    const url = getTestResourceUrl(module, fileName);

    return fetch(url).then(response => {
        if (!response.ok) {
            throw new Error(`failed to load ${url}: ${response.status} ${response.statusText}`);
        }
        switch (type) {
            case "arraybuffer":
                return response.arrayBuffer();
            case "json":
                return response.json();
            case "text":
                return response.text();
            default:
                throw new Error(`Unrecognized response type: ${type}`);
        }
    });
}
