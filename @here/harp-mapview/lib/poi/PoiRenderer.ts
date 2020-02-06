/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Env, getPropertyValue, ImageTexture } from "@here/harp-datasource-protocol";
import { IconMaterial } from "@here/harp-materials";
import { MemoryUsage, TextCanvas } from "@here/harp-text-canvas";
import { assert, LoggerManager, Math2D } from "@here/harp-utils";
import * as THREE from "three";

import { ColorCache } from "../ColorCache";
import { ImageItem } from "../image/Image";
import { MapView } from "../MapView";
import { ScreenCollisions } from "../ScreenCollisions";
import { PoiInfo, TextElement } from "../text/TextElement";
import { BoxBuffer } from "./BoxBuffer";
import { IconTexture } from "./Poi";

const logger = LoggerManager.instance.create("PoiRenderer");

const INVALID_RENDER_BATCH = -1;

const tempPos = new THREE.Vector3(0);

/**
 * The `PoiRenderBufferBatch` contains the geometry and the material for all POIs that share the
 * same icon image ([[ImageTexture]]). If the image is the same, all the objects in this batch can
 * share the same material, which makes them renderable in the same draw call, whatever the number
 * of actual objects (WebGL limits apply!).
 *
 * There is a `PoiRenderBufferBatch` for every icon in a texture atlas, since the size of the icon
 * in the atlas as well as the texture coordinates are specified in the `PoiRenderBufferBatch`.
 */
class PoiRenderBufferBatch {
    color: THREE.Color = ColorCache.instance.getColor("#000000");

    boxBuffer: BoxBuffer | undefined;

    private m_material?: THREE.Material | THREE.Material[];

    /**
     * Create the `PoiRenderBufferBatch`.
     *
     * @param mapView The [[MapView]] instance.
     * @param scene The three.js scene to add the POIs to.
     * @param imageItem The icon that will have his material shared.
     * @param renderOrder RenderOrder of the batch geometry's [[Mesh]].
     */
    constructor(
        readonly mapView: MapView,
        readonly scene: THREE.Scene,
        readonly imageItem: ImageItem,
        readonly renderOrder: number
    ) {}

    /**
     * Initialize with the [[ImageTexture]]. Loads the image and sets up the icon size, the texture
     * coordinates and material of the batch. Since image loading is done asynchronously, this
     * batch cannot be rendered right away. MapView#update is being triggered if it loaded
     * successfully.
     */
    init() {
        if (this.boxBuffer === undefined) {
            this.setup();
        }
    }

    /**
     * Clean the `PoiRenderBufferBatch`, remove all icon boxes. Called before starting a new frame.
     */
    reset(): void {
        if (this.boxBuffer === undefined) {
            this.init();
        }
        this.boxBuffer!.reset();
    }

    /**
     * Update the geometry with all the added boxes during the frame.
     */
    update(): void {
        if (this.boxBuffer === undefined) {
            this.init();
        }
        this.boxBuffer!.updateBufferGeometry();
    }

    /**
     * Update the info with the memory footprint caused by objects owned by the
     * `PoiRenderBufferBatch`.
     *
     * @param info The info object to increment with the values from this `PoiRenderBufferBatch`.
     */
    updateMemoryUsage(info: MemoryUsage) {
        if (this.boxBuffer !== undefined) {
            this.boxBuffer.updateMemoryUsage(info);
        }
    }

    /**
     * Setup texture and material for the batch.
     */
    private setup() {
        const bilinear = true;

        // Texture images should be generated with premultiplied alpha
        const premultipliedAlpha = true;

        const iconTexture = new IconTexture(this.imageItem);
        const texture = new THREE.Texture(
            iconTexture.image.imageData as any,
            THREE.UVMapping,
            undefined,
            undefined,
            bilinear ? THREE.LinearFilter : THREE.NearestFilter,
            bilinear ? THREE.LinearFilter : THREE.NearestFilter,
            THREE.RGBAFormat
        );
        texture.needsUpdate = true;
        texture.premultiplyAlpha = premultipliedAlpha;
        texture.generateMipmaps = false; // not needed, always rendered in full size

        this.m_material = new IconMaterial({
            map: texture
        });

        this.boxBuffer = new BoxBuffer(this.m_material, this.renderOrder);

        const mesh = this.boxBuffer.mesh;

        mesh.frustumCulled = false;

        this.scene.add(mesh);

        this.mapView.update();
    }
}

