/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { DecodedTile, Definitions, OptionsMap, StyleSet } from "@here/harp-datasource-protocol";
import { StyleSetEvaluator } from "@here/harp-datasource-protocol/index-decoder";
import { Projection, TileKey } from "@here/harp-geoutils";
import { ThemedTileDecoder } from "@here/harp-mapview-decoder/index-worker";
import { PerformanceTimer } from "@here/harp-utils";
import { VectorTileGeometryProcessor } from "./VectorTileGeometryProcessor";

/**
 * Internal interface for options passed from the [[VectorTileDataSource]] to the decoder.
 *
 * @hidden
 */
export interface VectorTileDecoderOptions {
    /**
     * If true, features that have no technique in the theme will be printed to the console (can be
     * excessive!).
     */
    showMissingTechniques?: boolean;

    /**
     * Gather feature attributes from [[OmvData]]. Defaults to false.
     */
    gatherFeatureAttributes?: boolean;

    /**
     * Optional storage level offset for [[Tile]]s. Default is -2.
     */
    storageLevelOffset?: number;

    /**
     * If not set to `false` very short text labels will be skipped during decoding based on a
     * heuristic.
     */
    skipShortLabels?: boolean;

    enableElevationOverlay?: boolean;
}

export class VectorTileDecoder extends ThemedTileDecoder {
    private m_options: VectorTileDecoderOptions | undefined;

    /** @override */
    connect(): Promise<void> {
        return Promise.resolve();
    }

    /** @override */
    decodeThemedTile(
        data: ArrayBufferLike,
        tileKey: TileKey,
        styleSetEvaluator: StyleSetEvaluator,
        projection: Projection
    ): Promise<DecodedTile> {
        const startTime = PerformanceTimer.now();

        const decoder = new VectorTileGeometryProcessor(
            projection,
            styleSetEvaluator,
            this.languages,
            this.m_options
        );

        const decodedTile = decoder.getDecodedTile(tileKey, data);

        decodedTile.decodeTime = PerformanceTimer.now() - startTime;

        return Promise.resolve(decodedTile);
    }

    /** @override */
    configure(
        styleSet: StyleSet,
        definitions?: Definitions,
        languages?: string[],
        options?: OptionsMap
    ): void {
        super.configure(styleSet, definitions, languages, options);

        if (options) {
            this.m_options = options;
        }

        if (this.languages) {
            this.languages = languages;
        }
    }
}
