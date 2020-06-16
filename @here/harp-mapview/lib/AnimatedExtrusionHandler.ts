/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    getPropertyValue,
    isExtrudedPolygonTechnique,
    MapEnv,
    Technique
} from "@here/harp-datasource-protocol";
import { ExtrusionFeature, ExtrusionFeatureDefs } from "@here/harp-materials";
import { assert, MathUtils } from "@here/harp-utils";
import { MapView } from "./MapView";
import { Tile } from "./Tile";

/**
 * Animation states for extrusion effect
 */
export enum AnimatedExtrusionState {
    None,
    Started,
    Finished
}

const DEFAULT_EXTRUSION_DURATION = 750; // milliseconds
const DEFAULT_MIN_ZOOM_LEVEL = 16;

/**
 * Handles animated extrusion effect of the buildings in [[MapView]].
 */
export class AnimatedExtrusionHandler {
    /**
     * Animate the extrusion of the buildings if set to `true`.
     */
    enabled: boolean = true;
    /**
     * Duration of the building's extrusion in milliseconds
     */
    duration: number = DEFAULT_EXTRUSION_DURATION;

    private m_minZoomLevel: number = DEFAULT_MIN_ZOOM_LEVEL;
    private m_forceEnabled: boolean = false;
    private m_tileMap: Map<Tile, ExtrusionFeature[]> = new Map();
    /**
     * Number of tiles added for each tile tree. A tile tree has as root a tile in the data level
     * corresponding to this.m_minZoomLevel and contains all its descendant tiles. Each tile tree
     * is animated only once, i.e., if a tile in the tree was already animated and the camera zooms
     * in/out, all tiles in the same tree will be rendered as fully extruded.
     * Key is tree root's morton code, value is the number of tiles in the tree already added.
     */
    private m_tileTreeSizeMap: Map<number, number> = new Map();
    private m_state: AnimatedExtrusionState = AnimatedExtrusionState.None;
    private m_startTime: number = -1;

    /**
     * Creates an [[AnimatedExtrusionHandler]] in [[MapView]].
     *
     * @param m_mapView - Instance of [[MapView]] on which the animation will run.
     */
    constructor(private m_mapView: MapView) {}

    /**
     * Returns whether the extrusion animation is force enabled or not.
     */
    get forceEnabled(): boolean {
        return this.m_forceEnabled;
    }

    /**
     * If `forceEnabled` is set to `true` then `animateExtrusion` and `animateExtrusionDuration`
     * values from [[extrudedPolygonTechnique]] will be ignored and
     * `AnimatedExtrusionHandler.enabled` with `AnimatedExtrusionHandler.duration` will be used
     */
    set forceEnabled(force: boolean) {
        this.m_forceEnabled = force;
        this.duration = DEFAULT_EXTRUSION_DURATION;
    }

    /**
     * Gets min zoom level at which extruded animation is enabled.
     */
    get minZoomLevel() {
        return this.m_minZoomLevel;
    }

    /**
     * Sets the extrusion animation properties obtained from a given technique.
     * @internal
     * @param technique - The technique where the extrusion animation properties are defined.
     * @param env - The environment used to evaluate technique properties.
     * @returns True if the technique has animation enabled (or animation is forced), false
     * otherwise.
     */
    setAnimationProperties(technique: Technique, env: MapEnv) {
        if (!isExtrudedPolygonTechnique(technique)) {
            return false;
        }

        if ("minZoomLevel" in technique) {
            this.m_minZoomLevel = (technique as any).minZoomLevel;
        }

        if (this.forceEnabled) {
            return this.enabled;
        }

        if (technique.animateExtrusionDuration !== undefined) {
            this.duration = technique.animateExtrusionDuration;
        }

        const animateExtrusionValue = getPropertyValue(technique.animateExtrusion, env);

        if (animateExtrusionValue === null) {
            return this.enabled;
        }

        return typeof animateExtrusionValue === "boolean"
            ? animateExtrusionValue
            : typeof animateExtrusionValue === "number"
            ? animateExtrusionValue !== 0
            : false;
    }

