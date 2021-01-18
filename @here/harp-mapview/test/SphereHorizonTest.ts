/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { GeoCoordinates, sphereProjection } from "@here/harp-geoutils";
import { expect } from "chai";
import { MathUtils, PerspectiveCamera, Vector3 } from "three";

import { CanvasSide, SphereHorizon } from "../lib/SphereHorizon";
import { MapViewUtils } from "../lib/Utils";

describe("SphereHorizon", function () {
    const eps = 1e-10;
    const vFov = 40;
    const canvasHeight = 800;
    const projection = sphereProjection;
    let focalLength = 256;
    let camera: PerspectiveCamera;
    const camXAxis = new Vector3();
    const camYAxis = new Vector3();
    const camZAxis = new Vector3();
    let horizon: SphereHorizon;

    function setCamera(
        zoomLevel: number,
        tilt: number = 0,
        heading: number = 0,
        geoTarget: GeoCoordinates = new GeoCoordinates(0, 0)
    ) {
        MapViewUtils.getCameraRotationAtTarget(
            projection,
            geoTarget,
            -heading,
            tilt,
            camera.quaternion
        );
        const distance = MapViewUtils.calculateDistanceFromZoomLevel({ focalLength }, zoomLevel);
        MapViewUtils.getCameraPositionFromTargetCoordinates(
            geoTarget,
            distance,
            -heading,
            tilt,
            projection,
            camera.position
        );
        camera.updateMatrixWorld(true);
        camera.matrix.extractBasis(camXAxis, camYAxis, camZAxis);
        horizon = new SphereHorizon(camera);
    }

    function checkPointInHorizon(point: Vector3) {
        const tangent = new Vector3().subVectors(camera.position, point);
        expect(Math.abs(tangent.angleTo(point))).closeTo(Math.PI / 2, eps);
    }

    function getHorizonPointT(point: Vector3) {
        checkPointInHorizon(point);
        const pointVec = point.clone().normalize();
        const x = pointVec.dot(camXAxis);
        const y = pointVec.dot(camYAxis);
        const angle = Math.atan2(y, x);
        return angle >= 0 ? angle / (2 * Math.PI) : 1 + angle / (2 * Math.PI);
    }

    before(function () {
        focalLength = MapViewUtils.calculateFocalLengthByVerticalFov(
            MathUtils.degToRad(vFov),
            canvasHeight
        );
    });

    beforeEach(function () {
        camera = new PerspectiveCamera(vFov);
        setCamera(3);
    });

    afterEach(function () {});

    describe("getPoint", function () {
        it("returns point in horizon at the specified angular parameter", function () {
            for (let t = 0; t <= 1; t += 0.05) {
                expect(getHorizonPointT(horizon.getPoint(t))).closeTo(t, eps);
            }
        });

        it("uses the passed angle range if specified", function () {
            expect(getHorizonPointT(horizon.getPoint(0, 0.25, 0.75))).closeTo(0.25, eps);
            expect(getHorizonPointT(horizon.getPoint(0.5, 0.25, 0.75))).closeTo(0.5, eps);
            expect(getHorizonPointT(horizon.getPoint(1, 0.25, 0.75))).closeTo(0.75, eps);
        });

        it("wraps around arcEnd when it's less than the arcStart", function () {
            expect(getHorizonPointT(horizon.getPoint(0.5, 0.25, -0.25))).closeTo(0.5, eps);
        });
    });

    describe("getDivisionPoints", function () {
        it("returns horizon subdivided with multiple equidistant points", function () {
            const points: number[] = [];

            horizon.getDivisionPoints(point => {
                points.push(getHorizonPointT(point));
            });
            expect(points).has.length.greaterThan(4);

            const diffT = points[1] - points[0];
            for (let i = 1; i < points.length - 1; i++) {
                expect(points[i + 1] - points[i]).closeTo(diffT, eps);
            }
        });

        it("uses by the default the whole horizon circle", function () {
            const points: number[] = [];
            horizon.getDivisionPoints(point => {
                points.push(getHorizonPointT(point));
            });
            expect(points[0]).closeTo(0, eps);
            const diffT = points[1] - points[0];
            // last point (corresponding to t = 1 is omitted).
            expect(points[points.length - 1] + diffT).closeTo(1, eps);
        });

        it("uses the passed parameter range if specified", function () {
            const points: number[] = [];
            horizon.getDivisionPoints(
                point => {
                    points.push(getHorizonPointT(point));
                },
                0.66,
                0.9
            );
            expect(points[0]).closeTo(0.66, eps);
            const diffT = points[1] - points[0];
            // last point (corresponding to t = 1 is omitted).
            expect(points[points.length - 1] + diffT).closeTo(0.9, eps);
        });

        it("wraps around tEnd when it's less than the tStart", function () {
            const points: number[] = [];
            horizon.getDivisionPoints(
                point => {
                    points.push(getHorizonPointT(point));
                },
                0.66,
                -0.1
            );
            expect(points[0]).closeTo(0.66, eps);
            const diffT = points[1] - points[0];
            // last point (corresponding to t = 1 is omitted).
            expect(points[points.length - 1] + diffT).closeTo(0.9, eps);
        });
    });

    describe("isFullyVisible", function () {
        it("returns true only when globe is fully in view", function () {
            setCamera(3);
            expect(horizon.isFullyVisible).to.be.true;

            setCamera(3, 80);
            expect(horizon.isFullyVisible).to.be.false;

            setCamera(4);
            expect(horizon.isFullyVisible).to.be.false;
        });
    });

    describe("getSideIntersections", function () {
        it("returns middle tangent point if horizon is fully visible", function () {
            setCamera(3);
            expect(horizon.getSideIntersections(CanvasSide.Bottom)).has.members([0.75]);
            expect(horizon.getSideIntersections(CanvasSide.Right)).has.members([0]);
            expect(horizon.getSideIntersections(CanvasSide.Top)).has.members([0.25]);
            expect(horizon.getSideIntersections(CanvasSide.Left)).has.members([0.5]);
        });

        it("returns 1 side intersection if start corner hits world", function () {
            setCamera(6, 80);
            const rightIntersections = horizon.getSideIntersections(CanvasSide.Right);
            expect(rightIntersections).has.length(1);
            expect(horizon.getPoint(rightIntersections[0]).project(camera).x).closeTo(1, eps);

            const leftIntersections = horizon.getSideIntersections(CanvasSide.Left);
            expect(leftIntersections).has.length(1);
            expect(horizon.getPoint(leftIntersections[0]).project(camera).x).closeTo(-1, eps);
        });

        it("returns 2 side intersections if corners out of world", function () {
            setCamera(4);
            const bottomIntersections = horizon.getSideIntersections(CanvasSide.Bottom);
            expect(bottomIntersections).has.length(2);
            expect(horizon.getPoint(bottomIntersections[0]).project(camera).y).closeTo(-1, eps);
            expect(horizon.getPoint(bottomIntersections[1]).project(camera).y).closeTo(-1, eps);

            const rightIntersections = horizon.getSideIntersections(CanvasSide.Right);
            expect(rightIntersections).has.length(2);
            expect(horizon.getPoint(rightIntersections[0]).project(camera).x).closeTo(1, eps);
            expect(horizon.getPoint(rightIntersections[1]).project(camera).x).closeTo(1, eps);

            const topIntersections = horizon.getSideIntersections(CanvasSide.Top);
            expect(topIntersections).has.length(2);
            expect(horizon.getPoint(topIntersections[0]).project(camera).y).closeTo(1, eps);
            expect(horizon.getPoint(topIntersections[1]).project(camera).y).closeTo(1, eps);

            const leftIntersections = horizon.getSideIntersections(CanvasSide.Left);
            expect(leftIntersections).has.length(2);
            expect(horizon.getPoint(leftIntersections[0]).project(camera).x).closeTo(-1, eps);
            expect(horizon.getPoint(leftIntersections[1]).project(camera).x).closeTo(-1, eps);
        });
    });
});
