/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    EarthConstants,
    GeoCoordinates,
    GeoPolygon,
    GeoPolygonCoordinates,
    isAntimeridianCrossing,
    Projection,
    ProjectionType
} from "@here/harp-geoutils";
import { assert } from "@here/harp-utils";
import { Frustum, Line3, Matrix4, PerspectiveCamera, Plane, Ray, Vector2, Vector3 } from "three";

import { TileCorners } from "./geometry/ProjectTilePlaneCorners";
import { CanvasSide, SphereHorizon } from "./SphereHorizon";
import { MapViewUtils } from "./Utils";

// Rough, empirical rule to compute the number of divisions needed for a geopolygon edge to keep
// the deviation from the view bound edge it must follow within acceptable values.
function computeEdgeDivisionsForSphere(geoStart: GeoCoordinates, geoEnd: GeoCoordinates): number {
    const maxLatitudeSpan = 20;
    const maxLongitudeSpan = 5;

    const latitudeSpan = Math.abs(geoEnd.latitude - geoStart.latitude);
    const longitudeSpan = geoStart.minLongitudeSpanTo(geoEnd);
    return Math.ceil(Math.max(latitudeSpan / maxLatitudeSpan, longitudeSpan / maxLongitudeSpan));
}

function nextCanvasSide(side: CanvasSide): CanvasSide {
    return (side + 1) % 4;
}

function previousCanvasSide(side: CanvasSide): CanvasSide {
    return (side + 3) % 4;
}

const ccwCanvasCornersNDC: Array<{ x: number; y: number }> = [
    { x: -1, y: -1 }, // bottom left
    { x: 1, y: -1 }, // bottom right
    { x: 1, y: 1 }, // top right
    { x: -1, y: 1 } // top left
];

/**
 * Generates Bounds for a camera view and a projection
 *
 * @beta, @internal
 */
export class BoundsGenerator {
    private readonly m_groundPlaneNormal = new Vector3(0, 0, 1);
    private readonly m_groundPlane = new Plane(this.m_groundPlaneNormal.clone());

    constructor(
        private readonly m_camera: PerspectiveCamera,
        private m_projection: Projection,
        public tileWrappingEnabled: boolean = false
    ) {}

    set projection(projection: Projection) {
        this.m_projection = projection;
    }

    /**
     * Generates an Array of GeoCoordinates covering the visible map.
     * The coordinates are sorted to ccw winding, so a polygon could be drawn with them.
     */
    generate(): GeoPolygon | undefined {
        return this.m_projection.type === ProjectionType.Planar
            ? this.generateOnPlane()
            : this.generateOnSphere();
    }

    private createPolygon(
        coordinates: GeoCoordinates[],
        sort: boolean,
        wrapAround: boolean = false
    ): GeoPolygon | undefined {
        if (coordinates.length > 2) {
            return new GeoPolygon(coordinates as GeoPolygonCoordinates, sort, wrapAround);
        }
        return undefined;
    }

    private addSideSegmentSubdivisionsOnSphere(
        coordinates: GeoCoordinates[],
        NDCStart: { x: number; y: number },
        NDCEnd: { x: number; y: number },
        geoStart: GeoCoordinates,
        geoEnd: GeoCoordinates
    ) {
        coordinates.push(geoStart);

        const divisionCount = computeEdgeDivisionsForSphere(geoStart, geoEnd);
        if (divisionCount <= 1) {
            return;
        }

        const NDCStep = new Vector2(NDCEnd.x - NDCStart.x, NDCEnd.y - NDCStart.y).multiplyScalar(
            1 / divisionCount
        );

        const NDCDivision = new Vector2(NDCStart.x, NDCStart.y);
        for (let i = 0; i < divisionCount - 1; i++) {
            NDCDivision.add(NDCStep);
            const intersection = MapViewUtils.rayCastWorldCoordinates(
                { camera: this.m_camera, projection: this.m_projection },
                NDCDivision.x,
                NDCDivision.y
            );
            if (intersection) {
                coordinates.push(this.m_projection.unprojectPoint(intersection));
            }
        }
    }

