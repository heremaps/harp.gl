/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { assert } from "@here/harp-utils";
import { TextElementGroup } from "./TextElementGroup";
import { TextElementFilter, TextElementGroupState } from "./TextElementGroupState";
import { TextElementState } from "./TextElementState";
import { TextElementType } from "./TextElementType";

/**
 * Label distance threshold squared in meters. Point labels with the same name that are closer in
 * world space than this value are treated as the same label. Valid within a single datasource.
 * Used to identify duplicate labels in overlapping tiles.
 */
const MAX_LABEL_DUPLICATE_DIST_SQ = 100;

/**
 * Caches the state of text element groups currently rendered as well as the text element states
 * belonging to them, including their fading state and text deduplication information.
 */
export class TextElementStateCache {
    private readonly m_referenceMap = new Map<TextElementGroup, TextElementGroupState>();
    private m_sortedGroupStates: TextElementGroupState[] | undefined;

    // Cache for point labels which may have duplicates in same tile or in neighboring tiles.
    private readonly m_textMap = new Map<string, TextElementState[]>();

    /**
     * Gets the state corresponding to a given text element group or sets a newly created state if
     * not found. It updates the states of the text elements belonging to the group using the
     * specified parameters.
     * @param textElementGroup The group of which the state will be obtained.
     * @param textElementFilter Filter used to decide if a text element must be initialized,
     * @see [[TextElementGroupState]] construction.
     * @returns Tuple with the group state as first element and a boolean indicating whether the
     * state was found in cache (`true`) or newly created (`false`) as second element.
     */
    getOrSet(
        textElementGroup: TextElementGroup,
        textElementFilter: TextElementFilter
    ): [TextElementGroupState, boolean] {
        let groupState = this.get(textElementGroup);

        if (groupState !== undefined) {
            assert(groupState.size === textElementGroup.elements.length);
            groupState.updateElements(textElementFilter);
            return [groupState, true];
        }

        groupState = new TextElementGroupState(textElementGroup, textElementFilter);
        this.set(textElementGroup, groupState);

        return [groupState, false];
    }

    get size(): number {
        return this.m_referenceMap.size;
    }

    /**
     * @returns All text element group states in the cache by group priority.
     */
    get sortedGroupStates(): TextElementGroupState[] {
        if (this.m_sortedGroupStates === undefined) {
            this.m_sortedGroupStates = Array.from(this.m_referenceMap.values());
            this.m_sortedGroupStates.sort((a: TextElementGroupState, b: TextElementGroupState) => {
                return b.group.priority - a.group.priority;
            });
        }

        assert(this.m_referenceMap.size === this.m_sortedGroupStates.length);
        return this.m_sortedGroupStates;
    }

    /**
     * Updates state of all cached groups, discarding those that are not needed anymore.
     * @param time The current time.
     * @param clearVisited `True` to clear visited flag in group states.
     * @param disableFading `True` if fading is currently disabled, `false` otherwise.
     * @returns `True` if any textElementGroup was evicted from cache, false otherwise.
     */
    update(time: number, clearVisited: boolean, disableFading: boolean) {
        let anyEviction = false;
        for (const [key, groupState] of this.m_referenceMap.entries()) {
            const visible = groupState.updateFading(time, disableFading);
            const keep: boolean = visible || groupState.visited;

            if (!keep) {
                this.m_referenceMap.delete(key);
                this.m_sortedGroupStates = undefined;
                anyEviction = true;
            } else if (clearVisited) {
                groupState.visited = false;
            }
        }
        this.m_textMap.clear();
        return anyEviction;
    }

    /**
     * Clears the whole cache contents.
     */
    clear() {
        this.m_referenceMap.clear();
        this.m_sortedGroupStates = undefined;
        this.m_textMap.clear();
    }

    /**
     * Removes duplicates for a given text element.
     *
     * @returns True if it's the remaining element after deduplication, false if it's been marked
     * as duplicate.
     */
    deduplicateElement(elementState: TextElementState): boolean {
        const element = elementState.element;

        if (element.type !== TextElementType.PoiLabel) {
            return true;
        }

        // Point labels may have duplicates (as can path labels), Identify them
        // and keep the one we already display.

        const cachedEntries = this.m_textMap.get(element.text);

        if (cachedEntries === undefined) {
            // No labels found with the same text.
            this.m_textMap.set(element.text, [elementState]);
            return true;
        }

        // Other labels found with the same text. Check if they're near enough to be considered
        // duplicates.
        const entryCount = cachedEntries.length;
        const elementPosition = element.points as THREE.Vector3;
        let duplicateIndex: number = -1;
        for (let i = 0; i < entryCount; ++i) {
            const cachedElementPosition = cachedEntries[i].element.points as THREE.Vector3;

            if (
                elementPosition.distanceToSquared(cachedElementPosition) <
                MAX_LABEL_DUPLICATE_DIST_SQ
            ) {
                duplicateIndex = i;
                break;
            }
        }

        if (duplicateIndex === -1) {
            // No duplicate found.
            cachedEntries.push(elementState);
            return true;
        }

        // Duplicate found, check whether there's a label already visible and keep that one.
        const cachedDuplicate = cachedEntries[duplicateIndex];

        if (!cachedDuplicate.visible && elementState.visible) {
            // New label is visible, substitute the cached label.
            cachedEntries[duplicateIndex] = elementState;

            return true;
        }

        return false;
    }

    /**
     * Gets the state corresponding to a given text element group.
     * @param textElementGroup The group of which the state will be obtained.
     * @returns The group state if cached, otherwise `undefined`.
     */
    private get(textElementGroup: TextElementGroup): TextElementGroupState | undefined {
        const groupState = this.m_referenceMap.get(textElementGroup);

        if (groupState !== undefined) {
            groupState.visited = true;
        }
        return groupState;
    }

    /**
     * Sets a specified state for a given text element group.
     * @param textElementGroup  The group of which the state will be set.
     * @param textElementGroupState The state to set for the group.
     */
    private set(textElementGroup: TextElementGroup, textElementGroupState: TextElementGroupState) {
        assert(textElementGroup.elements.length > 0);
        this.m_referenceMap.set(textElementGroup, textElementGroupState);
        this.m_sortedGroupStates = undefined;
    }
}
