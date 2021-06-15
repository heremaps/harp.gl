/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    MapEnv,
    StyleSetEvaluator,
    Value,
    ValueMap
} from "@here/harp-datasource-protocol/index-decoder";
import { TileKey } from "@here/harp-geoutils";
import { assert, ILogger, LoggerManager } from "@here/harp-utils";
import * as Long from "long";
import { ShapeUtils, Vector2, Vector3 } from "three";

import { DataAdapter } from "../../DataAdapter";
import { DecodeInfo } from "../../DecodeInfo";
import { IGeometryProcessor, ILineGeometry, IPolygonGeometry } from "../../IGeometryProcessor";
import {
    ComposedDataFilter,
    OmvFeatureFilter,
    OmvFeatureModifier,
    OmvGenericFeatureFilter,
    OmvGenericFeatureModifier
} from "../../OmvDataFilter";
import {
    FeatureModifierId,
    OmvDecoderOptions,
    OmvFeatureFilterDescription,
    OmvGeometryType
} from "../../OmvDecoderDefs";
import { OmvPoliticalViewFeatureModifier } from "../../OmvPoliticalViewFeatureModifier";
import { isArrayBufferLike } from "../../OmvUtils";
import { StyleSetDataFilter } from "../../StyleSetDataFilter";
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
    properties: ValueMap,
    logger?: ILogger
): number | string | undefined {
    if (properties.id !== undefined && properties.id !== null) {
        return properties.id as number | string;
    }
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
function createFeatureModifier(
    filterDescription: OmvFeatureFilterDescription,
    featureModifierId?: FeatureModifierId
): OmvFeatureModifier {
    switch (featureModifierId) {
        case FeatureModifierId.default:
            return new OmvGenericFeatureModifier(filterDescription);
        default:
            assert(!"Unrecognized feature modifier id, using default!");
            return new OmvGenericFeatureModifier(filterDescription);
    }
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
    private m_featureModifiers?: OmvFeatureModifier[];
    private m_processor!: IGeometryProcessor;
    private m_roundUpCoordinatesIfNeeded: boolean = false;

    /**
     * The [[OmvFeatureFilter]] used to filter features.
     */
    get dataFilter(): OmvFeatureFilter | undefined {
        return this.m_dataFilter;
    }

    /**
     * Configures the OMV adapter.
     *
     * @param options - Configuration options.
     * @param styleSetEvaluator - Style set evaluator instance, used for filtering.
     */
    configure(options: OmvDecoderOptions, styleSetEvaluator: StyleSetEvaluator) {
        if (options.filterDescription !== undefined) {
            if (options.filterDescription !== null) {
                // TODO: Feature modifier is always used only with feature filter.
                // At best the filtering feature should be excluded from other feature
                // modifiers and be performed solely via OmvGenericFeature modifier or filter.
                const filterDescription = options.filterDescription;
                const featureModifiersIds = options.featureModifiers;

                // Create new filter from description.
                this.m_dataFilter = new OmvGenericFeatureFilter(filterDescription);
                // Create feature modifiers.
                const featureModifiers: OmvFeatureModifier[] = [];
                if (featureModifiersIds !== undefined) {
                    featureModifiersIds.forEach(fmId => {
                        featureModifiers.push(createFeatureModifier(filterDescription, fmId));
                    });
                } else {
                    featureModifiers.push(
                        createFeatureModifier(filterDescription, FeatureModifierId.default)
                    );
                }
                this.m_featureModifiers = featureModifiers;
            } else {
                // null is the signal to clear the filter/modifier
                this.m_dataFilter = undefined;
                this.m_featureModifiers = undefined;
            }
            const styleSetDataFilter = new StyleSetDataFilter(styleSetEvaluator);
            this.m_dataFilter = this.m_dataFilter
                ? new ComposedDataFilter([styleSetDataFilter, this.m_dataFilter])
                : styleSetDataFilter;
        }

        if (options.politicalView !== undefined) {
            const politicalView = options.politicalView;
            let featureModifiers = this.m_featureModifiers;
            // Remove existing political view modifiers, this actually setups default,
            // commonly accepted point of view - without feature modifier.
            if (featureModifiers) {
                featureModifiers = featureModifiers.filter(
                    fm => !(fm instanceof OmvPoliticalViewFeatureModifier)
                );
            }
            // If political view is indeed requested append feature modifier at the end of list.
            if (politicalView.length !== 0) {
                assert(
                    politicalView.length === 2,
                    "The political view must be specified as two letters ISO 3166-1 standard!"
                );
                const povFeatureModifier = new OmvPoliticalViewFeatureModifier(politicalView);
                if (featureModifiers) {
                    featureModifiers.push(povFeatureModifier);
                } else {
                    featureModifiers = [povFeatureModifier];
                }
            }
            // Reset modifiers if nothing was added.
            this.m_featureModifiers =
                featureModifiers && featureModifiers.length > 0 ? featureModifiers : undefined;
        }
        this.m_roundUpCoordinatesIfNeeded = options.roundUpCoordinatesIfNeeded ?? false;
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

        // Pass feature modifier method to processFeature if there's any modifier. Get it from any
        // modifier, processFeature will later apply it to all using Function.apply().
        const modifierFunc = this.m_featureModifiers?.[0].doProcessPointFeature;

        const properties = this.filterAndModifyFeature(
            feature,
            this.m_dataFilter?.wantsPointFeature,
            modifierFunc
        );
        if (!properties) {
            return;
        }

        const layerName = this.m_layer.name;
        const layerExtents = this.m_layer.extent ?? 4096;

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
            properties,
            decodeFeatureId(feature, properties, logger)
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

        // Pass feature modifier method to processFeature if there's any modifier. Get it from any
        // modifier, processFeature will later apply it to all using Function.apply().
        const modifierFunc = this.m_featureModifiers?.[0].doProcessLineFeature;

        const properties = this.filterAndModifyFeature(
            feature,
            this.m_dataFilter?.wantsLineFeature,
            modifierFunc
        );
        if (!properties) {
            return;
        }

        const layerName = this.m_layer.name;
        const layerExtents = this.m_layer.extent ?? 4096;

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
            properties,
            decodeFeatureId(feature, properties, logger)
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

        // Pass feature modifier method to processFeature if there's any modifier. Get it from any
        // modifier, processFeature will later apply it to all using Function.apply().
        const modifierFunc = this.m_featureModifiers?.[0].doProcessPolygonFeature;

        const properties = this.filterAndModifyFeature(
            feature,
            this.m_dataFilter?.wantsPolygonFeature,
            modifierFunc
        );
        if (!properties) {
            return;
        }

        const layerName = this.m_layer.name;
        const layerExtents = this.m_layer.extent ?? 4096;

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
            properties,
            decodeFeatureId(feature, properties, logger)
        );
    }

    /**
     * Applies any filter and modifiers to a given feature.
     *
     * @param feature - The feature to filter and modify.
     * @param filterFunc - The filtering function.
     * @param modifierFunc - The modifier function.
     * @returns The modified feature properties or `undefined` if feature is filtered out.
     */
    private filterAndModifyFeature(
        feature: com.mapbox.pb.Tile.IFeature,
        filterFunc?: (...args: any[]) => boolean,
        modifierFunc?: (...args: any[]) => boolean
    ): ValueMap | undefined {
        const storageLevel = this.m_tileKey.level;
        const layerName = this.m_layer.name;
        const geometryType = asGeometryType(feature);

        if (
            this.m_dataFilter &&
            filterFunc!.apply(this.m_dataFilter, [layerName, geometryType, storageLevel]) === false
        ) {
            return undefined;
        }

        const properties = readAttributes(this.m_layer, feature);
        const env = new MapEnv(properties);
        if (
            this.m_featureModifiers?.find(fm => {
                // TODO: The logic of feature ignore should be actually in the feature filtering
                // mechanism - see OmvFeatureFilter.
                assert(modifierFunc !== undefined);
                return !modifierFunc!.apply(fm, [layerName, env, this.m_tileKey.level]);
            }) !== undefined
        ) {
            return undefined;
        }

        return properties;
    }

    private get mustRoundUpCoordinates(): boolean {
        return (
            this.m_roundUpCoordinatesIfNeeded &&
            this.m_tileKey.level < 5 &&
            this.m_tileKey.column === this.m_tileKey.columnCount() - 1
        );
    }
}
