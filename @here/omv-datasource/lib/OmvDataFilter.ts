/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

import { MapEnv } from "@here/datasource-protocol/lib/Theme";
import {
    OmvFeatureFilterDescription,
    OmvFilterDescription,
    OmvFilterString,
    OmvGeometryType,
    OmvLayerFilterDescription
} from "./OmvDecoderDefs";
import { com } from "./proto/vector_tile";

/**
 * The `OmvFeatureFilter` is designed to work in an `OmvVisitor`/`visitOmv` combination (for
 * example, `OmvDecoder`). Returning `false` from any of the calls terminates processing of that
 * layer or feature.
 *
 * The `OmvFeatureFilter` is an "early-opt-out" filter, which cannot filter individual features,
 * because at that point the features are not really decoded. Use the [[OmvFeatureModifier]] to
 * filter for individual features.
 */
export interface OmvFeatureFilter {
    /**
     * Return `false` if the layer should not be processed.
     *
     * @param layer Current layer.
     * @param level Level of tile.
     */
    wantsLayer(layer: com.mapbox.pb.Tile.ILayer, level: number): boolean;

    /**
     * Return `false` if the point feature should not be processed.
     *
     * @param layer Current layer.
     * @param feature Current feature.
     * @param level Level of tile.
     */
    wantsPointFeature(
        layer: com.mapbox.pb.Tile.ILayer,
        feature: com.mapbox.pb.Tile.IFeature,
        level: number
    ): boolean;

    /**
     * Return `false` if the line feature should not be processed.
     *
     * @param layer Current layer.
     * @param feature Current feature.
     * @param level Level of tile.
     */
    wantsLineFeature(
        layer: com.mapbox.pb.Tile.ILayer,
        feature: com.mapbox.pb.Tile.IFeature,
        level: number
    ): boolean;

    /**
     * Return `false` if the polygon feature should not be processed.
     *
     * @param layer Current layer.
     * @param feature Current feature.
     * @param level Level of tile.
     */
    wantsPolygonFeature(
        layer: com.mapbox.pb.Tile.ILayer,
        feature: com.mapbox.pb.Tile.IFeature,
        level: number
    ): boolean;
}

/**
 * The `OmvFeatureModifier` can be used to filter individual features. It gets passed in the [[Env]]
 * of the feature, which contains all the values that can be searched for in a style. If a filter
 * function returns false, the feature is ignored, and no geometry is being created.
 *
 * In addition to pure filtering, the `OmvFeatureModifier` can also modify the [[Env]] of the
 * feature, or even add new properties to the feature, for example, traffic states. The
 * `OmvFeatureModifier` is executed before the styles are selected, so the geometry is created with
 * the modified feature properties.
 */
export interface OmvFeatureModifier {
    /**
     * Check if the point feature described by `env` should be processed. The properties can be
     * modified or added to.
     *
     * @param layer Current layer.
     * @param env Properties of point feature.
     * @param level Level of tile.
     * @returns `false` to ignore feature.
     */
    doProcessPointFeature(layer: com.mapbox.pb.Tile.ILayer, env: MapEnv, level: number): boolean;

    /**
     * Check if the line feature described by `env` should be processed. The properties can be
     * modified or added to.
     *
     * @param layer Current layer.
     * @param env Properties of line feature.
     * @param level Level of tile.
     * @returns `false` to ignore feature.
     */
    doProcessLineFeature(layer: com.mapbox.pb.Tile.ILayer, env: MapEnv, level: number): boolean;

    /**
     * Check if the polygon feature described by `env` should be processed. The properties can be
     * modified or added to.
     *
     * @param layer Current layer.
     * @param env Properties of polygon feature.
     * @param level Level of tile.
     * @returns `false` to ignore feature.
     */
    doProcessPolygonFeature(layer: com.mapbox.pb.Tile.ILayer, env: MapEnv, level: number): boolean;
}

