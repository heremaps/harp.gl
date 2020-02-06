/*
 * Copyright (C) 2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import { Expr, FillTechnique, Geometry, Group } from "@here/harp-datasource-protocol";
import { EdgeMaterial, EdgeMaterialParameters, MapMeshBasicMaterial } from "@here/harp-materials";
import { assert } from "@here/harp-utils";
import { applyBaseColorToMaterial, getBufferAttribute } from "../DecodedTileHelpers";
import { Tile } from "../Tile";
import { techniqueHandlers, TechniqueUpdateContext, TileWorldSpaceEntry } from "./TechniqueHandler";
import { TechniqueHandlerCommon, WorldSpaceTechniqueHandlerBase } from "./TechniqueHandlerCommon";

export class FillTechniqueHandler extends WorldSpaceTechniqueHandlerBase<FillTechnique> {
    private mainMaterial: MapMeshBasicMaterial;
    private outlineMaterial?: EdgeMaterial;

    private mainObjects: TileWorldSpaceEntry[] = [];
    private outlineObjects: TileWorldSpaceEntry[] = [];

    constructor(technique: FillTechnique, tile: Tile, context: TechniqueUpdateContext) {
        // this.technique = fillDefaults(techniqe)
        super(technique, tile.mapView);
        this.mainMaterial = this.createMaterial(technique, context) as MapMeshBasicMaterial;
        assert(this.mainMaterial instanceof MapMeshBasicMaterial);

        if (Expr.isExpr(technique.color) || Expr.isExpr(technique.opacity)) {
            this.updaters.push(
                TechniqueHandlerCommon.updateBaseColor.bind(
                    undefined,
                    this.mainMaterial,
                    this.mainObjects,
                    technique
                )
            );
        }

        const fadingParams = TechniqueHandlerCommon.getPolygonFadingParams(technique, context.env);
        if (TechniqueHandlerCommon.isFadingFeatureEnabled(fadingParams)) {
            this.updaters.push(
                TechniqueHandlerCommon.updateFadingParams.bind(
                    undefined,
                    this.mainMaterial,
                    fadingParams
                )
            );
        }

        if (
            Expr.isExpr(technique.lineWidth) ||
            (typeof technique.lineWidth === "number" && technique.lineWidth > 0)
        ) {
            const materialParams: EdgeMaterialParameters = {
                color: fadingParams.color,
                colorMix: fadingParams.colorMix,
                fadeNear: fadingParams.lineFadeNear,
                fadeFar: fadingParams.lineFadeFar
            };
            this.outlineMaterial = new EdgeMaterial(materialParams);
            this.materials.push(this.outlineMaterial);

            if (TechniqueHandlerCommon.isFadingFeatureEnabled(fadingParams)) {
                this.updaters.push(
                    TechniqueHandlerCommon.updateEdgeFadingParams.bind(
                        undefined,
                        this.outlineMaterial,
                        fadingParams
                    )
                );
            }

            if (Expr.isExpr(technique.lineColor) || Expr.isExpr(technique.opacity)) {
                this.updaters.push(this.updateOutlineColor.bind(this));
            }
        }
    }

    /**
     * @override
     */
    addWorldSpaceObject(tile: Tile, srcGeometry: Geometry, group?: Group) {
        const mainObject = this.createObject(
            tile,
            srcGeometry,
            group,
            THREE.Mesh,
            this.mainMaterial
        );

        TechniqueHandlerCommon.setupUserData(srcGeometry, this.technique, mainObject);

        this.mainObjects.push({ object: mainObject, tile });
        this.objects.push({ object: mainObject, tile });

        if (this.outlineMaterial && srcGeometry.edgeIndex) {
            const bufferGeometry = mainObject.geometry as THREE.BufferGeometry;
            const outlineGeometry = new THREE.BufferGeometry();
            outlineGeometry.setAttribute("position", bufferGeometry.getAttribute("position"));
            outlineGeometry.setIndex(getBufferAttribute(srcGeometry.edgeIndex!));

            const outlineObject = new THREE.LineSegments(outlineGeometry, this.outlineMaterial);

            outlineObject.renderOrder = mainObject.renderOrder + 0.1;

            this.outlineObjects.push({ object: outlineObject, tile });
            this.registerObject(tile, outlineObject);

            return [mainObject, outlineObject];
        }
        return [mainObject];
    }

    /**
     * @override
     */
    removeTileObjects(tile: Tile) {
        super.removeTileObjects(tile);

        this.mainObjects = this.mainObjects.filter(entry => entry.tile !== tile);
        this.outlineObjects = this.outlineObjects.filter(entry => entry.tile !== tile);
    }

    private updateOutlineColor(context: TechniqueUpdateContext) {
        assert(this.outlineMaterial !== undefined);

        const lastOpacity = this.outlineMaterial!.opacity;
        applyBaseColorToMaterial(
            this.outlineMaterial!,
            this.outlineMaterial!.color,
            this.technique,
            this.technique.lineColor!,
            context.env
        );

        if (lastOpacity !== this.outlineMaterial!.opacity) {
            TechniqueHandlerCommon.forEachTileObject(this.outlineObjects, context, object => {
                object.visible = this.outlineMaterial!!.opacity > 0;
            });
        }
    }
}

techniqueHandlers.fill = FillTechniqueHandler;