    private addSideIntersectionsOnSphere(
        coordinates: GeoCoordinates[],
        side: CanvasSide,
        geoStartCorner?: GeoCoordinates,
        geoEndCorner?: GeoCoordinates,
        horizon?: SphereHorizon
    ) {
        assert(this.m_projection.type === ProjectionType.Spherical);

        const startNDCCorner = ccwCanvasCornersNDC[side];
        const endNDCCorner = ccwCanvasCornersNDC[nextCanvasSide(side)];

        if (geoStartCorner && geoEndCorner) {
            // No horizon visible on this side of the canvas, generate polygon vertices from
            // intersections of the canvas side with the world.
            this.addSideSegmentSubdivisionsOnSphere(
                coordinates,
                startNDCCorner,
                endNDCCorner,
                geoStartCorner,
                geoEndCorner
            );
            return;
        }

        if (!horizon) {
            return;
        }

        // Bounds on this side of the canvas need to be completed with the horizon.
        const horizonIntersections = horizon.getSideIntersections(side);
        if (horizonIntersections.length === 0) {
            return;
        }

        if (geoStartCorner) {
            // Generate polygon vertices from intersections of this canvas side with the world
            // from its starting corner till the last intersection with the horizon.

            const worldHorizonPoint = horizon.getPoint(
                horizonIntersections[horizonIntersections.length - 1]
            );
            const geoHorizonPoint = this.m_projection.unprojectPoint(worldHorizonPoint);
            this.addSideSegmentSubdivisionsOnSphere(
                coordinates,
                startNDCCorner,
                worldHorizonPoint.project(this.m_camera),
                geoStartCorner,
                geoHorizonPoint
            );
        } else {
            // Subdivide horizon from last horizon intersection on previous side to this side first.
            const prevSide = previousCanvasSide(side);
            let prevSideIntersections = horizon.getSideIntersections(prevSide);
            if (prevSideIntersections.length === 0) {
                // When bottom canvas side cuts the horizon above its center, right horizon
                // tangent is not visible. Last horizon tangent is top one.
                prevSideIntersections = horizon.getSideIntersections(previousCanvasSide(prevSide));
            }
            assert(prevSideIntersections.length > 0);

            horizon.getDivisionPoints(
                point => {
                    coordinates.push(this.m_projection.unprojectPoint(point));
                },
                prevSideIntersections[prevSideIntersections.length - 1],
                horizonIntersections[0]
            );
        }

        if (horizonIntersections.length > 1) {
            // Subdivide side segment between two horizon intersections.
            const worldHorizonStart = horizon.getPoint(horizonIntersections[0]);
            const worldHorizonEnd = horizon.getPoint(horizonIntersections[1]);
            const geoHorizonStart = this.m_projection.unprojectPoint(worldHorizonStart);
            const geoHorizonEnd = this.m_projection.unprojectPoint(worldHorizonEnd);

            this.addSideSegmentSubdivisionsOnSphere(
                coordinates,
                worldHorizonStart.project(this.m_camera),
                worldHorizonEnd.project(this.m_camera),
                geoHorizonStart,
                geoHorizonEnd
            );
        }

        if (geoEndCorner) {
            // Subdivice side segment from last horizon intersection to the ending corner of this
            // canvas side.
            const worldHorizonPoint = horizon.getPoint(horizonIntersections[0]);
            const geoHorizonPoint = this.m_projection.unprojectPoint(worldHorizonPoint);
            this.addSideSegmentSubdivisionsOnSphere(
                coordinates,
                worldHorizonPoint.project(this.m_camera),
                endNDCCorner,
                geoHorizonPoint,
                geoEndCorner
            );
        }
    }

    private findBoundsIntersectionsOnSphere(): GeoCoordinates[] {
        assert(this.m_projection.type === ProjectionType.Spherical);

        const cornerCoordinates: GeoCoordinates[] = [];
        const coordinates: GeoCoordinates[] = [];

        this.addCanvasCornerIntersection(cornerCoordinates);

        // Horizon points need to be added to complete the bounds if not all canvas corners
        // intersect with the world.
        const horizon = cornerCoordinates.length < 4 ? new SphereHorizon(this.m_camera) : undefined;

        if (cornerCoordinates.length === 0 && horizon!.isFullyVisible) {
            // Bounds are generated entirely from equidistant points obtained from the horizon
            // circle.
            horizon!.getDivisionPoints(point => {
                coordinates.push(this.m_projection.unprojectPoint(point));
            });
            return coordinates;
        }

        cornerCoordinates.length = 4;
        for (let side = CanvasSide.Bottom; side < 4; side++) {
            const startCorner = cornerCoordinates[side];
            const endCorner = cornerCoordinates[nextCanvasSide(side)];
            this.addSideIntersectionsOnSphere(coordinates, side, startCorner, endCorner, horizon);
        }
        return coordinates;
    }

