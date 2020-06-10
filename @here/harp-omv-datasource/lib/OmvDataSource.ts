/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AttributeMap,
    Definitions,
    GeometryType,
    ITileDecoder,
    OptionsMap,
    StyleSet,
    WorkerServiceProtocol
} from "@here/harp-datasource-protocol";
import { EarthConstants, TileKey, webMercatorTilingScheme } from "@here/harp-geoutils";
import { LineGroup } from "@here/harp-lines";
import { CopyrightInfo, CopyrightProvider, DataSourceOptions } from "@here/harp-mapview";
import {
    DataProvider,
    TileDataSource,
    TileDataSourceOptions,
    TileFactory
} from "@here/harp-mapview-decoder";
import { getOptionValue, LoggerManager } from "@here/harp-utils";
import {
    FeatureModifierId,
    OmvDecoderOptions,
    OmvFeatureFilterDescription,
    OMV_TILE_DECODER_SERVICE_TYPE
} from "./OmvDecoderDefs";
import {
    APIFormat,
    AuthenticationMethod,
    OmvRestClient,
    OmvRestClientParameters
} from "./OmvRestClient";
import { OmvTile } from "./OmvTile";

const logger = LoggerManager.instance.create("OmvDataSource");

export interface LinesGeometry {
    type: GeometryType;
    lines: LineGroup;
    technique: number;

    /**
     * Optional array of objects. It can be used to pass user data from the geometry to the mesh.
     */
    objInfos?: AttributeMap[];

    /**
     * Optional list of feature start indices. The indices point into the index attribute.
     */
    featureStarts?: number[];
}

export interface OmvTileFactory {
    /** Create an instance of [[OmvTile]] or a subclass. */
    createTile(dataSource: OmvDataSource, tileKey: TileKey): OmvTile;
}

export interface OmvDataSourceParameters extends DataSourceOptions {
    /**
     * If set to `true`, features that have no technique in the theme will be printed to the console
     * (can be excessive!).
     */
    showMissingTechniques?: boolean;

    /**
     * @deprecated Tile info is not decoded anymore. The same information can be generated
     * implementing a [[IGeometryProcessor]] and using [[OmvProtobufDataAdapter]] to decode OMV
     * data.
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
     * @deprecated Tile info is not decoded anymore. The same information can be generated
     * implementing a [[IGeometryProcessor]] and using [[OmvProtobufDataAdapter]] to decode OMV
     * data.
     */
    gatherRoadSegments?: boolean;

    /**
     * If not set to `false`, very short text labels will be skipped during decoding based on a
     * heuristic.
     */
    skipShortLabels?: boolean;

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
     * Identifier used to choose [[OmvFeatureModifier]]s to be applied.
     *
     * If left `undefined` at least [[OmvGenericFeatureModifier]] will be applied.
     * The list of feature modifiers may be extended internally by some data source options
     * such as [[politicalView]] which adds [[OmvPoliticalViewFeatureModifier]].
     *
     * @note This parameter gets applied to the decoder used in the [[OmvDataSource]] which might
     * be shared between various [[OmvDataSource]]s.
     */
    featureModifierId?: FeatureModifierId;

