/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Value, ValueMap } from "@here/harp-datasource-protocol/index-decoder";
import { TileKey } from "@here/harp-geoutils";
import { ILogger, LoggerManager } from "@here/harp-utils";
import * as Long from "long";
import { ShapeUtils, Vector2, Vector3 } from "three";

import { DataAdapter } from "../../DataAdapter";
import { DecodeInfo } from "../../DecodeInfo";
import { IGeometryProcessor, ILineGeometry, IPolygonGeometry } from "../../IGeometryProcessor";
import { OmvFeatureFilter } from "../../OmvDataFilter";
import { OmvGeometryType } from "../../OmvDecoderDefs";
import { isArrayBufferLike } from "../../OmvUtils";
import {
    FeatureAttributes,
    GeometryCommands,
    isClosePathCommand,
    isLineToCommand,
    isMoveToCommand,
    OmvVisitor,
    visitOmv
} from "./OmvData";
import { com } from "./proto/vector_tile";

const propertyCategories = [
    "stringValue",
    "floatValue",
    "doubleValue",
    "intValue",
    "uintValue",
    "sintValue",
    "boolValue"
];

const logger = LoggerManager.instance.create("OmvDataAdapter", { enabled: false });

function simplifiedValue(value: com.mapbox.pb.Tile.IValue): Value {
    const hasOwnProperty = Object.prototype.hasOwnProperty;

    for (const category of propertyCategories) {
        if (hasOwnProperty.call(value, category)) {
            const v = value[category as keyof com.mapbox.pb.Tile.IValue];

            if (v === undefined) {
                throw new Error("unpexted undefined value");
            }

            return Long.isLong(v) ? (v as any).toNumber() : v;
        }
    }

    throw new Error("not happening");
}