    private wrapAroundPoles(coordinates: GeoCoordinates[]) {
        // If one of the poles is inside the view bounds, the polygon would have to cover the pole,
        // which is not possible in geo space. Instead, additional vertices (numbered in order from
        // 1 to 6 in the diagram below) are added to the polygon so that it wraps around the pole,
        // covering the same area(except for the pole circle that cannot be mapped to geospace).
        // The globe is cut in two hemispheres by the meridians at the camera longitude (camLon) and
        // its antimeridian (at camLon+180). Then, the polygon side crossing the camera antimeridian
        // is found, and the new pole wrapping vertices are inserted between its start and end
        // vertices.
        //
        //    (end) hem.crossing side (start)
        //        \|<-------------->|/
        // x-------x------6!--------x--------x
        // |         , - ~5!1 ~ -,           |
        // |     , '       !       ' ,       |
        // |   ,           !           ,     |
        // |  ,            !            ,    |
        // | ,             !             ,   |
        // | 4           POLE            2   | <- Bounds polygon
        // | ,             !             ,   |
        // |  ,            !            ,    |
        // |   ,           !           ,     |
        // |     ,         !         ,'      |
        // |       ' -_, _ ! _ ,_ -'         |
        // |               3                 |
        // x---------------!-----------------x
        //                 ! <- hemisphere partition

        const northPoleCenter = new Vector3(0, 0, EarthConstants.EQUATORIAL_RADIUS);
        const southPoleCenter = new Vector3(0, 0, -EarthConstants.EQUATORIAL_RADIUS);
        const northPoleInView = MapViewUtils.closeToFrustum(northPoleCenter, this.m_camera);
        const southPoleInView = MapViewUtils.closeToFrustum(southPoleCenter, this.m_camera);

        if (!northPoleInView && !southPoleInView) {
            return;
        }

        // Create first wrapping vertex (number 1 in the diagram above).
        const camLon = this.m_projection.unprojectPoint(this.m_camera.position).lng;
        const wrapLat = northPoleInView ? 90 : -90;
        const wrapLon = northPoleInView ? camLon + 180 : camLon - 180;
        const geoWrapTopRight = new GeoCoordinates(wrapLat, wrapLon);
        const geoWrapTopRightNorm = geoWrapTopRight.normalized();

        // Find the polygon side crossing the camera antimeridian.
        const crossLon = geoWrapTopRightNorm.lng;
        let prevLon = coordinates[coordinates.length - 1].lng;
        // Check whether the camera antimeridian crossing also crosses greenwich antimerdian.
        let isGwAntimerCross = false;
        const hSphereCrossEndIndex = coordinates.findIndex((value: GeoCoordinates) => {
            const crossesAntimer = isAntimeridianCrossing(prevLon, value.lng);
            const sameSign = Math.sign(crossLon - value.lng) === Math.sign(crossLon - prevLon);
            if (sameSign === crossesAntimer) {
                isGwAntimerCross = crossesAntimer;
                return true;
            }
            prevLon = value.lng;
            return false;
        });

        if (hSphereCrossEndIndex < 0) {
            // No polygon side crosses the camera antimeridian, meaning that the polygon doesn't
            // actually go above the pole to the other side of the world, no wrapping needed.
            return;
        }

        // Create rest of wrapping vertices at pole's latitude (vertices 2-5 in diagram above).
        const wrapSideOffset = northPoleInView ? 90 : -90;
        const wrapCornerOffset = northPoleInView ? 0.00001 : -0.00001;

        // Added to ensure antimeridian crossing detection when coordinates are wrapped around it by
        // GeoPolygon (all polygon sides must have longitude spans smaller than 180 degrees).
        const geoWrapRight = new GeoCoordinates(wrapLat, camLon + wrapSideOffset).normalized();
        const geoWrapBottom = new GeoCoordinates(wrapLat, camLon).normalized();

        // Added to ensure antimeridian crossing detection when coordinates are wrapped around it by
        // GeoPolygon (all polygon sides must have longitude spans smaller than 180 degrees).
        const geoWrapLeft = new GeoCoordinates(wrapLat, camLon - wrapSideOffset).normalized();
        const geoWrapTopLeft = new GeoCoordinates(wrapLat, wrapLon + wrapCornerOffset).normalized();

        const hSphereCrossStartIndex =
            (hSphereCrossEndIndex + coordinates.length - 1) % coordinates.length;
        const crossStart = coordinates[hSphereCrossStartIndex];
        const crossEnd = coordinates[hSphereCrossEndIndex];

        // Last wrapping vertex (number 6) is linearly interpolated at the polygon side crossing the
        // camera antimeridian.
        let crossLerp = GeoCoordinates.lerp(crossStart, crossEnd, 0.01, isGwAntimerCross);
        if (isGwAntimerCross && northPoleInView) {
            crossLerp.longitude -= 360;
        } else {
            crossLerp = crossLerp.normalized();
        }

        // Add the wrapping vertices to the array in the proper order (see diagram above).
        coordinates.splice(
            hSphereCrossEndIndex,
            0,
            wrapLon < -180 ? geoWrapTopRight : geoWrapTopRightNorm, // 1
            geoWrapRight, // 2
            geoWrapBottom, // 3
            geoWrapLeft, // 4
            geoWrapTopLeft, // 5
            crossLerp // 6
        );
    }

