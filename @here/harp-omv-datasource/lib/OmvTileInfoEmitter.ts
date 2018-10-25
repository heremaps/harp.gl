/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ExtendedTileInfo,
    ExtendedTileInfoWriter,
    StyleSetEvaluator,
    Technique
} from "@here/harp-datasource-protocol";
import { MapEnv } from "@here/harp-datasource-protocol/lib/Theme";
import * as THREE from "three";

import { GeometryCommands, isClosePathCommand, isLineToCommand, isMoveToCommand } from "./OmvData";
import { IOmvEmitter, OmvDecoder, Ring } from "./OmvDecoder";
import { com } from "./proto/vector_tile";

export class OmvTileInfoEmitter implements IOmvEmitter {
    private readonly m_tileInfo: ExtendedTileInfo;
    private readonly m_tileInfoWriter: ExtendedTileInfoWriter;

    private readonly geometryCommands = new GeometryCommands();

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
        layer: com.mapbox.pb.Tile.ILayer,
        feature: com.mapbox.pb.Tile.IFeature,
        env: MapEnv,
        techniques: Technique[],
        featureId: number | undefined
    ): void {
        if (!feature.geometry) {
            return;
        }

        const worldPos = new THREE.Vector3();
        const tileInfoWriter = this.m_tileInfoWriter;

        for (const technique of techniques) {
            if (technique === undefined) {
                continue;
            }

            const infoTileTechniqueIndex = tileInfoWriter.addTechnique(technique);

            this.geometryCommands.accept(
                feature.geometry,
                this.m_decodeInfo.tileKey,
                this.m_decodeInfo.geoBox,
                layer.extent,
                {
                    visitCommand: command => {
                        if (isMoveToCommand(command)) {
                            const { x, y } = this.m_decodeInfo.projection
                                .projectPoint(command, worldPos)
                                .sub(this.m_decodeInfo.center);

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
            );
        }
    }

    processLineFeature(
        layer: com.mapbox.pb.Tile.ILayer,
        feature: com.mapbox.pb.Tile.IFeature,
        env: MapEnv,
        techniques: Technique[],
        featureId: number | undefined
    ): void {
        if (!feature.geometry) {
            return;
        }

        const tileInfoWriter = this.m_tileInfoWriter;

        const lines: number[][] = [];
        let line: number[];
        const worldPos = new THREE.Vector3();
        this.geometryCommands.accept(
            feature.geometry,
            this.m_decodeInfo.tileKey,
            this.m_decodeInfo.geoBox,
            layer.extent,
            {
                visitCommand: command => {
                    if (isMoveToCommand(command)) {
                        this.m_decodeInfo.projection
                            .projectPoint(command, worldPos)
                            .sub(this.m_decodeInfo.center);
                        line = [worldPos.x, worldPos.y];
                        lines.push(line);
                    } else if (isLineToCommand(command)) {
                        this.m_decodeInfo.projection
                            .projectPoint(command, worldPos)
                            .sub(this.m_decodeInfo.center);
                        line.push(worldPos.x, worldPos.y);
                    }
                }
            }
        );

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
        layer: com.mapbox.pb.Tile.ILayer,
        feature: com.mapbox.pb.Tile.IFeature,
        env: MapEnv,
        techniques: Technique[],
        featureId: number | undefined
    ): void {
        if (!feature.geometry) {
            return;
        }
        if (techniques.length === 0) {
            throw new Error(
                "OmvTileInfoEmitter#processPolygonFeature: Internal error - No technique index"
            );
        }

        const tileInfoWriter = this.m_tileInfoWriter;

        const worldPos = new THREE.Vector3();
        const rings = new Array<Ring>();
        let ring: number[];
        this.geometryCommands.accept(
            feature.geometry,
            this.m_decodeInfo.tileKey,
            this.m_decodeInfo.geoBox,
            layer.extent,
            {
                visitCommand: command => {
                    if (isMoveToCommand(command)) {
                        const { x, y } = this.m_decodeInfo.projection
                            .projectPoint(command, worldPos)
                            .sub(this.m_decodeInfo.center);
                        ring = [x, y];
                    } else if (isLineToCommand(command)) {
                        const { x, y } = this.m_decodeInfo.projection
                            .projectPoint(command, worldPos)
                            .sub(this.m_decodeInfo.center);
                        ring.push(x, y);
                    } else if (isClosePathCommand(command)) {
                        rings.push(new Ring(ring));
                    }
                }
            }
        );

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

        // rings are shared between techniques
        for (const aRing of rings) {
            tileInfoWriter.addRingPoints(
                this.m_tileInfo.polygonGroup,
                aRing.contour,
                aRing.isOuterRing
            );
        }
    }

    getTileInfo(): ExtendedTileInfo {
        this.m_tileInfoWriter.finish();
        return this.m_tileInfo;
    }
}
