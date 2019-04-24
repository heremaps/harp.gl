/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    DecodedTile,
    ExtendedTileInfo,
    ExtendedTileInfoWriter,
    GeoJson
} from "@here/harp-datasource-protocol";

import { StyleSetEvaluator } from "@here/harp-datasource-protocol/index-decoder";
import { Projection, TileKey, webMercatorTilingScheme } from "@here/harp-geoutils";
import { ThemedTileDecoder, WorkerServiceManager } from "@here/harp-mapview-decoder/index-worker";
import { TileDecoderService } from "@here/harp-mapview-decoder/lib/TileDecoderService";
import { LoggerManager } from "@here/harp-utils";
import * as THREE from "three";
import { GeoJsonGeometryCreator, GeoJsonTileGeometries } from "./GeoJsonGeometryCreator";
import { ExtendedTile } from "./GeoJsonParser";

const logger = LoggerManager.instance.create("GeoJsonDecoder");

/**
 * Interface for the GeoJsonDecodedTile.
 */
export interface GeoJsonDecodedTile extends DecodedTile {
    tileMortonCode: number;
}

/**
 * `GeoJsonTileDecoder` is used to decode GeoJSON data and create geometries with additional
 * properties ready for use by [[GeoJsonTile]]. In case a custom styling is present in the GeoJSON
 * data, additional techniques will be created. Each decoded GeoJSON feature is represented as a
 * `Point`, a `Line` or a `Polygon`.
 *
 * The following techniques used for that:
 * <br/>
 * Point: `point` (THREE.PointsMaterial)
 * <br/>
 * Line: `solid-line` (SolidLineMaterial),
 * `segments` (THREE.LineBasicMaterial) - invisible lines for raycasting)
 * <br/>
 * Polygon: `polygon` (THREE.MeshBasicMaterial),
 * `segments` (THREE.LineBasicMaterial) - lines for styling polygon edges
 *
 * To improve performance, objects of the same type and technique are merged into the same geometry.
 */
export class GeoJsonTileDecoder extends ThemedTileDecoder {
    /**
     * Builds a `GeoJsonTileDecoder`.
     */
    constructor() {
        super();
    }

    /**
     *
     */
    connect(): Promise<void> {
        return Promise.resolve();
    }

    /**
     * Read the data contained in the `data` parameter and returns a [[DecodedTile]].
     *
     * @param data The [[GeoJsonDataType]] containing all the features to be processed.
     * @param tileKey The [[TileKey]] that identifies the tile.
     * @param styleSetEvaluator The [[StyleSetEvaluator]] that reads the style and apply it to the
     *      meshes.
     * @param projection The current camera projection.
     */
    decodeThemedTile(
        data: GeoJson,
        tileKey: TileKey,
        styleSetEvaluator: StyleSetEvaluator,
        projection: Projection
    ): Promise<DecodedTile> {
        const decoder = new GeoJsonDecoder(projection, styleSetEvaluator);
        const decodedTile = decoder.getDecodedTile(tileKey, data);

        return Promise.resolve(decodedTile);
    }
}

/**
 * Decoder for the [[GeoJsonDataSource]].
 */
class GeoJsonDecoder {
    private readonly m_storeExtendedTags = true;

    /**
     * Default constructor.
     *
     * @param m_projection MapView projection
     * @param m_styleSetEvaluator theme evaluator
     */
    constructor(
        private readonly m_projection: Projection,
        private m_styleSetEvaluator: StyleSetEvaluator
    ) {}

    /**
     * Returns a `DecodedTile` with geometries ([[GeoJsonGeometry]]) and techniques.
     *
     * @returns decoded tile
     */
    getDecodedTile(tileKey: TileKey, data: GeoJson): DecodedTile {
        const center = this.getTileCenter(tileKey);
        const tileInfo = new ExtendedTileInfo(tileKey, this.m_storeExtendedTags);
        const tileInfoWriter = new ExtendedTileInfoWriter(tileInfo, this.m_storeExtendedTags);

        const extendedTile = {
            info: tileInfo,
            writer: tileInfoWriter
        };

        const geometries: GeoJsonTileGeometries = GeoJsonGeometryCreator.createGeometries(
            data,
            center,
            this.m_projection,
            this.m_styleSetEvaluator,
            extendedTile
        );

        const tile: DecodedTile = {
            geometries: geometries.geometries,
            techniques: this.m_styleSetEvaluator.techniques,
            tileInfo: this.getTileInfo(extendedTile)
        };

        if (geometries.poiGeometries.length > 0) {
            tile.poiGeometries = geometries.poiGeometries;
        }

        if (geometries.textGeometries.length > 0) {
            tile.textGeometries = geometries.textGeometries;
        }

        if (geometries.textPathGeometries.length > 0) {
            tile.textPathGeometries = geometries.textPathGeometries;
        }

        return tile;
    }

    private getTileCenter(tileKey: TileKey) {
        const geoBox = webMercatorTilingScheme.getGeoBox(tileKey);
        const tileBounds = this.m_projection.projectBox(geoBox, new THREE.Box3());
        const center = new THREE.Vector3();
        tileBounds.getCenter(center);
        return center;
    }

    private getTileInfo(extendedTile: ExtendedTile): ExtendedTileInfo {
        extendedTile.writer.finish();
        return extendedTile.info;
    }
}

/**
 * GeoJson tile decoder service.
 */
export class GeoJsonTileDecoderService {
    /**
     * Register GeoJson tile decoder service based on [[GeoJsonTileDecoder]] service class in
     * [[WorkerServiceManager]].
     */
    static start() {
        WorkerServiceManager.getInstance().register({
            serviceType: "geojson-tile-decoder",
            factory: (serviceId: string) =>
                TileDecoderService.start(serviceId, new GeoJsonTileDecoder())
        });
    }
}

/**
 * Starts a GeoJson decoder service.
 *
 * @deprecated Please use [[GeoJsonTileDecoderService.start]].
 */
export class GeoJsonWorkerClient {
    // TODO(HARP-3651): remove this class when clients are ready
    constructor() {
        logger.warn(
            "GeoJsonWorkerClient class is deprecated, please use GeoJsonTileDecoderService.start"
        );
        GeoJsonTileDecoderService.start();
    }
}
