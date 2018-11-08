/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { getOptionValue } from "@here/harp-utils";
import { CopyrightInfo } from "./CopyrightInfo";
import { MapView, MapViewEventNames } from "./MapView";

/**
 * Helper class that maintains up-to-date [[MapView]] copyright information in DOM element.
 *
 * @example
 *
 *     // HTML snippet
 *     <div id="copyrightNotice" style="position:absolute; right:0; bottom:0; z-index:100"></div>
 *
 *     // Javascript
 *     const mapView = new MapView({ ... });
 *     CopyrightElementHandler.attach("copyrightNotice", mapView);
 */
export class CopyrightElementHandler {
    /**
     * Install [[CopyrightElementHandler]] on DOM element and - optionally - attach to a [[MapView]]
     * instance.
     *
     * @param element HTML DOM element or a HTML DOM element id
     * @param mapView, optional, [[attach]] to this [[MapView]]
     */
    static install(element: string | HTMLElement, mapView?: MapView): CopyrightElementHandler {
        return new CopyrightElementHandler(element, mapView);
    }

    /**
     * Static copyright info.
     *
     * Use when [[MapView]]'s [[DataSource]]'s do not provide proper copyright information.
     */
    staticInfo: CopyrightInfo[] | undefined;

    private m_defaults: Map<string, CopyrightInfo> = new Map();
    private m_element: HTMLElement;
    private m_mapViews: MapView[] = [];

    /**
     * Creates a new `CopyrightElementHandler` that updates the DOM element with the copyright info
     * of the given `mapView`.
     *
     * Note: Generally, the static [[install]] method can be used to create and attach a new
     * `CopyrightElementHandler` to a [[MapView]]
     *
     * @param elementId HTML DOM element or a HTML DOM element id
     * @param mapView optional, [[attach]] to this [[MapView]] instance
     */
    constructor(element: string | HTMLElement, mapView?: MapView) {
        if (typeof element === "string") {
            this.m_element = document.getElementById(element)!;
            if (!this.m_element) {
                throw new Error(`CopyrightElementHandler: unable to find DOM element ${element}`);
            }
        } else {
            this.m_element = element;
        }

        if (mapView !== undefined) {
            this.attach(mapView);
        }
    }

    /**
     * Destroys this object by removing all event listeners from the attached [[MapView]]s.
     */
    destroy() {
        for (const mapView of this.m_mapViews) {
            mapView.removeEventListener(MapViewEventNames.CopyrightChanged, this.update);
        }
    }

    /**
     * Attaches this [[CopyrightInfo]] updates from [[MapView]] instance.
     */
    attach(mapView: MapView): this {
        this.m_mapViews.push(mapView);

        mapView.addEventListener(MapViewEventNames.CopyrightChanged, this.update);
        this.update();

        return this;
    }

    /**
     * Stop following [[CopyrightInfo]] updates from [[MapView]] instance.
     */
    detach(mapView: MapView): this {
        mapView.removeEventListener(MapViewEventNames.CopyrightChanged, this.update);

        this.m_mapViews = this.m_mapViews.filter(item => item !== mapView);
        this.update();

        return this;
    }

    /**
     * Set [[CopyrightInfo]] defaults to be used in case [[DataSource]] does not provide deatailed
     * copyright information.
     *
     * The defaults will applied to all undefined `year`, `label` and `link` values in the copyright
     * information retrieved from [[MapView]].
     */
    setDefaults(defaults: CopyrightInfo[] | undefined): this {
        this.m_defaults.clear();
        if (defaults !== undefined) {
            for (const item of defaults) {
                this.m_defaults.set(item.id, item);
            }
        }

        return this;
    }

    /**
     * Sets the [[staticInfo]] property.
     *
     * A `CopyrightElementHandler` always displays a deduplicated sum of static copyright info and
     * copyright information obtained from attached [[MapView]]s.
     *
     * This information is used when [[DataSource]] instances of given [[MapView]] do not provide
     * copyright information.
     */
    setStaticCopyightInfo(staticInfo: CopyrightInfo[] | undefined): this {
        this.staticInfo = staticInfo;
        return this;
    }

    /**
     * Update copyright info text in controlled HTML element.
     */
    update = () => {
        const mergedCopyrightInfo = this.m_mapViews
            .map(mapView => mapView.copyrightInfo)
            .reduce(CopyrightInfo.mergeArrays, this.staticInfo || []);

        if (this.m_defaults.size !== 0) {
            for (const sourceInfo of mergedCopyrightInfo) {
                const defaults = this.m_defaults.get(sourceInfo.id);
                if (defaults !== undefined) {
                    sourceInfo.year = getOptionValue(sourceInfo.year, defaults.year);
                    sourceInfo.label = getOptionValue(sourceInfo.label, defaults.label);
                    sourceInfo.link = getOptionValue(sourceInfo.link, defaults.link);
                }
            }
        }
        const deduped = CopyrightInfo.mergeArrays(mergedCopyrightInfo);

        this.m_element.innerHTML = CopyrightInfo.formatAsHtml(deduped);
    };
}
