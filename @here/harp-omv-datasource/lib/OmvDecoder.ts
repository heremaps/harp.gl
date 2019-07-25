/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    DecodedTile,
    ExtendedTileInfo,
    GeometryKind,
    IndexedTechnique,
    OptionsMap,
    StyleSet,
    Technique,
    TileInfo
} from "@here/harp-datasource-protocol";
import { Env, MapEnv, StyleSetEvaluator } from "@here/harp-datasource-protocol/index-decoder";
import { OrientedBox3 } from "@here/harp-geometry";
import {
    GeoBox,
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

import { IGeometryProcessor, ILineGeometry, IPolygonGeometry } from "./IGeometryProcessor";
import { OmvProtobufDataAdapter } from "./OmvData";
import {
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
import { VTJsonDataAdapter } from "./VTJsonDataAdapter";

const logger = LoggerManager.instance.create("OmvDecoder", { enabled: false });

export class Ring {
    readonly winding: boolean;

    /**
     * Constructs a new [[Ring]].
     *
     * @param vertexStride The stride of this elements stored in 'contour' and 'points'.
     * @param contour The [[Array]] containing the projected world coordinates.
     * @param points An optional [[Array]] containing points projected
     *               using the equirectangular projection.
     * @param contourOutlines An optional [[Array]] of outline attributes.
     */
    constructor(
        readonly vertexStride: number,
        readonly contour: number[],
        readonly contourOutlines?: boolean[],
        readonly points: number[] = contour
    ) {
        this.winding = this.area() < 0;
    }

    area(): number {
        const points = this.points;
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

    /*
     * Extracts outlines from the ring contour data
     */
    getOutlines() {
        const stride = this.vertexStride;
        const { contourOutlines, contour } = this;

        if (contourOutlines === undefined) {
            const outLine = contour.slice();
            outLine.push(...outLine.slice(0, stride));
            return [outLine];
        }

        const { length } = contourOutlines;

        const lines: number[][] = [];
        let line: number[] = [];

        for (let i = 0; i < length; i++) {
            const isOutline = contourOutlines[i];
            let index = i * stride;

            if (!isOutline && line.length !== 0) {
                lines.push(line);
                line = [];
            } else if (isOutline && line.length === 0) {
                line.push(...contour.slice(index, index + stride));
                index = (index + stride) % (length * stride);
                line.push(...contour.slice(index, index + stride));
            } else if (isOutline) {
                index = (index + stride) % (length * stride);
                line.push(...contour.slice(index, index + stride));
            }
        }
        if (line.length) {
            lines.push(line);
        }

        return lines;
    }
}

export interface IOmvEmitter {
    processPointFeature(
        layer: string,
        geometry: THREE.Vector3[],
        env: MapEnv,
        techniques: Technique[],
        featureId: number | undefined
    ): void;

    processLineFeature(
        layer: string,
        feature: ILineGeometry[],
        env: MapEnv,
        techniques: Technique[],
        featureId: number | undefined
    ): void;

    processPolygonFeature(
        layer: string,
        feature: IPolygonGeometry[],
        env: MapEnv,
        techniques: Technique[],
        featureId: number | undefined
    ): void;
}

/**
 * The class [[OmvDataAdapter]] prepares protobuf encoded OMV data so they
 * can be processed by [[OmvDecoder]].
 */
export interface OmvDataAdapter {
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
        private readonly m_gatherFeatureIds = true,
        private readonly m_createTileInfo = false,
        private readonly m_gatherRoadSegments = false,
        private readonly m_skipShortLabels = true,
        private readonly m_storageLevelOffset = 0,
        private readonly m_languages?: string[]
    ) {
        // Register the default adapters.
        this.m_dataAdapters.push(new OmvProtobufDataAdapter(this, m_dataFilter, logger));
        this.m_dataAdapters.push(new VTJsonDataAdapter(this, m_dataFilter, logger));
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
        const tileSizeOnScreen = this.estimatedTileSizeOnScreen();
        const decodeInfo = new OmvDecoder.DecodeInfo(this.m_projection, tileKey, tileSizeOnScreen);

        this.m_decodedTileEmitter = new OmvDecodedTileEmitter(
            decodeInfo,
            this.m_styleSetEvaluator,
            this.m_gatherFeatureIds,
            this.m_skipShortLabels,
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
        for (const adapter of this.m_dataAdapters.values()) {
            if (adapter.canProcess(data)) {
                adapter.process(data, tileKey, decodeInfo.geoBox);
                break;
            }
        }
        const decodedTile = this.m_decodedTileEmitter.getDecodedTile();

        if (this.m_createTileInfo) {
            decodedTile.tileInfo = this.m_infoTileEmitter!.getTileInfo();
        }

        return decodedTile;
    }

    getTileInfo(tileKey: TileKey, data: ArrayBufferLike | {}): ExtendedTileInfo {
        const tileSizeOnScreen = this.estimatedTileSizeOnScreen();
        const decodeInfo = new OmvDecoder.DecodeInfo(this.m_projection, tileKey, tileSizeOnScreen);

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
        geometry: THREE.Vector3[],
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
            this.m_styleSetEvaluator.getMatchingTechniques(env),
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

        const featureId = env.lookup("$id") as number | undefined;

        if (this.m_decodedTileEmitter) {
            this.m_decodedTileEmitter.processPointFeature(
                layer,
                geometry,
                env,
                techniques,
                featureId
            );
        }
        if (this.m_infoTileEmitter) {
            this.m_infoTileEmitter.processPointFeature(layer, geometry, env, techniques, featureId);
        }
    }

    processLineFeature(
        layer: string,
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
            this.m_styleSetEvaluator.getMatchingTechniques(env),
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

        const featureId = env.lookup("$id") as number | undefined;

        if (this.m_decodedTileEmitter) {
            this.m_decodedTileEmitter.processLineFeature(
                layer,
                geometry,
                env,
                techniques,
                featureId
            );
        }
        if (this.m_infoTileEmitter) {
            this.m_infoTileEmitter.processLineFeature(layer, geometry, env, techniques, featureId);
        }
    }

    processPolygonFeature(
        layer: string,
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
            this.m_styleSetEvaluator.getMatchingTechniques(env),
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

        const featureId = env.lookup("$id") as number | undefined;
        if (this.m_decodedTileEmitter) {
            this.m_decodedTileEmitter.processPolygonFeature(
                layer,
                geometry,
                env,
                techniques,
                featureId
            );
        }
        if (this.m_infoTileEmitter) {
            this.m_infoTileEmitter.processPolygonFeature(
                layer,
                geometry,
                env,
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

        /**
         * The tile bounds in the world space of the
         * target projection [[DecodeInfo.targetProjection]].
         *
         * @deprecated
         */
        readonly projectedTileBounds = new THREE.Box3();

        /**
         * Constructs a new [[DecodeInfo]].
         *
         * @param targetProjection The [[Projection]]
         * @param tileKey The [[TileKey]] of the Tile to decode.
         * @param tileSizeOnScreen The estimated size of the Tile in pixels.
         */
        constructor(
            readonly targetProjection: Projection,
            readonly tileKey: TileKey,
            readonly tileSizeOnScreen: number
        ) {
            this.geoBox = this.tilingScheme.getGeoBox(tileKey);

            this.targetProjection.projectBox(this.geoBox, this.projectedTileBounds);

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

    export function getFeatureName(
        env: Env,
        useAbbreviation: boolean,
        useIsoCode: boolean,
        languages?: string[]
    ): string | undefined {
        let name;
        if (useAbbreviation) {
            const abbreviation = env.lookup(`name:short`);
            if (typeof abbreviation === "string" && abbreviation.length > 0) {
                return abbreviation;
            }
        }
        if (useIsoCode) {
            const isoCode = env.lookup(`iso_code`);
            if (typeof isoCode === "string" && isoCode.length > 0) {
                return isoCode;
            }
        }
        if (languages !== undefined) {
            for (const language of languages) {
                name = env.lookup(`name:${language}`) || env.lookup(`name_${language}`);
                if (typeof name === "string" && name.length > 0) {
                    return name;
                }
            }
        }
        name = env.lookup("name");
        if (typeof name === "string") {
            return name;
        }
        return undefined;
    }
}

export class OmvTileDecoder extends ThemedTileDecoder {
    private m_showMissingTechniques: boolean = false;
    private m_featureFilter?: OmvFeatureFilter;
    private m_featureModifier?: OmvFeatureModifier;
    private m_gatherFeatureIds: boolean = true;
    private m_createTileInfo: boolean = false;
    private m_gatherRoadSegments: boolean = false;
    private m_skipShortLabels: boolean = true;

    connect(): Promise<void> {
        return Promise.resolve();
    }

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
            this.m_gatherFeatureIds,
            this.m_createTileInfo,
            this.m_gatherRoadSegments,
            this.m_skipShortLabels,
            this.m_storageLevelOffset,
            this.languages
        );

        const decodedTile = decoder.getDecodedTile(tileKey, data);

        decodedTile.decodeTime = PerformanceTimer.now() - startTime;

        return Promise.resolve(decodedTile);
    }

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
            this.m_gatherFeatureIds,
            this.m_createTileInfo,
            this.m_gatherRoadSegments,
            this.m_skipShortLabels,
            this.m_storageLevelOffset,
            this.languages
        );

        const tileInfo = decoder.getTileInfo(tileKey, data);

        tileInfo.setupTime = PerformanceTimer.now() - startTime;

        return Promise.resolve(tileInfo);
    }

    configure(styleSet: StyleSet, languages?: string[], options?: OptionsMap): void {
        super.configure(styleSet, languages, options);

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

            if (omvOptions.gatherFeatureIds !== undefined) {
                this.m_gatherFeatureIds = omvOptions.gatherFeatureIds === true;
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
