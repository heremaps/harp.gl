/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { GeometryKind, GeometryKindSet } from "@here/harp-datasource-protocol";
import { MapEnv } from "@here/harp-datasource-protocol/index-decoder";
import {
    VectorTileFeatureFilterDescription,
    VectorTileFilterDescription,
    VectorTileFilterFeatureAttribute,
    VectorTileFilterString,
    VectorTileGeometryType,
    VectorTileLayerFilterDescription
} from "./VectorTileDecoderDefs";

/**
 * The `VectorTileFeatureFilter` is designed to work in a `VectorTileVisitor`/`visitVectorTile`
 * combination (for example, `VectorTileDecoder`). Returning `false` from any of the calls
 * terminates processing of that layer or feature.
 *
 * The `VectorTileFeatureFilter` is an "early-opt-out" filter, which cannot filter individual
 * features, because at that point the features are not really decoded. Use the
 * [[VectorTileFeatureModifier]] to filter for individual features.
 */
export interface VectorTileFeatureFilter {
    /**
     * Returns `true` if the filter contains rules for specific kinds.
     */
    hasKindFilter: boolean;

    /**
     * Return `false` if the layer should not be processed.
     *
     * @param layer Current layer.
     * @param level Level of tile.
     */
    wantsLayer(layer: string, level: number): boolean;

    /**
     * Return `false` if the point feature should not be processed.
     *
     * @param layer Current layer.
     * @param feature Current feature.
     * @param level Level of tile.
     */
    wantsPointFeature(layer: string, geometryType: VectorTileGeometryType, level: number): boolean;

    /**
     * Return `false` if the line feature should not be processed.
     *
     * @param layer Current layer.
     * @param feature Current feature.
     * @param level Level of tile.
     */
    wantsLineFeature(layer: string, geometryType: VectorTileGeometryType, level: number): boolean;

    /**
     * Return `false` if the polygon feature should not be processed.
     *
     * @param layer Current layer.
     * @param feature Current feature.
     * @param level Level of tile.
     */
    wantsPolygonFeature(
        layer: string,
        geometryType: VectorTileGeometryType,
        level: number
    ): boolean;

    /**
     * Return `false` if kind of object is not enabled and the geometry should not be created.
     *
     * @param {(string | string[])} kind Tag "kind" of the tag.
     * @returns {boolean}
     */
    wantsKind(kind: string | string[]): boolean;
}

/**
 * The `VectorTileFeatureModifier` can be used to filter individual features. It gets passed in the
 * [[Env]] of the feature, which contains all the values that can be searched for in a style. If a
 * filter function returns false, the feature is ignored, and no geometry is being created.
 *
 * In addition to pure filtering, the `VectorTileFeatureModifier` can also modify the [[Env]] of the
 * feature, or even add new properties to the feature, for example, traffic states. The
 * `VectorTileFeatureModifier` is executed before the styles are selected, so the geometry is
 * created with the modified feature properties.
 */
export interface VectorTileFeatureModifier {
    /**
     * Check if the point feature described by `env` should be processed. The properties can be
     * modified or added to.
     *
     * @param layer Current layer.
     * @param env Properties of point feature.
     * @param level Level of tile.
     * @returns `false` to ignore feature.
     */
    doProcessPointFeature(layer: string, env: MapEnv, level: number): boolean;

    /**
     * Check if the line feature described by `env` should be processed. The properties can be
     * modified or added to.
     *
     * @param layer Current layer.
     * @param env Properties of line feature.
     * @param level Level of tile.
     * @returns `false` to ignore feature.
     */
    doProcessLineFeature(layer: string, env: MapEnv, level: number): boolean;

    /**
     * Check if the polygon feature described by `env` should be processed. The properties can be
     * modified or added to.
     *
     * @param layer Current layer.
     * @param env Properties of polygon feature.
     * @param level Level of tile.
     * @returns `false` to ignore feature.
     */
    doProcessPolygonFeature(layer: string, env: MapEnv, level: number): boolean;
}

/**
 * Builds an `VectorTileFilterDescription` (internal type) that specifies an
 * [[VectorTileFeatureFilter]] as well as an [[VectorTileFeatureModifier]].
 *
 */
