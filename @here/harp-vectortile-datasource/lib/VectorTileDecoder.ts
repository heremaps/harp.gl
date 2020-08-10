/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    DecodedTile,
    Definitions,
    GeometryKind,
    IndexedTechnique,
    OptionsMap,
    StyleSet
} from "@here/harp-datasource-protocol";
import { MapEnv, StyleSetEvaluator } from "@here/harp-datasource-protocol/index-decoder";
import { Projection, TileKey } from "@here/harp-geoutils";
import {
    ThemedTileDecoder,
    TileDecoderService,
    WorkerServiceManager
} from "@here/harp-mapview-decoder/index-worker";
import { assert, LoggerManager, PerformanceTimer } from "@here/harp-utils";
import * as THREE from "three";

import { AttrEvaluationContext } from "@here/harp-datasource-protocol/lib/TechniqueAttr";
import { GeoJsonVtDataAdapter } from "./adapters/geojson-vt/GeoJsonVtDataAdapter";
import { GeoJsonDataAdapter } from "./adapters/geojson/GeoJsonDataAdapter";
import { OmvDataAdapter } from "./adapters/omv/OmvDataAdapter";
import { DataAdapter } from "./DataAdapter";
import { DecodeInfo } from "./DecodeInfo";
import {
    ComposedDataFilter,
    FeatureFilter,
    FeatureModifier,
    GenericFeatureFilter,
    GenericFeatureModifier
} from "./FeatureFilter";
import { IGeometryProcessor, ILineGeometry, IPolygonGeometry } from "./IGeometryProcessor";
import { PoliticalViewFeatureModifier } from "./modifiers/PoliticalViewFeatureModifier";
import { TomTomFeatureModifier } from "./modifiers/TomTomFeatureModifier";
import {
    DecoderOptions,
    FeatureFilterDescription,
    FeatureModifierId,
    VECTOR_TILE_DECODER_SERVICE_TYPE
} from "./OmvDecoderDefs";
import { StyleSetDataFilter } from "./StyleSetDataFilter";
import { VectorTileDataEmitter } from "./VectorTileDataEmitter";

const logger = LoggerManager.instance.create("VectorTileDecoder", { enabled: false });

export class VectorTileDataProcessor implements IGeometryProcessor {
    // The emitter is optional now.
    // TODO: Add option to control emitter generation.
    private m_decodedTileEmitter: VectorTileDataEmitter | undefined;
    private readonly m_dataAdapters: DataAdapter[] = [];

    constructor(
        private readonly m_projection: Projection,
        private readonly m_styleSetEvaluator: StyleSetEvaluator,
        private readonly m_showMissingTechniques: boolean,
        private readonly m_dataFilter?: FeatureFilter,
        private readonly m_featureModifiers?: FeatureModifier[],
        private readonly m_gatherFeatureAttributes = false,
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
        this.m_dataAdapters.push(new OmvDataAdapter(this, dataPreFilter, logger));
        this.m_dataAdapters.push(new GeoJsonVtDataAdapter(this, dataPreFilter, logger));
        this.m_dataAdapters.push(new GeoJsonDataAdapter(this, dataPreFilter, logger));
    }

    get storageLevelOffset() {
        return this.m_storageLevelOffset;
    }

