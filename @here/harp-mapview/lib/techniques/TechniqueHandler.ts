/*
 * Copyright (C) 2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Env,
    Expr,
    Geometry,
    Group,
    IndexedTechnique,
    PoiGeometry,
    Technique,
    TextGeometry,
    TextPathGeometry,
    Value
} from "@here/harp-datasource-protocol";
import { TechniqueByName } from "@here/harp-datasource-protocol/lib/TechniqueDescriptor";
import { ViewRanges } from "@here/harp-datasource-protocol/lib/ViewRanges";
import { Projection } from "@here/harp-geoutils";
import { TextElement } from "../text/TextElement";
import { Tile } from "../Tile";

export interface TechniqueUpdateContext {
    /**
     * Current frame number.
     *
     * Use to skip re-evaluation of properties that are stable across frame.
     */
    frameNumber: number;

    /**
     * Current [[ViewRanges]].
     *
     * Used to calculate actual fading params of materials.
     */
    viewRanges: ViewRanges;

    /**
     * Projection used current [[MapView]].
     */
    projection: Projection;

    /**
     * Expression evaluation environment containing variable bindings.
     */
    env: Env;

    /**
     * Optional, cache of expression results.
     *
     * @see [[Expr.evaluate]]
     */
    cachedExprResults?: Map<Expr, Value>;
}

export type TechniqueUpdater = (context: TechniqueUpdateContext) => void;

export interface TileObjectEntry<T> {
    tile: Tile;
    object: T;
}

export type TileWorldSpaceEntry = TileObjectEntry<THREE.Object3D>;
export type TileScreenSpaceEntry = TileObjectEntry<TextElement>;

export interface TechniqueHandler {
    technique: Technique;

    isDynamic: boolean;

    /**
     * Update dynamic properties of objects (material, text styles, visibilty status, etc.)
     * managed by this technique.
     *
     * @param context
     */
    update(context: TechniqueUpdateContext): void;

    /**
     * Dispose of resources managed by this technique.
     */
    dispose(): void;

    addWorldSpaceObject(tile: Tile, srcGeometry: Geometry, group: Group): THREE.Object3D[];

    addScreenSpaceObject(
        tile: Tile,
        text: TextGeometry | TextPathGeometry | PoiGeometry
    ): TextElement[];

    /**
     * Unregister tile objects associated with particular [[Tile]] instance.
     */
    removeTileObjects(tile: Tile): void;
}

export class TechniqueHandlerSet {
    readonly techniqueHandlers: TechniqueHandler[] = [];
    readonly dynamicTechniqueHandlers: TechniqueHandler[] = [];

    constructor(readonly tile: Tile) {}

    getTechniqueHandler(
        technique: IndexedTechnique,
        fallbackHandler?: TechniqueHandlerConstructor
    ) {
        const tile = this.tile;
        let techniqueHandler = this.techniqueHandlers[technique._index];
        if (techniqueHandler === undefined) {
            techniqueHandler = tile.mapView.techniqueHandlerPool.getTechniqueHandler(
                technique as IndexedTechnique,
                tile,
                tile.mapView.techniqueUpdateContext,
                fallbackHandler
            );
            if (techniqueHandler.isDynamic) {
                this.dynamicTechniqueHandlers.push(techniqueHandler);
            }
            this.techniqueHandlers[technique._index] = techniqueHandler;
        }
        return techniqueHandler;
    }

    update(context: TechniqueUpdateContext) {
        for (const techniqueHandler of this.dynamicTechniqueHandlers) {
            techniqueHandler.update(context);
        }
    }

    clear() {
        for (const techniqueHandler of this.techniqueHandlers) {
            techniqueHandler.removeTileObjects(this.tile);
        }
        this.techniqueHandlers.length = 0;
    }
}

export interface TechniqueHandlerStatics<T extends Technique> {
    getSharingKey?: (technique: T & IndexedTechnique, tile: Tile) => Value[] | undefined;
}

export type TechniqueHandlerConstructor<T extends Technique = Technique> = (new (
    technique: T,
    tile: Tile,
    context: TechniqueUpdateContext
) => TechniqueHandler) &
    TechniqueHandlerStatics<T>;

export type TechniqueHandlerRegistry = {
    [P in Technique["name"]]?: TechniqueHandlerConstructor<TechniqueByName<P>>;
};

export const techniqueHandlers: TechniqueHandlerRegistry = {};
