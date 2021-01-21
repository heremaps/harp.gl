/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    FlatTheme,
    ImageDefinitions,
    ImageTexture,
    PoiTableRef,
    Theme
} from "@here/harp-datasource-protocol";
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
    private m_updatePromise: Promise<void> | undefined;
    private m_abortControllers: AbortController[] = [];
    private m_theme: Theme = {};

    constructor(private readonly m_mapView: MapView, private readonly m_uriResolver?: UriResolver) {
        this.m_imageCache = new MapViewImageCache();
    }

    async setTheme(theme: Theme | FlatTheme | string): Promise<Theme> {
        if (this.isUpdating()) {
            logger.warn("Formerly set Theme is still updating, update will be canceled");
            this.cancelThemeUpdate();
        }

        this.m_updatePromise = this.loadTheme(theme).then(async theme => {
            await this.updateTheme(theme);
        });
        await this.m_updatePromise;
        this.m_updatePromise = undefined;
        return this.m_theme;
    }

    async getTheme(): Promise<Theme> {
        if (this.isUpdating()) {
            await this.m_updatePromise;
        }
        return this.m_theme;
    }

    isUpdating(): boolean {
        return this.m_updatePromise !== undefined;
    }

    /**
     * @deprecated
     * A helper for the deprecated MapView.theme getter, remove when
     * after deprecation
     */
    get theme() {
        return this.isUpdating() ? {} : this.m_theme;
    }

    private async loadTheme(theme: Theme | string | FlatTheme): Promise<Theme> {
        let loadedTheme: Theme = {};
        if (typeof theme === "string" || !ThemeLoader.isThemeLoaded(theme)) {
            try {
                loadedTheme = await ThemeLoader.load(theme, {
                    uriResolver: this.m_uriResolver,
                    signal: this.createAbortController().signal
                });
            } catch (error) {
                if (error.name === "AbortError") {
                    logger.warn(`theme loading was aborted due to: ${error}`);
                } else {
                    logger.error(`failed to load theme: ${error}`);
                }
            }
        } else {
            loadedTheme = theme as Theme;
        }
        return loadedTheme;
    }

    private async updateTheme(theme: Theme): Promise<void> {
        const environment = this.m_mapView.sceneEnvironment;
        // Fog and sky.
        this.m_theme.fog = theme.fog;
        this.m_theme.sky = theme.sky;
        environment.updateSkyBackground(theme.sky);
        environment.fog.reset(theme.fog);

        this.m_theme.lights = theme.lights;
        environment.updateLighting(theme.lights);

        // Clear color.
        this.m_theme.clearColor = theme.clearColor;
        this.m_theme.clearAlpha = theme.clearAlpha;
        environment.updateClearColor(theme.clearColor, theme.clearAlpha);

        // Images.
        this.m_theme.images = theme.images;
        this.m_theme.imageTextures = theme.imageTextures;
        await this.updateImages(theme.images, theme.imageTextures);

        // POI tables.
        this.m_theme.poiTables = theme.poiTables;
        await this.loadPoiTables(theme.poiTables);
        // Text.
        this.m_theme.textStyles = theme.textStyles;
        this.m_theme.defaultTextStyle = theme.defaultTextStyle;
        this.m_theme.fontCatalogs = theme.fontCatalogs;

        await this.m_mapView.resetTextRenderer(
            theme.fontCatalogs,
            theme.textStyles,
            theme.defaultTextStyle
        );

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

        this.m_theme.styles = theme.styles ?? {};
        this.m_theme.definitions = theme.definitions;

        environment.clearBackgroundDataSource();
        for (const dataSource of this.m_mapView.dataSources) {
            await dataSource.setTheme(this.m_theme);
        }
    }

    updateCache() {
        this.updateImages(this.m_theme.images, this.m_theme.imageTextures);
        this.m_mapView.sceneEnvironment.updateLighting(this.m_theme.lights);
        this.m_mapView.sceneEnvironment.updateSkyBackground(
            this.m_theme.sky,
            this.m_theme.clearColor
        );
    }

    get imageCache(): MapViewImageCache {
        return this.m_imageCache;
    }

    dispose() {
        this.m_imageCache.clear();
    }

    private async loadPoiTables(poiTables?: PoiTableRef[]) {
        this.m_mapView.poiTableManager.clear();

        // Add the POI tables defined in the theme.
        await this.m_mapView.poiTableManager.loadPoiTables(poiTables);
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

    private async updateImages(images?: ImageDefinitions, imageTextures?: ImageTexture[]) {
        this.m_imageCache.clear();
        this.m_mapView.poiManager.clear();

        if (images !== undefined) {
            for (const name of Object.keys(images)) {
                const image = images[name];
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

        if (imageTextures !== undefined) {
            imageTextures.forEach((imageTexture: ImageTexture) => {
                this.m_mapView.poiManager.addImageTexture(imageTexture);
            });
        }
    }
}
