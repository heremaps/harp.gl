/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    DecodedTile,
    Definitions,
    ExtendedTileInfo,
    GeometryKind,
    IndexedTechnique,
    OptionsMap,
    StyleSet,
    TileInfo
} from "@here/harp-datasource-protocol";
import { MapEnv, StyleSetEvaluator } from "@here/harp-datasource-protocol/index-decoder";
import {
    GeoBox,
    OrientedBox3,
    Projection,
    TileKey,
    TilingScheme,
    webMercatorTilingScheme
} from "@here/harp-geoutils";
import {
    ThemedTileDecoder,
    TileDecoderService,
    WorkerServiceManager
} from "@here/harp-mapview-decoder/index-worker";
import { LoggerManager, PerformanceTimer } from "@here/harp-utils";
import * as THREE from "three";

// tslint:disable-next-line:max-line-length
import { AttrEvaluationContext } from "@here/harp-datasource-protocol/lib/TechniqueAttr";
import { IGeometryProcessor, ILineGeometry, IPolygonGeometry } from "./IGeometryProcessor";
import { OmvProtobufDataAdapter } from "./OmvData";
import {
    ComposedDataFilter,
    OmvFeatureFilter,
    OmvFeatureModifier,
    OmvGenericFeatureFilter,
    OmvGenericFeatureModifier
} from "./OmvDataFilter";
import { OmvDecodedTileEmitter } from "./OmvDecodedTileEmitter";
import {
    FeatureModifierId,
    OMV_TILE_DECODER_SERVICE_TYPE,
    OmvDecoderOptions,
    OmvFeatureFilterDescription
} from "./OmvDecoderDefs";
import { OmvTileInfoEmitter } from "./OmvTileInfoEmitter";
import { OmvTomTomFeatureModifier } from "./OmvTomTomFeatureModifier";
import { WorldTileProjectionCookie } from "./OmvUtils";
import { StyleSetDataFilter } from "./StyleSetDataFilter";
import { VTJsonDataAdapter } from "./VTJsonDataAdapter";

const logger = LoggerManager.instance.create("OmvDecoder", { enabled: false });

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

export interface IOmvEmitter {
    processPointFeature(
        layer: string,
        extents: number,
        geometry: THREE.Vector2[],
        context: AttrEvaluationContext,
        techniques: IndexedTechnique[],
        featureId: number | undefined
    ): void;

    processLineFeature(
        layer: string,
        extents: number,
        feature: ILineGeometry[],
        context: AttrEvaluationContext,
        techniques: IndexedTechnique[],
        featureId: number | undefined
    ): void;

    processPolygonFeature(
        layer: string,
        extents: number,
        feature: IPolygonGeometry[],
        context: AttrEvaluationContext,
        techniques: IndexedTechnique[],
        featureId: number | undefined
    ): void;
}

/**
 * The class [[OmvDataAdapter]] prepares protobuf encoded OMV data so they
 * can be processed by [[OmvDecoder]].
 */
export interface OmvDataAdapter {
    /**
     * OmvDataAdapter's id.
     */
    id: string;

    /**
     * Checks if the given data can be processed by this OmvDataAdapter.
     *
     * @param data The raw data to adapt.
     */
    canProcess(data: ArrayBufferLike | {}): boolean;

    /**
     * Process the given raw data.
     *
     * @param data The raw data to process.
     * @param tileKey The TileKey of the enclosing Tile.
     * @param geoBox The GeoBox of the enclosing Tile.
     */
    process(data: ArrayBufferLike | {}, tileKey: TileKey, geoBox: GeoBox): void;
}

export class OmvDecoder implements IGeometryProcessor {
    // The emitters are both optional now.
    // TODO: Add option to control emitter generation.
    private m_decodedTileEmitter: OmvDecodedTileEmitter | undefined;
    private m_infoTileEmitter: OmvTileInfoEmitter | undefined;
    private readonly m_dataAdapters: OmvDataAdapter[] = [];

