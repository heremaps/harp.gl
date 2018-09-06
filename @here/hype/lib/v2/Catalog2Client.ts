/*
 * Copyright (C) 2017-2018 HERE Global B.V. and its affiliate(s).
 * All rights reserved.
 *
 * This software and other materials contain proprietary information
 * controlled by HERE and are protected by applicable copyright legislation.
 * Any use and utilization of this software and other materials and
 * disclosure to any third parties is conditional upon having a separate
 * agreement with HERE for the access, use, utilization or disclosure of this
 * software. In the absence of such agreement, the use of the software is not
 * allowed.
 */

import {
    Catalog,
    getPartitionsUsingGET,
    Index,
    latestVersionUsingGET,
    Layer,
    LayerVersions,
    listVersionsUsingGET,
    Partition,
    Partitions,
    quadTreeIndexUsingGET,
    VersionInfos,
    VersionResponse
} from "@here/datastore-api/lib/api-v2";
import {
    GetSchemaResponse,
    getSchemaUsingGET,
    Variant
} from "@here/datastore-api/lib/ArtifactService";
import { UrlBuilder } from "@here/datastore-api/lib/RequestBuilder";
import { DownloadRequestInit, DownloadResponse } from "@here/fetch";
import { TileKey } from "@here/geoutils/lib/tiling/TileKey";
import { LRUCache } from "@here/lrucache";
import {
    AggregatedDownloadResponse,
    Error204Response,
    ErrorHTTPResponse,
    IndexMap
} from "../CatalogClientCommon";
import { DataStoreRequestBuilder } from "../DataStoreRequestBuilder";
import { HRN } from "../HRN";

/**
 * Types of coverage data
 */
enum CoverageDataType {
    BITMAP = "bitmap",
    SIZEMAP = "sizemap",
    TIMEMAP = "timemap"
}

/**
 * A convenience class that describes a layer in a catalog including its version.
 */
export interface Catalog2Layer extends Layer {
    /**
     * The Data Service API version this `CatalogLayer` supports.
     */
    apiVersion: 2;

    /**
     * The version of this layer.
     */
    version?: number;

    /**
     * Asynchronously fetches a tile from this layer.
     *
     * Note: If the tile doesn't exist in the layer, a successful response with a `204` status code
     * is returned.
     *
     * Example:
     *
     * ```typescript
     * const response = layer.getTile(tileKey);
     * if (!response.ok) {
     *     // a network error happened
     *     console.error("Unable to download tile", response.statusText);
     *     return;
     * }
     * if (response.status === 204) {
     *     // 204 - NO CONTENT, no data exists at the given tile. Do nothing.
     *     return;
     * }
     *
     * // the response is ok and contains data, access it, for example, as arrayBuffer:
     * const payload = await response.arrayBuffer();
     * ```
     *
     * @param tileKey The tile key of the tile.
     * @param tileRequestInit Optional request options to be passed to fetch when downloading a
     * tile.
     * @returns A promise of the HTTP response that contains the payload of the requested tile.
     */
    getTile: (
        tileKey: TileKey,
        tileRequestInit?: DownloadRequestInit | undefined
    ) => Promise<DownloadResponse>;

    /**
     * Asynchronously fetches a partition from this layer.
     *
     * @param name The name of the partition to fetch.
     * @param partitionRequestInit Optional request options to be passed to fetch when downloading a
     * partition.
     * @returns A promise of the http response that contains the payload of the requested partition.
     */
    getPartition: (
        name: string,
        partitionRequestInit?: DownloadRequestInit
    ) => Promise<DownloadResponse>;

    setDataProxy: (url: string) => void;

    /**
     * Asynchronously gets a tile index.
     *
     * @param layer The layer for which to fetch the index for.
     * @param rootKey The root tile key of the returned index.
     * @returns A promise to the index object parsed as a map.
     */
    getIndex: (rootKey: TileKey) => Promise<IndexMap>;

    /**
     * Asynchronously get schema details of this layer.
     *
     * @returns A promise of the http response that contains the payload of the schema details.
     */
    getSchemaDetails: () => Promise<GetSchemaResponse>;

    /**
     * Asynchronously fetches schema of this layer.
     *
     * @param schemaRequestInit Optional request options to be passed to fetch when downloading a
     * schema.
     * @returns A promise of the http response that contains the payload of the requested schema.
     */
    getSchema: (schemaRequestInit?: DownloadRequestInit) => Promise<ArrayBuffer>;

