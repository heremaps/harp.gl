/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

/**
 * @hidden
 */
export class SimpleLineCurve extends THREE.LineCurve {
    private m_lengths?: number[];

    constructor(v1: THREE.Vector2, v2: THREE.Vector2) {
        super(v1, v2);
    }

    getLengths(): number[] {
        if (this.m_lengths === undefined) {
            this.m_lengths = [0, this.v2.distanceTo(this.v1)];
        }
        return this.m_lengths;
    }
}

/**
 * @hidden
 */
export class PathParam {
    private m_point: THREE.Vector2 | undefined;

    constructor(readonly path: THREE.Path, readonly index: number, readonly t: number) {}

    get curve(): THREE.Curve<THREE.Vector2> {
        return this.path.curves[this.index];
    }

    get point(): THREE.Vector2 {
        if (this.m_point === undefined) {
            this.m_point = this.curve.getPoint(this.t);
        }
        return this.m_point;
    }
}

/**
 * @hidden
 */
export class SimplePath extends THREE.Path {
    private m_cache?: number[];

    constructor() {
        super();
    }

    getLengths(): number[] {
        if (this.m_cache) {
            return this.m_cache;
        }
        let sum = 0;
        const lengths = new Array<number>();
        lengths.push(0);

        this.curves.forEach(curve => {
            const lineCurve = curve as THREE.LineCurve;
            sum += lineCurve.v1.distanceTo(lineCurve.v2);
            lengths.push(sum);
        });
        this.m_cache = lengths;
        return lengths;
    }

    getParamAt(t: number): PathParam | null {
        const distance = t * this.getLength();
        const curveLengths = this.getCurveLengths();

        for (let index = 0; index < curveLengths.length; ++index) {
            if (curveLengths[index] < distance) {
                continue;
            }

            const diff = curveLengths[index] - distance;
            const curve = this.curves[index] as THREE.LineCurve;
            const segmentLength = curve.getLength();
            const u = segmentLength === 0 ? 0 : 1 - diff / segmentLength;
            return new PathParam(this, index, u);
        }

        return null;
    }
}
