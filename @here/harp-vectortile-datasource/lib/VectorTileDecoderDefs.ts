/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { Value } from "@here/harp-datasource-protocol/index-decoder";

/**
 * Feature Modifier ids to choose which VectorTileFeatureModifier should be used in
 * VectorTileDecoder.
 */
export enum FeatureModifierId {
    /**
     * Identifier to use the VectorTileTomTomFeatureModifier in the VectorTileDecoder.
     */
    tomTom
}

/**
 * Definition of a filter.
 */
export interface VectorTileFilterString {
    /**  String value */
    value: string;
    /** Match condition */
    match: VectorTileFilterString.StringMatch;
}

/**
 * Adding the match condition type and the matching function to the namespace of
 * `VectorTileFilterString`.
 */
export namespace VectorTileFilterString {
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
     * @param str The string to check against a filter.
     * @param filterString The filter containing the match condition.
     * @returns `true` if the match condition is satisfied.
     */
    export function matchString(str: string, filterString: VectorTileFilterString): boolean {
        switch (filterString.match) {
            case VectorTileFilterString.StringMatch.Any:
                return true;
            case VectorTileFilterString.StringMatch.Match:
                return str === filterString.value;
            case VectorTileFilterString.StringMatch.StartsWith:
                return filterString.value.startsWith(str);
            case VectorTileFilterString.StringMatch.EndsWith:
                return filterString.value.endsWith(str);
            default:
                return str.indexOf(filterString.value) >= 0;
        }
    }
}

/**
 * Definition of a filter for a feature attribute
 */
export interface VectorTileFilterFeatureAttribute {
    key: string;
    value: Value;
}

export enum VectorTileGeometryType {
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
export interface VectorTileLayerFilterDescription {
    name: VectorTileFilterString;
    minLevel: number;
    maxLevel: number;
}

/**
 * Internal type of a single filter description, Should not be publicly available.
 *
 * @hidden
 */
export interface VectorTileFilterDescription {
    layerName: VectorTileFilterString;
    geometryTypes?: VectorTileGeometryType[];
    classes?: VectorTileFilterString[];
    minLevel: number;
    maxLevel: number;
    featureAttribute?: VectorTileFilterFeatureAttribute;
}

/**
 * Internal type of a complete [[VectorTileFeatureFilter]] description, should not be publicly
 * available.
 *
 * @hidden
 */
export interface VectorTileFeatureFilterDescription {
    processLayersDefault: boolean;
    processPointsDefault: boolean;
    processLinesDefault: boolean;
    processPolygonsDefault: boolean;

    layersToProcess: VectorTileLayerFilterDescription[];
    layersToIgnore: VectorTileLayerFilterDescription[];
    pointsToProcess: VectorTileFilterDescription[];
    pointsToIgnore: VectorTileFilterDescription[];
    linesToProcess: VectorTileFilterDescription[];
    linesToIgnore: VectorTileFilterDescription[];
    polygonsToProcess: VectorTileFilterDescription[];
    polygonsToIgnore: VectorTileFilterDescription[];

    // enabledKinds and disabledKinds
    kindsToProcess: string[];
    kindsToIgnore: string[];
}

/**
 * Internal interface for options passed from the [[VectorTileDataSource]] to the decoder.
 *
 * @hidden
 */
export interface VectorTileDecoderOptions {
    /**
     * If true, features that have no technique in the theme will be printed to the console (can be
     * excessive!).
     */
    showMissingTechniques?: boolean;

    /**
     * Gather feature IDs from [[VectorTileData]]. Defaults to true.
     */
    gatherFeatureIds?: boolean;
    createTileInfo?: boolean;
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
     * It has to be generated with the help of the [[VectorTileFeatureFilterDescriptionBuilder]] (to
     * guarantee the correctness).
     */
    filterDescription?: VectorTileFeatureFilterDescription | null;

    /**
     * Identifier used to choose VectorTileFeatureModifier, if undefined
     * [[VectorTileGenericFeatureModifier]] is used.
     */
    featureModifierId?: FeatureModifierId;

    enableElevationOverlay?: boolean;
}

/**
 * Default vector tile decoder service type.
 *
 * Used for requesting decoder services using [[WorkerServiceManager]].
 */
export const VECTOR_TILE_DECODER_SERVICE_TYPE = "vector-tile-decoder";

/**
 * Default vector tiler service type.
 *
 * Used for requesting tiler services using [[WorkerServiceManager]].
 */
export const VECTOR_TILER_SERVICE_TYPE = "vector-tiler";
