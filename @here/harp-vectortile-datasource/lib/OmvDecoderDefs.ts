/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
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
    default
}

/**
 * Definition of a filter.
 */
export interface OmvFilterString {
    /**  String value */
    value: string;
    /** Match condition */
    match: OmvFilterString.StringMatch;
}

/**
 * Adding the match condition type and the matching function to the namespace of `OmvFilterString`.
 */
export namespace OmvFilterString {
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
    export function matchString(str: string, filterString: OmvFilterString): boolean {
        switch (filterString.match) {
            case OmvFilterString.StringMatch.Any:
                return true;
            case OmvFilterString.StringMatch.Match:
                return str === filterString.value;
            case OmvFilterString.StringMatch.StartsWith:
                return filterString.value.startsWith(str);
            case OmvFilterString.StringMatch.EndsWith:
                return filterString.value.endsWith(str);
            default:
                return str.includes(filterString.value);
        }
    }
}

/**
 * Definition of a filter for a feature attribute
 */
export interface OmvFilterFeatureAttribute {
    key: string;
    value: Value;
}

export enum OmvGeometryType {
    UNKNOWN = 0,
    POINT = 1,
    LINESTRING = 2,
    POLYGON = 3
}

/**
 * Internal type of a layer filter description, Should not be publicly available.
 *
 * @hidden
 */
export interface OmvLayerFilterDescription {
    name: OmvFilterString;
    minLevel: number;
    maxLevel: number;
}

/**
 * Internal type of a single filter description, Should not be publicly available.
 *
 * @hidden
 */
export interface OmvFilterDescription {
    layerName: OmvFilterString;
    geometryTypes?: OmvGeometryType[];
    classes?: OmvFilterString[];
    minLevel: number;
    maxLevel: number;
    featureAttribute?: OmvFilterFeatureAttribute;
}

/**
 * Internal type of a complete [[OmvFeatureFilter]] description, should not be publicly available.
 *
 * @hidden
 */
export interface OmvFeatureFilterDescription {
    processLayersDefault: boolean;
    processPointsDefault: boolean;
    processLinesDefault: boolean;
    processPolygonsDefault: boolean;

    layersToProcess: OmvLayerFilterDescription[];
    layersToIgnore: OmvLayerFilterDescription[];
    pointsToProcess: OmvFilterDescription[];
    pointsToIgnore: OmvFilterDescription[];
    linesToProcess: OmvFilterDescription[];
    linesToIgnore: OmvFilterDescription[];
    polygonsToProcess: OmvFilterDescription[];
    polygonsToIgnore: OmvFilterDescription[];

    // enabledKinds and disabledKinds
    kindsToProcess: string[];
    kindsToIgnore: string[];
}

/**
 * Internal interface for options passed from the [[OmvDataSource]] to the decoder.
 *
 * @hidden
 */
export interface OmvDecoderOptions {
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
     * It has to be generated with the help of the [[OmvFeatureFilterDescriptionBuilder]] (to
     * guarantee the correctness).
     */
    filterDescription?: OmvFeatureFilterDescription | null;

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

    roundUpCoordinatesIfNeeded?: boolean;
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
