/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { MapControls } from "@here/harp-map-controls";
import { MapView } from "@here/harp-mapview";
import { VectorTileDataSource } from "@here/harp-vectortile-datasource";

const defaultTheme = "resources/berlin_tilezen_base.json";

export class View {
    constructor(args) {
        this.canvas = args.canvas;
        this.theme = args.theme === undefined ? defaultTheme : args.theme;
        this.mapView = this.initialize();
    }

    initialize() {
        const mapView = new MapView({
            canvas: this.canvas,
            theme: this.theme,
            decoderUrl: "decoder.bundle.js"
        });
        const dataSource = new VectorTileDataSource({
            authenticationCode: "<%= apikey %>"
        });
        mapView.addDataSource(dataSource);
        MapControls.create(mapView);
        return mapView;
    }
}