    /**
     * Asynchronously fetches data coverage bitmap of this layer.
     * @param downloadRequestInit Optional request options to be passed to fetch when downloading a
     * coverage map.
     * @returns A promise of the http response that contains the payload of the requested coverage
     * map.
     */
    getDataCoverageBitmap: (downloadRequestInit?: DownloadRequestInit) => Promise<ArrayBuffer>;

    /**
     * Asynchronously fetches data coverage size map of this layer.
     * @param downloadRequestInit Optional request options to be passed to fetch when downloading a
     * coverage map.
     * @returns A promise of the http response that contains the payload of the requested coverage
     * map.
     */
    getDataCoverageSizeMap: (downloadRequestInit?: DownloadRequestInit) => Promise<ArrayBuffer>;

    /**
     * Asynchronously fetches data coverage time map of this layer.
     * @param downloadRequestInit Optional request options to be passed to fetch when downloading a
     * coverage map.
     * @returns A promise of the http response that contains the payload of the requested coverage
     * map.
     */
    getDataCoverageTimeMap: (downloadRequestInit?: DownloadRequestInit) => Promise<ArrayBuffer>;
}

/**
 * Parameters for `CatalogClient` constructor.
 * @private
 */
export interface CatalogClientParams {
    metaDataRequestBuilder: DataStoreRequestBuilder;
    queryRequestBuilder: DataStoreRequestBuilder;
    blobStoreRequestBuilder: DataStoreRequestBuilder;
    volatileBlobRequestBuilder: DataStoreRequestBuilder;
    artifactRequestBuilder: DataStoreRequestBuilder;
    coverageRequestBuilder: DataStoreRequestBuilder;
    configuration: Catalog;
    layerVersions: LayerVersions;
}

/**
 * The `CatalogClient` class is the main class to interact with a DataStore catalog.
 * Use `DataStoreClient` to obtain instances of this class.
 *
 * @see `DataStoreClient`
 */
export class Catalog2Client {
    private static toUrlString(layer: Catalog2Layer, tileKey: TileKey): string {
        switch (layer.partitioningScheme) {
            case "heretile":
                return tileKey.toHereTile();
            default:
                throw new Error("Unknown partitioning scheme " + layer.partitioningScheme);
        }
    }

    private static subkeyAddFunction(
        layer: Catalog2Layer
    ): (tileKey: TileKey, sub: string) => TileKey {
        switch (layer.partitioningScheme) {
            case "heretile":
                return (tilekey: TileKey, sub: string) => {
                    return tilekey.addedSubHereTile(sub);
                };
            default:
                throw new Error("Unknown partitioning scheme " + layer.partitioningScheme);
        }
    }

    private static toTileKeyFunction(layer: Catalog2Layer): (key: string) => TileKey {
        switch (layer.partitioningScheme) {
            case "heretile":
                return (key: string) => TileKey.fromHereTile(key);
            default:
                throw new Error("Unknown partitioning scheme " + layer.partitioningScheme);
        }
    }

    /**
     * The Data Service API version this CatalogClient supports.
     */
    readonly apiVersion: 2 = 2;

    /**
     * The layers this catalog contains. You can also use [[getLayer]] as a convenience function to
     * obtain layers.
     */
    readonly layers = new Map<string, Catalog2Layer>();

    /**
     * The Catalog data contains all meta data describing the catalog.
     */
    readonly catalog: Catalog;

    /**
     * The version of the Catalog
     */
    readonly version: number;

    private readonly metaDataRequestBuilder: DataStoreRequestBuilder;
    private readonly queryRequestBuilder: DataStoreRequestBuilder;
    private readonly blobStoreRequestBuilder: DataStoreRequestBuilder;
    private readonly volatileBlobRequestBuilder: DataStoreRequestBuilder;
    private readonly artifactRequestBuilder: DataStoreRequestBuilder;
    private readonly coverageRequestBuilder: DataStoreRequestBuilder;

    private readonly indexCache = new LRUCache<string, IndexMap>(64);
    private readonly schemeCache = new LRUCache<string, GetSchemaResponse>(64);
    private readonly partitionIndexCache = new LRUCache<string, Partitions>(4);
    private readonly indexDepth = 4;

