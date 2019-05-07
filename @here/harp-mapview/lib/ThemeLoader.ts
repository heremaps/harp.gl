/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Theme } from "@here/harp-datasource-protocol";
import "@here/harp-fetch";
import { composeUrlResolvers, defaultUrlResolver, resolveReferenceUrl } from "@here/harp-utils";

/**
 * Loads and validates a theme from URL objects.
 */
export class ThemeLoader {
    /**
     * Loads a [[Theme]] from a remote resource, provided as a URL that points to a
     * JSON-encoded theme.
     *
     * Relative URLs are resolved to full URL using the document's base URL
     * (see: https://www.w3.org/TR/WD-html40-970917/htmlweb.html#h-5.1.2).
     *
     * @param themeUrl The URL to the theme.
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
        // Remember the URL where the theme has been loaded from.
        theme.url = themeUrl;

        return this.resolveUrls(theme);
    }

    /**
     * Resolves all [[Theme]]'s relatives URLs to full URL using the [[Theme]]'s URL
     * (see: https://www.w3.org/TR/WD-html40-970917/htmlweb.html#h-5.1.2).
     *
     * @param theme The [[Theme]] to resolve.
     */
    static resolveUrls(theme: Theme): Theme {
        // Ensure that all resources referenced in theme by relative URLs are in fact relative to
        // theme.
        const childUrlResolver = composeUrlResolvers(
            (childUrl: string) => resolveReferenceUrl(theme.url, childUrl),
            defaultUrlResolver
        );
        if (theme.images) {
            for (const name of Object.keys(theme.images)) {
                const image = theme.images[name];
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
        if (theme.poiTables) {
            for (const poiTable of theme.poiTables) {
                poiTable.url = childUrlResolver(poiTable.url);
            }
        }

        if (theme.styles) {
            for (const styleSetName in theme.styles) {
                if (!theme.styles.hasOwnProperty(styleSetName)) {
                    continue;
                }
                const styleSet = theme.styles[styleSetName];
                for (const style of styleSet) {
                    if (!style.attr) {
                        continue;
                    }
                    ["map", "normalMap", "displacementMap", "roughnessMap"].forEach(
                        texturePropertyName => {
                            const textureProperty = (style.attr! as any)[texturePropertyName];
                            if (textureProperty && typeof textureProperty === "string") {
                                (style.attr! as any)[texturePropertyName] = childUrlResolver(
                                    textureProperty
                                );
                            }
                        }
                    );
                }
            }
        }
        return theme;
    }
}
