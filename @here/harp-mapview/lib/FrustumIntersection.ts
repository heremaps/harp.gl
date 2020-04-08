/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    OrientedBox3,
    Projection,
    ProjectionType,
    TileKey,
    TilingScheme
} from "@here/harp-geoutils";
import { assert } from "@here/harp-utils";
import * as THREE from "three";
import { DataSource } from "./DataSource";
import { CalculationStatus, ElevationRangeSource } from "./ElevationRangeSource";
import { MapTileCuller } from "./MapTileCuller";
import { MapView } from "./MapView";
import { MapViewUtils, TileOffsetUtils } from "./Utils";

const tmpVectors3 = [new THREE.Vector3(), new THREE.Vector3()];
const tmpVector4 = new THREE.Vector4();

/**
 * Represents a unique TileKey and the area it takes up on screen.
 *
 * Note, in certain tiling projections, it is possible to have an offset, which represents a tile
 * which has fully wrapped around, hence this defaults to 0 to simplify usage for projections which
 * don't require it.
 */
export class TileKeyEntry {
    constructor(
        public tileKey: TileKey,
        public area: number,
        public offset: number = 0,
        public minElevation: number = 0,
        public maxElevation: number = 0,
        public distance: number = 0
    ) {}
}

function getGeoBox(tilingScheme: TilingScheme, childTileKey: TileKey, offset: number) {
    const geoBox = tilingScheme.getGeoBox(childTileKey);
    const longitudeOffset = 360.0 * offset;
    geoBox.northEast.longitude += longitudeOffset;
    geoBox.southWest.longitude += longitudeOffset;
    return geoBox;
}

/**
 * Map tile keys to TileKeyEntry.
 * Keys are a combination of morton code and tile offset,
 * see [[TileOffsetUtils.getKeyForTileKeyAndOffset]].
 */
type TileKeyEntries = Map<number, TileKeyEntry>;

/**
 * Map zoom level to map of visible tile key entries
 */
type ZoomLevelTileKeyMap = Map<number, TileKeyEntries>;

/**
 * Result of frustum intersection
 */
interface IntersectionResult {
    /**
     * Tiles intersected by the frustum per zoom level.
     */
    readonly tileKeyEntries: ZoomLevelTileKeyMap;

    /**
     * True if the intersection was calculated using precise elevation data, false if it's an
     * approximation.
     */
    calculationFinal: boolean;
}

/**
 * Computes the tiles intersected by the frustum defined by the current camera setup.
 */
export class FrustumIntersection {
    private readonly m_frustum: THREE.Frustum = new THREE.Frustum();
    // used to project global coordinates into camera local coordinates
    private readonly m_viewProjectionMatrix = new THREE.Matrix4();
    private readonly m_mapTileCuller: MapTileCuller;
    private m_rootTileKeys: TileKeyEntry[] = [];
    private readonly m_tileKeyEntries: ZoomLevelTileKeyMap = new Map();

    constructor(
        private readonly m_camera: THREE.PerspectiveCamera,
        readonly mapView: MapView,
        private readonly m_extendedFrustumCulling: boolean,
        private readonly m_tileWrappingEnabled: boolean,
        private readonly m_enableMixedLod: boolean
    ) {
        this.m_mapTileCuller = new MapTileCuller(m_camera);
    }

    /**
     * Return camera used for generating frustum.
     */
    get camera(): THREE.PerspectiveCamera {
        return this.m_camera;
    }

    /**
     * Return projection used to convert geo coordinates to world coordinates.
     */
    get projection(): Projection {
        return this.mapView.projection;
    }

    /**
     * Updates the frustum to match the current camera setup.
     */
    updateFrustum(projectionMatrixOverride?: THREE.Matrix4) {
        this.m_viewProjectionMatrix.multiplyMatrices(
            projectionMatrixOverride !== undefined
                ? projectionMatrixOverride
                : this.m_camera.projectionMatrix,
            this.m_camera.matrixWorldInverse
        );

        this.m_frustum.setFromProjectionMatrix(this.m_viewProjectionMatrix);

        if (this.m_extendedFrustumCulling) {
            this.m_mapTileCuller.setup();
        }
        this.computeRequiredInitialRootTileKeys(this.m_camera.position);
    }

