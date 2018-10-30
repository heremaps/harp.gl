/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { TileKey } from "@here/harp-geoutils";
import { assert } from "@here/harp-utils";

import { Technique, TextTechnique } from "./Techniques";
import { Env, MapEnv, Value } from "./Theme";

export interface TileInfo {
    readonly tileKey: TileKey;
    readonly setupTime: number;
    readonly transferList?: ArrayBuffer[];
}

/**
 * Struct of arrays containing data for all features of this group. No methods, since the object is
 * being passed as part of ExtendedTileInfo across "process boundaries" to the web worker.
 *
 * Supporting methods in namespace [[ExtendedTileInfo]].
 */
export class FeatureGroup {
    /** featureIds */
    featureIds: Array<number | undefined> = new Array<number | undefined>();

    /** Indices into [[ExtendedTileInfo]].techniqueCatalog */
    techniqueIndex: number[];

    /** Indices into [[ExtendedTileInfo]].textCatalog. */
    textIndex: number[];

    /** Indices into positions. */
    positionIndex: number[];

    /** XY coordinates of this group. */
    positions: number[];

    /** number of features */
    numFeatures: number = 0;

    /** number of potition elements (2 per point) */
    numPositions: number = 0;

    /**
     * Optional indices into [[ExtendedTileInfo]].layerCatalog. Only available if
     * [[OmvFeatureGroup]] has been constructed with `storeExtendedTags` set to `true`.
     */
    layerIndex?: number[];

    /**
     * Optional indices into [[ExtendedTileInfo]].classCatalog. Only available if
     * [[OmvFeatureGroup]] has been constructed with `storeExtendedTags` set to `true`.
     */
    classIndex?: number[];

    /**
     * Optional indices into [[ExtendedTileInfo]].typeCatalog. Only available if [[OmvFeatureGroup]]
     * has been constructed with `storeExtendedTags` set to `true`.
     */
    typeIndex?: number[];

    /**
     * Construct featureGroup.
     *
     * @param storeExtendedTags Pass `true` to create fields for more OMV tags (`layer`, `class`
     * and `type`).
     */
    constructor(storeExtendedTags: boolean, startSize: number = 5000) {
        this.featureIds = new Array<number>(startSize);
        this.featureIds.length = startSize;
        this.techniqueIndex = new Array<number>(startSize);
        this.techniqueIndex.length = startSize;
        this.textIndex = new Array<number>(startSize);
        this.textIndex.length = startSize;
        this.positionIndex = new Array<number>(startSize);
        this.positionIndex.length = startSize;
        this.positions = new Array<number>(10 * startSize);
        this.positions.length = 10 * startSize;

        if (storeExtendedTags) {
            this.layerIndex = new Array<number>(startSize);
            this.layerIndex.length = startSize;
            this.classIndex = new Array<number>(startSize);
            this.classIndex.length = startSize;
            this.typeIndex = new Array<number>(startSize);
            this.typeIndex.length = startSize;
        }
    }
}

/**
 * Struct of arrays containing data for roads. No methods, since the object is being passed as part
 * of [[ExtendedTileInfo]] across "process boundaries" to the web worker.
 */
export class LineFeatureGroup extends FeatureGroup {
    /**
     * An array of road segment ids. Is the same length as `featureIds` but certain elements can be
     * `undefined` (if this line feature is not a road).
     */
    segmentIds?: number[];

    /**
     * An array of road start offsets. Certain elements may be `undefined` (if this line feature is
     * not a road).
     */
    segmentStartOffsets?: number[];

    /**
     * An array of road end offsets. Certain elements may be `undefined` (if this line feature is
     * not a road).
     */
    segmentEndOffsets?: number[];

    /**
     * An array of object defined by the user. Certain elements may be `undefined` (if this line
     * feature is not a road, or if the object for that feature is undefined).
     */
    userData?: Array<{} | undefined> = [];
}

