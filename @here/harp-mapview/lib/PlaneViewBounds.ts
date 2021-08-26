/*
 * Copyright (C) 2021 HERE Europe B.V.
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
import { assert } from "@here/harp-utils";
import { Frustum, Line3, Matrix4, PerspectiveCamera, Plane, Ray, Vector3 } from "three";

import { TileCorners } from "./geometry/ProjectTilePlaneCorners";
import { MapViewUtils } from "./Utils";
import { ViewBounds } from "./ViewBounds";

/**
 * Generates Bounds for a camera view and a planar projection.
 *
 * @internal
 */
export class PlaneViewBounds implements ViewBounds {
    private readonly m_groundPlaneNormal = new Vector3(0, 0, 1);
    private readonly m_groundPlane = new Plane(this.m_groundPlaneNormal.clone());

    constructor(
        readonly camera: PerspectiveCamera,
        readonly projection: Projection,
        private readonly m_options: { tileWrappingEnabled: boolean }
    ) {
        assert(projection.type === ProjectionType.Planar);
    }

    /**
     * @override
     */
    generate(): GeoPolygon | undefined {
        //!!!!!!!ALTITUDE IS NOT TAKEN INTO ACCOUNT!!!!!!!!!
        const coordinates: GeoCoordinates[] = [];

        // 1.) Raycast into all four corners of the canvas
        //     => if an intersection is found, add it to the polygon
        this.addCanvasCornerIntersection(coordinates);

        // => All 4 corners found an intersection, therefore the screen is covered with the map
        // and the polygon complete
        if (coordinates.length === 4) {
            return this.createPolygon(coordinates);
        }

        //2.) Raycast into the two corners of the horizon cutting the canvas sides
        //    => if an intersection is found, add it to the polygon
        this.addHorizonIntersection(coordinates);

        //Setup the frustum for further checks
        const frustum = new Frustum().setFromProjectionMatrix(
            new Matrix4().multiplyMatrices(
                this.camera.projectionMatrix,
                this.camera.matrixWorldInverse
            )
        );

        // Setup the world corners for further checks.
        // Cast to TileCorners as it cannot be undefined here, due to the forced
        // PlanarProjection above
        const worldCorners: TileCorners = this.getWorldConers(this.projection) as TileCorners;

        if (!this.m_options.tileWrappingEnabled) {
            // 3.) If no wrapping, check if any corners of the world plane are inside the view
            //     => if true, add it to the polygon
            [worldCorners.ne, worldCorners.nw, worldCorners.se, worldCorners.sw].forEach(corner => {
                this.addPointInFrustum(corner, frustum, coordinates);
            });
        }

        //4.) Check for any edges of the world plane intersecting with the frustum?
        //    => if true, add to polygon

        if (!this.m_options.tileWrappingEnabled) {
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
        return this.createPolygon(coordinates);
    }

    private createPolygon(coordinates: GeoCoordinates[]): GeoPolygon | undefined {
        if (coordinates.length > 2) {
            return new GeoPolygon(coordinates as GeoPolygonCoordinates, true);
        }
        return undefined;
    }

    private getWorldConers(projection: Projection): TileCorners | undefined {
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
                { camera: this.camera, projection: this.projection },
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
                [1, -1], //lower right
                [1, 1], //upper right
                [-1, 1] //upper left
            ],
            geoPolygon
        );
    }

    private validateAndAddToGeoPolygon(point: Vector3, geoPolygon: GeoCoordinates[]) {
        if (this.isInVisibleMap(point)) {
            geoPolygon.push(this.projection.unprojectPoint(point));
        }
    }

    private isInVisibleMap(point: Vector3): boolean {
        if (point.y < 0 || point.y > EarthConstants.EQUATORIAL_CIRCUMFERENCE) {
            return false;
        }

        if (
            !this.m_options.tileWrappingEnabled &&
            (point.x < 0 || point.x > EarthConstants.EQUATORIAL_CIRCUMFERENCE)
        ) {
            return false;
        }
        return true;
    }

    private addPointInFrustum(point: Vector3, frustum: Frustum, geoPolygon: GeoCoordinates[]) {
        if (frustum.containsPoint(point)) {
            const geoPoint = this.projection.unprojectPoint(point);
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
                if (MapViewUtils.closeToFrustum(intersection, this.camera)) {
                    const geoIntersection = this.projection.unprojectPoint(intersection);

                    //correct altitude caused by inaccuracies, due to large numbers to 0
                    geoIntersection.altitude = 0;
                    geoPolygon.push(geoIntersection);
                }
            }
        });
    }

    private getVerticalHorizonPositionInNDC(): number | undefined {
        const bottomMidFarPoint = new Vector3(-1, -1, 1)
            .unproject(this.camera)
            .add(new Vector3(1, -1, 1).unproject(this.camera))
            .multiplyScalar(0.5);
        const topMidFarPoint = new Vector3(-1, 1, 1)
            .unproject(this.camera)
            .add(new Vector3(1, 1, 1).unproject(this.camera))
            .multiplyScalar(0.5);
        const farPlaneVerticalCenterLine = new Line3(bottomMidFarPoint, topMidFarPoint);

        const verticalHorizonPosition: Vector3 = new Vector3();
        if (
            !this.m_groundPlane.intersectLine(farPlaneVerticalCenterLine, verticalHorizonPosition)
        ) {
            return undefined;
        }
        return verticalHorizonPosition.project(this.camera).y;
    }
}
