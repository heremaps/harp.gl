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
    Configuration,
    getIndex,
    getPartitions,
    Index,
    Layer,
    LayerVersions,
    Partition,
    Partitions
} from "@here/datastore-api/lib/api-v1";
import { DownloadRequestInit, DownloadResponse } from "@here/fetch";
import { TileKey } from "@here/geoutils/lib/tiling/TileKey";
import { LRUCache } from "@here/lrucache";
import { AggregatedDownloadResponse, Error204Response, IndexMap } from "../CatalogClientCommon";
import { DataStoreRequestBuilder } from "../DataStoreRequestBuilder";

/**
 * A convenience class that describes a layer in a catalog including its version.
 */
export interface Catalog1Layer extends Layer {
    /**
     * The DataStore API version this `CatalogLayer` supports.
     */
    apiVersion: 1;

    /**
     * The version of this layer.
     */
    version: number;

    /**
     * Asynchronously fetches a tile from this layer.
     *
     * Note: If the tile doesn't exist in the layer, a successful response with a `204` status code
     * is returned.
     *
     * @example
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
     * @returns A promise of the http response that contains the payload of the requested tile.
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
}

/**
 * The `CatalogClient` class is the main class to interact with a DataStore catalog.
 * Use `DataStoreClient` to obtain instances of this class.
 *
 * @see `DataStoreClient`
 */
export class Catalog1Client {
    private static toUrlString(layer: Catalog1Layer, tileKey: TileKey): string {
        switch (layer.partitioning) {
            case "heretile":
                return tileKey.toHereTile();
            case "quadtree":
                return tileKey.level === 0 ? "-" : tileKey.toQuadKey();
            default:
                throw new Error("Unknown partitioning scheme " + layer.partitioning);
        }
    }

    private static subkeyAddFunction(
        layer: Catalog1Layer
    ): (tileKey: TileKey, sub: string) => TileKey {
        switch (layer.partitioning) {
            case "heretile":
                return (tilekey: TileKey, sub: string) => {
                    return tilekey.addedSubHereTile(sub);
                };
            case "quadtree":
                return (tilekey: TileKey, sub: string) => {
                    return tilekey.addedSubKey(sub);
                };
            default:
                throw new Error("Unknown partitioning scheme " + layer.partitioning);
        }
    }

    private static toTileKeyFunction(layer: Catalog1Layer): (key: string) => TileKey {
        switch (layer.partitioning) {
            case "heretile":
                return (key: string) => TileKey.fromHereTile(key);
            case "quadtree":
                return (key: string) => TileKey.fromQuadKey(key);
            default:
                throw new Error("Unknown partitioning scheme " + layer.partitioning);
        }
    }

    /**
     * The DataStore API version this `CatalogClient` supports.
     */
    readonly apiVersion: 1 = 1;

    /**
     * The layers this catalog contains. You can also use [[getLayer]] as a convenience function to
     * obtain layers.
     */
    readonly layers = new Map<string, Catalog1Layer>();
    private m_indexCache = new LRUCache<string, IndexMap>(64);
    private m_partitionIndexCache = new LRUCache<string, Partitions>(4);
    private readonly m_indexDepth = 4;

