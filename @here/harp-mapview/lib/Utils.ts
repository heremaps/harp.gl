/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import * as geoUtils from "@here/harp-geoutils";
import { EarthConstants } from "@here/harp-geoutils/lib/projection/EarthConstants";
import { MapMeshBasicMaterial, MapMeshStandardMaterial } from "@here/harp-materials";
import { LoggerManager } from "@here/harp-utils";
import * as THREE from "three";

import { MapView } from "./MapView";
import { getFeatureDataSize, TileFeatureData } from "./Tile";

const logger = LoggerManager.instance.create("MapViewUtils");

// Estimation of the size of an Object3D with all the simple properties, like matrices and flags.
// There may be cases where it is possible to construct Object3Ds with considerable less memory
// consumption, but this value is used to simplify the estimation.
const MINIMUM_OBJECT3D_SIZE_ESTIMATION = 1000;

const MINIMUM_ATTRIBUTE_SIZE_ESTIMATION = 56;

export namespace MapViewUtils {
    //Caching those for performance reasons.
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1));
    const cameraZPosition = new THREE.Vector3(0, 0, 0);
    const rotationMatrix = new THREE.Matrix4();
    const unprojectionMatrix = new THREE.Matrix4();
    const rayCaster = new THREE.Raycaster();

    /**
     * Yaw rotation as quaternion. Declared as a const to avoid object re-creation in certain
     * functions.
     */
    const yawQuaternion = new THREE.Quaternion();

    /**
     * Pitch rotation as quaternion. Declared as a const to avoid object re-creation in certain
     *  functions.
     */
    const pitchQuaternion = new THREE.Quaternion();

    /**
     * The yaw axis around we rotate when we change the yaw.
     * This axis is fix and is the -Z axis `(0,0,1)`.
     */
    const yawAxis = new THREE.Vector3(0, 0, 1);

    /**
     * The pitch axis which we use to rotate around when we change the pitch.
     * The axis is fix and is the +X axis `(1,0,0)`.
     */
    const pitchAxis = new THREE.Vector3(1, 0, 0);

    /**
     * Missing Typedoc
     */
    export interface YawPitchRoll {
        /**
         * Missing Typedoc
         */
        yaw: number;

        /**
         * Missing Typedoc
         */
        pitch: number;

        /**
         * Missing Typedoc
         */
        roll: number;
    }

    /**
     * Describes estimated usage of memory on heap and GPU.
     */
    export interface MemoryUsage {
        heapSize: number;
        gpuSize: number;
    }

    /**
     * Zooms and moves the map in such a way that the given target position remains at the same
     * position after the zoom.
     *
     * @param mapView Instance of MapView
     * @param targetPositionOnScreenXinNDC Target x position in NDC space.
     * @param targetPositionOnScreenYinNDC Target y position in NDC space.
     */
    export function zoomOnTargetPosition(
        mapView: MapView,
        targetPositionOnScreenXinNDC: number,
        targetPositionOnScreenYinNDC: number,
        zoomLevel: number
    ): void {
        //Get current target position in world space before we zoom.
        const targetPosition = rayCastWorldCoordinates(
            mapView,
            targetPositionOnScreenXinNDC,
            targetPositionOnScreenYinNDC
        );

        //Set the cameras height according to the given zoom level.
        mapView.camera.position.setZ(calculateDistanceToGroundFromZoomLevel(mapView, zoomLevel));
        mapView.camera.matrixWorldNeedsUpdate = true;

        //Get new target position after the zoom
        const newTargetPosition = rayCastWorldCoordinates(
            mapView,
            targetPositionOnScreenXinNDC,
            targetPositionOnScreenYinNDC
        );

        if (!targetPosition || !newTargetPosition) {
            return;
        }

        //Calculate the difference and pan the map to maintain
        //the map relative to the target position.
        const diff = targetPosition.sub(newTargetPosition);
        pan(mapView, diff.x, diff.y);
    }

    /**
     * Returns the [[GeoCoordinates]] of the camera, given its target coordinates on the map and its
     * zoom, yaw and pitch.
     *
     * @param targetCoordinates Coordinates of the center of the view.
     * @param zoom Zoom level.
     * @param yaw Camera yaw.
     * @param pitch Camera pitch.
     * @param mapView Active MapView, needed to get the camera fov and map projection.
     */
    export function getCameraCoordinatesFromTargetCoordinates(
        targetCoordinates: geoUtils.GeoCoordinates,
        zoom: number,
        yawDeg: number,
        pitchDeg: number,
        mapView: MapView
    ): geoUtils.GeoCoordinates {
        // Get the world distance between the target and the camera.
        const worldCameraHeight = calculateDistanceToGroundFromZoomLevel(mapView, zoom);
        const pitchRad = THREE.Math.degToRad(pitchDeg);
        const worldTargetCameraDistance = worldCameraHeight * Math.tan(pitchRad);

        // Get the camera coordinates.
        const yawRad = THREE.Math.degToRad(yawDeg);
        const worldTargetCoordinates = mapView.projection.projectPoint(targetCoordinates);
        const cameraWorldCoordinates = {
            x: worldTargetCoordinates.x + Math.sin(yawRad) * worldTargetCameraDistance,
            y: worldTargetCoordinates.y - Math.cos(yawRad) * worldTargetCameraDistance,
            z: 0
        };

        // Convert back to GeoCoordinates and return result.
        return mapView.projection.unprojectPoint(cameraWorldCoordinates);
    }

    /**
     * Casts a ray in NDC space from the current map view and returns the intersection point of that
     * ray wih the map in world space, or `null` in case the raycast failed.
     *
     * @param mapView Instance of MapView.
     * @param pointOnScreenXinNDC X coordinate in NDC space.
     * @param pointOnScreenYinNDC Y coordinate in NDC space.
     * @returns Intersection coordinates, or `null` if raycast failed.
     */
    export function rayCastWorldCoordinates(
        mapView: MapView,
        pointOnScreenXinNDC: number,
        pointOnScreenYinNDC: number
    ): THREE.Vector3 | null {
        const pointInNDCPosition = new THREE.Vector3(pointOnScreenXinNDC, pointOnScreenYinNDC, 0.5);
        const worldPosition = mapView.worldCenter;

        cameraZPosition.copy(mapView.camera.position);

        rotationMatrix.extractRotation(mapView.camera.matrixWorld);

        //Prepare the unprojection matrix which projects from NDC space to camera space
        //and takes the current rotation of the camera into account.
        unprojectionMatrix.multiplyMatrices(
            rotationMatrix,
            unprojectionMatrix.getInverse(mapView.camera.projectionMatrix)
        );
        //Unproject the point via the the unprojection matrix.
        const pointInCameraSpace = pointInNDCPosition.applyMatrix4(unprojectionMatrix);
        //Use the point in camera space as the vector towards this point.
        rayCaster.set(cameraZPosition, pointInCameraSpace.normalize());

        const vec3 = new THREE.Vector3();
        const rayGroundPlaneIntersectionPosition = rayCaster.ray.intersectPlane(groundPlane, vec3);

        if (!rayGroundPlaneIntersectionPosition) {
            return null;
        }
        //Because our camera does not really move, besides going up and down,
        //the intersection point is relative to the camera.
        //To get them in into world space, we add the cameras world space position.
        rayGroundPlaneIntersectionPosition.setX(
            rayGroundPlaneIntersectionPosition.x + worldPosition.x
        );
        rayGroundPlaneIntersectionPosition.setY(
            rayGroundPlaneIntersectionPosition.y + worldPosition.y
        );
        return rayGroundPlaneIntersectionPosition;
    }

    /**
     * Calculates and returns the distance from the ground,
     * which is needed to put the camera to this
     * height, to see the size of the area, which would be covered
     * by one tile for the given zoom level.
     *
     * @param mapView Instance of MapView.
     * @param zoomLevel
     */
    export function calculateDistanceToGroundFromZoomLevel(
        mapView: MapView,
        zoomLevel: number
    ): number {
        const cameraPitch = extractYawPitchRoll(mapView.camera.quaternion).pitch;

        const tileSize = EarthConstants.EQUATORIAL_CIRCUMFERENCE / Math.pow(2, zoomLevel);
        return ((mapView.focalLength * tileSize) / 256) * Math.cos(cameraPitch);
    }

    /**
     * Pans the map underneath camera according to the given offset in world space coordinates.
     *
     * @param mapView Instance of MapView.
     * @param xOffset In world space. Value > 0 will pan the map to the right, value < 0 will pan
     * the map to the left in default camera orientation.
     * @param yOffset In world space. Value > 0 will pan the map upwards, value < 0 will pan the map
     * downwards in default camera orientation.
     */
    export function pan(mapView: MapView, offsetX: number, offsetY: number): void {
        const currentWorldPosition = mapView.worldCenter;
        currentWorldPosition.setX(currentWorldPosition.x + offsetX);
        currentWorldPosition.setY(currentWorldPosition.y + offsetY);
        mapView.update();
    }

    /**
     * Sets the rotation of the camera according to yaw and pitch in degrees.
     *
     * **Note:** `yaw == 0 && pitch == 0` will north up the map and you will look downwards onto the
     * map.
     *
     * @param mapView Instance of MapView.
     * @param yaw Yaw in degrees.
     * @param pitch Pitch in degrees.
     */
    export function setRotation(mapView: MapView, yaw: number, pitch: number) {
        yawQuaternion.setFromAxisAngle(yawAxis, geoUtils.MathUtils.degToRad(yaw));
        pitchQuaternion.setFromAxisAngle(pitchAxis, geoUtils.MathUtils.degToRad(pitch));

        yawQuaternion.multiply(pitchQuaternion);
        mapView.camera.quaternion.copy(yawQuaternion);
        mapView.camera.matrixWorldNeedsUpdate = true;
    }

    /**
     * Extracts yaw, pitch, and roll rotation in radians.
     * - Yaw : Rotation around the Z axis `(0,0,1)`.
     * - Pitch :Rotation around the X axis `(1,0,0)`.
     * - Roll : Rotation around the Y axis `(0,1,0)`.
     *
     * @see https://en.wikipedia.org/wiki/Conversion_between_quaternions_and_Euler_angles
     *
     * @param q : Quaternion that represents the given rotation
     * from which to extract the yaw, roll, and pitch.
     */
    export function extractYawPitchRoll(q: THREE.Quaternion): YawPitchRoll {
        const ysqr = q.y * q.y;

        // pitch (x-axis rotation)
        const t0 = +2.0 * (q.w * q.x + q.y * q.z);
        const t1 = +1.0 - 2.0 * (q.x * q.x + ysqr);
        const pitch = Math.atan2(t0, t1);

        // roll (y-axis rotation)
        let t2 = +2.0 * (q.w * q.y - q.z * q.x);
        t2 = t2 > 1.0 ? 1.0 : t2;
        t2 = t2 < -1.0 ? -1.0 : t2;
        const roll = Math.asin(t2);

        // yaw (z-axis rotation)
        const t3 = +2.0 * (q.w * q.z + q.x * q.y);
        const t4 = +1.0 - 2.0 * (ysqr + q.z * q.z);
        const yaw = Math.atan2(t3, t4);

        return { yaw, pitch, roll };
    }

    /**
     * Casts a ray in NDC space from the current view of the camera and returns the intersection
     * point of that ray against the map in geo coordinates. The return value can be `null` when
     * the raycast is above the horizon.
     *
     * @param mapView Instance of MapView.
     * @param pointOnScreenNDC  Point in NDC space.
     * @returns Intersection geo coordinates, or `null` if raycast is above the horizon.
     */
    export function rayCastGeoCoordinates(
        mapView: MapView,
        pointOnScreenXinNDC: number,
        pointOnScreenYinNDC: number
    ): geoUtils.GeoCoordinates | null {
        const worldCoordinates = rayCastWorldCoordinates(
            mapView,
            pointOnScreenXinNDC,
            pointOnScreenYinNDC
        );

        if (!worldCoordinates) {
            return null;
        }

        return mapView.projection.unprojectPoint(worldCoordinates);
    }

    /**
     * Calculates the zoom level, which corresponds to the current distance from
     * camera to lookAt point.
     * Therefore the zoom level is a `float` and not an `int`. The height of the camera can be in
     * between zoom levels. By setting the zoom level, you change the height position of the camera
     * in away that the field of view of the camera should be able to cover one tile for the given
     * zoom level.
     *
     * As an example for this, when you have a tile of zoom level 14 in front of the camera and you
     * set the zoom level of the camera to 14, then you are able to see the whole tile in front of
     * you.
     */
    export function calculateZoomLevelFromDistance(distance: number, mapView: MapView): number {
        const tileSize = (256 * distance) / mapView.focalLength;
        return geoUtils.MathUtils.clamp(
            Math.log2(EarthConstants.EQUATORIAL_CIRCUMFERENCE / tileSize),
            mapView.minZoomLevel,
            mapView.maxZoomLevel
        );
    }

    /**
     * Translates a linear clip-space distance value to the actual value stored in the depth buffer.
     * This is useful as the depth values are not stored in the depth buffer linearly, and this can
     * lead into confusing behavior when not taken into account.
     *
     * @param clipDistance Distance from the camera in clip space (range: [0, 1]).
     * @param camera Camera applying the perspective projection.
     */
    export function calculateDepthFromClipDistance(
        clipDistance: number,
        camera: THREE.Camera
    ): number {
        const perspCam = camera as THREE.PerspectiveCamera;
        const cameraRange = perspCam.far - perspCam.near;
        const viewSpaceDistance = clipDistance * perspCam.far;

        return (1.0 - perspCam.near / viewSpaceDistance) * (perspCam.far / cameraRange);
    }

    /**
     * Translates a linear distance value [0..1], where 1 is the distance to the far plane, into
     * [0..cameraFar].
     *
     * @param distance Distance from the camera (range: [0, 1]).
     * @param camera Camera applying the perspective projection.
     */
    export function cameraToWorldDistance(distance: number, camera: THREE.Camera): number {
        const perspCam = camera as THREE.PerspectiveCamera;
        return distance * perspCam.far;
    }

    /**
     * Calculates vertical field of view for given horizontal field of vision and aspect ratio.
     *
     * @param hFov Horizontal field of view in rad.
     * @param aspect Aspect ratio.
     */
    export function calculateVerticalFovByHorizontalFov(hFov: number, aspect: number): number {
        return 2 * Math.atan(Math.tan(hFov / 2) / aspect);
    }

    /**
     * Calculates horizontal field of view for given vertical field of vision and aspect ratio.
     *
     * @param hFov Vertical field of view in rad.
     * @param aspect Aspect ratio.
     */
    export function calculateHorizontalFovByVerticalFov(vFov: number, aspect: number): number {
        return 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    }

    /**
     * Calculates the focal length based on the vertical FOV and height.
     *
     * @param vFov Vertical field of view in rad.
     * @param height Height of canvas in pixels.
     */
    export function calculateFocalLengthByVerticalFov(vFov: number, height: number): number {
        return height / 2 / Math.tan(vFov / 2);
    }

    /**
     * Calculates the vertical field of view based on the focal length and the height.
     *
     * @param focalLength Focal length in pixels (see [[calculateFocalLengthByVerticalFov]])
     * @param height Height of canvas in pixels.
     */
    export function calculateFovByFocalLength(focalLength: number, height: number): number {
        return geoUtils.MathUtils.radToDeg(2 * Math.atan(height / 2 / focalLength));
    }

    /**
     * Computes estimate for size of a THREE.Object3D object and its children. Shared materials
     * and/or attributes will be counted multiple times.
     *
     * @param object The mesh object to evaluate
     * @param size The [[MemoryUsage]] to update.
     * @param visitedObjects Optional map to store large objects that could be shared.
     *
     * @returns Estimate of object size in bytes for heap and GPU.
     */
    export function estimateObject3dSize(
        object: THREE.Object3D,
        parentSize?: MemoryUsage,
        visitedObjects?: Map<string, boolean>
    ): MemoryUsage {
        const size =
            parentSize !== undefined
                ? parentSize
                : {
                      heapSize: 0,
                      gpuSize: 0
                  };

        if (visitedObjects === undefined) {
            visitedObjects = new Map();
        }

        estimateMeshSize(object, size, visitedObjects);

        if (object.children.length > 0) {
            for (const child of object.children) {
                estimateObject3dSize(child, size, visitedObjects);
            }
        }
        return size;
    }

    function estimateTextureSize(
        texture: THREE.Texture | null,
        objectSize: MemoryUsage,
        visitedObjects: Map<string, boolean>
    ): void {
        if (texture === null || texture.image === undefined) {
            return;
        }

        if (texture.uuid !== undefined && visitedObjects.get(texture.uuid) === true) {
            return;
        }
        visitedObjects.set(texture.uuid, true);

        // May be HTMLImage or ImageData
        const image = texture.image;
        // Assuming RGBA
        const imageBytes = 4 * image.width * image.height;
        objectSize.heapSize += imageBytes;
        objectSize.gpuSize += imageBytes;
    }

    function estimateMaterialSize(
        material: THREE.Material,
        objectSize: MemoryUsage,
        visitedObjects: Map<string, boolean>
    ): void {
        if (material.uuid !== undefined && visitedObjects.get(material.uuid) === true) {
            return;
        }
        visitedObjects.set(material.uuid, true);

        if (
            material instanceof THREE.RawShaderMaterial ||
            material instanceof THREE.ShaderMaterial
        ) {
            const rawMaterial = material;
            for (const name in rawMaterial.uniforms) {
                if (rawMaterial.uniforms[name] !== undefined) {
                    const uniform = rawMaterial.uniforms[name];
                    if (uniform instanceof THREE.Texture) {
                        estimateTextureSize(uniform, objectSize, visitedObjects);
                    }
                }
            }
        } else if (
            material instanceof THREE.MeshBasicMaterial ||
            material instanceof MapMeshBasicMaterial
        ) {
            const meshMaterial = material;
            estimateTextureSize(meshMaterial.map, objectSize, visitedObjects);
            estimateTextureSize(meshMaterial.aoMap, objectSize, visitedObjects);
            estimateTextureSize(meshMaterial.specularMap, objectSize, visitedObjects);
            estimateTextureSize(meshMaterial.alphaMap, objectSize, visitedObjects);
            estimateTextureSize(meshMaterial.envMap, objectSize, visitedObjects);
        } else if (material instanceof MapMeshStandardMaterial) {
            const standardMaterial = material;
            estimateTextureSize(standardMaterial.map, objectSize, visitedObjects);
            estimateTextureSize(standardMaterial.aoMap, objectSize, visitedObjects);
            estimateTextureSize(standardMaterial.alphaMap, objectSize, visitedObjects);
            estimateTextureSize(standardMaterial.envMap, objectSize, visitedObjects);
        } else if (
            material instanceof THREE.LineBasicMaterial ||
            material instanceof THREE.LineDashedMaterial
        ) {
            // Nothing to be done here
        } else {
            logger.warn("estimateMeshSize: unidentified material: ", material);
        }
    }

    function estimateAttributeSize(
        attribute: any,
        attrName: string,
        objectSize: MemoryUsage,
        visitedObjects: Map<string, boolean>
    ): void {
        // Attributes (apparently) do not have their uuid set up.
        if (attribute.uuid === undefined) {
            attribute.uuid = THREE.Math.generateUUID();
        }

        if (visitedObjects.get(attribute.uuid) === true) {
            return;
        }
        visitedObjects.set(attribute.uuid, true);

        let attrBytes = 0;
        let bytesPerElement = 4;
        if (attribute.array.BYTES_PER_ELEMENT !== undefined) {
            bytesPerElement = attribute.array.BYTES_PER_ELEMENT;
        }
        if (
            attribute instanceof THREE.InterleavedBufferAttribute ||
            attribute instanceof THREE.BufferAttribute
        ) {
            attrBytes = bytesPerElement * attribute.count * attribute.itemSize;
        } else {
            logger.warn("estimateMeshSize: unidentified attribute: ", attrName);
        }

        objectSize.heapSize += attrBytes + MINIMUM_ATTRIBUTE_SIZE_ESTIMATION;
        objectSize.gpuSize += attrBytes;
    }

    function estimateMeshSize(
        object: THREE.Object3D,
        objectSize: MemoryUsage,
        visitedObjects: Map<string, boolean>
    ): void {
        if (!object.isObject3D || object instanceof THREE.Scene) {
            return;
        }

        if (object.uuid !== undefined && visitedObjects.get(object.uuid) === true) {
            return;
        }
        visitedObjects.set(object.uuid, true);

        if ((object as any).isMesh || (object as any).isLine) {
            // Estimated minimum impact on heap.
            let heapSize = MINIMUM_OBJECT3D_SIZE_ESTIMATION;
            const gpuSize = 0;

            const mesh = object as THREE.Mesh;

            if (mesh.material !== undefined) {
                if (Array.isArray(mesh.material)) {
                    const materials = mesh.material as THREE.Material[];
                    for (const material of materials) {
                        estimateMaterialSize(material, objectSize, visitedObjects);
                    }
                } else {
                    const material = mesh.material as THREE.Material;
                    estimateMaterialSize(material, objectSize, visitedObjects);
                }
            }

            if (mesh.geometry !== undefined) {
                const geometry = mesh.geometry;

                const isNewObject =
                    geometry.uuid === undefined || visitedObjects.get(geometry.uuid) !== true;

                if (isNewObject) {
                    visitedObjects.set(geometry.uuid, true);

                    // Estimated minimum overhead.
                    heapSize += MINIMUM_OBJECT3D_SIZE_ESTIMATION;

                    let bufferGeometry: THREE.BufferGeometry | undefined;

                    if (geometry instanceof THREE.Geometry) {
                        heapSize += geometry.vertices.length * 12;
                        // Face: 3 indices (24 byte), 1 normal (3 floats = 24). Vertex normals and
                        // colors are not counted here.
                        heapSize += geometry.faces.length * (24 + 24);
                        // Additionally, the internal _bufferGeometry is also counted:
                        bufferGeometry = (geometry as any)._bufferGeometry;
                    } else if (geometry instanceof THREE.BufferGeometry) {
                        bufferGeometry = geometry;
                    } else {
                        bufferGeometry = undefined;
                    }

                    if (bufferGeometry !== undefined) {
                        const attributes = bufferGeometry.attributes;
                        if (attributes !== undefined) {
                            for (const property in attributes) {
                                if (attributes[property] !== undefined) {
                                    estimateAttributeSize(
                                        attributes[property],
                                        property,
                                        objectSize,
                                        visitedObjects
                                    );
                                }
                            }
                            if (bufferGeometry.index !== null) {
                                estimateAttributeSize(
                                    bufferGeometry.index,
                                    "index",
                                    objectSize,
                                    visitedObjects
                                );
                            }
                        } else {
                            logger.warn("estimateMeshSize: unidentified geometry: ", mesh.geometry);
                        }
                    }

                    // Add info that is required for picking (parts of) objects and match them to
                    // the featureID in the map data.
                    const featureData: TileFeatureData | undefined =
                        object.userData !== undefined
                            ? (object.userData.feature as TileFeatureData)
                            : undefined;

                    if (featureData !== undefined) {
                        heapSize += getFeatureDataSize(featureData);
                    }
                }
            }

            objectSize.heapSize += heapSize;
            objectSize.gpuSize += gpuSize;
        } else {
            logger.warn("estimateMeshSize: unidentified object", object);
        }
    }

    /**
     * Gets language list used by the browser
     *
     * @returns Array of iso language codes
     */
    export function getBrowserLanguages(): string[] | undefined {
        if (navigator.languages !== undefined && navigator.languages.length > 0) {
            const languageList = [];
            for (const lang of navigator.languages) {
                languageList.push(getIsoLanguageCode(lang));
            }
            return languageList;
        }
        if (navigator.language !== undefined) {
            return [getIsoLanguageCode(navigator.language)];
        }
        return undefined;
    }

    /**
     * Gets ISO-639-1 language code from browser's code (ex. en for en-US)
     */
    function getIsoLanguageCode(language: string) {
        return language.substring(0, 2);
    }
}