export class VectorTileFeatureFilterDescriptionBuilder {
    private m_processLayersDefault: boolean = true;
    private m_processPointsDefault: boolean = true;
    private m_processLinesDefault: boolean = true;
    private m_processPolygonsDefault: boolean = true;

    private readonly m_layersToProcess = new Array<VectorTileLayerFilterDescription>();
    private readonly m_layersToIgnore = new Array<VectorTileLayerFilterDescription>();
    private readonly m_pointsToProcess = new Array<VectorTileFilterDescription>();
    private readonly m_ignoredPoints = new Array<VectorTileFilterDescription>();
    private readonly m_linesToProcess = new Array<VectorTileFilterDescription>();
    private readonly m_linesToIgnore = new Array<VectorTileFilterDescription>();
    private readonly m_polygonsToProcess = new Array<VectorTileFilterDescription>();
    private readonly m_polygonsToIgnore = new Array<VectorTileFilterDescription>();

    private m_kindsToProcess: string[] = [];
    private m_kindsToIgnore: string[] = [];

    /**
     * Builds an `VectorTileFilterDescription` (internal type) that specifies an
     * [[VectorTileFeatureFilter]] as well as an [[VectorTileFeatureModifier]].
     *
     * @param processLayersDefault If `true`, all unspecified layers will be processed. If `false`,
     * all unspecified layers will be ignored.
     * @param processPointsDefault If `true`, all unspecified point features will be processed. If
     * `false`, all unspecified point features will be ignored.
     * @param processLinesDefault If `true`, all unspecified line features will be processed. If
     * `false`, all unspecified line features will be ignored.
     * @param processPolygonsDefault If `true`, all unspecified polygon features will be processed.
     * If `false`, all unspecified polygon features will be ignored.
     */
    constructor(
        // tslint:disable-next-line:max-line-length
        options?: VectorTileFeatureFilterDescriptionBuilder.VectorTileFeatureFilterDescriptionBuilderOptions
    ) {
        if (options) {
            this.m_processLayersDefault =
                options.processLayersDefault !== undefined ? options.processLayersDefault : true;
            this.m_processPointsDefault =
                options.processPointsDefault !== undefined ? options.processPointsDefault : true;
            this.m_processLinesDefault =
                options.processLinesDefault !== undefined ? options.processLinesDefault : true;
            this.m_processPolygonsDefault =
                options.processPolygonsDefault !== undefined
                    ? options.processPolygonsDefault
                    : true;
        }
    }

    /**
     * Add a layer that should be processed.
     *
     * @param layer Layer name to be matched.
     * @param match Match condition.
     */
    processLayer(
        layer: string,
        match = VectorTileFilterString.StringMatch.Match,
        minLevel: number = 0,
        maxLevel: number = Infinity
    ) {
        this.m_layersToProcess.push({
            name: { value: layer, match },
            minLevel,
            maxLevel
        });
    }

    /**
     * Add a layer that should be ignored.
     *
     * @param layer Layer name to be matched.
     * @param match Match condition.
     */
    ignoreLayer(
        layer: string,
        match = VectorTileFilterString.StringMatch.Match,
        minLevel: number = 0,
        maxLevel: number = Infinity
    ) {
        this.m_layersToIgnore.push({
            name: { value: layer, match },
            minLevel,
            maxLevel
        });
    }

    /**
     * Add a valid point feature.
     *
     * @param options Feature options.
     */
    processPoint(options: VectorTileFeatureFilterDescriptionBuilder.FeatureOption) {
        this.addItem(this.m_pointsToProcess, options);
    }

    /**
     * Add valid point features.
     *
     * @param options Multi feature options.
     */
    processPoints(options: VectorTileFeatureFilterDescriptionBuilder.MultiFeatureOption) {
        this.addItems(this.m_pointsToProcess, options);
    }

    /**
     * Add a point feature that should be ignored.
     *
     * @param options Feature options.
     */
    ignorePoint(options: VectorTileFeatureFilterDescriptionBuilder.FeatureOption) {
        this.addItem(this.m_ignoredPoints, options);
    }

    /**
     * Add point features that should be ignored.
     *
     * @param options Multi feature options.
     */
    ignorePoints(options: VectorTileFeatureFilterDescriptionBuilder.MultiFeatureOption) {
        this.addItems(this.m_ignoredPoints, options);
    }

