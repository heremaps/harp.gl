/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { TileKey } from "@here/harp-geoutils";
import { assert } from "@here/harp-utils";

import { Env, MapEnv, Value } from "./Expr";
import { makeDecodedTechnique } from "./StyleSetEvaluator";
import { AttrEvaluationContext, evaluateTechniqueAttr } from "./TechniqueAttr";
import {
    IndexedTechnique,
    isLineMarkerTechnique,
    isPoiTechnique,
    isTextTechnique,
    Technique
} from "./Techniques";

/**
 * Defines a map tile metadata.
 */
export interface TileInfo {
    readonly tileKey: TileKey;
    readonly setupTime: number;
    readonly transferList?: ArrayBuffer[];
    readonly numBytes: number;
}

/**
 * Represents a feature group type for tile info.
 */
export enum FeatureGroupType {
    Point,
    Line,
    Polygon
}

/**
 * Minimum estimated size of a JS object.
 */
const MINIMUM_OBJECT_SIZE_ESTIMATION = 100;

/**
 * Structure of arrays containing data for all features of this group. No methods, since the object
 * is being passed as part of ExtendedTileInfo across "process boundaries" to the web worker.
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

    /** number of positions of elements (2 per point) */
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

    /**
     * Compute size in bytes.
     */
    getNumBytes(): number {
        return (
            (this.featureIds.length +
                this.techniqueIndex.length +
                this.textIndex.length +
                this.positionIndex.length +
                this.positions.length +
                (this.layerIndex !== undefined ? this.layerIndex.length : 0) +
                (this.classIndex !== undefined ? this.classIndex.length : 0) +
                (this.typeIndex !== undefined ? this.typeIndex.length : 0)) *
            8
        );
    }
}

/**
 * Structure of arrays containing data for roads. No methods, since the object is being passed as
 * part of [[ExtendedTileInfo]] across "process boundaries" to the web worker.
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
    userData: Array<{} | undefined> = [];

    /** @override */
    getNumBytes(): number {
        return (
            super.getNumBytes() +
            ((this.segmentIds !== undefined ? this.segmentIds.length : 0) +
                (this.segmentStartOffsets !== undefined ? this.segmentStartOffsets.length : 0) +
                (this.segmentEndOffsets !== undefined ? this.segmentEndOffsets.length : 0)) *
                8
        );
    }
}

/**
 * Structure of arrays containing data for polygons. No methods, since the object is being passed as
 * part of ExtendedTileInfo across "process boundaries" to the web worker.
 *
 * Supporting methods in namespace [[ExtendedTileInfo]].
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

    /** @override */
    getNumBytes(): number {
        return (
            super.getNumBytes() +
            ((this.outerRingStartIndex !== undefined ? this.outerRingStartIndex.length : 0) +
                (this.innerRingIsOuterContour !== undefined
                    ? this.innerRingIsOuterContour.length
                    : 0) +
                (this.innerRingStartIndex !== undefined ? this.innerRingStartIndex.length : 0)) *
                8
        );
    }
}

