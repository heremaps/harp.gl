/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeometryType, getFeatureId } from "@here/harp-datasource-protocol";
import { assert, LoggerManager } from "@here/harp-utils";
import * as THREE from "three";

import { Tile, TileFeatureData } from "../Tile";
import {
    BufferedGeometryLineAccessor,
    BufferedGeometryObject3dAccessor,
    IGeometryAccessor,
    ILineAccessor,
    IndexedBufferedGeometryLineAccessor,
    IObject3dAccessor,
    isLineAccessor,
    isObject3dAccessor
} from "./TileGeometry";

const logger = LoggerManager.instance.create("TileDataAccessor");

/**
 * Interface for a client visitor that is used to visit all `THREE.Object`s in a tile.
 */
export interface ITileDataVisitor {
    tile: Tile;

    /**
     * Should return `true` if the visitor wants to visit the object with the specified
     * `featureId`. This function is called before the type of the object is even known.
     * @remarks Number ids are deprecated in favor of strings.
     */
    wantsFeature(featureId: number | string | undefined): boolean;

    /**
     * Should return `true` if the visitor wants to visit the point with the specified
     * `featureId`.
     * @remarks Number ids are deprecated in favor of strings.
     */
    wantsPoint(featureId: number | string | undefined): boolean;

    /**
     * Should return `true` if the visitor wants to visit the line with the specified
     * `featureId`.
     * @remarks Number ids are deprecated in favor of strings.
     */
    wantsLine(featureId: number | string | undefined): boolean;

    /**
     * Should return `true` if the visitor wants to visit the area object with the specified
     * `featureId`.
     * @remarks Number ids are deprecated in favor of strings.
     */
    wantsArea(featureId: number | string | undefined): boolean;

    /**
     * Should return `true` if the visitor wants to visit the object with the specified
     * `featureId`.
     * @remarks Number ids are deprecated in favor of strings.
     */
    wantsObject3D(featureId: number | string | undefined): boolean;

    /**
     * Visits a point object with the specified `featureId`; use `pointAccessor` to get the
     * object's properties.
     * @remarks Number ids are deprecated in favor of strings.
     */
    visitPoint(featureId: number | string | undefined): void;

    /**
     * Visits a line object with the specified `featureId`; use `pointAccessor` to get the
     * object's properties.
     * @remarks Number ids are deprecated in favor of strings.
     */
    visitLine(featureId: number | string | undefined, lineAccessor: ILineAccessor): void;

    /**
     * Visit an area object with the specified `featureId`; use `pointAccessor` to get the
     * object's properties.
     * @remarks Number ids are deprecated in favor of strings.
     */
    visitArea(featureId: number | string | undefined): void;

    /**
     * Visits a 3D object with the specified `featureId`; use `pointAccessor` to get the
     * object's properties.
     * @remarks Number ids are deprecated in favor of strings.
     */
    visitObject3D(
        featureId: number | string | undefined,
        object3dAccessor: IObject3dAccessor
    ): void;
}

/**
 * An interface that provides options for {@link TileDataAccessor}.
 */
export interface TileDataAccessorOptions {
    /** Limit to objects that have `featureID`s. */
    onlyWithFeatureIds?: boolean;
    /** Sets and overrides `wantPoints`, `wantLines`, `wantAreas`, `wantObject3D`. */
    wantsAll?: boolean;
    /** `true` to visit points. */
    wantsPoints?: boolean;
    /** `true` to visit lines. */
    wantsLines?: boolean;
    /** `true` to visit area objects. */
    wantsAreas?: boolean;
    /** `true` to visit general 3D objects. */
    wantsObject3D?: boolean;
}

/**
 * An accessor for all geometries in a tile.
 *
 * @remarks
 * This class uses a client-provided {@link ITileDataVisitor}
 * to visit all objects, based on filtering options specified
 * by both, the `TileDataAccessor` and
 * the visitor itself.
 */
export class TileDataAccessor {
    private readonly m_wantsPoints: boolean;
    private readonly m_wantsLines: boolean;
    private readonly m_wantsAreas: boolean;
    private readonly m_wantsObject3D: boolean;

    /**
     * Constructs a `TileDataAccessor` instance.
     *
     * @param tile - The tile to access.
     * @param visitor - The visitor.
     * @param options - Options for the tile.
     */
    constructor(
        public tile: Tile,
        private readonly visitor: ITileDataVisitor,
        options: TileDataAccessorOptions
    ) {
        const wantsAll = options.wantsAll === true;
        this.m_wantsPoints = wantsAll || !(options.wantsPoints === false);
        this.m_wantsLines = wantsAll || !(options.wantsLines === false);
        this.m_wantsAreas = wantsAll || !(options.wantsAreas === false);
        this.m_wantsObject3D = wantsAll || !(options.wantsObject3D === false);
    }

