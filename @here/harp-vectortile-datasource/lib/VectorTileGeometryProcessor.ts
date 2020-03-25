/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { DecodedTile } from "@here/harp-datasource-protocol";
import { MapEnv, StyleSetEvaluator } from "@here/harp-datasource-protocol/index-decoder";
import { Projection, TileKey } from "@here/harp-geoutils";
import { LoggerManager } from "@here/harp-utils";
import { Vector2 } from "three";
import { GeoJsonDataAdapter } from "./adapters/geojson/GeoJsonDataAdapter";
import { OmvDataAdapter } from "./adapters/omv/OmvDataAdapter";
import { DecodeInfo } from "./DecodeInfo";
import { GeometryProcessor, ILineGeometry, IPolygonGeometry } from "./GeometryProcessor";
import { VectorDataAdapter } from "./VectorDataAdapter";
import { VectorTileDataEmitter } from "./VectorTileDataEmitter";
import { VectorTileDecoderOptions } from "./VectorTileDecoder";

const logger = LoggerManager.instance.create("VectorTileGeometryProcessor");

export class VectorTileGeometryProcessor implements GeometryProcessor {
    // The emitters are both optional now.
    // TODO: Add option to control emitter generation.
    private m_decodedTileEmitter: VectorTileDataEmitter | undefined;
    private readonly m_dataAdapters: VectorDataAdapter[] = [];
    private m_storageLevelOffset: number;

    constructor(
        private readonly m_projection: Projection,
        private readonly m_styleSetEvaluator: StyleSetEvaluator,
        private readonly m_languages?: string[],
        private readonly m_options?: VectorTileDecoderOptions
    ) {
        this.m_storageLevelOffset = m_options?.storageLevelOffset ?? 0;

        // Register the default adapters.
        this.m_dataAdapters.push(new OmvDataAdapter(this, logger));
        this.m_dataAdapters.push(new GeoJsonDataAdapter(this, logger));
    }

    get storageLevelOffset() {
        return this.m_options?.storageLevelOffset;
    }

    /**
     * Given a tile and a protobuffer, it returns a decoded tile and it creates the geometries that
     * belong to it.
     *
     * @param tileKey The tile to be decoded.
     * @param data The protobuffer to decode from.
     * @returns A [[DecodedTile]]
     */
    getDecodedTile(tileKey: TileKey, data: ArrayBufferLike | {}): DecodedTile {
        const dataAdapter = this.getDataAdapter(data);

        if (!dataAdapter) {
            return { techniques: [], geometries: [] };
        }

        this.m_styleSetEvaluator.resetTechniques();
        const tileSizeOnScreen = this.estimatedTileSizeOnScreen();
        const decodeInfo = new DecodeInfo(
            dataAdapter.id,
            this.m_projection,
            tileKey,
            tileSizeOnScreen
        );
        this.m_decodedTileEmitter = new VectorTileDataEmitter(
            decodeInfo,
            this.m_styleSetEvaluator,
            this.m_languages,
            this.m_options
        );
        dataAdapter.process(data, tileKey, decodeInfo.geoBox);
        const decodedTile = this.m_decodedTileEmitter.getDecodedTile();
        return decodedTile;
    }

    processPointFeature(
        layer: string,
        extents: number,
        geometry: Vector2[],
        env: MapEnv,
        storageLevel: number
    ): void {
        const techniques = this.m_styleSetEvaluator.getMatchingTechniques(env, layer, "point");

        if (techniques.length === 0) {
            if (this.m_options?.showMissingTechniques) {
                logger.log(
                    "VectorTileDecoder#processPointFeature: no techniques for object:",
                    JSON.stringify(env.unmap())
                );
            }
            return;
        }
        const context = {
            env,
            storageLevel,
            zoomLevel: this.getZoomLevel(storageLevel),
            cachedExprResults: this.m_styleSetEvaluator.expressionEvaluatorCache
        };
        const featureId = env.lookup("$id") as number | undefined;
        if (this.m_decodedTileEmitter) {
            this.m_decodedTileEmitter.processPointFeature(
                layer,
                extents,
                geometry,
                context,
                techniques,
                featureId
            );
        }
    }

    processLineFeature(
        layer: string,
        extents: number,
        geometry: ILineGeometry[],
        env: MapEnv,
        storageLevel: number
    ): void {
        const techniques = this.m_styleSetEvaluator.getMatchingTechniques(env, layer, "line");

        if (techniques.length === 0) {
            if (this.m_options?.showMissingTechniques) {
                logger.log(
                    "VectorTileDecoder#processLineFeature: no techniques for object:",
                    JSON.stringify(env.unmap())
                );
            }
            return;
        }
        const context = {
            env,
            storageLevel,
            zoomLevel: this.getZoomLevel(storageLevel),
            cachedExprResults: this.m_styleSetEvaluator.expressionEvaluatorCache
        };
        const featureId = env.lookup("$id") as number | undefined;
        if (this.m_decodedTileEmitter) {
            this.m_decodedTileEmitter.processLineFeature(
                layer,
                extents,
                geometry,
                context,
                techniques,
                featureId
            );
        }
    }

    processPolygonFeature(
        layer: string,
        extents: number,
        geometry: IPolygonGeometry[],
        env: MapEnv,
        storageLevel: number
    ): void {
        const techniques = this.m_styleSetEvaluator.getMatchingTechniques(env, layer, "polygon");

        if (techniques.length === 0) {
            if (this.m_options?.showMissingTechniques) {
                logger.log(
                    "VectorTileDecoder#processPolygonFeature: no techniques for object:",
                    JSON.stringify(env.unmap())
                );
            }
            return;
        }

        const context = {
            env,
            storageLevel,
            zoomLevel: this.getZoomLevel(storageLevel),
            cachedExprResults: this.m_styleSetEvaluator.expressionEvaluatorCache
        };

        const featureId = env.lookup("$id") as number | undefined;

        if (this.m_decodedTileEmitter) {
            this.m_decodedTileEmitter.processPolygonFeature(
                layer,
                extents,
                geometry,
                context,
                techniques,
                featureId
            );
        }
    }

    /**
     * Estimate the number of screen pixels a tile will cover. The actual number of pixels will be
     * influenced by tilt and rotation, so estimated the number here should be an upper bound.
     *
     * @returns {number} Estimated number of screen pixels.
     */
    protected estimatedTileSizeOnScreen(): number {
        const tileSizeOnScreen = 256 * Math.pow(2, -this.m_storageLevelOffset);
        return tileSizeOnScreen;
    }

    private getZoomLevel(storageLevel: number) {
        return Math.max(0, storageLevel - (this.m_storageLevelOffset || 0));
    }

    private getDataAdapter(data: ArrayBufferLike | {}): VectorDataAdapter | undefined {
        for (const adapter of this.m_dataAdapters.values()) {
            if (adapter.canProcess(data)) {
                return adapter;
            }
        }

        return undefined;
    }
}
