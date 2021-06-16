/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    DecodedTile,
    DecoderOptions,
    GeometryKind,
    IndexedTechnique,
    OptionsMap,
    ValueMap
} from "@here/harp-datasource-protocol";
import { MapEnv, StyleSetEvaluator } from "@here/harp-datasource-protocol/index-decoder";
import { AttrEvaluationContext } from "@here/harp-datasource-protocol/lib/TechniqueAttr";
import { Projection, TileKey } from "@here/harp-geoutils";
import {
    ThemedTileDecoder,
    TileDecoderService,
    WorkerServiceManager
} from "@here/harp-mapview-decoder/index-worker";
import { assert, LoggerManager, PerformanceTimer } from "@here/harp-utils";
import * as THREE from "three";

import { GeoJsonDataAdapter } from "./adapters/geojson/GeoJsonDataAdapter";
import { GeoJsonVtDataAdapter } from "./adapters/geojson-vt/GeoJsonVtDataAdapter";
import { OmvDataAdapter } from "./adapters/omv/OmvDataAdapter";
import { DataAdapter } from "./DataAdapter";
import { DecodeInfo } from "./DecodeInfo";
import { IGeometryProcessor, ILineGeometry, IPolygonGeometry } from "./IGeometryProcessor";
import { OmvFeatureFilter } from "./OmvDataFilter";
import { OmvDecoderOptions, VECTOR_TILE_DECODER_SERVICE_TYPE } from "./OmvDecoderDefs";
import { VectorTileDataEmitter, VectorTileDataEmitterOptions } from "./VectorTileDataEmitter";

const logger = LoggerManager.instance.create("VectorTileDecoder", { enabled: false });

/**
 * Options for VectorTileDataProcessor, @see {@link OmvDecoderOptions}.
 * @internal
 */
export interface VectorTileDataProcessorOptions extends VectorTileDataEmitterOptions {
    storageLevelOffset?: number;
    showMissingTechniques?: boolean;
}

/**
 * Geometry processor for vector tiles.
 * @internal
 */
export class VectorTileDataProcessor implements IGeometryProcessor {
    private m_decodedTileEmitter: VectorTileDataEmitter | undefined;

    constructor(
        private readonly m_tileKey: TileKey,
        private readonly m_projection: Projection,
        private readonly m_styleSetEvaluator: StyleSetEvaluator,
        private readonly m_dataAdapter: DataAdapter,
        private readonly m_options: VectorTileDataProcessorOptions = {},
        private readonly m_dataFilter?: OmvFeatureFilter
    ) {
        m_options.storageLevelOffset = m_options.storageLevelOffset ?? 0;
        m_options.showMissingTechniques = m_options.showMissingTechniques ?? false;
    }

    /**
     * Decodes the given tile data.
     *
     * @param data - The tile data to decode.
     * @returns A [[DecodedTile]]
     */
    getDecodedTile(data: ArrayBufferLike | {}): DecodedTile {
        this.m_styleSetEvaluator.resetTechniques();

        const decodeInfo = new DecodeInfo(
            this.m_projection,
            this.m_tileKey,
            this.m_options.storageLevelOffset!
        );

        this.m_decodedTileEmitter = new VectorTileDataEmitter(
            decodeInfo,
            this.m_styleSetEvaluator,
            this.m_options
        );

        this.m_dataAdapter.process(data, decodeInfo, this);
        return this.m_decodedTileEmitter.getDecodedTile();
    }

    /** @override */
    processPointFeature(
        layer: string,
        extents: number,
        geometry: THREE.Vector3[],
        properties: ValueMap,
        featureId: string | number | undefined
    ): void {
        assert(this.m_decodedTileEmitter !== undefined);
        this.processFeature(
            layer,
            extents,
            geometry,
            "point",
            properties,
            featureId,
            this.m_decodedTileEmitter!.processPointFeature,
            GeometryKind.Label
        );
    }

    /** @override */
    processLineFeature(
        layer: string,
        extents: number,
        geometry: ILineGeometry[],
        properties: ValueMap,
        featureId: string | number | undefined
    ): void {
        assert(this.m_decodedTileEmitter !== undefined);
        this.processFeature(
            layer,
            extents,
            geometry,
            "line",
            properties,
            featureId,
            this.m_decodedTileEmitter!.processLineFeature,
            GeometryKind.Line
        );
    }

    /** @override */
    processPolygonFeature(
        layer: string,
        extents: number,
        geometry: IPolygonGeometry[],
        properties: ValueMap,
        featureId: string | number | undefined
    ): void {
        assert(this.m_decodedTileEmitter !== undefined);
        this.processFeature(
            layer,
            extents,
            geometry,
            "polygon",
            properties,
            featureId,
            this.m_decodedTileEmitter!.processPolygonFeature,
            GeometryKind.Area
        );
    }