/**
 * Struct of arrays containing data for polygons. No methods, since the object is being passed as
 * part of ExtendedTileInfo across "process boundaries" to the web worker.
 *
 * Supporting methods in namespase [[ExtendedTileInfo]].
 *
 * Due to the complexity of the access, there are supporting classes to store and access data in
 * the feature groups. See [[ExtendedTileInfoWriter]] and [[ExtendedTileInfoPolygonAccessor]].
 */
export class PolygonFeatureGroup extends FeatureGroup {
    /**
     * Indices into innerRingStartIndex. One entry for every polygon feature.
     *
     * Number of rings is computed by either:
     *
     * a) Computing from the next innerRingStart, or
     *
     * b) Computing from the size of the array.
     */
    outerRingStartIndex: number[];

    /**
     * One entry for every polygon feature. Contains `true` if a polygon ring is an _outside_ ring,
     * `false` otherwise.
     */
    innerRingIsOuterContour: number[];

    /**
     * Indices into [[OmvFeatureGroup]]`.positions`. One index for every ring.
     *
     * Number of inner rings is computed by either:
     *
     * a) Computing from the next innerRingStart, or
     *
     * b) Computing from the size of the array.
     */
    innerRingStartIndex: number[];

    /**
     * Number of rings stored in all polygons in tis group. Used to keep size of the
     * arrays.
     */
    groupNumRings: number = 0;

    constructor(storeExtendedTags: boolean, startSize: number = 5000) {
        super(storeExtendedTags, startSize);

        this.outerRingStartIndex = new Array<number>(startSize);
        this.outerRingStartIndex.length = startSize;
        this.innerRingIsOuterContour = new Array<number>(startSize);
        this.innerRingIsOuterContour.length = startSize;
        this.innerRingStartIndex = new Array<number>(startSize);
        this.innerRingStartIndex.length = startSize;
    }
}

/**
 * Class to hold infos from [[OmvTile]]s. Optimized for fast serialisation when being passed from
 * webworker to main thread. No methods, since the object is being passed across "process
 * boundaries" to the web worker.
 *
 * Supporting methods in namespace [[ExtendedTileInfo]].
 *
 * Due to the complexity of the access, there are supporting classes to store and access data in
 * the feature groups. See [[ExtendedTileInfoWriter]] and [[ExtendedTileInfoPolygonAccessor]].
 */
export class ExtendedTileInfo implements TileInfo {
    /**
     * Catalog of strings. Adressed by every features stringIndex.
     */
    readonly textCatalog: string[] = new Array<string>();
    /**
     * Catalog of techniques. Adressed by every features featureIndex.
     */
    readonly techniqueCatalog: Technique[] = new Array<Technique>();

    /**
     * Feature group containing all infos about `POINT` features.
     */
    readonly pointGroup: FeatureGroup;

    /**
     * Feature group containing all infos about `LINESTRING` features.
     */
    readonly lineGroup: LineFeatureGroup;

    /**
     * Feature group containing all infos about `POLYGON` features.
     */
    readonly polygonGroup: PolygonFeatureGroup;

    /**
     * Optional catalogs for extended feature infos. Only available if the [[ExtendedTileInfo]] has
     * been constructed with `storeExtendedTags` == `true`.
     */
    readonly layerCatalog?: string[];
    readonly classCatalog?: string[];
    readonly typeCatalog?: string[];

    setupTime: number = 0;

    constructor(readonly tileKey: TileKey, storeExtendedTags: boolean) {
        this.pointGroup = new FeatureGroup(storeExtendedTags);
        this.lineGroup = new LineFeatureGroup(storeExtendedTags);
        this.polygonGroup = new PolygonFeatureGroup(storeExtendedTags);

        if (storeExtendedTags) {
            this.layerCatalog = new Array<string>();
            this.classCatalog = new Array<string>();
            this.typeCatalog = new Array<string>();
        }
    }
}

