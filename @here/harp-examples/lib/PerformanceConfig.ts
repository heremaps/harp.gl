/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Configurations for benchmark example.
 */
export namespace PerformanceTestData {
    const REDUCED_ZOOM_LEVELS = [1, 2, 3, 7, 11, 15, 16, 17, 18, 19];
    const REDUCED_ZOOM_LEVEL_TILTS = [0, 0, 0, 30, 48, 55, 55, 55, 55, 55];

    const ALL_ZOOM_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    const ALL_ZOOM_LEVEL_TILTS = [
        0,
        0,
        0,
        10,
        10,
        20,
        30,
        35,
        38,
        42,
        48,
        50,
        52,
        55,
        55,
        55,
        55,
        55,
        55,
        55
    ];

    const TEST_ALL_ZOOM_LEVELS = true;
    const ZOOM_LEVELS_TO_TEST = TEST_ALL_ZOOM_LEVELS ? ALL_ZOOM_LEVELS : REDUCED_ZOOM_LEVELS;
    const ZOOM_LEVEL_TILTS_TO_TEST = TEST_ALL_ZOOM_LEVELS
        ? ALL_ZOOM_LEVEL_TILTS
        : REDUCED_ZOOM_LEVEL_TILTS;

    export interface FlyoverLocation {
        lat: number;
        long: number;
        zoomLevel: number;
        tilt: number;
    }

    export interface FlyOverConfiguration {
        controlPoints: number[];
        zoomLevels: number[];
        tilts: number[];
        numberOfDrawPoints: number;
    }

    export interface ZoomLevelConfiguration {
        lat: number;
        long: number;
        zoomLevels: number[];
        tilts: number[];
    }

    export const NEW_YORK_FLYOVER = {
        controlPoints: [
            40.5833105,
            -73.9754567,
            40.7088095,
            -74.0143577,
            40.7589052,
            -73.9848074,
            40.6442765,
            -73.7719587
        ],
        zoomLevels: [10, 14, 18, 5],
        tilts: [42, 55, 55, 10],
        numberOfDrawPoints: 1000
    };

    export const NEW_YORK_FLYOVER_ZL17 = {
        controlPoints: [
            40.706346,
            -74.010112,
            40.760026,
            -73.968245,
            40.796438,
            -73.940555,
            40.85468,
            -73.931703
        ],
        zoomLevels: [17.1, 17.1, 17.1, 17.1],
        tilts: [0, 0, 0, 0],
        numberOfDrawPoints: 1000
    };

    export const NEW_YORK_ZOOM = {
        lat: 40.71455,
        long: -74.00714,
        zoomLevels: ZOOM_LEVELS_TO_TEST,
        tilts: ZOOM_LEVEL_TILTS_TO_TEST
    };

    export const NEW_YORK_ZOOM_REDUCED = {
        lat: 40.71455,
        long: -74.00714,
        zoomLevels: [16],
        tilts: ZOOM_LEVEL_TILTS_TO_TEST
    };

    export const BERLIN_ZOOM = {
        lat: 52.52,
        long: 13.405,
        zoomLevels: ZOOM_LEVELS_TO_TEST,
        tilts: ZOOM_LEVEL_TILTS_TO_TEST
    };

    export const PARIS_ZOOM = {
        lat: 48.8566,
        long: 2.3522,
        zoomLevels: ZOOM_LEVELS_TO_TEST,
        tilts: ZOOM_LEVEL_TILTS_TO_TEST
    };

    export const BELLINZONA_ZOOM = {
        lat: 46.2177542,
        long: 9.0448866,
        zoomLevels: ZOOM_LEVELS_TO_TEST,
        tilts: ZOOM_LEVEL_TILTS_TO_TEST
    };

    // Around the world 4 times
    export const PARIS_ZOOM_PROXY = {
        lat: 48.8566,
        long: 2.3522 + 4 * 360,
        zoomLevels: ZOOM_LEVELS_TO_TEST,
        tilts: ZOOM_LEVEL_TILTS_TO_TEST
    };