/**
 * Builds an `OmvFilterDescription` (internal type) that specifies an [[OmvFeatureFilter]] as well
 * as an [[OmvFeatureModifier]].
 *
 */
export class OmvFeatureFilterDescriptionBuilder {
    private m_processLayersDefault: boolean = true;
    private m_processPointsDefault: boolean = true;
    private m_processLinesDefault: boolean = true;
    private m_processPolygonsDefault: boolean = true;

    private readonly m_layersToProcess = new Array<OmvLayerFilterDescription>();
    private readonly m_layersToIgnore = new Array<OmvLayerFilterDescription>();
    private readonly m_pointsToProcess = new Array<OmvFilterDescription>();
    private readonly m_ignoredPoints = new Array<OmvFilterDescription>();
    private readonly m_linesToProcess = new Array<OmvFilterDescription>();
    private readonly m_linesToIgnore = new Array<OmvFilterDescription>();
    private readonly m_polygonsToProcess = new Array<OmvFilterDescription>();
    private readonly m_polygonsToIgnore = new Array<OmvFilterDescription>();

    /**
     * Builds an `OmvFilterDescription` (internal type) that specifies an [[OmvFeatureFilter]] as
     * well as an [[OmvFeatureModifier]].
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
        options?: OmvFeatureFilterDescriptionBuilder.OmvFeatureFilterDescriptionBuilderOptions
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
        match = OmvFilterString.StringMatch.Match,
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
        match = OmvFilterString.StringMatch.Match,
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
    processPoint(options: OmvFeatureFilterDescriptionBuilder.FeatureOption) {
        this.addItem(
            this.m_pointsToProcess,
            options.layer,
            options.geomType,
            options.featureClass,
            options.matchLayer,
            options.matchClass,
            options.minLevel,
            options.maxLevel
        );
    }

    /**
     * Add valid point features.
     *
     * @param options multi feature options
     */
    processPoints(options: OmvFeatureFilterDescriptionBuilder.MultiFeatureOption) {
        this.addItems(
            this.m_pointsToProcess,
            options.layer,
            options.geomTypes,
            options.featureClasses,
            options.matchLayer,
            options.minLevel,
            options.maxLevel
        );
    }

    /**
     * Add a point feature that should be ignored.
     *
     * @param layer Layer name to be matched
     * @param geomType Optional geometry type to be limited to. If specified, but does not match,
     * the feature is ignored.
     * @param featureClass Optional class/classes to match. If specified, but does not match, the
     * feature is ignored.
     * @param matchLayer Match condition for the layer name.
     * @param matchClass Match condition for `featureClass`.
     */
    ignorePoint(
        layer: string,
        geomType: OmvGeometryType | OmvGeometryType[] | undefined,
        featureClass: string,
        matchLayer = OmvFilterString.StringMatch.Match,
        matchClass = OmvFilterString.StringMatch.Match
    ) {
        this.addItem(this.m_ignoredPoints, layer, geomType, featureClass, matchLayer, matchClass);
    }

    /**
     * Add point features that should be ignored.
     *
     * @param layer Layer name to be matched
     * @param geomTypes Optional geometry type to be limited to. If specified, but does not match,
     * the feature is ignored.
     * @param featureClasses Optional class/classes to match. If specified, but does not match, the
     * feature is ignored.
     * @param matchLayer Match condition for the layer name.
     * @param matchClass Match condition for `featureClass`.
     */
    ignorePoints(
        layer: string,
        geomTypes: OmvGeometryType | OmvGeometryType[] | undefined,
        featureClasses: OmvFilterString[],
        matchLayer = OmvFilterString.StringMatch.Match
    ) {
        this.addItems(this.m_ignoredPoints, layer, geomTypes, featureClasses, matchLayer);
    }

