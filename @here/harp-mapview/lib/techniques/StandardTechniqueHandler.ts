/*
 * Copyright (C) 2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import { Expr, Geometry, Group, StandardTechnique } from "@here/harp-datasource-protocol";
import { MapMeshStandardMaterial } from "@here/harp-materials";
import { assert } from "@here/harp-utils";
import { applySecondaryColorToMaterial } from "../DecodedTileHelpers";
import { Tile } from "../Tile";
import { techniqueHandlers, TechniqueUpdateContext } from "./TechniqueHandler";
import { TechniqueHandlerCommon, WorldSpaceTechniqueHandlerBase } from "./TechniqueHandlerCommon";

/**
 * [[StandardTechnique]] rendering handler.
 *
 * Responsible for creation of materials and scene objects for this technique as well as updating
 * them if they are dynamic.
 *
 * Shareable for same techniques (and tile level if clipping is anabled and projection is planar).
 *
 * TODO: This almost same as [[GenericWorldSpaceTechniqueHandler]] module emissive ...
 */
export class StandardTechniqueHandler extends WorldSpaceTechniqueHandlerBase<StandardTechnique> {
    private mainMaterial: MapMeshStandardMaterial;

    constructor(technique: StandardTechnique, tile: Tile, context: TechniqueUpdateContext) {
        super(technique, tile.mapView);

        this.mainMaterial = this.createMaterial(technique, context) as MapMeshStandardMaterial;
        assert(this.mainMaterial instanceof MapMeshStandardMaterial);

        this.installUpdaters(context);
    }

    /**
     * @override
     */
    addWorldSpaceObject(tile: Tile, srcGeometry: Geometry, group?: Group) {
        const object = this.createObject(tile, srcGeometry, group, THREE.Mesh, this.mainMaterial);
        TechniqueHandlerCommon.setupUserData(srcGeometry, this.technique, object);
        return [object];
    }

    private installUpdaters(context: TechniqueUpdateContext) {
        const technique = this.technique;
        if (Expr.isExpr(technique.color) || Expr.isExpr(technique.opacity)) {
            this.updaters.push(
                TechniqueHandlerCommon.updateBaseColor.bind(
                    undefined,
                    this.mainMaterial,
                    this.objects,
                    technique
                )
            );
        }

        const fadingParams = TechniqueHandlerCommon.getFadingParams(technique, context.env);
        if (TechniqueHandlerCommon.isFadingFeatureEnabled(fadingParams)) {
            this.updaters.push(
                TechniqueHandlerCommon.updateFadingParams.bind(
                    undefined,
                    this.mainMaterial,
                    fadingParams
                )
            );
        }

        if (Expr.isExpr(technique.emissive)) {
            this.updaters.push(this.updateEmissive.bind(this));
        }
    }

    private updateEmissive(context: TechniqueUpdateContext) {
        assert(this.mainMaterial instanceof MapMeshStandardMaterial);

        applySecondaryColorToMaterial(
            (this.mainMaterial as MapMeshStandardMaterial).emissive,
            this.technique.emissive!,
            context.env
        );
    }
}

techniqueHandlers.standard = StandardTechniqueHandler;