    constructor(
        private readonly m_projection: Projection,
        private readonly m_styleSetEvaluator: StyleSetEvaluator,
        private readonly m_showMissingTechniques: boolean,
        private readonly m_dataFilter?: OmvFeatureFilter,
        private readonly m_featureModifier?: OmvFeatureModifier,
        private readonly m_gatherFeatureAttributes = false,
        private readonly m_createTileInfo = false,
        private readonly m_gatherRoadSegments = false,
        private readonly m_skipShortLabels = true,
        private readonly m_storageLevelOffset = 0,
        private readonly m_enableElevationOverlay = false,
        private readonly m_languages?: string[]
    ) {
        const styleSetDataFilter = new StyleSetDataFilter(m_styleSetEvaluator);
        const dataPreFilter = m_dataFilter
            ? new ComposedDataFilter([styleSetDataFilter, m_dataFilter])
            : styleSetDataFilter;
        // Register the default adapters.
        this.m_dataAdapters.push(new OmvProtobufDataAdapter(this, dataPreFilter, logger));
        this.m_dataAdapters.push(new VTJsonDataAdapter(this, dataPreFilter, logger));
    }

    get storageLevelOffset() {
        return this.m_storageLevelOffset;
    }

    /**
     * Given a tile and a protobuffer, it returns a decoded tile and it creates the geometries that
     * belong to it.
     *
     * @param tileKey The tile to be decoded.
     * @param data The protobuffer to decode from.
     * @returns A [[DecodedTile]]
     */
    getDecodedTile(tileKey: TileKey, data: ArrayBufferLike | {}): DecodedTile {
        let dataAdapter;
        for (const adapter of this.m_dataAdapters.values()) {
            if (adapter.canProcess(data)) {
                dataAdapter = adapter;
                break;
            }
        }
        if (dataAdapter === undefined) {
            return {
                techniques: [],
                geometries: []
            };
        }

        this.m_styleSetEvaluator.resetTechniques();

        const tileSizeOnScreen = this.estimatedTileSizeOnScreen();
        const decodeInfo = new OmvDecoder.DecodeInfo(
            dataAdapter.id,
            this.m_projection,
            tileKey,
            tileSizeOnScreen
        );

        this.m_decodedTileEmitter = new OmvDecodedTileEmitter(
            decodeInfo,
            this.m_styleSetEvaluator,
            this.m_gatherFeatureAttributes,
            this.m_skipShortLabels,
            this.m_enableElevationOverlay,
            this.m_languages
        );
        if (this.m_createTileInfo) {
            const storeExtendedTags = true;
            this.m_infoTileEmitter = new OmvTileInfoEmitter(
                decodeInfo,
                this.m_styleSetEvaluator,
                storeExtendedTags,
                this.m_gatherRoadSegments
            );
        }

        dataAdapter.process(data, tileKey, decodeInfo.geoBox);
        const decodedTile = this.m_decodedTileEmitter.getDecodedTile();

        if (this.m_createTileInfo) {
            decodedTile.tileInfo = this.m_infoTileEmitter!.getTileInfo();
        }

        return decodedTile;
    }

    getTileInfo(tileKey: TileKey, data: ArrayBufferLike | {}): ExtendedTileInfo {
        let dataAdapter;
        for (const adapter of this.m_dataAdapters.values()) {
            if (adapter.canProcess(data)) {
                dataAdapter = adapter;
                break;
            }
        }
        if (dataAdapter === undefined) {
            return new ExtendedTileInfo(tileKey, false);
        }

        this.m_styleSetEvaluator.resetTechniques();

        const tileSizeOnScreen = this.estimatedTileSizeOnScreen();
        const decodeInfo = new OmvDecoder.DecodeInfo(
            dataAdapter.id,
            this.m_projection,
            tileKey,
            tileSizeOnScreen
        );

        const storeExtendedTags = true;
        this.m_infoTileEmitter = new OmvTileInfoEmitter(
            decodeInfo,
            this.m_styleSetEvaluator,
            storeExtendedTags,
            this.m_gatherRoadSegments
        );

        for (const adapter of this.m_dataAdapters.values()) {
            if (adapter.canProcess(data)) {
                adapter.process(data, tileKey, decodeInfo.geoBox);
                break;
            }
        }

        return this.m_infoTileEmitter.getTileInfo();
    }

