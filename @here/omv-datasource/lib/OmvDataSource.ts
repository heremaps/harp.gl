/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

import { GeometryType, ITileDecoder, StyleSet } from "@here/datasource-protocol";
import { TileKey, webMercatorTilingScheme } from "@here/geoutils";
import { Lines } from "@here/lines";
import { DataProvider, TileDataSource, TileFactory } from "@here/mapview-decoder";
import {
    FeatureModifierId,
    OMV_TILE_DECODER_SERVICE_ID,
    OmvDecoderOptions,
    OmvFeatureFilterDescription
} from "./OmvDecoderDefs";
import { OmvRestClient, OmvRestClientParameters } from "./OmvRestClient";
import { OmvTile } from "./OmvTile";

export interface LinesGeometry {
    type: GeometryType;
    lines: Lines;
    renderOrderOffset?: number;
    technique: number;

    /**
     * Optional list of feature IDs. Currently only `Number` is supported, will fail if features
     * have IDs with type `Long`.
     */
    featureIds?: Array<number | undefined>;

    /**
     * Optional list of feature start indices. The indices point into the index attribute.
     */
    featureStarts?: number[];
}

export interface OmvTileFactory {
    /** Create an instance of [[OmvTile]] or a subclass. */
    createTile(dataSource: OmvDataSource, tileKey: TileKey): OmvTile;
}

export interface OmvDataSourceParameters {
    /**
     * The unique name of the [[OmvDataSource]].
     */
    name?: string;

    /**
     * The name of the [[StyleSet]] that this [[OmvDataSource]] should use for decoding.
     *
     *  @default "omv"
     */
    styleSetName?: string;

    /**
     * Custom layer name to be rendered.
     */
    layerName?: string;

    /**
     * Proxy URL to use.
     * @see [[HypeDataProviderOptions]].
     */
    proxyDataUrl?: string;

    /**
     * Version of the catalog to obtain. If not specified, the latest available catalog is fetched.
     * @see [[HypeDataProviderOptions]].
     */
    catalogVersion?: number;

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
     */
    gatherFeatureIds?: boolean;

    /**
     * Gather road segments data from [[OmvData]]. Defaults to `false`.
     */
    gatherRoadSegments?: boolean;

    /**
     * A description for the feature filter that can be safely passed down to the web workers. It
     * has to be generated with the help of the [[OmvFeatureFilterDescriptionBuilder]] (to guarantee
     * correctness). This parameter gets applied to the decoder used in the [[OmvDataSource]]
     * which might be shared between various [[OmvDataSource]]s.
     */
    filterDescr?: OmvFeatureFilterDescription;

    /**
     * Optional, custom factory for [[Tile]] instances created by this [[OmvDataSource]].
     */
    tileFactory?: TileFactory<OmvTile>;

    /**
     * Optional minimum zoom level (storage level) for [[Tile]]s. Default is 1.
     */
    minZoomLevel?: number;

    /**
     * Optional maximum zoom level (storage level) for [[Tile]]s. Default is 14.
     */
    maxZoomLevel?: number;

    /**
     * Identifier used to choose OmvFeatureModifier, if undefined [[OmvGenericFeatureModifier]] is
     * used. This parameter gets applied to the decoder used in the [[OmvDataSource]] which might
     * be shared between various [[OmvDataSource]]s.
     */
    featureModifierId?: FeatureModifierId;
}

/**
 * A helper function to retrieve the [[DataProvider]] from the [[OmvDataSource]]s parameters.
 *
 * @param params The parameters passed into the OmvDataSource.
 */
function getDataProvider(params: OmvWithRestClientParams | OmvWithCustomDataProvider) {
    if ((params as OmvWithCustomDataProvider).dataProvider) {
        return (params as OmvWithCustomDataProvider).dataProvider;
    } else if ((params as OmvWithRestClientParams).baseUrl) {
        return new OmvRestClient(params as OmvRestClientParameters);
    } else {
        throw new Error("OmvDataSource: missing baseUrl or dataProvider params");
    }
}