/**
 * Contains all [[PoiRenderBufferBatch]]es. Selects (and initializes) the correct batch for a POI.
 */
class PoiRenderBuffer {
    readonly batches: PoiRenderBufferBatch[] = [];
    private readonly m_batchMap: Map<string, Map<number, number>> = new Map();

    /**
     * Create the `PoiRenderBuffer`.
     *
     * @param mapView The [[MapView]] to be rendered to.
     * @param textCanvas The [[TextCanvas]] to which scenes this `PoiRenderBuffer` adds geometry to.
     * The actual scene a [[TextElement]] is added to is specified by the renderOrder of the
     * [[TextElement]].
     */
    constructor(readonly mapView: MapView, readonly textCanvas: TextCanvas) {}

    /**
     * Register the POI and prepare the [[PoiRenderBufferBatch]] for the POI at first usage.
     *
     * @param poiInfo Describes the POI icon.
     */
    registerPoi(poiInfo: PoiInfo): number {
        const { imageItem, imageTexture, imageTextureName } = poiInfo;

        if (
            imageItem === undefined ||
            imageTextureName === undefined ||
            imageTexture === undefined
        ) {
            // No image -> invisible -> ignore
            return INVALID_RENDER_BATCH;
        }

        const renderOrder = poiInfo.renderOrder!;

        // There is a batch for every ImageDefinition, which could be a texture atlas with many
        // ImageTextures in it.
        const batchKey = imageTexture.image;
        let batchSet = this.m_batchMap.get(batchKey);
        let mappedIndex: number | undefined;
        let bufferBatch: PoiRenderBufferBatch;

        if (batchSet === undefined) {
            batchSet = new Map<number, number>();
            this.m_batchMap.set(batchKey, batchSet);
        }

        mappedIndex = batchSet.get(renderOrder);
        if (mappedIndex !== undefined) {
            return mappedIndex;
        }
        mappedIndex = this.batches.length;

        let layer = this.textCanvas.getLayer(renderOrder);
        if (layer === undefined) {
            this.textCanvas.addText("", tempPos, { layer: renderOrder });
            layer = this.textCanvas.getLayer(renderOrder);
        }

        bufferBatch = new PoiRenderBufferBatch(
            this.mapView,
            layer!.storage.scene,
            imageItem,
            renderOrder
        );
        bufferBatch.init();
        batchSet.set(renderOrder, mappedIndex);
        this.batches.push(bufferBatch);
        return mappedIndex;
    }

    /**
     * Render a POI image at the specified location.
     *
     * @param poiInfo PoiInfo containing information for rendering the POI icon.
     * @param screenBox Box to render icon into in 2D coordinates.
     * @param viewDistance Box's distance to camera.
     * @param opacity Opacity of icon to allow fade in/out.
     */
    addPoi(poiInfo: PoiInfo, screenBox: Math2D.Box, viewDistance: number, opacity: number): number {
        const poiRegistered =
            poiInfo.poiRenderBatch !== undefined && poiInfo.poiRenderBatch !== INVALID_RENDER_BATCH;
        const batchIndex = poiRegistered ? poiInfo.poiRenderBatch! : this.registerPoi(poiInfo);
        if (batchIndex === INVALID_RENDER_BATCH) {
            return INVALID_RENDER_BATCH;
        }
        assert(batchIndex >= 0);
        assert(batchIndex < this.batches.length);
        assert(poiInfo.uvBox !== undefined);

        if (this.batches[batchIndex].boxBuffer === undefined) {
            this.batches[batchIndex].init();
        }

        this.batches[batchIndex].boxBuffer!.addBox(
            screenBox,
            poiInfo.uvBox!,
            this.batches[batchIndex].color,
            opacity,
            viewDistance,
            poiInfo.textElement
        );

        return batchIndex;
    }

    /**
     * Retrieve the [[PoiRenderBufferBatch]] from the array at the specified index. May be invalid
     * if the imageTexture could not be found
     *
     * @param index Index into batch array.
     */
    getBatch(index: number): PoiRenderBufferBatch | undefined {
        if (index >= 0) {
            assert(index < this.batches.length);
            return this.batches[index];
        }
        // may be invalid if the imageTexture could not be found
        return undefined;
    }

    /**
     * Reset all batches, removing all content from the [[PoiRenderBufferBatch]]es. Called at the
     * beginning of a frame before the POIs are placed.
     */
    reset(): void {
        for (const batch of this.batches) {
            batch.reset();
        }
    }

