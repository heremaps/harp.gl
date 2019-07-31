/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { OrientedBox3 } from "@here/harp-geometry";
import { MathUtils, Projection, ProjectionType, TileKey, TilingScheme } from "@here/harp-geoutils";
import { assert } from "@here/harp-utils";
import * as THREE from "three";
import { DataSource } from "./DataSource";
import { CalculationStatus, ElevationRangeSource } from "./ElevationRangeSource";
import { MapTileCuller } from "./MapTileCuller";
import { MapViewUtils, TileOffsetUtils } from "./Utils";

/**
 * Represents a unique TileKey and the area it takes up on screen.
 *
 * Note, in certain tiling projections, it is possible to have an offset, which represents a tile
 * which has fully wrapped around, hence this defaults to 0 to simplify usage for projections which
 * don't require it.
 */
export class TileKeyEntry {
    constructor(public tileKey: TileKey, public area: number, public offset: number = 0) {}
}

function getGeoBox(tilingScheme: TilingScheme, childTileKey: TileKey, offset: number) {
    const geoBox = tilingScheme.getGeoBox(childTileKey);
    const longitudeOffset = 360.0 * offset;
    geoBox.northEast.longitude += longitudeOffset;
    geoBox.southWest.longitude += longitudeOffset;
    return geoBox;
}

namespace FrustumIntersection {
    export interface Result {
        /**
         * Tiles intersected by the frustum. Keys are a combination of morton code and tile offset,
         * see [[TileOffsetUtils.getKeyForTileKeyAndOffset]].
         */
        readonly tileKeyEntries: Map<number, TileKeyEntry>;
        /**
         * True if the intersection was calculated using precise elevation data, false if it's an
         * approximation.
         */
        calculationFinal: boolean;
    }
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
    private readonly m_tileKeyEntries: Map<number, TileKeyEntry> = new Map();

    constructor(
        private readonly m_camera: THREE.PerspectiveCamera,
        private readonly m_projection: Projection,
        private readonly m_extendedFrustumCulling: boolean
    ) {
        this.m_mapTileCuller = new MapTileCuller(m_camera);
    }

    /**
     * Updates the frustum to match the current camera setup.
     */
    updateFrustum() {
        this.m_viewProjectionMatrix.multiplyMatrices(
            this.m_camera.projectionMatrix,
            this.m_camera.matrixWorldInverse
        );

        this.m_frustum.setFromMatrix(this.m_viewProjectionMatrix);

        if (this.m_extendedFrustumCulling) {
            this.m_mapTileCuller.setup();
        }
        this.computeRequiredInitialRootTileKeys(this.m_camera.position);
    }

