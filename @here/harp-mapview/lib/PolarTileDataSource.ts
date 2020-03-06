/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import { Definitions, StyleSet, Theme } from "@here/harp-datasource-protocol";
import { MapEnv, StyleSetEvaluator } from "@here/harp-datasource-protocol/index-decoder";
import {
    GeoCoordinates,
    MercatorConstants,
    polarTilingScheme,
    TileKey,
    TilingScheme,
    TransverseMercatorUtils
} from "@here/harp-geoutils";

import { DataSource } from "./DataSource";
import { createMaterial } from "./DecodedTileHelpers";
import { Tile } from "./Tile";

export interface PolarTileDataSourceOptions {
    /**
     * Name of [[TileDataSource]], must be unique.
     */
    name?: string;

    /**
     * The name of the [[StyleSet]] to evaluate for the decoding.
     */
    styleSetName?: string;

    /**
     * Optional minimum zoom level (storage level) for [[Tile]]s. Default is 1.
     */
    minZoomLevel?: number;

    /**
     * Optional maximum zoom level (storage level) for [[Tile]]s. Default is 20.
     */
    maxZoomLevel?: number;

    /**
     * Optional storage level offset for [[Tile]]s. Default is -1.
     */
    storageLevelOffset?: number;

    /**
     * Optional level offset of regular tiles from reference datasource to align tiles to.
     * Default is -1.
     */
    geometryLevelOffset?: number;

    /**
     * Enable debug display for generated tiles.
     * Default is false.
     */
    debugTiles?: boolean;
}

/**
 * [[DataSource]] providing geometry for poles
 */
export class PolarTileDataSource extends DataSource {
    private m_tilingScheme: TilingScheme = polarTilingScheme;
    private m_maxLatitude = THREE.MathUtils.radToDeg(MercatorConstants.MAXIMUM_LATITUDE);
    private m_geometryLevelOffset: number;
    private m_debugTiles: boolean;

    private m_styleSetEvaluator?: StyleSetEvaluator;
    private m_northPoleMaterial?: THREE.Material;
    private m_southPoleMaterial?: THREE.Material;

    constructor({
        name = "polar",
        styleSetName,
        minZoomLevel,
        maxZoomLevel,
        storageLevelOffset = -2,
        geometryLevelOffset = -1,
        debugTiles = false
    }: PolarTileDataSourceOptions) {
        super(name, styleSetName, minZoomLevel, maxZoomLevel, storageLevelOffset);

        this.m_geometryLevelOffset = geometryLevelOffset;
        this.m_debugTiles = debugTiles;
        this.cacheable = false;
    }

    /** @override */
    dispose() {
        if (this.m_northPoleMaterial) {
            this.m_northPoleMaterial.dispose();
            delete this.m_northPoleMaterial;
        }
        if (this.m_southPoleMaterial) {
            this.m_southPoleMaterial.dispose();
            delete this.m_southPoleMaterial;
        }
        if (this.m_styleSetEvaluator) {
            delete this.m_styleSetEvaluator;
        }
    }

    createMaterial(kind: string, styleSetEvaluator: StyleSetEvaluator): THREE.Material | undefined {
        const env = new MapEnv({
            $geometryType: "polygon",
            $layer: "earth",
            kind
        });

        const techniques = styleSetEvaluator.getMatchingTechniques(env);

        return techniques.length !== 0
            ? createMaterial({ technique: techniques[0], env })
            : undefined;
    }

    /** @override */
    setStyleSet(styleSet?: StyleSet, definitions?: Definitions, languages?: string[]): void {
        this.dispose();

        if (styleSet !== undefined) {
            this.m_styleSetEvaluator = new StyleSetEvaluator(styleSet, definitions);

            this.m_northPoleMaterial = this.createMaterial("north_pole", this.m_styleSetEvaluator);
            this.m_southPoleMaterial = this.createMaterial("south_pole", this.m_styleSetEvaluator);
        }

        this.mapView.markTilesDirty(this);
    }

    /** @override */
    setTheme(theme: Theme, languages?: string[]): void {
        const styleSet =
            (this.styleSetName !== undefined && theme.styles && theme.styles[this.styleSetName]) ||
            [];

        this.setStyleSet(styleSet, theme.definitions, languages);
    }

    /** @override */
    canGetTile(zoomLevel: number, tileKey: TileKey): boolean {
        if (zoomLevel !== tileKey.level || tileKey.level < 1) {
            return false;
        }

        const { north, south } = this.m_tilingScheme.getGeoBox(tileKey);

        return north > this.m_maxLatitude || south < -this.m_maxLatitude;
    }

    /** @override */
    shouldSubdivide(zoomLevel: number, tileKey: TileKey): boolean {
        if (zoomLevel <= tileKey.level) {
            return false;
        }

        const { north, south } = this.m_tilingScheme.getGeoBox(tileKey);

        return north > this.m_maxLatitude || south < -this.m_maxLatitude;
    }

    /** @override */
    getTilingScheme(): TilingScheme {
        return this.m_tilingScheme;
    }

    /** @override */
    getTile(tileKey: TileKey): Tile {
        const tile = new Tile(this, tileKey);

        this.createTileGeometry(tile);

        return tile;
    }

    get geometryLevelOffset(): number {
        return this.m_geometryLevelOffset;
    }

    set geometryLevelOffset(geometryLevelOffset: number) {
        this.m_geometryLevelOffset = geometryLevelOffset;
    }

    private intersectEdge(latitude: number, a: GeoCoordinates, b: GeoCoordinates): GeoCoordinates {
        const latA = a.latitude;
        const latB = b.latitude;

        let lonA = a.longitude;
        let lonB = b.longitude;

        if (Math.abs(latA) === 90) {
            lonA = lonB;
        }
        if (Math.abs(latB) === 90) {
            lonB = lonA;
        }
        const deltaLat = latB - latA;
        const deltaLon = lonB - lonA;
        const scale = (latitude - latA) / deltaLat;

        return new GeoCoordinates(latitude, lonA + deltaLon * scale, 0);
    }