function decodeFeatureId(
    feature: com.mapbox.pb.Tile.IFeature,
    logger?: ILogger
): number | string | undefined {
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

function readAttributes(
    layer: com.mapbox.pb.Tile.ILayer,
    feature: com.mapbox.pb.Tile.IFeature
): ValueMap {
    const attrs = new FeatureAttributes();

    const attributes: ValueMap = {};

    attrs.accept(layer, feature, {
        visitAttribute: (name, value) => {
            attributes[name] = simplifiedValue(value);
            return true;
        }
    });

    return attributes;
}

export function asGeometryType(feature: com.mapbox.pb.Tile.IFeature | undefined): OmvGeometryType {
    if (feature === undefined) {
        return OmvGeometryType.UNKNOWN;
    }

    switch (feature.type) {
        case com.mapbox.pb.Tile.GeomType.UNKNOWN:
            return OmvGeometryType.UNKNOWN;
        case com.mapbox.pb.Tile.GeomType.POINT:
            return OmvGeometryType.POINT;
        case com.mapbox.pb.Tile.GeomType.LINESTRING:
            return OmvGeometryType.LINESTRING;
        case com.mapbox.pb.Tile.GeomType.POLYGON:
            return OmvGeometryType.POLYGON;
        default:
            return OmvGeometryType.UNKNOWN;
    } // switch
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

function roundUpCoordinates(coordinates: Vector2[], layerExtents: number) {
    coordinates.forEach(p => {
        if (p.x === layerExtents - 1) {
            p.x = layerExtents;
        }
    });
}

function roundUpPolygonCoordinates(geometry: IPolygonGeometry[], layerExtents: number) {
    geometry.forEach(polygon => polygon.rings.forEach(r => roundUpCoordinates(r, layerExtents)));
}

function roundUpLineCoordinates(geometry: ILineGeometry[], layerExtents: number) {
    geometry.forEach(line => roundUpCoordinates(line.positions, layerExtents));
}

/**
 * The class `OmvDataAdapter` converts OMV protobuf geo data
 * to geometries for the given `IGeometryProcessor`.
 */

export class OmvDataAdapter implements DataAdapter, OmvVisitor {
    private readonly m_geometryCommands = new GeometryCommands();

    private m_tileKey!: TileKey;
    private m_layer!: com.mapbox.pb.Tile.ILayer;
    private m_dataFilter?: OmvFeatureFilter;
    private m_processor!: IGeometryProcessor;

    public roundUpCoordinatesIfNeeded: boolean = false;

    /**
     * The [[OmvFeatureFilter]] used to filter features.
     */
    get dataFilter(): OmvFeatureFilter | undefined {
        return this.m_dataFilter;
    }

    /**
     * The [[OmvFeatureFilter]] used to filter features.
     */
    set dataFilter(dataFilter: OmvFeatureFilter | undefined) {
        this.m_dataFilter = dataFilter;
    }

    /**
     * @override
     */
    canProcess(data: ArrayBufferLike | {}): boolean {
        return isArrayBufferLike(data);
    }

    /**
     * @override
     */
    process(data: ArrayBufferLike, decodeInfo: DecodeInfo, geometryProcessor: IGeometryProcessor) {
        const { tileKey } = decodeInfo;
        const payload = new Uint8Array(data);
        const proto = com.mapbox.pb.Tile.decode(payload);

        this.m_tileKey = tileKey;
        this.m_processor = geometryProcessor;

        visitOmv(proto, this);
    }

    /**
     * Visits the OMV layer.
     *
     * @param layer - The OMV layer to process.
     */
    visitLayer(layer: com.mapbox.pb.Tile.ILayer): boolean {
        this.m_layer = layer;

        const storageLevel = this.m_tileKey.level;
        const layerName = layer.name;

        if (
            this.m_dataFilter !== undefined &&
            !this.m_dataFilter.wantsLayer(layerName, storageLevel)
        ) {
            return false;
        }

        return true;
    }

    /**
     * Visits point features.
     *
     * @param feature - The OMV point features to process.
     */
    visitPointFeature(feature: com.mapbox.pb.Tile.IFeature): void {
        if (feature.geometry === undefined) {
            return;
        }

        const storageLevel = this.m_tileKey.level;
        const layerName = this.m_layer.name;
        const layerExtents = this.m_layer.extent ?? 4096;

        if (
            this.m_dataFilter !== undefined &&
            !this.m_dataFilter.wantsPointFeature(layerName, asGeometryType(feature), storageLevel)
        ) {
            return;
        }

        const geometry: Vector3[] = [];
        this.m_geometryCommands.accept(feature.geometry, {
            type: "Point",
            visitCommand: command => {
                if (isMoveToCommand(command)) {
                    geometry.push(new Vector3(command.position.x, command.position.y, 0));
                }
            }
        });

        if (geometry.length === 0) {
            return;
        }

        this.m_processor.processPointFeature(
            layerName,
            layerExtents,
            geometry,
            readAttributes(this.m_layer, feature),
            decodeFeatureId(feature, logger)
        );
    }

    /**
     * Visits the line features.
     *
     * @param feature - The line features to process.
     */
    visitLineFeature(feature: com.mapbox.pb.Tile.IFeature): void {
        if (feature.geometry === undefined) {
            return;
        }

        const storageLevel = this.m_tileKey.level;
        const layerName = this.m_layer.name;
        const layerExtents = this.m_layer.extent ?? 4096;

        if (
            this.m_dataFilter !== undefined &&
            !this.m_dataFilter.wantsLineFeature(layerName, asGeometryType(feature), storageLevel)
        ) {
            return;
        }

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

        if (this.mustRoundUpCoordinates) {
            roundUpLineCoordinates(geometry, layerExtents);
        }
        this.m_processor.processLineFeature(
            layerName,
            layerExtents,
            geometry,
            readAttributes(this.m_layer, feature),
            decodeFeatureId(feature, logger)
        );
    }

    /**
     * Visits the polygon features.
     *
     * @param feature - The polygon features to process.
     */
    visitPolygonFeature(feature: com.mapbox.pb.Tile.IFeature): void {
        if (feature.geometry === undefined) {
            return;
        }

        const storageLevel = this.m_tileKey.level;
        const layerName = this.m_layer.name;
        const layerExtents = this.m_layer.extent ?? 4096;

        if (
            this.m_dataFilter !== undefined &&
            !this.m_dataFilter.wantsPolygonFeature(layerName, asGeometryType(feature), storageLevel)
        ) {
            return;
        }

        const geometry: IPolygonGeometry[] = [];
        let currentPolygon: IPolygonGeometry | undefined;
        let currentRing: Vector2[];
        let exteriorWinding: number | undefined;
        this.m_geometryCommands.accept(feature.geometry, {
            type: "Polygon",
            visitCommand: command => {
                if (isMoveToCommand(command)) {
                    currentRing = [command.position];
                } else if (isLineToCommand(command)) {
                    currentRing.push(command.position);
                } else if (isClosePathCommand(command)) {
                    if (currentRing !== undefined && currentRing.length > 0) {
                        const currentRingWinding = Math.sign(ShapeUtils.area(currentRing));
                        // Winding order from XYZ spaces might be not MVT spec compliant, see HARP-11151.
                        // We take the winding of the very first ring as reference.
                        if (exteriorWinding === undefined) {
                            exteriorWinding = currentRingWinding;
                        }
                        // MVT spec defines that each exterior ring signals the beginning of a new polygon.
                        // see https://github.com/mapbox/vector-tile-spec/tree/master/2.1
                        if (currentRingWinding === exteriorWinding) {
                            // Create a new polygon and push it into the collection of polygons
                            currentPolygon = { rings: [] };
                            geometry.push(currentPolygon);
                        }
                        // Push the ring into the current polygon
                        currentRing.push(currentRing[0].clone());
                        currentPolygon?.rings.push(currentRing);
                    }
                }
            }
        });
        if (geometry.length === 0) {
            return;
        }

        if (this.mustRoundUpCoordinates) {
            roundUpPolygonCoordinates(geometry, layerExtents);
        }

        checkWinding(geometry);

        this.m_processor.processPolygonFeature(
            layerName,
            layerExtents,
            geometry,
            readAttributes(this.m_layer, feature),
            decodeFeatureId(feature, logger)
        );
    }

    private get mustRoundUpCoordinates(): boolean {
        return (
            this.roundUpCoordinatesIfNeeded &&
            this.m_tileKey.level < 5 &&
            this.m_tileKey.column === this.m_tileKey.columnCount() - 1
        );
    }
}
