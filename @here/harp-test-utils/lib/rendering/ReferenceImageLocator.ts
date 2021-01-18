/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as querystring from "querystring";

import { TestImageProps } from "./Interface";

let referenceImageResovler: (imageProps: TestImageProps) => string = defaultReferenceImageResolver;

/**
 * Get URL of reference image.
 *
 * Uses resolver set by [[setReferenceImageResolver]], by default, use
 * [[defaultReferenceImageResolver]].
 */
export function getReferenceImageUrl(imageProps: TestImageProps) {
    return referenceImageResovler(imageProps);
}

/**
 * Default reference image resolver URL of reference image.
 *
 * Relative to `baseUrl` of test runner page, which is usually `test/rendering.html`,
 * so relative to `mapsdk/test`.
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

export function setReferenceImageResolver(resolver: (imageProps: TestImageProps) => string) {
    referenceImageResovler = resolver;
}

export function getOverride(name: string, defaultValue: string): string {
    if (typeof window !== "undefined" && window.location) {
        if (window.location.search) {
            const queryParams = querystring.parse(window.location.search.substr(1));
            if (queryParams[name] !== undefined) {
                return queryParams[name] as string;
            }
        }
    }
    const windowOverride: string = (global as any)[name];
    if (windowOverride !== undefined) {
        return windowOverride;
    }
    return defaultValue;
}