/**
 * Class to hold infos from [[OmvTile]]s. Optimized for fast serialization when being passed from
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
     * Catalog of strings. Addressed by every features stringIndex.
     */
    readonly textCatalog: string[] = new Array<string>();
    /**
     * Catalog of techniques. Addressed by every features featureIndex.
     */
    readonly techniqueCatalog: IndexedTechnique[] = new Array<IndexedTechnique>();

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

    /**
     * Optional catalogs for extended feature infos. Only available if the [[ExtendedTileInfo]] has
     * been constructed with `storeExtendedTags` == `true`.
     */
    readonly classCatalog?: string[];

    /**
     * Optional catalogs for extended feature infos. Only available if the [[ExtendedTileInfo]] has
     * been constructed with `storeExtendedTags` == `true`.
     */
    readonly typeCatalog?: string[];

    /**
     * Used for performance diagnostics.
     */
    setupTime: number = 0;

    /**
     * Size in bytes.
     */
    numBytes: number = 0;

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

    /**
     * Compute the memory footprint caused by objects owned by the `ExtendedTileInfo`.
     */
    getNumBytes(): number {
        let numBytes = MINIMUM_OBJECT_SIZE_ESTIMATION;
        for (const str of this.textCatalog) {
            numBytes += 2 * str.length;
        }

        numBytes += this.techniqueCatalog.length * MINIMUM_OBJECT_SIZE_ESTIMATION;

        numBytes += this.pointGroup.getNumBytes();
        numBytes += this.lineGroup.getNumBytes();
        numBytes += this.polygonGroup.getNumBytes();

        if (this.layerCatalog !== undefined) {
            for (const str of this.layerCatalog) {
                numBytes += 2 * str.length;
            }
            for (const str of this.classCatalog!) {
                numBytes += 2 * str.length;
            }
            for (const str of this.typeCatalog!) {
                numBytes += 2 * str.length;
            }
        }

        return numBytes;
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

    /**
     * Finalize the tile's features groups.
     */
    export function finish(tileInfo: ExtendedTileInfo) {
        finishFeatureGroup(tileInfo.pointGroup);
        finishLineFeatureGroup(tileInfo.lineGroup);
        finishPolygonFeatureGroup(tileInfo.polygonGroup);
        tileInfo.numBytes = tileInfo.getNumBytes();
    }

    /**
     * Returns the number of features in this feature group.
     */
    export function featureGroupSize(featureGroup: FeatureGroup): number {
        return featureGroup.numFeatures;
    }

    /**
     * Check if the feature group is finalized.
     */
    export function featureGroupFinished(featureGroup: FeatureGroup): boolean {
        return featureGroup.numPositions === featureGroup.positions.length;
    }

    /**
     * Check if the tileInfo is finalized.
     */
    export function tileInfoFinished(tileInfo: ExtendedTileInfo): boolean {
        return (
            featureGroupFinished(tileInfo.pointGroup) &&
            featureGroupFinished(tileInfo.lineGroup) &&
            featureGroupFinished(tileInfo.polygonGroup)
        );
    }

    /**
     * Determine the name of (OMV) feature. It implements the special handling required
     * to determine the text content of a feature from its tags, which are passed in as the `env`.
     *
     * @param env Environment containing the tags from the (OMV) feature.
     * @param useAbbreviation `true` to use the abbreviation if available.
     * @param useIsoCode `true` to use the tag "iso_code".
     * @param languages List of languages to use, for example: Specify "en" to use the tag "name_en"
     *                  as the text of the string. Order reflects priority.
     */
    export function getFeatureName(
        env: Env,
        useAbbreviation?: boolean,
        useIsoCode?: boolean,
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

    /**
     * Determine the text string of the map feature. It implements the special handling required
     * to determine the text content of a feature from its tags, which are passed in as the `env`.
     *
     * @param feature Feature, including properties from the (OMV) feature.
     * @param technique technique defining how text should be created from feature
     * @param languages List of languages to use, for example: Specify "en" to use the tag "name_en"
     *                  as the text of the string. Order reflects priority.
     */
    export function getFeatureText(
        context: Env | AttrEvaluationContext,
        technique: Technique,
        languages?: string[]
    ): string | undefined {
        let useAbbreviation: boolean | undefined;
        let useIsoCode: boolean | undefined;
        const env = context instanceof Env ? context : context.env;
        if (
            isTextTechnique(technique) ||
            isPoiTechnique(technique) ||
            isLineMarkerTechnique(technique)
        ) {
            if (technique.text !== undefined) {
                return evaluateTechniqueAttr(context, technique.text);
            }
            // tslint:disable-next-line: deprecation
            if (technique.label !== undefined) {
                // tslint:disable-next-line: deprecation
                const name = env.lookup(technique.label);
                return typeof name === "string" ? name : undefined;
            }
            // tslint:disable-next-line: deprecation
            useAbbreviation = technique.useAbbreviation;
            // tslint:disable-next-line: deprecation
            useIsoCode = technique.useIsoCode;
        }

        return getFeatureName(env, useAbbreviation, useIsoCode, languages);
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
    constructor(readonly tileInfo: ExtendedTileInfo, readonly storeExtendedTags: boolean) {}

    /**
     * Adds a [[Technique]] to the catalog of techniques. Individual techniques have a `_index` file
     * which has been created in the [[StyleSetEvaluator]]. This index is required to identify a
     * technique. The `Map` is used to map techniques to already added techniques, or store the
     * technique as new, and add it to the map.
     *
     * @param technique The [[Technique]] to add.
     */
    addTechnique(technique: IndexedTechnique): number {
        let infoTileTechniqueIndex = this.techniqueIndexMap.get(technique._index);
        if (infoTileTechniqueIndex !== undefined) {
            return infoTileTechniqueIndex;
        }

        const decodedTechnique = makeDecodedTechnique(technique);

        infoTileTechniqueIndex = this.tileInfo.techniqueCatalog.length;
        this.techniqueIndexMap.set(decodedTechnique._index, infoTileTechniqueIndex);
        this.tileInfo.techniqueCatalog.push(decodedTechnique);

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
        env: MapEnv,
        featureId: number | undefined,
        featureText: string | undefined,
        infoTileTechniqueIndex: number,
        featureGroupType: FeatureGroupType
    ) {
        // compute name/label of feature
        let stringIndex = -1;
        if (featureText !== undefined && featureText.length > 0) {
            stringIndex = this.addText(featureText);
        }

        // add indices into the arrays.
        featureGroup.featureIds[featureGroup.numFeatures] = featureId;
        featureGroup.techniqueIndex[featureGroup.numFeatures] = infoTileTechniqueIndex;
        featureGroup.textIndex[featureGroup.numFeatures] = stringIndex;
        featureGroup.positionIndex[featureGroup.numFeatures] = featureGroup.numPositions;

        switch (featureGroupType) {
            case FeatureGroupType.Polygon:
                // polygons need the extra fields for polygon rings
                const polygonGroup = featureGroup as PolygonFeatureGroup;
                assert(polygonGroup.outerRingStartIndex !== undefined);
                assert(polygonGroup.innerRingStartIndex !== undefined);
                assert(polygonGroup.innerRingIsOuterContour !== undefined);
                polygonGroup.outerRingStartIndex[featureGroup.numFeatures] =
                    polygonGroup.groupNumRings;
                break;
            case FeatureGroupType.Line:
                (featureGroup as LineFeatureGroup).userData[featureGroup.numFeatures] = env.entries;
                break;
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

    /**
     * Finalize the tile info's feature group.
     */
    finish(): any {
        ExtendedTileInfo.finish(this.tileInfo);
    }

    private addText(name: Value | undefined): number {
        return this.addStringValue(name, this.tileInfo.textCatalog, this.stringMap);
    }

    private addLayer(name: Value | undefined): number {
        return this.addStringValue(name, this.tileInfo.layerCatalog!, this.layerMap);
    }

    private addClass(name: Value | undefined): number {
        return this.addStringValue(name, this.tileInfo.classCatalog!, this.classMap);
    }

    private addType(name: Value | undefined): number {
        return this.addStringValue(name, this.tileInfo.typeCatalog!, this.typeMap);
    }

    // Add a string to the strings catalog. Returns index into the catalog.
    private addStringValue(
        str: Value | undefined,
        catalog: string[],
        map: Map<string, number>
    ): number {
        if (str === undefined || str === null) {
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
    /**
     * Accessed data for polygons feature group.
     */
    polygons?: PolygonFeatureGroup;
    /**
     * Feature's index in the group.
     */
    featureIndex: number = 0;
    /**
     * Indicates where the ring starts.
     */
    ringStart: number = 0;
    /**
     * Number of rings.
     */
    numRings: number = 0;

    /**
     * Setup the accessor for extended [[TileInfo]].
     *
     * @param polygons polygons feature group.
     * @param featureIndex feature's index in the group.
     * @param ringStart where the ring starts.
     * @param numRings number of rings.
     */
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

    /**
     * Shut down the accessor and free all references.
     */
    reset() {
        this.polygons = undefined;
        this.featureIndex = 0;
        this.ringStart = 0;
        this.numRings = 0;
    }

    isOuterRing(ringIndex: number): boolean {
        assert(ringIndex >= 0);
        assert(ringIndex < this.numRings);
        assert(this.polygons !== undefined);
        if (ringIndex < 0 || ringIndex >= this.numRings || this.polygons === undefined) {
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
        assert(this.polygons !== undefined);
        if (ringIndex < 0 || ringIndex >= this.numRings || this.polygons === undefined) {
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
     * Call the `handler` on a point feature.
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
     * Call the `handler` on a line feature.
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
     * Call the `handler` on a polygon feature.
     *
     * @param featureIndex The index of the feature into the feature table.
     * @param handler The `handler` to use.
     */
    private visitPolygonFeature(featureIndex: number, handler: ExtendedTileInfoHandler): void {
        if (handler.acceptPolygon === undefined) {
            return;
        }

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

        handler.acceptPolygon(
            polygons.featureIds[featureIndex],
            polygons.techniqueIndex[featureIndex],
            polygons.textIndex[featureIndex],
            this.getTag(featureIndex, polygons.layerIndex!),
            this.getTag(featureIndex, polygons.classIndex!),
            this.getTag(featureIndex, polygons.typeIndex!),
            ExtendedTileInfoVisitor.polygonAccessor
        );

        // Free all data references.
        ExtendedTileInfoVisitor.polygonAccessor.reset();
    }
}
