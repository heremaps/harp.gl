/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { EarthConstants, sphereProjection } from "@here/harp-geoutils";
import { Math2D } from "@here/harp-utils";
import * as THREE from "three";

import { CameraUtils } from "./CameraUtils";
import { MapViewUtils } from "./Utils";

const twoPi = Math.PI * 2;

// Keep counter clockwise order.
export enum CanvasSide {
    Bottom,
    Right,
    Top,
    Left
}

export function nextCanvasSide(side: CanvasSide): CanvasSide {
    return (side + 1) % 4;
}

export function previousCanvasSide(side: CanvasSide): CanvasSide {
    return (side + 3) % 4;
}

/**
 * Class computing horizon tangent points and intersections with canvas for spherical projection.
 *
 * @remarks
 *
 * The horizon for a sphere is a circle formed by all intersections of tangent lines passing through
 * the camera with said sphere. It lies on a plane perpendicular to the sphere normal at the camera
 * and it's center is at the line segment joining the sphere center and the camera.
 *
 * The further the camera is, the nearer the horizon center gets to the sphere center, only reaching
 * the sphere center when the camera is at infinity. In other words, the horizon observed from a
 * finite distance is always smaller than a great circle (a circle with the sphere radius, dividing
 * the sphere in two hemispheres, and therefore it's radius is smaller than the sphere's.
 *
 * @internal
 */
export class SphereHorizon {
    private readonly m_matrix: THREE.Matrix4;
    private readonly m_radius: number;
    private readonly m_normalToTangentAngle: number;
    private readonly m_distanceToHorizonCenter: number;
    private readonly m_intersections: number[][] = [];
    private m_isFullyVisible: boolean = true;
    private readonly m_cameraPitch: number;

    /**
     * Constructs the SphereHorizon for the given camera.
     *
     * @param m_camera - The camera used as a reference to compute the horizon.
     * @param m_cornerIntersects - Array with a boolean for each canvas corner telling whether it
     * intersects with the world. Corners are in ccw-order starting with bottom left.
     */
    constructor(
        private readonly m_camera: THREE.PerspectiveCamera,
        private readonly m_cornerIntersects: boolean[]
    ) {
        //
        //          TL :,,,,,,,,,,,,,,,,,,,,,,,,,,,,! TR canvas corner (proj. on horizon plane)
        //             >                            +
        //             >                            +
        //             ::                           +
        //              +                           >
        //              >         `::::::'         !"
        //              >     `:::"      ':::,     +
        //              +   :!,              .!!`  +
        //              ,,:;`                   :+`>
        //              >T                        T# <-- Sphere radius to tangent angle (90 deg).
        //             !!>                       `+!(`
        //            =' +                      `.+  {:
        //           /.  +                     `` >   |:`
        //          /`   ::                   .`  >    |:.
        //         /`     >         camZ     '`  `+     /`'`
        //        ;,      +           *,`   '    !,      ( `'
        //       ,^       +              `.~     +       ./  .`
        //       )        +               ' ```  >        !~  `.
        //      *`        '~             '    ``.>         (    .` tangentDistance
        //     `\          +           `'        ?``       '?    `'
        //     /`          +          `.        :.  ```     )      `.
        //    `\           >         `.         >     ```   .=       .`
        //    |`           +        ``          +        ``` (        `.
        //    /            "!      .`           +           `?!         '`
        //   ,+             !,,,,,!:,,,,,,,,,,,,,             {.`        `.
        //   /`            BL    '               BR           )  ```       .`
        //   /                  '                             >`    ``      `'
        //   /                 '                              `*      ```     .`
        //  ,:                ' Sphere radius                  )     camZ```   `.
        //  ?`              `.                                 )           ```   `.
        //  /              `.                                  )              `.`  '`    camY
        //  /             ``              horizon radius       /                 ````.   ^
        //  /            .`          |<----------------------->/                   ``.'` '
        //  /           .`           |                         /`                     `','  camX
        //  /          O`````````````C`````````````````````````(,````````````````````````E-----*
        //             |             |                distanceToHorizonCenter            |
        //             |             |<------------------------------------------------->|
        //             |                                                                 |
        //             |<--------------------------------------------------------------->|
        //                                      cameraHeight
        // O -> Sphere center
        // C -> Horizon center
        // E -> Camera (eye)
        // T -> Tangent points (also intersections with projected canvas)

        const earthRadiusSq = EarthConstants.EQUATORIAL_RADIUS * EarthConstants.EQUATORIAL_RADIUS;
        const xAxis = new THREE.Vector3().setFromMatrixColumn(m_camera.matrixWorld, 0).normalize();
        const zAxis = m_camera.position.clone().normalize();
        const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis);

