/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import * as sinon from "sinon";

import {
    MathUtils,
    mercatorProjection,
    Projection,
    TileKey,
    TilingScheme,
    webMercatorTilingScheme
} from "@here/harp-geoutils";
import { MapView, MapViewEventNames } from "../../lib/MapView";

import { waitForEvent } from "@here/harp-test-utils";
import { DataSource } from "../../lib/DataSource";
import { Tile } from "../../lib/Tile";

import * as THREE from "three";

const describeOnlyWeb = typeof window !== "undefined" ? describe : xdescribe;

export type MaterialDescription = THREE.MeshMaterialType | THREE.Color | string;

export function getSimpleMeshMaterial(materialDescr: MaterialDescription): THREE.MeshMaterialType {
    if (materialDescr instanceof THREE.Material) {
        return materialDescr;
    }
    const material = new THREE.MeshBasicMaterial();
    material.color =
        typeof materialDescr === "string" ? new THREE.Color(materialDescr) : materialDescr;
    return material;
}

export class CustomGeometryTile extends Tile {
    constructor(
        dataSource: DataSource,
        tileKey: number | TileKey,
        builder?: (tile: CustomGeometryTile) => void
    ) {
        super(dataSource, typeof tileKey === "number" ? TileKey.fromMortonCode(tileKey) : tileKey);
        if (builder !== undefined) {
            builder(this);
        }
    }

    addAxisAlignedRectangle(worldBoundingBox: THREE.Box3, material: MaterialDescription): this {
        const geometry = new THREE.Geometry();
        const tileBoundingBox = worldBoundingBox.clone();
        // move the bounding  center to (0, 0), as the created geometry will later be added
        // to tile.center
        tileBoundingBox.min.sub(this.center);
        tileBoundingBox.max.sub(this.center);

        // add vertices to the geometry
        geometry.vertices.push(
            new THREE.Vector3(tileBoundingBox.min.x, tileBoundingBox.min.y, 0),
            new THREE.Vector3(tileBoundingBox.max.x, tileBoundingBox.min.y, 0),
            new THREE.Vector3(tileBoundingBox.max.x, tileBoundingBox.max.y, 0),
            new THREE.Vector3(tileBoundingBox.min.x, tileBoundingBox.max.y, 0)
        );
        // add two triangle faces to the geometry, using the vertex indices
        geometry.faces.push(new THREE.Face4(0, 1, 2), new THREE.Face4(0, 2, 3));

        this.objects.push(new THREE.Mesh(geometry, getSimpleMeshMaterial(material)));

        return this;
    }
}

export class CustomTilesDataSource extends DataSource {
    tiles: Map<number, Tile> = new Map();
    private m_maxZoomLevel: number = 1;
    private m_minZoomLevel?: number = undefined;
    constructor() {
        super("whatever");
    }

    addTiles(...tiles: Tile[]) {
        for (const tile of tiles) {
            this.tiles.set(tile.tileKey.mortonCode(), tile);
            this.m_maxZoomLevel = Math.max(tile.tileKey.level, this.maxZoomLevel);
            this.m_minZoomLevel =
                this.m_minZoomLevel === undefined
                    ? tile.tileKey.level
                    : Math.min(tile.tileKey.level, this.m_minZoomLevel);
        }
    }
    get minZoomLevel() {
        return this.m_minZoomLevel || this.m_maxZoomLevel;
    }
    get maxZoomLevel() {
        return this.m_maxZoomLevel;
    }

    getDisplayZoomLevel(zoomLevel: number): number {
        return this.maxZoomLevel;
    }

    get projection(): Projection {
        return mercatorProjection;
    }

    getTilingScheme(): TilingScheme {
        return webMercatorTilingScheme;
    }
    getTile(tileKey: TileKey): Tile {
        return this.tiles.get(tileKey.mortonCode()) || new CustomGeometryTile(this, tileKey);
    }

    shouldRender(zoomLevel: number, tileKey: TileKey): boolean {
        const tile = this.tiles.get(tileKey.mortonCode());

        if (!tile) {
            return false;
        }
        return tile.tileKey.level === zoomLevel;
    }

    zoomOnAvailableTiles(mapView: MapView) {
        const boundingBox = new THREE.Box3();
        this.tiles.forEach(tile => {
            boundingBox.expandByPoint(tile.boundingBox.min);
            boundingBox.expandByPoint(tile.boundingBox.max);
        });
        const tmpVec3 = new THREE.Vector3();
        const size = boundingBox.getSize(tmpVec3);
        const viewSize = Math.max(size.x, size.y);

        const fov = mapView.fov;
        const height = (viewSize / 2) * (1 / Math.tan(MathUtils.degToRad(fov / 2)));

        mapView.worldCenter = boundingBox.getCenter(tmpVec3);
        mapView.camera.position.set(0, 0, height);
    }
}

function siblingTileKey(tileKey: TileKey, colDelta: number, rowDelta: number) {
    return new TileKey(tileKey.row + rowDelta, tileKey.column + colDelta, tileKey.level);
}

describeOnlyWeb("MapViewRendering", () => {
    let sandbox: sinon.SinonSandbox;
    let mapView: MapView;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
    });

    afterEach(() => {
        if (mapView !== undefined) {
            mapView.dispose();
        }
        sandbox.restore();
    });

    it("renders rectangles on tile", async function() {
        const canvas = document.createElement("canvas");
        canvas.width = 400;
        canvas.height = 400;
        mapView = new MapView({
            canvas,
            theme: "../resources/day.json",
            preserveDrawingBuffer: true
        });
        mapView.resize(400, 400);

        const dataSource = new CustomTilesDataSource();
        const baseTileKey = TileKey.fromMortonCode(1486027398);
        dataSource.addTiles(
            new CustomGeometryTile(dataSource, baseTileKey, tile => {
                tile.addAxisAlignedRectangle(tile.boundingBox, "red");
            }),
            new CustomGeometryTile(dataSource, siblingTileKey(baseTileKey, 1, 0), tile => {
                tile.addAxisAlignedRectangle(tile.boundingBox, "green");
            }),
            new CustomGeometryTile(dataSource, siblingTileKey(baseTileKey, 1, 1), tile => {
                tile.addAxisAlignedRectangle(tile.boundingBox, "yellow");
            }),
            new CustomGeometryTile(dataSource, siblingTileKey(baseTileKey, 0, 1), tile => {
                tile.addAxisAlignedRectangle(tile.boundingBox, "blue");
            })
        );
        mapView.addDataSource(dataSource);

        dataSource.zoomOnAvailableTiles(mapView);

        await waitForEvent(mapView, MapViewEventNames.FrameComplete);

        // In future, when we will have ibct tests, this will compare against
        // saved reference image.
        // tslint:disable-next-line:no-console
        console.log(`test "renders rectangles on tile" screenshot`, canvas.toDataURL());

        // Or for development, uncomment this, to see the result in browser
        //document.body.appendChild(canvas);
    });
});