    /**
     * Computes the tiles intersected by the updated frustum, see [[updateFrustum]].
     *
     * @param tilingScheme The tiling scheme used to generate the tiles.
     * @param elevationRangeSource Source of elevation range data if any.
     * @param zoomLevels A list of zoom levels to render.
     * @param dataSources A list of data sources to render.
     * @returns The computation result, see [[FrustumIntersection.Result]].
     */
    compute(
        tilingScheme: TilingScheme,
        elevationRangeSource: ElevationRangeSource | undefined,
        zoomLevels: number[],
        dataSources: DataSource[]
    ): IntersectionResult {
        this.m_tileKeyEntries.clear();
        let calculationFinal = true;

        // Compute target tile area in clip space size.
        // A tile should take up roughly 256x256 pixels on screen in accordance to
        // the zoom level chosen by [MapViewUtils.calculateZoomLevelFromDistance].
        assert(this.mapView.viewportHeight !== 0);
        const targetTileArea = Math.pow(256 / this.mapView.viewportHeight, 2);
        const useElevationRangeSource: boolean =
            elevationRangeSource !== undefined &&
            elevationRangeSource.getTilingScheme() === tilingScheme;
        const obbIntersections =
            this.mapView.projection.type === ProjectionType.Spherical || useElevationRangeSource;
        const tileBounds = obbIntersections ? new OrientedBox3() : new THREE.Box3();
        const uniqueZoomLevels = new Set(zoomLevels);

        // create tile key map per zoom level
        for (const zoomLevel of uniqueZoomLevels) {
            this.m_tileKeyEntries.set(zoomLevel, new Map());
        }
        for (const item of this.m_rootTileKeys) {
            const tileKeyEntry = new TileKeyEntry(
                item.tileKey,
                Infinity,
                item.offset,
                item.minElevation,
                item.maxElevation
            );
            for (const zoomLevel of uniqueZoomLevels) {
                const tileKeyEntries = this.m_tileKeyEntries.get(zoomLevel)!;
                tileKeyEntries.set(
                    TileOffsetUtils.getKeyForTileKeyAndOffset(item.tileKey, item.offset),
                    tileKeyEntry
                );
            }
        }

        const workList = [...this.m_rootTileKeys.values()];
        while (workList.length > 0) {
            const tileEntry = workList.pop();

            if (tileEntry === undefined) {
                break;
            }

            // Stop subdivision if hightest visible level is reached
            const tileKey = tileEntry.tileKey;
            const subdivide = dataSources.some((ds, i) =>
                ds.shouldSubdivide(zoomLevels[i], tileKey)
            );
            if (!subdivide) {
                continue;
            }

            // Stop subdivision if area of tile is too small(mixed LOD only)
            if (this.m_enableMixedLod && tileEntry.area < targetTileArea) {
                continue;
            }

            const parentTileKey = TileOffsetUtils.getKeyForTileKeyAndOffset(
                tileKey,
                tileEntry.offset
            );

            // delete parent tile key from applicable zoom levels
            for (const zoomLevel of uniqueZoomLevels) {
                if (tileKey.level >= zoomLevel) {
                    continue;
                }

                const tileKeyEntries = this.m_tileKeyEntries.get(zoomLevel)!;
                tileKeyEntries.delete(parentTileKey);
            }

            for (const childTileKey of tilingScheme.getSubTileKeys(tileKey)) {
                const offset = tileEntry.offset;
                const tileKeyAndOffset = TileOffsetUtils.getKeyForTileKeyAndOffset(
                    childTileKey,
                    offset
                );

                const geoBox = getGeoBox(tilingScheme, childTileKey, offset);

                // For tiles without elevation range source, default 0 (getGeoBox always
                // returns box with altitude min/max equal to zero) will be propagated as
                // min and max elevation, these tiles most probably contains features that
                // lays directly on the ground surface.
                if (useElevationRangeSource) {
                    const range = elevationRangeSource!.getElevationRange(childTileKey);
                    geoBox.southWest.altitude = range.minElevation;
                    geoBox.northEast.altitude = range.maxElevation;
                    calculationFinal =
                        calculationFinal &&
                        range.calculationStatus === CalculationStatus.FinalPrecise;
                }

                this.mapView.projection.projectBox(geoBox, tileBounds);
                const { area, distance } = this.computeTileAreaAndDistance(tileBounds);

                if (area > 0) {
                    const subTileEntry = new TileKeyEntry(
                        childTileKey,
                        area,
                        offset,
                        geoBox.southWest.altitude, // minElevation
                        geoBox.northEast.altitude, // maxElevation
                        distance
                    );

                    // insert sub tile entry into tile entries map per zoom level
                    for (const zoomLevel of uniqueZoomLevels) {
                        if (subTileEntry.tileKey.level > zoomLevel) {
                            continue;
                        }

                        const tileKeyEntries = this.m_tileKeyEntries.get(zoomLevel)!;
                        tileKeyEntries.set(tileKeyAndOffset, subTileEntry);
                    }

                    workList.push(subTileEntry);
                }
            }
        }
        return { tileKeyEntries: this.m_tileKeyEntries, calculationFinal };
    }

    /**
     * Estimate screen space area of tile and distance to center of tile
     * @param tileBounds The bounding volume of a tile
     * @return Area estimate and distance to tile center in clip space
     */
    private computeTileAreaAndDistance(
        tileBounds: THREE.Box3 | OrientedBox3
    ): { area: number; distance: number } {
        if (tileBounds instanceof THREE.Box3) {
            if (
                (this.m_extendedFrustumCulling &&
                    !this.m_mapTileCuller.frustumIntersectsTileBox(tileBounds)) ||
                !this.m_frustum.intersectsBox(tileBounds)
            ) {
                return {
                    area: 0,
                    distance: Infinity
                };
            }
        } else if (!tileBounds.intersects(this.m_frustum)) {
            return {
                area: 0,
                distance: Infinity
            };
        }

        // Project tile bounds center
        const center = tileBounds.getCenter(tmpVectors3[0]);
        const projectedPoint = tmpVector4
            .set(center.x, center.y, center.z, 1.0)
            .applyMatrix4(this.m_viewProjectionMatrix);

        // Estimate objects screen space size with diagonal of bounds
        // Dividing by w projects object size to screen space
        const size = tileBounds.getSize(tmpVectors3[1]);
        const objectSize = (0.5 * size.length()) / projectedPoint.w;

        return {
            area: objectSize * objectSize,
            distance: projectedPoint.z / projectedPoint.w
        };
    }

