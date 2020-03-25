/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { EarthConstants, webMercatorProjection } from "@here/harp-geoutils";
import { Vector2, Vector3 } from "three";
import { VTJsonDataAdapterId } from "./adapters/geojson/GeoJsonDataAdapter";
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
export function lat2tile(
    lat: number,
    zoom: number,
    func: (x: number) => number = Math.floor
): number {
    return func(
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
        top: lat2tile(
            north,
            decodeInfo.tileKey.level + N,
            decodeInfo.adapterId === VTJsonDataAdapterId ? Math.round : Math.floor
        ),
        left: ((west + 180) / 360) * scale
    };
}

/**
 * @hidden
 */
export function tile2world(
    extents: number,
    decodeInfo: DecodeInfo,
    position: Vector2,
    flipY: boolean = false,
    target: Vector2
): Vector2 {
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

    return target.set(
        ((left + position.x) / scale) * R,
        ((top + (flipY ? -position.y : position.y)) / scale) * R
    );
}

/**
 * @hidden
 */
export function world2tile(
    extents: number,
    decodeInfo: DecodeInfo,
    position: Vector2,
    flipY: boolean = false,
    target: Vector2
): Vector2 {
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

    return target.set(
        (position.x / R) * scale - left,
        (flipY ? -1 : 1) * ((position.y / R) * scale - top)
    );
}

const tempWorldPos = new Vector2();

export function webMercatorTile2TargetWorld(
    extents: number,
    decodeInfo: DecodeInfo,
    position: Vector2,
    target: Vector3,
    flipY: boolean = false
) {
    const worldPos = tile2world(extents, decodeInfo, position, flipY, tempWorldPos);
    target.set(worldPos.x, worldPos.y, 0);
    decodeInfo.targetProjection.reprojectPoint(webMercatorProjection, target, target);
}

export function webMercatorTile2TargetTile(
    extents: number,
    decodeInfo: DecodeInfo,
    position: Vector2,
    target: Vector3,
    flipY: boolean = false
) {
    webMercatorTile2TargetWorld(extents, decodeInfo, position, target, flipY);
    target.sub(decodeInfo.center);
}
