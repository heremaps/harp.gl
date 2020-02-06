/*
 * Copyright (C) 2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import {
    Expr,
    Geometry,
    Group,
    isExtrudedLineTechnique,
    isLineTechnique,
    isSegmentsTechnique,
    Technique
} from "@here/harp-datasource-protocol";
import { getObjectConstructor } from "../DecodedTileHelpers";
import { Tile } from "../Tile";
import { TechniqueUpdateContext } from "./TechniqueHandler";
import { TechniqueHandlerCommon, WorldSpaceTechniqueHandlerBase } from "./TechniqueHandlerCommon";

/**
 * Generic world space technique handler.
 *
 * Fallback to create objects for "generic" techniques that doesn't need special handling.
 *
 * Responsible for creation of materials and scene objects for this technique as well as updating,
 * them if they are dynamic.
 *
 * Supported for [[ExtrudedLineTechnique]], [[LineTechnique]], [[SegmentsTechnique]].
 *
 * Supports fading features and color & opactity interpolation and hiding of completly transparent
 * objects.
 */
export class GenericWorldSpaceTechniqueHandler extends WorldSpaceTechniqueHandlerBase<Technique> {
    material: THREE.Material;

    constructor(technique: Technique, tile: Tile, context: TechniqueUpdateContext) {
        super(technique, tile.mapView);
        this.material = this.createMaterial(technique, context);

        const fadingParams = TechniqueHandlerCommon.getFadingParams(technique, context.env);
        if (TechniqueHandlerCommon.isFadingFeatureEnabled(fadingParams)) {
            this.updaters.push(
                TechniqueHandlerCommon.updateFadingParams.bind(
                    undefined,
                    this.material,
                    fadingParams
                )
            );
        }

        if (
            isLineTechnique(technique) ||
            isSegmentsTechnique(technique) ||
            isExtrudedLineTechnique(technique)
        ) {
            if (Expr.isExpr(technique.color) || Expr.isExpr(technique.opacity)) {
                this.updaters.push(
                    TechniqueHandlerCommon.updateBaseColor.bind(
                        undefined,
                        this.material as any,
                        this.objects,
                        technique
                    )
                );
            }
        }
    }

    /**
     * @override
     */
    addWorldSpaceObject(tile: Tile, srcGeometry: Geometry, group?: Group) {
        const ObjectConstructor = getObjectConstructor(this.technique);
        if (ObjectConstructor === undefined) {
            throw new Error(`Unknown technique ${this.technique.name}`);
        }
        const object = this.createObject(
            tile,
            srcGeometry,
            group,
            ObjectConstructor,
            this.material
        );

        TechniqueHandlerCommon.setupUserData(srcGeometry, this.technique, object);

        return [object];
    }
}