export namespace ExtendedTileInfo {
    function finishFeatureGroup(featureGroup: FeatureGroup) {
        featureGroup.featureIds.length = featureGroup.numFeatures;
        featureGroup.techniqueIndex.length = featureGroup.numFeatures;
        featureGroup.textIndex.length = featureGroup.numFeatures;
        featureGroup.positionIndex.length = featureGroup.numFeatures;
        featureGroup.positions.length = featureGroup.numPositions;

        if (featureGroup.layerIndex !== undefined) {
            featureGroup.layerIndex.length = featureGroup.numFeatures;
        }
        if (featureGroup.classIndex !== undefined) {
            featureGroup.classIndex.length = featureGroup.numFeatures;
        }
        if (featureGroup.typeIndex !== undefined) {
            featureGroup.typeIndex.length = featureGroup.numFeatures;
        }
    }

    function finishPolygonFeatureGroup(polygonGroup: PolygonFeatureGroup) {
        finishFeatureGroup(polygonGroup);
        polygonGroup.outerRingStartIndex.length = polygonGroup.numFeatures;
        polygonGroup.innerRingIsOuterContour.length = polygonGroup.groupNumRings;
        polygonGroup.innerRingStartIndex.length = polygonGroup.groupNumRings;
    }

    function finishLineFeatureGroup(lineGroup: LineFeatureGroup) {
        finishFeatureGroup(lineGroup);
        if (lineGroup.segmentIds !== undefined) {
            lineGroup.segmentIds.length = lineGroup.numFeatures;
            lineGroup.segmentStartOffsets!.length = lineGroup.numFeatures;
            lineGroup.segmentEndOffsets!.length = lineGroup.numFeatures;
        }
    }

    export function finish(tileInfo: ExtendedTileInfo) {
        finishFeatureGroup(tileInfo.pointGroup);
        finishLineFeatureGroup(tileInfo.lineGroup);
        finishPolygonFeatureGroup(tileInfo.polygonGroup);
    }

    /**
     * Number of features in this feature group.
     */
    export function featureGroupSize(featureGroup: FeatureGroup): number {
        return featureGroup.numFeatures;
    }

    export function featureGroupFinished(featureGroup: FeatureGroup): boolean {
        return featureGroup.numPositions === featureGroup.positions.length;
    }

    export function tileInfoFinished(tileInfo: ExtendedTileInfo): boolean {
        return (
            featureGroupFinished(tileInfo.pointGroup) &&
            featureGroupFinished(tileInfo.lineGroup) &&
            featureGroupFinished(tileInfo.polygonGroup)
        );
    }

