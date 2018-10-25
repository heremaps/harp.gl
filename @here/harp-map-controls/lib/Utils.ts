/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Vector2, Vector3 } from "three";

/**
 * Transforms the given point in screen space into NDC space by taking the given screen dimension
 * into account.
 *
 * @param screenCoordinateX X coordinate in screen space.
 * @param screenCoordinateY Y coordinate in screen space.
 * @param screenSizeX Width of the reference screen size.
 * @param screenSizeY Height of the reference screen size.
 */
export function calculateNormalizedScreenCoordinates(
    screenCoordinateX: number,
    screenCoordinateY: number,
    screenSizeX: number,
    screenSizeY: number
): Vector2 {
    return new Vector2(
        (screenCoordinateX / screenSizeX) * 2 - 1,
        -((screenCoordinateY / screenSizeY) * 2) + 1
    );
}

/**
 * Returns the azimuth and altitude in radians for the given direction vector.
 *
 * @param direction The direction vector. Does not have to be normalized.
 */
export function directionToAzimuthAltitude(
    direction: Vector3
): { azimuth: number; altitude: number } {
    const normalizedDirection = direction.clone().normalize();

    //Shamelessly copied from Jan ;)
    const xy = new Vector2(normalizedDirection.x, normalizedDirection.y);
    const nxz = new Vector2(xy.length(), normalizedDirection.z).normalize();

    const azimuth = Math.atan2(xy.x, xy.y);
    const altitude = -Math.asin(nxz.y);

    return { azimuth, altitude };
}

/**
 * Returns the direction vector that is described by the given azimuth and altitude.
 *
 * @param azimuth Azimuth in radians.
 * @param altitude Altitude in radians.
 */
export function azimuthAltitudeToDirection(azimuth: number, altitude: number): Vector3 {
    azimuth = azimuth;
    altitude = altitude;
    //Shamelessly copied from Jan ;)
    const result = new Vector3();
    const cosAltitude = Math.cos(altitude);

    result.setX(Math.sin(azimuth) * cosAltitude);
    result.setY(Math.cos(azimuth) * cosAltitude);
    result.setZ(Math.sin(altitude));

    return result;
}

/**
 * Safely parses decimal value into `number`.
 *
 * Safely falls back to default value for `null`, `undefined`, `NaN`, empty strings, and strings
 * with characters other than digits.
 *
 * @param text Number as a text to be parsed.
 * @param fallback Default value, which is returned if `text` doesn't represent a valid number.
 */
export function safeParseDecimalInt(text: string | null | undefined, fallback: number): number {
    if (text === null || text === undefined || text === "") {
        return fallback;
    }
    if (!text.match(integerRe)) {
        return fallback;
    }
    const result = Number.parseInt(text, 10);
    if (isNaN(result)) {
        return fallback;
    }
    return result;
}
const integerRe = /^\d+$/;

/**
 * Extracts the CSS width and height of the given canvas if available, or width and height of the
 * canvas otherwise.
 *
 * @param canvas The canvas.
 */
export function getWidthAndHeightFromCanvas(
    canvas: HTMLCanvasElement
): { width: number; height: number } {
    return {
        //use clientWidth and clientHeight to support HiDPI devices
        width: safeParseDecimalInt(canvas.style.width, canvas.clientWidth),
        height: safeParseDecimalInt(canvas.style.height, canvas.clientHeight)
    };
}
