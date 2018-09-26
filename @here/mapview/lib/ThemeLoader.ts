/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

import { Theme } from "@here/datasource-protocol";
import "@here/fetch";
import { composeUrlResolvers, defaultUrlResolver, resolveReferenceUrl } from "@here/utils";

/**
 * `ThemeLoader` loads and validates a theme from URL objects.
 */
export class ThemeLoader {
    /**
     * Loads [[Theme]] from a remote resource provided as a URL.
     *
     * By default, relative URLs are resolved to full URL using document base URL.
     * (see: https://www.w3.org/TR/WD-html40-970917/htmlweb.html#h-5.1.2).
     *
     * Expects a URL pointing to a theme encoded as JSON.
     *
     * @param themeUrl Theme URL.
     */
    static async loadAsync(themeUrl: string): Promise<Theme> {
        themeUrl = defaultUrlResolver(themeUrl);

        const response = await fetch(themeUrl);
        if (!response.ok) {
            throw new Error(`ThemeLoader#loadAsync: cannot load theme: ${response.statusText}`);
        }
        const theme = (await response.json()) as Theme | null;
        if (theme === null) {
            throw new Error("ThemeLoader#loadAsync: loaded resource is not valid JSON");
        }

        // Ensure that all resources referenced in theme by relative URLs are in fact relative to
        // theme.
        const childUrlResolver = composeUrlResolvers(
            (childUrl: string) => resolveReferenceUrl(themeUrl, childUrl),
            defaultUrlResolver
        );
        if (theme.images) {
            for (const image of theme.images) {
                image.url = childUrlResolver(image.url);

                if (image.atlas !== undefined) {
                    image.atlas = childUrlResolver(image.atlas);
                }
            }
        }
        if (theme.fontCatalogs) {
            for (const font of theme.fontCatalogs) {
                font.url = childUrlResolver(font.url);
            }
        }
        return theme;
    }
}
