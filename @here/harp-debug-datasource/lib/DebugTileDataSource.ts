/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { TilingScheme } from "@here/harp-geoutils";
import { TileKey } from "@here/harp-geoutils/lib/tiling/TileKey";
import { DataSource, DEFAULT_TEXT_STYLE_CACHE_ID, TextElement, Tile } from "@here/harp-mapview";

import * as THREE from "three";

const debugMaterial = new THREE.LineBasicMaterial({
    color: 0xff0000,
    linewidth: 1,
    depthTest: false
});

// Set maximum priority.
const PRIORITY_ALWAYS = Number.MAX_SAFE_INTEGER;

// Size/scale of text showing the tiles key
const TEXT_SCALE = 0.8;

export class DebugTile extends Tile {
    private readonly geometry = new THREE.Geometry();
    private readonly m_labelPositions = new THREE.BufferAttribute(new Float32Array(3), 3);

    private m_textRenderStyle = this.mapView.textRenderStyleCache.get(DEFAULT_TEXT_STYLE_CACHE_ID)!;
    private m_textLayoutStyle = this.mapView.textLayoutStyleCache.get(DEFAULT_TEXT_STYLE_CACHE_ID)!;

    constructor(dataSource: DataSource, tileKey: TileKey, offset: number) {
        super(dataSource, tileKey, offset);

        const tileBounds = this.boundingBox.clone();

        tileBounds.min.sub(this.center);
        tileBounds.max.sub(this.center);
        this.geometry.vertices.push(
            new THREE.Vector3(tileBounds.min.x, tileBounds.min.y, 0),
            new THREE.Vector3(tileBounds.max.x, tileBounds.min.y, 0),
            new THREE.Vector3(tileBounds.max.x, tileBounds.max.y, 0),
            new THREE.Vector3(tileBounds.min.x, tileBounds.max.y, 0),
            new THREE.Vector3(tileBounds.min.x, tileBounds.min.y, 0)
        );
        const lineObject = new THREE.Line(this.geometry, debugMaterial);
        lineObject.renderOrder = 100;
        this.objects.push(lineObject);

        this.m_labelPositions.setXYZ(0, 0, 0, 0);

        const textElement = new TextElement(
            tileKey.toHereTile(),
            new THREE.Vector2(0, 0),
            this.m_textRenderStyle,
            this.m_textLayoutStyle,
            PRIORITY_ALWAYS,
            TEXT_SCALE
        );
        textElement.mayOverlap = true;
        textElement.reserveSpace = false;
        textElement.alwaysOnTop = true;
        textElement.ignoreDistance = true;

        this.addTextElement(textElement);
    }
}

export class DebugTileDataSource extends DataSource {
    constructor(
        private m_tilingScheme: TilingScheme,
        name = "debug",
        public maxDbgZoomLevel: number = 20
    ) {
        super(name);

        this.cacheable = true;
    }

    getTilingScheme(): TilingScheme {
        return this.m_tilingScheme;
    }

    getTile(tileKey: TileKey, offset: number): DebugTile {
        const tile = new DebugTile(this, tileKey, offset);
        return tile;
    }

    shouldRender(zoomLevel: number, tileKey: TileKey): boolean {
        if (tileKey.level > this.maxDbgZoomLevel) {
            return false;
        }
        return super.shouldRender(zoomLevel, tileKey);
    }
}
