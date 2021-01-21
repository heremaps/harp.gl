/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoCoordinates, mercatorTilingScheme, TileKey, TilingScheme } from "@here/harp-geoutils";
import * as THREE from "three";

import { DisplacementMap, TileDisplacementMap } from "../lib/DisplacementMap";
import { ElevationProvider } from "../lib/ElevationProvider";

class ElevationProviderFake implements ElevationProvider {
    getHeight(_geoPoint: GeoCoordinates, _level?: number): number | undefined {
        return undefined;
    }

    sampleHeight(_geoPoint: GeoCoordinates, _tileDisplacementMap: TileDisplacementMap): number {
        return 0;
    }

    rayCast(_x: number, _y: number): THREE.Vector3 | undefined {
        return undefined;
    }

    getDisplacementMap(_tileKey: TileKey): TileDisplacementMap | undefined {
        return undefined;
    }

    getTilingScheme(): TilingScheme | undefined {
        return undefined;
    }

    clearCache(): void {
        return;
    }
}

export type ElevationProviderStub = sinon.SinonStubbedInstance<ElevationProvider>;

/**
 * Creates an ElevationProvider stub.
 * @param sandbox - Sinon sandbox to keep track of created stubs.
 * @returns ElevationProvider stub.
 */
export function stubElevationProvider(sandbox: sinon.SinonSandbox): ElevationProviderStub {
    const stub = sandbox.createStubInstance(ElevationProviderFake);
    stub.getHeight.callsFake(geoPoint => {
        return geoPoint.altitude ?? 0;
    });
    stub.sampleHeight.callsFake(geoPoint => {
        return geoPoint.altitude ?? 0;
    });
    return stub;
}

const empty: Float32Array = new Float32Array();
const dummyTexture = new THREE.DataTexture(empty, 32, 32);
const dummyDisplacementMap: DisplacementMap = {
    xCountVertices: 32,
    yCountVertices: 32,
    buffer: new Float32Array()
};

/**
 * Creates a fake TileDisplacementMap with no data.
 * @param tileKey - The key corresponding to the tile to which this map belongs.
 * @returns The fake map.
 */
export function fakeTileDisplacementMap(tileKey: TileKey): TileDisplacementMap {
    return {
        tileKey,
        texture: dummyTexture,
        displacementMap: dummyDisplacementMap,
        geoBox: mercatorTilingScheme.getGeoBox(tileKey)
    };
}