    private generateOnSphere(): GeoPolygon | undefined {
        assert(this.m_projection.type === ProjectionType.Spherical);

        const coordinates = this.findBoundsIntersectionsOnSphere();

        this.wrapAroundPoles(coordinates);

        return this.createPolygon(coordinates, false, true);
    }

    private generateOnPlane(): GeoPolygon | undefined {
        //!!!!!!!ALTITUDE IS NOT TAKEN INTO ACCOUNT!!!!!!!!!
        const coordinates: GeoCoordinates[] = [];

        // 1.) Raycast into all four corners of the canvas
        //     => if an intersection is found, add it to the polygon
        this.addCanvasCornerIntersection(coordinates);

        // => All 4 corners found an intersection, therefore the screen is covered with the map
        // and the polygon complete
        if (coordinates.length === 4) {
            return this.createPolygon(coordinates, true);
        }

        //2.) Raycast into the two corners of the horizon cutting the canvas sides
        //    => if an intersection is found, add it to the polygon
        this.addHorizonIntersection(coordinates);

        //Setup the frustum for further checks
        const frustum = new Frustum().setFromProjectionMatrix(
            new Matrix4().multiplyMatrices(
                this.m_camera.projectionMatrix,
                this.m_camera.matrixWorldInverse
            )
        );

        // Setup the world corners for further checks.
        // Cast to TileCorners as it cannot be undefined here, due to the forced
        // PlanarProjection above
        const worldCorners: TileCorners = this.getWorldConers(this.m_projection) as TileCorners;

        if (!this.tileWrappingEnabled) {
            // 3.) If no wrapping, check if any corners of the world plane are inside the view
            //     => if true, add it to the polygon
            [worldCorners.ne, worldCorners.nw, worldCorners.se, worldCorners.sw].forEach(corner => {
                this.addPointInFrustum(corner, frustum, coordinates);
            });
        }

        //4.) Check for any edges of the world plane intersecting with the frustum?
        //    => if true, add to polygon

        if (!this.tileWrappingEnabled) {
            // if no tile wrapping:
            //       check with limited lines around the world edges
            [
                new Line3(worldCorners.sw, worldCorners.se), // south edge
                new Line3(worldCorners.ne, worldCorners.nw), // north edge
                new Line3(worldCorners.se, worldCorners.ne), // east edge
                new Line3(worldCorners.nw, worldCorners.sw) //  west edge
            ].forEach(edge => {
                this.addFrustumIntersection(edge, frustum, coordinates);
            });
        } else {
            // if tile wrapping:
            //       check for intersections with rays along the south and north edges
            const directionEast = new Vector3() //west -> east
                .subVectors(worldCorners.sw, worldCorners.se)
                .normalize();
            const directionWest = new Vector3() //east -> west
                .subVectors(worldCorners.se, worldCorners.sw)
                .normalize();

            [
                new Ray(worldCorners.se, directionEast), // south east ray
                new Ray(worldCorners.se, directionWest), // south west ray
                new Ray(worldCorners.ne, directionEast), // north east ray
                new Ray(worldCorners.ne, directionWest) //  north west ray
            ].forEach(ray => {
                this.addFrustumIntersection(ray, frustum, coordinates);
            });
        }

        // 5.) Create the Polygon and set needsSort to `true`as we expect it to be convex and
        //     sortable
        return this.createPolygon(coordinates, true);
    }

    private getWorldConers(projection: Projection): TileCorners | undefined {
        if (projection.type !== ProjectionType.Planar) {
            return;
        }
        const worldBox = projection.worldExtent(0, 0);
        return {
            sw: worldBox.min as Vector3,
            se: new Vector3(worldBox.max.x, worldBox.min.y, 0),
            nw: new Vector3(worldBox.min.x, worldBox.max.y, 0),
            ne: worldBox.max as Vector3
        };
    }

