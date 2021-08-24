/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { GeoCoordinates, sphereProjection, Vector2Like } from "@here/harp-geoutils";
import { expect } from "chai";
import { MathUtils, PerspectiveCamera, Vector3 } from "three";

import { CameraUtils } from "../lib/CameraUtils";
import { CanvasSide, previousCanvasSide, SphereHorizon } from "../lib/SphereHorizon";
import { MapViewUtils } from "../lib/Utils";

describe("SphereHorizon", function () {
    const eps = 1e-10;
    const projection = sphereProjection;
    let camera: PerspectiveCamera;
    const camXAxis = new Vector3();
    const camYAxis = new Vector3();
    const camZAxis = new Vector3();
    let horizon: SphereHorizon;

    function setCamera(
        zoomLevel: number,
        tilt: number = 0,
        ppalPoint: Vector2Like = { x: 0, y: 0 },
        canvasCorners: boolean[] = new Array(4).fill(false) // corners intersecting the world
    ) {
        const geoTarget = new GeoCoordinates(0, 0);
        const heading = 0;
        const canvasHeight = 800;
        camera.fov = 40;

        CameraUtils.setPrincipalPoint(camera, ppalPoint);

        const vFovRad = MathUtils.degToRad(camera.fov);
        const focalLength = CameraUtils.computeFocalLength(camera, vFovRad, canvasHeight);
        CameraUtils.setVerticalFovAndFocalLength(camera, vFovRad, focalLength, canvasHeight);

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
        horizon = new SphereHorizon(camera, canvasCorners);
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

    function checkSideTangent(side: CanvasSide) {
        const expectedTangents = [0.75, 0, 0.25, 0.5]; // ccw order starting with bottom side.
        expect(horizon.getSideIntersections(side)).has.members([expectedTangents[side]]);
    }

    // Check that intersections are on the expected canvas side when projected and that their
    // parameters at the horizon circle are in the expected ranges.
    function checkSideIntersections(
        side: CanvasSide,
        expectIntersections: [boolean, boolean] = [true, true] // [start, end]
    ): number[] {
        let ndc: { x?: number; y?: number };
        let tRanges: Array<[number, number]>; // first range for start intersection, then for end.

        switch (side) {
            case CanvasSide.Bottom:
                ndc = { y: -1 };
                tRanges = [
                    [0.5, 0.75],
                    [0.75, 1]
                ];
                break;
            case CanvasSide.Right:
                ndc = { x: 1 };
                tRanges = [
                    [0.75, 1],
                    [0, 0.25]
                ];
                break;
            case CanvasSide.Top:
                ndc = { y: 1 };
                tRanges = [
                    [0, 0.25],
                    [0.25, 0.5]
                ];
                break;
            case CanvasSide.Left:
                ndc = { x: -1 };
                tRanges = [
                    [0.25, 0.5],
                    [0.5, 0.75]
                ];
                break;
        }
        tRanges = tRanges.filter((val, index) => expectIntersections[index]);

        const intersections = horizon.getSideIntersections(side);
        expect(intersections).has.lengthOf(tRanges.length);
        if (intersections.length === 0) {
            return intersections;
        }

        // Horizon intersection computations are done in horizon space, then transformed to world
        // space and projected when needed. This introduces a noticeable loss of precision in NDC
        // space, due to which canvas side intersections end up sometimes slightly out of the
        // clipping volume. Worst case happens in off-center projections, with an error ~1.5%.
        const ndcEps = 0.031;
        for (let i = 0; i < intersections.length; ++i) {
            const intersection = intersections[i];
            if (ndc.x !== undefined) {
                expect(horizon.getPoint(intersection).project(camera).x).closeTo(ndc.x, ndcEps);
            }
            if (ndc.y !== undefined) {
                expect(horizon.getPoint(intersection).project(camera).y).closeTo(ndc.y, ndcEps);
            }
            const tRange = tRanges[i];
            expect(intersection).gt(tRange[0]).and.lt(tRange[1]);
        }
        if (side !== CanvasSide.Right) {
            const prevIntersections = horizon.getSideIntersections(previousCanvasSide(side));
            if (
                (side !== CanvasSide.Top && prevIntersections.length > 0) ||
                prevIntersections.length > 1
            ) {
                expect(intersections[0]).gt(prevIntersections[prevIntersections.length - 1]);
            }
        }
        return intersections;
    }

    beforeEach(function () {
        camera = new PerspectiveCamera();
        setCamera(3);
    });

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
        // Left intersections different from right onese for off-center projection.

        // made tangent points visible/invisible by offsetting ppal point.
        it("returns middle tangent point if horizon is fully visible", function () {
            setCamera(3);
            checkSideTangent(CanvasSide.Bottom);
            checkSideTangent(CanvasSide.Right);
            checkSideTangent(CanvasSide.Top);
            checkSideTangent(CanvasSide.Left);
        });

        it("returns 1 side intersection if start corner hits world", function () {
            setCamera(6, 80);
            const rightIntersections = checkSideIntersections(CanvasSide.Right, [false, true]);
            const leftIntersections = checkSideIntersections(CanvasSide.Left, [true, false]);
            expect(leftIntersections[0]).equals(0.5 - rightIntersections[0]);
        });

        it("returns 2 side intersections if corners out of world", function () {
            setCamera(4);
            const bottomIntersections = checkSideIntersections(CanvasSide.Bottom);
            expect(bottomIntersections[1]).closeTo(1.5 - bottomIntersections[0], eps);

            const rightIntersections = checkSideIntersections(CanvasSide.Right);
            expect(rightIntersections[1]).closeTo(1 - rightIntersections[0], eps);

            const topIntersections = checkSideIntersections(CanvasSide.Top);
            expect(topIntersections[1]).closeTo(0.5 - topIntersections[0], eps);

            const leftIntersections = checkSideIntersections(CanvasSide.Left);
            expect(leftIntersections[1]).closeTo(1 - leftIntersections[0], eps);
            // Left intersections are symmetric to right ones.
            expect(leftIntersections[0]).equals(0.5 - rightIntersections[1]);
            expect(leftIntersections[1]).equals(0.5 + (1 - rightIntersections[0]));
        });

        describe("off-center projection", function () {
            describe("no canvas corner intersections", function () {
                it("hidden left tangent", function () {
                    setCamera(3, 0, { x: -0.5, y: 0 });
                    checkSideTangent(CanvasSide.Bottom);
                    checkSideTangent(CanvasSide.Right);
                    checkSideTangent(CanvasSide.Top);
                    checkSideIntersections(CanvasSide.Left);
                });
                it("hidden right tangent", function () {
                    setCamera(3, 0, { x: 0.5, y: 0 });
                    checkSideTangent(CanvasSide.Bottom);
                    checkSideIntersections(CanvasSide.Right);
                    checkSideTangent(CanvasSide.Top);
                    checkSideTangent(CanvasSide.Left);
                });
                it("hidden bottom tangent", function () {
                    setCamera(3, 0, { x: 0, y: -0.5 });
                    checkSideIntersections(CanvasSide.Bottom);
                    checkSideTangent(CanvasSide.Right);
                    checkSideTangent(CanvasSide.Top);
                    checkSideTangent(CanvasSide.Left);
                });
                it("hidden top tangent", function () {
                    setCamera(3, 0, { x: 0, y: 0.5 });
                    checkSideTangent(CanvasSide.Bottom);
                    checkSideTangent(CanvasSide.Right);
                    checkSideIntersections(CanvasSide.Top);
                    checkSideTangent(CanvasSide.Left);
                });
            });

            describe("2 canvas corner intersections", function () {
                it("hidden left side intersections", function () {
                    setCamera(4.3, 0, { x: -0.5, y: 0 }, [true, false, false, true]);
                    checkSideIntersections(CanvasSide.Bottom, [false, true]);
                    checkSideTangent(CanvasSide.Right);
                    checkSideIntersections(CanvasSide.Top, [true, false]);
                    checkSideIntersections(CanvasSide.Left, [false, false]);
                });
                it("hidden right side intersections", function () {
                    setCamera(4.3, 0, { x: 0.5, y: 0 }, [false, true, true, false]);
                    checkSideIntersections(CanvasSide.Bottom, [true, false]);
                    checkSideIntersections(CanvasSide.Right, [false, false]);
                    checkSideIntersections(CanvasSide.Top, [false, true]);
                    checkSideTangent(CanvasSide.Left);
                });
                it("hidden bottom side intersections", function () {
                    setCamera(4.3, 0, { x: 0, y: -0.5 }, [true, true, false, false]);
                    checkSideIntersections(CanvasSide.Bottom, [false, false]);
                    checkSideIntersections(CanvasSide.Right, [false, true]);
                    checkSideTangent(CanvasSide.Top);
                    checkSideIntersections(CanvasSide.Left, [true, false]);
                });
                it("hidden top side intersections", function () {
                    setCamera(4.3, 0, { x: 0, y: 0.5 }, [false, false, true, true]);
                    checkSideTangent(CanvasSide.Bottom);
                    checkSideIntersections(CanvasSide.Right, [true, false]);
                    checkSideIntersections(CanvasSide.Top, [false, false]);
                    checkSideIntersections(CanvasSide.Left, [false, true]);
                });
            });

            describe("1 canvas corner intersection", function () {
                it("bottom-left corner intersection", function () {
                    setCamera(3, 0, { x: -0.8, y: -0.8 }, [true, false, false, false]);
                    checkSideIntersections(CanvasSide.Bottom, [false, true]);
                    checkSideTangent(CanvasSide.Right);
                    checkSideTangent(CanvasSide.Top);
                    checkSideIntersections(CanvasSide.Left, [true, false]);
                });
                it("bottom-right corner intersection", function () {
                    setCamera(3, 0, { x: 0.8, y: -0.8 }, [false, true, false, false]);
                    checkSideIntersections(CanvasSide.Bottom, [true, false]);
                    checkSideIntersections(CanvasSide.Right, [false, true]);
                    checkSideTangent(CanvasSide.Top);
                    checkSideTangent(CanvasSide.Left);
                });
                it("top-right corner intersection", function () {
                    setCamera(3, 0, { x: 0.8, y: 0.8 }, [false, false, true, false]);
                    checkSideTangent(CanvasSide.Bottom);
                    checkSideIntersections(CanvasSide.Right, [true, false]);
                    checkSideIntersections(CanvasSide.Top, [false, true]);
                    checkSideTangent(CanvasSide.Left);
                });
                it("top-left corner intersection", function () {
                    setCamera(3, 0, { x: -0.8, y: 0.8 }, [false, false, false, true]);
                    checkSideTangent(CanvasSide.Bottom);
                    checkSideTangent(CanvasSide.Right);
                    checkSideIntersections(CanvasSide.Top, [true, false]);
                    checkSideIntersections(CanvasSide.Left, [false, true]);
                });
            });
        });
    });
});