    /**
     * Create a list of root nodes to test against the frustum. The root nodes each start at level 0
     * and have an offset (see [[Tile]]) based on:
     * - the current position [[worldCenter]].
     * - the height of the camera above the world.
     * - the field of view of the camera (the maximum value between the horizontal / vertical
     *   values)
     * - the tilt of the camera (because we see more tiles when tilted).
     *
     * @param worldCenter The center of the camera in world space.
     */
    private computeRequiredInitialRootTileKeys(worldCenter: THREE.Vector3) {
        this.m_rootTileKeys = [];
        const rootTileKey = TileKey.fromRowColumnLevel(0, 0, 0);
        const tileWrappingEnabled = this.mapView.projection.type === ProjectionType.Planar;

        if (!tileWrappingEnabled || !this.m_tileWrappingEnabled) {
            this.m_rootTileKeys.push(new TileKeyEntry(rootTileKey, Infinity, 0, 0));
            return;
        }

        const worldGeoPoint = this.mapView.projection.unprojectPoint(worldCenter);
        const startOffset = Math.round(worldGeoPoint.longitude / 360.0);

        // This algorithm computes the number of offsets we need to test. The following diagram may
        // help explain the algorithm below.
        //
        //   |🎥
        //   |.\ .
        //   | . \  .
        // z |  .  \   .c2
        //   |  c1.  \b    .
        //   |     .   \      .
        //___|a___d1.____\e______.d2______f
        //
        // Where:
        // - 🎥 is the camera
        // - z is the height of the camera above the ground.
        // - a is a right angle.
        // - b is the look at vector of the camera.
        // - c1 and c2 are the frustum planes of the camera.
        // - c1 to c2 is the fov.
        // - d1 and d2 are the intersection points of the frustum with the world plane.
        // - e is the tilt/pitch of the camera.
        // - f is the world
        //
        // The goal is to find the distance from e->d2. This is a longitude value, and we convert it
        // to some offset range. Note e->d2 >= e->d1 (because we can't have a negative tilt).
        // To find e->d2, we use the right triangle 🎥, a, d2 and subtract the distance a->d2 with
        // a->e.
        // a->d2 is found using the angle between a and d2 from the 🎥, this is simply e (because of
        // similar triangles, angle between a, 🎥 and e equals the tilt) + half of the fov (because
        // we need the angle between e, 🎥 and d2) and using trigonometry, result is therefore:
        // (tan(a->d2) * z).
        // a->e needs just the tilt and trigonometry to compute, result is: (tan(a->e) * z).

        const camera = this.m_camera;
        const cameraPitch = MapViewUtils.extractAttitude(this.mapView, camera).pitch;
        // Ensure that the aspect is >= 1.
        const aspect = camera.aspect > 1 ? camera.aspect : 1 / camera.aspect;
        // Angle between a->d2, note, the fov is vertical, hence we translate to horizontal.
        const totalAngleRad = THREE.MathUtils.degToRad((camera.fov * aspect) / 2) + cameraPitch;
        // Length a->d2
        const worldLengthHorizontalFull = Math.tan(totalAngleRad) * camera.position.z;
        // Length a->e
        const worldLengthHorizontalSmallerHalf = Math.tan(cameraPitch) * camera.position.z;
        // Length e -> d2
        const worldLengthHorizontal = worldLengthHorizontalFull - worldLengthHorizontalSmallerHalf;
        const worldLeftPoint = new THREE.Vector3(
            worldCenter.x - worldLengthHorizontal,
            worldCenter.y,
            worldCenter.z
        );
        const worldLeftGeoPoint = this.mapView.projection.unprojectPoint(worldLeftPoint);
        // We multiply by SQRT2 because we need to account for a rotated view (in which case there
        // are more tiles that can be seen).
        const offsetRange = THREE.MathUtils.clamp(
            Math.ceil(
                Math.abs((worldGeoPoint.longitude - worldLeftGeoPoint.longitude) / 360) * Math.SQRT2
            ),
            0,
            // We can store currently up to 16 unique keys(2^4, where 4 is the default bit-shift
            // value which is used currently in the [[VisibleTileSet]] methods) hence we can have a
            // maximum range of 7 (because 2*7+1 = 15).
            7
        );
        for (
            let offset = -offsetRange + startOffset;
            offset <= offsetRange + startOffset;
            offset++
        ) {
            this.m_rootTileKeys.push(new TileKeyEntry(rootTileKey, Infinity, offset, 0, 0));
        }
    }
}
