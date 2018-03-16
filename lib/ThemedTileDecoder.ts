/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s).
 * All rights reserved.
 *
 * This software and other materials contain proprietary information
 * controlled by HERE and are protected by applicable copyright legislation.
 * Any use and utilization of this software and other materials and
 * disclosure to any third parties is conditional upon having a separate
 * agreement with HERE for the access, use, utilization or disclosure of this
 * software. In the absence of such agreement, the use of the software is not
 * allowed.
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

export abstract class ThemedTileDecoder implements ITileDecoder {
    private theme?: Theme;
    private themeEvaluators: Map<string, ThemeEvaluator> = new Map();

    abstract connect(): Promise<void>;

    decodeTile(
        data: ArrayBufferLike,
        tileKey: TileKey,
        dataSourceName: string,
        projection: Projection
    ): Promise<DecodedTile> {
        const themeEvaluator = this.getThemeEvalator(dataSourceName);
        if (themeEvaluator === undefined) {
            return Promise.reject(new Error('no theme loaded'));
        }

        return this.decodeThemedTile(data, tileKey, themeEvaluator, projection);
    }

    getTileInfo(
        data: ArrayBufferLike,
        tileKey: TileKey,
        dataSourceName: string,
        projection: Projection
    ): Promise<TileInfo|undefined> {
        return Promise.resolve(undefined);
    }

    configure(theme?: Theme | undefined, options?: OptionsMap | undefined): void {
        this.theme = theme;
        this.themeEvaluators.clear();
    }

    abstract decodeThemedTile(
        data: ArrayBufferLike,
        tileKey: TileKey,
        themeEvaluator: ThemeEvaluator,
        projection: Projection
    ): Promise<DecodedTile>;

    protected getThemeEvalator(dataSourceName: string): ThemeEvaluator | undefined {
        if (this.theme === undefined) {
            return undefined;
        }
        let themeEvaluator = this.themeEvaluators.get(dataSourceName);
        if (themeEvaluator === undefined) {
            themeEvaluator = new ThemeEvaluator(this.theme, dataSourceName);
            this.themeEvaluators.set(dataSourceName, themeEvaluator);
        }
        return themeEvaluator;
    }
}