    /**
     * Add a valid line feature.
     *
     * @param options Feature options.
     */
    processLine(options: VectorTileFeatureFilterDescriptionBuilder.FeatureOption) {
        this.addItem(this.m_linesToProcess, options);
    }

    /**
     * Add valid line features.
     *
     * @param options Multi feature options.
     */
    processLines(options: VectorTileFeatureFilterDescriptionBuilder.MultiFeatureOption) {
        this.addItems(this.m_linesToProcess, options);
    }

    /**
     * Ignore a line feature.
     *
     * @param options Feature options.
     */
    ignoreLine(options: VectorTileFeatureFilterDescriptionBuilder.FeatureOption) {
        this.addItem(this.m_linesToIgnore, options);
    }

    /**
     * Ignore line features.
     *
     * @param options Multi feature options.
     */
    ignoreLines(options: VectorTileFeatureFilterDescriptionBuilder.MultiFeatureOption) {
        this.addItems(this.m_linesToIgnore, options);
    }

    /**
     * Add a valid polygon feature.
     *
     * @param options Feature options.
     */
    processPolygon(options: VectorTileFeatureFilterDescriptionBuilder.FeatureOption) {
        this.addItem(this.m_polygonsToProcess, options);
    }

    /**
     * Add valid polygon features.
     *
     * @param options Multi feature options.
     */
    processPolygons(options: VectorTileFeatureFilterDescriptionBuilder.MultiFeatureOption) {
        this.addItems(this.m_polygonsToProcess, options);
    }

    /**
     * Ignore a valid polygon feature.
     *
     * @param options Feature options.
     */
    ignorePolygon(options: VectorTileFeatureFilterDescriptionBuilder.FeatureOption) {
        this.addItem(this.m_polygonsToIgnore, options);
    }

    /**
     * Ignore polygon features.
     *
     * @param options Multi feature options.
     */
    ignorePolygons(options: VectorTileFeatureFilterDescriptionBuilder.MultiFeatureOption) {
        this.addItems(this.m_polygonsToIgnore, options);
    }

    /**
     * Add all the specified strings as "enabledKinds".
     *
     * @param {string[]} enabledKinds List of kinds that should be generated.
     */
    processKinds(enabledKinds: string[]) {
        this.m_kindsToProcess = this.m_kindsToProcess.concat(enabledKinds);
    }

    /**
     * Add all the specified strings as "disabledKinds".
     *
     * @param {string[]} disabledKinds List of kinds that should _not_ be generated.
     */
    ignoreKinds(disabledKinds: string[]) {
        this.m_kindsToIgnore = this.m_kindsToIgnore.concat(disabledKinds);
    }

    /**
     * Create a filter description that can be passed as an option to the [[VectorTileDataSource]].
     */
    createDescription(): VectorTileFeatureFilterDescription {
        return {
            processLayersDefault: this.m_processLayersDefault,
            processPointsDefault: this.m_processPointsDefault,
            processLinesDefault: this.m_processLinesDefault,
            processPolygonsDefault: this.m_processPolygonsDefault,

            layersToProcess: this.m_layersToProcess,
            layersToIgnore: this.m_layersToIgnore,
            pointsToProcess: this.m_pointsToProcess,
            pointsToIgnore: this.m_ignoredPoints,
            linesToProcess: this.m_linesToProcess,
            linesToIgnore: this.m_linesToIgnore,
            polygonsToProcess: this.m_polygonsToProcess,
            polygonsToIgnore: this.m_polygonsToIgnore,

            kindsToProcess: this.m_kindsToProcess,
            kindsToIgnore: this.m_kindsToIgnore
        };
    }

    private addItem(
        items: VectorTileFilterDescription[],
        options: VectorTileFeatureFilterDescriptionBuilder.FeatureOption
    ) {
        if (options.minLevel === undefined || isNaN(options.minLevel)) {
            options.minLevel = 0;
        }
        if (options.maxLevel === undefined || isNaN(options.maxLevel)) {
            options.maxLevel = Infinity;
        }

        const item: VectorTileFilterDescription = {
            layerName: {
                value: options.layer,
                match:
                    options.matchLayer === undefined
                        ? VectorTileFilterString.StringMatch.Match
                        : options.matchLayer
            },
            geometryTypes:
                options.geomType !== undefined
                    ? Array.isArray(options.geomType)
                        ? options.geomType
                        : [options.geomType]
                    : undefined,
            classes: [
                {
                    value: options.featureClass,
                    match:
                        options.matchClass === undefined
                            ? VectorTileFilterString.StringMatch.Match
                            : options.matchClass
                }
            ],
            minLevel: options.minLevel,
            maxLevel: options.maxLevel,
            featureAttribute: options.featureAttribute
        };

        items.push(item);
    }

