/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Env,
    LocaleMap,
    MapEnv,
    MapLocalEnv,
    Value,
    ValueMap
} from "@here/harp-datasource-protocol/index-decoder";
import { TileKey } from "@here/harp-geoutils";
import { ILogger } from "@here/harp-utils";
import * as Long from "long";
import { Vector2 } from "three";
import { IEnvironmentProcessor } from "./IEnvironmentProcessor";
import { IGeometryProcessor, ILineGeometry, IPolygonGeometry } from "./IGeometryProcessor";
import { OmvFeatureFilter } from "./OmvDataFilter";
import { OmvDataAdapter } from "./OmvDecoder";
import { OmvGeometryType } from "./OmvDecoderDefs";
import { isArrayBufferLike } from "./OmvUtils";
import { com } from "./proto/vector_tile";

/**
 * @hidden
 */
export enum CommandKind {
    MoveTo = 1,
    LineTo = 2,
    ClosePath = 7
}

/**
 * @hidden
 */
export interface BaseCommand {
    kind: CommandKind;
}

/**
 * @hidden
 */
export interface PositionCommand extends BaseCommand {
    position: Vector2;
}

/**
 * @hidden
 */
export type GeometryCommand = BaseCommand | PositionCommand;

/**
 * @hidden
 */
export function isMoveToCommand(command: GeometryCommand): command is PositionCommand {
    return command.kind === CommandKind.MoveTo;
}

/**
 * @hidden
 */
export function isLineToCommand(command: GeometryCommand): command is PositionCommand {
    return command.kind === CommandKind.LineTo;
}

/**
 * @hidden
 */
export function isClosePathCommand(command: GeometryCommand): command is PositionCommand {
    return command.kind === CommandKind.ClosePath;
}

/**
 * @hidden
 */
export interface OmvVisitor {
    visitLayer?(layer: com.mapbox.pb.Tile.ILayer): boolean;
    endVisitLayer?(layer: com.mapbox.pb.Tile.ILayer): void;
    visitPointFeature?(feature: com.mapbox.pb.Tile.IFeature): void;
    visitLineFeature?(feature: com.mapbox.pb.Tile.IFeature): void;
    visitPolygonFeature?(feature: com.mapbox.pb.Tile.IFeature): void;
}

/**
 * @hidden
 */
export function visitOmv(vectorTile: com.mapbox.pb.Tile, visitor: OmvVisitor) {
    if (!vectorTile.layers) {
        return;
    }

    for (const layer of vectorTile.layers) {
        if (!visitor.visitLayer || visitor.visitLayer(layer)) {
            visitOmvLayer(layer, visitor);
        }
        if (visitor.endVisitLayer) {
            visitor.endVisitLayer(layer);
        }
    }
}

/**
 * @hidden
 */
export function visitOmvLayer(layer: com.mapbox.pb.Tile.ILayer, visitor: OmvVisitor) {
    if (!visitor.visitLayer || visitor.visitLayer(layer)) {
        if (layer.features) {
            for (const feature of layer.features) {
                switch (feature.type) {
                    case com.mapbox.pb.Tile.GeomType.UNKNOWN:
                        break;

                    case com.mapbox.pb.Tile.GeomType.POINT:
                        if (visitor.visitPointFeature) {
                            visitor.visitPointFeature(feature);
                        }
                        break;

                    case com.mapbox.pb.Tile.GeomType.LINESTRING:
                        if (visitor.visitLineFeature) {
                            visitor.visitLineFeature(feature);
                        }
                        break;

                    case com.mapbox.pb.Tile.GeomType.POLYGON:
                        if (visitor.visitPolygonFeature) {
                            visitor.visitPolygonFeature(feature);
                        }
                        break;
                }
            }
        }
    }

    if (visitor.endVisitLayer) {
        visitor.endVisitLayer(layer);
    }
}

/**
 * @hidden
 */
export interface FeatureAttributesVisitor {
    visitAttribute(name: string, value: com.mapbox.pb.Tile.IValue): boolean;
}

/**
 * @hidden
 */
export class FeatureAttributes {
    accept(
        layer: com.mapbox.pb.Tile.ILayer,
        feature: com.mapbox.pb.Tile.IFeature,
        visitor: FeatureAttributesVisitor
    ): void {
        const { keys, values } = layer;
        const tags = feature.tags;

        if (!tags || !keys || !values) {
            return;
        }

        for (let i = 0; i < tags.length; i += 2) {
            const key = keys[tags[i]];
            const value = values[tags[i + 1]];
            if (!visitor.visitAttribute(key, value)) {
                break;
            }
        }
    }
}