    /**
     * Constructs a new `CatalogClient`. Never call directly, use `DataStoreClient` to obtain
     * instances of `CatalogClient`.
     *
     * @private
     */
    constructor(params: CatalogClientParams) {
        this.catalog = params.configuration;
        this.metaDataRequestBuilder = params.metaDataRequestBuilder;
        this.queryRequestBuilder = params.queryRequestBuilder;
        this.blobStoreRequestBuilder = params.blobStoreRequestBuilder;
        this.volatileBlobRequestBuilder = params.volatileBlobRequestBuilder;
        this.artifactRequestBuilder = params.artifactRequestBuilder;
        this.coverageRequestBuilder = params.coverageRequestBuilder;

        this.version = params.layerVersions.version;

        const layerVersions = new Map<string, number>(
            params.layerVersions.layerVersions.map(v => [v.layer, v.version] as [string, number])
        );

        for (const layerConfig of params.configuration.layers) {
            const layer = layerConfig as Catalog2Layer;
            layer.apiVersion = 2;
            layer.version = layerVersions.get(layer.id);
            layer.getTile = (tileKey: TileKey, tileRequestInit?: DownloadRequestInit | undefined) =>
                this.getTile(layer, tileKey, tileRequestInit);
            layer.getPartition = (name: string, partitionRequestInit?: DownloadRequestInit) =>
                this.getPartition(layer, name, partitionRequestInit);
            layer.setDataProxy = (url: string) => this.setDataProxy(layer, url);
            layer.getIndex = (rootKey: TileKey) => this.getIndex(layer, rootKey);
            layer.getSchemaDetails = () => this.getSchemaDetails(layer);
            layer.getSchema = (schemaRequestInit?: DownloadRequestInit) =>
                this.getSchema(layer, schemaRequestInit);
            layer.getSchema = (schemaRequestInit?: DownloadRequestInit) =>
                this.getSchema(layer, schemaRequestInit);
            layer.getDataCoverageBitmap = (downloadRequestInit?: DownloadRequestInit) =>
                this.getDataCoverageBitmap(layer, downloadRequestInit);
            layer.getDataCoverageSizeMap = (downloadRequestInit?: DownloadRequestInit) =>
                this.getDataCoverageSizeMap(layer, downloadRequestInit);
            layer.getDataCoverageTimeMap = (downloadRequestInit?: DownloadRequestInit) =>
                this.getDataCoverageTimeMap(layer, downloadRequestInit);

            this.layers.set(layerConfig.id, layer);
        }
    }

    /**
     *
     * @param layer Catalog layer to be used while setting the proxy.
     * @param proxyUrl Provide the proxy URL to be used.
     */
    // tslint:disable-next-line:no-unused-variable
    setDataProxy(layer: Catalog2Layer, proxyUrl: string): void {
        throw new Error("Not implemented");
    }

    /**
     * Asynchronously gets a partition index.
     *
     * @param layer The layer for which to fetch the index.
     * @returns A promise to the partition's index.
     */
    async getPartitionIndex(layer: Catalog2Layer): Promise<Partitions> {
        const cachedIndex = this.partitionIndexCache.get(layer.id);
        if (cachedIndex !== undefined) {
            return cachedIndex;
        }

        const partitionIndex = await this.downloadPartitionIndex(layer);
        this.partitionIndexCache.set(layer.id, partitionIndex);
        return partitionIndex;
    }

    /**
     * Asynchronously gets a tile index.
     *
     * @param layer The layer for which to fetch the index for.
     * @param rootKey The root tile key of the returned index.
     * @returns A promise to the index object parsed as a map.
     */
    async getIndex(layer: Catalog2Layer, rootKey: TileKey): Promise<IndexMap> {
        const cachedIndex = this.findCachedIndex(layer, rootKey);
        if (cachedIndex !== undefined) {
            return cachedIndex;
        }

        return this.downloadIndex(layer, rootKey);
    }

    /**
     * Downloads a URL, appending the credentials that this CatalogClient is using.
     *
     * @param url The URL to download.
     * @param init Optional extra parameters.
     */
    downloadData(url: string, init?: DownloadRequestInit): Promise<DownloadResponse> {
        return this.blobStoreRequestBuilder.downloadData(url, init);
    }

    /**
     * Convenience function to obtain a layer object from this catalog.
     *
     * Throws an Error if the layer does not exist in this catalog.
     *
     * @param layerName The name of the layer to look for.
     * @returns The layer object.
     */
    getLayer(layerName: string): Catalog2Layer {
        const layer = this.findLayer(layerName);
        if (layer === undefined) {
            throw new Error(`Layer '${layerName}' not found in catalog`);
        }
        return layer;
    }