    /**
     * Update the geometry of all [[PoiRenderBufferBatch]]es. Called before rendering.
     */
    update(): void {
        for (const batch of this.batches) {
            batch.update();
        }
    }

    /**
     * Fill the picking results for the pixel with the given screen coordinate. If multiple
     * [[PoiInfo]]s are found, the order of the results is unspecified.
     *
     * @param screenPosition Screen coordinate of picking position.
     * @param pickCallback Callback to be called for every picked element.
     */
    pickTextElements(
        screenPosition: THREE.Vector2,
        pickCallback: (pickData: any | undefined) => void
    ) {
        for (const batch of this.batches) {
            if (batch.boxBuffer === undefined) {
                batch.init();
            }
            batch.boxBuffer!.pickBoxes(screenPosition, pickCallback, batch.imageItem.imageData);
        }
    }

    /**
     * Update the info with the memory footprint caused by objects owned by the `PoiRenderBuffer`.
     *
     * @param info The info object to increment with the values from this `PoiRenderBuffer`.
     */
    updateMemoryUsage(info: MemoryUsage) {
        for (const batch of this.batches) {
            if (batch.imageItem.imageData !== undefined) {
                const imageBytes =
                    batch.imageItem.imageData.width * batch.imageItem.imageData.height * 4;
                info.heapSize += imageBytes;
                info.gpuSize += imageBytes;
            }
            if (batch.boxBuffer !== undefined) {
                batch.boxBuffer.updateMemoryUsage(info);
            }
        }
    }
}

/**
 * Manage POI rendering. Uses a [[PoiRenderBuffer]] to actually create the geometry that is being
 * rendered.
 */
export class PoiRenderer {
    /**
     * Compute screen box for icon. It is required that `prepareRender` has been successfully called
     * before `computeScreenBox` may be called.
     *
     * @param poiInfo PoiInfo containing information for rendering the POI icon.
     * @param screenPosition Position on screen (2D).
     * @param scale Scale to apply to icon.
     * @param env Current zoom level.
     * @param screenBox Box that will be used to store the result.
     * @returns The computed screen box for the icon.
     */
    static computeIconScreenBox(
        poiInfo: PoiInfo,
        screenPosition: THREE.Vector2,
        scale: number,
        env: Env,
        /* out */ screenBox: Math2D.Box = new Math2D.Box()
    ): Math2D.Box {
        assert(poiInfo.poiRenderBatch !== undefined);
        assert(poiInfo.poiRenderBatch !== INVALID_RENDER_BATCH);

        const width = poiInfo.computedWidth! * scale;
        const height = poiInfo.computedHeight! * scale;
        const technique = poiInfo.technique;
        const iconXOffset = getPropertyValue(technique.iconXOffset, env);
        const iconYOffset = getPropertyValue(technique.iconYOffset, env);

        const centerX = screenPosition.x + (typeof iconXOffset === "number" ? iconXOffset : 0);
        const centerY = screenPosition.y + (typeof iconYOffset === "number" ? iconYOffset : 0);

        screenBox.x = centerX - width / 2;
        screenBox.y = centerY - height / 2;
        screenBox.w = width;
        screenBox.h = height;

        return screenBox;
    }
    // keep track of the missing textures, but only warn once
    private static m_missingTextureName: Map<string, boolean> = new Map();

    // the render buffer containing all batches, one batch per texture/material.
    private m_renderBuffer: PoiRenderBuffer;

    // temporary variable to save allocations
    private m_tempScreenBox = new Math2D.Box();

    /**
     * Create the `PoiRenderer` for the specified [[MapView]].
     *
     * @param mapView The MapView to be rendered to.
     * @param textCanvas The [[TextCanvas]] this `PoiRenderer` is associated to. POIs are added to
     * the different layers of this [[TextCanvas]] based on renderOrder.
     */
    constructor(readonly mapView: MapView, readonly textCanvas: TextCanvas) {
        this.m_renderBuffer = new PoiRenderBuffer(mapView, textCanvas);
    }

    /**
     * Prepare the POI for rendering, and determine which `poiRenderBatch` should be used. If a
     * `poiRenderBatch` is assigned, the POI is ready to be rendered.
     *
     * @param pointLabel TextElement with PoiInfo for rendering the POI icon.
     * @param env TODO! The current zoomLevel level of [[MapView]]
     *
     * @returns `True` if the space is not already allocated by another object (text label or POI)
     */
    prepareRender(pointLabel: TextElement, env: Env): boolean {
        const poiInfo = pointLabel.poiInfo;
        if (poiInfo === undefined) {
            return false;
        }
        if (poiInfo.poiRenderBatch === undefined) {
            this.preparePoi(pointLabel, env);
        }
        return poiInfo.poiRenderBatch !== undefined;
    }

