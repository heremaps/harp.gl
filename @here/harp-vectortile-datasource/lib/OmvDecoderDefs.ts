/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { Value } from "@here/harp-datasource-protocol/index-decoder";

/**
 * Feature Modifier ids to choose which OmvFeatureModifer should be used in OmvDecoder.
 */
export enum FeatureModifierId {
    /**
     * Generic feature modifier used when no other modifiers are defined.
     *
     * @note You do not need to specify it in [[OmvDataSourceParameters]] as it is added by default
     * if no other feature modifier is used.
     */
    default,
    /**
     * Identifier to use the TomTomFeatureModifier in the OmvDecoder.
     */
    tomTom
}

/**
 * Definition of a filter.
 */
export interface FilterString {
    /**  String value */
    value: string;
    /** Match condition */
    match: FilterString.StringMatch;
}

/**
 * Adding the match condition type and the matching function to the namespace of `FilterString`.
 */
export namespace FilterString {
    /**
     * Match condition.
     */
    export enum StringMatch {
        /** Matches any. */
        Any,
        /** Exact match. */
        Match,
        /** Matches if a test string starts with a filter string. */
        StartsWith,
        /** Matches if a test string contains a filter string. */
        Contains,
        /** Matches if a test string ends with a filter string. */
        EndsWith
    }

    /**
     * Check for a string against a filter.
     *
     * @param str - The string to check against a filter.
     * @param filterString - The filter containing the match condition.
     * @returns `true` if the match condition is satisfied.
     *
     * @internal
     */
    export function matchString(str: string, filterString: FilterString): boolean {
        switch (filterString.match) {
            case FilterString.StringMatch.Any:
                return true;
            case FilterString.StringMatch.Match:
                return str === filterString.value;
            case FilterString.StringMatch.StartsWith:
                return filterString.value.startsWith(str);
            case FilterString.StringMatch.EndsWith:
                return filterString.value.endsWith(str);
            default:
                return str.indexOf(filterString.value) >= 0;
        }
    }
}

/**
 * Definition of a filter for a feature attribute
 */
export interface FilterFeatureAttribute {
    key: string;
    value: Value;
}

/**
 * @internal
 */
export enum GeometryType {
    UNKNOWN = 0,
    POINT = 1,
    LINESTRING = 2,
    POLYGON = 3
}

/**
 * Internal type of a layer filter description, Should not be publicly available.
 *
 * @internal
 */
export interface LayerFilterDescription {
    name: FilterString;
    minLevel: number;
    maxLevel: number;
}

/**
 * Internal type of a single filter description, Should not be publicly available.
 *
 * @internal
 */
export interface FilterDescription {
    layerName: FilterString;
    geometryTypes?: GeometryType[];
    classes?: FilterString[];
    minLevel: number;
    maxLevel: number;
    featureAttribute?: FilterFeatureAttribute;
}

/**
 * Internal type of a complete [[OmvFeatureFilter]] description, should not be publicly available.
 *
 * @internal
 */
export interface FeatureFilterDescription {
    processLayersDefault: boolean;
    processPointsDefault: boolean;
    processLinesDefault: boolean;
    processPolygonsDefault: boolean;

    layersToProcess: LayerFilterDescription[];
    layersToIgnore: LayerFilterDescription[];
    pointsToProcess: FilterDescription[];
    pointsToIgnore: FilterDescription[];
    linesToProcess: FilterDescription[];
    linesToIgnore: FilterDescription[];
    polygonsToProcess: FilterDescription[];
    polygonsToIgnore: FilterDescription[];

    // enabledKinds and disabledKinds
    kindsToProcess: string[];
    kindsToIgnore: string[];
}

/**
 * Internal interface for options passed from the [[OmvDataSource]] to the decoder.
 *
 * @internal
 */
export interface DecoderOptions {
    /**
     * If true, features that have no technique in the theme will be printed to the console (can be
     * excessive!).
     */
    showMissingTechniques?: boolean;

    /**
     * Gather feature attributes from [[OmvData]]. Defaults to false.
     */
    gatherFeatureAttributes?: boolean;

    /**
     * @deprecated Tile info is not decoded anymore. The same information can be generated
     * implementing a [[IGeometryProcessor]] and using [[OmvProtobufDataAdapter]] to decode OMV
     * data.
     */
    createTileInfo?: boolean;

    /**
     * @deprecated Tile info is not decoded anymore. The same information can be generated
     * implementing a [[IGeometryProcessor]] and using [[OmvProtobufDataAdapter]] to decode OMV
     * data.
     */
    gatherRoadSegments?: boolean;

    /**
     * Optional storage level offset for [[Tile]]s. Default is -2.
     */
    storageLevelOffset?: number;

    /**
     * If not set to `false` very short text labels will be skipped during decoding based on a
     * heuristic.
     */
    skipShortLabels?: boolean;

    /**
     * A description for the feature filter which can be safely passed down to the web workers.
     * It has to be generated with the help of the [[FeatureFilterDescriptionBuilder]] (to
     * guarantee the correctness).
     */
    filterDescription?: FeatureFilterDescription | null;

    // NOTE: Consider using OmvFeatureModifiers objects already instead of ids, this way we could
    // get rid of politicalView property as properly configured feature modifier (with country
    // code), would be already defined here.
    /**
     * List of user specified [[OmvFeatureModifier]]s, list order declares the order of processing.
     *
     * Each identifier is used to choose corresponding OmvFeatureModifier, if undefined at least
     * [[OmvGenericFeatureModifier]] is added to decoder.
     */
    featureModifiers?: FeatureModifierId[];

    /**
     * Country code (lower-case ISO 3166-1 alpha-2) defining optional point of view to be used.
     * Set to empty string ("") if you want to use default (widely accepted) point of view.
     * If set to `undefined` leaves current political view decoder configuration.
     */
    politicalView?: string;

    enableElevationOverlay?: boolean;
}

/**
 * Vector tile decoder service type id.
 *
 * @remarks
 * Used for requesting decoder services using `WorkerServiceManager`.
 *
 * @internal
 */
export const VECTOR_TILE_DECODER_SERVICE_TYPE = "vector-tile-decoder";

/**
 * GeoJson tiler service type id.
 *
 * @remarks
 * Used for requesting tiler services using `WorkerServiceManager`.
 *
 * @internal
 */
export const GEOJSON_TILER_SERVICE_TYPE = "geojson-tiler";
