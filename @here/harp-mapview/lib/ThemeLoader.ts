/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Definitions,
    isActualSelectorDefinition,
    isJsonExprReference,
    isValueDefinition,
    ResolvedStyleDeclaration,
    ResolvedStyleSet,
    StyleDeclaration,
    StyleSet,
    Theme
} from "@here/harp-datasource-protocol/lib/Theme";
import {
    cloneDeep,
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

import "@here/harp-fetch";

export const DEFAULT_MAX_THEME_INTHERITANCE_DEPTH = 4;

/**
 * Options to customize [[Theme]] loading process.
 *
 * @see [[ThemeLoader.load]]
 */
export interface ThemeLoadOptions {
    /**
     * Whether to resolve `ref` expressions in `definition` and `styles` elements.
     *
     * @default `false`, as datasources resolve definitions in [[StyleSetEvaluator]].
     */
    resolveDefinitions?: boolean;

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
     * Maximum recursion depth when resolving base themes through [[[Theme]]s `extends` property.
     *
     * @default [[DEFAULT_MAX_THEME_INTHERITANCE_DEPTH]]
     */
    maxInheritanceDepth?: number;

    /**
     * Custom logging channel on which diagnostics and warnings will be reported.
     *
     * If not specified, [[ThemeLoader.load]] will log to `console`.
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
     * Loads a [[Theme]] from a remote resource, provided as a URL that points to a
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
     * providing [[UriResolver]] using [[ThemeLoadOptions.uriResolver]] option.
     *
     * @param theme [[Theme]] instance or theme URL to the theme.
     * @param options Optional, a [[ThemeLoadOptions]] objects containing any custom settings for
     *    this load request.
     */
    static async load(theme: string | Theme, options?: ThemeLoadOptions): Promise<Theme> {
        options = options || {};
        if (typeof theme === "string") {
            const uriResolver = options.uriResolver;
            const themeUrl = uriResolver !== undefined ? uriResolver.resolveUri(theme) : theme;

            const response = await fetch(themeUrl, { signal: options.signal });
            if (!response.ok) {
                throw new Error(`ThemeLoader#load: cannot load theme: ${response.statusText}`);
            }
            theme = (await response.json()) as Theme;
            theme.url = resolveReferenceUri(getAppBaseUrl(), themeUrl);
            theme = this.resolveUrls(theme, uriResolver);
        } else if (theme.url === undefined) {
            // assume that theme url is same as baseUrl
            theme.url = getAppBaseUrl();
            theme = this.resolveUrls(theme, options.uriResolver);
        }

        if (theme === null || theme === undefined) {
            throw new Error("ThemeLoader#load: loaded resource is not valid JSON");
        }
        theme = theme as Theme;
        // Remember the URL where the theme has been loaded from.

        const resolveDefinitions = getOptionValue<boolean>(options.resolveDefinitions, false);
        theme = await ThemeLoader.resolveBaseTheme(theme, options);
        if (resolveDefinitions) {
            const contextLoader = new ContextLogger(
                options.logger || console,
                `when processing Theme ${theme.url}:`
            );
            ThemeLoader.resolveThemeReferences(theme, contextLoader);
        }
        return theme;
    }

    /**
     * Checks if `theme` instance is completely loaded, meaning that `extends` property is resolved.
     *
     * @param theme
     */
    static isThemeLoaded(theme: Theme): boolean {
        return theme.extends === undefined;
    }

    /**
     * @deprecated Please use `ThemeLoader.load`
     *
     * Loads a [[Theme]] from a remote resource, provided as a URL that points to a JSON-encoded
     * theme.
     *
     * @param themeUrl The URL to the theme.
     *
     */
    static async loadAsync(themeUrl: string): Promise<Theme> {
        return ThemeLoader.load(themeUrl);
    }

    /**
     * Resolves all [[Theme]]'s relatives URLs to full URL using the [[Theme]]'s URL
     * (see: https://www.w3.org/TR/WD-html40-970917/htmlweb.html#h-5.1.2).
     *
     * This method mutates original `theme` instance.
     *
     * @param theme The [[Theme]] to resolve.
     */
    static resolveUrls(theme: Theme, uriResolver?: UriResolver): Theme {
        // Ensure that all resources referenced in theme by relative URIs are in fact relative to
        // theme.
        if (theme.url === undefined) {
            return theme;
        }

        const childUrlResolver = composeUriResolvers(
            new RelativeUriResolver(theme.url),
            uriResolver
        );

        if (theme.extends) {
            if (typeof theme.extends === "string") {
                theme.extends = childUrlResolver.resolveUri(theme.extends);
            } else {
                if (theme.extends.url === undefined) {
                    theme.extends.url = theme.url;
                    theme.extends = this.resolveUrls(theme.extends, uriResolver);
                }
            }
        }

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

        if (theme.styles) {
            for (const styleSetName in theme.styles) {
                if (!theme.styles.hasOwnProperty(styleSetName)) {
                    continue;
                }
                const styleSet = theme.styles[styleSetName] as ResolvedStyleDeclaration[];
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
        return theme;
    }

    /**
     * Expand all `ref` expressions in [[Theme]] basing on `definitions`.
     *
     * This method mutates original `theme` instance.
     */
    static resolveThemeReferences(theme: Theme, contextLogger: IContextLogger): Theme {
        if (theme.definitions !== undefined) {
            contextLogger.pushAttr("definitions");
            /**
             * First, try to resolve all internal references in definitions, so if we may save few
             * CPU cycles if some definition is used many times in actual style sets.
             */
            for (const definitionName in theme.definitions) {
                if (!theme.definitions.hasOwnProperty(definitionName)) {
                    continue;
                }

                const def = theme.definitions[definitionName];
                if (isActualSelectorDefinition(def)) {
                    contextLogger.pushAttr(definitionName);
                    const resolvedDef = ThemeLoader.resolveStyle(
                        def,
                        theme.definitions,
                        contextLogger
                    );
                    contextLogger.pop();
                    if (resolvedDef === undefined) {
                        contextLogger.pushAttr(definitionName);
                        contextLogger.warn("skipping invalid style in definition");
                        contextLogger.pop();
                        delete theme.definitions[definitionName];
                    } else {
                        theme.definitions[definitionName] = resolvedDef;
                    }
                }
            }
            contextLogger.pop();
        }
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
    static resolveStyleSet(
        styleSet: StyleSet,
        definitions: Definitions | undefined,
        contextLogger: IContextLogger
    ): ResolvedStyleSet {
        const result: ResolvedStyleSet = [];

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
    static resolveStyle(
        style: StyleDeclaration,
        definitions: Definitions | undefined,
        contextLogger: IContextLogger
    ): ResolvedStyleDeclaration | undefined {
        if (isJsonExprReference(style)) {
            // expand and instantiate references to style definitions.

            const def = definitions && definitions[style[1]];

            if (!def) {
                contextLogger.warn(`invalid reference '${style[1]}' - not found`);
                return undefined;
            }
            if (!isActualSelectorDefinition(def)) {
                contextLogger.warn(`invalid reference '${style[1]}' - expected style definition`);
                return undefined;
            }

            // instantiate the style
            style = cloneDeep(def);
        }
        style = style as ResolvedStyleDeclaration;

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
    static resolveExpressionReferences<T>(
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
                if (!isValueDefinition(def)) {
                    contextLogger.warn(
                        `invalid reference '${defName}' - expected value definition`
                    );
                    failed = true;
                    return undefined;
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
     * Realize `extends` clause by merging `theme` with its base [[Theme]].
     *
     * @param theme [Theme] object
     * @param options Optional, a [[ThemeLoadOptions]] objects containing any custom settings for
     *    this load request.
     */
    static async resolveBaseTheme(theme: Theme, options?: ThemeLoadOptions): Promise<Theme> {
        options = options || {};
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

        const baseTheme = theme.extends;
        delete theme.extends;

        const actualBaseTheme = await ThemeLoader.load(baseTheme, {
            ...options,
            resolveDefinitions: false,
            maxInheritanceDepth: maxInheritanceDepth - 1
        });

        const definitions = { ...actualBaseTheme.definitions, ...theme.definitions };
        const styles = { ...actualBaseTheme.styles, ...theme.styles };
        return { ...actualBaseTheme, ...theme, definitions, styles };
    }
}
