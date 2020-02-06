/*
 * Copyright (C) 2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import {
    Expr,
    Geometry,
    getPropertyValue,
    Group,
    IndexedTechnique,
    SolidLineTechnique,
    Value
} from "@here/harp-datasource-protocol";
import { ProjectionType } from "@here/harp-geoutils";
import { setShaderMaterialDefine, SolidLineMaterial } from "@here/harp-materials";
import { assert } from "@here/harp-utils";
import { applyBaseColorToMaterial } from "../DecodedTileHelpers";
import { Tile } from "../Tile";
import { techniqueHandlers, TechniqueUpdateContext, TileWorldSpaceEntry } from "./TechniqueHandler";
import { TechniqueHandlerCommon, WorldSpaceTechniqueHandlerBase } from "./TechniqueHandlerCommon";

const tmpVector3 = new THREE.Vector3();
const tmpVector2 = new THREE.Vector2();

/**
 * [[SolidLineTechnique]] rendering handler.
 *
 * Responsible for creation of materials and scene objects for this technique as well as updating
 * them if they are dynamic.
 *
 * Shareable for same techniques (and tile level if clipping is anabled and projection is planar).
 */
export class SolidLineTechniqueHandler extends WorldSpaceTechniqueHandlerBase<SolidLineTechnique> {
    /**
     * Get sharing key.
     */
    static getSharingKey(technique: SolidLineTechnique & IndexedTechnique, tile: Tile): Value[] {
        if (
            technique.clipping !== false &&
            tile.mapView.projection.type === ProjectionType.Planar
        ) {
            return [technique._key, tile.tileKey.level];
        } else {
            return [technique._key];
        }
    }

    private mainMaterial: SolidLineMaterial;

    private secondaryMaterial?: SolidLineMaterial;

    private mainObjects: TileWorldSpaceEntry[] = [];
    private secondaryObjects: TileWorldSpaceEntry[] = [];

    private metricUnitIsPixel: boolean;

    constructor(technique: SolidLineTechnique, tile: Tile, context: TechniqueUpdateContext) {
        super(technique, tile.mapView);

        this.mainMaterial = this.createMaterial(technique, context) as SolidLineMaterial;
        assert(this.mainMaterial instanceof SolidLineMaterial);

        if (technique.clipping !== false && context.projection.type === ProjectionType.Planar) {
            tile.boundingBox.getSize(tmpVector3);
            tmpVector2.set(tmpVector3.x, tmpVector3.y);
            this.mainMaterial.clipTileSize = tmpVector2;
        }

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

        this.metricUnitIsPixel = technique.metricUnit === "Pixel";

        if (Expr.isExpr(technique.lineWidth) || this.metricUnitIsPixel) {
            this.updaters.push(this.updateLineWidth.bind(this));
        }

        if (Expr.isExpr(technique.outlineWidth) || this.metricUnitIsPixel) {
            this.updaters.push(this.updateOutlineWidth.bind(this));
        }

        if (Expr.isExpr(technique.dashSize) || this.metricUnitIsPixel) {
            this.updaters.push(this.updateDashSize.bind(this));
        }

        if (Expr.isExpr(technique.gapSize) || this.metricUnitIsPixel) {
            this.updaters.push(this.updateGapSize.bind(this));
        }

        // TODO:
        // Now, with new approach, we don't install handlers for non-interpolated props, so
        // static widths/heights/gaps will not have unitFactor or 0.5 applied.
        // Call them manually or invent better, `createMaterial`

        if (this.technique.lineWidth !== undefined) {
            this.updateLineWidth(context);
        }
        if (this.technique.outlineWidth !== undefined) {
            this.updateOutlineWidth(context);
        }
        if (this.technique.dashSize !== undefined) {
            this.updateDashSize(context);
        }
        if (this.technique.gapSize !== undefined) {
            this.updateGapSize(context);
        }

        const fadingParam = TechniqueHandlerCommon.getFadingParams(technique, context.env);
        if (TechniqueHandlerCommon.isFadingFeatureEnabled(fadingParam)) {
            this.updaters.push(
                TechniqueHandlerCommon.updateFadingParams.bind(
                    undefined,
                    this.mainMaterial,
                    fadingParam
                )
            );
        }

        if (technique.secondaryWidth !== undefined) {
            this.secondaryMaterial = this.mainMaterial.clone();
            this.materials.push(this.secondaryMaterial);

            applyBaseColorToMaterial(
                this.secondaryMaterial,
                this.secondaryMaterial.color,
                this.technique,
                this.technique.secondaryColor ?? 0xff0000,
                context.env
            );

            if (technique.secondaryCaps !== undefined) {
                this.secondaryMaterial.caps = technique.secondaryCaps;
            }

            if (Expr.isExpr(technique.secondaryColor) || Expr.isExpr(technique.opacity)) {
                this.updaters.push(this.updateSecondaryColor.bind(this));
            }

            if (TechniqueHandlerCommon.isFadingFeatureEnabled(fadingParam)) {
                this.updaters.push(
                    TechniqueHandlerCommon.updateFadingParams.bind(
                        undefined,
                        this.secondaryMaterial,
                        fadingParam
                    )
                );
            }

            if (
                Expr.isExpr(technique.secondaryWidth) ||
                Expr.isExpr(technique.secondaryColor) ||
                Expr.isExpr(technique.opacity) ||
                this.metricUnitIsPixel
            ) {
                this.updaters.push(this.updateSecondaryWidth.bind(this));
            }

            if (technique.secondaryWidth !== undefined) {
                this.updateSecondaryWidth(context);
            }
        }
    }

