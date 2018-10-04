/*
 * Copyright (C) 2017-2018 HERE Global B.V. and its affiliate(s).
 * All rights reserved.
 *
 * This software and other materials contain proprietary information
 * controlled by HERE and are protected by applicable copyright legislation.
 * Any use and utilization of this software and other materials and
 * disclosure to any third parties is conditional upon having a separate
 * agreement with HERE for the access, use, utilization or disclosure of this
 * software. In the absence of such agreement, the use of the software is not
 * allowed.
 */

import { TilingScheme } from "@here/geoutils";
import { TileKey } from "@here/geoutils/lib/tiling/TileKey";
import { DataSource, TextElement, Tile } from "@here/mapview";

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

    constructor(dataSource: DataSource, tileKey: TileKey) {
        super(dataSource, tileKey);

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

    getTile(tileKey: TileKey): DebugTile {
        const tile = new DebugTile(this, tileKey);
        return tile;
    }

    shouldRender(zoomLevel: number, tileKey: TileKey): boolean {
        if (tileKey.level > this.maxDbgZoomLevel) {
            return false;
        }
        return super.shouldRender(zoomLevel, tileKey);
    }
}
