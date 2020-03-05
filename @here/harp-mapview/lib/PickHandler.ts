/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeometryType, getFeatureId, Technique } from "@here/harp-datasource-protocol";
import * as THREE from "three";

import { MapView } from "./MapView";
import { MapViewPoints } from "./MapViewPoints";
import { PickingRaycaster } from "./PickingRaycaster";
import { RoadPicker } from "./RoadPicker";
import { RoadIntersectionData, Tile, TileFeatureData } from "./Tile";

/**
 * Describes the general type of a picked object.
 */
export enum PickObjectType {
    /**
     * Unspecified.
     */
    Unspecified = 0,

    /**
     * A point object.
     */
    Point,

    /**
     * A line object.
     */
    Line,

    /**
     * An area object.
     */
    Area,

    /**
     * The text part of a [[TextElement]]
     */
    Text,

    /**
     * The Icon of a [[TextElement]].
     */
    Icon,

    /**
     * Any general 3D object, for example, a landmark.
     */
    Object3D
}

/**
 * A general pick result. You can access the details of a picked geometry from the property
 * `intersection`, which is available if a geometry was hit. If a road was hit, a [[RoadPickResult]]
 * is returned, which has additional information, but no `intersection`.
 */
export interface PickResult {
    /**
     * General type of object.
     */
    type: PickObjectType;

    /**
     * A 2D point in screen coordinates, or a 3D point in world coordinates.
     */
    point: THREE.Vector2 | THREE.Vector3;

    /**
     * Distance from the camera to the picking point; used to determine the closest object.
     */
    distance: number;

    /**
     * An optional feature ID of the picked object; typically applies to the Optimized Map
     * Vector (OMV) format.
     */
    featureId?: number;

    /**
     * Defined for geometry only.
     */
    intersection?: THREE.Intersection;

    /**
     * Defined for roads or if `enableTechniqueInfo` option is enabled.
     */
    technique?: Technique;

    /**
     * Optional user data that has been defined in the picked object. This object points directly to
     * information contained in the original [[TileFeatureData]] stored in [[MapView]], and should
     * not be modified.
     */
    userData?: any;
}

/**
 * Handles the picking of scene geometry and roads.
 */
export class PickHandler {
    readonly rayCaster: PickingRaycaster;
    private readonly m_plane = new THREE.Plane(new THREE.Vector3(0, 0, 1));
    private readonly m_roadPicker?: RoadPicker;

    constructor(
        readonly mapView: MapView,
        readonly camera: THREE.Camera,
        width: number,
        height: number,
        public enableRoadPicking = true,
        public enablePickTechnique = false
    ) {
        if (enableRoadPicking) {
            this.m_roadPicker = new RoadPicker(mapView);
        }
        this.rayCaster = new PickingRaycaster(width, height, mapView, camera);
    }

    /**
     * The `RoadPicker` class manages picking of roads, which may not be pickable in THREE.js,
     * since their geometry is generated in the vertex shader. The `RoadPicker` requires that
     * all [[Tile]]s are registered before they can be picked successfully.
     */
    registerTile(tile: Tile): RoadIntersectionData | undefined {
        return this.m_roadPicker !== undefined ? this.m_roadPicker.registerTile(tile) : undefined;
    }

