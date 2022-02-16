/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import "@here/harp-fetch";

import { isJsonExpr } from "@here/harp-datasource-protocol";
import {
    Definitions,
    getDefinitionValue,
    getStyles,
    ImageTexture,
    isJsonExprReference,
    isStylesDictionary,
    Style,
    Styles,
    Theme
} from "@here/harp-datasource-protocol/lib/Theme";
import {
    composeUriResolvers,
    ContextLogger,
    getAppBaseUrl,
    getOptionValue,
    IContextLogger,
    ISimpleChannel,
    RelativeUriResolver,
    UriResolver
} from "@here/harp-utils";

import { SKY_CUBEMAP_FACE_COUNT, SkyCubemapFaceId } from "./SkyCubemapTexture";

/**
 * @internal
 */
export const DEFAULT_MAX_THEME_INTHERITANCE_DEPTH = 4;

/**
 * Options to customize {@link @here/harp-datasource-protocol#Theme} loading process.
 *
 * @see {@link ThemeLoader.load}
 */
export interface ThemeLoadOptions {
    /**
     * Whether to resolve `ref` expressions in `definition` and `styles` elements.
     *
     * @default `false`, as datasources resolve definitions in [[StyleSetEvaluator]].
     */
    resolveDefinitions?: boolean;

    /**
     * Resolve the URIs to resources like fonts, icons, ...
     * If true, [[uriResolver]] will be used to resolve the URI
     * @default true
     */
    resolveResourceUris?: boolean;

    /**
     * Resolve the URIs of inherited themes (using `extends` feature).
     * If true, [[uriResolver]] will be used to resolve the URI
     * @default true
     */
    resolveIncludeUris?: boolean;

    /**
     * An `AbortSignal` object instance; allows you to communicate with a loading process
     * (including fetch requests) request and abort it if desired via an `AbortController`.
     *
     * Modeled after Web APIs `fetch`s `init.signal`.
     *
     * @see https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/fetch
     * @see https://developer.mozilla.org/en-US/docs/Web/API/AbortController
     */
    signal?: AbortSignal;

    /**
     * Maximum recursion depth when resolving base themes
     * through [{@link @here/harp-datasource-protocol#Theme}s `extends` property.
     *
     * @default [[DEFAULT_MAX_THEME_INTHERITANCE_DEPTH]]
     */
    maxInheritanceDepth?: number;

    /**
     * Custom logging channel on which diagnostics and warnings will be reported.
     *
     * If not specified, {@link ThemeLoader.load} will log to `console`.
     */
    logger?: ISimpleChannel;

    /**
     * Resolve asset `URI`s referenced in `Theme` assets using this resolver.
     */
    uriResolver?: UriResolver;
}

/**
 * Loads and validates a theme from URL objects.
 */
export class ThemeLoader {
    /**
     * Loads a {@link @here/harp-datasource-protocol#Theme} from a
     * remote resource, provided as a URL that points to a
     * JSON-encoded theme.
     *
     * By default, resolves following features of theme:
     *
     *  -  `extends` - loads and merges all inherited themes (see [[resolveBaseTheme]])
     *  -  `ref` - resolves all `ref` instances to their values defined in `definitions` section
     *     of theme (see [[resolveThemeReferences]])
     *
     * Relative URIs of reference resources are resolved to full URL using the document's base URL
     * (see [[resolveUrls]]).
     *
     * Custom URIs (of theme itself and of resources referenced by theme) may be resolved with by
     * providing {@link @here/harp-utils#UriResolver} using {@link ThemeLoadOptions.uriResolver}
     * option.
     *
     * @param theme - {@link @here/harp-datasource-protocol#Theme} instance or theme URL
     *                to the theme.
     * @param options - Optional, a {@link ThemeLoadOptions} objects
     *                  containing any custom settings for
     *                  this load request.
     */
    static async load(theme: string | Theme, options?: ThemeLoadOptions): Promise<Theme> {
        options = options ?? {};
        if (typeof theme === "string") {
            const uriResolver = options.uriResolver;
            const themeUrl = uriResolver !== undefined ? uriResolver.resolveUri(theme) : theme;
            const response = await fetch(themeUrl, { signal: options.signal });
            if (!response.ok) {
                throw new Error(`ThemeLoader#load: cannot load theme: ${response.statusText}`);
            }
            theme = (await response.json()) as Theme;
            theme.url = themeUrl;
            theme = this.resolveUrls(theme, options);
        } else if (theme.url === undefined) {
            // assume that theme url is same as baseUrl
            theme.url = getAppBaseUrl();
            theme = this.resolveUrls(theme, options);
        }
        theme.styles = getStyles(theme.styles);

        if (theme === null || theme === undefined) {
            throw new Error("ThemeLoader#load: loaded resource is not valid JSON");
        }

        const resolveDefinitions = getOptionValue<boolean>(options.resolveDefinitions, false);
        theme = await ThemeLoader.resolveBaseThemes(theme, options);
        if (resolveDefinitions) {
            const contextLoader = new ContextLogger(
                options.logger ?? console,
                `when processing Theme ${theme.url}:`
            );
            ThemeLoader.resolveThemeReferences(theme, contextLoader);
        }
        return theme;
    }