    private processFeature(
        layer: string,
        extents: number,
        geometry: THREE.Vector3[] | ILineGeometry[] | IPolygonGeometry[],
        geometryType: string,
        properties: ValueMap,
        featureId: string | number | undefined,
        emitterFunc: (...args: any[]) => void,
        geometryKind: GeometryKind
    ) {
        const env = this.createMapEnv(properties, featureId, layer, geometryType);
        const techniques = this.applyKindFilter(
            this.m_styleSetEvaluator.getMatchingTechniques(env, layer, geometryType),
            geometryKind
        );

        if (techniques.length === 0) {
            if (this.m_options.showMissingTechniques) {
                logger.log(
                    "VectorTileDataProcessor#processFeature: no techniques for object:",
                    JSON.stringify(env.unmap())
                );
            }
            return;
        }
        const context: AttrEvaluationContext = {
            env,
            cachedExprResults: new Map()
        };

        if (this.m_decodedTileEmitter) {
            emitterFunc.apply(this.m_decodedTileEmitter, [
                layer,
                extents,
                geometry,
                context,
                techniques
            ]);
        }
    }

    private createMapEnv(
        properties: ValueMap,
        featureId: string | number | undefined,
        layer: string,
        geometryType: string
    ): MapEnv {
        const level = this.m_tileKey.level;
        return new MapEnv({
            $layer: layer,
            $id: featureId ?? null,
            $level: level,
            $zoom: Math.max(0, level - this.m_options.storageLevelOffset!),
            $geometryType: geometryType,
            ...properties
        });
    }

    private applyKindFilter(
        techniques: IndexedTechnique[],
        defaultKind: GeometryKind
    ): IndexedTechnique[] {
        if (this.m_dataFilter !== undefined && this.m_dataFilter.hasKindFilter) {
            techniques = techniques.filter(technique => {
                const kind =
                    technique.kind === undefined ? defaultKind : (technique.kind as GeometryKind);
                return this.m_dataFilter!.wantsKind(kind);
            });
        }
        return techniques;
    }
}

/**
 * The vector tile decoder.
 */
export class VectorTileDecoder extends ThemedTileDecoder {
    private m_featureFilter?: OmvFeatureFilter;
    private readonly m_roundUpCoordinatesIfNeeded: boolean = false;
    private m_dataAdapter?: DataAdapter;
    private m_options: { map: OptionsMap; changed: boolean } = { map: {}, changed: false };
    private readonly m_defaultDataAdapters: DataAdapter[] = [];

    constructor() {
        super();
        this.m_defaultDataAdapters.push(
            new OmvDataAdapter(),
            new GeoJsonVtDataAdapter(),
            new GeoJsonDataAdapter()
        );
    }

    /** @override */
    connect(): Promise<void> {
        return Promise.resolve();
    }

    /** @override */
    decodeThemedTile(
        data: ArrayBufferLike | {},
        tileKey: TileKey,
        styleSetEvaluator: StyleSetEvaluator,
        projection: Projection
    ): Promise<DecodedTile> {
        const startTime = PerformanceTimer.now();
        if (!this.m_dataAdapter) {
            this.m_dataAdapter = this.getDataAdapter(data);
            if (!this.m_dataAdapter) {
                return Promise.reject(new Error("Unsupported data format."));
            }
        }
        const dataAdapter = this.m_dataAdapter!;
        assert(dataAdapter.canProcess(data));
        if (this.m_options.changed) {
            if (dataAdapter instanceof OmvDataAdapter) {
                const omvOptions = this.m_options.map as OmvDecoderOptions;
                dataAdapter.configure(omvOptions, styleSetEvaluator);
                this.m_featureFilter = dataAdapter.dataFilter;
            }
            this.m_options.changed = false;
        }

        const decoder = new VectorTileDataProcessor(
            tileKey,
            projection,
            styleSetEvaluator,
            dataAdapter,
            this.m_options.map as VectorTileDataProcessorOptions,
            this.m_featureFilter
        );
        const decodedTile = decoder.getDecodedTile(data);

        decodedTile.decodeTime = PerformanceTimer.now() - startTime;

        return Promise.resolve(decodedTile);
    }

    /** @override */
    configure(options?: DecoderOptions, customOptions?: OptionsMap): void {
        super.configure(options, customOptions);
        this.m_options.map = {
            ...this.m_options.map,
            ...options,
            ...customOptions
        };
        this.m_options.changed = true;
    }

    /**
     * Returns the appropiate data adapter to convert the given data into the format expected by
     * VectorTileDecoder.
     * @note Default adapters are available for GeoJson and OMV formats.
     * Child classes may override this function to support additional formats.
     *
     * @param data - The input data to be coverted.
     * @returns The DataAdapter to convert the data, or undefined if there's no adapter for that
     * data format.
     */
    protected getDataAdapter(data: ArrayBufferLike | {}): DataAdapter | undefined {
        for (const adapter of this.m_defaultDataAdapters) {
            if (adapter.canProcess(data)) {
                return adapter;
            }
        }
        return undefined;
    }
}

/**
 * Vector Tile Decoder Service.
 */
export class VectorTileDecoderService {
    /**
     * Register a vector tile decoder service.
     *
     * @remarks
     * Has to be called during initialization of decoder bundle.
     */
    static start() {
        WorkerServiceManager.getInstance().register({
            serviceType: VECTOR_TILE_DECODER_SERVICE_TYPE,
            factory: (serviceId: string) =>
                TileDecoderService.start(serviceId, new VectorTileDecoder())
        });
    }
}
