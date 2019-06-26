/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Definitions,
    isActualSelectorDefinition,
    isReference,
    isSelectorDefinition,
    isValueDefinition,
    ResolvedStyleDeclaration,
    ResolvedStyleSet,
    StyleDeclaration,
    StyleSet,
    Theme
} from "@here/harp-datasource-protocol/lib/Theme";
import {
    cloneDeep,
    composeUrlResolvers,
    ContextLogger,
    defaultUrlResolver,
    getOptionValue,
    IContextLogger,
    ISimpleChannel,
    resolveReferenceUrl
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
     * @default `true`
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
     * Relative URLs of reference resources are resolved to full URL using the document's base URL
     * (see [[resolveUrls]]).
     *
     * @param theme [[Theme]] instance or theme URL to the theme.
     * @param options Optional, a [[ThemeLoadOptions]] objects containing any custom settings for
     *    this load request.
     */
    static async load(theme: string | Theme, options?: ThemeLoadOptions): Promise<Theme> {
        options = options || {};
        if (typeof theme === "string") {
            const themeUrl = defaultUrlResolver(theme);

            const response = await fetch(themeUrl, { signal: options.signal });
            if (!response.ok) {
                throw new Error(`ThemeLoader#load: cannot load theme: ${response.statusText}`);
            }
            theme = (await response.json()) as Theme;
            theme.url = themeUrl;
        }

        if (theme === null || theme === undefined) {
            throw new Error("ThemeLoader#load: loaded resource is not valid JSON");
        }
        theme = theme as Theme;
        // Remember the URL where the theme has been loaded from.

        theme = this.resolveUrls(theme);

        const resolveDefinitions = getOptionValue<boolean>(options.resolveDefinitions, true);
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
    static resolveUrls(theme: Theme): Theme {
        // Ensure that all resources referenced in theme by relative URLs are in fact relative to
        // theme.
        if (theme.url === undefined) {
            return theme;
        }

        const childUrlResolver = composeUrlResolvers(
            (childUrl: string) => resolveReferenceUrl(theme.url, childUrl),
            defaultUrlResolver
        );

        if (theme.extends) {
            if (typeof theme.extends === "string") {
                theme.extends = childUrlResolver(theme.extends);
            } else {
                if (theme.extends.url === undefined) {
                    theme.extends.url = theme.url;
                    theme.extends = this.resolveUrls(theme.extends);
                }
            }
        }

        if (theme.sky && theme.sky.type === "cubemap") {
            for (let i = 0; i < SKY_CUBEMAP_FACE_COUNT; ++i) {
                const faceUrl: string | undefined = (theme.sky as any)[SkyCubemapFaceId[i]];
                if (faceUrl !== undefined) {
                    (theme.sky as any)[SkyCubemapFaceId[i]] = childUrlResolver(faceUrl);
                }
            }
        }
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
                const styleSet = theme.styles[styleSetName] as ResolvedStyleDeclaration[];
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
        if (isReference(style)) {
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

        if (isReference(style.when)) {
            const ref = style.when[1];
            contextLogger.pushAttr("when");
            const def = definitions && definitions[ref];
            if (!def) {
                contextLogger.warn(`invalid reference '${ref}' - not found`);
                contextLogger.pop();
                return undefined;
            }
            if (!isSelectorDefinition(def)) {
                contextLogger.warn(`invalid reference '${ref}' - expected selector definition`);
                contextLogger.pop();
                return undefined;
            }
            style.when = def.value;
        }

        if (style.attr !== undefined) {
            const attr = style.attr as any;

            contextLogger.pushAttr("attr");
            for (const prop in attr) {
                if (!attr.hasOwnProperty(prop)) {
                    continue;
                }

                const value = attr[prop];

                if (!isReference(value)) {
                    continue; // nothing to do
                }

                const def = definitions && definitions[value[1]];

                if (!def) {
                    delete attr[prop];
                    contextLogger.pushAttr(prop);
                    contextLogger.warn(`invalid reference '${value[1]}' - not found`);
                    contextLogger.pop();
                    continue;
                }
                if (!isValueDefinition(def)) {
                    delete attr[prop];
                    contextLogger.pushAttr(prop);
                    contextLogger.warn(
                        `invalid reference '${value[1]}' - expected value definition`
                    );
                    contextLogger.pop();
                    continue;
                }

                attr[prop] = def.value;
            }
            contextLogger.pop();
        }
        return style;
    }

    /**
     * Realize `extends` clause by merging `theme` with it's base [[Theme]].
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
