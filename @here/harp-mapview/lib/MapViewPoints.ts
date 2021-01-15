/*
 * Copyright (C) 2017-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import { PickingRaycaster } from "./PickingRaycaster";

/**
 * `MapViewPoints` is a class to extend for the `"circles"` and `"squares"` techniques to
 * implement raycasting of `THREE.Points` as expected in {@link MapView},
 * that are in screen space.
 *
 * @remarks
 * It copies the behaviour of the `raycast` method in [[THREE.Points]] and dispatches it to its
 * children classes, {@link Circles} and {@link Squares}, who hold the intersection testing in the
 * `testPoint` method. This class also has the ability to dismiss the testing via the
 * `enableRayTesting` flag.
 *
 * Its main motivation is to handle the point styles of XYZ projects.
 *
 * @see https://github.com/mrdoob/three.js/blob/master/src/objects/Points.js
 *
 * @internal
 */
export abstract class MapViewPoints extends THREE.Points {
    /**
     * This allows to discard the ray testing.
     */
    enableRayTesting: boolean = true;

    /**
     * Implements the intersection testing in screen space between the drawn points and the ray.
     *
     * @remarks The drawing of the points being different between {@link Circles}
     * and {@link Squares}, this method is implemented in these child classes.
     *
     * @param point - The point to test.
     * @param screenPosition - The point position on screen.
     * @param pickCoordinates - The picking position on screen.
     * @param index - The index of the point in the [[THREE.Geometry]].
     * @param distance - The distance between the point and the ray origin.
     * @param intersects - The results array.
     */
    abstract testPoint(
        point: THREE.Vector3,
        screenPosition: THREE.Vector2,
        pickCoordinates: THREE.Vector2,
        index: number,
        distance: number,
        intersects: THREE.Intersection[]
    ): void;

    /**
     * This method is similar to the original method `raycast` in [[THREE.Points]] except that it
     * then calls the tailored `testPoint` method in the children classes to test intersections
     * depending on whether the points are circles or squares, which [[THREE.Points]] cannot do.
     *
     * @param raycaster - The raycaster.
     * @param intersects - The array to fill with the results.
     */
    raycast(raycaster: PickingRaycaster, intersects: THREE.Intersection[]) {
        if (!this.enableRayTesting) {
            return;
        }

        const geometry = this.geometry;
        const matrixWorld = this.matrixWorld;
        const screenCoords = raycaster.ray.origin
            .clone()
            .add(raycaster.ray.direction)
            .project(raycaster.camera);
        const mouseCoords = new THREE.Vector2(
            Math.ceil(((screenCoords.x + 1) / 2) * raycaster.width),
            Math.ceil(((1 - screenCoords.y) / 2) * raycaster.height)
        );

        if (geometry instanceof THREE.BufferGeometry) {
            const point = new THREE.Vector3();
            const index = geometry.index;
            const attributes = geometry.attributes;
            const positions = attributes.position.array;
            if (index !== null) {
                const indices = index.array;
                for (let i = 0, il = indices.length; i < il; i++) {
                    const a = indices[i];
                    point.fromArray(positions as number[], a * 3);
                    const pointInfo = getPointInfo(point, matrixWorld, raycaster);
                    if (pointInfo.pointIsOnScreen) {
                        this.testPoint(
                            point,
                            pointInfo.absoluteScreenPosition!,
                            mouseCoords,
                            i,
                            pointInfo.distance!,
                            intersects
                        );
                    }
                }
            } else {
                for (let i = 0, l = positions.length / 3; i < l; i++) {
                    point.fromArray(positions as number[], i * 3);
                    const pointInfo = getPointInfo(point, matrixWorld, raycaster);
                    if (pointInfo.pointIsOnScreen) {
                        this.testPoint(
                            point,
                            pointInfo.absoluteScreenPosition!,
                            mouseCoords,
                            i,
                            pointInfo.distance!,
                            intersects
                        );
                    }
                }
            }
        } else {
            const vertices = geometry.vertices;
            for (let index = 0; index < vertices.length; index++) {
                const point = vertices[index];
                const pointInfo = getPointInfo(point, matrixWorld, raycaster);
                if (pointInfo.pointIsOnScreen) {
                    this.testPoint(
                        point,
                        pointInfo.absoluteScreenPosition!,
                        mouseCoords,
                        index,
                        pointInfo.distance!,
                        intersects
                    );
                }
            }
        }
    }
}

function getPointInfo(
    point: THREE.Vector3,
    matrixWorld: THREE.Matrix4,
    raycaster: PickingRaycaster
): {
    pointIsOnScreen: boolean;
    absoluteScreenPosition?: THREE.Vector2;
    distance?: number;
} {
    const worldPosition = point.clone();
    worldPosition.applyMatrix4(matrixWorld);
    const distance = worldPosition.distanceTo(raycaster.ray.origin);
    worldPosition.project(raycaster.camera);
    const relativeScreenPosition = new THREE.Vector2(worldPosition.x, worldPosition.y);
    const pointIsOnScreen =
        relativeScreenPosition.x < 1 &&
        relativeScreenPosition.x > -1 &&
        relativeScreenPosition.y < 1 &&
        relativeScreenPosition.y > -1;
    if (pointIsOnScreen) {
        worldPosition.x = ((worldPosition.x + 1) / 2) * raycaster.width;
        worldPosition.y = ((1 - worldPosition.y) / 2) * raycaster.height;
        const absoluteScreenPosition = new THREE.Vector2(worldPosition.x, worldPosition.y);
        return {
            absoluteScreenPosition,
            pointIsOnScreen,
            distance
        };
    }
    return {
        pointIsOnScreen
    };
}

/**
 * Point object that implements the raycasting of circles in screen space.
 * @internal
 */
export class Circles extends MapViewPoints {
    /** @override */
    testPoint(
        point: THREE.Vector3,
        screenPosition: THREE.Vector2,
        pickCoordinates: THREE.Vector2,
        index: number,
        distance: number,
        intersects: THREE.Intersection[]
    ) {
        const dx = screenPosition.x - pickCoordinates.x;
        const dy = screenPosition.y - pickCoordinates.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const radius = (this.material as THREE.PointsMaterial).size / 2;

        if (dist <= radius) {
            intersects.push({
                point,
                distance,
                index,
                object: this
            });
        }
    }
}

/**
 * Point object that implements the raycasting of squares in screen space.
 * @internal
 */
export class Squares extends MapViewPoints {
    /** @override */
    testPoint(
        point: THREE.Vector3,
        screenPosition: THREE.Vector2,
        pickCoordinates: THREE.Vector2,
        index: number,
        distance: number,
        intersects: THREE.Intersection[]
    ) {
        const dx = screenPosition.x - pickCoordinates.x;
        const dy = screenPosition.y - pickCoordinates.y;
        const halfSize = (this.material as THREE.PointsMaterial).size / 2;

        if (Math.abs(dx) <= halfSize && Math.abs(dy) <= halfSize) {
            intersects.push({
                point,
                distance,
                index,
                object: this
            });
        }
    }
}
