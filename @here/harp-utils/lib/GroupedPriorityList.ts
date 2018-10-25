/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A `PriorityListElement` has a priority to assist in sorting. The idea is that the items in a
 * grouped priority list will not modify their priority during processing to such an amount, that
 * they will change into another group. Smaller lists are smaller to sort, and in case of resource
 * limitation (maximum number of rendered objects reached), not all items have to be sorted at all.
 */
export interface PriorityListElement {
    /**
     * The integer value of this priority is used to group objects of "same" priority.
     */
    priority: number;
}

/**
 * The `PriorityListGroup` contains a list of [[PriorityListElement]]s that all have the same
 * (integer) priority.
 */
export class PriorityListGroup<T extends PriorityListElement> {
    constructor(readonly priority: number, public elements: T[] = new Array()) {}
}

/**
 * The `PriorityListGroupMap` is a map to map the (integer) priority to a [[PriorityListGroup]].
 */
export type PriorityListGroupMap<T extends PriorityListElement> = Map<number, PriorityListGroup<T>>;

/**
 * The `GroupedPriorityList` contains a [[PriorityListGroupMap]] to manage a larger number of items
 * in priority groups.
 */
export class GroupedPriorityList<T extends PriorityListElement> {
    readonly groups: PriorityListGroupMap<T> = new Map();

    /**
     * Add an element to the `GroupedPriorityList`. Selects group based on the elements priority.
     *
     * @param element Element to be added.
     */
    add(element: T): void {
        this.getGroup(element.priority).elements.push(element);
    }

    /**
     * Remove an element from the `GroupedPriorityList`.
     *
     * Note: It is required that the priority is the same as it was when the element has been added.
     * Otherwise, the removal will fail.
     *
     * @param element Element to be removed.
     * @returns `True` if the element was removed, `false` otherwise.
     */
    remove(element: T): boolean {
        const group = this.getGroup(element.priority);
        if (group !== undefined) {
            const foundIndex = group.elements.indexOf(element);
            if (foundIndex >= 0) {
                group.elements.splice(foundIndex, 1);
                if (group.elements.length === 0) {
                    const normalizedPriority = Math.floor(element.priority);
                    this.groups.delete(normalizedPriority);
                }
                return true;
            }
        }
        return false;
    }

    /**
     * Remove all internal [[PriorityListGroup]]s.
     */
    clear(): void {
        this.groups.clear();
    }

    /**
     * Merge another [[GroupedPriorityList]] into this one.
     *
     * @param other Other group to merge.
     */
    merge(other: GroupedPriorityList<T>): GroupedPriorityList<T> {
        for (const otherGroup of other.groups) {
            const group = this.findGroup(otherGroup[1].priority);
            if (group === undefined) {
                this.groups.set(Math.floor(otherGroup[1].priority), otherGroup[1]);
                continue;
            }
            group.elements = group.elements.concat(otherGroup[1].elements);
        }
        return this;
    }

    /**
     * Return a sorted list of [[PriorityListGroup]]s.
     */
    get sortedGroups(): Array<PriorityListGroup<T>> {
        const groups: Array<PriorityListGroup<T>> = [];
        for (const priorityList of this.groups) {
            groups.push(priorityList[1]);
        }

        groups.sort((a: PriorityListGroup<T>, b: PriorityListGroup<T>) => {
            return b.priority - a.priority;
        });
        return groups;
    }

    /**
     * Get group of elements that have the same (integer) priority.
     *
     * @param priority The priority to retrieve all elements from.
     */
    private findGroup(priority: number): PriorityListGroup<T> | undefined {
        const normalizedPriority = Math.floor(priority);
        const group = this.groups.get(normalizedPriority);
        return group;
    }

    /**
     * Get group of elements that have the same (integer) priority.
     *
     * @param priority The priority to retrieve all elements from.
     */
    private getGroup(priority: number): PriorityListGroup<T> {
        let group = this.findGroup(priority);

        if (group === undefined) {
            const normalizedPriority = Math.floor(priority);
            group = new PriorityListGroup<T>(normalizedPriority);
            this.groups.set(normalizedPriority, group);
        }

        return group;
    }
}