    /**
     * Checks if `theme` instance is completely loaded, meaning that `extends` property is resolved.
     *
     * @param theme -
     */
    static isThemeLoaded(theme: Theme): boolean {
        //TODO: Removed isStylesDictionary check when {@link StylesDictionary} is
        // fully deprecated
        return theme.extends === undefined && !isStylesDictionary(theme.styles);
    }

    /**
     * @deprecated Please use `ThemeLoader.load`
     *
     * Loads a {@link @here/harp-datasource-protocol#Theme} from a remote resource,
     * provided as a URL that points to a JSON-encoded
     * theme.
     *
     * @param themeUrl - The URL to the theme.
     *
     */
    static async loadAsync(themeUrl: string): Promise<Theme> {
        return await ThemeLoader.load(themeUrl);
    }

    /**
     * Resolves all {@link @here/harp-datasource-protocol#Theme}'s relatives URLs
     * to full URL using the {@link @here/harp-datasource-protocol#Theme}'s URL
     * (see: https://www.w3.org/TR/WD-html40-970917/htmlweb.html#h-5.1.2).
     *
     * This method mutates original `theme` instance.
     *
     * @param theme - The {@link @here/harp-datasource-protocol#Theme} to resolve.
     */
    private static resolveUrls(theme: Theme, options?: ThemeLoadOptions): Theme {
        // Ensure that all resources referenced in theme by relative URIs are in fact relative to
        // theme.
        if (theme.url === undefined) {
            return theme;
        }

        const childUrlResolver = composeUriResolvers(
            options?.uriResolver,
            new RelativeUriResolver(theme.url)
        );

        const resolveIncludes = options === undefined || !(options.resolveIncludeUris === false);
        if (theme.extends && resolveIncludes) {
            theme.extends = (Array.isArray(theme.extends) ? theme.extends : [theme.extends]).map(
                baseTheme => {
                    if (typeof baseTheme === "string") {
                        return childUrlResolver.resolveUri(baseTheme);
                    } else {
                        if (baseTheme.url !== undefined) {
                            return baseTheme;
                        } else {
                            baseTheme.url = theme.url;
                            return this.resolveUrls(baseTheme, options);
                        }
                    }
                }
            );
        }

        const resolveResources = options === undefined || !(options.resolveResourceUris === false);
        if (resolveResources) {
            ThemeLoader.resolveResources(theme, childUrlResolver);
        }

        return theme;
    }

    /**
     * Expand all `ref` expressions in {@link @here/harp-datasource-protocol#Theme}
     * basing on `definitions`.
     *
     * @remarks
     * This method mutates original `theme` instance.
     */
    private static resolveThemeReferences(theme: Theme, contextLogger: IContextLogger): Theme {
        if (theme.styles !== undefined) {
            contextLogger.pushAttr("styles");

            theme.styles = ThemeLoader.resolveStyles(
                getStyles(theme.styles),
                theme.definitions,
                contextLogger
            );
            contextLogger.pop();
            contextLogger.pop();
        }
        return theme;
    }

    /**
     * Expand all `ref` in [[StyleSet]] basing on `definitions`.
     */
    private static resolveStyles(
        styles: Styles,
        definitions: Definitions | undefined,
        contextLogger: IContextLogger
    ): Styles {
        const result: Styles = [];

        for (let index = 0; index < styles.length; ++index) {
            const currentStyle = styles[index];
            contextLogger.pushIndex(index);
            const resolvedStyle = ThemeLoader.resolveStyle(
                currentStyle,
                definitions,
                contextLogger
            );
            if (resolvedStyle !== undefined) {
                result.push(resolvedStyle);
            } else {
                contextLogger.warn("invalid style, ignored");
            }
            contextLogger.pop();
        }
        return result;
    }

