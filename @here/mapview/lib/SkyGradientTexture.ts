/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

import { Color, DataTexture, RGBFormat } from "three";
export const DEFAULT_TEXTURE_HEIGHT = 512;
const TEXTURE_WIDTH = 1;
export const DEFAULT_MONOMIAL_POWER = 1;

/**
 * This class generates a texture containing a linear gradient.
 *
 * The gradient goes from `topColor` in the top part of the image to `bottomColor` at the bottom
 * part of the image. The default dimension of the texture is 1x256 pixels. The first pixel on the
 * bottom is filled with the `groundColor`. This class generates the texture used in
 * [[SkyBackground]] to create the sky background.
 *
 * The `topColor` is the color that defines the upper part of the sky, the `bottomColor` is the
 * color that defines the portion of sky above the horizon, and the `groundColor` defines the
 * color of the background below the horizon, visible when there are no visible tiles.
 */

export class SkyGradientTexture {
    private m_texture: DataTexture;

    /**
     * Constructs the `SkyGradientTexture`.
     *
     * @param m_topColor Defines the top color of the gradient.
     * @param m_bottomColor Defines the bottom color of the gradient.
     * @param m_groundColor Defines the first pixel of the gradient in the bottom part.
     * @param m_monomialPower Defines the texture's gradient power. Defaults to 1 (linear gradient).
     * @param m_height Default is 256, it defines the height of the texture.
     *
     * @example
     * ```TypeScript
     * // This snippet creates a texture containing a gradient that goes from red in the upper part
     * // of the image to blue in the bottom part of the image, with a 1 gray pixel at the bottom
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
        this.m_texture.offset.set(0, offset);
    }

    /**
     * Updates the Texture with new colors.
     *
     * @param topColor The new top color
     * @param bottomColor The new bottom color
     * @param groundColor The new ground color
     * @param height The texture height
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

    // when creating the texture, an Uint8Array must be given, because the resulting texture passed
    // to the scene as a background, is a texImage2D object, that does not accept UintClampedArray
    // https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/texImage2D
    // But, when updating the texture, an Uint8ClampedArray is passed as argument, because
    // this.m_texture.image.data returns a Uint8ClampedArray. That's why this method accept both
    private fillTextureData(data: Uint8ClampedArray | Uint8Array) {
        const size = TEXTURE_WIDTH * this.m_height;
        const topColor = this.m_topColor;
        const bottomColor = this.m_bottomColor;
        const groundColor = this.m_groundColor;
        // the first pixel of the texture is occupied by the ground color.
        // This color is used just for the part of the screen that remains below the horizon
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
