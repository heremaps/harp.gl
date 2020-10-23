/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { ImageTexture, Theme } from "@here/harp-datasource-protocol";
import { LoggerManager, UriResolver } from "@here/harp-utils";

import { MapViewImageCache } from "./image/MapViewImageCache";
import { MapView } from "./MapView";
import { ThemeLoader } from "./ThemeLoader";

const logger = LoggerManager.instance.create("MapViewThemeManager");

/**
 * Class handling theme updates for MapView
 */
export class MapViewThemeManager {
    private readonly m_imageCache: MapViewImageCache;
    private m_themePromise: Promise<Theme> | undefined;
    private m_abortControllers: AbortController[] = [];
    private m_theme: Theme = {};
    private m_isUpdating: boolean = false;

    constructor(private readonly m_mapView: MapView, private readonly m_uriResolver?: UriResolver) {
        this.m_imageCache = new MapViewImageCache(this.m_mapView);
    }

    async getTheme(): Promise<Theme> {
        if (!this.m_themePromise) {
            return this.m_theme;
        } else {
            return await this.m_themePromise;
        }
    }

    isLoading(): boolean {
        return this.m_themePromise !== undefined;
    }

    isUpdating(): boolean {
        return this.m_isUpdating;
    }

    /**
     * @deprecated
     * A helper for the deprecated MapView.theme getter, remove when
     * after deprecation
     */
    get theme() {
        return this.isLoading() ? {} : this.m_theme;
    }

    private async loadTheme(theme: Theme | string): Promise<Theme> {
        if (typeof theme === "string" || !ThemeLoader.isThemeLoaded(theme)) {
            try {
                this.m_themePromise = ThemeLoader.load(theme, {
                    uriResolver: this.m_uriResolver,
                    signal: this.createAbortController().signal
                });
                theme = await this.m_themePromise;
            } catch (error) {
                logger.error(`failed to load theme: ${error}`, error);
                theme = {};
            }
        }
        this.m_themePromise = undefined;
        return theme;
    }

    async setTheme(theme: Theme | string): Promise<Theme> {
        if (this.isLoading() || this.isUpdating()) {
            logger.warn("Formerly set Theme is still updating");
            this.m_themePromise = undefined;
            this.cancelThemeUpdate();
        }

        theme = await this.loadTheme(theme);

        this.m_isUpdating = true;
        const environment = this.m_mapView.sceneEnvironment;
        // Fog and sky.
        this.m_theme.fog = theme.fog;
        this.m_theme.sky = theme.sky;
        environment.updateSkyBackground(theme);
        environment.fog.reset(theme);

        this.m_theme.lights = theme.lights;
        environment.updateLighting(theme);

        // Clear color.
        this.m_theme.clearColor = theme.clearColor;
        this.m_theme.clearAlpha = theme.clearAlpha;
        environment.updateClearColor(theme);
        // Images.
        this.m_theme.images = theme.images;
        this.m_theme.imageTextures = theme.imageTextures;
        await this.updateImages(theme);

        // POI tables.
        this.m_theme.poiTables = theme.poiTables;
        await this.loadPoiTables(theme);

        // Text.
        this.m_theme.textStyles = theme.textStyles;
        this.m_theme.defaultTextStyle = theme.defaultTextStyle;
        this.m_theme.fontCatalogs = theme.fontCatalogs;

        await this.m_mapView.resetTextRenderer(theme);

        if (Array.isArray(theme.priorities)) {
            this.m_theme.priorities = theme.priorities;
        }
        this.m_mapView.mapAnchors.setPriorities(theme.priorities ?? []);

        if (Array.isArray(theme.labelPriorities)) {
            this.m_theme.labelPriorities = theme.labelPriorities;
        }

        if (this.m_theme.styles === undefined) {
            this.m_theme.styles = {};
        }
        environment.setBackgroundTheme(theme);

        this.m_theme.styles = theme.styles ?? {};
        this.m_theme.definitions = theme.definitions;

        for (const dataSource of this.m_mapView.dataSources) {
            dataSource.setTheme(this.m_theme);
        }
        this.m_isUpdating = false;
        return this.m_theme;
    }

    updateCache() {
        this.updateImages(this.m_theme);
        this.m_mapView.sceneEnvironment.updateLighting(this.m_theme);
        this.m_mapView.sceneEnvironment.updateSkyBackground(this.m_theme);
    }

    get imageCache(): MapViewImageCache {
        return this.m_imageCache;
    }

    dispose() {
        this.m_imageCache.clear();
    }

    private async loadPoiTables(theme: Theme) {
        this.m_mapView.poiTableManager.clear();

        // Add the POI tables defined in the theme.
        await this.m_mapView.poiTableManager.loadPoiTables(theme as Theme);
    }

    private cancelThemeUpdate() {
        for (var i = 0; i < this.m_abortControllers.length; i++) {
            this.m_abortControllers[i].abort();
        }
        this.m_abortControllers = [];
        this.m_imageCache.clear();
        this.m_mapView.poiManager.clear();
        this.m_mapView.poiTableManager.clear();
    }

    private createAbortController(): AbortController {
        this.m_abortControllers.push(new AbortController());
        return this.m_abortControllers[this.m_abortControllers.length - 1];
    }

    private async updateImages(theme: Theme) {
        this.m_imageCache.clear();
        this.m_mapView.poiManager.clear();

        if (theme.images !== undefined) {
            for (const name of Object.keys(theme.images)) {
                const image = theme.images[name];
                this.m_imageCache.addImage(name, image.url, image.preload === true);
                if (typeof image.atlas === "string") {
                    await this.m_mapView.poiManager.addTextureAtlas(
                        name,
                        image.atlas,
                        this.createAbortController().signal
                    );
                }
            }
        }

        if (theme.imageTextures !== undefined) {
            theme.imageTextures.forEach((imageTexture: ImageTexture) => {
                this.m_mapView.poiManager.addImageTexture(imageTexture);
            });
        }
    }
}
