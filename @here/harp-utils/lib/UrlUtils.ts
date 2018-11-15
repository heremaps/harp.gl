/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Resolve URL of referenced object.
 *
 * Resolves `childUrl` as it would be loaded from location specified by `parentUrl`.
 *
 * If `childUrl` is absolute, then it is returned unchanged.
 * If `childUrl` is origin-absolute path, then only origin path is taken from `parentUrl`.
 *
 * See [[baseUrl]] for reference how base URL of `parentUrl` is determined.
 *
 * Examples:
 *
 *     // normal case, child is sibling
 *     https://foo.com/themes/day.json + images/foo.png -> https://foo.com/themes/images/foo.png
 *
 *     // parent is "folder", so child is just located in this folder
 *     https://foo.com/themes/ + images/foo.png -> https://foo.com/themes/images/foo.png
 *
 *     // parent looks like leaf, so last component is stripped
 *     https://foo.com/themes + images/foo.png -> https://foo.com/images/foo.png
 *
 *     // origin-absolute URL, takes only origin from parent
 *     https://foo.com/themes/day.json + /fonts/foo.json -> https://foo.com/fonts/foo.json
 *
 * @param parentUrl URL of parent resource
 * @param childUrl URL of child as referenced from parent resource
 * @return `childUrl` as if anchored in location of `parentUrl`
 */
export function resolveReferenceUrl(parentUrl: string | undefined, childUrl: string): string {
    if (absoluteUrlWithOriginRe.test(childUrl)) {
        return childUrl;
    } else if (childUrl.startsWith("/")) {
        const origin = getUrlOrigin(parentUrl);
        return origin + childUrl;
    } else {
        if (childUrl.startsWith("./")) {
            childUrl = childUrl.substr(2);
        }
        const parentBaseUrl = baseUrl(parentUrl);
        return parentBaseUrl + childUrl;
    }
}

const absoluteUrlWithOriginRe = new RegExp("^(?:[a-z]+:)?//", "i");

/**
 * Returns base URL of given resource URL.
 *
 * `Url` with trailing slash are considered genuine 'locations', they are returned as is, however if
 * `url` ends with name component it is treated as "leaf", so last path component is removed.
 *
 * Standalone files (without any folder structure) are considered relative to `./`.
 *
 * Examples:
 * ```
 *     https://foo.com/themes/a.json -> https://foo.com/themes/
 *     https://foo.com/themes/ -> https://foo.com/themes/
 *     https://foo.com/themes -> https://foo.com/ // note, themes is treated as leaf
 *     themes/day.json -> themes/
 *     themes -> ./
 * ```
 */
export function baseUrl(url: string | undefined) {
    if (url === undefined) {
        return "./";
    }
    const idx = url.lastIndexOf("/");
    if (idx === -1) {
        return "./";
    } else {
        return url.substring(0, idx + 1);
    }
}

/**
 * Get `origin` part of URL.
 *
 * @example
 *    https://example.com/foo -> https://example.com
 *    //example.com:8080/ -> //example.com:8080
 *    file:///etc/hosts ->
 *
 * @param url input URL
 * @return origin of given URL
 */
export function getUrlOrigin(url: string | undefined): string {
    if (url === undefined) {
        return "";
    }
    const parsed = getUrlHostAndProtocol(url);
    if (parsed.protocol === "file:") {
        return "file://";
    } else if (parsed.host && parsed.protocol) {
        return parsed.protocol + "//" + parsed.host;
    } else if (parsed.host) {
        return "//" + parsed.host;
    } else if (parsed.protocol) {
        return parsed.protocol + "//";
    } else {
        return "";
    }
}

/**
 * Parse `host` and `protocol` part from URL.
 */
export function getUrlHostAndProtocol(
    url: string
): {
    protocol: string;
    host: string;
} {
    const urlOriginRe = new RegExp(/^(?:([a-z]+:))?\/\/([^\/]*)/, "i");

    const match = url.match(urlOriginRe);
    if (!match) {
        throw new Error(`getUrlHostAndProtocol: unable to parse URL '${url}'`);
    }
    return {
        protocol: match[1],
        host: match[2]
    };
}
