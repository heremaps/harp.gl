/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { LoggerManager, Math2D } from "@here/harp-utils";
/// <reference path="line-intersect.d.ts" />
import { checkIntersection /*colinearPointWithinSegment*/ } from "line-intersect";
import * as THREE from "three";
import { debugContext } from "./DebugContext";
import { isBox3Like } from "@here/harp-geoutils";

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

export interface LineWithBound extends IBox {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    type: string;
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
     * Marks the region of the screen intersecting with the given bounding box as allocated.
     *
     * @param bounds The bounding box in screen coordinates.
     */
    allocateScreenSpace(bounds: Math2D.Box): void {
        const shiftedBounds = this.toScreenBoundsSpace(bounds, "box");
        this.rtree.insert(shiftedBounds);
    }

    /**
     * Marks a region of the screen intersecting with the given IBox as allocated.
     *
     * @param bounds The bounding box in screen coordinates.
     * @param isScreenSpace Whether the supplied IBox is in screen coordinates, i.e. 0,0 is top
     * left, and width,height is bottom right, or NDC Scaled coordiantes, i.e. -width/2, -height/2
     * is bottom left and width/2 and height/2 is top right (i.e. flipped).
     */
    allocateIBox(bounds: IBox, isScreenSpace: boolean): void {
        const box = {};
        // Make sure to copy across any extra things.
        Object.assign(box, bounds);
        // Copy across the NDC scaled space values required for the rtree
        if (isScreenSpace) {
            Object.assign(box, this.toScreenBoundsSpaceFromIBox(bounds));
        }
        // Convert box from screen space to screenBounds space
        this.rtree.insert(box);
    }

    /**
     * Checks if the given bounding box is already allocated.
     *
     * @param bounds The bounding box in world coordinates.
     */
    isAllocated(bounds: Math2D.Box): boolean {
        const bbox: IBox = {
            minX: bounds.x,
            minY: bounds.y,
            maxX: bounds.x + bounds.w,
            maxY: bounds.y + bounds.h,
            type: "box"
        };

        const results = this.rtree.search(bbox);
        for (const result of results) {
            switch (result.type) {
                case "box":
                    return true;
                case "line": {
                    const boundedLine = result as LineWithBound;
                    const line = boundedLine.line;
                    // Transform line from screen space to screenBounds space.
                    const lineStartXTransformed = line.start.x + this.screenBounds.x;
                    const lineStartYTransformed = this.screenBounds.h / 2 - line.start.y;
                    const lineEndXTransformed = line.end.x + this.screenBounds.x;
                    const lineEndYTransformed = this.screenBounds.h / 2 - line.end.y;

                    // Test left side
                    let intersectionResult = checkIntersection(
                        lineStartXTransformed,
                        lineStartYTransformed,
                        lineEndXTransformed,
                        lineEndYTransformed,
                        bbox.minX,
                        bbox.minY,
                        bbox.minX,
                        bbox.maxY
                    );
                    if (intersectionResult.type === "intersecting") {
                        return true;
                    }

                    // Test right side
                    intersectionResult = checkIntersection(
                        lineStartXTransformed,
                        lineStartYTransformed,
                        lineEndXTransformed,
                        lineEndYTransformed,
                        bbox.maxX,
                        bbox.minY,
                        bbox.maxX,
                        bbox.maxY
                    );
                    if (intersectionResult.type === "intersecting") {
                        return true;
                    }

                    // Test top
                    intersectionResult = checkIntersection(
                        lineStartXTransformed,
                        lineStartYTransformed,
                        lineEndXTransformed,
                        lineEndYTransformed,
                        bbox.minX,
                        bbox.maxY,
                        bbox.maxX,
                        bbox.maxY
                    );
                    if (intersectionResult.type === "intersecting") {
                        return true;
                    }

                    // Test bottom
                    intersectionResult = checkIntersection(
                        lineStartXTransformed,
                        lineStartYTransformed,
                        lineEndXTransformed,
                        lineEndYTransformed,
                        bbox.minX,
                        bbox.minY,
                        bbox.maxX,
                        bbox.minY
                    );
                    if (intersectionResult.type === "intersecting") {
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
     * Transfer from screen space to screen bounds space
     * @param bounds Bounds in screen space.
     * @param type Type required to return IBox
     */
    private toScreenBoundsSpace(bounds: Math2D.Box, type: string): IBox {
        return {
            minX: bounds.x + this.screenBounds.x,
            minY: this.screenBounds.h / 2 - bounds.y - bounds.h,
            maxX: bounds.x + bounds.w + this.screenBounds.x,
            maxY: this.screenBounds.h / 2 - bounds.y,
            type
        };
    }

    /**
     * Transfer from screen space to screen bounds space for IBox
     * @param bounds Bounds in screen space
     */
    private toScreenBoundsSpaceFromIBox(bounds: IBox): IBox {
        return {
            minX: bounds.minX + this.screenBounds.x,
            minY: this.screenBounds.h / 2 - bounds.maxY,
            maxX: bounds.maxX + this.screenBounds.x,
            maxY: this.screenBounds.h / 2 - bounds.minY,
            type: bounds.type
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
     * Marks the region of the screen intersecting with the given bounding box as allocated.
     *
     * @param bounds The bounding box in screen coordinates.
     */
    allocateScreenSpace(bounds: Math2D.Box): void {
        super.allocateScreenSpace(bounds);

        this.m_numAllocations++;
        if (this.m_renderingEnabled && this.m_renderContext !== null) {
            this.m_renderContext.strokeStyle = "#6666ff";
            this.m_renderContext.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
        }
    }

    allocateIBox(bounds: IBox, isScreenSpace: boolean): void {
        super.allocateIBox(bounds, isScreenSpace);

        this.m_numAllocations++;

        if (this.m_renderingEnabled && this.m_renderContext !== null) {
            this.m_renderContext.strokeStyle = "#aa2222";
            if (isScreenSpace) {
                this.m_renderContext.strokeRect(
                    bounds.minX,
                    bounds.minY,
                    bounds.maxX - bounds.minX,
                    bounds.maxY - bounds.minY
                );
            } else {
                this.m_renderContext.strokeRect(
                    bounds.minX - this.screenBounds.x,
                    this.screenBounds.y + this.screenBounds.h - bounds.minY - 1,
                    bounds.maxX - bounds.minX,
                    -(bounds.maxY - bounds.minY)
                );
            }
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
     * Checks if the given screen bounds intersects with the frustum of the active camera.
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