    export const IZMIR_ZOOM = {
        lat: 38.40389671,
        long: 27.15224164,
        zoomLevels: ZOOM_LEVELS_TO_TEST,
        tilts: ZOOM_LEVEL_TILTS_TO_TEST
    };

    export const PARIS_FLYOVER = {
        controlPoints: [
            48.7551441,
            2.3409459,
            48.8025186,
            2.3438523,
            48.8556621,
            2.3462173,
            48.8562293,
            2.3058694,
            48.8578814,
            2.2614787
        ],
        zoomLevels: [10, 14, 18, 14, 10],
        tilts: [42, 55, 55, 55, 42],
        numberOfDrawPoints: 5000
    };

    export const PARIS__LONDON_FLYOVER = {
        controlPoints: [
            48.7551441,
            2.3409459,
            48.8025186,
            2.3438523,
            48.8556621,
            2.3462173,
            48.8562293,
            2.3058694,
            48.8578814,
            2.2614787,
            51.2824072,
            1.0160497,
            51.5078224,
            -0.1281347
        ],
        zoomLevels: [10, 14, 18, 14, 10, 1, 19],
        tilts: [42, 55, 55, 55, 42, 0, 55],
        numberOfDrawPoints: 5000
    };

    export const PARIS_ZOOM_IN_AND_OUT = {
        controlPoints: [
            48.8566,
            2.3522,
            48.8566,
            2.3522,
            48.8566,
            2.3522,
            48.8566,
            2.3522,
            48.8566,
            2.3522,
            48.8566,
            2.3522
        ],
        zoomLevels: [10, 18, 14, 18, 13, 15],
        tilts: [0, 0, 0, 0, 0, 0],
        numberOfDrawPoints: 250
    };
    export const BERLIN_ZOOM_IN = {
        controlPoints: [
            52.5,
            13.4,
            52.5,
            13.4,
            52.5,
            13.4,
            52.5,
            13.4,
            52.5,
            13.4,
            52.5,
            13.4,
            52.5,
            13.4,
            52.5,
            13.4,
            52.5,
            13.4
        ],
        zoomLevels: [12, 13, 14, 15, 16, 17, 18, 19, 20],
        tilts: [0, 0, 0, 0, 0, 0, 0, 0, 0],
        numberOfDrawPoints: 250
    };
    export const PARIS_ZOOM_IN_AND_OUT_2 = {
        controlPoints: [
            48.8566,
            2.3522,
            48.8566,
            2.3522,
            48.8566,
            2.3522,
            48.8566,
            2.3522,
            48.8566,
            2.3522,
            48.8566,
            2.3522
        ],
        zoomLevels: [13, 15, 14, 16, 15, 19],
        tilts: [0, 0, 0, 0, 0, 0],
        numberOfDrawPoints: 100
    };

    export const MILAN_FLYOVER = {
        controlPoints: [
            42.35882085,
            11.08081451,

            44.61121843,
            9.40003743,

            45.45194999,
            9.18193952,

            45.49194999,
            9.18193952,

            46.45194999,
            8.60979084,

            46.13418703,
            7.48400961,

            45.85169705,
            6.87959287,

            46.3686498,
            8.0091825
        ],
        zoomLevels: [7, 9, 19, 18, 8, 9, 13, 7],
        tilts: [44, 55, 55, 55, 55, 44, 55, 0],
        numberOfDrawPoints: 5000
    };

    export const EUROPE_FLYOVER = {
        controlPoints: [
            48.51,
            2.21,
            41.23,
            2.1,
            48.21,
            16.36,
            37.98,
            23.73,
            50.27,
            30.31,
            52.52,
            13.4
        ],
        zoomLevels: [10, 17, 9, 1, 8, 16],
        tilts: [42, 55, 38, 0, 35, 55],
        numberOfDrawPoints: 10000
    };
}