    /**
     * Convenience function to obtain a layer object from this catalog.
     * @deprecated - use [[getLayer]] instead
     *
     * @param layerName The name of the layer to look for.
     * @returns Either the layer object or `undefined` if the layer is not part of this catalog.
     */
    findLayer(layerName: string): Catalog2Layer | undefined {
        return this.layers.get(layerName);
    }

    /**
     * Asynchronously fetches a tile from this catalog.
     *
     * Note: If the tile doesn't exist in the catalog, a successful response with a `204` status
     * code is returned.
     *
     * Example:
     *
     * ```typescript
     * const response = catalogClient.getTile(layer, tileKey);
     * if (!response.ok) {
     *     // a network error happened
     *     console.error("Unable to download tile", response.statusText);
     *     return;
     * }
     * if (response.status === 204) {
     *     // 204 - NO CONTENT, no data exists at the given tile. Do nothing.
     *     return;
     * }
     *
     * // the response is ok and contains data, access it, for example, as arrayBuffer:
     * const payload = await response.arrayBuffer();
     * ```
     *
     * @param layer The layer in which the tile resides.
     * @param tileKey The tile key of the tile.
     * @param tileRequestInit Optional request options to be passed to fetch when downloading a
     * tile.
     * @returns A promise of the HTTP response that contains the payload of the requested tile.
     */
    async getTile(
        layer: Catalog2Layer,
        tileKey: TileKey,
        tileRequestInit?: DownloadRequestInit
    ): Promise<DownloadResponse> {
        const resultSub = await this.getDataTag(layer, tileKey);

        if (resultSub === undefined) {
            return Promise.resolve(new Error204Response());
        }

        return this.downloadTile(layer, resultSub, tileRequestInit);
    }

    /**
     * Asynchronously fetches an aggregated tile from this catalog.
     *
     * The result of this operation is the tile at the given tileKey or the closest ancestor that
     * contains data.
     *
     * @param layer The layer in which the tile resides.
     * @param tileKey The tile key of the tile.
     * @param tileRequestInit Optional request options to be passed to fetch when downloading a
     * tile.
     * @returns A promise of the http response that contains the payload of the requested tile.
     */
    async getAggregatedTile(
        layer: Catalog2Layer,
        tileKey: TileKey,
        tileRequestInit?: DownloadRequestInit
    ): Promise<AggregatedDownloadResponse> {
        const index = await this.getIndexFor(layer, tileKey);

        const resultIdx = this.findAggregatedIndex(index, tileKey);

        if (resultIdx === undefined) {
            return Promise.resolve(new Error204Response());
        }

        const response = (await this.downloadTile(
            layer,
            resultIdx.dataHandle,
            tileRequestInit
        )) as AggregatedDownloadResponse;
        response.tileKey = resultIdx.tileKey;
        return response;
    }

    /**
     * Asynchronously fetches a partition from this catalog.
     *
     * @param layer The layer in which the partition resides.
     * @param name The name of the partition to fetch.
     * @param partitionRequestInit Optional request options to be passed to fetch when downloading a
     * partition.
     * @returns A promise of the http response that contains the payload of the requested partition.
     */
    async getPartition(
        layer: Catalog2Layer,
        name: string,
        partitionRequestInit?: DownloadRequestInit
    ): Promise<DownloadResponse> {
        const partitions = await this.getPartitionIndex(layer);
        const partition = partitions.partitions.find(element => {
            return element.partition === name;
        });
        if (partition === undefined) {
            throw new Error("Unknown partition: " + name + " in layer " + layer.id);
        }

        const url = this.partitionUrl(layer, partition);
        return this.downloadData(url, partitionRequestInit);
    }

