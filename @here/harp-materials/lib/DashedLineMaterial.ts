/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";
import { SolidLineMaterial, SolidLineMaterialParameters } from "./SolidLineMaterial";

/**
 * Parameters used when constructing a new [[DashedLineMaterial]].
 */
export interface DashedLineMaterialParameters extends SolidLineMaterialParameters {
    /**
     * Size of the dashed segments.
     */
    dashSize?: number;
    /**
     * Size of the gaps between dashed segments.
     */
    gapSize?: number;
}

/**
 * Material designed to render dashed variable-width lines.
 */
export class DashedLineMaterial extends SolidLineMaterial {
    static DEFAULT_DASH_SIZE: number = 1.0;
    static DEFAULT_GAP_SIZE: number = 1.0;

    /**
     * Constructs a new `DashedLineMaterial`.
     *
     * @param params `DashedLineMaterial` parameters.
     */
    constructor(params?: DashedLineMaterialParameters) {
        const shaderParams: SolidLineMaterialParameters = {};
        if (params !== undefined && params.color !== undefined) {
            shaderParams.color = params.color as any;
        }
        if (params !== undefined && params.lineWidth !== undefined) {
            shaderParams.lineWidth = params.lineWidth;
        }
        if (params !== undefined && params.opacity !== undefined) {
            shaderParams.opacity = params.opacity;
        }
        if (params !== undefined && params.fog !== undefined) {
            shaderParams.fog = params.fog;
        }
        super(shaderParams);
        this.name = "DashedLineMaterial";
        Object.assign(this.uniforms, {
            dashSize: new THREE.Uniform(DashedLineMaterial.DEFAULT_DASH_SIZE),
            gapSize: new THREE.Uniform(DashedLineMaterial.DEFAULT_GAP_SIZE)
        });

        // Apply initial parameter values.
        if (params !== undefined) {
            if (params.dashSize !== undefined) {
                this.dashSize = params.dashSize;
            }
            if (params.gapSize !== undefined) {
                this.gapSize = params.gapSize;
            }
            if (params.fog !== undefined) {
                this.fog = params.fog !== null;
            }
        }
    }

    /**
     * Size of the dashed segments.
     */
    get dashSize(): number {
        return this.uniforms.dashSize.value as number;
    }
    set dashSize(value: number) {
        this.uniforms.dashSize.value = value;
    }

    /**
     * Size of the gaps between dashed segments.
     */
    get gapSize(): number {
        return this.uniforms.gapSize.value as number;
    }
    set gapSize(value: number) {
        this.uniforms.gapSize.value = value;
        this.updateDashedFeature();
    }

    private updateDashedFeature() {
        this.defines.DASHED_LINE = this.gapSize > 0.0 ? 1 : 0;
    }
}