    /**
     * Given a tile and a protobuffer, it returns a decoded tile and it creates the geometries that
     * belong to it.
     *
     * @param tileKey - The tile to be decoded.
     * @param data - The protobuffer to decode from.
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

        const decodeInfo = new DecodeInfo(
            dataAdapter.id,
            this.m_projection,
            tileKey,
            this.m_storageLevelOffset
        );

        this.m_decodedTileEmitter = new VectorTileDataEmitter(
            decodeInfo,
            this.m_styleSetEvaluator,
            this.m_gatherFeatureAttributes,
            this.m_skipShortLabels,
            this.m_enableElevationOverlay,
            this.m_languages
        );

        dataAdapter.process(data, decodeInfo);
        return this.m_decodedTileEmitter.getDecodedTile();
    }

    processPointFeature(
        layer: string,
        extents: number,
        geometry: THREE.Vector2[],
        env: MapEnv,
        storageLevel: number
    ): void {
        if (this.m_featureModifiers !== undefined) {
            if (
                this.m_featureModifiers.find(fm => {
                    // TODO: The logic of feature ignore should be actually in the feature filtering
                    // mechanism - see OmvFeatureFilter.
                    return !fm.doProcessPointFeature(layer, env, storageLevel);
                }) !== undefined
            ) {
                return;
            }
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
        const context: AttrEvaluationContext = {
            env,
            cachedExprResults: new Map()
        };

        if (this.m_decodedTileEmitter) {
            this.m_decodedTileEmitter.processPointFeature(
                layer,
                extents,
                geometry,
                context,
                techniques
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
        if (this.m_featureModifiers !== undefined) {
            if (
                this.m_featureModifiers.find(fm => {
                    return !fm.doProcessLineFeature(layer, env, storageLevel);
                }) !== undefined
            ) {
                return;
            }
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

        const context: AttrEvaluationContext = {
            env,
            cachedExprResults: new Map()
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
    }

    processPolygonFeature(
        layer: string,
        extents: number,
        geometry: IPolygonGeometry[],
        env: MapEnv,
        storageLevel: number
    ): void {
        if (this.m_featureModifiers !== undefined) {
            if (
                this.m_featureModifiers.find(fm => {
                    return !fm.doProcessPolygonFeature(layer, env, storageLevel);
                }) !== undefined
            ) {
                return;
            }
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
            cachedExprResults: new Map()
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
    }

    private applyKindFilter(
        techniques: IndexedTechnique[],
        defaultKind: GeometryKind
    ): IndexedTechnique[] {
        if (this.m_dataFilter !== undefined && this.m_dataFilter.hasKindFilter) {
            techniques = techniques.filter(technique => {
                const kind =
                    // tslint:disable-next-line: deprecation
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
    private m_showMissingTechniques: boolean = false;
    private m_featureFilter?: FeatureFilter;
    private m_featureModifiers?: FeatureModifier[];
    private m_gatherFeatureAttributes: boolean = false;
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

        const decoder = new VectorTileDataProcessor(
            projection,
            styleSetEvaluator,
            this.m_showMissingTechniques,
            this.m_featureFilter,
            this.m_featureModifiers,
            this.m_gatherFeatureAttributes,
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
    configure(
        styleSet: StyleSet,
        definitions?: Definitions,
        languages?: string[],
        options?: OptionsMap
    ): void {
        super.configure(styleSet, definitions, languages, options);

        if (options) {
            const omvOptions = options as DecoderOptions;

            if (omvOptions.showMissingTechniques !== undefined) {
                this.m_showMissingTechniques = omvOptions.showMissingTechniques === true;
            }

            if (omvOptions.filterDescription !== undefined) {
                if (omvOptions.filterDescription !== null) {
                    // TODO: Feature modifier is always used only with feature filter.
                    // At best the filtering feature should be excluded from other feature
                    // modifiers and be performed solely via OmvGenericFeature modifier or filter.
                    const filterDescription = omvOptions.filterDescription;
                    const featureModifiersIds = omvOptions.featureModifiers;

                    // Create new filter from description.
                    this.m_featureFilter = new GenericFeatureFilter(filterDescription);
                    // Create feature modifiers.
                    const featureModifiers: FeatureModifier[] = [];
                    if (featureModifiersIds !== undefined) {
                        featureModifiersIds.forEach(fmId => {
                            featureModifiers.push(
                                this.createFeatureModifier(filterDescription, fmId)
                            );
                        });
                    } else {
                        featureModifiers.push(
                            this.createFeatureModifier(filterDescription, FeatureModifierId.default)
                        );
                    }
                    this.m_featureModifiers = featureModifiers;
                } else {
                    // null is the signal to clear the filter/modifier
                    this.m_featureFilter = undefined;
                    this.m_featureModifiers = undefined;
                }
            }

            if (omvOptions.politicalView !== undefined) {
                const politicalView = omvOptions.politicalView;
                let featureModifiers = this.m_featureModifiers;
                // Remove existing political view modifiers, this actually setups default,
                // commonly accepted point of view - without feature modifier.
                if (featureModifiers) {
                    featureModifiers = featureModifiers.filter(
                        fm => !(fm instanceof PoliticalViewFeatureModifier)
                    );
                }
                // If political view is indeed requested append feature modifier at the end of list.
                if (politicalView.length !== 0) {
                    assert(
                        politicalView.length === 2,
                        "The political view must be specified as two letters ISO 3166-1 standard!"
                    );
                    const povFeatureModifier = new PoliticalViewFeatureModifier(politicalView);
                    if (featureModifiers) {
                        featureModifiers.push(povFeatureModifier);
                    } else {
                        featureModifiers = [povFeatureModifier];
                    }
                }
                // Reset modifiers if nothing was added.
                this.m_featureModifiers =
                    featureModifiers && featureModifiers.length > 0 ? featureModifiers : undefined;
            }

            if (omvOptions.gatherFeatureAttributes !== undefined) {
                this.m_gatherFeatureAttributes = omvOptions.gatherFeatureAttributes === true;
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
        filterDescription: FeatureFilterDescription,
        featureModifierId?: FeatureModifierId
    ): FeatureModifier {
        switch (featureModifierId) {
            case FeatureModifierId.tomTom:
                return new TomTomFeatureModifier(filterDescription);
            case FeatureModifierId.default:
                return new GenericFeatureModifier(filterDescription);
            default:
                assert(!"Unrecognized feature modifier id, using default!");
                return new GenericFeatureModifier(filterDescription);
        }
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