    /**
     * Constructs a new `CatalogClient`. Never call directly, use `DataStoreClient` to obtain
     * instances of `CatalogClient`.
     *
     * @param requestBuilder The request builder to use for requests.
     * @param configuration The configuration of this catalog.
     * @param layerVersions The layer versions of this catalog.
     * @private
     */
    constructor(
        readonly requestBuilder: DataStoreRequestBuilder,
        readonly configuration: Configuration,
        readonly layerVersions: LayerVersions
    ) {
        for (const layerConfig of configuration.layers) {
            this.layers.set(layerConfig.name, layerConfig as Catalog1Layer);
        }
        for (const layerVersion of layerVersions.layerVersions) {
            const layer = this.layers.get(layerVersion.layer);
            if (layer === undefined) {
                // server sent a layer version for an unknown layer. This might be if there's
                // a race between config and layerVersions. Ignore the new layer.
                continue;
            }
            layer.version = layerVersion.version;
            if (layer.dataUrl === undefined) {
                layer.dataUrl = requestBuilder.baseUrl;
            }
        }

        // now make sure that all layers had indeed a version in the layerVersion,
        // otherwise, delete invalid layer
        this.layers.forEach(layer => {
            if (layer.version === undefined) {
                this.layers.delete(layer.name);
            } else {
                // add the getTile and getPartition methods
                layer.getTile = (
                    tileKey: TileKey,
                    tileRequestInit?: DownloadRequestInit | undefined
                ) => this.getTile(layer, tileKey, tileRequestInit);
                layer.getPartition = (name: string, partitionRequestInit?: DownloadRequestInit) =>
                    this.getPartition(layer, name, partitionRequestInit);
                layer.setDataProxy = (url: string) => this.setDataProxy(layer, url);
                layer.apiVersion = 1;
                layer.getIndex = (rootKey: TileKey) => this.getIndex(layer, rootKey);
            }
        });
    }

    /**
     * Convenience function to obtain a layer object from this catalog.
     *
     * Throws an Error if the layer does not exist in this catalog.
     *
     * @param layerName The name of the layer to look for.
     * @returns The layer object.
     */
    getLayer(layerName: string): Catalog1Layer {
        const layer = this.findLayer(layerName);
        if (layer === undefined) {
            throw new Error(`Layer '${layerName}' not found in catalog`);
        }
        return layer;
    }

    /**
     * Convenience function to obtain a layer object from this catalog.
     *
     * @param layerName The name of the layer to look for.
     * @returns Either the layer object or `undefined` if the layer is not part of this catalog.
     */
    findLayer(layerName: string): Catalog1Layer | undefined {
        return this.layers.get(layerName);
    }

