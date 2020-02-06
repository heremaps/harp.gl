/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { TileKey } from "@here/harp-geoutils";
import { ExtrusionFeature, ExtrusionFeatureDefs } from "@here/harp-materials";
import { MathUtils } from "@here/harp-utils";
import { MapView, MapViewEventNames, RenderEvent } from "./MapView";
import { Tile } from "./Tile";

import * as THREE from "three";

/**
 * Animation states for extrusion effect
 */
export enum AnimatedExtrusionState {
    None,
    Started,
    Playing,
    Finished
}

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
    duration: number = 750;
    /**
     * If `forceEnabled` is set to `true` then `animateExtrusion` and `animateExtrusionDuration`
     * values from [[extrudedPolygonTechnique]] will be ignored in [[Tile]] and
     * `AnimatedExtrusionHandler.enabled` with `AnimatedExtrusionHandler.duration` will be used
     */
    forceEnabled: boolean = false;

    private m_zoomLevelPrevious: number;
    private m_tileHandlerMap: Map<Tile, AnimatedExtrusionTileHandler> = new Map();
    private m_zoomDirection: number = 0;
    private m_forceAnimatedExtrusion: boolean | undefined;
    private m_forceAnimatedExtrusionDuration: number | undefined;

    /**
     * Creates an [[AnimatedExtrusionHandler]] in [[MapView]].
     *
     * @param m_mapView Instance of [[MapView]] that passes `zoomLevel`
     * through the `zoom` property update
     */
    constructor(private m_mapView: MapView) {
        this.m_zoomLevelPrevious = this.m_mapView.zoomLevel;
    }

    /**
     * Returns direction of the last zoom event.
     * Zoom in - positive value, zoom out - negative value
     */
    get zoomDirection(): number {
        return this.m_zoomDirection;
    }

    /**
     * [[MapView]] updates zoom level. Then [[AnimatedExtrusionTileHandler]] calculates actual
     * extrusion ratio and trigger animation
     */
    set zoom(zoomLevel: number) {
        // if zoomLevel has been changed since last render
        if (this.m_zoomLevelPrevious !== zoomLevel) {
            this.m_tileHandlerMap.forEach(tileHandler => {
                if (
                    this.m_mapView.getDataSourceByName(tileHandler.tile.dataSource.name) !==
                    undefined
                ) {
                    this.m_zoomDirection = zoomLevel > this.m_zoomLevelPrevious ? 1 : -1;
                    tileHandler.zoomLevelChanged(this.m_zoomDirection);
                }
            });
            this.m_zoomLevelPrevious = zoomLevel;
        }
    }

    /**
     * Checks whether animated extrusion effect was forcibly turned off/on in [[MapView]]
     */
    get forceAnimatedExtrusion(): boolean | undefined {
        return this.m_forceAnimatedExtrusion;
    }

    /**
     * If set to `true` it will force the animation extrusion effect to run.
     * In case it was set to `false` animation extrusion effect will be switched off.
     */
    set forceAnimatedExtrusion(animatedExtrusion: boolean | undefined) {
        this.m_forceAnimatedExtrusion = animatedExtrusion;
    }

    /**
     * Returns `animatedExtrusionDuration` value that was set in [[MapView]].
     */
    get forceAnimatedExtrusionDuration(): number | undefined {
        return this.m_forceAnimatedExtrusionDuration;
    }

    /**
     * If value is set, it will overlap in [[Tile]] with
     * `animatedExtrusionDuration` property from [[ExtrudedPolygonTechnique]]
     * and `DEFAULT_DURATION` from [[AnimatedExtrusionTileHandler]].
     */
    set forceAnimatedExtrusionDuration(extrusionDuration: number | undefined) {
        this.m_forceAnimatedExtrusionDuration = extrusionDuration;
    }

    /**
     * Adds an [[AnimatedExtrusionTileHandler]] to [[AnimatedExtrusionHandler]]
     */
    add(tileHandler: AnimatedExtrusionTileHandler): void {
        this.m_tileHandlerMap.set(tileHandler.tile, tileHandler);
    }

    /**
     * Removes tile from the list subscribed for extrusion ratio updates
     */
    removeTile(tile: Tile): void {
        this.m_tileHandlerMap.delete(tile);
    }

    /**
     * Returns first [[AnimatedExtrusionTileHandler]] existed from the list of [[Tile]]s
     */
    find(tileKeys: Array<TileKey | undefined>): AnimatedExtrusionTileHandler | undefined {
        for (const tileHandler of this.m_tileHandlerMap) {
            for (const tileKey of tileKeys) {
                if (
                    tileKey !== undefined &&
                    tileHandler[0].tileKey.mortonCode() === tileKey.mortonCode()
                ) {
                    return tileHandler[1];
                }
            }
        }
        return undefined;
    }

    /**
     * Is `true` if any extrusion handlers are currently animating.
     */
    get isAnimating(): boolean {
        for (const tileHandler of this.m_tileHandlerMap) {
            if (tileHandler[1].isAnimating) {
                return true;
            }
        }
        return false;
    }
}

