/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Definitions,
    ITileDecoder,
    OptionsMap,
    StyleSet,
    WorkerServiceProtocol
} from "@here/harp-datasource-protocol";
import { EarthConstants, TileKey, webMercatorTilingScheme } from "@here/harp-geoutils";
import { CopyrightInfo, CopyrightProvider, DataSourceOptions, Tile } from "@here/harp-mapview";
import { DataProvider, TileDataSource, TileFactory } from "@here/harp-mapview-decoder";
import { getOptionValue, LoggerManager } from "@here/harp-utils";
import { RestClient, RestClientParameters } from "./RestClient";
import { VECTOR_TILE_DECODER_SERVICE_TYPE } from "./VectorDecoderDefs";
import { VectorTileDecoderOptions } from "./VectorTileDecoder";

const logger = LoggerManager.instance.create("VectorTileDataSource");

export interface VectorTileFactory {
    /** Create an instance of [[Tile]] or a subclass. */
    createTile(dataSource: VectorTileDataSource, tileKey: TileKey): Tile;
}

export interface VectorTileDataSourceParameters extends DataSourceOptions {
    /**
     * If set to `true`, features that have no technique in the theme will be printed to the console
     * (can be excessive!).
     */
    showMissingTechniques?: boolean;

    /**
     * If set to `true`, an [[ExtendedTileInfo]] is created for every tile in addition to the
     * [[DecodedTile]]. This is useful if the features should be passed on for processing without
     * geometry being automatically created from them. One application is picking.
     */
    createTileInfo?: boolean;

    /**
     * Specify the decoder that should be used. If not supplied, the default will be used.
     */
    decoder?: ITileDecoder;

    /**
     * Optionally specify the DataProvider that should be used.
     */
    dataProvider?: DataProvider;

    /**
     * Specify the URL to the decoder bundle. If not supplied, the default will be used.
     */
    concurrentDecoderScriptUrl?: string;

    /**
     * Gather feature IDs from `OmvData`. Defaults to `false`.
     * @deprecated, FeatureIds are always gathered, use [[gatherFeatureAttributes]] to gather
     * all feature attributes.
     */
    gatherFeatureIds?: boolean;

    /**
     * Gather feature attributes from `OmvData`. Defaults to `false`.
     */
    gatherFeatureAttributes?: boolean;

    /**
     * Gather road segments data from [[OmvData]]. Defaults to `false`.
     */
    gatherRoadSegments?: boolean;

    /**
     * If not set to `false`, very short text labels will be skipped during decoding based on a
     * heuristic.
     */
    skipShortLabels?: boolean;

    /**
     * Optional, custom factory for [[Tile]] instances created by this [[VectorTileDataSource]].
     */
    tileFactory?: TileFactory<Tile>;

    /**
     * Optional, default copyright information of tiles provided by this data source.
     * Implementation should provide this information from the source data if possible.
     */
    copyrightInfo?: CopyrightInfo[];

    /**
     * Optional copyright info provider for tiles provided by this data source.
     */
    copyrightProvider?: CopyrightProvider;

    /**
     * Maximum geometry height above groud level this `VectorTileDataSource` can produce.
     *
     * Used in first stage of frustum culling before [[Tile.maxGeometryHeight]] data is available.
     *
     * @default [[EarthConstants.MAX_BUILDING_HEIGHT]].
     */
    maxGeometryHeight?: number;

    /**
     * Indicates whether overlay on elevation is enabled. Defaults to `false`.
     */
    enableElevationOverlay?: boolean;

    /**
     * Indicates whether to add a ground plane to cover the tile completely. This is necessary for
     * the fallback logic, such that the parent fall back tiles don't overlap the children tiles.
     * Default is true (i.e. if not defined it is taken to be true)
     */
    addGroundPlane?: boolean;
}

/**
 * A helper function to retrieve the [[DataProvider]] from the [[VectorTileDataSource]]s parameters.
 *
 * @param params The parameters passed into the VectorTileDataSource.
 */
function getDataProvider(params: OmvWithRestClientParams | OmvWithCustomDataProvider) {
    if ((params as OmvWithCustomDataProvider).dataProvider) {
        return (params as OmvWithCustomDataProvider).dataProvider;
    } else if (
        (params as OmvWithRestClientParams).baseUrl ||
        (params as OmvWithRestClientParams).url
    ) {
        return new RestClient(params as RestClientParameters);
    } else {
        throw new Error("VectorTileDataSource: missing url, baseUrl or dataProvider params");
    }
}