    /**
     * Calls the visitor on all objects in the tile.
     */
    visitAll(): void {
        const objects = this.tile.objects;

        for (const object of objects) {
            this.visitObject(object);
        }
    }

    /**
     * Visits a single object. This function should normally be called during visiting.
     *
     * @param object - The object to visit.
     */
    protected visitObject(object: THREE.Object3D): void {
        const featureData: TileFeatureData | undefined =
            object.userData !== undefined
                ? (object.userData.feature as TileFeatureData)
                : undefined;

        // early opt out if there is no feature data, or if the feature data has only a single id
        // and the visitor wants to ignore that featureId
        if (
            featureData === undefined ||
            (featureData.objInfos !== undefined &&
                featureData.objInfos.length === 1 &&
                !this.visitor.wantsFeature(getFeatureId(featureData.objInfos[0])))
        ) {
            return;
        }

        const geometryType = featureData.geometryType;
        if (geometryType === undefined) {
            logger.warn("#visitObject: visiting object failed, no geometryType", object);
            return;
        }

        assert(featureData.objInfos !== undefined, "featureData.ids missing");
        assert(featureData.starts !== undefined, "featureData.starts missing");
        assert(Array.isArray(featureData.starts), "featureData.starts is not an array");
        if (featureData.objInfos !== undefined && featureData.starts !== undefined) {
            assert(
                featureData.objInfos.length === featureData.starts.length,
                "featureData.ids and featureData.starts have unequal length"
            );
        }

        switch (geometryType) {
            case GeometryType.Point:
            case GeometryType.Text:
                if (!this.m_wantsPoints) {
                    return;
                }
                break;
            case GeometryType.SolidLine:
            case GeometryType.ExtrudedLine:
            case GeometryType.TextPath:
                if (!this.m_wantsLines) {
                    return;
                }
                break;
            case GeometryType.Polygon:
            case GeometryType.ExtrudedPolygon:
                if (!this.m_wantsAreas) {
                    return;
                }
                break;
            case GeometryType.Object3D:
                if (!this.m_wantsObject3D) {
                    return;
                }
                break;
            default:
                logger.warn("#visitObject: invalid geometryType");
        }

        if (object.type !== "Mesh") {
            logger.warn("#visitObject: visiting object failed, not of type 'Mesh'", object);
            return;
        }

        const mesh = object as THREE.Mesh;

        this.visitMesh(mesh, featureData);
    }

    /**
     * Gets the `BufferGeometry` from the specified object. This function requires the
     * attribute `position` in `BufferGeometry` to be set.
     *
     * @param object - The object from which to get the geometry.
     * @returns the geometry of the object, or `undefined`.
     */
    protected getBufferGeometry(object: THREE.Mesh): THREE.BufferGeometry | undefined {
        const geometry = object.geometry;

        if (geometry.type !== "BufferGeometry") {
            logger.warn("#visitObject: object does not have BufferGeometry");
            return undefined;
        }

        const bufferGeometry = geometry as THREE.BufferGeometry;

        // we know its a BufferAttribute because it is a BufferGeometry
        const position: THREE.BufferAttribute = bufferGeometry.getAttribute(
            "position"
        ) as THREE.BufferAttribute;

        if (!position) {
            logger.warn("#visitLines: BufferGeometry has no position attribute");
            return undefined;
        }

        return bufferGeometry;
    }

    /**
     * Obtains an accessor for the nonindexed geometry. This function may return `undefined`
     * if the accessor is not implemented.
     *
     * @param geometryType - The type of geometry.
     * @param object - The object for which to access the attributes and geometry.
     * @param bufferGeometry - The object's `BufferGeometry`.
     * @returns an accessor for a specified object, if available.
     */
    protected getGeometryAccessor(
        geometryType: GeometryType,
        object: THREE.Mesh,
        bufferGeometry: THREE.BufferGeometry
    ): IGeometryAccessor | undefined {
        switch (geometryType) {
            case GeometryType.Point:
            case GeometryType.Text:
                // return new RoBufferedGeometryLineAccessor(object, geometryType, bufferGeometry);
                return undefined;
            case GeometryType.SolidLine:
            case GeometryType.ExtrudedLine:
            case GeometryType.TextPath:
                return new BufferedGeometryLineAccessor(object, geometryType, bufferGeometry);
            case GeometryType.Polygon:
            case GeometryType.ExtrudedPolygon:
                // return new RoBufferedGeometryLineAccessor(object, geometryType, bufferGeometry);
                return undefined;
            case GeometryType.Object3D:
                return new BufferedGeometryObject3dAccessor(object, geometryType, bufferGeometry);
            default:
                logger.warn("#getGeometryAccessor: invalid geometryType");
        }
        return undefined;
    }