    /**
     * Expresses specific country point of view that is used when rendering disputed features,
     * like borders, names, etc. If undefined "defacto" or most widely accepted political view
     * will be presented.
     *
     * @see featureModifiers
     */
    politicalView?: string;

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
     * Maximum geometry height above groud level this `OmvDataSource` can produce.
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
 * A helper function to retrieve the [[DataProvider]] from the [[OmvDataSource]]s parameters.
 *
 * @param params - The parameters passed into the OmvDataSource.
 */
function getDataProvider(params: OmvWithRestClientParams | OmvWithCustomDataProvider) {
    if ((params as OmvWithCustomDataProvider).dataProvider) {
        return (params as OmvWithCustomDataProvider).dataProvider;
    } else if (
        (params as OmvWithRestClientParams).baseUrl ||
        (params as OmvWithRestClientParams).url
    ) {
        return new OmvRestClient(params as OmvRestClientParameters);
    } else {
        throw new Error("OmvDataSource: missing url, baseUrl or dataProvider params");
    }
}

export type OmvWithRestClientParams = OmvRestClientParameters & OmvDataSourceParameters;
export type OmvWithCustomDataProvider = OmvDataSourceParameters & { dataProvider: DataProvider };

let missingOmvDecoderServiceInfoEmitted: boolean = false;

/**
 * The default vector tile service.
 */
const hereVectorTileBaseUrl = "https://vector.hereapi.com/v2/vectortiles/base/mc";

/**
 * Default options for the HERE Vector Tile service.
 */
const hereVectoTileDefaultOptions: OmvWithRestClientParams = {
    baseUrl: hereVectorTileBaseUrl,
    apiFormat: APIFormat.XYZOMV,
    styleSetName: "tilezen",
    authenticationMethod: {
        method: AuthenticationMethod.QueryString,
        name: "apikey"
    },
    copyrightInfo: [
        {
            id: "here.com",
            year: new Date().getFullYear(),
            label: "HERE",
            link: "https://legal.here.com/terms"
        }
    ]
};

const defaultOptions = new Map<string, OmvWithRestClientParams>([
    [hereVectorTileBaseUrl, hereVectoTileDefaultOptions]
]);

/**
 * Tests if the given object has custom data provider.
 * @param object -
 */
function hasCustomDataProvider(
    object: Partial<OmvWithCustomDataProvider>
): object is OmvWithCustomDataProvider {
    return object.dataProvider !== undefined;
}

/**
 * Add service specific default values.
 *
 * @param params - The configuration settings of the data source.
 */
function completeDataSourceParameters(
    params: OmvWithRestClientParams | OmvWithCustomDataProvider
): TileDataSourceOptions {
    if (!hasCustomDataProvider(params) && params.url === undefined) {
        const baseUrl = params.baseUrl ?? hereVectorTileBaseUrl;

        const completedParams = {
            ...defaultOptions.get(baseUrl),
            ...params
        };

        return {
            ...completedParams,
            tilingScheme: webMercatorTilingScheme,
            dataProvider: new OmvRestClient(completedParams)
        };
    }

    return {
        ...params,
        tilingScheme: webMercatorTilingScheme,
        dataProvider: getDataProvider(params)
    };
}

export class OmvDataSource extends TileDataSource<OmvTile> {
    private readonly m_decoderOptions: OmvDecoderOptions;

    constructor(private m_params: OmvWithRestClientParams | OmvWithCustomDataProvider) {
        super(m_params.tileFactory || new TileFactory(OmvTile), {
            styleSetName: m_params.styleSetName ?? "omv",
            concurrentDecoderServiceName: OMV_TILE_DECODER_SERVICE_TYPE,
            minDataLevel: m_params.minDataLevel ?? 1,
            maxDataLevel: m_params.maxDataLevel ?? 17,
            storageLevelOffset: m_params.storageLevelOffset ?? -1,
            ...completeDataSourceParameters(m_params)
        });

        this.cacheable = true;
        this.addGroundPlane =
            m_params.addGroundPlane === undefined || m_params.addGroundPlane === true;

        this.m_decoderOptions = {
            showMissingTechniques: this.m_params.showMissingTechniques === true,
            filterDescription: this.m_params.filterDescr,
            gatherFeatureAttributes: this.m_params.gatherFeatureAttributes === true,
            featureModifiers: this.m_params.featureModifierId
                ? [this.m_params.featureModifierId]
                : undefined,
            politicalView: this.m_params.politicalView,
            skipShortLabels: this.m_params.skipShortLabels,
            storageLevelOffset: m_params.storageLevelOffset ?? -1,
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
                !missingOmvDecoderServiceInfoEmitted
            ) {
                logger.info(
                    "Unable to create decoder service in worker. Use " +
                        " 'OmvTileDecoderService.start();' in decoder script."
                );
                missingOmvDecoderServiceInfoEmitted = true;
            }
            throw error;
        }
        this.configureDecoder(undefined, undefined, undefined, this.m_decoderOptions);
    }

    /**
     * Remove the current data filter.
     * Will be applied to the decoder, which might be shared with other omv datasources.
     */
    removeDataFilter(): void {
        this.configureDecoder(undefined, undefined, undefined, {
            filterDescription: null
        });
    }

    /**
     * Set a new data filter. Can also be done during the creation of an [[OmvDataSource]].
     * Will be applied to the decoder, which might be shared with other omv datasources.
     *
     * @param filterDescription - Data filter description created with
     * [[OmvFeatureFilterDescriptionBuilder]].
     */
    setDataFilter(filterDescription: OmvFeatureFilterDescription): void {
        this.m_decoderOptions.filterDescription =
            filterDescription !== null ? filterDescription : undefined;

        this.configureDecoder(undefined, undefined, undefined, {
            filterDescription,
            featureModifiers: this.m_decoderOptions.featureModifiers,
            politicalView: this.m_decoderOptions.politicalView
        });
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
    setPoliticalView(politicalView?: string): void {
        // Just in case users mess with letters' casing.
        politicalView = politicalView?.toLowerCase();
        if (this.m_decoderOptions.politicalView !== politicalView) {
            this.m_decoderOptions.politicalView = politicalView;
            this.configureDecoder(undefined, undefined, undefined, {
                filterDescription: this.m_decoderOptions.filterDescription,
                featureModifiers: this.m_decoderOptions.featureModifiers,
                politicalView: politicalView !== undefined ? politicalView : ""
            });
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
