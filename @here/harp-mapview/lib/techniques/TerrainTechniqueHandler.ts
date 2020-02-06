/*
 * Copyright (C) 2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import { Geometry, Group, TerrainTechnique } from "@here/harp-datasource-protocol";
import { EarthConstants } from "@here/harp-geoutils";
import { MapMeshStandardMaterial } from "@here/harp-materials";
import { assert } from "@here/harp-utils";
import { DisplacementMap, TileDisplacementMap } from "../DisplacementMap";
import { Tile } from "../Tile";
import { techniqueHandlers, TechniqueUpdateContext } from "./TechniqueHandler";
import { WorldSpaceTechniqueHandlerBase } from "./TechniqueHandlerCommon";

/**
 * [[TerrainTechnique]] rendering handler.
 *
 * Expects that texture is delivered in `srcGeometry.objInfos`.
 *
 * Not shareable across tiles.
 */
export class TerrainTechniqueHandler extends WorldSpaceTechniqueHandlerBase<TerrainTechnique> {
    /**
     * TerrainTechnique doesn't support any kind of sharing acrosss tiles by definition.
     */
    static getSharingKey() {
        return undefined;
    }

    private material: MapMeshStandardMaterial;

    constructor(technique: TerrainTechnique, tile: Tile, context: TechniqueUpdateContext) {
        super(technique, tile.mapView);
        this.material = this.createMaterial(technique, context) as MapMeshStandardMaterial;
        assert(this.material instanceof MapMeshStandardMaterial);

        const terrainColor = tile.mapView.clearColor;

        if (technique.displacementMap === undefined) {
            // Render terrain using the given color.
            this.material.color.set(terrainColor);
            return;
        }

        // Render terrain using height-based colors.
        this.material.onBeforeCompile = (shader: THREE.Shader) => {
            shader.fragmentShader = shader.fragmentShader.replace(
                "#include <map_pars_fragment>",
                `#include <map_pars_fragment>
    uniform sampler2D displacementMap;
    uniform float displacementScale;
    uniform float displacementBias;`
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                "#include <map_fragment>",
                `#ifdef USE_MAP
    float minElevation = ${EarthConstants.MIN_ELEVATION.toFixed(1)};
    float maxElevation = ${EarthConstants.MAX_ELEVATION.toFixed(1)};
    float elevationRange = maxElevation - minElevation;

    float disp = texture2D( displacementMap, vUv ).x * displacementScale + displacementBias;
    vec4 texelColor = texture2D( map, vec2((disp - minElevation) / elevationRange, 0.0) );
    texelColor = mapTexelToLinear( texelColor );
    diffuseColor *= texelColor;
#endif`
            );
            // We remove the displacement map from manipulating the vertices, it is
            // however still required for the pixel shader, so it can't be directly
            // removed.
            shader.vertexShader = shader.vertexShader.replace(
                "#include <displacementmap_vertex>",
                ""
            );
        };
        this.material.displacementMap!.needsUpdate = true;
    }

    /**
     * @override
     */
    addWorldSpaceObject(tile: Tile, srcGeometry: Geometry, group?: Group) {
        const object = this.createObject(tile, srcGeometry, group, THREE.Mesh, this.material);

        // NOTE:
        // This is copied wholesale from TileGeometryCreator.addUserData.
        //
        // TODO:
        // Why displacementMap is retroffitted into incompatible type ???
        // shouldn't we add specific field somewhere in Geometry/DecodedTile
        if ((srcGeometry.objInfos?.length ?? 0) > 0) {
            assert(
                Object.keys(object.userData).length === 0,
                "Unexpected user data in terrain object"
            );

            assert(
                typeof srcGeometry.objInfos![0] === "object",
                "Wrong attribute map type for terrain geometry"
            );

            const displacementMap = (srcGeometry.objInfos as DisplacementMap[])[0];
            const tileDisplacementMap: TileDisplacementMap = {
                tileKey: tile.tileKey,
                texture: new THREE.DataTexture(
                    displacementMap.buffer,
                    displacementMap.xCountVertices,
                    displacementMap.yCountVertices,
                    THREE.LuminanceFormat,
                    THREE.FloatType
                ),
                displacementMap,
                geoBox: tile.geoBox
            };
            object.userData = tileDisplacementMap;
            this.textures.push(tileDisplacementMap.texture);
        }

        return [object];
    }
}

techniqueHandlers.terrain = TerrainTechniqueHandler;