    /**
     * Updates the extrusion animation for every frame.
     * @internal
     */
    update(zoomLevel: number) {
        const extrusionVisible = this.m_tileMap.size > 0 && zoomLevel >= this.m_minZoomLevel;

        if (this.m_state === AnimatedExtrusionState.None && extrusionVisible) {
            this.m_state = AnimatedExtrusionState.Started;
        } else if (this.m_state !== AnimatedExtrusionState.None && !extrusionVisible) {
            this.m_state = AnimatedExtrusionState.None;
            this.m_startTime = -1;
            this.setExtrusionRatio(0, true);
        }

        this.animateExtrusion();
    }

    /**
     * Adds a tile to be animated.
     * @internal
     * @param tile - The tile to be animated.
     * @param materials - Extruded materials belonging to the tile.
     */
    add(tile: Tile, materials: ExtrusionFeature[]): void {
        tile.addDisposeCallback(this.removeTile.bind(this));
        this.m_tileMap.set(tile, materials);

        if (this.m_state === AnimatedExtrusionState.Finished) {
            if (this.isTileTreeAdded(tile)) {
                // If the animation is finished and the new tile belongs to an already animated tile
                // subtree, set the tile to fully extruded.
                this.setTileExtrusionRatio(materials, 1.0);
            } else {
                // If the tile subtree is not yet animated, restart the animation.
                this.m_state = AnimatedExtrusionState.None;
                this.m_startTime = -1;
            }
        }

        this.addToTileTree(tile);
    }

    /**
     * Is `true` if there's any extrusion animation ongoing.
     */
    get isAnimating(): boolean {
        return (
            this.m_state !== AnimatedExtrusionState.Finished &&
            this.m_state !== AnimatedExtrusionState.None
        );
    }

    private removeTile(tile: Tile): void {
        this.m_tileMap.delete(tile);
        this.removeFromTileTree(tile);
    }

    private addToTileTree(tile: Tile) {
        const rootTileCode = this.getTreeRootMortonCode(tile);
        const oldSize = this.m_tileTreeSizeMap.get(rootTileCode);
        const newSize = oldSize === undefined ? 1 : oldSize + 1;
        this.m_tileTreeSizeMap.set(rootTileCode, newSize);
    }

    private removeFromTileTree(tile: Tile) {
        const rootTileCode = this.getTreeRootMortonCode(tile);
        const oldSize = this.m_tileTreeSizeMap.get(rootTileCode);
        assert(oldSize !== undefined);
        assert(oldSize! > 0);
        const newSize = oldSize! - 1;
        if (newSize > 0) {
            this.m_tileTreeSizeMap.set(rootTileCode, newSize);
        } else {
            this.m_tileTreeSizeMap.delete(rootTileCode);
        }
    }

    private getTreeRootMortonCode(tile: Tile): number {
        const rootLevel = tile.dataSource.getDataZoomLevel(this.minZoomLevel);
        return tile.tileKey.changedLevelTo(rootLevel).mortonCode();
    }

    private isTileTreeAdded(tile: Tile): boolean {
        return this.m_tileTreeSizeMap.has(this.getTreeRootMortonCode(tile));
    }

    private animateExtrusion() {
        if (this.m_state !== AnimatedExtrusionState.Started) {
            return;
        }

        const currentTime = Date.now();
        if (this.m_startTime < 0) {
            this.m_startTime = currentTime;
        }

        const duration = this.duration;
        const timeProgress = Math.min(currentTime - this.m_startTime, duration);

        const extrusionRatio = MathUtils.easeInOutCubic(
            ExtrusionFeatureDefs.DEFAULT_RATIO_MIN,
            ExtrusionFeatureDefs.DEFAULT_RATIO_MAX,
            timeProgress / duration
        );
        this.setExtrusionRatio(extrusionRatio);

        if (timeProgress >= duration) {
            this.m_state = AnimatedExtrusionState.Finished;
        }

        this.m_mapView.update();
    }

    private setExtrusionRatio(value: number, force: boolean = false) {
        this.m_tileMap.forEach(materials => {
            this.setTileExtrusionRatio(materials, value, force);
        });
    }

    private setTileExtrusionRatio(
        materials: ExtrusionFeature[],
        value: number,
        force: boolean = false
    ) {
        materials.forEach(material => {
            if ((material.extrusionRatio ?? 0) < 1 || force) {
                material.extrusionRatio = value;
            }
        });
    }
}