    /**
     * Asynchronously fetches a tile from this catalog.
     *
     * Note: If the tile doesn't exist in the catalog, a successful response with a `204` status
     * code is returned.
     *
     * @example
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
        layer: Catalog1Layer,
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
     * The result of this operation is the tile at the given `tileKey` or the closest ancestor that
     * contains data.
     *
     * @param layer The layer in which the tile resides.
     * @param tileKey The tile key of the tile.
     * @param tileRequestInit Optional request options to be passed to fetch when downloading a
     * tile.
     * @returns A promise of the HTTP response that contains the payload of the requested tile.
     */
    async getAggregatedTile(
        layer: Catalog1Layer,
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
     * @returns A promise of the HTTP response that contains the payload of the requested partition.
     */
    async getPartition(
        layer: Catalog1Layer,
        name: string,
        partitionRequestInit?: DownloadRequestInit
    ): Promise<DownloadResponse> {
        const partitions = await this.getPartitionIndex(layer);
        const partition = partitions.partitions.find(element => {
            return element.partition === name;
        });
        if (partition === undefined) {
            throw new Error("Unknown partition: " + name + " in layer " + layer.name);
        }

        const url = this.partitionUrl(layer, partition);
        return this.requestBuilder.downloadData(url, partitionRequestInit);
    }

    /**
     * Asynchronously gets a partition index.
     *
     * @param layer The layer for which to fetch the index.
     * @returns A promise to the partition's index.
     */
    async getPartitionIndex(layer: Catalog1Layer): Promise<Partitions> {
        const cachedIndex = this.m_partitionIndexCache.get(layer.name);
        if (cachedIndex !== undefined) {
            return cachedIndex;
        }

        const partitionIndex = await this.downloadPartitionIndex(layer);
        this.m_partitionIndexCache.set(layer.name, partitionIndex);
        return partitionIndex;
    }

    /**
     * Asynchronously gets a tile index.
     *
     * @param layer The layer for which to fetch the index for.
     * @param rootKey The root tile key of the returned index.
     * @returns A promise to the index object parsed as a map.
     */
    async getIndex(layer: Catalog1Layer, rootKey: TileKey): Promise<IndexMap> {
        const cachedIndex = this.findCachedIndex(layer, rootKey);
        if (cachedIndex !== undefined) {
            return cachedIndex;
        }

        return this.downloadIndex(layer, rootKey);
    }

    setDataProxy(layer: Catalog1Layer, proxyUrl: string): void {
        layer.dataUrl = proxyUrl;
    }

    private async downloadPartitionIndex(layer: Catalog1Layer): Promise<Partitions> {
        return getPartitions(this.requestBuilder, { version: layer.version, layer: [layer.name] });
    }

    // finds any index that contains the given tile key
    private async getIndexFor(layer: Catalog1Layer, tileKey: TileKey): Promise<IndexMap> {
        for (let depth = this.m_indexDepth; depth >= 0; --depth) {
            const cachedIndex = this.findCachedIndex(layer, tileKey.changedLevelBy(-depth));
            if (cachedIndex !== undefined) {
                return cachedIndex;
            }
        }

        const index = await this.downloadIndex(layer, tileKey.changedLevelBy(-this.m_indexDepth));
        return index;
    }

    // gets the data tag for the given tile
    private async getDataTag(layer: Catalog1Layer, tileKey: TileKey): Promise<string | undefined> {
        const index = await this.getIndexFor(layer, tileKey);
        return index.get(tileKey.mortonCode());
    }

    // finds a cached index for the given tile
    private findCachedIndex(layer: Catalog1Layer, rootKey: TileKey): IndexMap | undefined {
        const cacheKey = layer.name + "/" + rootKey.toHereTile();
        return this.m_indexCache.get(cacheKey);
    }

    private cacheIndex(cacheKey: string, index: IndexMap): void {
        this.m_indexCache.set(cacheKey, index);
    }

    private parseIndex(layer: Catalog1Layer, indexRootKey: TileKey, dsIndex: Index): IndexMap {
        const subkeyAddFunction = Catalog1Client.subkeyAddFunction(layer);
        const toTileKeyFunction = Catalog1Client.toTileKeyFunction(layer);

        const subQuads = new Map<number, string>();

        if (dsIndex.subQuads === undefined) {
            return subQuads;
        }

        for (const sub of dsIndex.subQuads) {
            const subTileKey: TileKey = subkeyAddFunction(indexRootKey, sub.subQuadKey);
            subQuads.set(subTileKey.mortonCode(), sub.dataHandle);
        }

        for (const parent of dsIndex.parentQuads) {
            const parentTileKey = toTileKeyFunction(parent.partition);
            subQuads.set(parentTileKey.mortonCode(), parent.dataHandle);
        }

        return subQuads;
    }

    // downloads and caches the index
    private async downloadIndex(layer: Catalog1Layer, indexRootKey: TileKey): Promise<IndexMap> {
        const cacheKey = layer.name + "/" + indexRootKey.toHereTile();

        const dsIndex = await getIndex(this.requestBuilder, {
            version: layer.version,
            layer: layer.name,
            quadKey: Catalog1Client.toUrlString(layer, indexRootKey),
            depth: this.m_indexDepth
        });

        // check the cache again in case of parallel requests
        const cachedIndex = this.m_indexCache.get(cacheKey);
        if (cachedIndex !== undefined) {
            return cachedIndex;
        }

        const index = this.parseIndex(layer, indexRootKey, dsIndex);
        this.cacheIndex(cacheKey, index);
        return index;
    }

    private downloadTile(
        layer: Catalog1Layer,
        dataHandle: string,
        requestInit?: DownloadRequestInit
    ): Promise<DownloadResponse> {
        const url = this.dataUrl(layer, dataHandle);
        return this.requestBuilder.downloadData(url, requestInit);
    }

    private dataUrl(layer: Catalog1Layer, dataHandle: string): string {
        return layer.dataUrl + dataHandle;
    }

    private partitionUrl(layer: Catalog1Layer, partition: Partition): string {
        return (layer.dataUrl === undefined ? "" : layer.dataUrl) + partition.dataHandle;
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
