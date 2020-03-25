/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { TileKey } from "@here/harp-geoutils";
import { ILogger } from "@here/harp-utils";
import { Vector2 } from "three";
import { GeometryProcessor, ILineGeometry, IPolygonGeometry } from "../../GeometryProcessor";
import { isArrayBufferLike } from "../../Utils";
import { VectorDataAdapter } from "../../VectorDataAdapter";
import {
    createFeatureEnv,
    GeometryCommands,
    isClosePathCommand,
    isLineToCommand,
    isMoveToCommand,
    OmvVisitor,
    visitOmv
} from "./OmvData";
import { com } from "./proto/vector_tile";

/**
 * The class [[OmvProtobufDataAdapter]] converts OMV protobuf geo data
 * to geometries for the given [[IGeometryProcessor]].
 */
export class OmvDataAdapter implements VectorDataAdapter, OmvVisitor {
    id = "vector-protobuf";
    private readonly m_geometryCommands = new GeometryCommands();
    private readonly m_processor: GeometryProcessor;
    private readonly m_logger?: ILogger;
    private m_tileKey!: TileKey;
    private m_layer!: com.mapbox.pb.Tile.ILayer;
    /**
     * Constructs a new [[OmvProtobufDataAdapter]].
     *
     * @param processor The [[IGeometryProcessor]] used to process the data.
     * @param logger The [[ILogger]] used to log diagnostic messages.
     */
    constructor(processor: GeometryProcessor, logger?: ILogger) {
        this.m_processor = processor;
        this.m_logger = logger;
    }
    /**
     * Checks that the given data can be processed by this [[OmvProtobufDataAdapter]].
     */
    canProcess(data: ArrayBufferLike | {}): boolean {
        return isArrayBufferLike(data);
    }
    /**
     * Processes the given data payload using this adapter's [[IGeometryProcessor]].
     *
     * @param data The data payload to process.
     * @param tileKey The [[TileKey]] of the tile enclosing the data.
     */
    process(data: ArrayBufferLike, tileKey: TileKey) {
        const payload = new Uint8Array(data);
        const proto = com.mapbox.pb.Tile.decode(payload);
        this.m_tileKey = tileKey;
        visitOmv(proto, this);
    }
    /**
     * Visits the OMV layer.
     *
     * @param layer The OMV layer to process.
     */
    visitLayer(layer: com.mapbox.pb.Tile.ILayer): boolean {
        this.m_layer = layer;
        return true;
    }
    /**
     * Visits point features.
     *
     * @param feature The OMV point features to process.
     */
    visitPointFeature(feature: com.mapbox.pb.Tile.IFeature): void {
        if (feature.geometry === undefined) {
            return;
        }
        const storageLevel = this.m_tileKey.level;
        const layerName = this.m_layer.name;
        const layerExtents = this.m_layer.extent || 4096;
        const geometry: Vector2[] = [];
        this.m_geometryCommands.accept(feature.geometry, {
            type: "Point",
            visitCommand: command => {
                if (isMoveToCommand(command)) {
                    geometry.push(command.position);
                }
            }
        });
        if (geometry.length === 0) {
            return;
        }
        const env = createFeatureEnv(
            this.m_layer,
            feature,
            "point",
            storageLevel,
            this.m_processor.storageLevelOffset,
            this.m_logger
        );
        this.m_processor.processPointFeature(layerName, layerExtents, geometry, env, storageLevel);
    }
    /**
     * Visits the line features.
     *
     * @param feature The line features to process.
     */
    visitLineFeature(feature: com.mapbox.pb.Tile.IFeature): void {
        if (feature.geometry === undefined) {
            return;
        }
        const storageLevel = this.m_tileKey.level;
        const layerName = this.m_layer.name;
        const layerExtents = this.m_layer.extent || 4096;
        const geometry: ILineGeometry[] = [];
        let positions: Vector2[];
        this.m_geometryCommands.accept(feature.geometry, {
            type: "Line",
            visitCommand: command => {
                if (isMoveToCommand(command)) {
                    positions = [command.position];
                    geometry.push({ positions });
                } else if (isLineToCommand(command)) {
                    positions.push(command.position);
                }
            }
        });
        if (geometry.length === 0) {
            return;
        }
        const env = createFeatureEnv(
            this.m_layer,
            feature,
            "line",
            storageLevel,
            this.m_processor.storageLevelOffset,
            this.m_logger
        );
        this.m_processor.processLineFeature(layerName, layerExtents, geometry, env, storageLevel);
    }
    /**
     * Visits the polygon features.
     *
     * @param feature The polygon features to process.
     */
    visitPolygonFeature(feature: com.mapbox.pb.Tile.IFeature): void {
        if (feature.geometry === undefined) {
            return;
        }
        const storageLevel = this.m_tileKey.level;
        const layerName = this.m_layer.name;
        const layerExtents = this.m_layer.extent || 4096;
        const geometry: IPolygonGeometry[] = [];
        const currentPolygon: IPolygonGeometry = { rings: [] };
        let currentRing: Vector2[];
        this.m_geometryCommands.accept(feature.geometry, {
            type: "Polygon",
            visitCommand: command => {
                if (isMoveToCommand(command)) {
                    currentRing = [command.position];
                } else if (isLineToCommand(command)) {
                    currentRing.push(command.position);
                } else if (isClosePathCommand(command)) {
                    currentPolygon.rings.push(currentRing);
                }
            }
        });
        if (currentPolygon.rings.length > 0) {
            geometry.push(currentPolygon);
        }
        if (geometry.length === 0) {
            return;
        }
        const env = createFeatureEnv(
            this.m_layer,
            feature,
            "polygon",
            storageLevel,
            this.m_processor.storageLevelOffset,
            this.m_logger
        );
        this.m_processor.processPolygonFeature(
            layerName,
            layerExtents,
            geometry,
            env,
            storageLevel
        );
    }
}
