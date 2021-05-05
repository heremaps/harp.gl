/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Env, MapEnv, ValueMap } from "@here/harp-datasource-protocol/index-decoder";
import { TileKey } from "@here/harp-geoutils";
import { ILogger } from "@here/harp-utils";
import { ShapeUtils, Vector3 } from "three";

import { DataAdapter } from "../../DataAdapter";
import { DecodeInfo } from "../../DecodeInfo";
import { IGeometryProcessor, ILineGeometry, IPolygonGeometry } from "../../IGeometryProcessor";
import { isArrayBufferLike } from "../../OmvUtils";

function decodeFeatureId(feature: any, logger?: ILogger): number | string | undefined {
    if (feature.hasOwnProperty("id")) {
        const id = feature.id;
        if (typeof id === "number") {
            return id;
        } else if (id) {
            if (logger !== undefined && id.greaterThan(Number.MAX_SAFE_INTEGER)) {
                logger.error(
                    "Invalid ID: Larger than largest available Number in feature: ",
                    feature
                );
            }
            return id.toNumber();
        }
    }

    return undefined;
}

function readAttributes(layer: any, feature: any, defaultAttributes: ValueMap = {}): ValueMap {
    // TODO: Read feature attributes and insert them into a value map.
    // Optional: Convert attributes to OMV so that a OMV style can be used directly.
    return {};
}

export function createFeatureEnv(
    layer: any,
    feature: any,
    geometryType: string,
    storageLevel: number,
    storageLevelOffset?: number,
    logger?: ILogger,
    parent?: Env
): MapEnv {
    const attributes: ValueMap = {
        $layer: layer.name,
        $level: storageLevel,
        $zoom: Math.max(0, storageLevel - (storageLevelOffset ?? 0)),
        $geometryType: geometryType
    };

    // Some sources serve `id` directly as `IFeature` property ...
    const featureId = decodeFeatureId(feature, logger);
    if (featureId !== undefined) {
        attributes.$id = featureId;
    }

    readAttributes(layer, feature, attributes);

    return new MapEnv(attributes, parent);
}

// Ensures ring winding follows Mapbox Vector Tile specification: outer rings must be clockwise,
// inner rings counter-clockwise.
// See https://docs.mapbox.com/vector-tiles/specification/
function checkWinding(multipolygon: IPolygonGeometry[]) {
    const firstPolygon = multipolygon[0];

    if (firstPolygon === undefined || firstPolygon.rings.length === 0) {
        return;
    }

    // Opposite sign to ShapeUtils.isClockWise, since webMercator tile space has top-left origin.
    // For example:
    // Given the ring = [(1,2), (2,2), (2,1), (1,1)]
    // ShapeUtils.area(ring) > 0    -> false
    // ShapeUtils.isClockWise(ring) -> true
    // ^
    // |  1,2 -> 2,2
    // |          |
    // |  1,1 <- 2,1
    // |_______________>
    //
    // Tile space axis
    //  ______________>
    // |  1,1 <- 2,1
    // |          |
    // |  1,2 ->  2,2
    // V
    const isOuterRingClockWise = ShapeUtils.area(firstPolygon.rings[0]) > 0;

    if (!isOuterRingClockWise) {
        for (const polygon of multipolygon) {
            for (const ring of polygon.rings) {
                ring.reverse();
            }
        }
    }
}

/**
 * The class `OcmDataAdapter` converts OMV protobuf geo data
 * to geometries for the given `IGeometryProcessor`.
 */

export class OcmDataAdapter implements DataAdapter {
    id = "omv-protobuf";

    private readonly m_processor: IGeometryProcessor;
    private readonly m_logger?: ILogger;

    private readonly m_tileKey!: TileKey;
    private m_layer!: any;

    /**
     * Constructs a new [[OmvProtobufDataAdapter]].
     *
     * @param processor - The [[IGeometryProcessor]] used to process the data.
     * @param dataFilter - The [[OmvFeatureFilter]] used to filter features.
     * @param logger - The [[ILogger]] used to log diagnostic messages.
     */
    constructor(processor: IGeometryProcessor, logger?: ILogger) {
        this.m_processor = processor;
        this.m_logger = logger;
    }

