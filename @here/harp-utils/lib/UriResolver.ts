/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { resolveReferenceUri } from "./UrlUtils";

/**
 * Custom, app-specific URI resolver interface.
 */
export interface UriResolver {
    /**
     * Attempt to resolve `URI` to `URL`.
     *
     * If given resolver doesn't know about this specific kind of `URI`, it should return string as
     * received.
     *
     * @param input - `URI`
     * @returns actual `URL` if this handler knows how locate given `uri` or original `uri`
     */
    resolveUri(uri: string): string;
}

export interface PrefixUriResolverDefinition {
    [prefix: string]: string;
}

/**
 * Basic, import-map like {@link UriResolver}.
 *
 * Resolves `uris` basing on exact or prefix match of `key` from `definitions`.
 *
 * In definitions, `key` is matched against input uri with following strategy:
 *  - `key` without trailing `/` -> `key` and input `uri` must be identical
 *  - `key` with trailing `/`, -> `key` is treated as "package prefix", so `uri` must start with
 *    `key`
 *
 * Example:
 * ```
 * {
 *     "local://poiMasterList": "/assets/poiMasterList.json"
 *        // will match only 'local://poiMasterList' and resolve `/assets/poiMasterList.json`
 *     "local://icons/": "/assets/icons/"
 *        // will match only 'local://icons/ANYPATH' (and similar) and resolve to
 *        // `/assets/icons/ANYPATH
 * }
 * ```
 * Inspired by [`WICG` import maps proposal](https://github.com/WICG/import-maps#the-import-map).
 */
export class PrefixMapUriResolver implements UriResolver {
    constructor(readonly definitions: PrefixUriResolverDefinition) {}

    resolveUri(uri: string) {
        return Object.keys(this.definitions).reduce((r, key) => {
            if (key.endsWith("/") && r.startsWith(key)) {
                const newPrefix = this.definitions[key];
                return newPrefix + r.substr(key.length);
            } else if (r === key) {
                return this.definitions[key];
            }
            return r;
        }, uri);
    }
}

/**
 * [UriResolver] that resolve relative `uri`s against to parent resource `uri`.
 */
export class RelativeUriResolver implements UriResolver {
    constructor(readonly parentUri: string) {}

    resolveUri(uri: string) {
        return resolveReferenceUri(this.parentUri, uri);
    }
}

/**
 * Compose URI resolvers.
 *
 * Creates new {@link UriResolver} that applies resolvers in orders or arguments.
 *
 * Example:
 *
 *     const themeUrl = ...; // url of parent object
 *     const childUrlResolver = composeUrlResolvers(
 *           new RelativeUriResolver(themeUrl),
 *           defaultUrlResolver
 *     );
 */
export function composeUriResolvers(...resolvers: Array<UriResolver | undefined>): UriResolver {
    return {
        resolveUri(originalUrl: string) {
            return resolvers.reduce((url, resolver) => {
                if (resolver !== undefined) {
                    return resolver.resolveUri(url);
                } else {
                    return url;
                }
            }, originalUrl);
        }
    };
}