    processPointFeature(
        layer: string,
        extents: number,
        geometry: THREE.Vector2[],
        env: MapEnv,
        storageLevel: number
    ): void {
        if (
            this.m_featureModifier !== undefined &&
            !this.m_featureModifier.doProcessPointFeature(layer, env, storageLevel)
        ) {
            return;
        }

        const techniques = this.applyKindFilter(
            this.m_styleSetEvaluator.getMatchingTechniques(env, layer, "point"),
            GeometryKind.Label
        );

        if (techniques.length === 0) {
            if (this.m_showMissingTechniques) {
                logger.log(
                    "OmvDecoder#processPointFeature: no techniques for object:",
                    JSON.stringify(env.unmap())
                );
            }
            return;
        }
        const context = {
            env,
            storageLevel,
            zoomLevel: this.getZoomLevel(storageLevel),
            cachedExprResults: this.m_styleSetEvaluator.expressionEvaluatorCache
        };

        const featureId = env.lookup("$id") as number | undefined;

        if (this.m_decodedTileEmitter) {
            this.m_decodedTileEmitter.processPointFeature(
                layer,
                extents,
                geometry,
                context,
                techniques,
                featureId
            );
        }
        if (this.m_infoTileEmitter) {
            this.m_infoTileEmitter.processPointFeature(
                layer,
                extents,
                geometry,
                context,
                techniques,
                featureId
            );
        }
    }

    processLineFeature(
        layer: string,
        extents: number,
        geometry: ILineGeometry[],
        env: MapEnv,
        storageLevel: number
    ): void {
        if (
            this.m_featureModifier !== undefined &&
            !this.m_featureModifier.doProcessLineFeature(layer, env, storageLevel)
        ) {
            return;
        }

        const techniques = this.applyKindFilter(
            this.m_styleSetEvaluator.getMatchingTechniques(env, layer, "line"),
            GeometryKind.Line
        );

        if (techniques.length === 0) {
            if (this.m_showMissingTechniques) {
                logger.log(
                    "OmvDecoder#processLineFeature: no techniques for object:",
                    JSON.stringify(env.unmap())
                );
            }
            return;
        }

        const context = {
            env,
            storageLevel,
            zoomLevel: this.getZoomLevel(storageLevel),
            cachedExprResults: this.m_styleSetEvaluator.expressionEvaluatorCache
        };
        const featureId = env.lookup("$id") as number | undefined;

        if (this.m_decodedTileEmitter) {
            this.m_decodedTileEmitter.processLineFeature(
                layer,
                extents,
                geometry,
                context,
                techniques,
                featureId
            );
        }
        if (this.m_infoTileEmitter) {
            this.m_infoTileEmitter.processLineFeature(
                layer,
                extents,
                geometry,
                context,
                techniques,
                featureId
            );
        }
    }

    processPolygonFeature(
        layer: string,
        extents: number,
        geometry: IPolygonGeometry[],
        env: MapEnv,
        storageLevel: number
    ): void {
        if (
            this.m_featureModifier !== undefined &&
            !this.m_featureModifier.doProcessPolygonFeature(layer, env, storageLevel)
        ) {
            return;
        }

        const techniques = this.applyKindFilter(
            this.m_styleSetEvaluator.getMatchingTechniques(env, layer, "polygon"),
            GeometryKind.Area
        );

        if (techniques.length === 0) {
            if (this.m_showMissingTechniques) {
                logger.log(
                    "OmvDecoder#processPolygonFeature: no techniques for object:",
                    JSON.stringify(env.unmap())
                );
            }
            return;
        }

        const context = {
            env,
            storageLevel,
            zoomLevel: this.getZoomLevel(storageLevel),
            cachedExprResults: this.m_styleSetEvaluator.expressionEvaluatorCache
        };
        const featureId = env.lookup("$id") as number | undefined;

        if (this.m_decodedTileEmitter) {
            this.m_decodedTileEmitter.processPolygonFeature(
                layer,
                extents,
                geometry,
                context,
                techniques,
                featureId
            );
        }
        if (this.m_infoTileEmitter) {
            this.m_infoTileEmitter.processPolygonFeature(
                layer,
                extents,
                geometry,
                context,
                techniques,
                featureId
            );
        }
    }