    /**
     * @override
     */
    addWorldSpaceObject(tile: Tile, srcGeometry: Geometry, group: Group) {
        const bufferGeometry = TechniqueHandlerCommon.createGenericBufferGeometry(
            this.technique,
            srcGeometry,
            group
        );
        const mainObject = new THREE.Mesh(bufferGeometry, this.mainMaterial);

        mainObject.renderOrder = this.technique.renderOrder;

        this.registerObject(tile, mainObject);
        tile.objects.push(mainObject);
        this.mainObjects.push({ object: mainObject, tile });

        // NOTE: this is copied wholesale from TechiqueGeometryCreator
        {
            // TODO: candidate for removal, we don't generate buffer geometries with color anywhere
            if (bufferGeometry.getAttribute("color")) {
                setShaderMaterialDefine(this.mainMaterial, "USE_COLOR", true);
            }
        }

        if (this.secondaryMaterial) {
            const secondaryObject = new THREE.Mesh(bufferGeometry, this.secondaryMaterial);

            secondaryObject.renderOrder =
                this.technique.secondaryRenderOrder !== undefined
                    ? this.technique.secondaryRenderOrder
                    : this.technique.renderOrder - 0.0000001;
            tile.objects.push(secondaryObject);
            this.registerObject(tile, secondaryObject);
            this.secondaryObjects.push({ object: mainObject, tile });

            return [mainObject, secondaryObject];
        }
        TechniqueHandlerCommon.setupUserData(srcGeometry, this.technique, mainObject);
        return [mainObject];
    }

    /**
     * @override
     */
    removeTileObjects(tile: Tile) {
        super.removeTileObjects(tile);

        this.mainObjects = this.mainObjects.filter(entry => entry.tile !== tile);
        this.secondaryObjects = this.secondaryObjects.filter(entry => entry.tile !== tile);
    }

    private updateLineWidth(context: TechniqueUpdateContext) {
        const unitFactor = this.getUnitFactor(context);

        this.mainMaterial.lineWidth =
            getPropertyValue(this.technique.lineWidth, context.env) * unitFactor * 0.5;
    }

    private updateOutlineWidth(context: TechniqueUpdateContext) {
        const unitFactor = this.getUnitFactor(context);

        this.mainMaterial.outlineWidth =
            getPropertyValue(this.technique.outlineWidth, context.env) * unitFactor;
    }

    private updateDashSize(context: TechniqueUpdateContext) {
        const unitFactor = this.getUnitFactor(context);

        this.mainMaterial.dashSize =
            getPropertyValue(this.technique.dashSize, context.env) * unitFactor * 0.5;
    }

    private updateGapSize(context: TechniqueUpdateContext) {
        const unitFactor = this.getUnitFactor(context);

        this.mainMaterial.gapSize =
            getPropertyValue(this.technique.gapSize, context.env) * unitFactor * 0.5;
    }

    private updateSecondaryColor(context: TechniqueUpdateContext) {
        assert(this.secondaryMaterial !== undefined);

        const lastOpacity = this.secondaryMaterial!.opacity;
        applyBaseColorToMaterial(
            this.secondaryMaterial!,
            this.secondaryMaterial!.color,
            this.technique,
            this.technique.secondaryColor!,
            context.env
        );

        if (lastOpacity !== this.secondaryMaterial!.opacity) {
            for (const entry of this.secondaryObjects) {
                if (entry.tile.frameNumLastVisible === context.frameNumber) {
                    entry.object.visible = this.secondaryMaterial!.opacity > 0;
                }
            }
        }
    }

    private updateSecondaryWidth(context: TechniqueUpdateContext) {
        const secondaryMaterial = this.secondaryMaterial!;
        assert(this.secondaryMaterial !== undefined);

        const opacity = this.mainMaterial.opacity;

        const unitFactor = this.getUnitFactor(context);

        // Note, we assume that main materials lineWidth has been already updated
        // if dynamic.
        const techniqueLineWidth = this.mainMaterial.lineWidth;
        const techniqueSecondaryWidth =
            getPropertyValue(this.technique.secondaryWidth!, context.env) * unitFactor * 0.5;

        const actualLineWidth =
            techniqueSecondaryWidth <= techniqueLineWidth &&
            (opacity === undefined || opacity === 1)
                ? 0
                : techniqueSecondaryWidth;
        secondaryMaterial.lineWidth = actualLineWidth;
    }

    private getUnitFactor(context: TechniqueUpdateContext): number {
        return this.metricUnitIsPixel ? this.getPixelToWorld(context) : 1.0;
    }

    private getPixelToWorld(context: TechniqueUpdateContext): number {
        return (context.env.lookup("$pixelToWorld") as number) ?? 1.0;
    }
}

// Note: This `as any` is needed probably because `SolidLineTechnique.name` is alternative.
(techniqueHandlers["solid-line"] as any) = SolidLineTechniqueHandler;
(techniqueHandlers["dashed-line"] as any) = SolidLineTechniqueHandler;
