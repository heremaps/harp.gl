/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { assert } from "@here/harp-utils";
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
 * `TextElementGroupState` keeps the state of a text element group and each element in it while
 * they're being rendered.
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
     */
    constructor(readonly group: TextElementGroup, filter: TextElementFilter) {
        assert(group.elements.length > 0);
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

            const state = new TextElementState(textElement, this, textDistance);
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
     * @returns the priority of the text elements in the group.
     */
    get priority() {
        return this.m_textElementStates[0].element.priority;
    }

    /**
     * Updates the fading state of all text elements within the group to the specified time.
     * @param time The time to which the fading state will be updated.
     * @param disableFading `true` if fading is disabled, `false` otherwise.
     * @returns True if any element visible after fading.
     */
    updateFading(time: number, disableFading: boolean): boolean {
        let groupVisible = false;
        for (const elementState of this.m_textElementStates) {
            if (elementState !== undefined) {
                const elementVisible = elementState.updateFading(time, disableFading);
                groupVisible = groupVisible || elementVisible;
            }
        }
        return groupVisible;
    }

    /**
     * Updates the states of elements within the group.
     * @param filter Function used to do early rejection. @see [[TextElementFilter]].
     */
    updateElements(filter: TextElementFilter) {
        for (const elementState of this.m_textElementStates) {
            const lastFrameNumber = elementState.initialized
                ? elementState.textRenderState!.lastFrameNumber
                : undefined;
            const textDistance = filter(elementState.element, lastFrameNumber);

            elementState.update(this, textDistance);
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

    /**
     * Returns text element states sorted by view distance.
     * NOTE: The order does not match with the text elements in the group!.
     * @param maxViewDistance Maximum distance from the view center that a visible element may have.
     * @returns Array of sorted element states.
     */
    sortedTextElementStates(maxViewDistance: number): TextElementState[] {
        if (!this.m_needsSorting) {
            return this.m_textElementStates;
        }

        // Do the actual sort based on view distance.
        this.m_textElementStates.sort((a: TextElementState, b: TextElementState) => {
            // Move elements with undefined view distance to the end.
            if (a.viewDistance === b.viewDistance) {
                return 0;
            }
            if (a.viewDistance === undefined) {
                return 1;
            }

            if (b.viewDistance === undefined) {
                return -1;
            }

            // Both elements have valid view distances.
            return a.viewDistance - b.viewDistance;
        });
        this.m_needsSorting = false;

        return this.m_textElementStates;
    }
}
