/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { GeoCoordinates, MathUtils } from "@here/harp-geoutils";
import { LookAtParams, MapView } from "@here/harp-mapview";
import THREE = require("three");

import { CameraKeyTrackAnimationOptions, ControlPoint } from "./CameraKeyTrackAnimation";

/**
 * A Utility class for the creation of Camera Animations
 * @beta
 */
export class CameraAnimationBuilder {
    /**
     * Get the current [[LookAtParams]] from [[MapView]]
     * @beta
     *
     * @param mapView - The MapView
     */
    static getLookAtFromView(
        mapView: MapView
    ): Pick<LookAtParams, "target" | "tilt" | "heading" | "distance"> {
        return {
            target: mapView.target,
            heading: mapView.heading,
            tilt: mapView.tilt,
            distance: mapView.targetDistance
        };
    }

    /**
     * Appends a [[ControlPoint]] to [[CameraKeyTrackAnimationOptions]]
     * @beta
     *
     * @param options - The [[CameraKeyTrackAnimationOptions]] that the [[ControlPoint]] should be
     * appended to
     * @param point - The [[ControlPoint]] to append.
     * @param appendTime - The time it should take from the former end of the animation to the
     * appended [[ControlPoint]] in seconds, per default takes the controlpoints timestamp
     */
    static appendControlPoint(
        options: CameraKeyTrackAnimationOptions,
        point: ControlPoint,
        appendTime?: number
    ) {
        appendTime = appendTime ?? 10;
        if (
            options.controlPoints.length > 0 &&
            (point.timestamp === undefined ||
                point.timestamp <=
                    options.controlPoints[options.controlPoints.length - 1].timestamp)
        ) {
            point.timestamp =
                options.controlPoints[options.controlPoints.length - 1].timestamp + appendTime;
        }
        options.controlPoints.push(point);
    }

    /**
     * Adds a [[ControlPoint]] to the beginning of an [[CameraKeyTrackAnimationOptions]]
     * @beta
     *
     * @param options -
     * @param point -
     * @param prependTime - The time the animation from the inserted key to the next should take,
     *  in seconds, @default 10 seconds
     */
    static prependControlPoint(
        options: CameraKeyTrackAnimationOptions,
        point: ControlPoint,
        prependTime?: number
    ) {
        prependTime = prependTime !== undefined ? prependTime : 10;
        for (const controlPoint of options.controlPoints) {
            controlPoint.timestamp += prependTime;
        }
        point.timestamp = 0;
        options.controlPoints.unshift(point);
    }

    /**
     *
     * Creates Options for a Bow Animation from the start to the target [[ControlPoint]]
     * @beta
     *
     * @param mapView -
     * @param startControlPoint -
     * @param targetControlPoint -
     * @param altitude - The maximal altitude the bow should have, defaults to twice the start to
     * target distance
     * @param duration - The duration of the Animation in seconds, @default 10
     */
    static createBowFlyToOptions(
        mapView: MapView,
        startControlPoint: ControlPoint,
        targetControlPoint: ControlPoint,
        altitude?: number,
        duration = 10
    ): CameraKeyTrackAnimationOptions {
        const controlPoints: ControlPoint[] = [startControlPoint];
        const startWorldTarget: THREE.Vector3 = new THREE.Vector3();
        mapView.projection.projectPoint(startControlPoint.target, startWorldTarget);
        let maxAltitude =
            altitude ??
            2 *
                startWorldTarget.distanceTo(
                    mapView.projection.projectPoint(targetControlPoint.target)
                );
        // use a minimum altitude of the sum of distances to
        // actually create a bow for small distance CP
        maxAltitude = Math.max(
            startControlPoint.distance + targetControlPoint.distance,
            maxAltitude
        );

        //calculate two ControlPoints on the maximal altitude in between the start and target points
        const midCoord0 = GeoCoordinates.lerp(
            startControlPoint.target as GeoCoordinates,
            targetControlPoint.target as GeoCoordinates,
            0.25
        );
        const midPoint0 = new ControlPoint({
            target: midCoord0,
            distance: maxAltitude,
            timestamp: duration / 3,
            tilt: MathUtils.interpolateAnglesDeg(
                startControlPoint.tilt,
                targetControlPoint.tilt,
                0.25
            ),
            heading: MathUtils.interpolateAnglesDeg(
                startControlPoint.heading,
                targetControlPoint.heading,
                0.25
            )
        });
        controlPoints.push(midPoint0);
        const midCoord1 = GeoCoordinates.lerp(
            startControlPoint.target as GeoCoordinates,
            targetControlPoint.target as GeoCoordinates,
            0.75
        );
        const midPoint1 = new ControlPoint({
            target: midCoord1,
            distance: maxAltitude,
            timestamp: (duration / 3) * 2,
            tilt: MathUtils.interpolateAnglesDeg(
                startControlPoint.tilt,
                targetControlPoint.tilt,
                0.75
            ),
            heading: MathUtils.interpolateAnglesDeg(
                startControlPoint.heading,
                targetControlPoint.heading,
                0.75
            )
        });
        controlPoints.push(midPoint1);

        targetControlPoint.timestamp = duration;
        controlPoints.push(targetControlPoint);

        return { controlPoints };
    }

    /**
     * Creates [[CameraKeyTrackAnimationOptions]] for an Orbit Animation
     * @beta
     *
     * @param startControlPoint -
     * @param duration -
     */
    static createOrbitOptions(
        startControlPoint: ControlPoint,
        duration: number = 10
    ): CameraKeyTrackAnimationOptions {
        const amountOfKeys = 4;
        const controlPoints: ControlPoint[] = [startControlPoint];

        const steps = amountOfKeys - 1;
        const headingStep = 360 / steps;
        const timeStep = duration / steps;
        for (let n = 1; n < amountOfKeys; n++) {
            const prev = controlPoints[n - 1];
            controlPoints.push({
                ...prev,
                heading: prev.heading - headingStep,
                timestamp: prev.timestamp + timeStep
            });
        }

        return { controlPoints };
    }
}
