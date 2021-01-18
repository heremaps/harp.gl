/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Feature,
    FeatureCollection,
    FeatureGeometry,
    GeometryCollection
} from "@here/harp-datasource-protocol";
import { GeoBox, GeoCoordinates } from "@here/harp-geoutils";
import { MapView } from "@here/harp-mapview";
import { LoggerManager } from "@here/harp-utils";
import {
    GeoJsonDataProvider,
    GeoJsonDataProviderOptions,
    VectorTileDataSource,
    VectorTileDataSourceParameters
} from "@here/harp-vectortile-datasource";

import { MapViewFeature } from "./Features";

const logger = LoggerManager.instance.create("FeaturesDataSource");

const NAME = "user-features-datasource";
const DEFAULT_GEOJSON: FeatureCollection = {
    type: "FeatureCollection",
    features: []
};

/**
 * Options for [[FeaturesDataSource]].
 */
export interface FeatureDataSourceOptions
    extends VectorTileDataSourceParameters,
        GeoJsonDataProviderOptions {
    /**
     * Initial set of features for new instance of [[FeaturesDataSource]].
     *
     * Shortcut for calling [[FeaturesDataSource.add]] after construction.
     */
    features?: MapViewFeature[];

    /**
     * Initial GeoJSON load for new instance of [[FeaturesDataSource]].
     *
     * Shortcut for calling [[FeaturesDataSource.setFromGeojson]] after construction.
     */
    geojson?: FeatureCollection | GeometryCollection | Feature;
}

/**
 * [[DataSource]] implementation to use for the addition of custom features.
 */
export class FeaturesDataSource extends VectorTileDataSource {
    private m_isAttached = false;
    private m_featureCollection: FeatureCollection = this.emptyGeojson();

    /**
     * Builds a `FeaturesDataSource`.
     *
     * @param options - specify custom options using [[FeatureDataSourceOptions]] interface.
     */
    constructor(options?: FeatureDataSourceOptions) {
        super({
            ...options,
            dataProvider: new GeoJsonDataProvider(NAME, DEFAULT_GEOJSON, options)
        });
        if (options !== undefined) {
            if (options.features !== undefined) {
                this.add(...options.features);
            }
            if (options.geojson !== undefined) {
                this.setFromGeojson(options.geojson);
            }
        }
    }

    /**
     * This method allows to directly add a GeoJSON without using [[MapViewFeature]] instances. It
     * also overwrites existing features in this data source. To add a GeoJSON without overwriting
     * the data source, one should loop through it to create [[MapViewFeature]] and add them with
     * the `add` method.
     *
     * @param geojson - A javascript object matching the GeoJSON specification.
     */
    setFromGeojson(geojson: FeatureCollection | GeometryCollection | Feature) {
        if (geojson.type === "FeatureCollection") {
            this.m_featureCollection = geojson;
        } else if (geojson.type === "Feature") {
            this.m_featureCollection = this.emptyGeojson();
            this.m_featureCollection.features.push(geojson);
        } else if (geojson.type === "GeometryCollection") {
            this.m_featureCollection = this.emptyGeojson();
            for (const geometry of geojson.geometries) {
                this.m_featureCollection.features.push({
                    type: "Feature",
                    geometry
                });
            }
        } else {
            throw new TypeError("The provided object is not a valid GeoJSON object.");
        }
        this.update();
        return this;
    }

    /**
     * Adds a custom feature in the datasource.
     *
     * @param features - The features to add in the datasource.
     */
    add(...features: MapViewFeature[]): this {
        for (const feature of features) {
            this.addFeature(feature);
        }
        this.update();
        return this;
    }

    /**
     * Removes a custom feature in the datasource.
     *
     * @param features - The features to add in the datasource.
     */
    remove(...features: MapViewFeature[]): this {
        for (const feature of features) {
            this.removeFeature(feature);
        }
        this.update();
        return this;
    }

    /**
     * Removes all the custom features in this `FeaturesDataSource`.
     */
    clear() {
        this.m_featureCollection = this.emptyGeojson();
        this.update();
    }

    /** @override */
    async connect(): Promise<void> {
        await super.connect();
        if (this.m_featureCollection.features.length > 0) {
            await this.update();
        }
    }

    /**
     * Override [[DataSource.attach]] to know if we're really connected to [[MapView]].
     * @param mapView -
     * @override
     */
    attach(mapView: MapView): void {
        super.attach(mapView);
        this.m_isAttached = true;
    }

    /**
     * Override [[DataSource.detach]] to know if we're really connected to [[MapView]].
     * @param mapView -
     * @override
     */
    detach(mapView: MapView): void {
        super.detach(mapView);
        this.m_isAttached = false;
    }

    /**
     * Get [[GeoBox]] containing all the points in datasource.
     *
     * Returns undefined if there were no features added to this DS.
     */
    getGeoBox(): GeoBox | undefined {
        let result: GeoBox | undefined;
        const addPoint = (geoJsonCoords: number[]) => {
            // NOTE: GeoJson coordinates are in [longitude, latitude] order!
            const coords = new GeoCoordinates(geoJsonCoords[1], geoJsonCoords[0]);
            if (result === undefined) {
                result = new GeoBox(coords, coords.clone());
            } else {
                result.growToContain(coords);
            }
        };
        for (const feature of this.m_featureCollection.features) {
            switch (feature.geometry.type) {
                case "Point":
                    addPoint(feature.geometry.coordinates);
                    break;
                case "MultiPoint":
                case "LineString":
                    feature.geometry.coordinates.forEach(addPoint);
                    break;
                case "MultiLineString":
                case "Polygon":
                    feature.geometry.coordinates.forEach(segment => segment.forEach(addPoint));
                    break;
                case "MultiPolygon":
                    feature.geometry.coordinates.forEach(polygon =>
                        polygon.forEach(segment => segment.forEach(addPoint))
                    );
                    break;
            }
        }
        return result;
    }

    private addFeature(feature: MapViewFeature) {
        // Check if the feature is not already in there.
        const hasFeature = this.m_featureCollection.features.some(
            _feature => _feature.properties.__mapViewUuid === feature.uuid
        );
        if (hasFeature) {
            return;
        }

        // Create a GeoJson feature from the feature coordinates and push it.
        const geometry: FeatureGeometry = {
            type: feature.type,
            coordinates: feature.coordinates
        } as any;
        const geojsonFeature: Feature = {
            type: "Feature",
            geometry,
            properties: {
                ...feature.properties,
                __mapViewUuid: feature.uuid
            }
        };
        this.m_featureCollection.features.push(geojsonFeature);
    }

    private removeFeature(feature: MapViewFeature) {
        // Remove geojson feature from the root FeatureCollection.
        const index = this.m_featureCollection.features.findIndex(
            _feature => _feature.properties.__mapViewUuid === feature.uuid
        );

        if (index === -1) {
            return;
        }
        this.m_featureCollection.features.splice(index, 1);
    }

    private async update() {
        const dataProvider = this.dataProvider() as GeoJsonDataProvider;
        if (!this.m_isAttached || !dataProvider.ready()) {
            return;
        }

        try {
            await dataProvider.updateInput(this.m_featureCollection);
            if (this.m_isAttached) {
                this.mapView.markTilesDirty(this);
            }
        } catch (error) {
            // We use `update` in sync API, so there's no-one to react to errors so log them.
            logger.error(`[${this.name}]: failed to update tile index`, error);
        }
    }

    private emptyGeojson(): FeatureCollection {
        return {
            features: [],
            type: "FeatureCollection"
        };
    }
}
