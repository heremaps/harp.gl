/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { GeometryKind, Pickability, Technique } from "@here/harp-datasource-protocol";
import * as THREE from "three";

import { DataSource } from "./DataSource";
import { MapAdapterUpdateEnv, MapMaterialAdapter } from "./MapMaterialAdapter";

/**
 * @hidden
 *
 * Construction params of `MapObjectAdapter`.
 */
export interface MapObjectAdapterParams {
    dataSource?: DataSource;
    technique?: Technique;
    kind?: GeometryKind[];
    level?: number;
    pickability?: Pickability;

    // TODO: Move here in following refactor.
    //featureData?: TileFeatureData;
}

/**
 * @hidden
 *
 * {@link MapView} specific data assigned to `THREE.Object3D` instance in installed in `userData`.
 *
 * `MapObjectAdapter` is registered in `usedData.mapAdapter` property of `THREE.Object3D`.
 */
export class MapObjectAdapter {
    /**
     * Resolve `MapObjectAdapter` associated with `object`.
     */
    static get(object: THREE.Object3D): MapObjectAdapter | undefined {
        return object.userData?.mapAdapter instanceof MapObjectAdapter
            ? object.userData.mapAdapter
            : undefined;
    }

    static install(objData: MapObjectAdapter): MapObjectAdapter {
        if (!objData.object.userData) {
            objData.object.userData = {};
        }
        return (objData.object.userData.mapAdapter = objData);
    }

    static create(object: THREE.Object3D, params: MapObjectAdapterParams): MapObjectAdapter {
        return MapObjectAdapter.install(new MapObjectAdapter(object, params));
    }

    static ensureUpdated(object: THREE.Object3D, context: MapAdapterUpdateEnv): boolean {
        return MapObjectAdapter.get(object)?.ensureUpdated(context) ?? false;
    }

    /**
     * Associated scene object.
     */
    readonly object: THREE.Object3D;

    /**
     * [[Technique]] that constituted this object.
     */
    readonly technique?: Technique;

    /**
     * [[GeometryKind]] of `object`.
     */
    readonly kind: GeometryKind[] | undefined;

    readonly dataSource?: DataSource;

    /**
     * Which level this object exists on, must match the TileKey's level.
     */
    readonly level: number | undefined;

    private readonly m_pickability: Pickability;
    private m_lastUpdateFrameNumber = -1;
    private m_notCompletlyTransparent = true;

    constructor(object: THREE.Object3D, params: MapObjectAdapterParams) {
        this.object = object;
        this.technique = params.technique;
        this.kind = params.kind;
        this.dataSource = params.dataSource;
        this.m_pickability = params.pickability ?? Pickability.onlyVisible;
        this.m_notCompletlyTransparent = this.getObjectMaterials().some(
            material => material.opacity > 0
        );
        this.level = params.level;
    }

    /**
     * Serialize contents.
     *
     * `THREE.Object3d.userData` is serialized during `clone`/`toJSON`, so we need to ensure that
     * we emit only "data" set of this object.
     */
    toJSON() {
        return { kind: this.kind, technique: this.technique };
    }

    /**
     * Ensure that underlying object is updated to current state of {@link MapView}.
     *
     * Updates object and attachments like materials to current state by evaluating scene dependent
     * expressions.
     *
     * Executes updates only once per frame basing on [[MapView.frameNumber]].
     *
     * Delegates updates of materials to [[MapMaterialAdapter.ensureUpdated]].
     *
     * @returns `true` if object performed some kind of update, `false` if no update was needed.
     */
    ensureUpdated(context: MapAdapterUpdateEnv): boolean {
        if (this.m_lastUpdateFrameNumber === context.frameNumber) {
            return false;
        }
        this.m_lastUpdateFrameNumber = context.frameNumber;

        return this.updateMaterials(context);
    }

    /**
     * Whether underlying `THREE.Object3D` is actually visible in scene.
     */
    isVisible() {
        return this.object.visible && this.m_notCompletlyTransparent;
    }

    /**
     * Whether underlying `THREE.Object3D` should be pickable by {@link PickHandler}.
     */
    isPickable() {
        // An object is pickable only if it's visible and Pickabilty.onlyVisible or
        //  Pickabililty.all set.
        return (
            (this.pickability === Pickability.onlyVisible && this.isVisible()) ||
            this.m_pickability === Pickability.all
        );
    }

    get pickability(): Pickability {
        return this.m_pickability;
    }

    private updateMaterials(context: MapAdapterUpdateEnv) {
        let somethingChanged: boolean = false;
        const materials = this.getObjectMaterials();
        for (const material of materials) {
            const changed = MapMaterialAdapter.ensureUpdated(material, context);
            somethingChanged = somethingChanged || changed;
        }
        if (somethingChanged) {
            this.m_notCompletlyTransparent = materials.some(material => material.opacity > 0);
        }
        return somethingChanged;
    }

    private getObjectMaterials(): THREE.Material[] {
        const object = this.object as THREE.Mesh;
        return Array.isArray(object.material)
            ? object.material
            : object.material !== undefined
            ? [object.material]
            : [];
    }
}
