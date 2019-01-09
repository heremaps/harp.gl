/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Color, DataTexture, RGBFormat } from "three";
export const DEFAULT_TEXTURE_HEIGHT = 512;
const TEXTURE_WIDTH = 1;
export const DEFAULT_MONOMIAL_POWER = 1;

/**
 * Generates a texture containing a linear gradient.
 *
 * The gradient goes from `topColor` in the top part of the image to `bottomColor` in the bottom
 * part of the image. The default dimension of the texture is 1x256 pixels. The first pixel at the
 * bottom is filled with `groundColor`. This class generates the texture used in [[SkyBackground]]
 * to create the sky background.
 *
 * The colors are defined as follows:
 * - `topColor` is the color that defines the upper part of the sky
 * - `bottomColor` is the color that defines the part of sky above the horizon
 * - `groundColor` is the color of the background below the horizon; which can only be seen when
 *    there are no visible tiles.
 */

export class SkyGradientTexture {
    private m_texture: DataTexture;

    /**
     * Constructs a `SkyGradientTexture` instance.
     *
     * @param m_topColor Defines the top color of the gradient.
     * @param m_bottomColor Defines the bottom color of the gradient.
     * @param m_groundColor Defines the first pixel of the gradient, in the bottom part.
     * @param m_monomialPower Defines the texture's gradient power; the default value is 1
     * (linear gradient).
     * @param m_height Defines the texture's height; the default value is 256.
     *
     * @example
     * ```TypeScript
     * // This snippet creates a texture containing a gradient that goes from red in the upper part
     * // of the image to blue in the bottom part of the image, with 1 gray pixel at the bottom
     * // line.
     * let gradient = new SkyGradientTexture(
     *   new Color("#FF000"),
     *   new Color("#0000FF"),
     *   new Color("#F8FBFD")
     * );
     * let texture = gradient.texture;
     * ```
     */
    constructor(
        private m_topColor: Color,
        private m_bottomColor: Color,
        private m_groundColor: Color,
        private m_monomialPower: number,
        private m_height: number = DEFAULT_TEXTURE_HEIGHT
    ) {
        this.m_texture = this.createTexture();
    }

    /**
     * Returns the `DataTexture` instance.
     */
    get texture(): DataTexture {
        return this.m_texture;
    }

    /**
     * Modifies the offset of the texture.
     *
     * @param offset The offset of the texture.
     */
    updateYOffset(offset: number) {
        if (offset <= 0) {
            this.m_texture.offset.set(0, offset);
        }
    }

    /**
     * Updates the Texture with new colors and height.
     *
     * @param topColor The new top color.
     * @param bottomColor The new bottom color.
     * @param groundColor The new ground color.
     * @param height The texture's new height.
     */
    update(
        topColor: Color,
        bottomColor: Color,
        groundColor: Color,
        // tslint:disable-next-line:no-unused-variable
        height: number = DEFAULT_TEXTURE_HEIGHT
    ) {
        this.m_topColor = topColor;
        this.m_bottomColor = bottomColor;
        this.m_groundColor = groundColor;
        this.updateTextureColors();
    }

    private updateTextureColors() {
        const data = this.m_texture.image.data;
        this.fillTextureData(data);
        this.m_texture.needsUpdate = true;
    }

    private createTexture(): DataTexture {
        const size = TEXTURE_WIDTH * this.m_height;
        const data = new Uint8Array(3 * size);
        this.fillTextureData(data);

        const texture = new DataTexture(data, TEXTURE_WIDTH, this.m_height, RGBFormat);
        texture.needsUpdate = true;
        texture.unpackAlignment = 1;
        return texture;
    }

    // When creating the texture, a Uint8Array is required, because the resulting texture passed
    // to the scene as a background, is a texImage2D object, that does not accept UintClampedArray
    // https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/texImage2D
    // But, when updating the texture, a Uint8ClampedArray is passed as argument, because
    // this.m_texture.image.data returns a Uint8ClampedArray. That's why this method accepts both.
    private fillTextureData(data: Uint8ClampedArray | Uint8Array) {
        const size = TEXTURE_WIDTH * this.m_height;
        const topColor = this.m_topColor;
        const bottomColor = this.m_bottomColor;
        const groundColor = this.m_groundColor;
        // The first pixel of the texture is occupied by the ground color.
        // This color is used just for the part of the screen that remains below the horizon.
        data[0] = groundColor.r * 255;
        data[1] = groundColor.g * 255;
        data[2] = groundColor.b * 255;

        const interpolatedColor = new Color();

        for (let i = 1; i < size; i++) {
            const { r, g, b } = interpolatedColor
                .copy(bottomColor)
                .lerp(topColor, (i / size) ** this.m_monomialPower)
                .multiplyScalar(255);

            const stride = i * 3;

            data[stride] = r;
            data[stride + 1] = g;
            data[stride + 2] = b;
        }
    }
}
