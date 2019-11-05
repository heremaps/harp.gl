/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ExtendedTileInfo,
    ExtendedTileInfoWriter,
    FeatureGroupType,
    IndexedTechnique
} from "@here/harp-datasource-protocol";
import { StyleSetEvaluator } from "@here/harp-datasource-protocol/index-decoder";
import * as THREE from "three";

import { AttrEvaluationContext } from "@here/harp-datasource-protocol/lib/TechniqueAttr";
import { ILineGeometry, IPolygonGeometry } from "./IGeometryProcessor";
import { IVectorTileEmitter, Ring, VectorDecoder } from "./VectorTileDecoder";
import { webMercatorTile2TargetWorld } from "./VectorTileUtils";

export class VectorTileInfoEmitter implements IVectorTileEmitter {
    private readonly m_tileInfo: ExtendedTileInfo;
    private readonly m_tileInfoWriter: ExtendedTileInfoWriter;

    /**
     * Create VectorTileInfoEmitter object
     *
     * @param m_decodeInfo
     * @param m_styleSetEvaluator
     * @param m_storeExtendedTags
     * @param m_gatherRoadSegments
     */
    constructor(
        private readonly m_decodeInfo: VectorDecoder.DecodeInfo,
        // tslint:disable-next-line:no-unused-variable
        private readonly m_styleSetEvaluator: StyleSetEvaluator,
        private readonly m_storeExtendedTags: boolean,
        private readonly m_gatherRoadSegments: boolean,
        private readonly m_languages?: string[]
    ) {
        this.m_tileInfo = new ExtendedTileInfo(m_decodeInfo.tileKey, this.m_storeExtendedTags);
        this.m_tileInfoWriter = new ExtendedTileInfoWriter(
            this.m_tileInfo,
            this.m_storeExtendedTags
        );
    }

    processPointFeature(
        layer: string,
        extents: number,
        geometry: THREE.Vector2[],
        context: AttrEvaluationContext,
        techniques: IndexedTechnique[],
        featureId: number | undefined
    ): void {
        const tileInfoWriter = this.m_tileInfoWriter;
        const tmpV = new THREE.Vector3();

        for (const technique of techniques) {
            if (technique === undefined) {
                continue;
            }

            const infoTileTechniqueIndex = tileInfoWriter.addTechnique(technique);
            const featureText = ExtendedTileInfo.getFeatureText(
                context,
                technique,
                this.m_languages
            );
            for (const pos of geometry) {
                webMercatorTile2TargetWorld(extents, this.m_decodeInfo, pos, tmpV);
                tileInfoWriter.addFeature(
                    this.m_tileInfo.pointGroup,
                    context.env,
                    featureId,
                    featureText,
                    infoTileTechniqueIndex,
                    FeatureGroupType.Point
                );
                tileInfoWriter.addFeaturePoint(this.m_tileInfo.pointGroup, tmpV.x, tmpV.y);
            }
        }
    }

    processLineFeature(
        layer: string,
        extents: number,
        geometry: ILineGeometry[],
        context: AttrEvaluationContext,
        techniques: IndexedTechnique[],
        featureId: number | undefined
    ): void {
        const tileInfoWriter = this.m_tileInfoWriter;
        const env = context.env;

        const tmpV = new THREE.Vector3();

        const lines: number[][] = [];

        for (const polyline of geometry) {
            const line: number[] = [];
            for (const pos of polyline.positions) {
                webMercatorTile2TargetWorld(extents, this.m_decodeInfo, pos, tmpV);
                line.push(tmpV.x, tmpV.y);
            }
            lines.push(line);
        }

        for (const technique of techniques) {
            if (technique === undefined) {
                continue;
            }

            const infoTileTechniqueIndex = tileInfoWriter.addTechnique(technique);
            const featureText = ExtendedTileInfo.getFeatureText(
                context,
                technique,
                this.m_languages
            );
            for (const aLine of lines) {
                tileInfoWriter.addFeature(
                    this.m_tileInfo.lineGroup,
                    env,
                    featureId,
                    featureText,
                    infoTileTechniqueIndex,
                    FeatureGroupType.Line
                );

                tileInfoWriter.addFeaturePoints(this.m_tileInfo.lineGroup, aLine);
            }
        }

        if (this.m_gatherRoadSegments) {
            const segmentId = env.lookup("segmentId") as number;
            if (segmentId !== undefined) {
                const startOffset = env.lookup("startOffset");
                const endOffset = env.lookup("endOffset");
                tileInfoWriter.addRoadSegments(
                    this.m_tileInfo.lineGroup,
                    segmentId,
                    startOffset !== undefined ? (startOffset as number) : 0,
                    endOffset !== undefined ? (endOffset as number) : 1
                );
            }
        }
    }

    processPolygonFeature(
        layer: string,
        extents: number,
        geometry: IPolygonGeometry[],
        context: AttrEvaluationContext,
        techniques: IndexedTechnique[],
        featureId: number | undefined
    ): void {
        if (techniques.length === 0) {
            throw new Error(
                "VectorTileInfoEmitter#processPolygonFeature: Internal error - No technique index"
            );
        }

        const tileInfoWriter = this.m_tileInfoWriter;

        const tmpV = new THREE.Vector3();

        const polygons: Ring[][] = [];

        for (const polygon of geometry) {
            const rings: Ring[] = [];
            for (const outline of polygon.rings) {
                const contour: number[] = [];
                for (const pos of outline) {
                    webMercatorTile2TargetWorld(extents, this.m_decodeInfo, pos, tmpV);
                    contour.push(tmpV.x, tmpV.y, tmpV.z);
                }
                rings.push(new Ring(extents, 3, contour));
            }
            polygons.push(rings);
        }

        for (const technique of techniques) {
            if (technique === undefined) {
                continue;
            }

            const infoTileTechniqueIndex = tileInfoWriter.addTechnique(technique);

            const featureText = ExtendedTileInfo.getFeatureText(
                context,
                technique,
                this.m_languages
            );
            tileInfoWriter.addFeature(
                this.m_tileInfo.polygonGroup,
                context.env,
                featureId,
                featureText,
                infoTileTechniqueIndex,
                FeatureGroupType.Polygon
            );
        }

        for (const rings of polygons) {
            // rings are shared between techniques
            if (rings.length === 0) {
                continue;
            }
            const outerRingWinding = rings[0].winding;
            for (const aRing of rings) {
                tileInfoWriter.addRingPoints(
                    this.m_tileInfo.polygonGroup,
                    aRing.contour,
                    aRing.winding === outerRingWinding
                );
            }
        }
    }

    getTileInfo(): ExtendedTileInfo {
        this.m_tileInfoWriter.finish();
        return this.m_tileInfo;
    }
}
