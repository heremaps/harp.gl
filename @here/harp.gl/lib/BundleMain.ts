/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConcurrentDecoderFacade, ConcurrentTilerFacade } from "@here/harp-mapview";
import { WorkerLoader } from "@here/harp-mapview/lib/workers/WorkerLoader";
import { baseUrl, UriResolver } from "@here/harp-utils";

/**
 * Default decoder url for bundled map component.
 */
export const DEFAULT_DECODER_SCRIPT_URL = "harp.js-bundle://harp-decoders.js";

/**
 * Basename of map bundle script - used by [[getBundleScriptUrl]] as fallback, when
 * `document.currentScript` is not present.
 *
 * @hidden
 */
export const BUNDLE_SCRIPT_BASENAME = "harp";

/**
 * Guess `harp(.min).js` script URL.
 *
 * Required to find default URLs `harp-decoders.js` which are hosted together, not necessarily with
 * base URL of current page.
 *
 * @see https://stackoverflow.com/questions/2976651
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Document/currentScript
 * @hidden
 */
export function getBundleScriptUrl(): string | undefined | null {
    if (bundleScriptUrl !== undefined) {
        return bundleScriptUrl;
    }

    const currentScript = document.currentScript as HTMLScriptElement | null;
    const baseScriptUrl =
        currentScript !== null &&
        typeof currentScript.src === "string" &&
        (currentScript.src.endsWith(BUNDLE_SCRIPT_BASENAME + ".js") ||
            currentScript.src.endsWith(BUNDLE_SCRIPT_BASENAME + ".min.js"))
            ? currentScript.src
            : getScriptUrl(BUNDLE_SCRIPT_BASENAME);

    if (baseScriptUrl) {
        bundleScriptUrl = baseScriptUrl;
        return bundleScriptUrl;
    } else {
        bundleScriptUrl = null;
        return undefined;
    }
}

/**
 * Memoizes result of [[getBundleScriptUrl]].
 * @hidden
 */
let bundleScriptUrl: string | undefined | null;

/**
 * Get script URL assumet it's already loaded in DOM.
 *
 * Required to find default URLs `harp.(min.)js` and `three().min).js` which are required to
 * properly start decoder bundle.
 *
 * @see https://stackoverflow.com/questions/2976651
 * @hidden
 */
export function getScriptUrl(name: string): string | undefined | null {
    const scriptElement =
        document.querySelector(`script[src*='/${name}.min.js']`) ??
        document.querySelector(`script[src='${name}.min.js']`) ??
        document.querySelector(`script[src*='/${name}.js']`) ??
        document.querySelector(`script[src='${name}.js']`);

    if (scriptElement) {
        return (scriptElement as HTMLScriptElement).src;
    } else {
        return undefined;
    }
}

const HARP_GL_BUNDLED_ASSETS_PREFIX = "harp.js-bundle://";

/**
 * Resolve URLs with support for `harp.gl` bundle specific URLs.
 *
 * URLs with prefix `harp.gl:` are resolved relatively to `harp.js` bundle's base URL.
 *
 * @hidden
 */
export class BundledUriResolver implements UriResolver {
    resolveUri(uri: string) {
        if (uri.startsWith(HARP_GL_BUNDLED_ASSETS_PREFIX)) {
            const bundleSriptUrl = getBundleScriptUrl();
            if (bundleSriptUrl === null || bundleSriptUrl === undefined) {
                throw new Error(
                    `harp.js: cannot resolve ${uri} because 'harp.gl' base url is not set.`
                );
            } else {
                uri = uri.substring(HARP_GL_BUNDLED_ASSETS_PREFIX.length);
                if (uri.startsWith("/")) {
                    uri = uri.substring(1);
                }
                return baseUrl(bundleSriptUrl) + uri;
            }
        }
        return uri;
    }
}
const bundledUriResolver = new BundledUriResolver();

const getActualDecoderScriptUrl = () => {
    const baseScriptUrl = getBundleScriptUrl();
    if (!baseScriptUrl) {
        // eslint-disable-next-line no-console
        console.error(
            `harp.js: Unable to determine default location of 'harp-decoders(min).js'. ` +
                `See https://github.com/heremaps/harp.gl/@here/harp.gl.`
        );
    }
    if (!WorkerLoader.dependencyUrlMapping.three) {
        // eslint-disable-next-line no-console
        console.error(
            `harp.js: Unable to determine location of 'three(.min).js'. ` +
                "`See https://github.com/heremaps/harp.gl/@here/harp.gl.`"
        );
    }
    const isMinified = baseScriptUrl && baseScriptUrl.endsWith(".min.js");

    const decoderScriptName = !isMinified
        ? DEFAULT_DECODER_SCRIPT_URL
        : DEFAULT_DECODER_SCRIPT_URL.replace(/\.js$/, ".min.js");
    return bundledUriResolver.resolveUri(decoderScriptName);
};

/**
 * Guess decoder script URL.
 *
 * Assumes that decoder script - `harp-decoders.js` is in same place as main bundle and calculates
 * it's URL.
 *
 * Minified version of `harp.js` bundle loads minified version of decoder.
 * Hooks in [[ConcurrentDecoderFacade]] to use this URL as default `defaultScriptUrl`.
 *
 * @hidden
 */
function installDefaultDecoderUrlHook() {
    ConcurrentDecoderFacade.defaultScriptUrl = "";
    ConcurrentTilerFacade.defaultScriptUrl = "";

    const threeUrl = getScriptUrl("three")!;

    WorkerLoader.dependencyUrlMapping.three = threeUrl;

    const oldDecoderGetWorkerSet = ConcurrentDecoderFacade.getWorkerSet;
    ConcurrentDecoderFacade.getWorkerSet = (scriptUrl?: string) => {
        if (scriptUrl === undefined && ConcurrentDecoderFacade.defaultScriptUrl === "") {
            const newScriptUrl = getActualDecoderScriptUrl();

            ConcurrentDecoderFacade.defaultScriptUrl = newScriptUrl;
        }
        return oldDecoderGetWorkerSet.apply(ConcurrentDecoderFacade, [scriptUrl]);
    };

    const oldTilerGetWorkerSet = ConcurrentTilerFacade.getWorkerSet;
    ConcurrentTilerFacade.getWorkerSet = (scriptUrl?: string) => {
        if (scriptUrl === undefined && ConcurrentTilerFacade.defaultScriptUrl === "") {
            const newScriptUrl = getActualDecoderScriptUrl();

            ConcurrentTilerFacade.defaultScriptUrl = newScriptUrl;
        }
        return oldTilerGetWorkerSet.apply(ConcurrentTilerFacade, [scriptUrl]);
    };
}

/**
 * Initialize `harp.gl` bundle.
 *
 * Install specific default decoder urls into [[ConcurrentDecoderFacade]].
 * @hidden
 */
export function mapBundleMain() {
    getBundleScriptUrl();
    installDefaultDecoderUrlHook();
}
