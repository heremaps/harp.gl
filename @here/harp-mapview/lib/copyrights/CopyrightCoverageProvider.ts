/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoBox } from "@here/harp-geoutils";
import { getOptionValue, ILogger, LoggerManager } from "@here/harp-utils";

import { CopyrightInfo } from "./CopyrightInfo";
import { CopyrightProvider } from "./CopyrightProvider";

declare const require: any;

const RBush = require("rbush");

/**
 * Schema of [Map Tile API copyright
 * endpoint](https://developer.here.com/documentation/map-tile/topics/resource-copyright.html) JSON
 * response.
 */
export interface AreaCopyrightInfo {
    /**
     * Minimum zoom level for the specified copyright label.
     */
    minLevel?: number;

    /**
     * Maximum zoom level for the specified copyright label.
     */
    maxLevel?: number;

    /**
     * Copyright text to display after the copyright symbol on the map.
     */
    label: string;

    /**
     * Verbose copyright text of the label to display by mouse over label or info menu entry.
     */
    alt?: string;

    /**
     * The bounding boxes define areas where specific copyrights are valid. A bounding box is
     * defined by bottom (latitude), left (longitude) and top (latitude), right (longitude).
     *
     * The default copyright has no boxes element and covers all other areas.
     */
    boxes?: Array<[number, number, number, number]>;
}

/**
 * Schema of [Map Tile API copyright
 * endpoint](https://developer.here.com/documentation/map-tile/topics/resource-copyright.html) JSON
 * response.
 */
export interface CopyrightCoverageResponse {
    [scheme: string]: AreaCopyrightInfo[];
}

/**
 * Base class to provide copyrights based on copyright coverage information, defined by geographical
 * bounding boxes and relevant zoom level ranges.
 */
export abstract class CopyrightCoverageProvider implements CopyrightProvider {
    /** Logger instance. */
    protected readonly logger: ILogger = LoggerManager.instance.create("CopyrightCoverageProvider");

    private m_cachedTreePromise: Promise<any> | undefined;

    /** Asynchronously retrieves copyright coverage data.
     * @param abortSignal - Optional AbortSignal to cancel the request.
     */
    abstract getCopyrightCoverageData(abortSignal?: AbortSignal): Promise<AreaCopyrightInfo[]>;

    /** @inheritdoc */
    getTree(): Promise<any> {
        if (this.m_cachedTreePromise !== undefined) {
            return this.m_cachedTreePromise;
        }

        this.m_cachedTreePromise = this.getCopyrightCoverageData()
            .then(coverageInfo => this.initRBush(coverageInfo))
            .catch(error => {
                this.logger.error(error);
                return new RBush();
            });

        return this.m_cachedTreePromise;
    }

    /** @inheritdoc */
    async getCopyrights(geoBox: GeoBox, level: number): Promise<CopyrightInfo[]> {
        const tree = await this.getTree();

        const result: CopyrightInfo[] = [];

        const matchingEntries: AreaCopyrightInfo[] = tree.search({
            minX: geoBox.west,
            minY: geoBox.south,
            maxX: geoBox.east,
            maxY: geoBox.north
        });

        for (const entry of matchingEntries) {
            const minLevel = getOptionValue(entry.minLevel, 0);
            const maxLevel = getOptionValue(entry.maxLevel, Infinity);

            if (level >= minLevel && level <= maxLevel) {
                if (result.find(item => item.id === entry.label) === undefined) {
                    result.push({ id: entry.label });
                }
            }
        }

        return result;
    }

    /**
     * Initializes RBush.
     *
     * @param entries - Entries for tree.
     * @returns RBush instance.
     */
    initRBush(entries: AreaCopyrightInfo[]): any {
        const tree = new RBush();

        if (!entries) {
            this.logger.warn("No copyright coverage data provided");
            return tree;
        }

        for (const entry of entries) {
            const { minLevel, maxLevel, label, alt } = entry;

            if (!entry.boxes) {
                tree.insert({
                    minX: -180,
                    minY: -90,
                    maxX: 180,
                    maxY: 180,
                    minLevel,
                    maxLevel,
                    label,
                    alt
                });
            } else {
                for (const box of entry.boxes) {
                    const [minY, minX, maxY, maxX] = box;
                    tree.insert({
                        minX,
                        minY,
                        maxX,
                        maxY,
                        minLevel,
                        maxLevel,
                        label,
                        alt
                    });
                }
            }
        }

        return tree;
    }
}
