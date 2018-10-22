/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
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
import { Env, MapEnv, ValueMap } from "@here/harp-datasource-protocol/lib/Theme";
import { GeoBox, Projection, TileKey, webMercatorTilingScheme } from "@here/harp-geoutils";

import { LoggerManager, PerformanceTimer } from "@here/harp-utils";
import * as Long from "long";
import * as THREE from "three";

import {
    ThemedTileDecoder,
    TileDecoderService,
    WorkerServiceManager
} from "@here/harp-mapview-decoder/index-worker";
import { FeatureAttributes, OmvVisitor, visitOmv, visitOmvLayer } from "./OmvData";
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
import { com } from "./proto/vector_tile";

const logger = LoggerManager.instance.create("OmvDecoder", { enabled: false });

export class Ring {
    readonly isOuterRing: boolean;

    constructor(readonly contour: number[]) {
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
        layer: com.mapbox.pb.Tile.ILayer,
        feature: com.mapbox.pb.Tile.IFeature,
        env: MapEnv,
        techniques: Technique[],
        featureId: number | undefined
    ): void;

    processLineFeature(
        layer: com.mapbox.pb.Tile.ILayer,
        feature: com.mapbox.pb.Tile.IFeature,
        env: MapEnv,
        techniques: Technique[],
        featureId: number | undefined
    ): void;

    processPolygonFeature(
        layer: com.mapbox.pb.Tile.ILayer,
        feature: com.mapbox.pb.Tile.IFeature,
        env: MapEnv,
        techniques: Technique[],
        featureId: number | undefined
    ): void;
}

export class OmvDecoder implements OmvVisitor {
    private readonly m_featureAttributes = new FeatureAttributes();