    /**
     * Checks that the given data can be processed by this [[OmvProtobufDataAdapter]].
     */
    canProcess(data: ArrayBufferLike | {}): boolean {
        // TODO: VectorTileDecoder relies on each adapter identifying the data they can process.
        // So far this adapter is checked last, so return true for everything that is an object.
        // Other adapters recognize their data by the presence of some object attribute.
        // Another option would be that the DataProvider already tells what adapter should be used.
        return !isArrayBufferLike(data);
    }

    /**
     * Processes the given data payload using this adapter's [[IGeometryProcessor]].
     *
     * @param data - The data payload to process.
     * @param decodeInfo - The [[DecodedInfo]] of the tile to proceess.
     */
    process(data: {}, decodeInfo: DecodeInfo) {
        // TODO: Go through each layer
    }

    /**
     * Visits the OCM layer.
     *
     * @param layer - The OCM layer to process.
     */
    visitLayer(layer: any): boolean {
        this.m_layer = layer;
        // TODO: Go through each feature and call the corresponding feature visitor method depending
        // on geometry type(below).

        return true;
    }

    /**
     * Visits point features.
     *
     * @param feature - The OCM point features to process.
     */
    visitPointFeature(feature: any): void {
        if (feature.geometry === undefined) {
            return;
        }

        const storageLevel = this.m_tileKey.level;
        const layerName = this.m_layer.name;

        // TODO: Read feature geometry and transform to local webMercator coordinates, relative to
        // north-west tile corner (see tile2world()), layer extents should indicate the tile size.
        const layerExtents = this.m_layer.extent ?? 4096;
        const geometry: Vector3[] = [];

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
     * @param feature - The line features to process.
     */
    visitLineFeature(feature: any): void {
        if (feature.geometry === undefined) {
            return;
        }

        const storageLevel = this.m_tileKey.level;
        const layerName = this.m_layer.name;
        const layerExtents = this.m_layer.extent ?? 4096;

        // TODO: Read feature geometry and transform to local webMercator coordinates, relative to
        // north-west tile corner (see tile2world()), layer extents should indicate the tile size.
        const geometry: ILineGeometry[] = [];

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
     * @param feature - The polygon features to process.
     */
    visitPolygonFeature(feature: any): void {
        if (feature.geometry === undefined) {
            return;
        }

        const storageLevel = this.m_tileKey.level;
        const layerName = this.m_layer.name;
        const layerExtents = this.m_layer.extent ?? 4096;

        // TODO: Read feature geometry and transform to local webMercator coordinates, relative to
        // north-west tile corner (see tile2world()), layer extents should indicate the tile size.
        // Also check ring winding.
        const geometry: IPolygonGeometry[] = [];
        // let currentPolygon: IPolygonGeometry | undefined;
        // let currentRing: Vector2[];
        // let exteriorWinding: number | undefined;

        // if (currentRing !== undefined && currentRing.length > 0) {
        //     const currentRingWinding = Math.sign(ShapeUtils.area(currentRing));
        //     // Winding order from XYZ spaces might be not MVT spec compliant, see HARP-11151.
        //     // We take the winding of the very first ring as reference.
        //     if (exteriorWinding === undefined) {
        //         exteriorWinding = currentRingWinding;
        //     }
        //     // MVT spec defines that each exterior ring signals the beginning of a new polygon.
        //     // see https://github.com/mapbox/vector-tile-spec/tree/master/2.1
        //     if (currentRingWinding === exteriorWinding) {
        //         // Create a new polygon and push it into the collection of polygons
        //         currentPolygon = { rings: [] };
        //         geometry.push(currentPolygon);
        //     }
        //     // Push the ring into the current polygon
        //     currentRing.push(currentRing[0].clone());
        //     currentPolygon?.rings.push(currentRing);
        // }

        if (geometry.length === 0) {
            return;
        }

        checkWinding(geometry);

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
