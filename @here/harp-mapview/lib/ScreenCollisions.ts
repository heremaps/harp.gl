/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { LoggerManager, Math2D } from "@here/harp-utils";
import * as THREE from "three";
import { debugContext } from "./DebugContext";

declare const require: any;

// tslint:disable-next-line:no-var-requires
const RBush = require("rbush");

const logger = LoggerManager.instance.create("ScreenCollissions");

export interface IBox {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    type: string;
}

export interface CollisionBox extends IBox {
    type: "box";
}

export interface LineWithBound extends IBox {
    type: "line";
    line: THREE.Line3;
}
/**
 * @hidden
 */
export class ScreenCollisions {
    /**
     * Converts a [[THREE.Box2]] to an internal [[Math2D.Box]].
     *
     * @param threeBox The [[THREE.Box2]] to convert.
     * @param box2 The conversion target.
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

    private rtree = new RBush();

    /**
     * Constructs a new ScreenCollisions object.
     */
    constructor() {
        //
    }

    /**
     * Resets the list of allocated screen bounds.
     */
    reset() {
        this.rtree.clear();
    }

    /**
     * Updates the screen bounds that are used to check if bounding boxes are visible.
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
     * @param bounds The bounding box in NDC scaled coordinates (i.e. top left is -width/2,
     * -height/2)
     */
    allocate(bounds: Math2D.Box): void {
        const bbox = {
            minX: bounds.x,
            minY: bounds.y,
            maxX: bounds.x + bounds.w,
            maxY: bounds.y + bounds.h,
            type: "box"
        };
        this.rtree.insert(bbox);
    }

    /**
     * Inserts the given bounds into the rtree.
     *
     * @param bounds The bounding boxes (the bounding boxes must be in the space returned from the
     * ScreenProjector.project method).
     */
    allocateIBoxes(bounds: IBox[]) {
        this.rtree.load(bounds);
    }

    /**
     * Checks if the given bounding box is already allocated.
     *
     * @param bounds The bounding box in world coordinates.
     */
    isAllocated(bounds: Math2D.Box | CollisionBox): boolean {
        const collisionBox = bounds instanceof Math2D.Box ? this.toCollisionBox(bounds) : bounds;
        const results = this.rtree.search(collisionBox);
        for (const result of results) {
            switch (result.type) {
                case "box":
                    return true;
                case "line": {
                    const boundedLine = result as LineWithBound;
                    if (this.intersectsLine(collisionBox, boundedLine)) {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    /**
     * Checks if the given screen bounds intersects with the frustum of the active camera.
     *
     * @param bounds The bounding box in world coordinates.
     */
    isVisible(bounds: Math2D.Box): boolean {
        return this.screenBounds.intersects(bounds);
    }

    /**
     * Computes the intersection between the supplied CollisionBox and the LineWithBound.
     * @note The [[CollisionBox]] is in Screen Bounds space, whereas the line must be
     * in Screen Coordinate space
     * @deprecated Because this is meant just for testing.
     */
    intersectsLine(bbox: CollisionBox, boundedLine: LineWithBound): boolean {
        const line = boundedLine.line;

        // Note, these aren't normalized, but it doesn't matter, we are just interested
        // in the sign.
        const lineXDiffTransformed = line.end.x - line.start.x;

        // Sign of bottom left, bottom right, top left and top right corners.
        let signBL: number;
        let signBR: number;
        let signTL: number;
        let signTR: number;
        if (lineXDiffTransformed !== 0) {
            const lineYDiffTransformed = line.end.y - line.start.y;
            const normalX = lineYDiffTransformed;
            const normalY = -lineXDiffTransformed;
            const D = line.start.y - (lineYDiffTransformed / lineXDiffTransformed) * line.start.x;

            signBL = Math.sign(bbox.minX * normalX + (bbox.minY - D) * normalY);
            signBR = Math.sign(bbox.maxX * normalX + (bbox.minY - D) * normalY);
            signTL = Math.sign(bbox.minX * normalX + (bbox.maxY - D) * normalY);
            signTR = Math.sign(bbox.maxX * normalX + (bbox.maxY - D) * normalY);
        } else {
            signBL = Math.sign(bbox.minX - line.start.x);
            signBR = Math.sign(bbox.maxX - line.start.x);
            signTL = Math.sign(bbox.minX - line.start.x);
            signTR = Math.sign(bbox.maxX - line.start.x);
        }
        return signBL !== signBR || signBL !== signTL || signBL !== signTR;
    }

    private toCollisionBox(bounds: Math2D.Box): CollisionBox {
        return {
            minX: bounds.x,
            minY: bounds.y,
            maxX: bounds.x + bounds.w,
            maxY: bounds.y + bounds.h,
            type: "box"
        };
    }
}

/**
 * @hidden
 *
 * Shows requests for screen space during labelling in an HTML canvas, which should be sized like
 * the actual map canvas. It can be placed on top of the map canvas to show exactly which requests
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
     * Resets the list of allocated bounds and clears the debug canvas.
     * @override
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
     * @override
     */
    update(width: number, height: number) {
        if (this.m_renderingEnabled) {
            logger.log(
                // tslint:disable-next-line: max-line-length
                `Allocations: ${this.m_numAllocations} Successful Tests: ${this.m_numSuccessfulTests} Failed Tests: ${this.m_numFailedTests}  Successful Visibility Tests: ${this.m_numSuccessfulVisibilityTests}  Failed Visibility Tests: ${this.m_numFailedVisibilityTests} `
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
     * @override
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

    /** @override */
    allocateIBoxes(boundsArray: IBox[]) {
        for (const bounds of boundsArray) {
            this.m_numAllocations++;

            if (this.m_renderingEnabled && this.m_renderContext !== null) {
                this.m_renderContext.strokeStyle = "#aa2222";
                this.m_renderContext.strokeRect(
                    bounds.minX - this.screenBounds.x,
                    this.screenBounds.y + this.screenBounds.h - bounds.minY - 1,
                    bounds.maxX - bounds.minX,
                    -(bounds.maxY - bounds.minY)
                );
            }
        }
        super.allocateIBoxes(boundsArray);
    }

    /**
     * Checks if the given bounding box is already allocated.
     *
     * @param bounds The bounding box in world coordinates.
     * @override
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
     * Checks if the given screen bounds intersects with the frustum of the active camera.
     *
     * @param bounds The bounding box in world coordinates.
     * @override
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