export type OmvWithRestClientParams = OmvRestClientParameters & OmvDataSourceParameters;
export type OmvWithCustomDataProvider = OmvDataSourceParameters & { dataProvider: DataProvider };

export class OmvDataSource extends TileDataSource<OmvTile> {
    private readonly m_decoderOptions: OmvDecoderOptions;
    private readonly m_minZoomLevelOption: number;
    private readonly m_maxZoomLevelOption: number;

    constructor(private m_params: OmvWithRestClientParams | OmvWithCustomDataProvider) {
        super(m_params.tileFactory || new TileFactory(OmvTile), {
            styleSetName: m_params.styleSetName || "omv",
            name: m_params.name,
            tilingScheme: webMercatorTilingScheme,
            dataProvider: getDataProvider(m_params),
            concurrentDecoderServiceName: OMV_TILE_DECODER_SERVICE_ID,
            decoder: m_params.decoder,
            concurrentDecoderScriptUrl: m_params.concurrentDecoderScriptUrl
        });

        this.cacheable = true;

        this.m_decoderOptions = {
            showMissingTechniques: this.m_params.showMissingTechniques === true,
            filterDescription: this.m_params.filterDescr,
            gatherFeatureIds: this.m_params.gatherFeatureIds === true,
            createTileInfo: this.m_params.createTileInfo === true,
            gatherRoadSegments: this.m_params.gatherRoadSegments === true,
            featureModifierId: this.m_params.featureModifierId
        };

        this.m_minZoomLevelOption =
            this.m_params.minZoomLevel !== undefined ? this.m_params.minZoomLevel : 1;
        this.m_maxZoomLevelOption =
            this.m_params.maxZoomLevel !== undefined ? this.m_params.maxZoomLevel : 14;
    }

    /**
     * Set a theme for the data source instance.
     * @param styleSet The [[Theme]] to be added.
     */
    setStyleSet(styleSet?: StyleSet, languages?: string[]): void {
        if (styleSet === undefined) {
            return;
        }
        this.decoder.configure(styleSet, languages, this.m_decoderOptions);
        this.mapView.markTilesDirty(this);
    }

    /**
     * Remove the current data filter.
     * Will be applied to the decoder, which might be shared with other omv datasources.
     */
    removeDataFilter(): void {
        this.decoder.configure(undefined, undefined, {
            filterDescription: null
        });
        this.mapView.markTilesDirty(this);
    }

    /**
     * Set a new data filter. Can also be done during the creation of an [[OmvDataSource]].
     * Will be applied to the decoder, which might be shared with other omv datasources.
     *
     * @param filterDescription Data filter description created with
     * [[OmvFeatureFilterDescriptionBuilder]].
     */
    setDataFilter(filterDescription: OmvFeatureFilterDescription): void {
        this.m_decoderOptions.filterDescription =
            filterDescription !== null ? filterDescription : undefined;

        this.decoder.configure(undefined, undefined, {
            filterDescription
        });
        this.mapView.markTilesDirty(this);
    }

    shouldPreloadTiles(): boolean {
        return true;
    }

    /**
     * Check if a data source should be rendered or not depending on the zoom level.
     *
     * @param zoomLevel Zoom level.
     * @param tileKey Level of the tile.
     * @returns `true` if the data source should be rendered.
     */
    shouldRender(zoomLevel: number, tileKey: TileKey): boolean {
        if (tileKey.level > this.maxZoomLevel) {
            return false;
        }
        if (tileKey.level === this.maxZoomLevel && zoomLevel >= this.maxZoomLevel) {
            return true;
        }
        return super.shouldRender(zoomLevel, tileKey);
    }

    setLanguages(languages?: string[]): void {
        if (languages !== undefined) {
            this.m_decoder.configure(undefined, languages, undefined);
            this.mapView.markTilesDirty(this);
        }
    }

    get minZoomLevel(): number {
        return this.m_minZoomLevelOption;
    }

    get maxZoomLevel(): number {
        return this.m_maxZoomLevelOption;
    }
}