    /**
     * Add a valid line feature.
     *
     * @param layer Layer name to be matched.
     * @param geomType Optional geometry type to be limited to. If specified, but does not match,
     * the feature is ignored.
     * @param featureClass Optional class/classes to match. If specified, but does not match, the
     * feature is ignored.
     * @param matchLayer Match condition for the layer name.
     * @param matchClass Match condition for `featureClass`.
     */
    processLine(
        layer: string,
        geomType: OmvGeometryType | OmvGeometryType[] | undefined,
        featureClass: string,
        matchLayer = OmvFilterString.StringMatch.Match,
        matchClass = OmvFilterString.StringMatch.Match
    ) {
        this.addItem(this.m_linesToProcess, layer, geomType, featureClass, matchLayer, matchClass);
    }

    /**
     * Add valid line features.
     *
     * @param layer Layer name to be matched.
     * @param geomType Optional geometry type to be limited to. If specified, but does not match,
     * the feature is ignored.
     * @param featureClasses Optional class/classes to match. If specified, but does not match, the
     * feature is ignored.
     * @param matchLayer Match condition for the layer name.
     * @param matchClass Match condition for `featureClass`.
     */
    processLines(
        layer: string,
        geomType: OmvGeometryType | OmvGeometryType[] | undefined,
        featureClasses: OmvFilterString[],
        matchLayer = OmvFilterString.StringMatch.Match
    ) {
        this.addItems(this.m_linesToProcess, layer, geomType, featureClasses, matchLayer);
    }

    /**
     * Ignore a line feature.
     *
     * @param layer Layer name to be matched
     * @param geomType Optional geometry type to be limited to. If specified, but does not match,
     * the feature is ignored.
     * @param featureClass Optional class/classes to match. If specified, but does not match, the
     * feature is ignored.
     * @param matchLayer Match condition for the layer name.
     * @param matchClass Match condition for `featureClass`.
     */
    ignoreLine(
        layer: string,
        geomType: OmvGeometryType | OmvGeometryType[] | undefined,
        featureClass: string,
        matchLayer = OmvFilterString.StringMatch.Match,
        matchClass = OmvFilterString.StringMatch.Match
    ) {
        this.addItem(this.m_linesToIgnore, layer, geomType, featureClass, matchLayer, matchClass);
    }

    /**
     * Ignore line features.
     *
     * @param layer Layer name to be matched.
     * @param geomType Optional geometry type to be limited to. If specified, but does not match,
     * the feature is ignored.
     * @param featureClasses Optional class/classes to match. If specified, but does not match, the
     * feature is ignored.
     * @param matchLayer Match condition for the layer name.
     * @param matchClass Match condition for `featureClass`.
     */
    ignoreLines(
        layer: string,
        geomType: OmvGeometryType | OmvGeometryType[] | undefined,
        featureClasses: OmvFilterString[],
        matchLayer = OmvFilterString.StringMatch.Match
    ) {
        this.addItems(this.m_linesToIgnore, layer, geomType, featureClasses, matchLayer);
    }

    /**
     * Add a valid polygon feature.
     *
     * @param layer Layer name to be matched.
     * @param geomType Optional geometry type to be limited to. If specified, but does not match,
     * the feature is ignored.
     * @param featureClass Optional class/classes to match. If specified, but does not match, the
     * feature is ignored.
     * @param matchLayer Match condition for the layer name.
     * @param matchClass Match condition for `featureClass`.
     */
    processPolygon(
        layer: string,
        geomType: OmvGeometryType | OmvGeometryType[] | undefined,
        featureClass: string,
        matchLayer = OmvFilterString.StringMatch.Match,
        matchClass = OmvFilterString.StringMatch.Match
    ) {
        this.addItem(
            this.m_polygonsToProcess,
            layer,
            geomType,
            featureClass,
            matchLayer,
            matchClass
        );
    }

