/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { GeoCoordinates, ProjectionType, TileKey, TilingScheme } from "@here/harp-geoutils";
import { DataSource, TextElement, Tile } from "@here/harp-mapview";
import {
    FontUnit,
    HorizontalAlignment,
    TextLayoutStyle,
    TextRenderStyle,
    VerticalAlignment
} from "@here/harp-text-canvas";
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
    private readonly geometry = new THREE.BufferGeometry();
    private readonly m_labelPositions = new THREE.BufferAttribute(new Float32Array(3), 3);

    private readonly m_textRenderStyle: TextRenderStyle;
    private readonly m_textLayoutStyle: TextLayoutStyle;

    constructor(dataSource: DataSource, tileKey: TileKey, gridColor = "#ff0000") {
        super(dataSource, tileKey);

        const tilingScheme = dataSource.getTilingScheme();
        const worldBox = tilingScheme.boundingBoxGenerator.getWorldBox(tileKey);
        const projection = tilingScheme.projection;
        const geoCoordinates: GeoCoordinates[] = [
            projection.unprojectPoint(new THREE.Vector3(worldBox.min.x, worldBox.min.y, 0)),
            projection.unprojectPoint(new THREE.Vector3(worldBox.max.x, worldBox.min.y, 0)),
            projection.unprojectPoint(new THREE.Vector3(worldBox.max.x, worldBox.max.y, 0)),
            projection.unprojectPoint(new THREE.Vector3(worldBox.min.x, worldBox.max.y, 0))
        ];

        const middlePoint = new THREE.Vector3();

        const vertices: number[] = [];
        geoCoordinates.forEach(geoPoint => {
            const pt = new THREE.Vector3();
            this.projection.projectPoint(geoPoint, pt);
            pt.sub(this.center);
            vertices.push(...pt.toArray());
            middlePoint.add(pt);
        });
        this.geometry.setAttribute(
            "position",
            new THREE.BufferAttribute(new Float32Array(vertices), 3)
        );

        middlePoint.divideScalar(geoCoordinates.length);

        const lineObject = new THREE.Line(this.geometry, debugMaterial);
        lineObject.renderOrder = PRIORITY_ALWAYS;
        this.objects.push(lineObject);

        this.m_labelPositions.setXYZ(0, 0, 0, 0);

        const textPosition = new THREE.Vector3();

        if (this.projection.type === ProjectionType.Planar) {
            // place the text position at north/west for planar projections.
            textPosition.set(
                this.geometry.getAttribute("position").getX(3),
                this.geometry.getAttribute("position").getY(3),
                this.geometry.getAttribute("position").getZ(3)
            );
            textPosition.multiplyScalar(0.95);

            this.m_textLayoutStyle = new TextLayoutStyle({
                verticalAlignment: VerticalAlignment.Below,
                horizontalAlignment: HorizontalAlignment.Left
            });
        } else {
            textPosition.copy(middlePoint);

            this.m_textLayoutStyle = new TextLayoutStyle({
                verticalAlignment: VerticalAlignment.Center,
                horizontalAlignment: HorizontalAlignment.Center
            });
        }

        this.m_textRenderStyle = new TextRenderStyle({
            fontSize: {
                unit: FontUnit.Pixel,
                size: 16,
                backgroundSize: 0
            },
            color: new THREE.Color(gridColor)
        });

        const text = `${tileKey.mortonCode()} (${tileKey.row}, ${tileKey.column}, ${
            tileKey.level
        })`;

        textPosition.add(this.center);
        const textElement = new TextElement(
            text,
            textPosition,
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
        private readonly m_tilingScheme: TilingScheme,
        name = "debug",
        public maxDbgZoomLevel: number = 20
    ) {
        super({ name, minDataLevel: 1, maxDataLevel: 20, storageLevelOffset: -1 });

        this.cacheable = true;
        this.enablePicking = false;
    }

    /** @override */
    getTilingScheme(): TilingScheme {
        return this.m_tilingScheme;
    }

    /** @override */
    getTile(tileKey: TileKey): DebugTile {
        const tile = new DebugTile(this, tileKey);
        return tile;
    }

    /** @override */
    canGetTile(zoomLevel: number, tileKey: TileKey): boolean {
        if (tileKey.level > this.maxDbgZoomLevel) {
            return false;
        }
        return super.canGetTile(zoomLevel, tileKey);
    }
}
