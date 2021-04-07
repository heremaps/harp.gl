/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    EarthConstants,
    isVector3Like,
    Vector2Like,
    Vector3Like,
    webMercatorProjection
} from "@here/harp-geoutils";
import * as THREE from "three";

import { DecodeInfo } from "./DecodeInfo";

/**
 * @hidden
 */
export function isArrayBufferLike(data: any): data is ArrayBufferLike {
    if (typeof SharedArrayBuffer !== "undefined") {
        return data instanceof ArrayBuffer || data instanceof SharedArrayBuffer;
    } else {
        return data instanceof ArrayBuffer;
    }
}

/**
 * @hidden
 */
export function lat2tile(lat: number, zoom: number): number {
    return Math.round(
        ((1 -
            Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) /
                Math.PI) /
            2) *
            Math.pow(2, zoom)
    );
}

/**
 * @hidden
 */
export function tile2lat(y: number, level: number): number {
    const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, level);
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

export interface WorldTileProjectionCookie {
    extents: number;
    top: number;
    left: number;
    scale: number;
}

export function createWorldTileTransformationCookie(extents: number, decodeInfo: DecodeInfo) {
    const { north, west } = decodeInfo.geoBox;
    const N = Math.log2(extents);
    const scale = Math.pow(2, decodeInfo.tileKey.level + N);
    return {
        extents,
        scale,
        top: lat2tile(north, decodeInfo.tileKey.level + N),
        left: Math.round(((west + 180) / 360) * scale)
    };
}

/**
 * @hidden
 */
export function tile2world<VectorType extends Vector3Like>(
    extents: number,
    decodeInfo: DecodeInfo,
    position: Vector2Like,
    flipY: boolean = false,
    target: VectorType
): VectorType {
    if (
        decodeInfo.worldTileProjectionCookie === undefined ||
        decodeInfo.worldTileProjectionCookie.extents !== extents
    ) {
        decodeInfo.worldTileProjectionCookie = createWorldTileTransformationCookie(
            extents,
            decodeInfo
        );
    }

    const { top, left, scale } = decodeInfo.worldTileProjectionCookie;
    const R = EarthConstants.EQUATORIAL_CIRCUMFERENCE;

    target.x = ((left + position.x) / scale) * R;
    target.y = ((top + (flipY ? -position.y : position.y)) / scale) * R;
    target.z = isVector3Like(position) ? position.z : 0;

    return target;
}

/**
 * @hidden
 */
export function world2tile<VectorType extends Vector2Like>(
    extents: number,
    decodeInfo: DecodeInfo,
    position: Vector3Like,
    flipY: boolean = false,
    target: VectorType
): VectorType {
    if (
        decodeInfo.worldTileProjectionCookie === undefined ||
        decodeInfo.worldTileProjectionCookie.extents !== extents
    ) {
        decodeInfo.worldTileProjectionCookie = createWorldTileTransformationCookie(
            extents,
            decodeInfo
        );
    }
    const { top, left, scale } = decodeInfo.worldTileProjectionCookie;
    const R = EarthConstants.EQUATORIAL_CIRCUMFERENCE;

    target.x = Math.round((position.x / R) * scale - left);
    target.y = Math.round((flipY ? -1 : 1) * ((position.y / R) * scale - top));
    if (isVector3Like(target)) {
        target.z = position.z;
    }
    return target;
}

export function webMercatorTile2TargetWorld(
    extents: number,
    decodeInfo: DecodeInfo,
    position: THREE.Vector2 | THREE.Vector3,
    target: THREE.Vector3,
    scaleHeight: boolean,
    flipY: boolean = false
) {
    tile2world(extents, decodeInfo, position, flipY, target);
    decodeInfo.targetProjection.reprojectPoint(webMercatorProjection, target, target);
    if (position instanceof THREE.Vector3 && scaleHeight) {
        target.z *= decodeInfo.targetProjection.getScaleFactor(target);
    }
}

export function webMercatorTile2TargetTile(
    extents: number,
    decodeInfo: DecodeInfo,
    position: THREE.Vector2 | THREE.Vector3,
    target: THREE.Vector3,
    scaleHeight: boolean,
    flipY: boolean = false
) {
    webMercatorTile2TargetWorld(extents, decodeInfo, position, target, scaleHeight, flipY);
    target.sub(decodeInfo.center);
}
