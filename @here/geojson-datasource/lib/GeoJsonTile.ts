/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

/** @module @here/geojson-datasource **/ /***/

import { DecodedTile, ShaderTechnique } from "@here/datasource-protocol";
import { Tile, TileObject } from "@here/mapview";
import * as THREE from "three";
import { POINT_MARKER_TEXTURE, POINT_MARKER_TEXTURE_2X } from "./TextureData";
import { b64toBlob } from "./Utils";

/**
 * The data that is contained in a [[GeoJsonTileObject]].
 */
export interface GeoJsonTileObjectData {
    type?: string;
    tileMortonCode: number;
    zoomLevel: number;
    geojsonProperties: {};
}

/**
 * Interface describing a [[GeoJsonTile]].
 */
export interface GeoJsonTileObject extends TileObject {
    geometry: THREE.BufferGeometry;
    material: THREE.Material;
    userData: GeoJsonTileObjectData;
}

/**
 * The `GeoJsonTile` class is used to create objects from decoded GeoJSON data. Instances of
 * `GeoJsonTile` are created by [[GeoJsonDataSource.getTile]] and used by [[MapView]] to add tile
 * objects to the scene.
 */
export class GeoJsonTile extends Tile {
    static readonly POINT_MARKER_SIZE = 128;

    private m_currentZoomLevel: number | undefined;
    private m_texture: THREE.Texture | undefined;
    private m_texture2x: THREE.Texture | undefined;

    /**
     * Tiles render at all zoom levels. This method stores the zoom level in order to know how to
     * scale the lines's width.
     *
     * @param zoomLevel zoom level.
     * @returns always returns `true`
     */
    willRender(zoomLevel: number): boolean {
        if (this.m_currentZoomLevel !== zoomLevel) {
            this.m_currentZoomLevel = zoomLevel;
        }
        return true;
    }

    /**
     * For unit testing.
     * TODO: find a better solution and/or get rid of window in this class at all.
     */
    getWindow(): Window {
        return window;
    }

    /**
     * This method overrides the `createGeometries` method in [[Tile]] in order to apply the
     * provided point marker technique from the theme. This is not a definitive solution and the
     * original method should be put forward again when we find a better solution.
     *
     * @param decodedTile decoded tile
     */
    createGeometries(decodedTile: DecodedTile): void {
        this.clear();
        const pointMarkerTechnique = decodedTile.techniques.find(
            technique => technique.id === "pointMarker"
        ) as ShaderTechnique;

        if (pointMarkerTechnique) {
            pointMarkerTechnique.params.uniforms.uTexture.value = this.getTexture();
            pointMarkerTechnique.params.uniforms.uSize.value =
                GeoJsonTile.POINT_MARKER_SIZE * this.getWindow().devicePixelRatio;
        }

        this.createObjects(decodedTile, this.objects);
    }

    /**
     * Returns the texture to use for points.
     */
    private getTexture(): THREE.Texture {
        if (this.m_texture === undefined) {
            const textureLoader = new THREE.TextureLoader();
            const imgBlob = b64toBlob(POINT_MARKER_TEXTURE);
            const url = URL.createObjectURL(imgBlob);

            this.m_texture = textureLoader.load(url);
            this.m_texture.flipY = false;
            this.m_texture.magFilter = THREE.LinearFilter;
            this.m_texture.minFilter = THREE.LinearFilter;
        }

        return this.m_texture;
    }

    /**
     * Returns the texture to use for points, with a higher resolution (?).
     */
    // tslint:disable-next-line:no-unused-variable
    private getTexture2x(): THREE.Texture {
        if (this.m_texture2x === undefined) {
            const textureLoader = new THREE.TextureLoader();
            const imgBlob = b64toBlob(POINT_MARKER_TEXTURE_2X);
            const url = URL.createObjectURL(imgBlob);

            this.m_texture2x = textureLoader.load(url);
            this.m_texture2x.flipY = false;
            this.m_texture2x.magFilter = THREE.LinearFilter;
            this.m_texture2x.minFilter = THREE.LinearFilter;
        }

        return this.m_texture2x;
    }
}