    async getSchema(
        layer: Catalog2Layer,
        schemaRequestInit?: DownloadRequestInit
    ): Promise<ArrayBuffer> {
        if (layer.schema === undefined || layer.schema.hrn === undefined) {
            throw new Error(`Required property 'schema.hrn' missing in the layer ${layer}`);
        }

        const schemaDetails = await this.getSchemaDetails(layer);
        const schemaVariant = schemaDetails.variants!.find(
            (variant: Variant) => variant.id === "ds"
        );
        if (schemaVariant === undefined) {
            throw new Error(`URL of the schema bundle is not found: ${schemaDetails}`);
        }
        const schemaUrl = this.artifactRequestBuilder.baseUrl + "/v1" + schemaVariant.url;

        const downloadResponse = await this.downloadData(schemaUrl, schemaRequestInit).catch(() => {
            throw new Error(`Cannot download Schema bundle: ${layer.schema}`);
        });
        let message;
        switch (downloadResponse.status) {
            case 401:
                message = "You are not authorized to view the schema";
                break;
            case 403:
                message = "Accessing the schema is forbidden";
                break;
            case 404:
                message = "The schema was not found";
                break;
            case 500:
                message = "Internal server error";
                break;
        }
        switch (downloadResponse.status) {
            case 200:
                return downloadResponse.arrayBuffer();
            case 401:
            case 403:
            case 404:
            case 500:
            default:
                throw new ErrorHTTPResponse(
                    `Artifact Service error: HTTP ${downloadResponse.status}: ` +
                        `${
                            downloadResponse.statusText !== ""
                                ? downloadResponse.statusText
                                : message
                        }`,
                    downloadResponse
                );
        }
    }

    async getSchemaDetails(layer: Catalog2Layer): Promise<GetSchemaResponse> {
        let cachedScheme = this.findCachedScheme(layer);
        if (cachedScheme !== undefined) {
            return cachedScheme;
        }
        if (layer.schema === undefined || layer.schema.hrn === undefined) {
            throw new Error(`Required property 'schema.hrn' missing in layer ${layer.name}`);
        }

        const schemaDetailsPromise = await getSchemaUsingGET(this.artifactRequestBuilder, {
            schemaHrn: layer.schema.hrn
        }).catch(() => {
            throw new Error(`Cannot get schema details: ${layer.schema!.hrn}`);
        });

        // check the cache again in case of parallel requests
        cachedScheme = this.findCachedScheme(layer);
        if (cachedScheme !== undefined) {
            return cachedScheme;
        }

        const schemeDetails: GetSchemaResponse = await Promise.resolve(schemaDetailsPromise);
        this.cacheScheme(layer, schemeDetails);
        return schemeDetails;
    }

    /**
     * Fetch and return data coverage bitmap for the specified layer and version.
     *
     * @param layer The layer which the bitmap coverage is related to.
     * @param downloadRequestInit Optional request options to be passed to fetch when downloading
     * the coverage map.
     *
     *  @returns A promise with the payload of the requested bitmap.
     */
    async getDataCoverageBitmap(
        layer: Catalog2Layer,
        downloadRequestInit?: DownloadRequestInit
    ): Promise<ArrayBuffer> {
        return this.getDataCoverage(CoverageDataType.BITMAP, layer, downloadRequestInit);
    }

    /**
     * Fetch and return data coverage bitmap for the specified layer and version.
     *
     * @param layer The layer which the bitmap coverage is related to.
     * @param downloadRequestInit Optional request options to be passed to fetch when downloading
     * the coverage map.
     *
     *  @returns A promise with the payload of the requested size map.
     */
    async getDataCoverageSizeMap(
        layer: Catalog2Layer,
        downloadRequestInit?: DownloadRequestInit
    ): Promise<ArrayBuffer> {
        return this.getDataCoverage(CoverageDataType.SIZEMAP, layer, downloadRequestInit);
    }

    /**
     * Fetch and return data coverage time map for the specified layer and version.
     *
     * @param layer The layer which the bitmap coverage is related to.
     * @param downloadRequestInit Optional request options to be passed to fetch when downloading
     * the coverage map.
     *
     *  @returns A promise with the payload of the requested time map.
     */
    async getDataCoverageTimeMap(
        layer: Catalog2Layer,
        downloadRequestInit?: DownloadRequestInit
    ): Promise<ArrayBuffer> {
        return this.getDataCoverage(CoverageDataType.TIMEMAP, layer, downloadRequestInit);
    }

    /**
     * Get the latest version of the catalog.
     *
     * @param startVersion Catalog start version (exclusive). Default is -1. By convention -1
     * indicates the virtual initial version before the first publication which will have version 0.
     * @returns A promise of the http response that contains the payload with latest version.
     */
    async getLatestVersion(startVersion: number = -1): Promise<VersionResponse> {
        const catalogId = HRN.fromString(this.catalog.hrn).data.resource;

        return latestVersionUsingGET(this.metaDataRequestBuilder, {
            catalogId,
            startVersion
        });
    }