    private addItems(
        items: VectorTileFilterDescription[],
        options: VectorTileFeatureFilterDescriptionBuilder.MultiFeatureOption
    ) {
        if (options.minLevel === undefined || isNaN(options.minLevel)) {
            options.minLevel = 0;
        }
        if (options.maxLevel === undefined || isNaN(options.maxLevel)) {
            options.maxLevel = Infinity;
        }

        const item: VectorTileFilterDescription = {
            layerName: {
                value: options.layer,
                match:
                    options.matchLayer === undefined
                        ? VectorTileFilterString.StringMatch.Match
                        : options.matchLayer
            },
            geometryTypes:
                options.geomTypes !== undefined
                    ? Array.isArray(options.geomTypes)
                        ? options.geomTypes
                        : [options.geomTypes]
                    : undefined,
            classes: options.featureClasses,
            minLevel: options.minLevel,
            maxLevel: options.maxLevel,
            featureAttribute: options.featureAttribute
        };

        items.push(item);
    }
}

export namespace VectorTileFeatureFilterDescriptionBuilder {
    /**
     * Options for `VectorTileFeatureFilterDescriptionBuilder`.
     */
    export interface VectorTileFeatureFilterDescriptionBuilderOptions {
        /**
         * If `true`, all unspecified layers will be processed. If `false`, all unspecified layers
         * will be ignored.
         */
        processLayersDefault?: boolean;
        /**
         * If `true`, all unspecified point features will be processed. If `false`, all unspecified
         * point features will be ignored.
         */
        processPointsDefault?: boolean;
        /**
         * If `true`, all unspecified line features will be processed. If `false`, all unspecified
         * line
         * features will be ignored.
         */
        processLinesDefault?: boolean;
        /**
         * If `true`, all unspecified polygon features will be processed. If `false`, all
         * unspecified polygon features will be ignored.
         */
        processPolygonsDefault?: boolean;
    }

    /**
     * Description of a single feature.
     */
    export interface FeatureOption {
        /**
         * Layer name to be matched.
         */
        layer: string;
        /**
         * Optional geometry type to be limited to. If specified, but does not match, the feature is
         * ignored.
         */
        geomType: VectorTileGeometryType | VectorTileGeometryType[] | undefined;
        /**
         * Optional class to match. If specified, but does not match, the feature is ignored.
         */
        featureClass: string;
        /**
         * Match condition for the layer name.
         */
        matchLayer?: VectorTileFilterString.StringMatch;
        /**
         * Match condition for `featureClass`.
         */
        matchClass?: VectorTileFilterString.StringMatch;
        /**
         * Minimum tile level to match.
         */
        minLevel?: number;
        /**
         * Maximum tile level to match.
         */
        maxLevel?: number;
        /**
         * Feature attribute to match.
         */
        featureAttribute?: VectorTileFilterFeatureAttribute;
    }

    /**
     * Description for multiple features.
     */
    export interface MultiFeatureOption {
        /**
         * Layer name to be matched.
         */
        layer: string;
        /**
         * Optional geometry type to be limited to. If specified, but does not match, the feature is
         * ignored.
         */
        geomTypes?: VectorTileGeometryType | VectorTileGeometryType[] | undefined;
        /**
         * Optional classes to match. If specified, but does not match, the feature is ignored.
         */
        featureClasses?: VectorTileFilterString[];
        /**
         * Match condition for the layer name.
         */
        matchLayer?: VectorTileFilterString.StringMatch;
        /**
         * Minimum tile level to match.
         */
        minLevel?: number;
        /**
         * Maximum tile level to match.
         */
        maxLevel?: number;
        /**
         * Feature attribute to match.
         */
        featureAttribute?: VectorTileFilterFeatureAttribute;
    }
}

/**
 * `VectorTileFeatureFilter` implementation that uses a `VectorTileFeatureFilterDescription` to
 * filter `TileData` features before they are completely decoded.
 *
 * @hidden
 */