/**
 * @hidden
 */
export interface GeometryCommandsVisitor {
    type: "Point" | "Line" | "Polygon";
    visitCommand(command: GeometryCommand): void;
}

/**
 * @hidden
 */
export class GeometryCommands {
    accept(geometry: number[], visitor: GeometryCommandsVisitor) {
        const geometryCount = geometry.length;

        let currX = 0;
        let currY = 0;

        const xCoords: number[] = [];
        const yCoords: number[] = [];
        const commands: GeometryCommand[] = [];
        for (let cmdIndex = 0; cmdIndex < geometryCount; ) {
            // tslint:disable:no-bitwise
            const kind = (geometry[cmdIndex] & 0x7) as CommandKind;
            const count = geometry[cmdIndex] >> 0x3;
            // tslint:enable:no-bitwise
            ++cmdIndex;

            if (kind === CommandKind.MoveTo || kind === CommandKind.LineTo) {
                for (let n = 0; n < count; ++n) {
                    const xx = geometry[cmdIndex++];
                    const yy = geometry[cmdIndex++];

                    // tslint:disable:no-bitwise
                    currX += (xx >> 1) ^ -(xx & 1);
                    currY += (yy >> 1) ^ -(yy & 1);
                    if (visitor.type === "Polygon") {
                        xCoords.push(currX);
                        yCoords.push(currY);
                    }

                    const position = new Vector2(currX, currY);
                    commands.push({ kind, position });
                }
            } else {
                for (const command of commands) {
                    visitor.visitCommand(command);
                }
                visitor.visitCommand({ kind });
                xCoords.length = 0;
                yCoords.length = 0;
                commands.length = 0;
            }
        }

        if (commands.length > 0) {
            for (const command of commands) {
                visitor.visitCommand(command);
            }
        }
    }
}

const propertyCategories = [
    "stringValue",
    "floatValue",
    "doubleValue",
    "intValue",
    "uintValue",
    "sintValue",
    "boolValue"
];

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

function replaceReservedName(name: string): string {
    switch (name) {
        case "id":
            return "$id";
        default:
            return name;
    } // switch
}

function decodeFeatureId(
    feature: com.mapbox.pb.Tile.IFeature,
    logger?: ILogger
): number | undefined {
    if (feature.id !== undefined) {
        if (typeof feature.id === "number") {
            return feature.id;
        } else if (Long.isLong(feature.id)) {
            if (feature.id.greaterThan(Number.MAX_SAFE_INTEGER)) {
                if (logger !== undefined) {
                    logger.error(
                        "Invalid ID: Larger than largest available Number in feature: ",
                        feature
                    );
                }
            }
            return (feature.id as any).toNumber(); // long
        }
    }
    return undefined;
}

function readAttributes(
    layer: com.mapbox.pb.Tile.ILayer,
    feature: com.mapbox.pb.Tile.IFeature,
    defaultAttributes: ValueMap = {}
): ValueMap {
    const attrs = new FeatureAttributes();

    const attributes: ValueMap = defaultAttributes || {};

    attrs.accept(layer, feature, {
        visitAttribute: (name, value) => {
            attributes[replaceReservedName(name)] = simplifiedValue(value);
            return true;
        }
    });

    return attributes;
}

function getFeatureAttributes(
    layer: com.mapbox.pb.Tile.ILayer,
    feature: com.mapbox.pb.Tile.IFeature,
    geometryType: string,
    storageLevel: number,
    storageLevelOffset?: number,
    logger?: ILogger
): ValueMap {
    const attributes: ValueMap = {
        $layer: layer.name,
        $level: storageLevel,
        $zoom: Math.max(0, storageLevel - (storageLevelOffset || 0)),
        $geometryType: geometryType
    };

    // Some sources serve `id` directly as `IFeature` property ...
    if (feature.id !== undefined) {
        const featureId = decodeFeatureId(feature, logger);
        if (featureId !== undefined) {
            attributes.$id = featureId;
        }
    }

    readAttributes(layer, feature, attributes);

    return attributes;
}

