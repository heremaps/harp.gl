declare let self: Worker & {
    importScripts(..._scripts: string[]): void;
};

self.importScripts("three.min.js");

import { GeoJsonTileDecoderService } from "@here/geojson-datasource/index-worker";
import { OmvTileDecoderService } from "@here/omv-datasource/index-worker";

OmvTileDecoderService.start();
GeoJsonTileDecoderService.start();