    /**
     * Does a raycast on all objects in the scene; useful for picking. This function is Limited to
     * objects that THREE.js can raycast. However, any solid lines that have their geometry in the
     * shader cannot be tested for intersection.
     *
     * @param x The X position in CSS/client coordinates, without the applied display ratio.
     * @param y The Y position in CSS/client coordinates, without the applied display ratio.
     * @returns the list of intersection results.
     */
    intersectMapObjects(x: number, y: number): PickResult[] {
        const screenNdc = this.mapView.getNormalizedScreenCoordinates(x, y);
        const pickResults: PickResult[] = [];

        if (this.mapView.textElementsRenderer !== undefined) {
            const { clientWidth, clientHeight } = this.mapView.canvas;
            const screenX = screenNdc.x * clientWidth * 0.5 * this.mapView.pixelRatio;
            const screenY = screenNdc.y * clientHeight * 0.5 * this.mapView.pixelRatio;
            const scenePosition = new THREE.Vector2(screenX, screenY);
            this.mapView.textElementsRenderer.pickTextElements(scenePosition, pickResults);
        }

        const rayCaster = this.rayCaster;
        rayCaster.setFromCamera(screenNdc, this.camera);

        const intersects: THREE.Intersection[] = [];

        // calculate 3D objects intersecting the picking ray
        for (const object of this.mapView.worldRootObject.children) {
            if (object.userData.feature?.geometryType === GeometryType.ExtrudedPolygon) {
                rayCaster.intersectObject(object, true, intersects);
            }
        }

        this.intersectMapObjects2D(x, y, intersects);

        for (const intersect of intersects) {
            const pickResult: PickResult = {
                type: PickObjectType.Unspecified,
                point: intersect.point,
                distance: intersect.distance,
                intersection: intersect
            };

            if (
                intersect.object.userData === undefined ||
                intersect.object.userData.feature === undefined
            ) {
                pickResults.push(pickResult);
                continue;
            }

            const featureData: TileFeatureData = intersect.object.userData.feature;
            if (this.enablePickTechnique) {
                pickResult.technique = intersect.object.userData.technique;
            }

            this.addObjInfo(featureData, intersect, pickResult);

            if (featureData.objInfos !== undefined) {
                const featureId =
                    featureData.objInfos.length === 1
                        ? getFeatureId(featureData.objInfos[0])
                        : undefined;
                pickResult.featureId = featureId;
            }

            let pickObjectType: PickObjectType;

            switch (featureData.geometryType) {
                case GeometryType.Point:
                case GeometryType.Text:
                    pickObjectType = PickObjectType.Point;
                    break;
                case GeometryType.Line:
                case GeometryType.ExtrudedLine:
                case GeometryType.SolidLine:
                case GeometryType.TextPath:
                    pickObjectType = PickObjectType.Line;
                    break;
                case GeometryType.Polygon:
                case GeometryType.ExtrudedPolygon:
                    pickObjectType = PickObjectType.Area;
                    break;
                case GeometryType.Object3D:
                    pickObjectType = PickObjectType.Object3D;
                    break;
                default:
                    pickObjectType = PickObjectType.Unspecified;
            }

            pickResult.type = pickObjectType;
            pickResults.push(pickResult);
        }

        // if (this.enableRoadPicking) {
        //     const planeIntersectPosition = new THREE.Vector3();
        //     const cameraPos = this.mapView.camera.position.clone();

        //     rayCaster.setFromCamera(screenNdc, this.mapView.camera);
        //     rayCaster.ray.intersectPlane(this.m_plane, planeIntersectPosition);

        //     this.mapView.forEachVisibleTile(tile => {
        //         this.m_roadPicker!.intersectRoads(
        //             tile,
        //             cameraPos,
        //             planeIntersectPosition,
        //             pickResults
        //         );
        //     });
        // }

        pickResults.sort((a: PickResult, b: PickResult) => {
            return a.distance - b.distance;
        });

        return pickResults;
    }

    private intersectMapObjects2D(x: number, y: number, intersects: THREE.Intersection[]) {
        // Find 2D objects at the picking ray intersection on the ground.
        const rayCaster = this.rayCaster;
        rayCaster.setFromCamera(
            this.mapView.getNormalizedScreenCoordinates(x, y),
            this.mapView.camera
        );
        const worldGroundIntersect = rayCaster.intersectGround(x, y, true);
        if (!worldGroundIntersect) {
            return;
        }
        const geoGroundIntersect = this.mapView.projection.unprojectPoint(worldGroundIntersect);

        // const tileOffset = 0; // TODO: FIND TILE OFFSET!
        // const intersectTiles = this.mapView.visibleTileSet.getRenderedTilesAtLocation(
        //     geoGroundIntersect,
        //     tileOffset
        // );
        // if (intersectTiles.length === 0) {
        //     return;
        // }

        // const intersectNormal = new THREE.Vector3();
        // this.mapView.projection.surfaceNormal(worldGroundIntersect, intersectNormal);
        // rayCaster.set(worldGroundIntersect.sub(rayCaster.camera.position), intersectNormal);
        rayCaster.camera = this.camera;
        rayCaster.set(
            this.camera.position,
            worldGroundIntersect.sub(this.mapView.camera.position).normalize()
        );

        // for (const tile of intersectTiles) {
        //     rayCaster.intersectObjects(tile.objects, true, intersects);
        // }

        for (const object of this.mapView.worldRootObject.children) {
            rayCaster.intersectObject(object, true, intersects);
        }
    }

    private addObjInfo(
        featureData: TileFeatureData,
        intersect: THREE.Intersection,
        pickResult: PickResult
    ) {
        if (pickResult.intersection!.object instanceof MapViewPoints) {
            pickResult.userData = featureData.objInfos![intersect.index!];
            return;
        } else if (
            featureData.objInfos === undefined ||
            featureData.starts === undefined ||
            intersect.faceIndex === undefined
        ) {
            return;
        }

        if (featureData.starts.length > 1) {
            let objInfosIndex = 0;
            for (const polygonStartFace of featureData.starts) {
                if (polygonStartFace > intersect.faceIndex * 3) {
                    break;
                }
                objInfosIndex++;
            }
            pickResult.userData = featureData.objInfos[objInfosIndex - 1];
        } else {
            pickResult.userData = featureData.objInfos[0];
        }
    }
}