    /**
     * Get the information about specific catalog versions. Maximum number of versions to be
     * returned per call is 1000 versions. If range is bigger than 1000 versions 400 Bad Request
     * will be returned.
     *
     * @param startVersion Catalog start version (exclusive). Default is -1. By convention -1
     * indicates the virtual initial version before the first publication which will have version 0.
     * @param endVersion Catalog end version (inclusive). If not defined, then the latest catalog
     * version will be fethced and used.
     * @returns A promise of the http response that contains the payload with versions in requested
     * range.
     */
    async getVersions(startVersion: number = -1, endVersion?: number): Promise<VersionInfos> {
        const catalogId = HRN.fromString(this.catalog.hrn).data.resource;

        if (endVersion === undefined) {
            const latestVersionRS = await this.getLatestVersion(startVersion);
            endVersion = latestVersionRS.version;
        }

        return listVersionsUsingGET(this.metaDataRequestBuilder, {
            catalogId,
            startVersion,
            endVersion
        });
    }

    /**
     * Prepares URL to download coverage data.
     *
     * @param layer The layer which the coverage is related to.
     * @param coverageType The type of the coverage data.
     *
     *  @returns url to the specific coverage service method
     */
    private coverageUrl(layer: Catalog2Layer, coverageType: CoverageDataType): string {
        const path =
            "/datacoverage/v1/catalogs/" +
            this.catalog.hrn +
            "/layers/" +
            layer.id +
            "/" +
            coverageType.toString();

        return this.coverageRequestBuilder.baseUrl + path;
    }

    private async downloadPartitionIndex(layer: Catalog2Layer): Promise<Partitions> {
        if (layer.version === undefined) {
            // layer has no data
            throw new Error("Unable to download partitions for unversioned layer " + layer.id);
        }
        return getPartitionsUsingGET(this.metaDataRequestBuilder, {
            version: layer.version,
            layerId: layer.id,
            catalogId: this.catalog.id
        });
    }

    // finds any index that contains the given tile key
    private async getIndexFor(layer: Catalog2Layer, tileKey: TileKey): Promise<IndexMap> {
        for (let depth = this.indexDepth; depth >= 0; --depth) {
            const currentIndex = this.findCachedIndex(layer, tileKey.changedLevelBy(-depth));
            if (currentIndex !== undefined) {
                return currentIndex;
            }
        }

        const index = await this.downloadIndex(layer, tileKey.changedLevelBy(-this.indexDepth));
        return index;
    }

    /**
     * Fetch and return data coverage of the specified type for the specified layer and version.
     *
     * @param coverageType The type of the coverage data.
     * @param layer The layer which the bitmap coverage is related to.
     * @param downloadRequestInit Optional request options to be passed to fetch when downloading
     * the coverage map.
     *
     *  @returns A promise that contains the payload of the requested time map.
     */
    private async getDataCoverage(
        coverageType: CoverageDataType,
        layer: Catalog2Layer,
        downloadRequestInit?: DownloadRequestInit
    ): Promise<ArrayBuffer> {
        const url = this.coverageUrl(layer, coverageType);
        const urlBuilder = new UrlBuilder(url);
        if (this.version !== undefined) {
            urlBuilder.appendQuery("version", this.version);
        }

        const downloadResponse = await this.coverageRequestBuilder
            .downloadData(urlBuilder.url, downloadRequestInit)
            .catch(reason => {
                throw new Error(`Coverage Service error: ${reason}`);
            });

        let message;
        switch (downloadResponse.status) {
            case 400:
                message = "Bad request, incorrect version type";
                break;
            case 404:
                message = "Requested file does not exist";
                break;
            case 500:
                message = "Internal server error";
                break;
        }

        switch (downloadResponse.status) {
            case 200:
                return downloadResponse.arrayBuffer();
            case 400:
            case 404:
            case 500:
            default:
                throw new ErrorHTTPResponse(
                    `Coverage Service error: HTTP ${downloadResponse.status}: ` +
                        `${
                            downloadResponse.statusText !== ""
                                ? downloadResponse.statusText
                                : message
                        }`,
                    downloadResponse
                );
        }
    }

    // gets the data tag for the given tile
    private async getDataTag(layer: Catalog2Layer, tileKey: TileKey): Promise<string | undefined> {
        // ### temporary hack to bypass missing meta data for volatile layers
        if (layer.layerType === "volatile") {
            return tileKey.toHereTile();
        }

        const index = await this.getIndexFor(layer, tileKey);
        return index.get(tileKey.mortonCode());
    }

