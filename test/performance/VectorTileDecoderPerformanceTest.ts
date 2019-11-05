/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions

import { assert } from "chai";

import { Theme } from "@here/harp-datasource-protocol";
import { MapEnv, StyleSetEvaluator } from "@here/harp-datasource-protocol/index-decoder";
import { accessToken } from "@here/harp-examples/config";
import { sphereProjection, TileKey, webMercatorProjection } from "@here/harp-geoutils";
import { ThemeLoader } from "@here/harp-mapview";
import { getTestResourceUrl } from "@here/harp-test-utils/index.web";
import { measurePerformanceSync } from "@here/harp-test-utils/lib/ProfileHelper";
import {
    APIFormat,
    VectorTileRestClient,
    VectorTileRestClientParameters
} from "@here/harp-vectortile-datasource";
import {
    IGeometryProcessor,
    ILineGeometry,
    IPolygonGeometry
} from "@here/harp-vectortile-datasource/lib/IGeometryProcessor";
import { VectorTileProtobufDataAdapter } from "@here/harp-vectortile-datasource/lib/VectorTileData";
import { VectorDecoder } from "@here/harp-vectortile-datasource/lib/VectorTileDecoder";

export interface VectortileDecoderPerformanceTestOptions {
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
     * Requires settings for [[VectorTileRestClient]] to download tiles.
     */
    vectorTileRestClientOptions: VectorTileRestClientParameters;
}

/**
 * Create tests that downloads some vector tiles from real datasource, then decodes them using
 * particular style.
 *
 * @see VectorTileDecoderPerformanceTestOptions
 */
export function createVectorTileDecoderPerformanceTest(
    name: string,
    options: VectortileDecoderPerformanceTestOptions
) {
    const repeats = options.repeats || 10;
    const styleSetName = options.styleSetName || "tilezen";
    describe(`VectorTileDecoderPerformanceTest - ${name}`, function() {
        this.timeout(0);
        let vectorTiles: Array<[TileKey, ArrayBuffer]>;
        let theme: Theme;

        before(async function() {
            this.timeout(10000);
            const vtDataProvider = new VectorTileRestClient(options.vectorTileRestClientOptions);

            await vtDataProvider.connect();
            assert(vtDataProvider.ready());
            vectorTiles = await Promise.all(
                options.tiles.map(async mortonCode => {
                    const tileKey = TileKey.fromMortonCode(mortonCode);
                    const tile = await vtDataProvider.getTile(tileKey);
                    assert(tile instanceof ArrayBuffer);
                    return [tileKey, tile as ArrayBuffer] as [TileKey, ArrayBuffer];
                })
            );

            theme = await ThemeLoader.load(options.theme);
            assert.isObject(theme.styles);
            assert.isArray(theme.styles![styleSetName]);
        });

        it(`measure feature matching time`, async () => {
            const counterName = `VectorTileDecoderPerformanceTest-${name} styleMatchOnly`;
            this.timeout(0);

            const styleSetEvaluator = new StyleSetEvaluator(
                theme.styles![styleSetName],
                theme.definitions
            );

            const geometryProcessor: IGeometryProcessor = {
                storageLevelOffset: 0,

                processPointFeature(
                    layerName: string,
                    layerExtents: number,
                    geometry: THREE.Vector2[],
                    env: MapEnv
                ) {
                    styleSetEvaluator.getMatchingTechniques(env, layerName, "point");
                },
                processLineFeature(
                    layerName: string,
                    layerExtents: number,
                    geometry: ILineGeometry[],
                    env: MapEnv
                ) {
                    styleSetEvaluator.getMatchingTechniques(env, layerName, "line");
                },

                processPolygonFeature(
                    layerName: string,
                    layerExtents: number,
                    geometry: IPolygonGeometry[],
                    env: MapEnv
                ) {
                    styleSetEvaluator.getMatchingTechniques(env, layerName, "polygon");
                }
            };

            await measurePerformanceSync(counterName, repeats, function() {
                for (const [tileKey, tileData] of vectorTiles) {
                    const decoder = new VectorTileProtobufDataAdapter(geometryProcessor, undefined);
                    decoder.process(tileData, tileKey);
                }
            });
        });

        it(`measure decode time - webMercator`, async () => {
            const counterName = `VectorTileDecoderPerformanceTest-${name} webMercator`;
            this.timeout(0);

            const projection = webMercatorProjection;

            const styleSetEvaluator = new StyleSetEvaluator(
                theme.styles![styleSetName],
                theme.definitions
            );

            await measurePerformanceSync(counterName, repeats, function() {
                for (const [tileKey, tileData] of vectorTiles) {
                    const decoder = new VectorDecoder(projection, styleSetEvaluator, false);
                    decoder.getDecodedTile(tileKey, tileData);
                }
            });
        });

        it(`measure decode time - sphereProjection`, async () => {
            this.timeout(0);

            const counterName = `VectorTileDecoderPerformanceTest-${name} sphere`;

            const projection = sphereProjection;

            const styleSetEvaluator = new StyleSetEvaluator(
                theme.styles![styleSetName],
                theme.definitions
            );

            await measurePerformanceSync(counterName, repeats, function() {
                for (const [tileKey, tileData] of vectorTiles) {
                    const decoder = new VectorDecoder(projection, styleSetEvaluator, false);
                    decoder.getDecodedTile(tileKey, tileData);
                }
            });
        });
    });
}

const BERLIN_CENTER_TILES = [371506851, 371506850, 371506849, 371506848];

createVectorTileDecoderPerformanceTest("theme=berlin tiles=4 region=berlin data=herebase", {
    theme: getTestResourceUrl("@here/harp-map-theme", "resources/berlin_tilezen_base.json"),
    tiles: BERLIN_CENTER_TILES,
    vectorTileRestClientOptions: {
        baseUrl: "https://xyz.api.here.com/tiles/herebase.02",
        apiFormat: APIFormat.XYZOMV,
        authenticationCode: accessToken
    }
});

createVectorTileDecoderPerformanceTest("theme=berlin tiles=4 region=berlin data=osmbase", {
    theme: getTestResourceUrl("@here/harp-map-theme", "resources/berlin_tilezen_base.json"),
    tiles: BERLIN_CENTER_TILES,
    vectorTileRestClientOptions: {
        baseUrl: "https://xyz.api.here.com/tiles/osmbase/256/all",
        apiFormat: APIFormat.XYZMVT,
        authenticationCode: accessToken
    }
});

const NEW_YORK_TILES = [
    327439127,
    327439124,
    327439125,
    327439168,
    327439170,

    327438781,
    327438783,
    327438826,
    327438782,
    327438824
];

createVectorTileDecoderPerformanceTest("theme=berlin tiles=10 region=ny data=herebase", {
    theme: getTestResourceUrl("@here/harp-map-theme", "resources/berlin_tilezen_base.json"),
    tiles: NEW_YORK_TILES,
    vectorTileRestClientOptions: {
        baseUrl: "https://xyz.api.here.com/tiles/herebase.02",
        apiFormat: APIFormat.XYZOMV,
        authenticationCode: accessToken
    }
});

createVectorTileDecoderPerformanceTest("theme=berlin tiles=10 region=ny data=osmbase", {
    theme: getTestResourceUrl("@here/harp-map-theme", "resources/berlin_tilezen_base.json"),
    tiles: NEW_YORK_TILES,
    vectorTileRestClientOptions: {
        baseUrl: "https://xyz.api.here.com/tiles/osmbase/256/all",
        apiFormat: APIFormat.XYZMVT,
        authenticationCode: accessToken
    }
});