        const cameraHeight = m_camera.position.length();
        this.m_normalToTangentAngle = Math.asin(EarthConstants.EQUATORIAL_RADIUS / cameraHeight);

        const tangentDistance = Math.sqrt(cameraHeight * cameraHeight - earthRadiusSq);
        this.m_distanceToHorizonCenter = tangentDistance * Math.cos(this.m_normalToTangentAngle);
        const horizonCenterLength = cameraHeight - this.m_distanceToHorizonCenter;
        this.m_radius = Math.sqrt(earthRadiusSq - horizonCenterLength * horizonCenterLength);
        this.m_cameraPitch = MapViewUtils.extractAttitude(
            { projection: sphereProjection },
            this.m_camera
        ).pitch;
        const horizonCenter = new THREE.Vector3().copy(zAxis).setLength(horizonCenterLength);
        this.m_matrix = new THREE.Matrix4()
            .makeBasis(xAxis, yAxis, zAxis)
            .setPosition(horizonCenter);
        this.computeIntersections();
    }

    /**
     * Gets the world coordinates of a point in the horizon corresponding to the given parameter.
     *
     * @param t - Parameter value in [0,1] corresponding to the point in the horizon circle at
     * angle t*(arcEnd - arcStart)*2*pi counter clockwise.
     * @param arcStart - Start of the arc covered by parameter t, corresponds to angle
     * arcStart*2*pi.
     * @param arcEnd - End of the arc covered by parameter t, corresponds to angle arcEnd*2*pi.
     * @param target - Optional target where resulting world coordinates will be set.
     * @returns the resulting point in world space.
     */
    getPoint(
        t: number,
        arcStart: number = 0,
        arcEnd: number = 1,
        target: THREE.Vector3 = new THREE.Vector3()
    ): THREE.Vector3 {
        const startAngle = arcStart * twoPi;
        const endAngle = arcEnd >= arcStart ? arcEnd * twoPi : (arcEnd + 1) * twoPi;
        const deltaAngle = endAngle - startAngle;
        const angle = startAngle + t * deltaAngle;

        target.set(this.m_radius * Math.cos(angle), this.m_radius * Math.sin(angle), 0);
        target.applyMatrix4(this.m_matrix);
        return target;
    }

    /**
     * Subdivides and arc of the horizon circle, providing the world coordinates of the divisions.
     *
     * @param callback - Function called for every division point, getting the point world
     * coordinates as parameter.
     * @param tStart - Angular parameter of the arc's start point [0,1].
     * @param tEnd - Angular parameter of the arc's end point [0,1].
     * @param maxNumPoints - Number of division points for the whole horizon. Smaller arcs will
     * be assigned a proportionally smaller number of points.
     */
    getDivisionPoints(
        callback: (point: THREE.Vector3) => void,
        tStart: number = 0,
        tEnd: number = 1,
        maxNumPoints: number = 10
    ) {
        const numPoints = Math.max(
            Math.ceil(((tEnd < tStart ? 1 + tEnd : tEnd) - tStart) * maxNumPoints),
            1
        );
        // Point corresponding to tEnd is omitted, hence the strict less condition in the loop.
        for (let d = 0; d < numPoints; d++) {
            callback(this.getPoint(d / numPoints, tStart, tEnd));
        }
    }

    /**
     * Indicates whether the horizon circle is fully visible.
     * @returns 'True' if horizon is fully visible, false otherwise.
     */
    get isFullyVisible(): boolean {
        return this.m_isFullyVisible;
    }

    /**
     * Gets the horizon intersections with the specified canvas side, specified in angular
     * parameters [0,1].
     * @returns the intersections with the canvas.
     */
    getSideIntersections(side: CanvasSide): number[] {
        return this.m_intersections[side];
    }

    private isTangentVisible(side: CanvasSide): boolean {
        switch (side) {
            case CanvasSide.Top: {
                const eyeToTangentAngle = this.m_normalToTangentAngle - this.m_cameraPitch;
                return CameraUtils.getTopFov(this.m_camera) >= Math.abs(eyeToTangentAngle);
            }
            case CanvasSide.Bottom: {
                const eyeToTangentAngle = this.m_normalToTangentAngle + this.m_cameraPitch;
                return CameraUtils.getBottomFov(this.m_camera) >= Math.abs(eyeToTangentAngle);
            }
            case CanvasSide.Left: {
                const eyeToTangentAngle = this.m_normalToTangentAngle;
                return (
                    CameraUtils.getLeftFov(this.m_camera) >= Math.abs(eyeToTangentAngle) &&
                    this.m_cameraPitch <= CameraUtils.getBottomFov(this.m_camera)
                );
            }
            case CanvasSide.Right: {
                const eyeToTangentAngle = this.m_normalToTangentAngle;
                return (
                    CameraUtils.getRightFov(this.m_camera) >= Math.abs(eyeToTangentAngle) &&
                    this.m_cameraPitch <= CameraUtils.getBottomFov(this.m_camera)
                );
            }
        }
    }

    private getTangentOnSide(side: CanvasSide): number {
        switch (side) {
            case CanvasSide.Bottom:
                return 0.75;
            case CanvasSide.Right:
                return 0;
            case CanvasSide.Top:
                return 0.25;
            case CanvasSide.Left:
                return 0.5;
        }
    }

    private computeIntersections() {
        // Look for the intersections of the canvas sides projected in the horizon plane with the
        // horizon circle.
        // Top and bottom canvas sides are horizontal lines at plane coordinates yTop and yBottom
        // respectively. Left and right sides are lines whose slope depends on the camera pitch.
        //
        // Front View (horizon plane):
        //
        //                        Top
        //        TL '{~~~~~~~~~~~~~~~~~~~~~~~~~~}. TR
        //            (                          (
        //            ;"   '!;!!!!!!!!!!!!;!'   ::
        //             I>^^:                :^^|I <--------- Canvas-Horizon intersection
        //          ~>+%.                      ,$+>,
        //        !|~   (                      (   :|!
        //      ~/'   L (----------C----------`) R   ,/"
        //     /;       `/         ^,         )`       ^|
        //    }'         (         |`         (         '}
        //   }`          ,^        |`        *.          .}
        //  ('         BL !::::::::|:::::::::: BR         ,)
        // ,{                      |`  Bottom              }`
        // }                   camZ|`                      `}
        // }                       |`                       }
        // }                       E----> camX              }
        // }                                                } Horizon circle
        // }                                               `}
        // ~{                                              }.
        //  {.                                            '(
        //   }`                                          `}
        //   `}.                                        .}
        //     )!                                      !/
        //      :/.                                  '/:
        //        ^|'                              ,|^
        //          :>+.                        .+>:
        //             !^^;'                ';^^!
        //                 :;!!!!!!!!!!!!;!;:
        //
        // Top-down view (plane defined by camZ and camX):
        //
        //                        Top
        //        TL_______________________________ TR
        //          \              |              /
        //           \   :;!!!!!!!!!!!!!!;!;:    /
        //            I^;'         |        ';^^I
        //         :>+.\           |           /.+>:
        //       ^|'    \          |          /    ,|^ <--- Horizon
        //     :/.       \         |         /       '/:
        //      }         L--------C--------R_________}_________
        //     }           \       ^camZ   /           }       ^
        //      }           \      |      /           }        |
        //     :/.           \     |     /           :/.       |
        //       ^|'          BL----B----BR_______ !|'         |
        //         :>+.        \   |   /        ^              | eyeToHorizon
        //            !^;'      \  |  /      ';!|              |
        //               :;!!!!!!\ | /!!;!;:!   | eyeToBottom  |
        //                        \|/           |              |
        //                         E----> camX__v______________v

        const yBottom =
            this.m_distanceToHorizonCenter *
            Math.tan(this.m_cameraPitch - CameraUtils.getBottomFov(this.m_camera));
        let tTopRight: number | undefined;
        let tBottomRight: number | undefined;

        // Collect all intersections in counter-clockwise order.
        for (let side = CanvasSide.Bottom; side < 4; side++) {
            if (this.isTangentVisible(side)) {
                this.m_intersections.push([this.getTangentOnSide(side)]);
                continue;
            }

            const sideIntersections = new Array<number | undefined>();
            this.m_isFullyVisible = false;
            switch (side) {
                case CanvasSide.Bottom: {
                    sideIntersections.push(...this.computeTBIntersections(yBottom));
                    break;
                }
                case CanvasSide.Right: {
                    const rightFov = CameraUtils.getRightFov(this.m_camera);
                    const intersections = this.computeLRIntersections(yBottom, rightFov);
                    if (intersections) {
                        [tTopRight, tBottomRight] = intersections;
                        sideIntersections.push(
                            tBottomRight !== undefined ? 1 + tBottomRight : undefined,
                            tTopRight
                        );
                    }
                    break;
                }
                case CanvasSide.Top: {
                    const yTop =
                        this.m_distanceToHorizonCenter *
                        Math.tan(this.m_cameraPitch + CameraUtils.getTopFov(this.m_camera));
                    sideIntersections.push(...this.computeTBIntersections(yTop).reverse());
                    break;
                }
                case CanvasSide.Left: {
                    const leftFov = CameraUtils.getLeftFov(this.m_camera);
                    if (leftFov === CameraUtils.getRightFov(this.m_camera)) {
                        // Left side intersections are symmetrical to right ones.
                        sideIntersections.push(
                            tTopRight !== undefined ? 0.5 - tTopRight : undefined,
                            tBottomRight !== undefined ? 0.5 - tBottomRight : undefined
                        );
                    } else {
                        const isections = this.computeLRIntersections(yBottom, leftFov);
                        if (isections) {
                            sideIntersections.push(
                                0.5 - isections[0], // top
                                isections[1] !== undefined ? 0.5 - isections[1] : undefined // bottom
                            );
                        }
                    }
                    break;
                }
            }

            // Filter out undefined values and horizon intersections that are not visible because
            // the canvas corner intersects the world (this may happen with off-center projections).
            const hasCorners = [
                this.m_cornerIntersects[side],
                this.m_cornerIntersects[nextCanvasSide(side)]
            ];
            this.m_intersections.push(
                sideIntersections.filter(
                    (val, i) => val !== undefined && !hasCorners[i]
                ) as number[]
            );
        }
    }

    /**
     * Computes horizon intersections with top or bottom canvas side.
     *
     * @returns positions of the intersections in the horizon circle, first left, then right
     * Values are in range [0,1].
     */
    private computeTBIntersections(y: number): [number, number] {
        const radiusSq = this.m_radius * this.m_radius;
        const x = Math.sqrt(radiusSq - y * y);
        const t = Math.atan2(y, x) / twoPi;
        return [0.5 - t, t > 0 ? t : 1 + t];
    }

    /**
     * Computes horizon intersections with left or right canvas side.
     *
     * @returns positions of the intersections in the horizon circle, first top, then bottom
     * (or undefined if not visible). Values are in range [-0.5,0.5].
     */
    private computeLRIntersections(
        yBottom: number,
        sideFov: number
    ): [number, number?] | undefined {
        // Define vertical canvas side line by finding the middle and bottom points of
        // its projection on the horizon plane.
        const eyeToHorizon = this.m_distanceToHorizonCenter / Math.cos(this.m_cameraPitch);
        const yMiddle = this.m_distanceToHorizonCenter * Math.tan(this.m_cameraPitch);
        const xMiddle = eyeToHorizon * Math.tan(sideFov);
        const bottomFov = CameraUtils.getBottomFov(this.m_camera);
        const eyeToBottom =
            (this.m_distanceToHorizonCenter * Math.cos(bottomFov)) /
            Math.cos(this.m_cameraPitch - bottomFov);
        const xBottom = (xMiddle * eyeToBottom) / eyeToHorizon;
        const intersections = Math2D.intersectLineAndCircle(
            xBottom,
            yBottom,
            xMiddle,
            yMiddle,
            this.m_radius
        );

        if (!intersections) {
            return undefined;
        }
        const yTopRight = intersections.y1;
        const tTop = Math.atan2(yTopRight, intersections.x1) / twoPi;

        // If there's a bottom intersection check if it's visible (its above the y
        // coordinate of the bottom canvas side).
        const hasBottomIntersection = -yTopRight >= yBottom && intersections.x2 !== undefined;
        const tBottom = hasBottomIntersection
            ? Math.atan2(intersections.y2!, intersections.x2!) / twoPi
            : undefined;
        return [tTop, tBottom];
    }
}
