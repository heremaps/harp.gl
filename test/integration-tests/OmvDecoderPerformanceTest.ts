/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions

import { assert } from "chai";

import { getProjection, Theme } from "@here/harp-datasource-protocol";
import { StyleSetEvaluator } from "@here/harp-datasource-protocol/index-decoder";
import { accessToken } from "@here/harp-examples/config";
import { TileKey } from "@here/harp-geoutils";
import { ThemeLoader } from "@here/harp-mapview";
import { APIFormat, OmvRestClient, OmvRestClientParameters } from "@here/harp-omv-datasource";
import { OmvDecoder } from "@here/harp-omv-datasource/lib/OmvDecoder";
import { StyleSetDataFilter } from "@here/harp-omv-datasource/lib/StyleSetDataFilter";
import {
    addPerformanceResultsSample,
    getCurrentTime,
    getTestResourceUrl,
    measurePerformanceSync
} from "@here/harp-test-utils/index.web";

export interface OMVDecoderPerformanceTestOptions {
    /**
     *
     */
    repeats?: number;
    /**
     * Theme url or object.
     *
     * Will be resolved using [[ThemeLoader.load]].
     */
    theme: Theme | string;

    /**
     * Styleset name, defaults to `tilezen`.
     */
    styleSetName?: string;

    /**
     * Morton codes of tiles.
     */
    tiles: number[];

    /**
     * Requires settings for [[OmvRestClient]] to download tiles.
     */
    omvRestClientOptions: OmvRestClientParameters;
}

/**
 * Create tests that downloads some OMV tiles from real datasource, then decodes them using
 * particular style.
 *
 * @see OMVDecoderPerformanceTestOptions
 */
export function createOMVDecoderPerformanceTest(
    name: string,
    options: OMVDecoderPerformanceTestOptions
) {
    const repeats = options.repeats || 4;
    const styleSetName = options.styleSetName || "tilezen";
    describe(`OMVDecoderPerformanceTest - ${name}`, function() {
        this.timeout(15000);
        let omvTiles: Array<[TileKey, ArrayBuffer]>;
        let theme: Theme;

        const counterName = `OMVDecoderPerformanceTest-${name}`;
        before(async function() {
            this.timeout(4000);
            const omvDataProvider = new OmvRestClient(options.omvRestClientOptions);

            await omvDataProvider.connect();
            assert(omvDataProvider.ready());
            omvTiles = await Promise.all(
                options.tiles.map(async mortonCode => {
                    const tileKey = TileKey.fromMortonCode(mortonCode);
                    const tile = await omvDataProvider.getTile(tileKey);
                    assert(tile instanceof ArrayBuffer);
                    return [tileKey, tile as ArrayBuffer] as [TileKey, ArrayBuffer];
                })
            );

            theme = await ThemeLoader.load(options.theme);
            assert.isObject(theme.styles);
            assert.isArray(theme.styles![styleSetName]);
        });

        it(`measure decode time OPTIMIZED`, async () => {
            this.timeout(4000);
            const projection = getProjection("mercator");

            const styleSetEvaluator = new StyleSetEvaluator(
                theme.styles![styleSetName],
                theme.definitions,
                true
            );

            //const decoder = new OmvTileDecoder();
            // decoder.configure(theme.styles!.tilezen, theme.definitions);
            measurePerformanceSync(`${counterName} OPTIMIZED-SSE`, repeats, function() {
                for (const [tileKey, tileData] of omvTiles) {
                    const decoder = new OmvDecoder(projection, styleSetEvaluator, false);
                    const startTime = getCurrentTime();
                    decoder.getDecodedTile(tileKey, tileData);

                    const decodeTime = getCurrentTime() - startTime;
                    addPerformanceResultsSample(
                        `decode-optimized/${tileKey.mortonCode()}`,
                        decodeTime
                    );
                }
            });
        });

        it(`measure decode time OPTIMIZED-SSE+FILTER`, async () => {
            this.timeout(4000);
            const projection = getProjection("mercator");

            const styleSetEvaluator = new StyleSetEvaluator(
                theme.styles![styleSetName],
                theme.definitions,
                true
            );

            const styleSetDataFilter = new StyleSetDataFilter(styleSetEvaluator);

            measurePerformanceSync(`${counterName} OPTIMIZED-SSE+FILTER`, repeats, function() {
                for (const [tileKey, tileData] of omvTiles) {
                    const decoder = new OmvDecoder(
                        projection,
                        styleSetEvaluator,
                        false,
                        styleSetDataFilter
                    );
                    const startTime = getCurrentTime();
                    decoder.getDecodedTile(tileKey, tileData);
                    const decodeTime = getCurrentTime() - startTime;
                    addPerformanceResultsSample(
                        `decode-optimized2/${tileKey.mortonCode()}`,
                        decodeTime
                    );
                }
            });
        });

        it(`measure decode time UNOPTIMIZED`, async () => {
            this.timeout(6000);
            const projection = getProjection("mercator");

            const styleSetEvaluator = new StyleSetEvaluator(
                theme.styles![styleSetName],
                theme.definitions,
                false
            );

            //const decoder = new OmvTileDecoder();
            // decoder.configure(theme.styles!.tilezen, theme.definitions);
            measurePerformanceSync(`${counterName} BASELINE`, repeats, function() {
                for (const [tileKey, tileData] of omvTiles) {
                    const decoder = new OmvDecoder(projection, styleSetEvaluator, false);
                    const startTime = getCurrentTime();
                    decoder.getDecodedTile(tileKey, tileData);

                    const decodeTime = getCurrentTime() - startTime;
                    addPerformanceResultsSample(
                        `decode-original/${tileKey.mortonCode()}`,
                        decodeTime
                    );
                }
            });
        });
    });
}

createOMVDecoderPerformanceTest("theme=berlin tiles=3 data=herebase", {
    theme: getTestResourceUrl("@here/harp-map-theme", "resources/berlin_tilezen_base.json"),
    tiles: [371506851, 371506850],
    omvRestClientOptions: {
        baseUrl: "https://xyz.api.here.com/tiles/herebase.02",
        apiFormat: APIFormat.XYZOMV,
        authenticationCode: accessToken
    }
});

createOMVDecoderPerformanceTest("theme=berlin tiles=3 data=osmbase", {
    theme: getTestResourceUrl("@here/harp-map-theme", "resources/berlin_tilezen_base.json"),
    tiles: [371506851, 371506850],
    omvRestClientOptions: {
        baseUrl: "https://xyz.api.here.com/tiles/osmbase/256/all",
        apiFormat: APIFormat.XYZMVT,

        authenticationCode: accessToken
    }
});