    /**
     * Expand all `ref` in [[Style]] instance basing on `definitions`.
     */
    private static resolveStyle(
        style: Style,
        definitions: Definitions | undefined,
        contextLogger: IContextLogger
    ): Style | undefined {
        if (Array.isArray(style.when)) {
            contextLogger.pushAttr("when");
            const resolvedWhen = this.resolveExpressionReferences(
                style.when,
                definitions,
                contextLogger
            );
            contextLogger.pop();
            if (resolvedWhen === undefined) {
                return undefined;
            }
            style.when = resolvedWhen;
        }

        if (style.attr !== undefined) {
            const attr = style.attr as any;

            contextLogger.pushAttr("attr");
            for (const prop in attr) {
                if (!attr.hasOwnProperty(prop)) {
                    continue;
                }

                const value = attr[prop];

                if (!Array.isArray(value)) {
                    continue; // nothing to do
                }

                contextLogger.pushAttr(prop);
                const resolvedValue = this.resolveExpressionReferences(
                    value,
                    definitions,
                    contextLogger
                );
                contextLogger.pop();

                if (resolvedValue !== undefined) {
                    attr[prop] = resolvedValue;
                } else {
                    delete attr[prop];
                }
            }
            contextLogger.pop();
        }
        return style;
    }

    /**
     * Resolve `[ref, ...]` in expressions.
     *
     * Returns `undefined` some reference was invalid (missing or wrong type).
     */
    private static resolveExpressionReferences<T>(
        value: T,
        definitions: Definitions | undefined,
        contextLogger: IContextLogger
    ): T | undefined {
        let failed = false;
        function resolveInternal(node: any) {
            if (isJsonExprReference(node)) {
                const defName = node[1];
                const def = definitions && definitions[defName];
                if (def === undefined) {
                    contextLogger.warn(`invalid reference '${defName}' - not found`);
                    failed = true;
                    return undefined;
                }
                if (isJsonExpr(def)) {
                    return def;
                }
                return getDefinitionValue(def);
            } else if (Array.isArray(node)) {
                const result = [...node];
                for (let i = 1; i < result.length; ++i) {
                    result[i] = resolveInternal(result[i]);
                }
                return result;
            } else {
                return node;
            }
        }
        const r = resolveInternal(value);
        if (failed) {
            return undefined;
        }
        return r;
    }

    /**
     * Realize `extends` clause by merging `theme` with
     * its base {@link @here/harp-datasource-protocol#Theme}.
     *
     * @param theme - {@link @here/harp-datasource-protocol#Theme} object
     * @param options - Optional, a {@link ThemeLoadOptions} objects
     *                  containing any custom settings for
     *                  this load request.
     */
    private static async resolveBaseThemes(
        theme: Theme,
        options?: ThemeLoadOptions
    ): Promise<Theme> {
        options = options ?? {};
        if (theme.extends === undefined) {
            return theme;
        }

        const maxInheritanceDepth = getOptionValue(
            options.maxInheritanceDepth,
            DEFAULT_MAX_THEME_INTHERITANCE_DEPTH
        );
        if (maxInheritanceDepth <= 0) {
            throw new Error(`maxInheritanceDepth reached when attempting to load base theme`);
        }

        const baseThemes = !Array.isArray(theme.extends) ? [theme.extends] : theme.extends;
        delete theme.extends;
        let baseThemesMerged: Theme = {};
        for (const baseTheme of baseThemes) {
            const actualBaseTheme = await ThemeLoader.load(baseTheme, {
                ...options,
                resolveDefinitions: false,
                maxInheritanceDepth: maxInheritanceDepth - 1
            });

            baseThemesMerged = ThemeLoader.mergeThemes(actualBaseTheme, baseThemesMerged);
        }
        return ThemeLoader.mergeThemes(theme, baseThemesMerged);
    }

