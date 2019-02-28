/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    DecodedTile,
    ITileDecoder,
    OptionsMap,
    StyleSet,
    StyleSetEvaluator,
    TileInfo
} from "@here/harp-datasource-protocol";
import { Projection, TileKey } from "@here/harp-geoutils";

/**
 * `ThemedTileDecoder` implements an [[ITileDecoder]] which uses a [[Theme]] to apply styles to the
 * objects displayed in the map.
 *
 * By default, decoders are executed in web workers (using [[TileDecoderService]]) for performance
 * reasons.
 */
export abstract class ThemedTileDecoder implements ITileDecoder {
    languages?: string[];
    protected m_styleSetEvaluator?: StyleSetEvaluator;
    private m_connectResolver?: () => void;
    private m_styleSetReady: Promise<void>;

    constructor() {
        this.m_styleSetReady = new Promise<void>(resolve => {
            this.m_connectResolver = resolve;
        });
    }
    abstract connect(): Promise<void>;

    dispose() {
        // implemented in subclasses
    }

    async decodeTile(
        data: ArrayBufferLike,
        tileKey: TileKey,
        projection: Projection,
        displayZoomLevel?: number
    ): Promise<DecodedTile> {
        await this.m_styleSetReady;

        if (this.m_styleSetEvaluator === undefined) {
            return Promise.reject(new Error("No style is defined"));
        }

        return this.decodeThemedTile(
            data,
            tileKey,
            this.m_styleSetEvaluator,
            projection,
            displayZoomLevel
        );
    }

    // tslint:disable:no-unused-variable
    getTileInfo(
        data: ArrayBufferLike,
        tileKey: TileKey,
        projection: Projection,
        displayZoomLevel?: number
    ): Promise<TileInfo | undefined> {
        return Promise.resolve(undefined);
    }

    // tslint:disable:no-unused-variable
    configure(styleSet?: StyleSet, languages?: string[], options?: OptionsMap): void {
        if (styleSet !== undefined) {
            this.m_styleSetEvaluator = new StyleSetEvaluator(styleSet);

            if (this.m_connectResolver) {
                this.m_connectResolver();

                this.m_connectResolver = undefined;
            }
        }
        if (languages !== undefined) {
            this.languages = languages;
        }
    }

    /**
     * Create a [[DecodedTile]] from binary tile data and a theme description in form of a
     * [[StyleSetEvaluator]].
     *
     * @param data Binary data in form of [[ArrayBufferLike]], or any object.
     * @param tileKey Quadtree address of tile.
     * @param styleSetEvaluator Processor of [[Theme]], identifies styling techniques applicable to
     *      individual objects.
     * @param projection Projection used by the individual data sources.
     */
    abstract decodeThemedTile(
        data: ArrayBufferLike | {},
        tileKey: TileKey,
        styleSetEvaluator: StyleSetEvaluator,
        projection: Projection,
        displayZoomLevel?: number
    ): Promise<DecodedTile>;
}