/**
 * Implements animated extrusion effect for the extruded objects in the [[Tile]]
 */
export class AnimatedExtrusionTileHandler {
    private m_extrudedObjects: THREE.Object3D[] = [];
    private m_animatedExtrusionRatio: number = ExtrusionFeatureDefs.DEFAULT_RATIO_MAX;
    private m_animatedExtrusionState: AnimatedExtrusionState = AnimatedExtrusionState.None;
    private m_animatedExtrusionStartTime: number | undefined = undefined;
    private m_mapView: MapView;
    private m_animatedExtrusionHandler: AnimatedExtrusionHandler;

    constructor(
        private m_tile: Tile,
        extrudedObjects: THREE.Object3D[],
        private m_animatedExtrusionDuration: number
    ) {
        this.m_mapView = m_tile.mapView;
        this.m_animatedExtrusionHandler = this.m_mapView.animatedExtrusionHandler;

        extrudedObjects.forEach(extrudedObject => {
            this.m_extrudedObjects.push(extrudedObject);
        });

        this.startExtrusionAnimationIfNeeded(this.m_animatedExtrusionHandler.zoomDirection);
    }

    add(extrudedObjects: THREE.Object3D[]) {
        this.m_extrudedObjects.push(...extrudedObjects);
    }

    /**
     * Extrusion ratio value for the materials [[MapMeshBasicMaterial]]
     * and [[EdgeMaterial]]. Controlled by [[AnimatedExtrusionHandler]]
     * for extrusion animation effect.
     */
    get extrusionRatio() {
        return this.m_animatedExtrusionRatio;
    }
    set extrusionRatio(value: number) {
        this.m_animatedExtrusionRatio = value;

        this.m_extrudedObjects.forEach(object => {
            const material = (object as THREE.Mesh | THREE.LineSegments)
                .material as ExtrusionFeature;
            material.extrusionRatio = this.m_animatedExtrusionRatio;
        });
    }

    /**
     * Returns the [[Tile]] related to [[AnimatedExtrusionTileHandler]]
     */
    get tile(): Tile {
        return this.m_tile;
    }

    /**
     * Return the current state of animated extrusion effect
     */
    get animationState(): AnimatedExtrusionState {
        return this.m_animatedExtrusionState;
    }

    /**
     * Is `true` if this handler is currently animating.
     */
    get isAnimating(): boolean {
        return this.m_animatedExtrusionState !== AnimatedExtrusionState.Finished;
    }

    /**
     * Cancel animation and remove from [[AnimatedExtrusionHandler]]
     */
    dispose() {
        this.stopExtrusionAnimation();
        this.m_animatedExtrusionHandler.removeTile(this.m_tile);
    }

    /**
     * Start / Stop extrusion animation if zoom level was changed
     */
    zoomLevelChanged(zoomDirection: number) {
        if (
            this.m_tile.isVisible === false &&
            this.m_animatedExtrusionState !== AnimatedExtrusionState.None
        ) {
            this.m_animatedExtrusionState = AnimatedExtrusionState.None;
            this.stopExtrusionAnimation();
        }

        if (
            this.m_tile.isVisible === true &&
            this.m_animatedExtrusionState === AnimatedExtrusionState.None
        ) {
            this.startExtrusionAnimationIfNeeded(zoomDirection);
        }
    }