export class VectorTileGenericFeatureFilter implements VectorTileFeatureFilter {
    private static matchLayer(
        layer: string,
        layerItems: VectorTileLayerFilterDescription[],
        level: number
    ): boolean {
        for (const layerItem of layerItems) {
            if (level < layerItem.minLevel || level > layerItem.maxLevel) {
                continue;
            }

            if (VectorTileFilterString.matchString(layer, layerItem.name)) {
                return true;
            }
        }
        return false;
    }

    private disabledKinds: GeometryKindSet | undefined;
    private enabledKinds: GeometryKindSet | undefined;

    constructor(private description: VectorTileFeatureFilterDescription) {
        if (this.description.kindsToProcess.length > 0) {
            this.enabledKinds = new GeometryKindSet(this.description
                .kindsToProcess as GeometryKind[]);
        }
        if (this.description.kindsToIgnore.length > 0) {
            this.disabledKinds = new GeometryKindSet(this.description
                .kindsToIgnore as GeometryKind[]);
        }
    }

    wantsLayer(layer: string, level: number): boolean {
        if (
            VectorTileGenericFeatureFilter.matchLayer(
                layer,
                this.description.layersToProcess,
                level
            )
        ) {
            return true;
        }

        if (
            VectorTileGenericFeatureFilter.matchLayer(layer, this.description.layersToIgnore, level)
        ) {
            return false;
        }

        return this.description.processLayersDefault;
    }

    wantsPointFeature(layer: string, geometryType: VectorTileGeometryType, level: number): boolean {
        return this.wantsFeature(
            this.description.pointsToProcess,
            this.description.pointsToIgnore,
            layer,
            geometryType,
            level,
            this.description.processPointsDefault
        );
    }

    wantsLineFeature(layer: string, geometryType: VectorTileGeometryType, level: number): boolean {
        return this.wantsFeature(
            this.description.linesToProcess,
            this.description.linesToIgnore,
            layer,
            geometryType,
            level,
            this.description.processLinesDefault
        );
    }

    wantsPolygonFeature(
        layer: string,
        geometryType: VectorTileGeometryType,
        level: number
    ): boolean {
        return this.wantsFeature(
            this.description.polygonsToProcess,
            this.description.polygonsToIgnore,
            layer,
            geometryType,
            level,
            this.description.processPolygonsDefault
        );
    }

    wantsKind(kind: string | string[]): boolean {
        // undefined -> no way to filter
        if (kind === undefined) {
            return true;
        }

        return (
            !(
                this.disabledKinds !== undefined &&
                this.disabledKinds.hasOrIntersects(kind as GeometryKind)
            ) ||
            (this.enabledKinds !== undefined &&
                this.enabledKinds.hasOrIntersects(kind as GeometryKind))
        );
    }

    get hasKindFilter(): boolean {
        return this.enabledKinds !== undefined || this.disabledKinds !== undefined;
    }

    private wantsFeature(
        itemsToProcess: VectorTileFilterDescription[],
        itemsToIgnore: VectorTileFilterDescription[],
        layer: string,
        geometryType: VectorTileGeometryType,
        level: number,
        defaultResult: boolean
    ): boolean {
        for (const item of itemsToProcess) {
            if (level < item.minLevel || level > item.maxLevel) {
                continue;
            }

            if (!VectorTileFilterString.matchString(layer, item.layerName)) {
                // this rule is not for this layer
                continue;
            }

            if (item.geometryTypes !== undefined && item.geometryTypes.indexOf(geometryType) >= 0) {
                return true;
            }
        }

        for (const item of itemsToIgnore) {
            if (!VectorTileFilterString.matchString(layer, item.layerName)) {
                // this rule is not for this layer
                continue;
            }

            if (item.geometryTypes !== undefined && item.geometryTypes.indexOf(geometryType) >= 0) {
                return false;
            }
        }

        return defaultResult;
    }
}

/**
 * An [[VectorTileFeatureFilter]] implementation that delegates all filter decision
 * returning `true` for any predicate if all delegates return `true`.
 */
export class ComposedDataFilter implements VectorTileFeatureFilter {
    constructor(readonly filters: VectorTileFeatureFilter[]) {}

    get hasKindFilter() {
        return this.filters.reduce<boolean>(
            (result, filter) => result && filter.hasKindFilter,
            true
        );
    }

