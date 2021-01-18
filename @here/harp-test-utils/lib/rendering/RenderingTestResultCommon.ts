/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// @here:check-imports:environment:node

import * as fs from "fs";
import * as glob from "glob";
import * as util from "util";

import { ImageTestResultLocal, TestImageProps } from "./Interface";

const promisedGlob = util.promisify(glob);

/**
 * Get image path in filesystem.
 *
 * Relative to `process.cwd()`, which is usually `mapsdk` folder.
 *
 * @param imageProps -
 * @param outputBasePath -
 */
export function getOutputImagePath(imageProps: TestImageProps, outputBasePath: string): string {
    if (imageProps.name && imageProps.module) {
        const basePath = outputBasePath;
        const platform = imageProps.platform || "";
        const platformPart = platform === "" ? "" : `${platform}/`;
        const extra = imageProps.extra || "";
        const extension = imageProps.extension ? imageProps.extension : ".png";
        const modulePart = imageProps.module ? imageProps.module + "-" : "";

        return `${basePath}/${platformPart}${modulePart}${imageProps.name}${extra}${extension}`;
    } else {
        throw new Error("unsupported test image props");
    }
}

/**
 * Search for IBCT results in `searchPath`.
 *
 * @param searchPath -
 */
export async function loadSavedResults(searchPath: string = ".") {
    const paths = await promisedGlob(`${searchPath}/**/*.ibct-result.json`);
    return paths.map(match => {
        const content = fs.readFileSync(match, "utf-8");
        return JSON.parse(content) as ImageTestResultLocal;
    });
}