    private addNDCRayIntersection(
        ndcPoints: Array<[number, number]>,
        geoPolygon: GeoCoordinates[]
    ) {
        ndcPoints.forEach(corner => {
            const intersection = MapViewUtils.rayCastWorldCoordinates(
                { camera: this.m_camera, projection: this.m_projection },
                corner[0],
                corner[1]
            );
            if (intersection) {
                this.validateAndAddToGeoPolygon(intersection, geoPolygon);
            }
        });
    }

    private addHorizonIntersection(geoPolygon: GeoCoordinates[]) {
        if (this.m_projection.type === ProjectionType.Planar) {
            const verticalHorizonPosition = this.getVerticalHorizonPositionInNDC();
            if (!verticalHorizonPosition) {
                return;
            }
            this.addNDCRayIntersection(
                [
                    [-1, verticalHorizonPosition], //horizon left
                    [1, verticalHorizonPosition] //horizon right
                ],
                geoPolygon
            );
        }
    }

    private addCanvasCornerIntersection(geoPolygon: GeoCoordinates[]) {
        this.addNDCRayIntersection(
            [
                [-1, -1], //lower left
                [1, -1], //lower right
                [1, 1], //upper right
                [-1, 1] //upper left
            ],
            geoPolygon
        );
    }

    private validateAndAddToGeoPolygon(point: Vector3, geoPolygon: GeoCoordinates[]) {
        if (this.isInVisibleMap(point)) {
            geoPolygon.push(this.m_projection.unprojectPoint(point));
        }
    }

    private isInVisibleMap(point: Vector3): boolean {
        if (this.m_projection.type === ProjectionType.Planar) {
            if (point.y < 0 || point.y > EarthConstants.EQUATORIAL_CIRCUMFERENCE) {
                return false;
            }

            if (
                !this.tileWrappingEnabled &&
                (point.x < 0 || point.x > EarthConstants.EQUATORIAL_CIRCUMFERENCE)
            ) {
                return false;
            }
        }
        return true;
    }

    private addPointInFrustum(point: Vector3, frustum: Frustum, geoPolygon: GeoCoordinates[]) {
        if (frustum.containsPoint(point)) {
            const geoPoint = this.m_projection.unprojectPoint(point);
            geoPoint.altitude = 0;
            geoPolygon.push(geoPoint);
        }
    }

    private addFrustumIntersection(
        edge: Line3 | Ray,
        frustum: Frustum,
        geoPolygon: GeoCoordinates[]
    ) {
        frustum.planes.forEach(plane => {
            let intersection: Vector3 | null | undefined = null;
            const target: Vector3 = new Vector3();
            if (edge instanceof Ray && edge.intersectsPlane(plane)) {
                intersection = edge.intersectPlane(plane, target);
            } else if (edge instanceof Line3 && plane.intersectsLine(edge)) {
                intersection = plane.intersectLine(edge, target);
            }

            if (intersection) {
                //uses this check to fix inaccuracies
                if (MapViewUtils.closeToFrustum(intersection, this.m_camera)) {
                    const geoIntersection = this.m_projection.unprojectPoint(intersection);

                    //correct altitude caused by inaccuracies, due to large numbers to 0
                    geoIntersection.altitude = 0;
                    geoPolygon.push(geoIntersection);
                }
            }
        });
    }

    private getVerticalHorizonPositionInNDC(): number | undefined {
        if (this.m_projection.type !== ProjectionType.Planar) {
            return undefined;
        }

        const bottomMidFarPoint = new Vector3(-1, -1, 1)
            .unproject(this.m_camera)
            .add(new Vector3(1, -1, 1).unproject(this.m_camera))
            .multiplyScalar(0.5);
        const topMidFarPoint = new Vector3(-1, 1, 1)
            .unproject(this.m_camera)
            .add(new Vector3(1, 1, 1).unproject(this.m_camera))
            .multiplyScalar(0.5);
        const farPlaneVerticalCenterLine = new Line3(bottomMidFarPoint, topMidFarPoint);

        const verticalHorizonPosition: Vector3 = new Vector3();
        if (
            !this.m_groundPlane.intersectLine(farPlaneVerticalCenterLine, verticalHorizonPosition)
        ) {
            return undefined;
        }
        return verticalHorizonPosition.project(this.m_camera).y;
    }
}