    /**
     * Computes the tiles intersected by the updated frustum, see [[updateFrustum]].
     *
     * @param tilingScheme The tiling scheme used to generate the tiles.
     * @param maxTileLevel The maximum tile level that will be checked for intersections.
     * @param elevationRangeSource Source of elevation range data if any.
     * @returns The computation result, see [[FrustumIntersection.Result]].
     */
    compute(
        tilingScheme: TilingScheme,
        maxTileLevel: number,
        elevationRangeSource: ElevationRangeSource | undefined,
        zoomLevels: number[],
        dataSources: DataSource[]
    ): FrustumIntersection.Result {
        this.m_tileKeyEntries.clear();
        let calculationFinal = true;

        for (const item of this.m_rootTileKeys) {
            this.m_tileKeyEntries.set(
                TileOffsetUtils.getKeyForTileKeyAndOffset(item.tileKey, item.offset),
                new TileKeyEntry(item.tileKey, Infinity, item.offset)
            );
        }

        const useElevationRangeSource: boolean =
            elevationRangeSource !== undefined &&
            elevationRangeSource.getTilingScheme() === tilingScheme;

        const tileBounds = new THREE.Box3();
        const workList = [...this.m_rootTileKeys];

        while (workList.length > 0) {
            const tileEntry = workList.pop();

            if (tileEntry === undefined) {
                continue;
            }

            const tileKey = tileEntry.tileKey;
            if (tileKey.level > maxTileLevel) {
                continue;
            }

            const proceed = dataSources.some((ds, i) => ds.shouldSubdivide(zoomLevels[i], tileKey));
            if (proceed === false) {
                continue;
            }

            const uniqueKey = TileOffsetUtils.getKeyForTileKeyAndOffset(tileKey, tileEntry.offset);
            const cachedTileEntry = this.m_tileKeyEntries.get(uniqueKey);

            assert(cachedTileEntry !== undefined);
            assert(cachedTileEntry!.area > 0);

            for (const childTileKey of tilingScheme.getSubTileKeys(tileKey)) {
                const offset = tileEntry.offset;
                const tileKeyAndOffset = TileOffsetUtils.getKeyForTileKeyAndOffset(
                    childTileKey,
                    offset
                );

                assert(this.m_tileKeyEntries.get(tileKeyAndOffset) === undefined);

                const geoBox = getGeoBox(tilingScheme, childTileKey, offset);

                if (useElevationRangeSource) {
                    const range = elevationRangeSource!.getElevationRange(childTileKey);
                    geoBox.southWest.altitude = range.minElevation;
                    geoBox.northEast.altitude = range.maxElevation;

                    calculationFinal =
                        calculationFinal &&
                        range.calculationStatus === CalculationStatus.FinalPrecise;
                }

                let subTileArea = 0;

                if (this.m_projection.type === ProjectionType.Spherical) {
                    const obb = new OrientedBox3();
                    this.m_projection.projectBox(geoBox, obb);
                    if (obb.intersects(this.m_frustum)) {
                        subTileArea = 1;
                    }
                } else {
                    this.m_projection.projectBox(geoBox, tileBounds);
                    subTileArea = this.computeSubTileArea(tileBounds);
                }

                if (subTileArea > 0) {
                    const subTileEntry = new TileKeyEntry(childTileKey, subTileArea, offset);
                    this.m_tileKeyEntries.set(tileKeyAndOffset, subTileEntry);
                    workList.push(subTileEntry);
                }
            }
        }
        return { tileKeyEntries: this.m_tileKeyEntries, calculationFinal };
    }

    // Computes the rough screen area of the supplied box.
    // TileBounds must be in world space.
    private computeSubTileArea(tileBounds: THREE.Box3) {
        if (
            (!this.m_extendedFrustumCulling ||
                this.m_mapTileCuller.frustumIntersectsTileBox(tileBounds)) &&
            this.m_frustum.intersectsBox(tileBounds)
        ) {
            const contour = [
                new THREE.Vector3(tileBounds.min.x, tileBounds.min.y, 0).applyMatrix4(
                    this.m_viewProjectionMatrix
                ),
                new THREE.Vector3(tileBounds.max.x, tileBounds.min.y, 0).applyMatrix4(
                    this.m_viewProjectionMatrix
                ),
                new THREE.Vector3(tileBounds.max.x, tileBounds.max.y, 0).applyMatrix4(
                    this.m_viewProjectionMatrix
                ),
                new THREE.Vector3(tileBounds.min.x, tileBounds.max.y, 0).applyMatrix4(
                    this.m_viewProjectionMatrix
                )
            ];

            contour.push(contour[0]);

            const n = contour.length;

            let subTileArea = 0;
            for (let p = n - 1, q = 0; q < n; p = q++) {
                subTileArea += contour[p].x * contour[q].y - contour[q].x * contour[p].y;
            }

            return Math.abs(subTileArea * 0.5);
        }
        return 0;
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
        const tileWrappingEnabled = this.m_projection.type === ProjectionType.Planar;
        if (!tileWrappingEnabled) {
            this.m_rootTileKeys.push(new TileKeyEntry(rootTileKey, 0));
            return;
        }

        const worldGeoPoint = this.m_projection.unprojectPoint(worldCenter);
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
        const cameraPitch = MapViewUtils.extractYawPitchRoll(
            camera.quaternion,
            this.m_projection.type
        ).pitch;
        // Ensure that the aspect is >= 1.
        const aspect = camera.aspect > 1 ? camera.aspect : 1 / camera.aspect;
        // Angle between a->d2, note, the fov is vertical, hence we translate to horizontal.
        const totalAngleRad = MathUtils.degToRad((camera.fov * aspect) / 2) + cameraPitch;
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
        const worldLeftGeoPoint = this.m_projection.unprojectPoint(worldLeftPoint);
        // We multiply by SQRT2 because we need to account for a rotated view (in which case there
        // are more tiles that can be seen).
        const offsetRange = MathUtils.clamp(
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
            this.m_rootTileKeys.push(new TileKeyEntry(rootTileKey, 0, offset));
        }
    }
}
