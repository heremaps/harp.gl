/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    DecodedTile,
    ExtendedTileInfo,
    OptionsMap,
    StyleSet,
    StyleSetEvaluator,
    Technique,
    TileInfo
} from "@here/harp-datasource-protocol";
import { Env, MapEnv } from "@here/harp-datasource-protocol/lib/Theme";
import {
    GeoBox,
    GeoCoordinates,
    Projection,
    TileKey,
    webMercatorTilingScheme
} from "@here/harp-geoutils";

import { LoggerManager, PerformanceTimer } from "@here/harp-utils";

import * as THREE from "three";

import {
    ThemedTileDecoder,
    TileDecoderService,
    WorkerServiceManager
} from "@here/harp-mapview-decoder/index-worker";
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
    readonly isOuterRing: boolean;

    constructor(
        readonly contour: number[],
        readonly contourOutlines?: boolean[],
        readonly countourTexCoords?: number[]
    ) {
        this.isOuterRing = this.area() < 0;
    }

    get isInnerRing(): boolean {
        return !this.isOuterRing;
    }

    area(): number {
        const n = this.contour.length / 2;

        let area = 0.0;

        for (let p = n - 1, q = 0; q < n; p = q++) {
            area +=
                this.contour[p * 2] * this.contour[q * 2 + 1] -
                this.contour[q * 2] * this.contour[p * 2 + 1];
        }

        return area / 2;
    }
}

export interface IOmvEmitter {
    processPointFeature(
        layer: string,
        geometry: GeoCoordinates[],
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
     * Checks if the given data can be processed by this OmvDataAdpter.
     * @param data The raw data to adapt.
     */
    canProcess(data: ArrayBufferLike | {}): boolean;

    /**
     * Process the given raw data.
     *
     * @param data The raw data to process.
     * @param tileKey The TileKey of the enclosing Tile.
     * @param geoBox The GeoBox of the enclosing Tile.
     * @param displayZoomLevel The current display zoom level.
     */
    process(
        data: ArrayBufferLike | {},
        tileKey: TileKey,
        geoBox: GeoBox,
        displayZoomLevel: number
    ): void;
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
    getDecodedTile(
        tileKey: TileKey,
        displayZoomLevel: number,
        data: ArrayBufferLike | {}
    ): DecodedTile {
        const geoBox = webMercatorTilingScheme.getGeoBox(tileKey);
        const tileBounds = this.m_projection.projectBox(geoBox, new THREE.Box3());
        const center = new THREE.Vector3();
        tileBounds.getCenter(center);

        const decodeInfo = {
            tileKey,
            displayZoomLevel,
            projection: this.m_projection,
            geoBox,
            tileBounds,
            center
        };

        this.m_decodedTileEmitter = new OmvDecodedTileEmitter(
            decodeInfo,
            this.m_styleSetEvaluator,
            this.m_gatherFeatureIds,
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
                adapter.process(data, tileKey, geoBox, displayZoomLevel);
                break;
            }
        }

        const decodedTile = this.m_decodedTileEmitter.getDecodedTile();

        if (this.m_createTileInfo) {
            decodedTile.tileInfo = this.m_infoTileEmitter!.getTileInfo();
        }

        return decodedTile;
    }

    getTileInfo(
        tileKey: TileKey,
        displayZoomLevel: number,
        data: ArrayBufferLike | {}
    ): ExtendedTileInfo {
        const geoBox = webMercatorTilingScheme.getGeoBox(tileKey);
        const tileBounds = this.m_projection.projectBox(geoBox, new THREE.Box3());
        const center = new THREE.Vector3();
        tileBounds.getCenter(center);

        const decodeInfo = {
            tileKey,
            displayZoomLevel,
            projection: this.m_projection,
            geoBox,
            tileBounds,
            center
        };

        const storeExtendedTags = true;
        this.m_infoTileEmitter = new OmvTileInfoEmitter(
            decodeInfo,
            this.m_styleSetEvaluator,
            storeExtendedTags,
            this.m_gatherRoadSegments
        );

        for (const adapter of this.m_dataAdapters.values()) {
            if (adapter.canProcess(data)) {
                adapter.process(data, tileKey, geoBox, displayZoomLevel);
                break;
            }
        }

        return this.m_infoTileEmitter.getTileInfo();
    }

    processPointFeature(
        layer: string,
        geometry: GeoCoordinates[],
        env: MapEnv,
        storageLevel: number,
        displayLevel: number
    ): void {
        if (
            this.m_featureModifier !== undefined &&
            !this.m_featureModifier.doProcessPointFeature(layer, env, storageLevel)
        ) {
            return;
        }

        const techniques = this.m_styleSetEvaluator.getMatchingTechniques(env);

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
        storageLevel: number,
        displayLevel: number
    ): void {
        if (
            this.m_featureModifier !== undefined &&
            !this.m_featureModifier.doProcessLineFeature(layer, env, storageLevel)
        ) {
            return;
        }

        const techniques = this.m_styleSetEvaluator.getMatchingTechniques(env);

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
        storageLevel: number,
        displayLevel: number
    ): void {
        if (
            this.m_featureModifier !== undefined &&
            !this.m_featureModifier.doProcessPolygonFeature(layer, env, storageLevel)
        ) {
            return;
        }

        const techniques = this.m_styleSetEvaluator.getMatchingTechniques(env);

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
}

export namespace OmvDecoder {
    export interface DecodeInfo {
        readonly tileKey: TileKey;
        readonly displayZoomLevel: number;
        readonly projection: Projection;
        readonly geoBox: GeoBox;
        readonly tileBounds: THREE.Box3;
        readonly center: THREE.Vector3;
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

    connect(): Promise<void> {
        return Promise.resolve();
    }

    decodeThemedTile(
        data: ArrayBufferLike,
        tileKey: TileKey,
        styleSetEvaluator: StyleSetEvaluator,
        projection: Projection,
        displayZoomLevel?: number
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
            this.languages
        );

        if (displayZoomLevel === undefined) {
            displayZoomLevel = tileKey.level;
        }
        const decodedTile = decoder.getDecodedTile(tileKey, displayZoomLevel, data);

        decodedTile.decodeTime = PerformanceTimer.now() - startTime;

        return Promise.resolve(decodedTile);
    }

    getTileInfo(
        data: ArrayBufferLike,
        tileKey: TileKey,
        projection: Projection,
        displayZoomLevel: number
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
            this.languages
        );

        if (displayZoomLevel === undefined) {
            displayZoomLevel = tileKey.level;
        }

        const tileInfo = decoder.getTileInfo(tileKey, displayZoomLevel, data);

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