function asGeometryType(feature: com.mapbox.pb.Tile.IFeature | undefined): OmvGeometryType {
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

export class OmvGenericEnvironmentProcessor implements IEnvironmentProcessor {
    createFeatureEnvironment(attributes: ValueMap, parent?: Env | undefined): Env {
        return new MapEnv(attributes, parent);
    }
}

export class OmvLocalEnvironmentProcessor implements IEnvironmentProcessor {
    /**
     * Map that contains localized properties names with requested localization (country code).
     */
    private readonly m_locale: LocaleMap;

    constructor() {
        this.m_locale = new Map<string, string>();
    }

    /**
     * Setup environment to prioritize localized properties before generic ones.
     *
     * @note Some map features may have properties defined in _localized_ and _generic_
     * version. The _localized_ attribute may hold for example name of the place in
     * country specific language, but it may be also the variable property that is
     * specific only for certain country point of view.
     * For example some country borders may be disputed by general community, while totally
     * accepted or claimed by some certain countries, depending on their political point of
     * view.
     * @see [ISO_3166-1_alfa-2|https://pl.wikipedia.org/wiki/ISO_3166-1_alfa-2] for more
     * info about supported country codes.
     * @param propertyName The name of property to be localized.
     * @param countryCode The country code in ISO 3166-1 alfa-2 format (two letters).
     */
    setLocale(propertyName: string, countryCode: string): void {
        // TODO: Hold compound property in form `${name}:${country}`,
        // which may greatly improve performance - no string object
        // creation at each lookup.
        this.m_locale.set(propertyName, countryCode);
    }

    createFeatureEnvironment(attributes: ValueMap, parent?: Env | undefined): Env {
        // Create feature environment (attributes) map using shared locale settings.
        return new MapLocalEnv(attributes, parent, this.m_locale);
    }
}

/**
 * The class [[OmvProtobufDataAdapter]] converts OMV protobuf geo data
 * to geometries for the given [[IGeometryProcessor]].
 */
export class OmvProtobufDataAdapter implements OmvDataAdapter, OmvVisitor {
    id = "omv-protobuf";

    private readonly m_geometryCommands = new GeometryCommands();
    private readonly m_processor: IGeometryProcessor;
    private readonly m_envProcessor: IEnvironmentProcessor;
    private readonly m_logger?: ILogger;
    private m_dataFilter?: OmvFeatureFilter;

    private m_tileKey!: TileKey;
    private m_layer!: com.mapbox.pb.Tile.ILayer;

    /**
     * Constructs a new [[OmvProtobufDataAdapter]].
     *
     * @param processor The [[IGeometryProcessor]] used to process the data.
     * @param dataFilter The [[OmvFeatureFilter]] used to filter features.
     * @param logger The [[ILogger]] used to log diagnostic messages.
     */
    constructor(
        processor: IGeometryProcessor,
        envProcessor: IEnvironmentProcessor,
        dataFilter?: OmvFeatureFilter,
        logger?: ILogger
    ) {
        this.m_processor = processor;
        this.m_envProcessor = envProcessor;
        this.m_dataFilter = dataFilter;
        this.m_logger = logger;
    }

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
     * @param feature The OMV point features to process.
     */
    visitPointFeature(feature: com.mapbox.pb.Tile.IFeature): void {
        if (feature.geometry === undefined) {
            return;
        }

        const storageLevel = this.m_tileKey.level;
        const layerName = this.m_layer.name;
        const layerExtents = this.m_layer.extent || 4096;

        if (
            this.m_dataFilter !== undefined &&
            !this.m_dataFilter.wantsPointFeature(layerName, asGeometryType(feature), storageLevel)
        ) {
            return;
        }

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

        const attribs = getFeatureAttributes(
            this.m_layer,
            feature,
            "point",
            storageLevel,
            this.m_processor.storageLevelOffset,
            this.m_logger
        );

        const env = this.m_envProcessor.createFeatureEnvironment(attribs);
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

        const attribs = getFeatureAttributes(
            this.m_layer,
            feature,
            "line",
            storageLevel,
            this.m_processor.storageLevelOffset,
            this.m_logger
        );
        const env = this.m_envProcessor.createFeatureEnvironment(attribs);
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

        if (
            this.m_dataFilter !== undefined &&
            !this.m_dataFilter.wantsPolygonFeature(layerName, asGeometryType(feature), storageLevel)
        ) {
            return;
        }

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

        const attribs = getFeatureAttributes(
            this.m_layer,
            feature,
            "polygon",
            storageLevel,
            this.m_processor.storageLevelOffset,
            this.m_logger
        );

        const env = this.m_envProcessor.createFeatureEnvironment(attribs);
        this.m_processor.processPolygonFeature(
            layerName,
            layerExtents,
            geometry,
            env,
            storageLevel
        );
    }
}
