/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { MapEnv } from "@here/harp-datasource-protocol/index-decoder";
import { LoggerManager } from "@here/harp-utils";
import { OmvGenericFeatureModifier } from "./OmvDataFilter";
import { OmvFeatureFilterDescription } from "./OmvDecoderDefs";

const logger = LoggerManager.instance.create("OmvPoliticalViewFeatureModifier");

/**
 * Modifies the MapEnv of the Vector Tiles in Tilezen format with different POV.
 *
 * This feature modifier updates feature properties according to different political
 * point of view.
 * Political views (or alternate point of views) are supported in Tilezen by adding
 * additional property with ISO 3166-1 alpha-2 compliant country posix to __default__ property name.
 * For example country borders (__boundaries__ layer) may have both __kind__ property for
 * default (major POV) and __kind:xx__ for alternate points of view. This way disputed borders
 * may be visible or not for certain regions and different users (clients).
 */
export class OmvPoliticalViewFeatureModifier extends OmvGenericFeatureModifier {
    private readonly m_countryCode: string;

    /**
     * C-tor.
     *
     * @param description Contains layers and features filtering rules.
     * @param respectedPov The code of the country (in ISO 3166-1 alpha-2 format) which
     * point of view should be taken firstly into account.
     */
    constructor(description: OmvFeatureFilterDescription, respectedPov: string) {
        super(description);
        this.m_countryCode = respectedPov;
    }

    /**
     * Overrides line features processing.
     *
     * Currently only line features support different point of view.
     * @param layer The name of the layer.
     * @param env The environment to use.
     * @override
     */
    doProcessLineFeature(layer: string, env: MapEnv): boolean {
        this.rewriteEnvironment(layer, env);
        return super.doProcessLineFeature(layer, env);
    }

    /**
     * Rewrites the Environment to match the different points of view.
     *
     * @param layer The layer name.
     * @param env The environment to use.
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