    /**
     * Add valid polygon features.
     *
     * @param layer Layer name to be matched.
     * @param geomTypes Optional geometry type to be limited to. If specified, but does not match,
     * the feature is ignored.
     * @param featureClasses Optional class/classes to match. If specified, but does not match, the
     * feature is ignored.
     * @param matchLayer Match condition for the layer name.
     * @param matchClass Match condition for `featureClass`.
     */
    processPolygons(
        layer: string,
        geomType: OmvGeometryType | OmvGeometryType[] | undefined,
        featureClasses: OmvFilterString[],
        matchLayer = OmvFilterString.StringMatch.Match
    ) {
        this.addItems(this.m_polygonsToProcess, layer, geomType, featureClasses, matchLayer);
    }

    /**
     * Ignore a valid polygon feature.
     *
     * @param layer Layer name to be matched
     * @param geomType Optional geometry type to be limited to. If specified, but does not match,
     * the feature is ignored.
     * @param featureClass Optional class/classes to match. If specified, but does not match, the
     * feature is ignored.
     * @param matchLayer Match condition for the layer name.
     * @param matchClass Match condition for `featureClass`.
     */
    ignorePolygon(
        layer: string,
        geomType: OmvGeometryType | OmvGeometryType[] | undefined,
        featureClass: string,
        matchLayer = OmvFilterString.StringMatch.Match,
        matchClass = OmvFilterString.StringMatch.Match
    ) {
        this.addItem(
            this.m_polygonsToIgnore,
            layer,
            geomType,
            featureClass,
            matchLayer,
            matchClass
        );
    }

    /**
     * Ignore polygon features.
     *
     * @param layer Layer name to be matched.
     * @param geomTypes Optional geometry type to be limited to. If specified, but does not match,
     * the feature is ignored.
     * @param featureClasses Optional class/classes to match. If specified, but does not match, the
     * feature is ignored.
     * @param matchLayer Match condition for the layer name.
     * @param matchClass Match condition for `featureClass`.
     */
    ignorePolygons(
        layer: string,
        geomType: OmvGeometryType | OmvGeometryType[] | undefined,
        featureClasses: OmvFilterString[],
        matchLayer = OmvFilterString.StringMatch.Match
    ) {
        this.addItems(this.m_polygonsToIgnore, layer, geomType, featureClasses, matchLayer);
    }

    /**
     * Create a filter description that can be passed as an option to the [[OmvDataSource]].
     */
    createDescription(): OmvFeatureFilterDescription {
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
            polygonsToIgnore: this.m_polygonsToIgnore
        };
    }

    private addItem(
        items: OmvFilterDescription[],
        layer: string,
        geomType: OmvGeometryType | OmvGeometryType[] | undefined,
        featureClass: string,
        matchLayer?: OmvFilterString.StringMatch,
        matchClass?: OmvFilterString.StringMatch,
        minLevel?: number,
        maxLevel?: number
    ) {
        if (minLevel === undefined || isNaN(minLevel)) {
            minLevel = 0;
        }
        if (maxLevel === undefined || isNaN(maxLevel)) {
            maxLevel = Infinity;
        }

        const item: OmvFilterDescription = {
            layerName: {
                value: layer,
                match: matchLayer === undefined ? OmvFilterString.StringMatch.Match : matchLayer
            },
            geometryTypes:
                geomType !== undefined
                    ? Array.isArray(geomType)
                        ? geomType
                        : [geomType]
                    : undefined,
            classes: [
                {
                    value: featureClass,
                    match: matchClass === undefined ? OmvFilterString.StringMatch.Match : matchClass
                }
            ],
            minLevel,
            maxLevel
        };

        items.push(item);
    }

    private addItems(
        items: OmvFilterDescription[],
        layer: string,
        geomType: OmvGeometryType | OmvGeometryType[] | undefined,
        featureClasses?: OmvFilterString[],
        matchLayer?: OmvFilterString.StringMatch,
        minLevel?: number,
        maxLevel?: number
    ) {
        if (minLevel === undefined || isNaN(minLevel)) {
            minLevel = 0;
        }
        if (maxLevel === undefined || isNaN(maxLevel)) {
            maxLevel = Infinity;
        }

        const item: OmvFilterDescription = {
            layerName: {
                value: layer,
                match: matchLayer === undefined ? OmvFilterString.StringMatch.Match : matchLayer
            },
            geometryTypes:
                geomType !== undefined
                    ? Array.isArray(geomType)
                        ? geomType
                        : [geomType]
                    : undefined,
            classes: featureClasses,
            minLevel,
            maxLevel
        };

        items.push(item);
    }
}

