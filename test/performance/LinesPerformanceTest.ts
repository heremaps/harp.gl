/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { mercatorProjection } from "@here/harp-geoutils";
import { createLineGeometry } from "@here/harp-lines";
import { measureThroughputSync } from "@here/harp-test-utils/lib/ProfileHelper";
import * as THREE from "three";

describe(`lines`, function () {
    this.timeout(0);
    const center = new THREE.Vector3();

    const tests: Array<{ segments: number; points?: number[] }> = [
        { segments: 2 },
        { segments: 4 },
        { segments: 16 },
        { segments: 64 },
        { segments: 256 }
    ];

    before(function () {
        this.timeout(0);
        tests.forEach(test => {
            const segments = test.segments;
            test.points = [];
            const radius = 100;
            for (let i = 0; i < segments; i++) {
                const angle = (i * 360) / segments;
                test.points.push(
                    Math.cos(THREE.MathUtils.degToRad(angle) * radius),
                    Math.cos(THREE.MathUtils.degToRad(angle) * radius),
                    0
                );
            }
        });
    });

    tests.forEach(test => {
        it(`createLineGeometry segments=${test.segments}`, async function () {
            this.timeout(0);
            await measureThroughputSync(
                `createLineGeometry segments=${test.segments}`,
                1000,
                function () {
                    createLineGeometry(center, test.points!, mercatorProjection);
                }
            );
        });
    });
});