    private createTileGeometry(tile: Tile): void {
        const { north, south } = tile.geoBox;

        const isNorthPole = north > 0 && south >= 0;
        const material = isNorthPole ? this.m_northPoleMaterial : this.m_southPoleMaterial;
        if (material === undefined) {
            tile.forceHasGeometry(true);
            return;
        }

        const srcProjection = this.m_tilingScheme.projection;
        const dstProjection = this.projection;

        const maxLat = this.m_maxLatitude;
        const poleLat = isNorthPole ? maxLat : -maxLat;

        const box = this.m_tilingScheme.boundingBoxGenerator.getWorldBox(tile.tileKey);

        const pBL = srcProjection.unprojectPoint(new THREE.Vector3(box.min.x, box.min.y, 0));
        const pBR = srcProjection.unprojectPoint(new THREE.Vector3(box.max.x, box.min.y, 0));
        const pTR = srcProjection.unprojectPoint(new THREE.Vector3(box.max.x, box.max.y, 0));
        const pTL = srcProjection.unprojectPoint(new THREE.Vector3(box.min.x, box.max.y, 0));

        let points: GeoCoordinates[];
        let needsGeometryCut = false;

        // special case where tile contains half of the hemisphere
        if (tile.tileKey.level === 1) {
            const isLeftHalf = box.min.x === 0;

            const poleX = isLeftHalf ? box.max.x : box.min.x;
            const poleY = (box.max.y + box.min.y) / 2;
            const pPole = srcProjection.unprojectPoint(new THREE.Vector3(poleX, poleY, 0));

            // coordinates are not used, needed for right position
            const pXX = isLeftHalf ? pBL : pBR;

            points = isNorthPole
                ? isLeftHalf
                    ? [pPole, pTR, pXX, pBR]
                    : [pPole, pBL, pXX, pTL]
                : isLeftHalf
                ? [pPole, pBR, pXX, pTR]
                : [pPole, pTL, pXX, pBL];

            needsGeometryCut = true;
        } else {
            // ccw for north, cw for south
            points = isNorthPole ? [pBL, pBR, pTR, pTL] : [pBL, pTL, pTR, pBR];

            const lats = points.map(p => p.latitude);
            const lmax = Math.max(...lats);
            const lmin = Math.min(...lats);

            const isAllPointsOut = isNorthPole ? lmax < poleLat : lmin > poleLat;
            if (isAllPointsOut) {
                return;
            }

            const isSomePointsOut = isNorthPole ? lmin < poleLat : lmax > poleLat;
            needsGeometryCut = isSomePointsOut;

            if (needsGeometryCut) {
                const nearest = lats.indexOf(isNorthPole ? lmax : lmin);
                if (nearest !== 0) {
                    for (let i = 0; i < nearest; i++) {
                        points.push(points.shift() as GeoCoordinates);
                    }
                }
            }
        }

        if (needsGeometryCut) {
            const centerX = (box.min.x + box.max.x) / 2;
            const centerY = (box.min.y + box.max.y) / 2;
            const center = srcProjection.unprojectPoint(new THREE.Vector3(centerX, centerY, 0));

            TransverseMercatorUtils.alignLongitude(points, center);

            // points aligned as follows:
            // a - nearest to the pole, always in
            // b - next to nearest
            // c - farthes from the pole, always out
            // d - prev from nearest
            const a = points[0];
            const b = points[1];
            const c = points[2];
            const d = points[3];

            const inPointB = Math.abs(b.latitude) >= maxLat;
            const inPointD = Math.abs(d.latitude) >= maxLat;

            const cutStart = inPointB
                ? this.intersectEdge(poleLat, b, c)
                : this.intersectEdge(poleLat, a, b);

            const cutEnd = inPointD
                ? this.intersectEdge(poleLat, d, c)
                : this.intersectEdge(poleLat, a, d);

            points.splice(inPointB ? 2 : 1, 4, cutStart);

            const level = tile.tileKey.level - this.storageLevelOffset + this.m_geometryLevelOffset;
            // tslint:disable-next-line:no-bitwise
            const subdivisions = 1 << Math.max(0, level);
            const step = 360 / subdivisions;

            const cutIndexStart = Math.floor((cutStart.longitude + 180) / step);
            const cutIndexEnd = Math.ceil((cutEnd.longitude + 180) / step);

            for (let i = cutIndexStart + 1; i < cutIndexEnd; i++) {
                points.push(new GeoCoordinates(poleLat, i * step - 180, 0));
            }

            points.push(cutEnd);
            if (inPointD) {
                points.push(d);
            }
        }

        const g = new THREE.Geometry();

        for (const point of points) {
            const projected = dstProjection.projectPoint(point, new THREE.Vector3());
            g.vertices.push(projected.sub(tile.center));
        }

        for (let i = 1; i < points.length - 1; i++) {
            g.faces.push(isNorthPole ? new THREE.Face3(0, i, i + 1) : new THREE.Face3(0, i + 1, i));
        }

        const geometry = new THREE.BufferGeometry();
        geometry.fromGeometry(g);
        g.dispose();

        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData = {
            dataSource: this.name,
            tileKey: tile.tileKey
        };

        if (this.m_debugTiles) {
            const color = Math.round(Math.abs(Math.sin(11 * tile.tileKey.mortonCode())) * 0xffffff);
            mesh.material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 });

            tile.objects.push(
                new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, wireframe: true }))
            );
        }

        tile.objects.push(mesh);
    }
}
