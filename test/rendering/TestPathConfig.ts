/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { TestImageProps } from "@here/harp-test-utils/lib/rendering/Interface";
import {
    getOverride,
    setReferenceImageResolver
} from "@here/harp-test-utils/lib/rendering/ReferenceImageLocator";
import { LoggerManager } from "@here/harp-utils";

const logger = LoggerManager.instance.create("TestPathConfig");

const REF_PLATFORM = "ChromeHeadless-79.0.3945.88-Linux";
// tslint:disable-next-line:no-var-requires
const referenceData = require(`../../test/rendering/${REF_PLATFORM}.ref.json`);
// tslint:disable-next-line:no-var-requires
const config = require("../../@here/harp-test-utils/config.json");
const BASE_REFERENCE_IMAGE_PATH = config.baseReferenceImagePath;

/**
 * Resolve reference image URL from github.
 */
function githubImageResolver(imageProps: TestImageProps) {
    const name = imageProps.name;
    const module = imageProps.module;
    const testName = `${module}-${name}`;

    const platformRefData = referenceData || {};
    const hash = platformRefData[testName] || "";
    logger.log("IMAGE PROPS:", imageProps);
    logger.log("hash: ", hash);
    logger.log(`${BASE_REFERENCE_IMAGE_PATH}/${hash}.png`);
    if (!hash) {
        return "";
    }

    return `${BASE_REFERENCE_IMAGE_PATH}/${hash}.png`;
}

/**
 * Default reference image resolver URL of reference image.
 *
 * Relative to `baseUrl` of test runner page, which is usually `test/rendering.html`,
 * so relative to `./test`.
 */
export function defaultReferenceImageResolver(imageProps: TestImageProps) {
    if (imageProps.name && imageProps.module) {
        const queryString = Object.keys(imageProps)
            .map(key => {
                return `${encodeURIComponent(key)}=${encodeURIComponent(imageProps[key])}`;
            })
            .join("&");

        return `/reference-image?${queryString}`;
    } else {
        throw new Error("unsupported test images props");
    }
}

/**
 * Resolve reference image from:
 *  - github if current platform is in `test/rendering/{platform}.ref.json`
 *  - `/rendering-test-results` otherwise
 */
function localOrCoImageResolver(imageProps: TestImageProps) {
    const platform = getOverride("IBCT_REFERENCE_PLATFORM", imageProps.platform);

    if (REF_PLATFORM === platform) {
        return githubImageResolver(imageProps);
    } else {
        return defaultReferenceImageResolver({ ...imageProps, extra: ".reference" });
    }
}

setReferenceImageResolver(localOrCoImageResolver);
