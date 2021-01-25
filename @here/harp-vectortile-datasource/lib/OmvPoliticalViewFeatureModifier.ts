/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { MapEnv } from "@here/harp-datasource-protocol/index-decoder";
import { LoggerManager } from "@here/harp-utils";

import { OmvFeatureModifier } from "./OmvDataFilter";

const logger = LoggerManager.instance.create("OmvPoliticalViewFeatureModifier");

/**
 * Modifies the MapEnv of the Vector Tiles in Tilezen format with different POV.
 *
 * This feature modifier updates feature properties according to different political
 * point of view.
 * Political views (or alternate point of views) are supported in Tilezen by adding
 * country posix (lower-case ISO 3166-1 alpha-2 compliant) to __default__ property name.
 * For example country borders (__boundaries__ layer) may have both __kind__ property for
 * default (commonly accepted point of view) and __kind:xx__ for alternate points of view.
 * This way disputed borders may be visible or not for certain regions and different
 * users (clients).
 *
 * @hidden
 */
export class OmvPoliticalViewFeatureModifier implements OmvFeatureModifier {
    private readonly m_countryCode: string;

    /**
     * C-tor.
     *
     * @param pov - The code of the country (in lower-case ISO 3166-1 alpha-2 format) which
     * point of view should be taken into account.
     */
    constructor(pov: string) {
        this.m_countryCode = pov;
    }

    /**
     * Simply passes all points to rendering, points features does not support PoliticalView.
     *
     * @param layer - Current layer.
     * @param env - Properties of point feature.
     * @param level - Level of tile.
     * @returns always `true` to pass feature.
     */
    doProcessPointFeature(layer: string, env: MapEnv, level: number): boolean {
        return true;
    }

    /**
     * Implements line features processing changing "kind" attribute depending on point of view.
     *
     * Currently only line features support different point of view.
     * @param layer - The name of the layer.
     * @param env - The environment to use.
     * @returns always `true` to pass lines for rendering.
     */
    doProcessLineFeature(layer: string, env: MapEnv, level: number): boolean {
        this.rewriteEnvironment(layer, env);
        return true;
    }

    /**
     * Simply pass all polygons to rendering, this feature does not support PoliticalView yet.
     *
     * @param layer - Current layer.
     * @param env - Properties of polygon feature.
     * @param level - Level of tile.
     * @returns `true` to pass feature.
     */
    doProcessPolygonFeature(layer: string, env: MapEnv, level: number): boolean {
        return true;
    }

    /**
     * Rewrites the Environment to match the different points of view.
     *
     * @param layer - The layer name.
     * @param env - The environment to use.
     */
    private rewriteEnvironment(layer: string, env: MapEnv) {
        // For now we need to rewrite "boundaries" layer only.
        if (this.isPoliticalViewLayer(layer)) {
            this.updateEnvironment(env, this.m_countryCode, "kind");
        }
    }

    private updateEnvironment(env: MapEnv, countryCode: string, propName: string): void {
        const value = this.getAlternativePov(env, countryCode, propName);
        if (value !== undefined) {
            env.entries[propName] = value;
        }
    }

    private getAlternativePov(env: MapEnv, countryCode: string, propName: string) {
        logger.log("Get alternate POV: ", JSON.stringify(env));
        const cc = countryCode;
        const value = env.lookup(`${propName}:${cc}`);
        logger.log("Lookup POV: ", `${propName}:${cc}`, value);
        if (typeof value === "string" && value.length > 0) {
            logger.log("Found POV: ", `${propName}:${cc}`, value);
            return value;
        } else {
            return undefined;
        }
    }

    private isPoliticalViewLayer(layer: string): boolean {
        return layer === "boundaries";
    }
}
