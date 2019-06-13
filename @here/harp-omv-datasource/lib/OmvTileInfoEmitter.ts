/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ExtendedTileInfo,
    ExtendedTileInfoWriter,
    IndexedTechnique
} from "@here/harp-datasource-protocol";
import { MapEnv, StyleSetEvaluator } from "@here/harp-datasource-protocol/index-decoder";
import * as THREE from "three";

import { webMercatorProjection } from "@here/harp-geoutils";
import { ILineGeometry, IPolygonGeometry } from "./IGeometryProcessor";
import { IOmvEmitter, OmvDecoder, Ring } from "./OmvDecoder";

export class OmvTileInfoEmitter implements IOmvEmitter {
    private readonly m_tileInfo: ExtendedTileInfo;
    private readonly m_tileInfoWriter: ExtendedTileInfoWriter;

    /**
     * Create OmvTileInfoEmitter object
     *
     * @param m_decodeInfo
     * @param m_styleSetEvaluator
     * @param m_storeExtendedTags
     * @param m_gatherRoadSegments
     */
    constructor(
        private readonly m_decodeInfo: OmvDecoder.DecodeInfo,
        // tslint:disable-next-line:no-unused-variable
        private readonly m_styleSetEvaluator: StyleSetEvaluator,
        private readonly m_storeExtendedTags: boolean,
        private readonly m_gatherRoadSegments: boolean,
        private readonly m_languages?: string[]
    ) {
        this.m_tileInfo = new ExtendedTileInfo(m_decodeInfo.tileKey, this.m_storeExtendedTags);
        this.m_tileInfoWriter = new ExtendedTileInfoWriter(
            this.m_tileInfo,
            this.m_storeExtendedTags,
            this.m_languages
        );
    }

    processPointFeature(
        layer: string,
        geometry: THREE.Vector3[],
        env: MapEnv,
        techniques: IndexedTechnique[],
        featureId: number | undefined
    ): void {
        const tileInfoWriter = this.m_tileInfoWriter;

        const { projection, center } = this.m_decodeInfo;

        const worldPos = new THREE.Vector3();

        for (const technique of techniques) {
            if (technique === undefined) {
                continue;
            }

            const infoTileTechniqueIndex = tileInfoWriter.addTechnique(technique);

            for (const pos of geometry) {
                const { x, y } = projection
                    .reprojectPoint(webMercatorProjection, pos, worldPos)
                    .sub(center);

                tileInfoWriter.addFeature(
                    this.m_tileInfo.pointGroup,
                    technique,
                    env,
                    featureId,
                    infoTileTechniqueIndex,
                    false
                );

                tileInfoWriter.addFeaturePoint(this.m_tileInfo.pointGroup, x, y);
            }
        }
    }

    processLineFeature(
        layer: string,
        geometry: ILineGeometry[],
        env: MapEnv,
        techniques: IndexedTechnique[],
        featureId: number | undefined
    ): void {
        const tileInfoWriter = this.m_tileInfoWriter;

        const { projection, center } = this.m_decodeInfo;

        const worldPos = new THREE.Vector3();

        const lines: number[][] = [];

        for (const polyline of geometry) {
            const line: number[] = [];
            for (const pos of polyline.positions) {
                const { x, y } = projection
                    .reprojectPoint(webMercatorProjection, pos, worldPos)
                    .sub(center);
                line.push(x, y);
            }
            lines.push(line);
        }

        for (const technique of techniques) {
            if (technique === undefined) {
                continue;
            }

            const infoTileTechniqueIndex = tileInfoWriter.addTechnique(technique);

            for (const aLine of lines) {
                tileInfoWriter.addFeature(
                    this.m_tileInfo.lineGroup,
                    technique,
                    env,
                    featureId,
                    infoTileTechniqueIndex,
                    false
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
        geometry: IPolygonGeometry[],
        env: MapEnv,
        techniques: IndexedTechnique[],
        featureId: number | undefined
    ): void {
        if (techniques.length === 0) {
            throw new Error(
                "OmvTileInfoEmitter#processPolygonFeature: Internal error - No technique index"
            );
        }

        const tileInfoWriter = this.m_tileInfoWriter;

        const { projection, center } = this.m_decodeInfo;

        const polygons: Ring[][] = [];

        const worldPos = new THREE.Vector3();

        for (const polygon of geometry) {
            const rings: Ring[] = [];
            for (const outline of polygon.rings) {
                const contour: number[] = [];
                for (const pos of outline.positions) {
                    const { x, y, z } = projection
                        .reprojectPoint(webMercatorProjection, pos, worldPos)
                        .sub(center);
                    contour.push(x, y, z);
                }
                rings.push(new Ring(3, contour));
            }
            polygons.push(rings);
        }

        for (const technique of techniques) {
            if (technique === undefined) {
                continue;
            }

            const infoTileTechniqueIndex = tileInfoWriter.addTechnique(technique);

            tileInfoWriter.addFeature(
                this.m_tileInfo.polygonGroup,
                technique,
                env,
                featureId,
                infoTileTechniqueIndex,
                true
            );
        }

        for (const rings of polygons) {
            // rings are shared between techniques
            for (const aRing of rings) {
                tileInfoWriter.addRingPoints(
                    this.m_tileInfo.polygonGroup,
                    aRing.contour,
                    aRing.isOuterRing
                );
            }
        }
    }

    getTileInfo(): ExtendedTileInfo {
        this.m_tileInfoWriter.finish();
        return this.m_tileInfo;
    }
}
