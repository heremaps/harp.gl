/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { TextElement } from "./TextElement";
import { TextElementGroup } from "./TextElementGroup";
import { TextElementState } from "./TextElementState";

/**
 * Type of functions used to do early rejection of elements during group state creation or update.
 * @param textElement The text element to check.
 * @param lastFrameNumber Last frame the element was processed for rendering if available, otherwise
 * `undefined`.
 * @returns `undefined` if element was rejected, otherwise its current view distance.
 */
export type TextElementFilter = (
    textElement: TextElement,
    lastFrameNumber?: number
) => number | undefined;

/**
 * `TextElementGroupState` keeps the state of a text element group while it's being rendered.
 */
export class TextElementGroupState {
    // Sorted list of element states belonging to the group state. It does NOT have the same order
    // as their elements in the group.
    private m_textElementStates: TextElementState[];
    private m_visited: boolean = false;
    private m_needsSorting: boolean = false;

    /**
     * Creates the state for specified group.
     * @param group The group of which the state will be created.
     * @param filter Function used to do early rejection. @see [[TextElementFilter]].
     * @param disableFading `true` if fading is disabled, `false` otherwise.
     */
    constructor(
        readonly group: TextElementGroup,
        filter: TextElementFilter,
        disableFading: boolean
    ) {
        const length = group.elements.length;
        this.m_textElementStates = new Array(length);
        this.m_visited = true;

        // TODO: HARP-7648. Reduce number of allocations here:
        // a) Avoid creating the state for labels that don't pass early placement checks and make
        //    this checks more strict.
        // b) Break label state objects into a set of arrays held at group level, one for each
        //    primitive field in the label state.
        for (let i = 0; i < length; ++i) {
            const textElement = group.elements[i];
            const textDistance = filter(textElement);

            const state = new TextElementState(textElement, this, textDistance, disableFading);
            this.m_textElementStates[i] = state;
        }
    }

    /**
     * Indicates whether the group has been submitted to the [[TextElementsRenderer]] in the current
     * frame.
     */
    get visited(): boolean {
        return this.m_visited;
    }

    set visited(visited: boolean) {
        this.m_visited = visited;
    }

    /**
     * @returns True if any element visible after fading.
     */
    updateFading(time: number): boolean {
        let groupVisible = false;
        for (const elementState of this.m_textElementStates) {
            if (elementState !== undefined) {
                const elementVisible = elementState.updateFading(time);
                groupVisible = groupVisible || elementVisible;
            }
        }
        return groupVisible;
    }

    /**
     * Updates the states of elements within the group.
     * @param filter Function used to do early rejection. @see [[TextElementFilter]].
     * @param disableFading `true` if fading is disabled, `false` otherwise.
     */
    updateElements(filter: TextElementFilter, disableFading: boolean) {
        for (const elementState of this.m_textElementStates) {
            const lastFrameNumber = elementState.initialized
                ? elementState.textRenderState!.lastFrameNumber
                : undefined;
            const textDistance = filter(elementState.element, lastFrameNumber);

            if (elementState.initialized) {
                elementState.setViewDistance(textDistance, this);
            } else if (textDistance !== undefined) {
                elementState.initialize(this, textDistance, disableFading);
            }
        }
    }

    get size(): number {
        return this.m_textElementStates.length;
    }

    get needsSorting(): boolean {
        return this.m_needsSorting;
    }

    invalidateSorting() {
        this.m_needsSorting = true;
    }

    // NOTE: Text element states are sorted by priority/camera distance, so they order
    // does not match with the text elements in the group!.

    /**
     * Returns element states sorted by their sort priority,
     * @see [[TextElementState.computeSortPriority]].
     * @param maxViewDistance Maximum distance from the view center that a visible element may have.
     * @returns Array of sorted element states.
     */
    sortedTextElementStates(maxViewDistance: number): TextElementState[] {
        if (!this.m_needsSorting) {
            return this.m_textElementStates;
        }

        // Compute the sortPriority once for all elements, because the computation is done more
        // than once per element. Also, make sorting stable by taking the index into the array into
        // account, this is required to get repeatable results for testing.

        for (const textElementState of this.m_textElementStates) {
            textElementState.computeSortPriority(maxViewDistance);
        }

        // Do the actual sort based on sortPriority
        this.m_textElementStates.sort((a: TextElementState, b: TextElementState) => {
            return b.sortPriority! - a.sortPriority!;
        });
        this.m_needsSorting = false;

        return this.m_textElementStates;
    }
}
