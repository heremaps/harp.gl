/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Feature,
    FeatureCollection,
    FeatureGeometry,
    LineString,
    Point,
    Polygon
} from "@here/harp-datasource-protocol";
import { GeoJsonDataProvider } from "@here/harp-geojson-datasource";
import { OmvDataSource } from "@here/harp-omv-datasource";
import {
    MapViewFeature,
    MapViewLineFeature,
    MapViewPointFeature,
    MapViewPolygonFeature
} from "./Features";

const NAME = "user-features-datasource";

const DEFAULT_GEOJSON: FeatureCollection = {
    type: "FeatureCollection",
    features: []
};

/**
 * [[DataSource]] implementation to use for the addition of custom features.
 */
export class FeaturesDataSource extends OmvDataSource {
    private m_featureCollection: FeatureCollection = DEFAULT_GEOJSON;

    /**
     * Builds a `FeaturesDataSource`.
     *
     * @param workerTilerUrl Worker tiler URL. Defaults to `./decoder.bundle.ts` in the
     * [[ConcurrentTilerFacade]].
     */
    constructor(workerTilerUrl?: string) {
        super({
            name: NAME,
            dataProvider: new GeoJsonDataProvider(NAME, DEFAULT_GEOJSON, workerTilerUrl)
        });
    }

    /**
     * Creates a polygon feature.
     *
     * @param coordinates The geometry of the feature.
     * @param style The style to draw the feature with.
     */
    createPolygon(coordinates: Polygon["coordinates"], properties?: {}): MapViewPolygonFeature {
        return new MapViewPolygonFeature(coordinates, properties);
    }

    /**
     * Creates a line feature.
     *
     * @param coordinates The geometry of the feature.
     * @param style The style to draw the feature with.
     */
    createLine(coordinates: LineString["coordinates"], properties?: {}): MapViewLineFeature {
        return new MapViewLineFeature(coordinates, properties);
    }

    /**
     * Creates a point feature.
     *
     * @param coordinates The geometry of the feature.
     * @param style The style to draw the feature with.
     */
    createPoint(coordinates: Point["coordinates"], properties?: {}): MapViewPointFeature {
        return new MapViewPointFeature(coordinates, properties);
    }

    /**
     * Adds a custom feature in the datasource.
     *
     * @param features
     */
    add(...features: MapViewFeature[]) {
        for (const feature of features) {
            this.addFeature(feature);
        }
        this.update();
    }

    /**
     * Removes a custom feature in the datasource.
     *
     * @param feature
     */
    remove(...features: MapViewFeature[]) {
        for (const feature of features) {
            this.removeFeature(feature);
        }
        this.update();
    }

    /**
     * Removes all the custom features in this `FeaturesDataSource`.
     */
    clear() {
        this.m_featureCollection = {
            type: "FeatureCollection",
            features: []
        };
        this.update();
    }

    private addFeature(feature: MapViewFeature) {
        // Check if the feature is not already in there.
        for (const _feature of this.m_featureCollection.features) {
            if (
                _feature.properties !== undefined &&
                _feature.properties.__mapViewUuid === feature.uuid
            ) {
                return;
            }
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
        const features = this.m_featureCollection.features;
        let featureIndex;
        for (let i = 0; i < features.length; i++) {
            if (
                features[i].properties !== undefined &&
                features[i].properties.__mapViewUuid === feature.uuid
            ) {
                featureIndex = i;
                break;
            }
        }
        if (featureIndex === undefined) {
            return;
        }
        features.slice(featureIndex, 1);
    }

    private update() {
        (this.dataProvider() as GeoJsonDataProvider).updateInput(this.m_featureCollection);
        this.mapView.markTilesDirty(this);
        this.mapView.clearTileCache(NAME);
    }
}