    /**
     * Estimate the number of screen pixels a tile will cover. The actual number of pixels will be
     * influenced by tilt and rotation, so estimated the number here should be an upper bound.
     *
     * @returns {number} Estimated number of screen pixels.
     */
    protected estimatedTileSizeOnScreen(): number {
        const tileSizeOnScreen = 256 * Math.pow(2, -this.m_storageLevelOffset);
        return tileSizeOnScreen;
    }

    private getZoomLevel(storageLevel: number) {
        return Math.max(0, storageLevel - (this.m_storageLevelOffset || 0));
    }

    private applyKindFilter(
        techniques: IndexedTechnique[],
        defaultKind: GeometryKind
    ): IndexedTechnique[] {
        if (this.m_dataFilter !== undefined && this.m_dataFilter.hasKindFilter) {
            techniques = techniques.filter(technique => {
                return technique.kind === undefined
                    ? this.m_dataFilter!.wantsKind(defaultKind)
                    : this.m_dataFilter!.wantsKind(technique.kind as GeometryKind);
            });
        }
        return techniques;
    }
}

export namespace OmvDecoder {
    export class DecodeInfo {
        /**
         * The [[GeoBox]] of the Tile to decode.
         */
        readonly geoBox: GeoBox;

        readonly projectedBoundingBox = new OrientedBox3();

        /**
         * The tile bounds in the OMV tile space [[webMercatorTilingScheme]].
         */
        readonly tileBounds = new THREE.Box3();

        /**
         * The tile size in the OMV tile space [[webMercatorTilingScheme]].
         */
        readonly tileSize = new THREE.Vector3();

        /**
         * The center of the Tile in the target [[Projection]] space.
         * Geometries generated by decoding the OMV tile must be relative
         * to this position.
         */
        readonly center = new THREE.Vector3();

        worldTileProjectionCookie?: WorldTileProjectionCookie;

        /**
         * Constructs a new [[DecodeInfo]].
         *
         * @param adapterId The id of the [[OmvDataAdapter]] used for decoding.
         * @param targetProjection The [[Projection]]
         * @param tileKey The [[TileKey]] of the Tile to decode.
         * @param tileSizeOnScreen The estimated size of the Tile in pixels.
         */
        constructor(
            readonly adapterId: string,
            readonly targetProjection: Projection,
            readonly tileKey: TileKey,
            readonly tileSizeOnScreen: number
        ) {
            this.geoBox = this.tilingScheme.getGeoBox(tileKey);

            this.targetProjection.projectBox(this.geoBox, this.projectedBoundingBox);
            this.projectedBoundingBox.getCenter(this.center);

            this.tilingScheme.getWorldBox(tileKey, this.tileBounds);
            this.tileBounds.getSize(this.tileSize);
        }

        /**
         * The [[TilingScheme]] of the OMV data, currenly it is defined
         * to be [[webMercatorTilingScheme]].
         */
        get tilingScheme(): TilingScheme {
            return webMercatorTilingScheme;
        }

        /**
         * The [[Projection]] of OMV tiled data, currenly it is defined
         * to be [[webMercatorProjection]].
         */
        get sourceProjection(): Projection {
            return this.tilingScheme.projection;
        }
    }
}

export class OmvTileDecoder extends ThemedTileDecoder {
    private m_showMissingTechniques: boolean = false;
    private m_featureFilter?: OmvFeatureFilter;
    private m_featureModifier?: OmvFeatureModifier;
    private m_gatherFeatureAttributes: boolean = false;
    private m_createTileInfo: boolean = false;
    private m_gatherRoadSegments: boolean = false;
    private m_skipShortLabels: boolean = true;
    private m_enableElevationOverlay: boolean = false;

    /** @override */
    connect(): Promise<void> {
        return Promise.resolve();
    }

    /** @override */
    decodeThemedTile(
        data: ArrayBufferLike,
        tileKey: TileKey,
        styleSetEvaluator: StyleSetEvaluator,
        projection: Projection
    ): Promise<DecodedTile> {
        const startTime = PerformanceTimer.now();

        const decoder = new OmvDecoder(
            projection,
            styleSetEvaluator,
            this.m_showMissingTechniques,
            this.m_featureFilter,
            this.m_featureModifier,
            this.m_gatherFeatureAttributes,
            this.m_createTileInfo,
            this.m_gatherRoadSegments,
            this.m_skipShortLabels,
            this.m_storageLevelOffset,
            this.m_enableElevationOverlay,
            this.languages
        );

        const decodedTile = decoder.getDecodedTile(tileKey, data);

        decodedTile.decodeTime = PerformanceTimer.now() - startTime;

        return Promise.resolve(decodedTile);
    }