export type OmvWithRestClientParams = RestClientParameters & VectorTileDataSourceParameters;
export type OmvWithCustomDataProvider = VectorTileDataSourceParameters & {
    dataProvider: DataProvider;
};

let missingVectorTileDecoderServiceInfoEmitted: boolean = false;

export class VectorTileDataSource extends TileDataSource<Tile> {
    private readonly m_decoderOptions: VectorTileDecoderOptions;

    constructor(private m_params: OmvWithRestClientParams | OmvWithCustomDataProvider) {
        super(m_params.tileFactory || new TileFactory(Tile), {
            styleSetName: m_params.styleSetName || "omv",
            name: m_params.name,
            tilingScheme: webMercatorTilingScheme,
            dataProvider: getDataProvider(m_params),
            concurrentDecoderServiceName: VECTOR_TILE_DECODER_SERVICE_TYPE,
            decoder: m_params.decoder,
            concurrentDecoderScriptUrl: m_params.concurrentDecoderScriptUrl,
            copyrightInfo: m_params.copyrightInfo,
            copyrightProvider: m_params.copyrightProvider,
            // tslint:disable-next-line: deprecation
            minZoomLevel: m_params.minZoomLevel,
            // tslint:disable-next-line: deprecation
            maxZoomLevel: m_params.maxZoomLevel,
            minDataLevel: getOptionValue(m_params.minDataLevel, 1),
            maxDataLevel: getOptionValue(m_params.maxDataLevel, 17),
            minDisplayLevel: m_params.minDisplayLevel,
            maxDisplayLevel: m_params.maxDisplayLevel,
            storageLevelOffset: getOptionValue(m_params.storageLevelOffset, -1)
        });

        this.cacheable = true;
        this.addGroundPlane =
            m_params.addGroundPlane === undefined || m_params.addGroundPlane === true;

        this.m_decoderOptions = {
            showMissingTechniques: this.m_params.showMissingTechniques === true,
            gatherFeatureAttributes: this.m_params.gatherFeatureAttributes === true,
            skipShortLabels: this.m_params.skipShortLabels,
            storageLevelOffset: getOptionValue(m_params.storageLevelOffset, -1),
            enableElevationOverlay: this.m_params.enableElevationOverlay === true
        };

        this.maxGeometryHeight = getOptionValue(
            m_params.maxGeometryHeight,
            EarthConstants.MAX_BUILDING_HEIGHT
        );
    }

    /** @override */
    async connect() {
        try {
            await super.connect();
        } catch (error) {
            if (
                WorkerServiceProtocol.isUnknownServiceError(error) &&
                !missingVectorTileDecoderServiceInfoEmitted
            ) {
                logger.info(
                    "Unable to create decoder service in worker. Use " +
                        " 'VectorTileDecoderService.start();' in decoder script."
                );
                missingVectorTileDecoderServiceInfoEmitted = true;
            }
            throw error;
        }
        this.configureDecoder(undefined, undefined, undefined, this.m_decoderOptions);
    }

    /** @override */
    shouldPreloadTiles(): boolean {
        return true;
    }

    /** @override */
    setLanguages(languages?: string[]): void {
        if (languages !== undefined) {
            this.configureDecoder(undefined, undefined, languages, undefined);
        }
    }

    /** @override */
    get storageLevelOffset() {
        return super.storageLevelOffset;
    }

    /** @override */
    set storageLevelOffset(levelOffset: number) {
        super.storageLevelOffset = levelOffset;
        this.m_decoderOptions.storageLevelOffset = this.storageLevelOffset;
        this.configureDecoder(undefined, undefined, undefined, {
            storageLevelOffset: this.storageLevelOffset
        });
    }

    /** @override */
    setEnableElevationOverlay(enable: boolean) {
        if (this.m_decoderOptions.enableElevationOverlay !== enable) {
            this.m_decoderOptions.enableElevationOverlay = enable;
            this.configureDecoder(undefined, undefined, undefined, {
                enableElevationOverlay: enable
            });
        }
    }

    private configureDecoder(
        styleSet?: StyleSet,
        definitions?: Definitions,
        languages?: string[],
        options?: OptionsMap
    ) {
        this.clearCache();
        this.decoder.configure(styleSet, definitions, languages, options);
        this.mapView.markTilesDirty(this);
    }
}
