/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeometryType, getFeatureId, Technique } from "@here/harp-datasource-protocol";
import * as THREE from "three";

import { OrientedBox3 } from "@here/harp-geoutils";
import { MapView } from "./MapView";
import { MapViewPoints } from "./MapViewPoints";
import { TileFeatureData } from "./Tile";

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
     * The text part of a {@link TextElement}
     */
    Text,

    /**
     * The Icon of a {@link TextElement}.
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
     * Optional user data that has been defined in the picked object.
     *
     * @remarks
     * This object points directly to
     * information contained in the original {@link TileFeatureData}
     * stored in {@link MapView}, and should
     * not be modified.
     */
    userData?: any;
}

const tmpOBB = new OrientedBox3();

/**
 * Handles the picking of scene geometry and roads.
 * @internal
 */
export class PickHandler {
    constructor(
        readonly mapView: MapView,
        readonly camera: THREE.Camera,
        public enablePickTechnique = false
    ) {}

    /**
     * Does a raycast on all objects in the scene; useful for picking. This function is Limited to
     * objects that THREE.js can raycast. However, any solid lines that have their geometry in the
     * shader cannot be tested for intersection.
     *
     * @param x - The X position in CSS/client coordinates, without the applied display ratio.
     * @param y - The Y position in CSS/client coordinates, without the applied display ratio.
     * @returns the list of intersection results.
     */
    intersectMapObjects(x: number, y: number): PickResult[] {
        const worldPos = this.mapView.getNormalizedScreenCoordinates(x, y);
        const rayCaster = this.mapView.raycasterFromScreenPoint(x, y);
        const pickResults: PickResult[] = [];

        if (this.mapView.textElementsRenderer !== undefined) {
            const { clientWidth, clientHeight } = this.mapView.canvas;
            const screenX = worldPos.x * clientWidth * 0.5;
            const screenY = worldPos.y * clientHeight * 0.5;
            const scenePosition = new THREE.Vector2(screenX, screenY);
            this.mapView.textElementsRenderer.pickTextElements(scenePosition, pickResults);
        }

        const intersects: THREE.Intersection[] = [];
        const tileList = this.mapView.visibleTileSet.dataSourceTileList;
        tileList.forEach(dataSourceTileList => {
            dataSourceTileList.renderedTiles.forEach(tile => {
                tmpOBB.copy(tile.boundingBox);
                tmpOBB.position.sub(this.mapView.worldCenter);
                // This offset shifts the box by the given tile offset, see renderTileObjects in
                // MapView
                const worldOffsetX = tile.computeWorldOffsetX();
                tmpOBB.position.x += worldOffsetX;

                if (tmpOBB.intersectsRay(rayCaster.ray) !== undefined) {
                    rayCaster.intersectObjects(tile.objects, true, intersects);
                }
            });
        });

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
        if (featureData.objInfos === undefined) {
            return;
        }

        if (pickResult.intersection!.object instanceof MapViewPoints) {
            pickResult.userData = featureData.objInfos[intersect.index!];
            return;
        }

        if (
            featureData.starts === undefined ||
            featureData.starts.length === 0 ||
            (intersect.faceIndex === undefined && intersect.index === undefined)
        ) {
            return;
        }

        if (featureData.starts.length === 1) {
            pickResult.userData = featureData.objInfos[0];
            return;
        }

        const intersectIndex =
            intersect.faceIndex !== undefined ? intersect.faceIndex * 3 : intersect.index!;

        // TODO: Implement binary search.
        let objInfosIndex = 0;
        for (const featureStartIndex of featureData.starts) {
            if (featureStartIndex > intersectIndex) {
                break;
            }
            objInfosIndex++;
        }
        pickResult.userData = featureData.objInfos[objInfosIndex - 1];
    }
}