    /**
     * Reset all batches, removing all content from the [[PoiRenderBuffer]]es. Called at the
     * beginning of a frame before the POIs are placed.
     */
    reset(): void {
        this.m_renderBuffer.reset();
    }

    /**
     * Render the icon.
     *
     * @param poiInfo PoiInfo containing information for rendering the POI icon.
     * @param screenPosition Position on screen (2D):
     * @param screenCollisions Object handling the collision checks for screen-aligned 2D boxes.
     * @param viewDistance Box's distance to camera.
     * @param scale Scaling factor to apply to text and icon.
     * @param allocateScreenSpace If `true` screen space will be allocated for the icon.
     * @param opacity Opacity of icon to allow fade in/out.
     */
    renderPoi(
        poiInfo: PoiInfo,
        screenPosition: THREE.Vector2,
        screenCollisions: ScreenCollisions,
        viewDistance: number,
        scale: number,
        allocateScreenSpace: boolean,
        opacity: number,
        env: Env
    ): void {
        assert(poiInfo.poiRenderBatch !== undefined);

        PoiRenderer.computeIconScreenBox(poiInfo, screenPosition, scale, env, this.m_tempScreenBox);

        if (allocateScreenSpace) {
            screenCollisions.allocate(this.m_tempScreenBox);
        }

        this.m_renderBuffer.addPoi(poiInfo, this.m_tempScreenBox, viewDistance, opacity);
    }

    /**
     * Update the geometry of all [[PoiRenderBuffer]]es. Called before rendering.
     */
    update(): void {
        this.m_renderBuffer.update();
    }

    /**
     * Fill the picking results for the pixel with the given screen coordinate. If multiple
     * [[PoiInfo]]s are found, the order of the results is unspecified.
     *
     * @param screenPosition Screen coordinate of picking position.
     * @param pickCallback Callback to be called for every picked element.
     */
    pickTextElements(
        screenPosition: THREE.Vector2,
        pickCallback: (pickData: any | undefined) => void
    ) {
        this.m_renderBuffer.pickTextElements(screenPosition, pickCallback);
    }

    /**
     * Update the info with the memory footprint caused by objects owned by the `PoiRenderer`.
     *
     * @param info The info object to increment with the values from this `PoiRenderer`.
     */
    getMemoryUsage(info: MemoryUsage) {
        this.m_renderBuffer.updateMemoryUsage(info);
    }

    /**
     * Register the POI at the [[PoiRenderBuffer]] which may require some setup, for example loading
     * of the actual image.
     */
    private preparePoi(pointLabel: TextElement, env: Env): void {
        const poiInfo = pointLabel.poiInfo;
        if (poiInfo === undefined || !pointLabel.visible) {
            return;
        }

        if (poiInfo.poiRenderBatch !== undefined || poiInfo.isValid === false) {
            // Already set up, nothing to be done here.
            return;
        }

        if (poiInfo.poiTableName !== undefined) {
            if (this.mapView.poiManager.updatePoiFromPoiTable(pointLabel)) {
                if (!pointLabel.visible) {
                    // PoiTable set this POI to not visible.
                    return;
                }
            } else {
                // PoiTable has not been loaded, but is required to determine visibility.
                return;
            }
        }

        const imageTextureName = poiInfo.imageTextureName;

        const imageTexture = this.mapView.poiManager.getImageTexture(imageTextureName);
        if (imageTexture === undefined) {
            // Warn about a missing texture, but only once.
            if (PoiRenderer.m_missingTextureName.get(imageTextureName) === undefined) {
                PoiRenderer.m_missingTextureName.set(imageTextureName, true);
                logger.error(`preparePoi: No imageTexture with name '${imageTextureName}' found`);
            }
            poiInfo.isValid = false;
            return;
        }

        const imageDefinition = imageTexture.image;

        let imageItem = this.mapView.imageCache.findImageByName(imageDefinition);
        if (imageItem === undefined) {
            logger.error(`init: No imageItem found with name '${imageDefinition}'`);
            poiInfo.isValid = false;
            return;
        }

        if (!imageItem.loaded) {
            if (imageItem.loadingPromise !== undefined) {
                // already being loaded, will be rendered once available
                return;
            }
            const imageUrl = imageItem.url;
            const loading = this.mapView.imageCache.loadImage(imageItem);
            if (loading instanceof Promise) {
                loading
                    .then(loadedImageItem => {
                        if (loadedImageItem === undefined) {
                            logger.error(`preparePoi: Failed to load imageItem: '${imageUrl}`);
                            return;
                        }
                        this.setupPoiInfo(poiInfo, imageTexture, loadedImageItem, env);
                    })
                    .catch(error => {
                        logger.error(`preparePoi: Failed to load imageItem: '${imageUrl}`, error);
                        poiInfo.isValid = false;
                    });
                return;
            } else {
                imageItem = loading;
            }
        }

        this.setupPoiInfo(poiInfo, imageTexture, imageItem, env);
    }