    /** @override */
    getTileInfo(
        data: ArrayBufferLike,
        tileKey: TileKey,
        projection: Projection
    ): Promise<TileInfo | undefined> {
        const startTime = PerformanceTimer.now();

        const styleSetEvaluator = this.m_styleSetEvaluator;
        if (styleSetEvaluator === undefined) {
            return Promise.reject(new Error("no theme loaded"));
        }

        const decoder = new OmvDecoder(
            projection,
            styleSetEvaluator,
            this.m_showMissingTechniques,
            this.m_featureFilter,
            this.m_featureModifier,
            this.m_gatherFeatureAttributes,
            this.m_createTileInfo,
            this.m_gatherRoadSegments,
            this.m_skipShortLabels,
            this.m_storageLevelOffset,
            this.m_enableElevationOverlay,
            this.languages
        );

        const tileInfo = decoder.getTileInfo(tileKey, data);

        tileInfo.setupTime = PerformanceTimer.now() - startTime;

        return Promise.resolve(tileInfo);
    }

    /** @override */
    configure(
        styleSet: StyleSet,
        definitions?: Definitions,
        languages?: string[],
        options?: OptionsMap
    ): void {
        super.configure(styleSet, definitions, languages, options);

        if (options) {
            const omvOptions = options as OmvDecoderOptions;

            if (omvOptions.showMissingTechniques !== undefined) {
                this.m_showMissingTechniques = omvOptions.showMissingTechniques === true;
            }

            if (omvOptions && omvOptions.filterDescription !== undefined) {
                if (omvOptions.filterDescription !== null) {
                    // create new filter/modifier from description
                    this.m_featureFilter = new OmvGenericFeatureFilter(
                        omvOptions.filterDescription
                    );
                    this.m_featureModifier = this.createFeatureModifier(
                        omvOptions.filterDescription,
                        omvOptions.featureModifierId
                    );
                } else {
                    // null is the signal to clear the filter/modifier
                    this.m_featureFilter = undefined;
                    this.m_featureModifier = undefined;
                }
            }

            if (omvOptions.gatherFeatureAttributes !== undefined) {
                this.m_gatherFeatureAttributes = omvOptions.gatherFeatureAttributes === true;
            }
            if (omvOptions.createTileInfo !== undefined) {
                this.m_createTileInfo = omvOptions.createTileInfo === true;
            }
            if (omvOptions.gatherRoadSegments !== undefined) {
                this.m_gatherRoadSegments = omvOptions.gatherRoadSegments === true;
            }
            if (omvOptions.skipShortLabels !== undefined) {
                this.m_skipShortLabels = omvOptions.skipShortLabels;
            }
            if (omvOptions.enableElevationOverlay !== undefined) {
                this.m_enableElevationOverlay = omvOptions.enableElevationOverlay;
            }
        }
        if (languages !== undefined) {
            this.languages = languages;
        }
    }

    private createFeatureModifier(
        filterDescription: OmvFeatureFilterDescription,
        featureModifierId?: FeatureModifierId
    ): OmvFeatureModifier {
        if (featureModifierId === FeatureModifierId.tomTom) {
            return new OmvTomTomFeatureModifier(filterDescription);
        } else {
            return new OmvGenericFeatureModifier(filterDescription);
        }
    }
}

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
        WorkerServiceManager.getInstance().register({
            serviceType: OMV_TILE_DECODER_SERVICE_TYPE,
            factory: (serviceId: string) =>
                TileDecoderService.start(serviceId, new OmvTileDecoder())
        });
    }
}

/**
 * Starts an OMV decoder service.
 *
 * @deprecated Please use [[OmvTileDecoderService.start]].
 */
export default class OmvWorkerClient {
    // TODO(HARP-3651): remove this class when clients are ready
    constructor() {
        logger.warn("OmvWorkerClient class is deprecated, please use OmvTileDecoderService.start");
        OmvTileDecoderService.start();
    }
}
