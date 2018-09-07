/*
 * Copyright (C) 2017-2018 HERE Global B.V. and its affiliate(s).
 * All rights reserved.
 *
 * This software and other materials contain proprietary information
 * controlled by HERE and are protected by applicable copyright legislation.
 * Any use and utilization of this software and other materials and
 * disclosure to any third parties is conditional upon having a separate
 * agreement with HERE for the access, use, utilization or disclosure of this
 * software. In the absence of such agreement, the use of the software is not
 * allowed.
 */

declare let self: Worker & {
    importScripts(..._scripts: string[]): void;
};

self.importScripts("three.min.js");

import GeoJsonWorkerClient from "@here/geojson-datasource/lib/GeoJsonDecoder";
import LandmarkWorkerClient from "@here/landmark-datasource/lib/LandmarkDecoder";
import OmvWorkerClient from "@here/omv-datasource/lib/OmvDecoder";

/* tslint:disable:no-unused-expression */
new OmvWorkerClient();
new OmvWorkerClient("omv-tile-decoder-1");
new OmvWorkerClient("omv-tile-decoder-2");
new OmvWorkerClient("omv-tile-decoder-3");
new LandmarkWorkerClient("landmark-tile-decoder-1");
new LandmarkWorkerClient("landmark-tile-decoder-2");
new LandmarkWorkerClient("landmark-tile-decoder-3");
new LandmarkWorkerClient();
new GeoJsonWorkerClient();
