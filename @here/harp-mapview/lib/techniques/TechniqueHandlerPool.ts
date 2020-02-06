/*
 * Copyright (C) 2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { IndexedTechnique, Value } from "@here/harp-datasource-protocol";
import { CompoundKeyMapBasic } from "@here/harp-utils";
import { Tile } from "../Tile";
import {
    defaultSharingKey,
    TechniqueHandler,
    TechniqueHandlerConstructor,
    techniqueHandlers,
    TechniqueUpdateContext
} from "./TechniqueHandler";

import "./ExtrudedPolygonTechniqueHandler";
import "./FillTechniqueHandler";
import "./PointTechniqueHandler";
import "./SolidLineTechniqueHandler";
import "./TerrainTechniqueHandler";

/**
 * [[TechniqueHandler]] pool and manager.
 *
 * Responsible for creation, pooling and sharing of [[TechniqueHandler]]s for one theme.
 */
export class TechniqueHandlerPool {
    /**
     * First level
     *  - indexed by `_styleSetIndex`
     */
    private pool: Map<number, CompoundKeyMapBasic<TechniqueHandler>> = new Map();

    constructor() {
        /** no op */
    }

    /**
     * Get [[TechniqueHandler]] for particular [[Technique]] and [[Tile]].
     *
     * May return shared instances if it's possible for this technique and tile.
     *
     * @returns instanceof [[TechniqueHandler]] that shall be used to contruct geometries for
     *     `technique` on `tile`
     * @throws if `fallbackHandler` was not given and [[techniqueHandlers]] doesn't contain
     * registered [[TechniqueHandlerConstructor]] for `technique`
     */
    getTechniqueHandler(
        technique: IndexedTechnique,
        tile: Tile,
        context: TechniqueUpdateContext,
        fallbackHandler?: TechniqueHandlerConstructor
    ): TechniqueHandler {
        const techniqueHandlerCtor =
            ((techniqueHandlers[technique.name] as unknown) as TechniqueHandlerConstructor) ??
            fallbackHandler;
        if (!techniqueHandlerCtor) {
            throw new Error(`unknown technique ${technique.name}`);
        }

        let handler: TechniqueHandler | undefined;

        const key = this.getSharingKey(technique, tile, techniqueHandlerCtor);
        let techniqueVariantMap: CompoundKeyMapBasic<TechniqueHandler> | undefined;
        if (key !== undefined) {
            techniqueVariantMap = this.pool.get(technique._styleSetIndex);
            if (techniqueVariantMap === undefined) {
                techniqueVariantMap = new CompoundKeyMapBasic();
                this.pool.set(technique._styleSetIndex, techniqueVariantMap);
            }
            handler = techniqueVariantMap.getOrCreate(
                key,
                () => new techniqueHandlerCtor(technique, tile, context)
            );
        } else {
            handler = new techniqueHandlerCtor(technique, tile, context);
        }

        return handler as TechniqueHandler;
    }

    /**
     * Reset this handler.
     *
     * Removes all cached technique handlers from pool and marks them as ready to release resources.
     */
    reset() {
        for (const techniqueVariantMap of this.pool.values()) {
            techniqueVariantMap.forEach(techniqueHandler => {
                techniqueHandler.dispose();
            });
        }
        this.pool.clear();
    }

    private getSharingKey(
        technique: IndexedTechnique,
        tile: Tile,
        techniqueHandlerClass: TechniqueHandlerConstructor
    ): Value[] | undefined {
        if (typeof techniqueHandlerClass.getSharingKey === "function") {
            const compoundKey = techniqueHandlerClass.getSharingKey(technique, tile);
            if (compoundKey === undefined) {
                return undefined;
            }
            return compoundKey;
        } else {
            return defaultSharingKey(technique);
        }
    }
}