    // The emitters are both optional now.
    // TODO: Add option to control emitter generation.
    private m_decodedTileEmitter: OmvDecodedTileEmitter | undefined;
    private m_infoTileEmitter: OmvTileInfoEmitter | undefined;

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
    ) {}

    endVisitLayer?(_layer: com.mapbox.pb.Tile.Layer): void;

    /**
     * Given a tile and a protobuffer, it returns a decoded tile and it creates the geometries that
     * belong to it.
     *
     * @param tileKey The tile to be decoded.
     * @param data The protobuffer to decode from.
     * @returns A [[DecodedTile]]
     */
    getDecodedTile(tileKey: TileKey, data: ArrayBufferLike): DecodedTile {
        const proto = com.mapbox.pb.Tile.decode(new Uint8Array(data));
        const geoBox = webMercatorTilingScheme.getGeoBox(tileKey);
        const tileBounds = this.m_projection.projectBox(geoBox, new THREE.Box3());
        const center = new THREE.Vector3();
        tileBounds.getCenter(center);

        const decodeInfo = {
            tileKey,
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

        const dataFilter = this.m_dataFilter;

        visitOmv(proto, {
            visitLayer: layer => {
                const storageLevel = tileKey.level;

                if (dataFilter === undefined || dataFilter.wantsLayer(layer, storageLevel)) {
                    visitOmvLayer(layer, {
                        visitPolygonFeature: feature => {
                            if (
                                dataFilter === undefined ||
                                dataFilter.wantsPolygonFeature(layer, feature, storageLevel)
                            ) {
                                this.processPolygonFeature(layer, feature, storageLevel);
                            }
                        },
                        visitLineFeature: feature => {
                            if (
                                dataFilter === undefined ||
                                dataFilter.wantsLineFeature(layer, feature, storageLevel)
                            ) {
                                this.processLineFeature(layer, feature, storageLevel);
                            }
                        },
                        visitPointFeature: feature => {
                            if (
                                dataFilter === undefined ||
                                dataFilter.wantsPointFeature(layer, feature, storageLevel)
                            ) {
                                this.processPointFeature(layer, feature, storageLevel);
                            }
                        }
                    });
                }
                return false;
            }
        });

        const decodedTile = this.m_decodedTileEmitter.getDecodedTile();

        if (this.m_createTileInfo) {
            decodedTile.tileInfo = this.m_infoTileEmitter!.getTileInfo();
        }
        return decodedTile;
    }

    getTileInfo(tileKey: TileKey, data: ArrayBufferLike): ExtendedTileInfo {
        const proto = com.mapbox.pb.Tile.decode(new Uint8Array(data));
        const geoBox = webMercatorTilingScheme.getGeoBox(tileKey);
        const tileBounds = this.m_projection.projectBox(geoBox, new THREE.Box3());
        const center = new THREE.Vector3();
        tileBounds.getCenter(center);

        const decodeInfo = {
            tileKey,
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

        const dataFilter = this.m_dataFilter;

        visitOmv(proto, {
            visitLayer: layer => {
                const storageLevel = tileKey.level;

                if (dataFilter === undefined || dataFilter.wantsLayer(layer, storageLevel)) {
                    visitOmvLayer(layer, {
                        visitPolygonFeature: feature => {
                            if (
                                dataFilter === undefined ||
                                dataFilter.wantsPolygonFeature(layer, feature, storageLevel)
                            ) {
                                this.processPolygonFeature(layer, feature, storageLevel);
                            }
                        },
                        visitLineFeature: feature => {
                            if (
                                dataFilter === undefined ||
                                dataFilter.wantsLineFeature(layer, feature, storageLevel)
                            ) {
                                this.processLineFeature(layer, feature, storageLevel);
                            }
                        },
                        visitPointFeature: feature => {
                            if (
                                dataFilter === undefined ||
                                dataFilter.wantsPointFeature(layer, feature, storageLevel)
                            ) {
                                this.processPointFeature(layer, feature, storageLevel);
                            }
                        }
                    });
                }
                return false;
            }
        });

        return this.m_infoTileEmitter.getTileInfo();
    }

    private processPointFeature(
        layer: com.mapbox.pb.Tile.ILayer,
        feature: com.mapbox.pb.Tile.IFeature,
        storageLevel: number
    ): void {
        if (!feature.geometry) {
            return;
        }

        const env = this.createEnv(layer, feature, storageLevel);
        //To enable checking for certain geometry type in map theme add geometry type to environment
        env.entries.$geometryType = "point";

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
                feature,
                env,
                techniques,
                featureId
            );
        }
        if (this.m_infoTileEmitter) {
            this.m_infoTileEmitter.processPointFeature(layer, feature, env, techniques, featureId);
        }
    }

    private processLineFeature(
        layer: com.mapbox.pb.Tile.ILayer,
        feature: com.mapbox.pb.Tile.IFeature,
        storageLevel: number
    ): void {
        if (!feature.geometry) {
            return;
        }

        const env = this.createEnv(layer, feature, storageLevel);
        //To enable checking for certain geometry type in map theme add geometry type to environment
        env.entries.$geometryType = "line";

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
                feature,
                env,
                techniques,
                featureId
            );
        }
        if (this.m_infoTileEmitter) {
            this.m_infoTileEmitter.processLineFeature(layer, feature, env, techniques, featureId);
        }
    }

    private processPolygonFeature(
        layer: com.mapbox.pb.Tile.ILayer,
        feature: com.mapbox.pb.Tile.IFeature,
        storageLevel: number
    ): void {
        if (!feature.geometry) {
            return;
        }

        const env = this.createEnv(layer, feature, storageLevel);
        //To enable checking for certain geometry type in map theme add geometry type to environment
        env.entries.$geometryType = "polygon";

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
                feature,
                env,
                techniques,
                featureId
            );
        }
        if (this.m_infoTileEmitter) {
            this.m_infoTileEmitter.processPolygonFeature(
                layer,
                feature,
                env,
                techniques,
                featureId
            );
        }
    }

    private decodeFeatureId(feature: com.mapbox.pb.Tile.IFeature): number | undefined {
        if (feature.id !== undefined) {
            if (typeof feature.id === "number") {
                return feature.id;
            } else if (Long.isLong(feature.id)) {
                if (feature.id.greaterThan(Number.MAX_SAFE_INTEGER)) {
                    logger.error(
                        "Invalid ID: Larger than largest available Number in feature: ",
                        feature
                    );
                }
                return (feature.id as any).toNumber(); // long
            }
        }
        return undefined;
    }

    private createEnv(
        layer: com.mapbox.pb.Tile.ILayer,
        feature: com.mapbox.pb.Tile.IFeature,
        storageLevel: number,
        parent?: Env
    ): MapEnv {
        const attributes: ValueMap = {
            $layer: layer.name,
            $level: storageLevel
        };

        // Some sources serve `id` directly as `IFeature` property ...
        if (feature.id !== undefined) {
            attributes.$id = this.decodeFeatureId(feature);
        }

        this.m_featureAttributes.accept(layer, feature, {
            visitAttribute(key, value) {
                const v = value as any;
                if (v.hasOwnProperty("stringValue")) {
                    attributes[key] = value.stringValue;
                } else if (v.hasOwnProperty("boolValue")) {
                    attributes[key] = value.boolValue;
                } else if (v.hasOwnProperty("doubleValue")) {
                    attributes[key] = value.doubleValue;
                } else if (v.hasOwnProperty("floatValue")) {
                    attributes[key] = value.floatValue;
                } else if (v.hasOwnProperty("intValue")) {
                    attributes[key] =
                        typeof value.intValue === "number"
                            ? value.intValue
                            : (value.intValue as any).toNumber(); // long
                } else if (v.hasOwnProperty("uintValue")) {
                    attributes[key] =
                        typeof value.uintValue === "number"
                            ? value.uintValue
                            : (value.uintValue as any).toNumber(); // long
                } else if (v.hasOwnProperty("sintValue")) {
                    attributes[key] =
                        typeof value.sintValue === "number"
                            ? value.sintValue
                            : (value.sintValue as any).toNumber(); // long
                }

                // ... while some sources serve `id` in attributes.
                if (key === "id") {
                    attributes.$id = attributes[key];
                }
                return true;
            }
        });

        return new MapEnv(attributes, parent);
    }
}

export namespace OmvDecoder {
    export interface DecodeInfo {
        readonly tileKey: TileKey;
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
            const abbreviation = env.lookup(`abbr`);
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
                name = env.lookup(`name_${language}`);
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
