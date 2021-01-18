/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { EarthConstants, MathUtils, sphereProjection } from "@here/harp-geoutils";
import { Math2D } from "@here/harp-utils";
import * as THREE from "three";

import { MapViewUtils } from "./Utils";

const twoPi = Math.PI * 2;

// Keep counter clockwise order.
export enum CanvasSide {
    Bottom,
    Right,
    Top,
    Left
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
    private m_cameraPitch?: number;
    private m_hFovVertical?: number;
    private m_hFovHorizontal?: number;

    /**
     * Constructs the SphereHorizon for the given camera.
     *
     * @param m_camera - The camera used as a reference to compute the horizon.
     */
    constructor(private readonly m_camera: THREE.PerspectiveCamera) {
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
     * @param callback - Function called for every division point, getting the the point world
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
        if (side === CanvasSide.Top || side === CanvasSide.Bottom) {
            const eyeToTangentAngle =
                side === CanvasSide.Top
                    ? this.m_normalToTangentAngle - this.cameraPitch
                    : this.m_normalToTangentAngle + this.cameraPitch;
            return this.hFovVertical >= Math.abs(eyeToTangentAngle);
        } else {
            const eyeToTangentAngle = this.m_normalToTangentAngle;
            return (
                this.hFovHorizontal >= Math.abs(eyeToTangentAngle) &&
                this.cameraPitch <= this.hFovVertical
            );
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

        const radiusSq = this.m_radius * this.m_radius;
        const yBottom =
            this.m_distanceToHorizonCenter * Math.tan(this.cameraPitch - this.hFovVertical);
        let tTopRight: number | undefined;
        let tBottomRight: number | undefined;

        for (let side = CanvasSide.Bottom; side < 4; side++) {
            const sideIntersections: number[] = [];
            if (this.isTangentVisible(side)) {
                sideIntersections.push(this.getTangentOnSide(side));
            } else {
                this.m_isFullyVisible = false;
                switch (side) {
                    case CanvasSide.Bottom: {
                        const x = Math.sqrt(radiusSq - yBottom * yBottom);
                        const t = Math.atan2(yBottom, x) / twoPi;
                        sideIntersections.push(0.5 - t, t > 0 ? t : 1 + t);
                        break;
                    }
                    case CanvasSide.Right: {
                        // Define right canvas side line by finding the middle and bottom points of
                        // its projection on the horizon plane.
                        const eyeToHorizon =
                            this.m_distanceToHorizonCenter / Math.cos(this.cameraPitch);
                        const yRight = this.m_distanceToHorizonCenter * Math.tan(this.cameraPitch);
                        const xRight = eyeToHorizon * Math.tan(this.hFovHorizontal);
                        const eyeToBottom =
                            (this.m_distanceToHorizonCenter * Math.cos(this.hFovVertical)) /
                            Math.cos(this.cameraPitch - this.hFovVertical);
                        const xBottomRight = (xRight * eyeToBottom) / eyeToHorizon;
                        const yBottomRight = yBottom;
                        const intersections = Math2D.intersectLineAndCircle(
                            xBottomRight,
                            yBottomRight,
                            xRight,
                            yRight,
                            this.m_radius
                        );

                        if (!intersections) {
                            break;
                        }
                        const yTopRight = intersections.y1;
                        // If there's a second intersection check if it's visible (its above the y
                        // coordinate of the bottom canvas side).
                        if (-yTopRight >= yBottom && intersections.x2 !== undefined) {
                            tBottomRight = Math.atan2(intersections.y2!, intersections.x2) / twoPi;
                            sideIntersections.push(1 + tBottomRight);
                        }
                        tTopRight = Math.atan2(intersections!.y1, intersections!.x1) / twoPi;
                        sideIntersections.push(tTopRight);
                        break;
                    }
                    case CanvasSide.Top: {
                        const yTop =
                            this.m_distanceToHorizonCenter *
                            Math.tan(this.cameraPitch + this.hFovVertical);
                        const x = Math.sqrt(radiusSq - yTop * yTop);
                        const t = Math.atan2(yTop, x) / twoPi;
                        sideIntersections.push(t, 0.5 - t);
                        break;
                    }
                    case CanvasSide.Left: {
                        // Left side intersections are symmetrical to right ones.
                        if (tTopRight !== undefined) {
                            sideIntersections.push(0.5 - tTopRight);
                        }
                        if (tBottomRight !== undefined) {
                            sideIntersections.push(0.5 - tBottomRight);
                        }
                        break;
                    }
                }
            }

            this.m_intersections.push(sideIntersections);
        }
    }

    private get cameraPitch(): number {
        if (this.m_cameraPitch === undefined) {
            this.m_cameraPitch = MapViewUtils.extractAttitude(
                { projection: sphereProjection },
                this.m_camera
            ).pitch;
        }
        return this.m_cameraPitch;
    }

    private get hFovVertical(): number {
        if (this.m_hFovVertical === undefined) {
            this.m_hFovVertical = MathUtils.degToRad(this.m_camera.fov / 2);
        }
        return this.m_hFovVertical;
    }

    private get hFovHorizontal(): number {
        if (this.m_hFovHorizontal === undefined) {
            this.m_hFovHorizontal =
                MapViewUtils.calculateHorizontalFovByVerticalFov(
                    this.hFovVertical * 2,
                    this.m_camera.aspect
                ) / 2;
        }
        return this.m_hFovHorizontal;
    }
}
