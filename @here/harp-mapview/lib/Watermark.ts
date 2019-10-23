/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

/**
 * Creates and handles rendering of watermark logo geometry for [[MapView]].
 */
export class Watermark {
    private m_watermarkMesh: THREE.Mesh;
    private readonly WATERMARK_RENDERORDER = 100000;
    private readonly m_watermarkScene = new THREE.Scene();

    /**
     * Default constructor.
     *
     * @param textureUrl URL to watermark image.
     * @param m_size Watermark size.
     * @param m_margin Distance from canvas corner to watermark logo.
     */
    constructor(textureUrl: string, private m_size = 32, private m_margin = 4) {
        const geometry = new THREE.PlaneGeometry(this.m_size, this.m_size);
        const map = new THREE.TextureLoader().load(textureUrl);
        const material = new THREE.MeshBasicMaterial({
            transparent: true,
            depthWrite: false,
            depthTest: false,
            map
        });
        this.m_watermarkMesh = new THREE.Mesh(geometry, material);
        this.m_watermarkMesh.renderOrder = this.WATERMARK_RENDERORDER;

        this.m_watermarkScene.add(this.m_watermarkMesh);
    }

    /**
     * Renders watermark. Updates position in bottom left corner according to camera.
     *
     * @param renderer Renderer to render watermark.
     * @param camera Ortho camera to position watermark.
     */
    render(renderer: THREE.Renderer, camera: THREE.OrthographicCamera): void {
        this.m_watermarkMesh.position.set(
            camera.left + this.m_size / 2 + this.m_margin,
            camera.bottom + this.m_size / 2 + this.m_margin,
            0
        );
        renderer.render(this.m_watermarkScene, camera);
    }
}
