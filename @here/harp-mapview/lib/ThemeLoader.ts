/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import "@here/harp-fetch";

import { isJsonExpr } from "@here/harp-datasource-protocol";
import {
    Definitions,
    FlatTheme,
    isJsonExprReference,
    Style,
    Styles,
    StyleSet,
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
    resolveReferenceUri,
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
    static async load(
        theme: string | Theme | FlatTheme,
        options?: ThemeLoadOptions
    ): Promise<Theme> {
        options = options ?? {};
        if (typeof theme === "string") {
            const uriResolver = options.uriResolver;
            const themeUrl = uriResolver !== undefined ? uriResolver.resolveUri(theme) : theme;
            const response = await fetch(themeUrl, { signal: options.signal });
            if (!response.ok) {
                throw new Error(`ThemeLoader#load: cannot load theme: ${response.statusText}`);
            }
            theme = (await response.json()) as Theme;
            theme.url = resolveReferenceUri(getAppBaseUrl(), themeUrl);
            theme = this.resolveUrls(theme, options);
        } else if (theme.url === undefined) {
            // assume that theme url is same as baseUrl
            theme.url = getAppBaseUrl();
            theme = this.resolveUrls(theme, options);
        } else {
            theme = this.convertFlatTheme(theme);
        }

        if (theme === null || theme === undefined) {
            throw new Error("ThemeLoader#load: loaded resource is not valid JSON");
        }

        ThemeLoader.checkTechniqueSupport(theme);

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
    static isThemeLoaded(theme: Theme | FlatTheme): boolean {
        // TODO: Remove array check, when FlatTheme is fully supported
        return theme.extends === undefined && !Array.isArray(theme.styles);
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
    private static resolveUrls(theme: Theme | FlatTheme, options?: ThemeLoadOptions): Theme {
        // Ensure that all resources referenced in theme by relative URIs are in fact relative to
        // theme.
        theme = ThemeLoader.convertFlatTheme(theme);
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

        if (!ThemeLoader.convertFlatTheme(theme)) {
            return theme;
        }

        const resolveResources = options === undefined || !(options.resolveResourceUris === false);
        if (resolveResources) {
            ThemeLoader.resolveResources(theme, childUrlResolver);
        }

        return theme;
    }

    private static checkTechniqueSupport(theme: Theme) {
        if (theme.styles !== undefined) {
            for (const styleSetName in theme.styles) {
                if (!theme.styles.hasOwnProperty(styleSetName)) {
                    continue;
                }
                for (const style of theme.styles[styleSetName]) {
                    switch ((style as any).technique) {
                        // TODO: Re-enable this once "dashed-line" is deprecated.
                        /* case "dashed-line":
                            console.warn(
                                `Using deprecated "dashed-line" technique.
                                Use "solid-line" technique instead`
                            ); */
                        default:
                            break;
                    }
                }
            }
        }
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
            for (const styleSetName in theme.styles) {
                if (!theme.styles.hasOwnProperty(styleSetName)) {
                    continue;
                }
                contextLogger.pushAttr("styles");
                contextLogger.pushAttr(styleSetName);

                theme.styles[styleSetName] = ThemeLoader.resolveStyleSet(
                    theme.styles[styleSetName],
                    theme.definitions,
                    contextLogger
                );
                contextLogger.pop();
                contextLogger.pop();
            }
        }
        return theme;
    }

    /**
     * Expand all `ref` in [[StyleSet]] basing on `definitions`.
     */
    private static resolveStyleSet(
        styleSet: StyleSet,
        definitions: Definitions | undefined,
        contextLogger: IContextLogger
    ): StyleSet {
        const result: StyleSet = [];

        for (let index = 0; index < styleSet.length; ++index) {
            const currentStyle = styleSet[index];
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
                return def.value;
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

        if (baseTheme.styles && theme.styles) {
            const currentStyleSets = Object.keys(baseTheme.styles);
            const incomingStyleSets = Object.keys(theme.styles);

            styles = {};

            currentStyleSets.forEach(styleSetName => {
                const index = incomingStyleSets.indexOf(styleSetName);

                if (index !== -1) {
                    // merge the current and incoming styleset
                    // and add the result to `styles`.

                    const baseStyleSet = baseTheme.styles![styleSetName];

                    const newStyleSet: StyleSet = [];
                    const styleIdMap = new Map<string, number>();
                    baseStyleSet.forEach(style => {
                        if (typeof style.id === "string") {
                            styleIdMap.set(style.id, newStyleSet.length);
                        }
                        newStyleSet.push(style);
                    });

                    const incomingStyleSet = theme.styles![styleSetName];
                    incomingStyleSet.forEach(style => {
                        if (typeof style.extends === "string" && styleIdMap.has(style.extends)) {
                            // extends the existing style referenced by `style.extends`.
                            const baseStyleIndex = styleIdMap.get(style.extends)!;
                            const baseStyle = newStyleSet[baseStyleIndex];
                            newStyleSet[baseStyleIndex] = { ...baseStyle, ...style } as any;
                            newStyleSet[baseStyleIndex].extends = undefined;
                            return;
                        }

                        if (typeof style.id === "string" && styleIdMap.has(style.id)) {
                            // overrides the existing style with `id` equals to `style.id`.
                            const styleIndex = styleIdMap.get(style.id)!;
                            newStyleSet[styleIndex] = style;
                            return;
                        }

                        newStyleSet.push(style);
                    });

                    styles[styleSetName] = newStyleSet;

                    // remove the styleset from the incoming list
                    incomingStyleSets.splice(index, 1);
                } else {
                    // copy the existing style set to `styles`.
                    styles[styleSetName] = baseTheme.styles![styleSetName];
                }
            });

            // add the remaining stylesets to styles.
            incomingStyleSets.forEach(p => {
                styles[p] = theme.styles![p];
            });
        } else if (baseTheme.styles) {
            styles = { ...baseTheme.styles };
        } else if (theme.styles) {
            styles = { ...theme.styles };
        }
        return { ...baseTheme, ...theme, definitions, styles };
    }

    private static convertFlatTheme(theme: Theme | FlatTheme): Theme {
        if (Array.isArray(theme.styles)) {
            // Convert the flat theme to a standard theme.
            const styles: Styles = {};
            theme.styles.forEach(style => {
                if (isJsonExpr(style)) {
                    throw new Error("invalid usage of theme reference");
                }
                const styleSetName = style.styleSet;
                if (styleSetName === undefined) {
                    throw new Error("missing reference to style set");
                }
                if (!styles[styleSetName]) {
                    styles[styleSetName] = [];
                }
                styles[styleSetName].push(style);
            });
            theme.styles = styles;
        }
        return theme as Theme;
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
            for (const styleSetName in theme.styles) {
                if (!theme.styles.hasOwnProperty(styleSetName)) {
                    continue;
                }
                const styleSet = theme.styles[styleSetName] as Style[];
                for (const style of styleSet) {
                    if (!style.attr) {
                        continue;
                    }
                    ["map", "normalMap", "displacementMap", "roughnessMap"].forEach(
                        texturePropertyName => {
                            const textureProperty = (style.attr! as any)[texturePropertyName];
                            if (textureProperty && typeof textureProperty === "string") {
                                (style.attr! as any)[
                                    texturePropertyName
                                ] = childUrlResolver.resolveUri(textureProperty);
                            }
                        }
                    );
                }
            }
        }
    }
}
