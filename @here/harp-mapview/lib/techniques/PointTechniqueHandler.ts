/*
 * Copyright (C) 2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import {
    CirclesTechnique,
    Expr,
    Geometry,
    Group,
    isCirclesTechnique,
    SquaresTechnique
} from "@here/harp-datasource-protocol";
import { CirclePointsMaterial } from "@here/harp-materials";
import { assert } from "@here/harp-utils";
import { Circles, Squares } from "../MapViewPoints";
import { Tile } from "../Tile";
import { techniqueHandlers, TechniqueUpdateContext } from "./TechniqueHandler";
import { TechniqueHandlerCommon, WorldSpaceTechniqueHandlerBase } from "./TechniqueHandlerCommon";

type PointTechnique = CirclesTechnique | SquaresTechnique;

/**
 * [[CirclesTechnique]] and [[SquaresTechnique]] rendering handler.
 *
 * Responsible for creation of materials and scene objects for this technique as well as updating
 * them if they are dynamic.
 */
export class PointTechniqueHandler extends WorldSpaceTechniqueHandlerBase<PointTechnique> {
    material: CirclePointsMaterial | THREE.PointsMaterial;

    constructor(technique: PointTechnique, tile: Tile, context: TechniqueUpdateContext) {
        super(technique, tile.mapView);
        this.material = this.createMaterial(technique, context) as
            | CirclePointsMaterial
            | THREE.PointsMaterial;
        assert(
            this.material instanceof CirclePointsMaterial ||
                this.material instanceof THREE.PointsMaterial
        );

        if (Expr.isExpr(technique.color) || Expr.isExpr(technique.opacity)) {
            this.updaters.push(
                TechniqueHandlerCommon.updateBaseColor.bind(
                    undefined,
                    this.material,
                    this.objects,
                    technique
                )
            );
        }
    }

    /**
     * @override
     */
    addWorldSpaceObject(tile: Tile, srcGeometry: Geometry, group?: Group) {
        const ObjectConstructor = isCirclesTechnique(this.technique) ? Circles : Squares;
        const object = this.createObject(
            tile,
            srcGeometry,
            group,
            ObjectConstructor,
            this.material
        );

        if (this.technique.enablePicking !== undefined) {
            object.enableRayTesting = this.technique.enablePicking;
        }

        TechniqueHandlerCommon.setupUserData(srcGeometry, this.technique, object);

        return [object];
    }
}

techniqueHandlers.squares = PointTechniqueHandler;
techniqueHandlers.circles = PointTechniqueHandler;
