/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { assert } from "@here/harp-utils";

import { IntersectParams } from "./IntersectParams";
import { PickResult } from "./PickHandler";

// Default sorting by distance first and then by reversed render order.
function defaultSort(lhs: PickResult, rhs: PickResult) {
    const distanceDiff = lhs.distance - rhs.distance;
    const haveRenderOrder = lhs.renderOrder !== undefined && rhs.renderOrder !== undefined;
    if (distanceDiff !== 0 || !haveRenderOrder) {
        return distanceDiff;
    }

    return rhs.renderOrder! - lhs.renderOrder!;
}

/**
 * Collects results from a picking (intersection) test.
 *
 * @internal
 */
export class PickListener {
    private m_results: PickResult[] = [];
    private m_sorted: boolean = true;
    private m_finished: boolean = true;

    /**
     * Constructs a new `PickListener`.
     *
     * @param m_parameters - Optional parameters to customize picking behaviour.
     */
    constructor(private readonly m_parameters?: IntersectParams) {}

    /**
     * Adds a pick result.
     *
     * @param result - The result to be added.
     */
    addResult(result: PickResult): void {
        // Add the result only if it's a different feature from the ones already collected.
        const foundFeatureIdx = this.m_results.findIndex(otherResult => {
            const sameType = otherResult.type === result.type;
            const dataSource = result.intersection?.object.userData?.dataSource;
            const sameDataSource =
                dataSource && otherResult.intersection?.object.userData?.dataSource === dataSource;
            const sameId =
                result.featureId !== undefined && otherResult.featureId === result.featureId;
            const noId = result.featureId === undefined && otherResult.featureId === undefined;
            const sameUserData = result.userData && otherResult.userData === result.userData;
            return sameType && sameDataSource && (sameId || (noId && sameUserData));
        });

        if (foundFeatureIdx < 0) {
            this.m_sorted = false;
            this.m_finished = false;
            this.m_results.push(result);
            return;
        }

        // Replace the result for the same feature if it's sorted after the new result.
        const oldResult = this.m_results[foundFeatureIdx];
        if (defaultSort(result, oldResult) < 0) {
            this.m_results[foundFeatureIdx] = result;
            this.m_sorted = false;
            this.m_finished = false;
        }
    }

    /**
     * Indicates whether the listener is satisfied with the results already provided.
     * @returns `True` if the listener doesn't expect more results, `False` otherwise.
     */
    get done(): boolean {
        return this.maxResults ? this.m_results.length >= this.maxResults : false;
    }

    /**
     * Orders the collected results by distance first, then by reversed render order
     * (topmost/highest render order first), and limits the number of results to the maximum
     * accepted number, see {@link IntersectParams.maxResultCount}.
     */
    finish(): void {
        // Keep only the closest max results.
        this.sortResults();
        if (this.maxResults && this.m_results.length > this.maxResults) {
            this.m_results.length = this.maxResults;
        }
        this.m_finished = true;
    }

    /**
     * Returns the collected results. {@link PickListener.finish} should be called first to ensure
     * the proper sorting and result count.
     * @returns The pick results.
     */
    get results(): PickResult[] {
        assert(this.m_finished, "finish() was not called before getting the results");
        return this.m_results;
    }

    /**
     * Returns the closest result collected so far, following the order documented in
     * {@link PickListener.finish}
     * @returns The closest pick result, or `undefined` if no result was collected.
     */
    get closestResult(): PickResult | undefined {
        this.sortResults();
        return this.m_results.length > 0 ? this.m_results[0] : undefined;
    }

    /**
     * Returns the furtherst result collected so far, following the order documented in
     * {@link PickListener.results}
     * @returns The furthest pick result, or `undefined` if no result was collected.
     */
    get furthestResult(): PickResult | undefined {
        this.sortResults();
        return this.m_results.length > 0 ? this.m_results[this.m_results.length - 1] : undefined;
    }

    private get maxResults(): number | undefined {
        const maxCount = this.m_parameters?.maxResultCount ?? 0;
        return maxCount > 0 ? maxCount : undefined;
    }

    private sortResults(): void {
        if (!this.m_sorted) {
            this.m_results.sort(defaultSort);
            this.m_sorted = true;
        }
    }
}
