/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */
import {
    DecodedTile,
    ITileDecoder,
    OptionsMap,
    Theme,
    ThemeEvaluator,
    TileInfo
} from "@here/datasource-protocol";
import { Projection, TileKey } from "@here/geoutils";

/**
 * `ThemedTileDecoder` implements an [[ITileDecoder]] which uses a [[Theme]] to apply styles to the
 * objects displayed in the map.
 *
 * By default, decoders are executed in web workers (using [[TileDecoderService]]) for performance
 * reasons.
 */
export abstract class ThemedTileDecoder implements ITileDecoder {
    private m_theme?: Theme;
    private m_themeEvaluators: Map<string, ThemeEvaluator> = new Map();

    abstract connect(): Promise<void>;

    dispose() {
        // implemented in subclasses
    }

    decodeTile(
        data: ArrayBufferLike,
        tileKey: TileKey,
        dataSourceName: string,
        projection: Projection
    ): Promise<DecodedTile> {
        const themeEvaluator = this.getThemeEvalator(dataSourceName);
        if (themeEvaluator === undefined) {
            return Promise.reject(new Error("no theme loaded"));
        }

        return this.decodeThemedTile(data, tileKey, themeEvaluator, projection);
    }

    getTileInfo(
        _data: ArrayBufferLike,
        _tileKey: TileKey,
        _dataSourceName: string,
        _projection: Projection
    ): Promise<TileInfo | undefined> {
        return Promise.resolve(undefined);
    }

    configure(theme?: Theme | undefined, _options?: OptionsMap | undefined): void {
        if (theme !== undefined) {
            this.m_theme = theme;
            this.m_themeEvaluators.clear();
        }
    }

    /**
     * Create a [[DecodedTile]] from binary tile data and a theme description in form of a
     * [[ThemeEvaluator]].
     *
     * @param data Binary data in form of [[ArrayBufferLike]], or any object.
     * @param tileKey Quadtree address of tile.
     * @param themeEvaluator Processor of [[Theme]], identifies styling techniques applicable to
     *      individual objects.
     * @param projection Projection used by the individual data sources.
     */
    abstract decodeThemedTile(
        data: ArrayBufferLike | {},
        tileKey: TileKey,
        themeEvaluator: ThemeEvaluator,
        projection: Projection
    ): Promise<DecodedTile>;

    /**
     * Create and deliver an individual [[ThemeEvaluator]] for every [[DataSource]] this
     * `ThemedTileDecoder` is connected to.
     *
     * @param dataSourceName Name of [[DataSource]]
     */
    protected getThemeEvalator(dataSourceName: string): ThemeEvaluator | undefined {
        if (this.m_theme === undefined) {
            return undefined;
        }
        let themeEvaluator = this.m_themeEvaluators.get(dataSourceName);
        if (themeEvaluator === undefined) {
            themeEvaluator = new ThemeEvaluator(this.m_theme, dataSourceName);
            this.m_themeEvaluators.set(dataSourceName, themeEvaluator);
        }
        return themeEvaluator;
    }
}