export namespace OmvFeatureFilterDescriptionBuilder {
    /**
     * Options for `OmvFeatureFilterDescriptionBuilder`.
     */
    export interface OmvFeatureFilterDescriptionBuilderOptions {
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
        geomType: OmvGeometryType | OmvGeometryType[] | undefined;
        /**
         * Optional class to match. If specified, but does not match, the feature is ignored.
         */
        featureClass: string;
        /**
         * Match condition for the layer name.
         */
        matchLayer?: OmvFilterString.StringMatch;
        /**
         * Match condition for `featureClass`.
         */
        matchClass?: OmvFilterString.StringMatch;
        /**
         * Minimum tile level to match.
         */
        minLevel?: number;
        /**
         * Maximum tile level to match.
         */
        maxLevel?: number;
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
        geomTypes?: OmvGeometryType | OmvGeometryType[] | undefined;
        /**
         * Optional classes to match. If specified, but does not match, the feature is ignored.
         */
        featureClasses?: OmvFilterString[];
        /**
         * Match condition for the layer name.
         */
        matchLayer?: OmvFilterString.StringMatch;
        /**
         * Minimum tile level to match.
         */
        minLevel?: number;
        /**
         * Maximum tile level to match.
         */
        maxLevel?: number;
    }
}

/**
 * `OmvFeatureFilter` implementation that uses a `OmvFeatureFilterDescription` to filter `TileData`
 * features before they are completely decoded.
 *
 * @hidden
 */
export class OmvGenericFeatureFilter implements OmvFeatureFilter {
    private static matchLayer(
        layer: com.mapbox.pb.Tile.ILayer,
        layerItems: OmvLayerFilterDescription[],
        level: number
    ): boolean {
        for (const layerItem of layerItems) {
            if (level < layerItem.minLevel || level > layerItem.maxLevel) {
                continue;
            }

            if (OmvFilterString.matchString(layer.name, layerItem.name)) {
                return true;
            }
        }
        return false;
    }

    constructor(private description: OmvFeatureFilterDescription) {}

    wantsLayer(layer: com.mapbox.pb.Tile.ILayer, level: number): boolean {
        if (OmvGenericFeatureFilter.matchLayer(layer, this.description.layersToProcess, level)) {
            return true;
        }

        if (OmvGenericFeatureFilter.matchLayer(layer, this.description.layersToIgnore, level)) {
            return false;
        }

        return this.description.processLayersDefault;
    }

    wantsPointFeature(
        layer: com.mapbox.pb.Tile.ILayer,
        feature: com.mapbox.pb.Tile.IFeature,
        level: number
    ): boolean {
        return this.wantsFeature(
            this.description.pointsToProcess,
            this.description.pointsToIgnore,
            layer,
            feature,
            level,
            this.description.processPointsDefault
        );
    }

    wantsLineFeature(
        layer: com.mapbox.pb.Tile.ILayer,
        feature: com.mapbox.pb.Tile.IFeature,
        level: number
    ): boolean {
        return this.wantsFeature(
            this.description.linesToProcess,
            this.description.linesToIgnore,
            layer,
            feature,
            level,
            this.description.processLinesDefault
        );
    }

    wantsPolygonFeature(
        layer: com.mapbox.pb.Tile.ILayer,
        feature: com.mapbox.pb.Tile.IFeature,
        level: number
    ): boolean {
        return this.wantsFeature(
            this.description.polygonsToProcess,
            this.description.polygonsToIgnore,
            layer,
            feature,
            level,
            this.description.processPolygonsDefault
        );
    }

