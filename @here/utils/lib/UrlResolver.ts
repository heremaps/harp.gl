/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

/**
 * Convenience type definition for URL resolvers.
 */
export type UrlResolver = (url: string) => string;

/**
 * Resolves URL using default URL resolver.
 *
 * By default URL resolver is just identity function, it can be changed using
 * [[setDefaultUrlResolver].
 */
export function defaultUrlResolver(url: string): string {
    if (customDefaultUrlResolver !== undefined) {
        return customDefaultUrlResolver(url);
    } else {
        return url;
    }
}

/**
 * Change resolver used by [[defaultUrlResolver]].
 *
 * `undefined` resets default resolver to identity function.
 *
 * @param resolver
 */
export function setDefaultUrlResolver(resolver: UrlResolver | undefined) {
    customDefaultUrlResolver = resolver;
}

let customDefaultUrlResolver: UrlResolver | undefined;

/**
 * Compose URL resolvers.
 *
 * Creates new `UrlResolver` that applies resolvers in orders or arguments.
 *
 * Example:
 *
 *     const themeUrl = ...; // url of parent object
 *     const childUrlResolver = composeUrlResolvers(
 *           (childUrl: string) => resolveReferenceUrl(themeUrl, childUrl),
 *           defaultUrlResolver
 *     );
 */
export function composeUrlResolvers(...resolvers: UrlResolver[]): UrlResolver {
    return (originalUrl: string) => {
        return resolvers.reduce((url, resolver) => {
            if (resolver !== undefined) {
                return resolver(url);
            } else {
                return url;
            }
        }, originalUrl);
    };
}
