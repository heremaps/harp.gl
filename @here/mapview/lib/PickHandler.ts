/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */
import { GeometryType, Technique } from "@here/datasource-protocol";
import * as THREE from "three";

import { MapView } from "./MapView";
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
     * Any general 3D object, for example a landmark.
     */
    Object3D
}

/**
 * General pick result. Details about picked geometry can be accessed from `intersection`, which
 * is available if actual 3D geometry has been hit. If a road was hit, a [[RoadPickResult]] is
 * returned, which has additional information, but no `intersection`.
 */
export interface PickResult {
    /**
     * General type of object.
     */
    type: PickObjectType;

    /**
     * 2D point in screen coordinates, or 3D point in world coordinates.
     */
    point: THREE.Vector2 | THREE.Vector3;

    /**
     * Distance from camera to picking point. Used to determine closest object.
     */
    distance: number;

    /**
     * Optional: feature ID (from OMV) of picked object.
     */
    featureId?: number;

    /**
     * Only defined for geometry.
     */
    intersection?: THREE.Intersection;

    /**
     * Only defined for roads.
     */
    technique?: Technique;

    /**
     * Optional user data that has has been defined in the picked object.
     */
    userData?: any;
}

/**
 * Handles the picking of scene geometry and roads.
 */
export class PickHandler {
    private readonly m_rayCaster = new THREE.Raycaster();
    private readonly m_plane = new THREE.Plane(new THREE.Vector3(0, 0, 1));
    private readonly m_roadPicker?: RoadPicker;

    constructor(readonly mapView: MapView, public enableRoadPicking = true) {
        if (enableRoadPicking) {
            this.m_roadPicker = new RoadPicker(mapView);
        }
    }

    /**
     * The `RoadPicker` class manages picking of roads, which may not be pickable in THREE.js, since
     * their geometry is generated in the vertex shader. The `RoadPicker` requires to register all
     * [[Tile]]s before they can be successfully picked.
     */
    registerTile(tile: Tile): RoadIntersectionData | undefined {
        return this.m_roadPicker !== undefined ? this.m_roadPicker.registerTile(tile) : undefined;
    }

    /**
     * Do a raycast on all objects in the scene. Useful for picking. Limited to objects that
     * THREE.js can raycast, the solid lines that get their geometry in the shader cannot be tested
     * for intersection.
     *
     * @param x The X position in css/client coordinates (without applied display ratio).
     * @param y The Y position in css/client coordinates (without applied display ratio).
     * @returns The list of intersection results.
     */
    intersectMapObjects(x: number, y: number): PickResult[] {
        const worldPos = this.mapView.getNormalizedScreenCoordinates(x, y);
        const rayCaster = this.m_rayCaster;

        const pickResults: PickResult[] = [];

        if (this.mapView.textElementsRenderer !== undefined) {
            const { clientWidth, clientHeight } = this.mapView.canvas;
            const screenX = worldPos.x * clientWidth * 0.5 * devicePixelRatio;
            const screenY = worldPos.y * clientHeight * 0.5 * devicePixelRatio;
            const scenePosition = new THREE.Vector2(screenX, screenY);
            this.mapView.textElementsRenderer.pickTextElements(scenePosition, pickResults);
        }

        rayCaster.setFromCamera(worldPos, this.mapView.camera);
        rayCaster.linePrecision = 1;

        // calculate objects intersecting the picking ray
        const intersects = rayCaster.intersectObjects(this.mapView.worldRootObject.children, true);
        for (const intersect of intersects) {
            const pickResult: PickResult = {
                type: PickObjectType.Unspecified,
                point: intersect.point,
                distance: intersect.distance,
                intersection: intersect
            };

            if (intersect.object.userData !== undefined) {
                const featureData: TileFeatureData | undefined =
                    intersect.object.userData !== undefined
                        ? (intersect.object.userData.feature as TileFeatureData)
                        : undefined;

                if (featureData === undefined) {
                    pickResults.push(pickResult);
                    continue;
                }

                this.addObjInfo(featureData, intersect, pickResult);

                if (featureData.ids !== undefined) {
                    const featureId = featureData.ids.length === 1 ? featureData.ids[0] : undefined;
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
        }

        if (this.enableRoadPicking) {
            const planeIntersectPosition = new THREE.Vector3();
            rayCaster.ray.intersectPlane(this.m_plane, planeIntersectPosition);
            planeIntersectPosition.add(this.mapView.worldCenter);

            const cameraPos = this.mapView.worldCenter.clone().add(this.mapView.camera.position);

            this.mapView.forEachVisibleTile(tile => {
                this.m_roadPicker!.intersectRoads(
                    tile,
                    cameraPos,
                    planeIntersectPosition,
                    pickResults
                );
            });
        }

        pickResults.sort((a: PickResult, b: PickResult) => {
            return a.distance - b.distance;
        });

        return pickResults;
    }

    private addObjInfo(
        featureData: TileFeatureData,
        intersect: THREE.Intersection,
        pickResult: PickResult
    ) {
        if (
            featureData.objInfos === undefined ||
            featureData.starts === undefined ||
            intersect.faceIndex === undefined
        ) {
            return;
        }

        if (featureData.starts.length > 1) {
            let objInfosIndex = 0;
            for (const polygonStartFace of featureData.starts) {
                if (polygonStartFace > intersect.faceIndex) {
                    break;
                }
                objInfosIndex++;
            }
            intersect.object.userData.objInfo = { ...featureData.objInfos[objInfosIndex - 1] };
            pickResult.userData = { ...featureData.objInfos[objInfosIndex - 1] };
        } else {
            intersect.object.userData.objInfo = { ...featureData.objInfos[0] };
            pickResult.userData = { ...featureData.objInfos[0] };
        }
    }
}