    /**
     * Setup texture and material for the batch.
     *
     * @param poiInfo [[PoiInfo]] to initialize.
     * @param imageTexture Shared [[ImageTexture]], defines used area in atlas.
     * @param imageItem Shared [[ImageItem]], contains cached image for texture.
     * @param env The current zoom level of [[MapView]]
     */
    private setupPoiInfo(
        poiInfo: PoiInfo,
        imageTexture: ImageTexture,
        imageItem: ImageItem,
        env: Env
    ) {
        assert(poiInfo.uvBox === undefined);

        if (imageItem === undefined || imageItem.imageData === undefined) {
            logger.error("setupPoiInfo: No imageItem/imageData found");
            // invalid render batch number
            poiInfo.poiRenderBatch = INVALID_RENDER_BATCH;
            poiInfo.isValid = false;
            return;
        }

        const technique = poiInfo.technique;

        const imageWidth = imageItem.imageData.width;
        const imageHeight = imageItem.imageData.height;

        const iconWidth = imageTexture.width !== undefined ? imageTexture.width : imageWidth;
        const iconHeight = imageTexture.height !== undefined ? imageTexture.height : imageHeight;

        let minS = 0;
        let maxS = 1;
        let minT = 0;
        let maxT = 1;

        let iconScaleH = technique.iconScale !== undefined ? technique.iconScale : 1;
        let iconScaleV = technique.iconScale !== undefined ? technique.iconScale : 1;

        const width = imageTexture.width !== undefined ? imageTexture.width : imageWidth;
        const height = imageTexture.height !== undefined ? imageTexture.height : imageHeight;
        const xOffset = imageTexture.xOffset !== undefined ? imageTexture.xOffset : 0;
        const yOffset = imageTexture.yOffset !== undefined ? imageTexture.yOffset : 0;

        minS = xOffset / imageWidth;
        maxS = (xOffset + width) / imageWidth;

        const flipY = true;
        if (flipY) {
            minT = (imageHeight - yOffset) / imageHeight;
            maxT = (imageHeight - yOffset - height) / imageHeight;
        } else {
            minT = yOffset / imageHeight;
            maxT = (yOffset + height) / imageHeight;
        }

        // minS += 0.5 / imageWidth;
        // maxS += 0.5 / imageWidth;
        // minT += 0.5 / imageHeight;
        // maxT += 0.5 / imageHeight;

        // By default, iconScaleV should be equal to iconScaleH, whatever is set in the style.
        const screenWidth = getPropertyValue(technique.screenWidth, env);
        if (screenWidth !== undefined) {
            iconScaleV = iconScaleH = screenWidth / iconWidth;
        }

        const screenHeight = getPropertyValue(technique.screenHeight, env);
        if (screenHeight !== undefined) {
            iconScaleV = screenHeight / iconHeight;
            if (screenWidth !== undefined) {
                iconScaleH = iconScaleV;
            }
        }

        // compute stored values in imageTexture
        poiInfo.computedWidth = iconWidth * iconScaleH;
        poiInfo.computedHeight = iconHeight * iconScaleV;
        poiInfo.uvBox = {
            s0: minS,
            t0: maxT,
            s1: maxS,
            t1: minT
        };
        poiInfo.imageItem = imageItem;
        poiInfo.imageTexture = imageTexture;
        poiInfo.poiRenderBatch = this.m_renderBuffer.registerPoi(poiInfo);
        poiInfo.isValid = true;

        assert(poiInfo.poiRenderBatch !== undefined);
    }
}
