/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

/**
 * `IPassManager` provides a base interface for [[Pass]] managers like [[MapRenderingManager]].
 */
export interface IPassManager {
    /**
     * The render method to extend in `IPassManager`'s implementations. This is the place where the
     * desired setups and effect composing and chaining happen.
     */
    render(renderer: THREE.WebGLRenderer, ...args: any[]): void;

    /**
     * The resize method to extend in [[Pass]] implementations to resize the render targets to match
     * the size of the visible canvas. It should be called on resize events.
     *
     * @param width Width to resize to.
     * @param height Height to resize to.
     */
    setSize(width: number, height: number): void;
}