    private static mergeThemes(theme: Theme, baseTheme: Theme): Theme {
        const definitions = { ...baseTheme.definitions, ...theme.definitions };

        let styles!: Styles;

        const baseStyles = getStyles(baseTheme.styles);
        const themeStyles = getStyles(theme.styles);
        if (baseTheme.styles && theme.styles) {
            const newStyles: Styles = [];
            const styleIdMap = new Map<string, number>();
            baseStyles.forEach(style => {
                if (typeof style.id === "string") {
                    //multiple identical style.ids are not supported and will fall back to the
                    //first occurence
                    if (!styleIdMap.has(style.id)) {
                        styleIdMap.set(style.id, newStyles.length);
                    }
                }
                newStyles.push(style);
            });

            themeStyles.forEach(style => {
                if (typeof style.extends === "string" && styleIdMap.has(style.extends)) {
                    // extends the existing style referenced by `style.extends`.
                    const baseStyleIndex = styleIdMap.get(style.extends)!;
                    const baseStyle = newStyles[baseStyleIndex];
                    newStyles[baseStyleIndex] = { ...baseStyle, ...style } as any;
                    newStyles[baseStyleIndex].extends = undefined;
                    return;
                }

                if (typeof style.id === "string" && styleIdMap.has(style.id)) {
                    // overrides the existing style with `id` equals to `style.id`.
                    const styleIndex = styleIdMap.get(style.id)!;
                    // only match if the two rules are from the same styleset
                    if (newStyles[styleIndex].styleSet === style.styleSet) {
                        newStyles[styleIndex] = style;
                    }
                    return;
                }

                newStyles.push(style);
            });

            styles = newStyles;
        } else if (baseTheme.styles) {
            styles = [...baseStyles];
        } else if (theme.styles) {
            styles = [...themeStyles];
        }

        return {
            ...baseTheme,
            ...theme,
            // Due to nested structure of the images/textures it needs a
            // deep merge with a duplicate exclusion.
            ...ThemeLoader.mergeImageTextures(theme, baseTheme),
            definitions,
            styles
        };
    }

    private static mergeImageTextures(
        theme: Theme,
        baseTheme: Theme
    ): Pick<Theme, "images" | "imageTextures"> {
        const images = { ...baseTheme.images, ...theme.images };
        let imageTextures: ImageTexture[] = [];

        if (!baseTheme.imageTextures && theme.imageTextures) {
            imageTextures = theme.imageTextures;
        } else if (baseTheme.imageTextures && !theme.imageTextures) {
            imageTextures = baseTheme.imageTextures;
        } else if (baseTheme.imageTextures && theme.imageTextures) {
            imageTextures = theme.imageTextures.slice();
            baseTheme.imageTextures.forEach(val => {
                if (!imageTextures.find(({ name }) => name === val.name)) {
                    imageTextures.push(val);
                }
            });
        }

        return {
            images,
            imageTextures
        };
    }

    private static resolveResources(theme: Theme, childUrlResolver: UriResolver) {
        if (theme.sky && theme.sky.type === "cubemap") {
            for (let i = 0; i < SKY_CUBEMAP_FACE_COUNT; ++i) {
                const faceUrl: string | undefined = (theme.sky as any)[SkyCubemapFaceId[i]];
                if (faceUrl !== undefined) {
                    (theme.sky as any)[SkyCubemapFaceId[i]] = childUrlResolver.resolveUri(faceUrl);
                }
            }
        }
        if (theme.images) {
            for (const name of Object.keys(theme.images)) {
                const image = theme.images[name];
                image.url = childUrlResolver.resolveUri(image.url);
                if (image.atlas !== undefined) {
                    image.atlas = childUrlResolver.resolveUri(image.atlas);
                }
            }
        }
        if (theme.fontCatalogs) {
            for (const font of theme.fontCatalogs) {
                font.url = childUrlResolver.resolveUri(font.url);
            }
        }
        if (theme.poiTables) {
            for (const poiTable of theme.poiTables) {
                poiTable.url = childUrlResolver.resolveUri(poiTable.url);
            }
        }

        if (theme.styles !== undefined) {
            for (const style of getStyles(theme.styles)) {
                if (!style.attr) {
                    continue;
                }
                ["map", "normalMap", "displacementMap", "roughnessMap"].forEach(
                    texturePropertyName => {
                        const textureProperty = (style.attr! as any)[texturePropertyName];
                        if (textureProperty && typeof textureProperty === "string") {
                            (style.attr! as any)[texturePropertyName] = childUrlResolver.resolveUri(
                                textureProperty
                            );
                        }
                    }
                );
            }
        }
    }
}
