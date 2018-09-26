/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

import { LoggerManager, Math2D } from "@here/utils";
import * as THREE from "three";
import { debugContext } from "./DebugContext";

declare const require: any;
// tslint:disable-next-line:no-var-requires
const RTree = require("rtree");

const logger = LoggerManager.instance.create("ScreenCollissions");

/**
 * @hidden
 */
export class ScreenCollisions {
    /**
     * Convert a [[THREE.Box2]] to an internal [[Math2D.Box]].
     *
     * @param threeBox [[THREE.Box2]] to convert.
     * @param box2 Conversion target.
     */
    static toBox2D(threeBox: THREE.Box2, box2: Math2D.Box) {
        box2.x = threeBox.min.x;
        box2.y = threeBox.min.y;
        box2.w = threeBox.max.x - threeBox.min.x;
        box2.h = threeBox.max.y - threeBox.min.y;
    }

    /** The screen bounding box. */
    readonly screenBounds = new Math2D.Box();

    /** Tree of allocated bounds. */
    protected rtree = new RTree();

    /**
     * Temporary variables used during conversions of boxes. They reduce allocations.
     */
    private m_returnArray: Math2D.Box[] = [];
    /**
     * Constructs a new ScreenCollisions object.
     */
    constructor() {
        //
    }

    /**
     * Resets the list of the allocated bounds.
     */
    reset() {
        this.rtree = new RTree();
    }

    /**
     * Updates the screen bounds used to check if bounding boxes are visible.
     *
     * @param width The width of the container.
     * @param height The height of the container.
     */
    update(width: number, height: number) {
        this.screenBounds.set(width / -2, height / -2, width, height);
        this.reset();
    }

    /**
     * Marks the region of the screen intersecting with the given bounding box as allocated.
     *
     * @param bounds the bounding box in world coordinates.
     */
    allocate(bounds: Math2D.Box): void {
        this.rtree.insert(bounds, null);
    }

    /**
     * Checks if the given bounding box is already allocated.
     *
     * @param bounds The bounding box in world coordinates.
     */
    isAllocated(bounds: Math2D.Box): boolean {
        // Re-use array to reduce allocations.
        this.m_returnArray.length = 0;
        this.m_returnArray = this.rtree.search(bounds, undefined, this.m_returnArray);
        return this.m_returnArray.length !== 0;
    }

    /**
     * Checks if the given bounds intersects with the frustum of the active camera.
     *
     * @param bounds The bounding box in world coordinates.
     */
    isVisible(bounds: Math2D.Box): boolean {
        return this.screenBounds.intersects(bounds);
    }
}

/**
 * @hidden
 *
 * Shows requests for screen space during labelling in an HTML canvas, which should be sized like
 * the actual map canvas. It can be placed on top of the map canvas to show exactly what requests
 * for screen space were done.
 *
 * Also logs statistics.
 */
export class ScreenCollisionsDebug extends ScreenCollisions {
    /** 2D rendering context. */
    private m_renderContext: CanvasRenderingContext2D | null = null;
    private m_renderingEnabled = false;
    private m_numAllocations = 0;
    private m_numSuccessfulTests = 0;
    private m_numFailedTests = 0;
    private m_numSuccessfulVisibilityTests = 0;
    private m_numFailedVisibilityTests = 0;

    /**
     * Constructs a new ScreenCollisions object which renders its state to a 2D canvas.
     */
    constructor(debugCanvas: HTMLCanvasElement) {
        super();

        if (debugCanvas !== undefined && debugCanvas !== null) {
            this.m_renderContext = debugCanvas.getContext("2d");
        }
    }

    /**
     * Resets the list of the allocated bounds and clears the debug canvas.
     */
    reset() {
        super.reset();

        this.m_numAllocations = 0;
        this.m_numSuccessfulTests = 0;
        this.m_numFailedTests = 0;
        this.m_numSuccessfulVisibilityTests = 0;
        this.m_numFailedVisibilityTests = 0;
    }

    /**
     * Updates the screen bounds used to check if bounding boxes are visible.
     *
     * @param width The width of the container.
     * @param height The height of the container.
     */
    update(width: number, height: number) {
        if (this.m_renderingEnabled) {
            logger.log(
                `Allocations: ${this.m_numAllocations} Successful Tests: ${
                    this.m_numSuccessfulTests
                } Failed Tests: ${this.m_numFailedTests}  Successful Visibility Tests: ${
                    this.m_numSuccessfulVisibilityTests
                }  Failed Visibility Tests: ${this.m_numFailedVisibilityTests} `
            );
        }

        super.update(width, height);

        if (this.m_renderContext !== null) {
            this.m_renderContext.canvas.width = width;
            this.m_renderContext.canvas.height = height;
        }

        // activate in the browser with:
        // window.__debugContext.setValue("DEBUG_SCREEN_COLLISIONS", true)
        this.m_renderingEnabled = debugContext.getValue("DEBUG_SCREEN_COLLISIONS");
    }

    /**
     * Marks the region of the screen intersecting with the given bounding box as allocated.
     *
     * @param bounds the bounding box in world coordinates.
     */
    allocate(bounds: Math2D.Box): void {
        super.allocate(bounds);

        this.m_numAllocations++;

        if (this.m_renderingEnabled && this.m_renderContext !== null) {
            this.m_renderContext.strokeStyle = "#6666ff";
            this.m_renderContext.strokeRect(
                bounds.x - this.screenBounds.x,
                this.screenBounds.y + this.screenBounds.h - bounds.y - 1,
                bounds.w,
                -bounds.h
            );
        }
    }

    /**
     * Checks if the given bounding box is already allocated.
     *
     * @param bounds The bounding box in world coordinates.
     */
    isAllocated(bounds: Math2D.Box): boolean {
        const isFailed = super.isAllocated(bounds);

        if (this.m_renderingEnabled && this.m_renderContext !== null) {
            const offset = isFailed ? 2 : 0;
            this.m_renderContext.strokeStyle = isFailed ? "#FF0000" : "#00ff00";
            this.m_renderContext.strokeRect(
                bounds.x - this.screenBounds.x - offset,
                this.screenBounds.y + this.screenBounds.h - bounds.y - 1 + offset,
                bounds.w + 2 * offset,
                -bounds.h - 2 * offset
            );
        }

        if (isFailed) {
            this.m_numFailedTests++;
        } else {
            this.m_numSuccessfulTests++;
        }

        return isFailed;
    }

    /**
     * Checks if the given bounds intersects with the frustum of the active camera.
     *
     * @param bounds The bounding box in world coordinates.
     */
    isVisible(bounds: Math2D.Box): boolean {
        const visible = super.isVisible(bounds);

        if (visible) {
            this.m_numSuccessfulVisibilityTests++;
        } else {
            this.m_numFailedVisibilityTests++;
        }
        return visible;
    }
}