    private wantsFeature(
        itemsToProcess: OmvFilterDescription[],
        itemsToIgnore: OmvFilterDescription[],
        layer: com.mapbox.pb.Tile.ILayer,
        feature: com.mapbox.pb.Tile.IFeature,
        level: number,
        defaultResult: boolean
    ): boolean {
        for (const item of itemsToProcess) {
            if (level < item.minLevel || level > item.maxLevel) {
                continue;
            }

            if (!OmvFilterString.matchString(layer.name, item.layerName)) {
                // this rule is not for this layer
                continue;
            }

            if (
                item.geometryTypes !== undefined &&
                feature.type !== undefined &&
                item.geometryTypes.indexOf(feature.type.valueOf() as OmvGeometryType) >= 0
            ) {
                return true;
            }
        }

        for (const item of itemsToIgnore) {
            if (!OmvFilterString.matchString(layer.name, item.layerName)) {
                // this rule is not for this layer
                continue;
            }

            if (
                item.geometryTypes !== undefined &&
                feature.type !== undefined &&
                item.geometryTypes.indexOf(feature.type.valueOf() as OmvGeometryType) >= 0
            ) {
                return false;
            }
        }

        return defaultResult;
    }
}

/**
 * `OmvFeatureModifier` implementation that uses a `OmvFeatureFilterDescription` to filter
 * `TileData` features before they are completely decoded.
 *
 * @hidden
 */
export class OmvGenericFeatureModifier implements OmvFeatureModifier {
    protected static matchItems(
        layerName: string,
        featureClass: string,
        items: OmvFilterDescription[]
    ): boolean {
        for (const item of items) {
            if (!OmvFilterString.matchString(layerName, item.layerName)) {
                continue;
            }

            const matchClasses = item.classes;

            if (featureClass !== undefined && matchClasses !== undefined) {
                for (const matchClass of matchClasses) {
                    if (OmvFilterString.matchString(featureClass, matchClass)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    constructor(private description: OmvFeatureFilterDescription) {}

    doProcessPointFeature(layer: com.mapbox.pb.Tile.ILayer, env: MapEnv): boolean {
        return this.doProcessFeature(
            this.description.pointsToProcess,
            this.description.pointsToIgnore,
            layer,
            env,
            this.description.processPointsDefault
        );
    }

    doProcessLineFeature(layer: com.mapbox.pb.Tile.ILayer, env: MapEnv): boolean {
        return this.doProcessFeature(
            this.description.linesToProcess,
            this.description.linesToIgnore,
            layer,
            env,
            this.description.processLinesDefault
        );
    }

    doProcessPolygonFeature(layer: com.mapbox.pb.Tile.ILayer, env: MapEnv): boolean {
        return this.doProcessFeature(
            this.description.polygonsToProcess,
            this.description.polygonsToIgnore,
            layer,
            env,
            this.description.processPolygonsDefault
        );
    }

    protected doProcessFeature(
        itemsToProcess: OmvFilterDescription[],
        itemsToIgnore: OmvFilterDescription[],
        layer: com.mapbox.pb.Tile.ILayer,
        env: MapEnv,
        defaultResult: boolean
    ): boolean {
        if (layer === undefined || layer.name === undefined) {
            return defaultResult;
        }

        let featureClass: string | undefined;
        const featureClassThing = env.lookup("class");

        if (featureClassThing !== undefined) {
            featureClass = featureClassThing.toString();
        }

        if (
            featureClass &&
            OmvGenericFeatureModifier.matchItems(layer.name, featureClass, itemsToProcess)
        ) {
            return true;
        }

        if (
            featureClass &&
            OmvGenericFeatureModifier.matchItems(layer.name, featureClass, itemsToIgnore)
        ) {
            return false;
        }

        return defaultResult;
    }
}
