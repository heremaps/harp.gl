/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { LoggerManager } from "@here/harp-utils";
import { assert } from "chai";
import * as querystring from "querystring";
import * as THREE from "three";
import { UAParser } from "ua-parser-js";

import { canvasToImageData, compareImages, loadImageData } from "./DomImageUtils";
import { DomReporter } from "./DomReporter";
import { Reporter, TestImageProps } from "./Interface";
import { getReferenceImageUrl } from "./ReferenceImageLocator";
import { RenderingTestResultReporter } from "./RenderingTestResultReporter";

const logger = LoggerManager.instance.create("RenderingTestHelper");

/**
 * Specifies how sensitive image comparison should be
 */
export interface TestOptions {
    /**
     * Defines how many pixels can mismatch. If more than maxMismatchedPixels
     * test fails.
     */
    maxMismatchedPixels?: number;
    /**
     * Matching threshold, ranges from 0 to 1.
     * Smaller values make the comparison more sensitive. 0 by default.
     * 0 - accepts perfect match, 1 - accepts many differences
     * Used with pixelmatch library: https://github.com/mapbox/pixelmatch
     */
    threshold?: number;
}

/**
 * Defaults used for image comapision
 */
const TestOptionsDefaults = {
    /**
     * By default maxMismatchedPixels equal 0 to have pixel perfect match
     */
    maxMismatchedPixels: 0,
    /**
     * By default threshold equal 0 to have more sensitive comparision
     */
    threshold: 0
};

/**
 * Get `platform` property.
 *
 * Reads platform from:
 *  - query param `IBCT_PLATFORM_OVERRIDE` - overrides any detection
 *  - `navigator.userAgent` in form $name-$version-$os, optionally adds query param
 * `IBCT_PLATATFORM_EXTRA`
 *
 * `IBCT_PLATATFORM_EXTRA` is intended to inform about platform properties not detecatble from
 * browser api like "no-gpu" or "headless" or "-nvidia-gtx-whatever".
 */
export function getPlatform(): string {
    let platformExtra: string = "";

    if (typeof window !== "undefined" && window.location) {
        if (window.location.search) {
            const queryParams = querystring.parse(window.location.search.substr(1));
            if (queryParams.IBCT_PLATFORM_OVERRIDE) {
                return queryParams.IBCT_PLATFORM_OVERRIDE as string;
            }
            if (queryParams.IBCT_PLATFORM_EXTRA) {
                platformExtra = queryParams.IBCT_PLATFORM_EXTRA as string;
            }
        }
    }
    const windowOverride: string = (global as any).IBCT_PLATFORM_OVERRIDE;
    if (windowOverride !== undefined) {
        return windowOverride;
    }
    if ((global as any).IBCT_PLATATFORM_EXTRA) {
        platformExtra = (global as any).IBCT_PLATATFORM_EXTRA;
    }

    if (typeof navigator === "undefined") {
        return "nodejs";
    } else {
        // will have platforms like Chrome-69.2.1945-Linux
        const ua = new UAParser(navigator.userAgent);
        let platformParts = [ua.getBrowser().name, ua.getBrowser().version, ua.getOS().name];
        if (platformExtra) {
            platformParts.push(platformExtra);
        }
        platformParts = platformParts
            .filter(str => str !== undefined && str !== "")
            .map(str => str!.replace(/ /g, ""));
        return platformParts.join("-");
    }
}

const domReporter = new DomReporter();
const feedbackServerReporter = new RenderingTestResultReporter("");

let ibctReporter: Reporter = {
    reportImageComparisonResult() {
        const argsArray = Array.prototype.slice.call(arguments);
        domReporter.reportImageComparisonResult.apply(domReporter, argsArray as any);
        feedbackServerReporter.reportImageComparisonResult.apply(
            feedbackServerReporter,
            argsArray as any
        );
    }
};

export function setGlobalReporter(reporter: Reporter) {
    ibctReporter = reporter;
}

export class RenderingTestHelper {
    /**
     * Load image data using cache.
     */
    static cachedLoadImageData(url: string): Promise<ImageData> {
        let p = this.preloadedImageCache.get(url);
        if (p !== undefined) {
            return p;
        }
        p = loadImageData(url);
        this.preloadedImageCache.set(url, p);
        return p;
    }

    private static readonly preloadedImageCache = new Map<string, Promise<ImageData>>();

    constructor(public mochaTest: Mocha.Context, public baseImageProps: TestImageProps) {}

    /**
     * Save actual image only with comparison status OK
     *
     * @param canvas - actual image canvas
     * @param name - test name
     */
    async saveCanvasMatchesReference(canvas: HTMLCanvasElement, name: string) {
        const actualImage = await canvasToImageData(canvas);
        const imageProps = {
            ...this.baseImageProps,
            platform: getPlatform(),
            name
        };
        const result = {
            mismatchedPixels: 0,
            diffImage: actualImage
        };

        ibctReporter.reportImageComparisonResult(
            imageProps,
            actualImage,
            true,
            actualImage,
            result
        );
    }

    /**
     * Compare actual image vs reference image then report comparison result to feedbackServer
     *
     * @param canvas - actual image canvas
     * @param name - test name
     * @param options - test options
     */
    async assertCanvasMatchesReference(
        canvas: HTMLCanvasElement,
        name: string,
        options?: TestOptions
    ) {
        const actualImage = await canvasToImageData(canvas);
        const testOptions = { ...TestOptionsDefaults, ...options };

        const imageProps = {
            ...this.baseImageProps,
            platform: getPlatform(),
            name
        };
        const referenceImageUrl = getReferenceImageUrl(imageProps);

        let referenceImageData: ImageData | undefined;
        try {
            referenceImageData = await RenderingTestHelper.cachedLoadImageData(referenceImageUrl);
        } catch (error) {
            logger.log(`[ERROR[ Reference image ${name} not found. Please update reference data`);
            ibctReporter.reportImageComparisonResult(imageProps, actualImage, false);
            this.mochaTest.skip();
            return;
        }

        const result = compareImages(actualImage, referenceImageData, testOptions);

        ibctReporter.reportImageComparisonResult(
            imageProps,
            actualImage,
            result.mismatchedPixels <= testOptions.maxMismatchedPixels,
            referenceImageData,
            result
        );

        assert.equal(actualImage.height, referenceImageData.height);
        assert.equal(actualImage.width, referenceImageData.width);

        assert.isAtMost(
            result.mismatchedPixels,
            testOptions.maxMismatchedPixels,
            `${result.mismatchedPixels} mismatched pixels, reference image: ${name}`
        );
    }
}

interface WebGlInfo {
    vendor?: string;
    gpu?: string;
}

export function getWebGlInfo() {
    //Enable backward compatibility with three.js <= 0.117
    const renderer = new ((THREE as any).WebGL1Renderer ?? THREE.WebGLRenderer)();
    const context = renderer.getContext();
    const result: WebGlInfo = {};
    const availableExtensions = context.getSupportedExtensions();
    if (
        availableExtensions !== null &&
        availableExtensions.indexOf("WEBGL_debug_renderer_info") > -1
    ) {
        const infoExtension = context.getExtension("WEBGL_debug_renderer_info");
        if (infoExtension !== null) {
            result.vendor = context.getParameter(infoExtension.UNMASKED_VENDOR_WEBGL);
            result.gpu = context.getParameter(infoExtension.UNMASKED_RENDERER_WEBGL);
        }
    }
    renderer.dispose();
    return result;
}

try {
    logger.log("WebGlInfo", getWebGlInfo());
} catch {
    logger.warn("WebGL is not supported on this machine");
}
