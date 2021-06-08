/*
 * Copyright (C) 2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { getPropertyValue, MapEnv, SolidLineTechnique } from "@here/harp-datasource-protocol";
import { ViewRanges } from "@here/harp-datasource-protocol/lib/ViewRanges";
import { FadingFeature, LineRenderPass, SolidLineMaterial } from "@here/harp-materials";

import {
    applyBaseColorToMaterial,
    buildMetricValueEvaluator,
    cloneMaterial
} from "../DecodedTileHelpers";
import { MapAdapterUpdateEnv, MapMaterialAdapter } from "../MapMaterialAdapter";
import { SolidLineMesh } from "./SolidLineMesh";
import { FadingParameters } from "./TileGeometryCreator";

/**
 * Creates the SolidLineMesh AA (antialiased) mesh and the outline + outline AA mesh.
 * The standard SolidLineMesh is however still constructed in the TileGeometryCreator via the call
 * to buildObject.
 */
export class SolidLineMeshCreator {
    /**
     * Creates the second pass mesh which renders the AA for transparent lines.
     * This is required as a two step approach because otherwise the AA renders into the stencil
     * buffer and creates artifacts when the line overlaps itself or at tile borders, see:
     * MAPSJS-2929
     */
    static createAAMesh(object: SolidLineMesh, technique: SolidLineTechnique): SolidLineMesh {
        const outline = object.clone() as SolidLineMesh;
        const aaMaterial = cloneMaterial(
            outline.material as THREE.Material,
            technique
        ) as SolidLineMaterial;
        aaMaterial.pass = LineRenderPass.SECOND_PASS;
        outline.material = aaMaterial;
        // The AA must be rendered after, because we want to paint the AA where the road doesn't yet
        // exist (by using the stencil buffer).
        outline.renderOrder += SolidLineMesh.RENDER_ORDER_OFFSET;
        // This can get complicated. We have now 4 meshes to render a line, 2 for the solid inner
        // part and 2 for the outline (each have one solid part and one part which is the AA).
        // All 4 objects need to have different render orders, but the correct reference render
        // order which is used by the SolidLineStencilRefManager.
        outline.referenceRenderOrder = object.renderOrder;
        return outline;
    }

    static cloneObject(
        object: SolidLineMesh,
        outlineTechnique: SolidLineTechnique,
        mapEnv: MapEnv
    ): SolidLineMesh {
        const outlineMaterial = (object.material as SolidLineMaterial).clone() as SolidLineMaterial;
        applyBaseColorToMaterial(
            outlineMaterial,
            outlineMaterial.color,
            outlineTechnique,
            outlineTechnique.secondaryColor ?? 0x000000,
            mapEnv
        );
        if (outlineTechnique.secondaryCaps !== undefined) {
            outlineMaterial.caps = getPropertyValue(outlineTechnique.secondaryCaps, mapEnv);
        }
        const outlineObj = object.clone();
        outlineObj.material = outlineMaterial;
        // The render order difference must be bigger than the offset used for the AA
        outlineObj.renderOrder =
            (getPropertyValue(outlineTechnique.secondaryRenderOrder, mapEnv) ?? 0) -
            SolidLineMesh.RENDER_ORDER_OFFSET * 2;
        return outlineObj;
    }

    static createOutlineObj(
        object: SolidLineMesh,
        outlineTechnique: SolidLineTechnique,
        mapEnv: MapEnv,
        fadingParams: FadingParameters,
        viewRanges: ViewRanges,
        lineRenderPass: LineRenderPass
    ): SolidLineMesh {
        const outlineObj =
            lineRenderPass === LineRenderPass.FIRST_PASS
                ? SolidLineMeshCreator.cloneObject(object, outlineTechnique, mapEnv)
                : SolidLineMeshCreator.createAAMesh(object, outlineTechnique);

        FadingFeature.addRenderHelper(
            outlineObj,
            viewRanges,
            fadingParams.fadeNear,
            fadingParams.fadeFar,
            false
        );

        const secondaryWidth = buildMetricValueEvaluator(
            outlineTechnique.secondaryWidth,
            outlineTechnique.metricUnit
        );

        const originalOutlineMaterial = object.material as SolidLineMaterial;
        const outlineMaterial = outlineObj.material as SolidLineMaterial;
        const mainMaterialAdapter = MapMaterialAdapter.get(originalOutlineMaterial);

        const outlineMaterialAdapter = MapMaterialAdapter.create(outlineMaterial, {
            color: outlineTechnique.secondaryColor,
            opacity: outlineTechnique.opacity,
            caps: outlineTechnique.secondaryCaps,
            // Still handled above
            lineWidth: (frameMapView: MapAdapterUpdateEnv) => {
                if (!mainMaterialAdapter) {
                    return;
                }
                mainMaterialAdapter.ensureUpdated(frameMapView);
                const mainLineWidth = mainMaterialAdapter.currentStyledProperties.lineWidth;

                const secondaryLineWidth = getPropertyValue(secondaryWidth, mapEnv);
                const opacity = outlineMaterialAdapter.currentStyledProperties.opacity as
                    | number
                    | null;
                if (typeof mainLineWidth === "number" && typeof secondaryLineWidth === "number") {
                    if (
                        secondaryLineWidth <= mainLineWidth &&
                        (opacity === null || opacity === undefined || opacity === 1)
                    ) {
                        // We could mark object as invisible somehow, not sure how
                        // objectAdapter.markInvisible();
                        return 0;
                    } else {
                        return secondaryLineWidth;
                    }
                } else {
                    return 0;
                }
            }
        });
        return outlineObj;
    }
}