    // finds a cached index for the given tile
    private findCachedIndex(layer: Catalog2Layer, rootKey: TileKey): IndexMap | undefined {
        const cacheKey = layer.id + "/" + rootKey.toHereTile();
        return this.indexCache.get(cacheKey);
    }

    private cacheIndex(cacheKey: string, index: IndexMap): void {
        this.indexCache.set(cacheKey, index);
    }

    private cacheScheme(layer: Catalog2Layer, schemeDetails: GetSchemaResponse): void {
        this.schemeCache.set(layer.id, schemeDetails);
    }

    // finds a cached scheme
    private findCachedScheme(layer: Catalog2Layer): GetSchemaResponse | undefined {
        return this.schemeCache.get(layer.id);
    }

    private parseIndex(layer: Catalog2Layer, indexRootKey: TileKey, dsIndex: Index): IndexMap {
        const subkeyAddFunction = Catalog2Client.subkeyAddFunction(layer);
        const toTileKeyFunction = Catalog2Client.toTileKeyFunction(layer);

        const subQuads = new Map<number, string>();

        if (dsIndex.subQuads === undefined) {
            return subQuads;
        }

        for (const sub of dsIndex.subQuads) {
            const subTileKey: TileKey = subkeyAddFunction(indexRootKey, sub.subQuadKey);
            subQuads.set(subTileKey.mortonCode(), sub.dataHandle);
        }

        if (dsIndex.parentQuads !== undefined) {
            for (const parent of dsIndex.parentQuads) {
                const parentTileKey = toTileKeyFunction(parent.partition);
                subQuads.set(parentTileKey.mortonCode(), parent.dataHandle);
            }
        }

        return subQuads;
    }

    // downloads and caches the index
    private async downloadIndex(layer: Catalog2Layer, indexRootKey: TileKey): Promise<IndexMap> {
        if (layer.version === undefined) {
            throw new Error("Unable to download tiles for unversioned layer " + layer.id);
        }

        const cacheKey = layer.id + "/" + indexRootKey.toHereTile();

        const dsIndex = await quadTreeIndexUsingGET(this.queryRequestBuilder, {
            version: layer.version,
            catalogId: this.catalog.id,
            layerId: layer.id,
            quadKey: Catalog2Client.toUrlString(layer, indexRootKey),
            depth: this.indexDepth
        });

        // check the cache again in case of parallel requests
        const cachedIndex = this.indexCache.get(cacheKey);
        if (cachedIndex !== undefined) {
            return cachedIndex;
        }

        const index = this.parseIndex(layer, indexRootKey, dsIndex);
        this.cacheIndex(cacheKey, index);
        return index;
    }

    private downloadTile(
        layer: Catalog2Layer,
        dataHandle: string,
        requestInit?: DownloadRequestInit
    ): Promise<DownloadResponse> {
        const url = this.dataUrl(layer, dataHandle);
        return this.downloadData(url, requestInit);
    }
    private dataUrl(layer: Catalog2Layer, dataHandle: string): string {
        const path =
            "/blobstore/v1/catalogs/" +
            this.catalog.id +
            "/layers/" +
            layer.id +
            "/data/" +
            dataHandle;
        if (layer.layerType === "volatile") {
            return this.volatileBlobRequestBuilder.baseUrl + path;
        }

        return this.blobStoreRequestBuilder.baseUrl + path;
    }

    private partitionUrl(layer: Catalog2Layer, partition: Partition): string {
        if (partition.dataHandle === undefined) {
            // ### dataHandle must not be optional?
            throw new Error("### FIX SPEC");
        }

        return this.dataUrl(layer, partition.dataHandle);
    }

    private findAggregatedIndex(
        index: IndexMap,
        tileKey: TileKey
    ): { dataHandle: string; tileKey: TileKey } | undefined {
        // get the index of the closest parent
        let mortonCode = tileKey.mortonCode();

        for (let level = tileKey.level; level >= 0; --level) {
            const sub = index.get(mortonCode);
            if (sub !== undefined) {
                return { dataHandle: sub, tileKey: TileKey.fromMortonCode(mortonCode) };
            }
            mortonCode = TileKey.parentMortonCode(mortonCode);
        }

        return undefined;
    }
}
