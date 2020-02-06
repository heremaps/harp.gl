/*
 * Copyright (C) 2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import {
    BufferAttribute,
    Expr,
    ExtrudedPolygonTechnique,
    Geometry,
    getPropertyValue,
    Group,
    IndexedTechnique,
    Value
} from "@here/harp-datasource-protocol";
import {
    EdgeMaterial,
    EdgeMaterialParameters,
    MapMeshBasicMaterial,
    MapMeshStandardMaterial
} from "@here/harp-materials";
import { assert } from "@here/harp-utils";
import { AnimatedExtrusionTileHandler } from "../AnimatedExtrusionHandler";
import {
    applyBaseColorToMaterial,
    applySecondaryColorToMaterial,
    getBufferAttribute
} from "../DecodedTileHelpers";
import {
    createDepthPrePassMesh,
    isRenderDepthPrePassEnabled,
    setDepthPrePassStencil
} from "../DepthPrePass";
import { Tile } from "../Tile";
import { techniqueHandlers, TechniqueUpdateContext, TileWorldSpaceEntry } from "./TechniqueHandler";
import { TechniqueHandlerCommon, WorldSpaceTechniqueHandlerBase } from "./TechniqueHandlerCommon";

export class ExtrudedPolygonTechniqueHandler extends WorldSpaceTechniqueHandlerBase<
    ExtrudedPolygonTechnique
> {
    static getSharingKey(
        technique: ExtrudedPolygonTechnique & IndexedTechnique,
        tile: Tile
    ): Value[] | undefined {
        return ExtrudedPolygonTechniqueHandler.isAnimatedExtrusionEnabled(technique, tile)
            ? /*
               * We cannot share `mainMaterial` for duration of animation, because each tile has
               * animates in its own tempo and THREE.js updates material uniforms only once per
               * frame.
               *
               * Alternative solutions:
               *  - use special material clone only for time of animation
               *  - `onBeforeRender` update of `extrusionRatio` and fakes that material actually
               *    `isShaderMaterial` so 3JS updates it before each draw call
               */
              undefined
            : [technique._key];
    }

    static isAnimatedExtrusionEnabled(technique: ExtrudedPolygonTechnique, tile: Tile) {
        const animatedExtrusionHandler = tile.mapView.animatedExtrusionHandler;
        if (!animatedExtrusionHandler) {
            return false;
        }
        let animateExtrusionValue = getPropertyValue(
            technique.animateExtrusion,
            tile.mapView.env // TODO: discrete env!
        );
        if (animateExtrusionValue !== undefined) {
            animateExtrusionValue =
                typeof animateExtrusionValue === "boolean"
                    ? animateExtrusionValue
                    : typeof animateExtrusionValue === "number"
                    ? animateExtrusionValue !== 0
                    : false;
        }
        return animateExtrusionValue !== undefined &&
            animatedExtrusionHandler.forceEnabled === false
            ? animateExtrusionValue
            : animatedExtrusionHandler.enabled;
    }

    private mainMaterial: MapMeshStandardMaterial;

    private edgeMaterial?: EdgeMaterial;

    /**
     * Meshes with `mainMaterial` (+depth pre-pass mesh) with visibility that depends on
     * dynamic `opacity`.
     */
    private mainObjects: TileWorldSpaceEntry[] = [];

    /**
     * Meshes with `edgeMaterial` with visibility that depends on dynamic `opacity`.
     */
    private edgeObjects: TileWorldSpaceEntry[] = [];

    private extrusionAnimationEnabled: boolean = false;
    private extrusionAnimationDuration?: number;

    constructor(technique: ExtrudedPolygonTechnique, tile: Tile, context: TechniqueUpdateContext) {
        super(technique, tile.mapView);

        this.mainMaterial = this.createMaterial(technique, context) as MapMeshStandardMaterial;
        assert(
            this.mainMaterial instanceof MapMeshBasicMaterial ||
                this.mainMaterial instanceof MapMeshStandardMaterial
        );

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

        if (Expr.isExpr(technique.emissive)) {
            this.updaters.push(this.updateEmissive.bind(this));
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
            this.edgeMaterial = new EdgeMaterial(materialParams);
            this.materials.push(this.edgeMaterial);

            if (TechniqueHandlerCommon.isFadingFeatureEnabled(fadingParams)) {
                this.updaters.push(
                    TechniqueHandlerCommon.updateEdgeFadingParams.bind(
                        undefined,
                        this.edgeMaterial,
                        fadingParams
                    )
                );
            }

            if (Expr.isExpr(technique.lineColor) || Expr.isExpr(technique.opacity)) {
                this.updaters.push(this.updateEdgeColor.bind(this));
            }
        }

        this.extrusionAnimationEnabled = ExtrudedPolygonTechniqueHandler.isAnimatedExtrusionEnabled(
            technique,
            tile
        );

        if (this.extrusionAnimationEnabled) {
            const animatedExtrusionHandler = tile.mapView.animatedExtrusionHandler;
            this.extrusionAnimationDuration =
                this.technique.animateExtrusionDuration !== undefined &&
                animatedExtrusionHandler.forceEnabled === false
                    ? technique.animateExtrusionDuration
                    : animatedExtrusionHandler.duration;
        }
    }

    /**
     * @override
     */
    addWorldSpaceObject(tile: Tile, srcGeometry: Geometry, group?: Group) {
        const bufferGeometry = TechniqueHandlerCommon.createGenericBufferGeometry(
            this.technique,
            srcGeometry,
            group
        );
        const mainObject = new THREE.Mesh(bufferGeometry, this.mainMaterial);

        TechniqueHandlerCommon.setupUserData(srcGeometry, this.technique, mainObject);

        mainObject.renderOrder = this.technique.renderOrder;

        const result: THREE.Object3D[] = [];

        result.push(mainObject);

        this.mainObjects.push({ object: mainObject, tile });
        this.registerObject(tile, mainObject);

        const renderDepthPrePass = isRenderDepthPrePassEnabled(this.technique);

        if (renderDepthPrePass) {
            const depthPassMesh = createDepthPrePassMesh(mainObject as THREE.Mesh);
            result.push(depthPassMesh);
            this.registerObject(tile, depthPassMesh);
            this.mainObjects.push({ tile, object: depthPassMesh });

            setDepthPrePassStencil(depthPassMesh, mainObject);
        }

        if (this.edgeMaterial && srcGeometry.edgeIndex) {
            const edgeGeometry = new THREE.BufferGeometry();
            edgeGeometry.setAttribute("position", bufferGeometry.getAttribute("position"));

            const colorAttribute = bufferGeometry.getAttribute("color");
            if (colorAttribute !== undefined) {
                edgeGeometry.setAttribute("color", colorAttribute);
            }

            const extrusionAttribute = bufferGeometry.getAttribute("extrusionAxis");
            if (extrusionAttribute !== undefined) {
                edgeGeometry.setAttribute("extrusionAxis", extrusionAttribute);
            }

            const normalAttribute = bufferGeometry.getAttribute("normal");
            if (normalAttribute !== undefined) {
                edgeGeometry.setAttribute("normal", normalAttribute);
            }

            const uvAttribute = bufferGeometry.getAttribute("uv");
            if (uvAttribute !== undefined) {
                edgeGeometry.setAttribute("uv", uvAttribute);
            }

            edgeGeometry.setIndex(getBufferAttribute(srcGeometry.edgeIndex! as BufferAttribute));

            const edgeObject = new THREE.LineSegments(edgeGeometry, this.edgeMaterial);
            edgeObject.renderOrder = mainObject.renderOrder + 0.1;

            this.edgeObjects.push({ tile, object: edgeObject });
            this.registerObject(tile, edgeObject);
            result.push(edgeObject);
        }

        if (this.extrusionAnimationEnabled) {
            if (tile.animatedExtrusionTileHandler === undefined) {
                tile.animatedExtrusionTileHandler = new AnimatedExtrusionTileHandler(
                    tile,
                    result,
                    this.extrusionAnimationDuration!
                );
                tile.mapView.animatedExtrusionHandler.add(tile.animatedExtrusionTileHandler);
            } else {
                tile.animatedExtrusionTileHandler.add(result);
            }
        }

        return result;
    }

    /**
     * @override
     */
    removeTileObjects(tile: Tile) {
        this.mainObjects = this.mainObjects.filter(entry => entry.tile !== tile);
        this.edgeObjects = this.edgeObjects.filter(entry => entry.tile !== tile);

        super.removeTileObjects(tile);
    }

    private updateEdgeColor(context: TechniqueUpdateContext) {
        assert(this.edgeMaterial !== undefined);

        const lastOpacity = this.edgeMaterial!.opacity;
        applyBaseColorToMaterial(
            this.edgeMaterial!,
            this.edgeMaterial!.color,
            this.technique,
            this.technique.lineColor!,
            context.env
        );

        if (lastOpacity !== this.edgeMaterial!.opacity) {
            TechniqueHandlerCommon.forEachTileObject(this.edgeObjects, context, object => {
                object.visible = this.edgeMaterial!.opacity > 0;
            });
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

techniqueHandlers["extruded-polygon"] = ExtrudedPolygonTechniqueHandler;
