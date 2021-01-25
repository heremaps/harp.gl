/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { LoggerManager, Math2D } from "@here/harp-utils";
import * as THREE from "three";

import { debugContext } from "./DebugContext";

declare const require: any;

const RBush = require("rbush");

const logger = LoggerManager.instance.create("ScreenCollissions");

export interface IBox {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export class CollisionBox extends Math2D.Box implements IBox {
    constructor(box?: Math2D.Box | THREE.Box2 | IBox) {
        super();
        if (box !== undefined) {
            this.copy(box);
        }
    }

    copy(box: Math2D.Box | THREE.Box2 | IBox): CollisionBox {
        if (box instanceof Math2D.Box) {
            this.set(box.x, box.y, box.w, box.h);
        } else if (box instanceof THREE.Box2) {
            this.set(box.min.x, box.min.y, box.max.x - box.min.x, box.max.y - box.min.y);
        } else {
            this.set(box.minX, box.minY, box.maxX - box.minX, box.maxY - box.minY);
        }
        return this;
    }

    get minX(): number {
        return this.x;
    }

    set minX(minX: number) {
        this.x = minX;
    }

    get maxX(): number {
        return this.x + this.w;
    }

    set maxX(maxX: number) {
        this.w = maxX - this.x;
    }

    get minY(): number {
        return this.y;
    }

    set minY(minY: number) {
        this.y = minY;
    }

    get maxY(): number {
        return this.y + this.h;
    }

    set maxY(maxY: number) {
        this.h = maxY - this.y;
    }
}

/**
 * Collision box with additional boxes defining tighter bounds for the enclosed feature
 * (e.g.glyph bounds for text).
 */
export class DetailedCollisionBox extends CollisionBox {
    constructor(box: Math2D.Box | THREE.Box2 | IBox, readonly detailBoxes: CollisionBox[]) {
        super(box);
    }
}

export interface LineWithBound extends IBox {
    line: THREE.Line3;
}

export function isLineWithBound(box: IBox): box is LineWithBound {
    return (box as LineWithBound).line !== undefined;
}

const tmpCollisionBox = new CollisionBox();

export class ScreenCollisions {
    /** The screen bounding box. */
    readonly screenBounds = new Math2D.Box();

    /** Tree of allocated bounds. */

    private readonly rtree = new RBush();

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
     * @param width - The width of the container.
     * @param height - The height of the container.
     */
    update(width: number, height: number) {
        this.screenBounds.set(width / -2, height / -2, width, height);
        this.reset();
    }

    /**
     * Marks the region of the screen intersecting with the given bounding box as allocated.
     *
     * @param bounds - The bounding box in NDC scaled coordinates (i.e. top left is -width/2,
     * -height/2)
     */
    allocate(bounds: Math2D.Box | CollisionBox | DetailedCollisionBox): void {
        const bbox = !(bounds instanceof CollisionBox) ? new CollisionBox(bounds) : bounds;
        this.rtree.insert(bbox);
    }

    /**
     * Inserts the given bounds into the rtree.
     *
     * @param bounds - The bounding boxes (the bounding boxes must be in the space returned from the
     * ScreenProjector.project method).
     */
    allocateIBoxes(bounds: IBox[]) {
        this.rtree.load(bounds);
    }

    /**
     * Search for all bounds in the tree intersecting with the given box.
     * @param box - The box used for the search.
     * @returns An array of all IBoxes intersecting with the given box.
     */
    search(box: CollisionBox): IBox[] {
        return this.rtree.search(box);
    }

    /**
     * Checks if the given bounding box is already allocated.
     *
     * @param bounds - The bounding box in world coordinates.
     */
    isAllocated(bounds: Math2D.Box | CollisionBox): boolean {
        const collisionBox = bounds instanceof CollisionBox ? bounds : tmpCollisionBox.copy(bounds);
        const results = this.search(collisionBox);
        return this.intersectsDetails(collisionBox, results);
    }

    /**
     * Checks if the given screen bounds intersects with the frustum of the active camera.
     *
     * @param bounds - The bounding box in world coordinates.
     */
    isVisible(bounds: Math2D.Box): boolean {
        return this.screenBounds.intersects(bounds);
    }

    /**
     * Checks if the given screen bounds is contained within the frustum of the active camera.
     *
     * @param bounds - The bounding box in world coordinates.
     */
    isFullyVisible(bounds: Math2D.Box): boolean {
        return this.screenBounds.containsBox(bounds);
    }

    /**
     * Test whether a given [[CollisionBox]] intersects with any of the details in the specified
     * [[IBox]]es.
     *
     * @param testBox - The box to test for intersection.
     * @param boxes - The candidate boxes the test box may intersect with. It's assumed that the
     * global bounds of these boxes intersect with the given test box.
     * @returns `true` if any intersection found.
     */
    intersectsDetails(testBox: CollisionBox, boxes: IBox[]): boolean {
        for (const box of boxes) {
            if (box instanceof DetailedCollisionBox) {
                for (const detailBox of box.detailBoxes) {
                    if (detailBox.intersects(testBox)) {
                        return true;
                    }
                }
            } else if (isLineWithBound(box)) {
                const boundedLine = box as LineWithBound;
                if (this.intersectsLine(testBox, boundedLine)) {
                    return true;
                }
            } else {
                return true;
            }
        }
        return false;
    }

    /**
     * Computes the intersection between the supplied CollisionBox and the LineWithBound.
     * @note The [[CollisionBox]] is in Screen Bounds space, whereas the line must be
     * in Screen Coordinate space
     */
    private intersectsLine(bbox: CollisionBox, boundedLine: LineWithBound): boolean {
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
     * @param width - The width of the container.
     * @param height - The height of the container.
     * @override
     */
    update(width: number, height: number) {
        if (this.m_renderingEnabled) {
            logger.log(
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
     * @param bounds - the bounding box in world coordinates.
     * @override
     */
    allocate(bounds: Math2D.Box | CollisionBox): void {
        super.allocate(bounds);

        this.m_numAllocations++;

        if (this.m_renderingEnabled && this.m_renderContext !== null) {
            this.m_renderContext.strokeStyle = "#6666ff";
            this.m_renderContext.strokeRect(
                bounds.x - this.screenBounds.x,
                this.screenBounds.y + this.screenBounds.h - bounds.y,
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
                    this.screenBounds.y + this.screenBounds.h - bounds.minY,
                    bounds.maxX - bounds.minX,
                    -(bounds.maxY - bounds.minY)
                );
            }
        }
        super.allocateIBoxes(boundsArray);
    }

    /** @override */
    intersectsDetails(testBox: CollisionBox, boxes: IBox[]): boolean {
        const collisionFound = super.intersectsDetails(testBox, boxes);
        if (this.m_renderingEnabled && this.m_renderContext !== null) {
            const padding = collisionFound ? 2 : 1;
            this.m_renderContext.strokeStyle = collisionFound ? "#FF0000" : "#00ff00";
            this.m_renderContext.strokeRect(
                testBox.x - this.screenBounds.x - padding,
                this.screenBounds.y + this.screenBounds.h - testBox.y + padding,
                testBox.w + 2 * padding,
                -testBox.h - 2 * padding
            );
        }

        if (collisionFound) {
            this.m_numFailedTests++;
        } else {
            this.m_numSuccessfulTests++;
        }

        return collisionFound;
    }

    /**
     * Checks if the given screen bounds intersects with the frustum of the active camera.
     *
     * @param bounds - The bounding box in world coordinates.
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
