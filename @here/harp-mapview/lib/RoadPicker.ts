/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ExtendedTileInfo,
    getPropertyValue,
    LineTechnique,
    SolidLineTechnique
} from "@here/harp-datasource-protocol";
import { Expr } from "@here/harp-datasource-protocol/lib/Expr";
import { assert, LoggerManager, Math2D } from "@here/harp-utils";
import * as THREE from "three";
import { compileTechniques } from "./DecodedTileHelpers";
import { MapView } from "./MapView";
import { PickObjectType, PickResult } from "./PickHandler";
import { RoadIntersectionData, Tile } from "./Tile";

const logger = LoggerManager.instance.create("RoadPicker");

export interface RoadPickResult extends PickResult {
    distFromCenter: number;
    positions: number[];
}

const MAX_DISTANCE_ERROR = 0.01;

/**
 * Optional flags in the style that can be used to optimize the evaluation.
 */
interface CustomLineTechnique extends LineTechnique {
    isBackground?: boolean;
}

/**
 * The `RoadPicker` class manages picking of roads, which may not be pickable in THREE.js, since
 * their geometry is generated in the vertex shader.
 */
export class RoadPicker {
    constructor(private m_mapView: MapView) {}
    /**
     * Registers a tile with the `RoadPicker`. This function extracts line data from the [[Tile]],
     * but only if the tile has the necessary [[ExtendedTileInfo]] that allows for road features to
     * be reconstructed.
     *
     * @param tile The tile to register.
     */
    registerTile(tile: Tile): RoadIntersectionData | undefined {
        assert(tile.decodedTile !== undefined);
        if (tile.decodedTile === undefined || tile.decodedTile.tileInfo === undefined) {
            return undefined;
        }
        const extendedTileInfo: ExtendedTileInfo = tile.decodedTile.tileInfo as ExtendedTileInfo;
        const lineFeatures = extendedTileInfo.lineGroup;

        if (lineFeatures === undefined || lineFeatures.numFeatures === 0) {
            // tileInfo not of expected type [[ExtendedTileInfo]]
            return undefined;
        }

        const widths: RoadIntersectionData["widths"] = [];
        widths.length = lineFeatures.numFeatures;

        compileTechniques(extendedTileInfo.techniqueCatalog);

        const mapView = this.m_mapView;
        for (let i = 0; i < lineFeatures.numFeatures; i++) {
            const technique = extendedTileInfo.techniqueCatalog[
                lineFeatures.techniqueIndex[i]
            ] as SolidLineTechnique;

            const isDynamic =
                technique.metricUnit === "Pixel" ||
                Expr.isExpr(technique.lineWidth) ||
                typeof technique.lineWidth === "string";

            widths[i] =
                technique.lineWidth !== undefined
                    ? isDynamic
                        ? () => {
                              const unitFactor =
                                  technique.metricUnit === "Pixel" ? mapView.pixelToWorld : 1.0;
                              return (
                                  getPropertyValue(technique.lineWidth, mapView.mapEnv) *
                                  unitFactor *
                                  0.5
                              );
                          }
                        : (technique.lineWidth as number)
                    : 1.0;
        }
        const objInfos = extendedTileInfo.lineGroup.userData;

        const roadIntersectionData = {
            ids: lineFeatures.featureIds,
            techniqueIndex: lineFeatures.techniqueIndex,
            starts: lineFeatures.positionIndex,
            widths,
            positions: lineFeatures.positions,
            techniques: extendedTileInfo.techniqueCatalog,
            objInfos
        };

        return roadIntersectionData;
    }

    /**
     * Tests the `pickPos` point for intersection with all roads on a tile.
     *
     * @param tile The tile to pick.
     * @param eyePos The WorldPosition of eye or camera to compute distances.
     * @param pickPos The WorldPosition of the picked point, on the plane.
     * @param results The existing array of [[PickResult]]; new results should be appended.
     */
    intersectRoads(
        tile: Tile,
        eyePos: THREE.Vector3,
        pickPos: THREE.Vector3,
        results: PickResult[]
    ): boolean {
        if (tile.boundingBox.distanceToPoint(pickPos) > MAX_DISTANCE_ERROR) {
            // outside of bounding box of tile
            return false;
        }

        const roadIntersectionData = tile.roadIntersectionData;
        if (roadIntersectionData === undefined) {
            return false;
        }

        const ids = roadIntersectionData.ids;
        const techniques = roadIntersectionData.techniques;
        const techniqueIndices = roadIntersectionData.techniqueIndex;
        const numFeatures = ids.length;
        const positions = roadIntersectionData.positions;
        const widths = roadIntersectionData.widths;
        const px = pickPos.x - tile.center.x;
        const py = pickPos.y - tile.center.y;
        const pickDistance = pickPos.distanceTo(eyePos);

        if (
            widths.length !== ids.length ||
            ids.length !== techniqueIndices.length ||
            techniqueIndices.length !== roadIntersectionData.starts.length
        ) {
            logger.error(
                "The amount of widths, ids, techniqueIndices and starts has to be the same"
            );
            return false;
        }

        for (let i = 0; i < numFeatures; i++) {
            const technique = techniques[techniqueIndices[i]] as CustomLineTechnique;

            // if the technique is marked as background or as transient, we ignore it for picking
            if (/*technique.isBackground === true ||*/ technique.transient === true) {
                continue;
            }

            const featureStart = roadIntersectionData.starts[i];
            const featureEnd =
                i < numFeatures - 1
                    ? roadIntersectionData.starts[i + 1]
                    : roadIntersectionData.positions.length;

            let startX = positions[featureStart];
            let startY = positions[featureStart + 1];

            const widthEntry = widths[i];
            const actualWidth = Math.max(
                1,
                typeof widthEntry === "function" ? widthEntry() : widthEntry
            );
            const lineWidthSqr = actualWidth * actualWidth;

            let closestDistSqr = Number.MAX_VALUE;

            for (let j = featureStart + 2; j < featureEnd; j += 2) {
                const endX = positions[j];
                const endY = positions[j + 1];

                const distSqr = Math2D.distToSegmentSquared(px, py, startX, startY, endX, endY);
                if (distSqr < lineWidthSqr) {
                    if (distSqr < closestDistSqr) {
                        closestDistSqr = distSqr;
                    }
                }

                startX = endX;
                startY = endY;
            }

            if (closestDistSqr < Number.MAX_VALUE) {
                const roadPickResult: RoadPickResult = {
                    type: PickObjectType.Line,
                    point: pickPos,
                    distance: pickDistance,
                    distFromCenter: Math.sqrt(closestDistSqr),
                    featureId: ids[i],
                    positions: positions.slice(featureStart, featureEnd),
                    technique
                };
                this.addUserData(roadPickResult, i, roadIntersectionData.objInfos);
                results.push(roadPickResult);
            }
        }

        return false;
    }

    private addUserData(
        roadPickResult: RoadPickResult,
        index: number,
        objInfos?: Array<{} | undefined>
    ) {
        if (objInfos !== undefined && objInfos.length > 0) {
            roadPickResult.userData = { ...objInfos[index] };
        }
    }
}
