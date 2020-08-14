/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    EarthConstants,
    GeoCoordinates,
    GeoPolygon,
    GeoPolygonCoordinates,
    Projection,
    ProjectionType
} from "@here/harp-geoutils";
import { LoggerManager } from "@here/harp-utils";
import { Frustum, Line3, Matrix4, PerspectiveCamera, Plane, Ray, Vector3 } from "three";

import { TileCorners } from "./geometry/TileGeometryCreator";
import { MapViewUtils } from "./Utils";

const logger = LoggerManager.instance.create("BoundsGenerator");

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
        private readonly m_tileWrappingEnabled: boolean = false
    ) {}

    set projection(projection: Projection) {
        this.m_projection = projection;
    }

    /**
     * Generates an Array of GeoCoordinates covering the visible map.
     * The coordinates are sorted to ccw winding, so a polygon could be drawn with them.
     */
    generate(): GeoPolygon | undefined {
        //TODO: support spherical projection

        //!!!!!!!ALTITUDE IS NOT TAKEN INTO ACCOUNT!!!!!!!!!
        const coordinates: GeoCoordinates[] = [];

        //CASE A: FLAT PROJECTION
        if (this.m_projection.type === ProjectionType.Planar) {
            // 1.) Raycast into all four corners of the canvas
            //     => if an intersection is found, add it to the polygon
            this.addCanvasCornerIntersection(coordinates);

            // => All 4 corners found an intersection, therefore the screen is covered with the map
            // and the polygon complete
            if (coordinates.length === 4) {
                return new GeoPolygon(coordinates as GeoPolygonCoordinates, true);
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

            if (!this.m_tileWrappingEnabled) {
                // 3.) If no wrapping, check if any corners of the world plane are inside the view
                //     => if true, add it to the polygon
                [worldCorners.ne, worldCorners.nw, worldCorners.se, worldCorners.sw].forEach(
                    corner => {
                        this.addPointInFrustum(corner, frustum, coordinates);
                    }
                );
            }

            //4.) Check for any edges of the world plane intersecting with the frustum?
            //    => if true, add to polygon

            if (!this.m_tileWrappingEnabled) {
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
        } else {
            logger.error("This ProjectionType", this.m_projection, " is not yet supported!");
        }

        // 5.) Create the Polygon and set needsSort to `true`as we expect it to be convex and
        //     sortable
        if (coordinates.length > 2) {
            return new GeoPolygon(coordinates as GeoPolygonCoordinates, true);
        }
        return undefined;
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

    private addCanvasCornerIntersection(geoPolygon: GeoCoordinates[]) {
        this.addNDCRayIntersection(
            [
                [-1, -1], //lower left
                [-1, 1], //upper left
                [1, 1], //upper right
                [1, -1] //lower right
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
                !this.m_tileWrappingEnabled &&
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