    /**
     * Obtains an accessor for the indexed geometry. This function may return `undefined`
     * if the accessor is not implemented.
     *
     * @param geometryType - The type of geometry.
     * @param object - The object for which to access the attributes and geometry.
     * @param bufferGeometry - The object's `BufferGeometry`.
     * @returns an accessor for a specified object, if available.
     */
    protected getIndexedGeometryAccessor(
        geometryType: GeometryType,
        object: THREE.Mesh,
        bufferGeometry: THREE.BufferGeometry
    ): IGeometryAccessor | undefined {
        switch (geometryType) {
            case GeometryType.Point:
            case GeometryType.Text:
                // return new RoBufferedGeometryLineAccessor(object, geometryType, bufferGeometry);
                return undefined;
            case GeometryType.SolidLine:
            case GeometryType.ExtrudedLine:
            case GeometryType.TextPath:
                return new IndexedBufferedGeometryLineAccessor(
                    object,
                    geometryType,
                    bufferGeometry
                );
            case GeometryType.Polygon:
            case GeometryType.ExtrudedPolygon:
                // return new RoBufferedGeometryLineAccessor(object, geometryType, bufferGeometry);
                return undefined;
            case GeometryType.Object3D:
                // return new RoBufferedGeometryLineAccessor(object, geometryType, bufferGeometry);
                return undefined;
            default:
                logger.warn("#getIndexedGeometryAccessor: invalid geometryType");
        }
        return undefined;
    }

    /**
     * Visit the object.
     *
     * @param meshObject - Object of type `Mesh`.
     * @param featureData - Dataset stored along with the object.
     */
    protected visitMesh(meshObject: THREE.Mesh, featureData: TileFeatureData): void {
        const { objInfos, starts } = featureData;
        const geometryType = featureData.geometryType;

        // make linter happy: we already know that these both are valid
        if (objInfos === undefined || starts === undefined || geometryType === undefined) {
            return;
        }

        let geometryAccessor: IGeometryAccessor | undefined;

        for (let featureIndex = 0; featureIndex < objInfos.length; featureIndex++) {
            const featureId = getFeatureId(objInfos[featureIndex]);

            if (!this.visitor.wantsFeature(featureId)) {
                continue;
            }

            const featureStart = starts[featureIndex];
            let featureEnd: number = -1;

            // lazy creation of accessor, in case featureId was not wanted...
            if (geometryAccessor === undefined) {
                const bufferGeometry = this.getBufferGeometry(meshObject);
                if (bufferGeometry === undefined) {
                    continue;
                }

                if (bufferGeometry.index !== null) {
                    geometryAccessor = this.getIndexedGeometryAccessor(
                        geometryType,
                        meshObject,
                        bufferGeometry
                    );
                } else {
                    geometryAccessor = this.getGeometryAccessor(
                        geometryType,
                        meshObject,
                        bufferGeometry
                    );
                }

                if (geometryAccessor === undefined) {
                    logger.warn("#visitObject: no accessor geometryType", geometryType);
                    continue;
                }
            }

            featureEnd =
                featureIndex < starts.length - 1
                    ? starts[featureIndex + 1]
                    : geometryAccessor.getCount();

            // setup/update the accessor for the new range of the object
            geometryAccessor.setRange(featureStart, featureEnd);

            switch (geometryType) {
                case GeometryType.Point:
                case GeometryType.Text:
                    this.visitor.visitPoint(featureId);
                    break;
                case GeometryType.SolidLine:
                case GeometryType.ExtrudedLine:
                case GeometryType.TextPath:
                    assert(isLineAccessor(geometryAccessor));
                    this.visitor.visitLine(featureId, (geometryAccessor as any) as ILineAccessor);
                    break;
                case GeometryType.Polygon:
                case GeometryType.ExtrudedPolygon:
                    this.visitor.visitArea(featureId);
                    break;
                case GeometryType.Object3D:
                    assert(isObject3dAccessor(geometryAccessor));
                    this.visitor.visitObject3D(
                        featureId,
                        (geometryAccessor as any) as IObject3dAccessor
                    );
                    break;
                default:
                    logger.warn("#visitObject: invalid geometryType");
            }
        }
    }
}
