/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    getPropertyValue,
    isExtrudedPolygonTechnique,
    MapEnv,
    Technique
} from "@here/harp-datasource-protocol";
import { TileKey } from "@here/harp-geoutils";
import { ExtrusionFeature, ExtrusionFeatureDefs } from "@here/harp-materials";
import { MathUtils } from "@here/harp-utils";

import { DataSource } from "./DataSource";
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
const DEFAULT_MIN_ZOOM_LEVEL = 1;

interface TileExtrusionState {
    materials: ExtrusionFeature[];
    animated: boolean;
}

// key is tile's morton code.
type TileMap = Map<number, TileExtrusionState>;

/**
 * Handles animated extrusion effect of the buildings in {@link MapView}.
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

    private readonly m_dataSourceMap: Map<DataSource, TileMap> = new Map();
    private m_state: AnimatedExtrusionState = AnimatedExtrusionState.None;
    private m_startTime: number = -1;

    /**
     * Creates an {@link AnimatedExtrusionHandler} in {@link MapView}.
     *
     * @param m_mapView - Instance of {@link MapView} on which the animation will run.
     */
    constructor(private readonly m_mapView: MapView) {}

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

        if (technique.hasOwnProperty("minZoomLevel")) {
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
        const extrusionVisible = this.m_dataSourceMap.size > 0 && zoomLevel >= this.m_minZoomLevel;

        if (this.m_state === AnimatedExtrusionState.None && extrusionVisible) {
            this.m_state = AnimatedExtrusionState.Started;
        } else if (this.m_state !== AnimatedExtrusionState.None && !extrusionVisible) {
            this.resetAnimation(true);
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
        let animated = false;

        if (this.m_state !== AnimatedExtrusionState.None) {
            animated = this.skipAnimation(tile);
            if (animated) {
                // Set extrusion ratio to 1 if the tile skips the animation.
                this.setTileExtrusionRatio(materials, 1);
            } else if (this.m_state === AnimatedExtrusionState.Finished) {
                // Otherwise, if animation was finished, restart animation but leave already
                //  animated tiles untouched.
                this.resetAnimation(false);
            }
        }
        this.getOrCreateTileMap(tile.dataSource).set(tile.tileKey.mortonCode(), {
            materials,
            animated
        });
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

    private getTileMap(dataSource: DataSource, create: boolean = false): TileMap | undefined {
        return this.m_dataSourceMap.get(dataSource);
    }

    private getOrCreateTileMap(dataSource: DataSource): TileMap {
        let tileMap = this.m_dataSourceMap.get(dataSource);
        if (!tileMap) {
            tileMap = new Map();
            this.m_dataSourceMap.set(dataSource, tileMap);
        }
        return tileMap;
    }

    private skipAnimation(tile: Tile): boolean {
        return this.wasAnyAncestorAnimated(tile) || this.wasAnyDescendantAnimated(tile);
    }

    private wasAnyAncestorAnimated(tile: Tile): boolean {
        const minLevel = tile.dataSource.getDataZoomLevel(this.m_minZoomLevel);
        const distanceToMinLevel = Math.max(0, tile.tileKey.level - minLevel);
        const levelsUp = Math.min(
            distanceToMinLevel,
            this.m_mapView.visibleTileSet.options.quadTreeSearchDistanceUp
        );
        const tileMap = this.getTileMap(tile.dataSource);
        if (!tileMap) {
            return false;
        }
        let lastTileKey = tile.tileKey;
        for (let deltaUp = 1; deltaUp <= levelsUp; ++deltaUp) {
            lastTileKey = lastTileKey.parent();
            if (tileMap.get(lastTileKey.mortonCode())?.animated ?? false) {
                return true;
            }
        }
        return false;
    }

    private wasAnyDescendantAnimated(tile: Tile): boolean {
        const distanceToMaxLevel = tile.dataSource.maxDataLevel - tile.tileKey.level;
        const levelsDown = Math.min(
            distanceToMaxLevel,
            this.m_mapView.visibleTileSet.options.quadTreeSearchDistanceDown
        );

        const tileMap = this.getTileMap(tile.dataSource);
        if (!tileMap) {
            return false;
        }
        const tilingScheme = tile.dataSource.getTilingScheme();
        let nextTileKeys = [tile.tileKey];
        let childTileKeys: TileKey[] = [];
        for (let deltaDown = 1; deltaDown <= levelsDown; ++deltaDown) {
            childTileKeys.length = 0;
            for (const tileKey of nextTileKeys) {
                for (const childTileKey of tilingScheme.getSubTileKeys(tileKey)) {
                    if (tileMap.get(childTileKey.mortonCode())?.animated ?? false) {
                        return true;
                    }
                    childTileKeys.push(childTileKey);
                }
            }
            // swap
            [nextTileKeys, childTileKeys] = [childTileKeys, nextTileKeys];
        }

        return false;
    }

    private removeTile(tile: Tile): void {
        const tileMap = this.getTileMap(tile.dataSource);
        if (!tileMap) {
            return;
        }
        tileMap.delete(tile.tileKey.mortonCode());

        // Remove tile map if it's empty. That way, counting the number of data sources in the
        // map is enough to know if there's any tile.
        if (tileMap.size === 0) {
            this.m_dataSourceMap.delete(tile.dataSource);
        }
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

    private resetAnimation(resetTiles: boolean) {
        this.m_state = AnimatedExtrusionState.None;
        this.m_startTime = -1;
        if (resetTiles) {
            this.m_dataSourceMap.forEach(tileMap => {
                tileMap.forEach(state => {
                    state.animated = false;
                });
            });
        }
    }

    private setExtrusionRatio(value: number) {
        this.m_dataSourceMap.forEach(tileMap => {
            tileMap.forEach(state => {
                if (!state.animated) {
                    this.setTileExtrusionRatio(state.materials, value);
                    if (value >= 1) {
                        state.animated = true;
                    }
                }
            });
        });
    }

    private setTileExtrusionRatio(materials: ExtrusionFeature[], value: number) {
        materials.forEach(material => {
            material.extrusionRatio = value;
        });
    }
}
