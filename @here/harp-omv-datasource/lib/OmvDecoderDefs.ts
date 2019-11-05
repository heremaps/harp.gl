/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    VectorTileDecoderOptions,
    VectorTileFeatureFilterDescription,
    VectorTileFilterDescription,
    VectorTileFilterFeatureAttribute,
    VectorTileFilterString,
    VectorTileGeometryType,
    VectorTileLayerFilterDescription
} from "@here/harp-vectortile-datasource";

/**
 * Feature Modifier ids to choose which OmvFeatureModifer should be used in OmvDecoder.
 */
export enum FeatureModifierId {
    /**
     * Identifier to use the OmvTomTomFeatureModifier in the OmvDecoder.
     */
    tomTom
}

/**
 * Definition of a filter.
 */
export type OmvFilterString = VectorTileFilterString;

/**
 * Adding the match condition type and the matching function to the namespace of `OmvFilterString`.
 */
export const OmvFilterString = VectorTileFilterString;

/**
 * Definition of a filter for a feature attribute
 */
export type OmvFilterFeatureAttribute = VectorTileFilterFeatureAttribute;

export type OmvGeometryType = VectorTileGeometryType;

/**
 * Internal type of a layer filter description, Should not be publicly available.
 *
 * @hidden
 */
export type OmvLayerFilterDescription = VectorTileLayerFilterDescription;

/**
 * Internal type of a single filter description, Should not be publicly available.
 *
 * @hidden
 */
export type OmvFilterDescription = VectorTileFilterDescription;

/**
 * Internal type of a complete [[OmvFeatureFilter]] description, should not be publicly available.
 *
 * @hidden
 */
export type OmvFeatureFilterDescription = VectorTileFeatureFilterDescription;

/**
 * Internal interface for options passed from the [[OmvDataSource]] to the decoder.
 *
 * @hidden
 */
export type OmvDecoderOptions = VectorTileDecoderOptions;

/**
 * Default OMV tile decoder service type.
 *
 * Used for requesting decoder services using [[WorkerServiceManager]].
 */
export const OMV_TILE_DECODER_SERVICE_TYPE = "omv-tile-decoder";

/**
 * Default OMV tiler service type.
 *
 * Used for requesting tiler services using [[WorkerServiceManager]].
 */
export const OMV_TILER_SERVICE_TYPE = "omv-tiler";
