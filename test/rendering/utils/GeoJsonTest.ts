/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { FlatTheme, GeoJson, Light, Theme } from "@here/harp-datasource-protocol";
import { GeoJsonDataProvider } from "@here/harp-geojson-datasource";
import { LookAtParams, MapView, MapViewEventNames } from "@here/harp-mapview";
import { DataProvider } from "@here/harp-mapview-decoder";
import { GeoJsonTiler } from "@here/harp-mapview-decoder/index-worker";
import { waitForEvent } from "@here/harp-test-utils";
import { RenderingTestHelper } from "@here/harp-test-utils/index.web";
import { VectorTileDataSource } from "@here/harp-vectortile-datasource";
import { VectorTileDecoder } from "@here/harp-vectortile-datasource/index-worker";
import * as sinon from "sinon";

export interface GeoJsonDataSourceTestOptions {
    geoJson?: string | GeoJson;
    tileGeoJson?: boolean;
    dataProvider?: DataProvider;
    dataSourceOrder?: number;
}
export interface GeoJsonTestOptions extends GeoJsonDataSourceTestOptions {
    mochaTest: Mocha.Context;
    testImageName: string;
    theme: Theme | FlatTheme;
    geoJson?: string | GeoJson;
    lookAt?: Partial<LookAtParams>;
    tileGeoJson?: boolean;
    dataProvider?: DataProvider;
    extraDataSource?: GeoJsonDataSourceTestOptions;
}

function createDataSource(
    name: string,
    options: GeoJsonDataSourceTestOptions
): VectorTileDataSource {
    const tiler = new GeoJsonTiler();
    if (options.tileGeoJson === false) {
        sinon.stub(tiler, "getTile").resolves(options.geoJson);
    }

    return new VectorTileDataSource({
        decoder: new VectorTileDecoder(),
        dataProvider:
            options.dataProvider ??
            new GeoJsonDataProvider(
                "geojson",
                typeof options.geoJson === "string"
                    ? new URL(options.geoJson, window.location.href)
                    : options.geoJson!,
                { tiler }
            ),
        name,
        styleSetName: "geojson",
        dataSourceOrder: options.dataSourceOrder
    });
}

export class GeoJsonTest {
    mapView!: MapView;

    lights: Light[] = [
        {
            type: "ambient",
            color: "#FFFFFF",
            name: "ambientLight",
            intensity: 0.9
        },
        {
            type: "directional",
            color: "#FFFFFF",
            name: "light1",
            intensity: 0.8,
            direction: {
                x: 1,
                y: 5,
                z: 0.5
            }
        }
    ];

    dispose() {
        this.mapView?.dispose();
    }

    async run(options: GeoJsonTestOptions) {
        const ibct = new RenderingTestHelper(options.mochaTest, { module: "mapview" });
        const canvas = document.createElement("canvas");
        canvas.width = 400;
        canvas.height = 300;

        this.mapView = new MapView({
            canvas,
            theme: options.theme,
            preserveDrawingBuffer: true,
            pixelRatio: 1,
            disableFading: true
        });
        this.mapView.animatedExtrusionHandler.enabled = false;

        const defaultLookAt: Partial<LookAtParams> = {
            target: { lat: 53.3, lng: 14.6 },
            distance: 200000,
            tilt: 0,
            heading: 0
        };

        const lookAt: LookAtParams = { ...defaultLookAt, ...options.lookAt } as any;

        this.mapView.lookAt(lookAt);
        // Shutdown errors cause by firefox bug
        this.mapView.renderer.getContext().getShaderInfoLog = (x: any) => {
            return "";
        };

        const tiler = new GeoJsonTiler();
        if (options.tileGeoJson === false) {
            sinon.stub(tiler, "getTile").resolves(options.geoJson);
        }

        const dataSource = createDataSource("geojson", options);

        this.mapView.setDynamicProperty("enabled", true);
        this.mapView.addDataSource(dataSource);

        if (options.extraDataSource) {
            this.mapView.addDataSource(createDataSource("geojson2", options.extraDataSource));
        }

        await waitForEvent(this.mapView, MapViewEventNames.FrameComplete);
        await ibct.assertCanvasMatchesReference(canvas, options.testImageName);
    }
}