    private getChildTiles(tileKeys: TileKey[]) {
        const result: TileKey[] = [];

        tileKeys.forEach(tileKey => {
            const childTileKeys = this.tile.dataSource.getTilingScheme().getSubTileKeys(tileKey);

            for (const childTileKey of childTileKeys) {
                result.push(childTileKey);
            }
        });
        return result;
    }

    // search for the [[Tile]] with extrusion animation started
    private startExtrusionAnimationIfNeeded(zoomDirection?: number) {
        const {
            quadTreeSearchDistanceUp,
            quadTreeSearchDistanceDown
        } = this.tile.mapView.visibleTileSet.options;
        const tile = this.m_tile;
        let extrusionStartTime: number | undefined;

        if (zoomDirection !== undefined) {
            let tileHandler;

            // if zoom out, go down and look for a child tile
            if (zoomDirection < 0) {
                let nextLevelDiff = 0;
                let tileKeys = [tile.tileKey];
                while (
                    quadTreeSearchDistanceDown > nextLevelDiff &&
                    extrusionStartTime === undefined
                ) {
                    const childTileKeys = this.getChildTiles(tileKeys);
                    if (childTileKeys !== undefined) {
                        tileHandler = this.m_animatedExtrusionHandler.find(childTileKeys);
                        if (tileHandler !== undefined) {
                            extrusionStartTime = tileHandler.m_animatedExtrusionStartTime;
                            break;
                        }
                        tileKeys = childTileKeys;
                    }
                    nextLevelDiff++;
                }
            }
            // if zoom in, go up and get the parent tile
            if (zoomDirection > 0) {
                let nextLevelDiff = 0;
                let tileKey = tile.tileKey;
                while (
                    quadTreeSearchDistanceUp > nextLevelDiff &&
                    extrusionStartTime === undefined &&
                    tileKey.level !== 0
                ) {
                    const parentTileKey = tileKey.parent();
                    tileHandler = this.m_animatedExtrusionHandler.find([parentTileKey]);
                    if (tileHandler !== undefined) {
                        extrusionStartTime = tileHandler.m_animatedExtrusionStartTime;
                        break;
                    }
                    tileKey = parentTileKey;
                    nextLevelDiff++;
                }
            }
        }
        this.startExtrusionAnimation(extrusionStartTime);
    }

    private startExtrusionAnimation(startTime?: number): void {
        this.m_animatedExtrusionState = AnimatedExtrusionState.Started;
        this.m_animatedExtrusionStartTime = startTime;
        this.animateExtrusion();
        this.m_mapView.addEventListener(MapViewEventNames.AfterRender, this.animateExtrusion);
    }

    private stopExtrusionAnimation(): void {
        this.m_mapView.removeEventListener(MapViewEventNames.AfterRender, this.animateExtrusion);
    }

    private animateExtrusion = (event?: RenderEvent) => {
        if (this.m_animatedExtrusionState !== AnimatedExtrusionState.Playing) {
            if (this.m_animatedExtrusionState === AnimatedExtrusionState.Started) {
                this.m_animatedExtrusionState = AnimatedExtrusionState.Playing;
            } else {
                return;
            }
        }

        const currentTime = Date.now();
        if (
            this.m_animatedExtrusionStartTime === undefined ||
            this.m_animatedExtrusionStartTime <= 0
        ) {
            this.m_animatedExtrusionStartTime = currentTime;
        }

        const timeProgress = Math.min(
            currentTime - this.m_animatedExtrusionStartTime,
            this.m_animatedExtrusionDuration
        );

        this.extrusionRatio = MathUtils.easeInOutCubic(
            ExtrusionFeatureDefs.DEFAULT_RATIO_MIN,
            ExtrusionFeatureDefs.DEFAULT_RATIO_MAX,
            timeProgress / this.m_animatedExtrusionDuration
        );

        if (timeProgress >= this.m_animatedExtrusionDuration) {
            this.m_animatedExtrusionState = AnimatedExtrusionState.Finished;
            this.stopExtrusionAnimation();
        }

        this.m_tile.dataSource.requestUpdate();
    };
}
