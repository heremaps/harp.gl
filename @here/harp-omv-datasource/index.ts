/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * HERE OMV Data source.
 *
 * @remarks
 *
 * @packageDocumentation
 */

export {
    APIFormat,
    AuthenticationMethod,
    GeoJsonDataProvider,
    VectorTileDataSourceParameters as OmvDataSourceParameters
} from "@here/harp-vectortile-datasource";

export {
    ComposedDataFilter,
    FeatureFilter as OmvFeatureFilter,
    FeatureFilterDescriptionBuilder as OmvFeatureFilterDescriptionBuilder,
    FeatureModifier as OmvFeatureModifier,
    GenericFeatureFilter as OmvGenericFeatureFilter,
    GenericFeatureModifier as OmvGenericFeatureModifier
} from "@here/harp-vectortile-datasource/lib/FeatureFilter";

export {
    FeatureModifierId,
    DecoderOptions as OmvDecoderOptions,
    FeatureFilterDescription as OmvFeatureFilterDescription,
    FilterDescription as OmvFilterDescription,
    FilterFeatureAttribute as OmvFilterFeatureAttribute,
    FilterString as OmvFilterString,
    GeometryType as OmvGeometryType
} from "@here/harp-vectortile-datasource/lib/OmvDecoderDefs";

export {
    RestClient as OmvRestClient,
    RestClientParameters as OmvRestClientParameters
} from "@here/harp-vectortile-datasource/lib/OmvRestClient";

export * from "@here/harp-vectortile-datasource/lib/OmvRestClient";

export * from "./lib/OmvDataSource";
