/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { mapBundleMain } from "./BundleMain";

if (!(window as any).THREE) {
    // eslint-disable-next-line no-console
    console.warn(
        "harp.js: It looks like 'three.js' is not loaded. This script requires 'THREE' object to " +
            "be defined. See https://github.com/heremaps/harp.gl/@here/harp.gl."
    );
}

export * from "@here/harp-mapview";
export * from "@here/harp-vectortile-datasource";
export * from "@here/harp-omv-datasource";
export * from "@here/harp-debug-datasource";
export * from "@here/harp-geojson-datasource";
export * from "@here/harp-features-datasource";
export * from "@here/harp-webtile-datasource";
export * from "@here/harp-map-controls/lib/MapControls";
export * from "@here/harp-map-controls/lib/MapControlsUI";
export * from "@here/harp-datasource-protocol";
export * from "@here/harp-geoutils";
export * from "@here/harp-mapview-decoder";

mapBundleMain();
