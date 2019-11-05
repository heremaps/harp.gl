/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { StyleSetEvaluator } from "@here/harp-datasource-protocol/index-decoder";
import { Projection } from "@here/harp-geoutils";
import { LoggerManager } from "@here/harp-utils";
import {
    IVectorTileEmitter,
    VectorDecoder,
    VectorTileDataAdapter,
    VectorTileDecoder,
    VectorTileDecoderService
} from "@here/harp-vectortile-datasource/index-worker";
import VectorTileWorkerClient from "@here/harp-vectortile-datasource/lib/VectorTileDecoder";
import { OmvFeatureFilter, OmvFeatureModifier } from "./OmvDataFilter";
const logger = LoggerManager.instance.create("OmvDecoder");

export class Ring {
    readonly winding: boolean;

    /**
     * Constructs a new [[Ring]].
     *
     * @param extents The extents of the enclosing layer.
     * @param vertexStride The stride of this elements stored in 'contour'.
     * @param contour The [[Array]] containing the projected world coordinates.
     */
    constructor(
        readonly extents: number,
        readonly vertexStride: number,
        readonly contour: number[]
    ) {
        this.winding = this.area() < 0;
    }

    area(): number {
        const points = this.contour;
        const stride = this.vertexStride;
        const n = points.length / stride;

        let area = 0.0;

        for (let p = n - 1, q = 0; q < n; p = q++) {
            area +=
                points[p * stride] * points[q * stride + 1] -
                points[q * stride] * points[p * stride + 1];
        }

        return area / 2;
    }
}

export type IOmvEmitter = IVectorTileEmitter;

/**
 * The class [[OmvDataAdapter]] prepares protobuf encoded OMV data so they
 * can be processed by [[OmvDecoder]].
 */
export type OmvDataAdapter = VectorTileDataAdapter;

let warningShown = false;
export class OmvDecoder extends VectorDecoder {
    constructor(
        projection: Projection,
        styleSetEvaluator: StyleSetEvaluator,
        showMissingTechniques: boolean,
        dataFilter?: OmvFeatureFilter,
        featureModifier?: OmvFeatureModifier,
        gatherFeatureIds = true,
        createTileInfo = false,
        gatherRoadSegments = false,
        skipShortLabels = true,
        storageLevelOffset = 0,
        enableElevationOverlay = false,
        languages?: string[]
    ) {
        super(
            projection,
            styleSetEvaluator,
            showMissingTechniques,
            dataFilter,
            featureModifier,
            gatherFeatureIds,
            createTileInfo,
            gatherRoadSegments,
            skipShortLabels,
            storageLevelOffset,
            enableElevationOverlay,
            languages
        );
        if (!warningShown) {
            logger.warn(
                "OmvDecoder is deprecated and will be removed soon. Use " +
                    "VectorDecoder instead (package @here/harp-vectortile-datasource)."
            );
            warningShown = true;
        }
    }
}

export namespace OmvDecoder {
    export const DecodeInfo = VectorDecoder.DecodeInfo;
}

export class OmvTileDecoder extends VectorTileDecoder {}

/**
 * OMV tile decoder service.
 */
export class OmvTileDecoderService {
    /**
     * Register[[OmvTileDecoder]] service class in [[WorkerServiceManager]].
     *
     * Has to be called during initialization of decoder bundle.
     */
    static start() {
        VectorTileDecoderService.start();
    }
}

/**
 * Starts an OMV decoder service.
 *
 * @deprecated Please use [[OmvTileDecoderService.start]].
 */
export default class OmvWorkerClient extends VectorTileWorkerClient {
    constructor() {
        super();
    }
}