    wantsLayer(layer: string, level: number): boolean {
        return this.filters.reduce<boolean>(
            (result, filter) => result && filter.wantsLayer(layer, level),
            true
        );
    }
    wantsPointFeature(layer: string, geometryType: VectorTileGeometryType, level: number): boolean {
        return this.filters.reduce<boolean>(
            (result, filter) => result && filter.wantsPointFeature(layer, geometryType, level),
            true
        );
    }
    wantsLineFeature(layer: string, geometryType: VectorTileGeometryType, level: number): boolean {
        return this.filters.reduce<boolean>(
            (result, filter) => result && filter.wantsLineFeature(layer, geometryType, level),
            true
        );
    }
    wantsPolygonFeature(
        layer: string,
        geometryType: VectorTileGeometryType,
        level: number
    ): boolean {
        return this.filters.reduce<boolean>(
            (result, filter) => result && filter.wantsPolygonFeature(layer, geometryType, level),
            true
        );
    }
    wantsKind(kind: string | string[]): boolean {
        return this.filters.reduce<boolean>(
            (result, filter) => result && filter.wantsKind(kind),
            true
        );
    }
}
/**
 * `VectorTileFeatureModifier` implementation that uses a `VectorTileFeatureFilterDescription` to
 * filter `TileData` features before they are completely decoded.
 *
 * @hidden
 */
export class VectorTileGenericFeatureModifier implements VectorTileFeatureModifier {
    static matchItems(
        layerName: string,
        featureClass: string,
        items: VectorTileFilterDescription[]
    ): boolean {
        for (const item of items) {
            if (item.classes !== undefined) {
                if (!VectorTileFilterString.matchString(layerName, item.layerName)) {
                    continue;
                }
                for (const matchClass of item.classes) {
                    if (VectorTileFilterString.matchString(featureClass, matchClass)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    static matchAttribute(
        layerName: string,
        env: MapEnv,
        items: VectorTileFilterDescription[]
    ): boolean {
        for (const item of items) {
            if (item.featureAttribute !== undefined) {
                if (
                    VectorTileFilterString.matchString(layerName, item.layerName) &&
                    env.lookup(item.featureAttribute.key) === item.featureAttribute.value
                ) {
                    return true;
                }
            }
        }
        return false;
    }

    constructor(private description: VectorTileFeatureFilterDescription) {}

    doProcessPointFeature(layer: string, env: MapEnv): boolean {
        return this.doProcessFeature(
            this.description.pointsToProcess,
            this.description.pointsToIgnore,
            layer,
            env,
            this.description.processPointsDefault
        );
    }

    doProcessLineFeature(layer: string, env: MapEnv): boolean {
        return this.doProcessFeature(
            this.description.linesToProcess,
            this.description.linesToIgnore,
            layer,
            env,
            this.description.processLinesDefault
        );
    }

    doProcessPolygonFeature(layer: string, env: MapEnv): boolean {
        return this.doProcessFeature(
            this.description.polygonsToProcess,
            this.description.polygonsToIgnore,
            layer,
            env,
            this.description.processPolygonsDefault
        );
    }

    protected doProcessFeature(
        itemsToProcess: VectorTileFilterDescription[],
        itemsToIgnore: VectorTileFilterDescription[],
        layer: string,
        env: MapEnv,
        defaultResult: boolean
    ): boolean {
        if (layer === undefined || (itemsToProcess.length === 0 && itemsToIgnore.length === 0)) {
            return defaultResult;
        }

        let featureClass: string | undefined;
        const featureClassThing = env.lookup("class");

        if (featureClassThing !== undefined && featureClassThing !== null) {
            featureClass = featureClassThing.toString();
        }

        if (
            featureClass &&
            VectorTileGenericFeatureModifier.matchItems(layer, featureClass, itemsToProcess)
        ) {
            return true;
        }

        if (
            featureClass &&
            VectorTileGenericFeatureModifier.matchItems(layer, featureClass, itemsToIgnore)
        ) {
            return false;
        }

        if (VectorTileGenericFeatureModifier.matchAttribute(layer, env, itemsToProcess)) {
            return true;
        }

        if (VectorTileGenericFeatureModifier.matchAttribute(layer, env, itemsToIgnore)) {
            return false;
        }

        return defaultResult;
    }
}
