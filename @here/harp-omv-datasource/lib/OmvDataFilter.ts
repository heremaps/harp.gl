/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { LoggerManager } from "@here/harp-utils";
import {
    VectorTileFeatureFilter,
    VectorTileFeatureFilterDescription,
    VectorTileFeatureFilterDescriptionBuilder,
    VectorTileFeatureModifier,
    VectorTileGenericFeatureModifier
} from "@here/harp-vectortile-datasource";

export type OmvFeatureFilter = VectorTileFeatureFilter;
export type OmvFeatureModifier = VectorTileFeatureModifier;

const logger = LoggerManager.instance.create("OmvFeatureFilterDescriptionBuilder");
let warningShown = false;
export class OmvFeatureFilterDescriptionBuilder extends VectorTileFeatureFilterDescriptionBuilder {
    constructor(
        options?: OmvFeatureFilterDescriptionBuilder.OmvFeatureFilterDescriptionBuilderOptions
    ) {
        super(options);
        if (!warningShown) {
            logger.warn(
                "OMVDataSource is deprecated and will be removed soon. Use " +
                    "VectorTileDataSource instead (package @here/harp-vectortile-datasource)."
            );
            warningShown = true;
        }
    }
}

export namespace OmvFeatureFilterDescriptionBuilder {
    // tslint:disable-next-line:max-line-length
    export type OmvFeatureFilterDescriptionBuilderOptions = VectorTileFeatureFilterDescriptionBuilder.VectorTileFeatureFilterDescriptionBuilderOptions;
    export type FeatureOption = VectorTileFeatureFilterDescriptionBuilder.FeatureOption;
    export type MultiFeatureOption = VectorTileFeatureFilterDescriptionBuilder.MultiFeatureOption;
}
export class OmvGenericFeatureModifier extends VectorTileGenericFeatureModifier {
    constructor(description: VectorTileFeatureFilterDescription) {
        super(description);
    }
}
