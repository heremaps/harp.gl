/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { StylePriority } from "@here/harp-datasource-protocol";
import {
    GeoCoordinates,
    isGeoCoordinatesLike,
    isVector3Like,
    Projection,
    Vector3Like
} from "@here/harp-geoutils";
import { GeoCoordLike } from "@here/harp-geoutils/lib/coordinates/GeoCoordLike";
import * as THREE from "three";

/**
 * An interface describing [[THREE.Object3D]]s anchored on
 * given {@link @here/harp-geoutils#GeoCoordinates}.
 *
 * @remarkks
 * @example
 * Example:
 * ```typescript
 * const mesh: MapAnchor<THREE.Mesh> = new THREE.Mesh(geometry, material);
 * mesh.anchor = new GeoCoordinates(latitude, longitude, altitude);
 * mapView.mapAnchors.add(mesh);
 * ```
 */
export type MapAnchor<T extends THREE.Object3D = THREE.Object3D> = T & {
    /**
     * The position of this [[MapAnchor]] in {@link @here/harp-geoutils#GeoCoordinates}.
     * @deprecated Use [[anchor]] instead.
     */
    geoPosition?: GeoCoordinates;

    /**
     * The anchor of this Object3D in {@link @here/harp-geoutils#GeoCoordinates}
     * or world coordinates.
     */
    anchor?: GeoCoordLike | Vector3Like;

    /**
     * Flag defining if the object may be picked.
     *
     * @note By default all objects are pickable even if this flag is undefined.
     */
    pickable?: boolean;

    /**
     * The styleSet that owns this map object.
     *
     * @remarks
     * This property is used together with [[Theme.priorities]] to compute the render
     * order of this map object.
     */
    styleSet?: string;

    /**
     * The category of this style.
     *
     * @remarks
     * This property is used together with [[Theme.priorities]] to compute the render
     * order of this map object.
     */
    category?: string;

    /**
     * Whether to draw the anchor on top of labels.
     * @defaultValue false
     */
    overlay?: boolean;
};

/**
 * Container holding [[MapAnchor]] objects.
 */
export class MapAnchors {
    private m_anchors: MapAnchor[] = [];
    private m_priorities: StylePriority[] = [];

    /**
     * All currently added [[MapAnchor]]s.
     */
    get children() {
        return this.m_anchors;
    }

    /**
     * Add a [[MapAnchor]].
     * @param mapAnchor [[MapAnchor]] instance to add.
     */
    add(mapAnchor: MapAnchor) {
        this.m_anchors.push(mapAnchor);
    }

    /**
     * Remove a [[MapAnchor]].
     * @param mapAnchor - [[MapAnchor]] instance to remove.
     *
     * @note This method is potentially slow when removing a lot of anchors.
     * [[clear]]ing and [[add]]ing anchors should be considered in that case.
     */
    remove(mapAnchor: MapAnchor) {
        const index = this.m_anchors.findIndex(element => element === mapAnchor);
        if (index > -1) {
            this.m_anchors.splice(index, 1);
        }
    }

    /**
     * Remove all [[MapAnchor]]s.
     */
    clear() {
        this.m_anchors.length = 0;
    }

    setPriorities(priorities: StylePriority[]) {
        this.m_priorities = priorities;
    }

    /**
     * Update the map anchors.
     * @param projection - Current projection
     * @param cameraPosition - Current camera position
     * @param rootNode - Node where normal anchors will be inserted.
     * @param overlayRootNode - Node where overlay anchors will be insterted.
     * @param priorities - Optional theme priority list
     *
     * @internal
     * @hidden
     */
    update(
        projection: Projection,
        cameraPosition: THREE.Vector3,
        rootNode: THREE.Object3D,
        overlayRootNode: THREE.Object3D
    ) {
        const worldPosition = new THREE.Vector3();

        this.m_anchors.forEach((mapAnchor: MapAnchor) => {
            if (mapAnchor.styleSet !== undefined) {
                const priority = this.m_priorities?.findIndex(
                    entry =>
                        entry.group === mapAnchor.styleSet && entry.category === mapAnchor.category
                );

                if (priority !== undefined && priority !== -1) {
                    mapAnchor.renderOrder = (priority + 1) * 10;
                }
            }

            const anchor =
                mapAnchor.geoPosition !== undefined ? mapAnchor.geoPosition : mapAnchor.anchor;
            if (anchor !== undefined) {
                if (isVector3Like(anchor)) {
                    worldPosition.set(anchor.x, anchor.y, anchor.z);
                } else if (isGeoCoordinatesLike(anchor)) {
                    projection.projectPoint(anchor, worldPosition);
                }
                mapAnchor.position.copy(worldPosition).sub(cameraPosition);
            }

            if (mapAnchor.overlay === true) {
                overlayRootNode.add(mapAnchor);
            } else {
                rootNode.add(mapAnchor);
            }
        });
    }
}
