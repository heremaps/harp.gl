/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    GeoCoordinates,
    mercatorProjection,
    Projection,
    ProjectionType
} from "@here/harp-geoutils";
import * as THREE from "three";

/**
 * Creates a stub of the Mercator projection.
 * @param sandbox Sinon sandbox to keep track of created stubs.
 * @returns MercatorProjection stub.
 */
export function stubMercatorProjection(sandbox: sinon.SinonSandbox): Projection {
    sandbox
        .stub(mercatorProjection, "unprojectPoint")
        .callsFake(worldPoint => new GeoCoordinates(worldPoint.y, worldPoint.x, worldPoint.z));
    sandbox.stub(mercatorProjection, "projectPoint").callsFake((geoCoords, result) => {
        const worldPoint = result ?? new THREE.Vector3();
        worldPoint.x = geoCoords.longitude;
        worldPoint.y = geoCoords.latitude;
        worldPoint.z = geoCoords.altitude ?? 0;
        return worldPoint;
    });
    sandbox.stub(mercatorProjection, "type").get(() => {
        return ProjectionType.Planar;
    });

    return mercatorProjection;
}