    /**
     * Determine the text string of the (OMV) feature. It implements the special handling required
     * to determine the text content of a feature from its tegas, which are passed in as the `env`.
     *
     * @param env Environment containing the tags from the (OMV) feature.
     * @param useAbbreviation `true` to use the abbreviation if available.
     * @param useIsoCode `true` to use the tag "iso_code".
     * @param languages List of languages to use, for example: Specify "en" to use the tag "name_en"
     *                  as the text of the string. Order reflects priority.
     */
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
            for (const lang of languages) {
                name = env.lookup(`name:${lang}`) || env.lookup(`name_${lang}`);
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

/**
 * Support class for [[ExtendedTileInfo]]. Assist in filling it with data.
 */
export class ExtendedTileInfoWriter {
    /** Map to identify which techniques already have been added to the [[ExtendedTileInfo]]. */
    private readonly techniqueIndexMap = new Map<number, number>();
    /** Map to identify which strings already have been added to the [[ExtendedTileInfo]]. */
    private readonly stringMap = new Map<string, number>();
    /** Map to identify which `layer` names already have been added to the [[ExtendedTileInfo]]. */
    private readonly layerMap = new Map<string, number>();
    /** Map to identify which `class` names already have been added to the [[ExtendedTileInfo]]. */
    private readonly classMap = new Map<string, number>();
    /** Map to identify which `type` names already have been added to the [[ExtendedTileInfo]]. */
    private readonly typeMap = new Map<string, number>();

    /**
     * Create an [[ExtendedTileInfoWriter]] for an [[ExtendedTileInfo]]. Assist in filling the
     * [[ExtendedTileInfo]] with data.
     *
     * @param tileInfo [[ExtendedTileInfo]] to write data to.
     * @param storeExtendedTags Pass `true` if feature data like `layer`, `class`or `type` should
     *          be stored for every feature.
     */
    constructor(
        readonly tileInfo: ExtendedTileInfo,
        readonly storeExtendedTags: boolean,
        private languages?: string[]
    ) {}

    /**
     * Add a [[Technique]] to the catalog of techniques. Individual techniques have a file `_index`
     * which has been created in the [[StyleSetEvaluator]]. This index is required to identify the
     * techniques. A `Map` is used map techniques to already added techniques, or store the
     * technique as new, and add it to the map.
     *
     * @param technique The [[Technique]] to add.
     */
    addTechnique(technique: Technique): number {
        if (technique._index === undefined) {
            throw new Error(
                "ExtendedTileInfoEmitter#processPointFeature: Internal error - No technique index"
            );
        }

        let infoTileTechniqueIndex = this.techniqueIndexMap.get(technique._index);
        if (infoTileTechniqueIndex !== undefined) {
            return infoTileTechniqueIndex;
        }

        infoTileTechniqueIndex = this.tileInfo.techniqueCatalog.length;

        // add a new technique. Select the subset of features that should be stored (e.g., _index is
        // not)
        const storedTechnique = {} as any;

        Object.getOwnPropertyNames(technique).forEach(property => {
            if (!property.startsWith("_")) {
                storedTechnique[property] = (technique as any)[property];
            }
        });

        // Keep the index to identify the original technique later.
        storedTechnique._index = technique._index;

        this.techniqueIndexMap.set(technique._index, infoTileTechniqueIndex);

        this.tileInfo.techniqueCatalog.push(storedTechnique);
        return infoTileTechniqueIndex;
    }

    /**
     * Add a feature.
     *
     * @param featureGroup The feature group to add to.
     * @param technique The technique to add.
     * @param env The `env` which is a mix of original OMV feature tags and fields added by the
     *      [[StyleSetEvaluator]]
     * @param featureId The featureId, a number unique for many features (but not all).
     * @param infoTileTechniqueIndex The previously computed index of the technique. Must have been
     *      computed by `addTechnique(technique)`.
     * @param isPolygonGroup `true`for polygons.
     */
    addFeature(
        featureGroup: FeatureGroup,
        technique: Technique,
        env: MapEnv,
        featureId: number | undefined,
        infoTileTechniqueIndex: number,
        isPolygonGroup: boolean
    ) {
        // compute name/label of feature
        const textTechnique = technique as TextTechnique;
        const textLabel = textTechnique.label;
        const useAbbreviation = textTechnique.useAbbreviation as boolean;
        const useIsoCode = textTechnique.useIsoCode as boolean;
        const name: Value =
            typeof textLabel === "string"
                ? env.lookup(textLabel)
                : ExtendedTileInfo.getFeatureName(env, useAbbreviation, useIsoCode, this.languages);
        let stringIndex = -1;
        if (name && typeof name === "string") {
            stringIndex = this.addText(name);
        }

        // add indices into the arrays.
        featureGroup.featureIds[featureGroup.numFeatures] = featureId;
        featureGroup.techniqueIndex[featureGroup.numFeatures] = infoTileTechniqueIndex;
        featureGroup.textIndex[featureGroup.numFeatures] = stringIndex;
        featureGroup.positionIndex[featureGroup.numFeatures] = featureGroup.numPositions;

        // polygons need the extra fields for polygon rings
        if (isPolygonGroup) {
            const polygonGroup = featureGroup as PolygonFeatureGroup;
            assert(polygonGroup.outerRingStartIndex !== undefined);
            assert(polygonGroup.innerRingStartIndex !== undefined);
            assert(polygonGroup.innerRingIsOuterContour !== undefined);
            polygonGroup.outerRingStartIndex[featureGroup.numFeatures] = polygonGroup.groupNumRings;
        }

        // store the extra feature fields
        if (this.storeExtendedTags) {
            featureGroup.layerIndex![featureGroup.numFeatures] = this.addLayer(
                env.lookup("$layer")
            );
            featureGroup.classIndex![featureGroup.numFeatures] = this.addClass(env.lookup("class"));
            featureGroup.typeIndex![featureGroup.numFeatures] = this.addType(env.lookup("type"));
        }

        featureGroup.numFeatures++;
    }

    /**
     * Add the X/Y coordinate of the point. Only for point feature groups.
     *
     * @param featureGroup The feature group to add it to.
     * @param x X Position of point.
     * @param y Y Position of point.
     */
    addFeaturePoint(featureGroup: FeatureGroup, x: number, y: number) {
        featureGroup.positions[featureGroup.numPositions++] = x;
        featureGroup.positions[featureGroup.numPositions++] = y;
    }

    /**
     * Add the line points as X/Y coordinates to the line feature.
     *
     * If a line feature has more than one line (rare for HERE data), it should define multiple
     * line features for it.
     *
     * @param featureGroup The feature group to add to. Must be line feature group.
     * @param points The X/Y coordinates of the points.
     */
    addFeaturePoints(featureGroup: FeatureGroup, points: number[]) {
        const n = featureGroup.numPositions;
        const l = points.length;
        const p = featureGroup.positions;
        for (let i = 0; i < l; i++) {
            p[n + i] = points[i];
        }
        featureGroup.numPositions += points.length;
    }

    /**
     * Add the information about road segments to the line feature. Performs lazy initialization of
     * `segmentIds`, `segmentStartOffsets`, and `segmentEndOffsets` members of a
     * [[LineFeatureGroup]] instance.
     *
     * @param featureGroup The line feature group to add information to.
     * @param segmentId Segment id of a feature.
     * @param startOffset Start offset of a feature.
     * @param endOffset End offset of a feature.
     */
    addRoadSegments(
        featureGroup: LineFeatureGroup,
        segmentId: number,
        startOffset: number,
        endOffset: number
    ) {
        if (featureGroup.segmentIds === undefined) {
            featureGroup.segmentIds = new Array<number>();
            featureGroup.segmentStartOffsets = new Array<number>();
            featureGroup.segmentEndOffsets = new Array<number>();
        }

        featureGroup.segmentIds[featureGroup.numFeatures - 1] = segmentId;
        featureGroup.segmentStartOffsets![featureGroup.numFeatures - 1] = startOffset;
        featureGroup.segmentEndOffsets![featureGroup.numFeatures - 1] = endOffset;
    }

    /**
     * Add a single ring to the polygon. Can be called multiple times to add multiple rings to the
     * polygon.
     *
     * @param featureGroup Polygon feature group to add polygon ring to.
     * @param contour The X/Y coordinates of the ring.
     * @param isOuterRing Pass `true`if it is a outer ring, otherwise `false`.
     */
    addRingPoints(featureGroup: PolygonFeatureGroup, contour: number[], isOuterRing: boolean) {
        featureGroup.innerRingStartIndex[featureGroup.groupNumRings] = featureGroup.numPositions;
        featureGroup.innerRingIsOuterContour[featureGroup.groupNumRings] = isOuterRing ? 1 : 0;
        featureGroup.groupNumRings++;

        const n = featureGroup.numPositions;
        const l = contour.length;
        const p = featureGroup.positions;
        for (let i = 0; i < l; i++) {
            p[n + i] = contour[i];
        }
        featureGroup.numPositions += contour.length;
    }

    finish(): any {
        ExtendedTileInfo.finish(this.tileInfo);
    }

    private addText(name: Value): number {
        return this.addStringValue(name, this.tileInfo.textCatalog, this.stringMap);
    }

    private addLayer(name: Value): number {
        return this.addStringValue(name, this.tileInfo.layerCatalog!, this.layerMap);
    }

    private addClass(name: Value): number {
        return this.addStringValue(name, this.tileInfo.classCatalog!, this.classMap);
    }

    private addType(name: Value): number {
        return this.addStringValue(name, this.tileInfo.typeCatalog!, this.typeMap);
    }

    // Add a string to the strings catalog. Returns index into the catalog.
    private addStringValue(str: Value, catalog: string[], map: Map<string, number>): number {
        if (str === undefined) {
            return -1;
        }
        const name = str.toString();
        let i = map.get(name);
        if (i !== undefined) {
            return i;
        }
        i = catalog.length;
        catalog.push(name);
        map.set(name, i);
        return i;
    }
}

/**
 * Support for [[ExtendedTileInfo]]. Defines the accessor that allows to access the polygon data.
 */
export interface ExtendedTileInfoPolygonAccessor {
    /**
     * Number of rings in the polygon.
     */
    numRings: number;

    /**
     * Return if ring is an outer ring.
     *
     * @param ringIndex Specify ring index.
     * @return `true` if ring is an outer ring, `false` otherwise.
     */
    isOuterRing(ringIndex: number): boolean;

    /**
     * Return information about the vertices that make up the ring.
     *
     * @param ringIndex Specify ring index.
     * @returns Info about the array, start and number of points in the ring.
     */
    getPoints(
        ringIndex: number
    ): {
        points: ArrayLike<number>;
        pointsStart: number;
        numPointValues: number;
    };
}

/**
 * Implementation of [[ExtendedTileInfoPolygonAccessor]].
 */
class ExtendedTileInfoPolygonAccessorImpl implements ExtendedTileInfoPolygonAccessor {
    polygons: PolygonFeatureGroup = new PolygonFeatureGroup(false, 5000);
    featureIndex: number = 0;
    ringStart: number = 0;
    numRings: number = 0;

    setup(
        polygons: PolygonFeatureGroup,
        featureIndex: number,
        ringStart: number,
        numRings: number
    ) {
        this.polygons = polygons;
        this.featureIndex = featureIndex;
        this.ringStart = ringStart;
        this.numRings = numRings;
    }

    isOuterRing(ringIndex: number): boolean {
        assert(ringIndex >= 0);
        assert(ringIndex < this.numRings);
        if (ringIndex < 0 || ringIndex >= this.numRings) {
            throw new Error("ExtendedTileInfoPolygonAccessor: Invalid ring index");
        }
        return this.polygons.innerRingIsOuterContour[this.ringStart + ringIndex] !== 0;
    }

    getPoints(
        ringIndex: number
    ): {
        points: ArrayLike<number>;
        pointsStart: number;
        numPointValues: number;
    } {
        assert(ringIndex >= 0);
        assert(ringIndex < this.numRings);
        if (ringIndex < 0 || ringIndex >= this.numRings) {
            throw new Error("ExtendedTileInfoPolygonAccessor: Invalid ring index");
        }

        // compute the start/size of the points in this ring. All `points` are actually just the
        // indices of a single X/Y coordinate.
        const pointsStart = this.polygons.innerRingStartIndex[this.ringStart + ringIndex];

        let numPointValues: number;
        if (ringIndex < this.numRings - 1) {
            numPointValues =
                this.polygons.innerRingStartIndex[this.ringStart + ringIndex + 1] - pointsStart;
        } else {
            if (this.ringStart + ringIndex < this.polygons.innerRingStartIndex.length - 1) {
                numPointValues =
                    this.polygons.innerRingStartIndex[this.ringStart + ringIndex + 1] - pointsStart;
            } else {
                numPointValues = this.polygons.positions.length - pointsStart;
            }
        }

        return {
            points: this.polygons.positions,
            pointsStart,
            numPointValues
        };
    }
}

/**
 * Interface that a client of [[ExtendedTileInfoAccessor]] has to implement.
 */
export interface ExtendedTileInfoHandler {
    acceptPoint?(
        featureId: number | undefined,
        techniqueIndex: number,
        x: number,
        y: number,
        label: number,
        layerName: number,
        className: number,
        typeName: number
    ): void;

    acceptLine?(
        featureId: number | undefined,
        techniqueIndex: number,
        label: number,
        layerName: number,
        className: number,
        typeName: number,
        points: ArrayLike<number>,
        pointsStart: number,
        numElements: number,
        segmentId?: number,
        startOffset?: number,
        endOffset?: number
    ): void;

    acceptPolygon?(
        featureId: number | undefined,
        techniqueIndex: number,
        label: number,
        layerName: number,
        className: number,
        typeName: number,
        polygonAccessor: ExtendedTileInfoPolygonAccessor
    ): void;
}

/**
 * Supporting class for [[ExtendedTileInfo]]. Takes an [[ExtendedTileInfoHandler]] and calls an
 * `accept` for every feature of the [[ExtendedTileInfo]], or just all features of a specified
 * `featureId`.
 */
export class ExtendedTileInfoVisitor {
    // static instance to work without allocations.
    private static polygonAccessor = new ExtendedTileInfoPolygonAccessorImpl();

    constructor(readonly tileInfo: ExtendedTileInfo) {}

    /**
     * Visit all feature in the [[ExtendedTileInfo]]
     *
     * @param handler Let the `handler` visit all features.
     */
    visitAll(handler: ExtendedTileInfoHandler) {
        this.visitAllPointFeatures(handler);
        this.visitAllLineFeatures(handler);
        this.visitAllPolygonFeatures(handler);
    }

    /**
     * Visit all features of a specified featureId.
     *
     * @param featureId The featureId to visit.
     * @param handler The `handler` to use.
     */
    visitFeature(featureId: number, handler: ExtendedTileInfoHandler): number {
        let numFeaturesFound = 0;
        const numPointFeatures = this.tileInfo.pointGroup.numFeatures;
        const pointFeatures = this.tileInfo.pointGroup.featureIds;
        for (let i = 0; i < numPointFeatures; i++) {
            if (pointFeatures[i] === featureId) {
                numFeaturesFound++;
                this.visitPointFeature(i, handler);
            }
        }
        const numLineFeatures = this.tileInfo.lineGroup.numFeatures;
        const lineFeatures = this.tileInfo.lineGroup.featureIds;
        for (let i = 0; i < numLineFeatures; i++) {
            if (lineFeatures[i] === featureId) {
                numFeaturesFound++;
                this.visitLineFeature(i, handler);
            }
        }
        const numPolygonFeatures = this.tileInfo.polygonGroup.numFeatures;
        const polygonsFeatures = this.tileInfo.polygonGroup.featureIds;
        for (let i = 0; i < numPolygonFeatures; i++) {
            if (polygonsFeatures[i] === featureId) {
                numFeaturesFound++;
                this.visitPolygonFeature(i, handler);
            }
        }
        return numFeaturesFound;
    }

    /**
     * Visit all `POINT` features.
     *
     * @param handler The `handler` to use.
     */
    visitAllPointFeatures(handler: ExtendedTileInfoHandler): void {
        const numFeatures = this.tileInfo.pointGroup.numFeatures;

        for (let i = 0; i < numFeatures; i++) {
            this.visitPointFeature(i, handler);
        }
    }

    /**
     * Visit all `LINESTRING` features.
     *
     * @param handler The handler to use.
     */
    visitAllLineFeatures(handler: ExtendedTileInfoHandler): void {
        const numFeatures = this.tileInfo.lineGroup.numFeatures;

        for (let i = 0; i < numFeatures; i++) {
            this.visitLineFeature(i, handler);
        }
    }

    /**
     * Visit all `POLYGON` features.
     *
     * @param handler The `handler` to use.
     */
    visitAllPolygonFeatures(handler: ExtendedTileInfoHandler): void {
        const numFeatures = this.tileInfo.polygonGroup.numFeatures;

        for (let i = 0; i < numFeatures; i++) {
            this.visitPolygonFeature(i, handler);
        }
    }

    private getTag(featureIndex: number, index: number[]): number {
        return index !== undefined && index[featureIndex] >= 0 ? index[featureIndex] : -1;
    }

    /**
     * Call the `handler` on a point feaure.
     *
     * @param featureIndex The index of the feature into the feature table.
     * @param handler The `handler` to use.
     */
    private visitPointFeature(featureIndex: number, handler: ExtendedTileInfoHandler): void {
        const tileInfo = this.tileInfo;
        const points = tileInfo.pointGroup;

        const start = points.positionIndex[featureIndex];
        const x = points.positions[start];
        const y = points.positions[start + 1];

        if (!!handler.acceptPoint) {
            handler.acceptPoint(
                points.featureIds[featureIndex],
                points.techniqueIndex[featureIndex],
                x,
                y,
                points.textIndex[featureIndex],
                this.getTag(featureIndex, points.layerIndex!),
                this.getTag(featureIndex, points.classIndex!),
                this.getTag(featureIndex, points.typeIndex!)
            );
        }
    }

    /**
     * Call the `handler` on a line feaure.
     *
     * @param featureIndex The index of the feature into the feature table.
     * @param handler The `handler` to use.
     */
    private visitLineFeature(featureIndex: number, handler: ExtendedTileInfoHandler): void {
        const tileInfo = this.tileInfo;
        const lines = tileInfo.lineGroup;

        const numFeatures = lines.numFeatures;
        const positionsStart = lines.positionIndex[featureIndex];
        const numPointValues =
            featureIndex === numFeatures - 1
                ? lines.positions.length - positionsStart
                : lines.positionIndex[featureIndex + 1] - positionsStart;

        let segmentId: number | undefined;
        let startOffset: number | undefined;
        let endOffset: number | undefined;

        if (lines.segmentIds !== undefined) {
            segmentId = lines.segmentIds[featureIndex];
            startOffset = lines.segmentStartOffsets![featureIndex];
            endOffset = lines.segmentEndOffsets![featureIndex];
        }

        if (!!handler.acceptLine) {
            handler.acceptLine(
                lines.featureIds[featureIndex],
                lines.techniqueIndex[featureIndex],
                lines.textIndex[featureIndex],
                this.getTag(featureIndex, lines.layerIndex!),
                this.getTag(featureIndex, lines.classIndex!),
                this.getTag(featureIndex, lines.typeIndex!),
                tileInfo.lineGroup.positions,
                positionsStart,
                numPointValues,
                segmentId,
                startOffset,
                endOffset
            );
        }
    }

    /**
     * Call the `handler` on a polygon feaure.
     *
     * @param featureIndex The index of the feature into the feature table.
     * @param handler The `handler` to use.
     */
    private visitPolygonFeature(featureIndex: number, handler: ExtendedTileInfoHandler): void {
        const tileInfo = this.tileInfo;
        const polygons = tileInfo.polygonGroup;

        const numFeatures = polygons.numFeatures;
        const ringStart = polygons.outerRingStartIndex[featureIndex];
        const numRings =
            featureIndex === numFeatures - 1
                ? polygons.innerRingStartIndex.length - ringStart
                : polygons.outerRingStartIndex[featureIndex + 1] - ringStart;

        // Use a static instance, so we do not allocate anything here
        ExtendedTileInfoVisitor.polygonAccessor.setup(polygons, featureIndex, ringStart, numRings);

        if (!!handler.acceptPolygon) {
            handler.acceptPolygon(
                polygons.featureIds[featureIndex],
                polygons.techniqueIndex[featureIndex],
                polygons.textIndex[featureIndex],
                this.getTag(featureIndex, polygons.layerIndex!),
                this.getTag(featureIndex, polygons.classIndex!),
                this.getTag(featureIndex, polygons.typeIndex!),
                ExtendedTileInfoVisitor.polygonAccessor
            );
        }
    }
}
