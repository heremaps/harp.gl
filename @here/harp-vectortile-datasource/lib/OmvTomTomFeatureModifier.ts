/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { MapEnv } from "@here/harp-datasource-protocol/index-decoder";
import { LoggerManager } from "@here/harp-utils";
import { VectorTileGenericFeatureModifier } from "./VectorTileDataFilter";
import {
    VectorTileFeatureFilterDescription,
    VectorTileFilterDescription
} from "./VectorTileDecoderDefs";

const logger = LoggerManager.instance.create("OmvTomTomFeatureModifier");

const DEFAULT_BUILDING_COLOR = "#AAAAAA";
const DEFAULT_DO_EXTRUDE_BUILDINGS = "true";
const DEFAULT_BUILDING_MIN_HEIGHT = "2";
const DEFAULT_BUILDING_HEIGHT = "20";

/**
 * Modifies the MapEnv of the TomTom Vector Tiles to be similar to the OMV format, so that the same
 * theme files can be used.
 */
export class OmvTomTomFeatureModifier extends VectorTileGenericFeatureModifier {
    constructor(description: VectorTileFeatureFilterDescription) {
        super(description);
    }

    protected doProcessFeature(
        itemsToProcess: VectorTileFilterDescription[],
        itemsToIgnore: VectorTileFilterDescription[],
        layer: string,
        env: MapEnv,
        defaultResult: boolean
    ): boolean {
        this.rewriteEnvironment(layer, env);
        return super.doProcessFeature(itemsToProcess, itemsToIgnore, layer, env, defaultResult);
    }

    /**
     * Rewrites the Environment to match the environment naming used in OMV.
     *
     * Does not cover roadlabels, as the roadlabels in the Tomtom format are delivered in a
     * different format combined in the environment with the road line geometry, which is
     * represented as two separate environment in the default format.
     *
     * @param layer
     * @param env
     */
    private rewriteEnvironment(layer: string, env: MapEnv) {
        // Rewriting landuse layers
        if (this.isWood(layer)) {
            this.updateEnvironment(env, "landuse", "wood");
        } else if (this.isHospital(layer)) {
            this.updateEnvironment(env, "landuse", "hospital");
        } else if (this.isCemetery(layer)) {
            this.updateEnvironment(env, "landuse", "cemetery");
        } else if (this.isIndustrial(layer)) {
            this.updateEnvironment(env, "landuse", "industrial");
        } else if (this.isPark(layer)) {
            this.updateEnvironment(env, "landuse", "park");
        } else if (this.isBuiltup(layer)) {
            this.updateEnvironment(env, "landuse", "builtup");
            // Rewriting the water layer
        } else if (this.isWater(layer)) {
            this.updateEnvironment(env, "water");
            // Rewriting the road label layer
        } else if (this.isRoadLabel(layer)) {
            this.updateEnvironment(env, "road_label");
            // Rewriting road layers with category classes
        } else if (this.isRoadPath(layer)) {
            this.updateEnvironment(env, "road", "path");
        } else if (this.isRoadStreet(layer)) {
            this.updateEnvironment(env, "road", "street");
        } else if (this.isRoadPrimary(layer)) {
            this.updateEnvironment(env, "road", "primary");
        } else if (this.isRoadSecondary(layer)) {
            this.updateEnvironment(env, "road", "secondary");
        } else if (this.isRailway(layer)) {
            this.updateEnvironment(env, "road", "major_rail");
        } else if (this.isFerry(layer)) {
            this.updateEnvironment(env, "road", "ferry");
            // Rewriting aeroway layer
        } else if (this.isAeroway(layer)) {
            this.updateEnvironment(env, "aeroway");
            // Rewriting border layer
        } else if (this.isBorder(layer)) {
            this.updateEnvironment(env, "admin");
            // Rewriting label layers
        } else if (this.isCountryLabel(layer)) {
            this.updateEnvironment(env, "country_label");
        } else if (this.isCountyLabel(layer)) {
            this.updateEnvironment(env, "county_label");
        } else if (this.isRegionLabel(layer)) {
            this.updateEnvironment(env, "region_label");
        } else if (this.isStateLabel(layer)) {
            this.updateEnvironment(env, "state_label");
        } else if (this.isPlaceLabel(layer)) {
            this.updateEnvironment(env, "place_label");
        } else if (this.isWaterLabel(layer)) {
            this.updateEnvironment(env, "water_label");
        } else if (this.isMarineLabel(layer)) {
            this.updateEnvironment(env, "marine_label");
        } else if (this.isPoiLabel(layer)) {
            this.updateEnvironment(env, "poi_label");
            // Rewriting building layer
        } else if (this.isBuilding(layer)) {
            this.updateEnvironment(env, "building");
            env.entries.color = DEFAULT_BUILDING_COLOR;
            env.entries.extrude = DEFAULT_DO_EXTRUDE_BUILDINGS;
            env.entries.min_height = DEFAULT_BUILDING_MIN_HEIGHT;
            env.entries.height = DEFAULT_BUILDING_HEIGHT;
        } else {
            logger.info(`Not yet rewritten layer: ##${env.entries.$layer}## `);
        }

        // Add tunnel structure if its a tunnel
        if (this.isTunnel(layer)) {
            env.entries.structure = "tunnel";
        }

        //Add bridge structure if its a bridge
        if (this.isBridge(layer)) {
            env.entries.structure = "bridge";
        }
    }

    private updateEnvironment(
        env: MapEnv,
        layer: string,
        newClass?: string,
        structure?: string
    ): void {
        env.entries.$layer = layer;
        if (newClass !== undefined) {
            env.entries.class = newClass;
        }
        if (structure !== undefined) {
            env.entries.structure = structure;
        }
    }

    private isWood(layer: string): boolean {
        return layer === "Woodland" || layer === "Moor or heathland";
    }

    private isHospital(layer: string): boolean {
        return layer === "Hospital";
    }

    private isCemetery(layer: string): boolean {
        return layer === "Cemetery";
    }

    private isIndustrial(layer: string): boolean {
        return layer.indexOf("Industrial") >= 0 || layer === "Airport";
    }

    private isPark(layer: string): boolean {
        return (
            layer === "Park" ||
            layer === "City park" ||
            layer === "National park" ||
            layer === "Regional park" ||
            layer.indexOf("grass") >= 0 ||
            layer.indexOf("greens") >= 0
        );
    }

    private isBuiltup(layer: string): boolean {
        return (
            layer === "Built-up area" ||
            layer === "Town paved area" ||
            layer === "Shopping" ||
            layer === "University" ||
            layer === "Stadium" ||
            layer.indexOf("ground") > 0
        );
    }

    private isWater(layer: string): boolean {
        return (
            layer === "Other water" ||
            layer === "Ocean or sea" ||
            layer === "Ocean" ||
            layer === "Lake" ||
            layer === "Sea" ||
            layer === "Town swimming pool" ||
            layer === "River"
        );
    }

    private isRoadLabel(layer: string): boolean {
        return layer.indexOf("road label") >= 0;
    }

    private isRoadPath(layer: string): boolean {
        return (
            layer.indexOf("path") > 0 ||
            layer === "Parking road" ||
            layer === "Town walkway" ||
            layer === "Pedestrian road" ||
            layer === "Walkway road" ||
            layer === "Town carriageway divider" ||
            layer === "Runway" ||
            layer === "Non public road"
        );
    }

    private isRoadStreet(layer: string): boolean {
        return (
            layer.indexOf("Minor local road") >= 0 ||
            layer.indexOf("minor local road") >= 0 ||
            layer.indexOf("Toll local road") >= 0 ||
            layer.indexOf("Local road") >= 0
        );
    }
    private isRoadPrimary(layer: string): boolean {
        return (
            layer.indexOf("Major local road") >= 0 ||
            layer.indexOf("Major road") >= 0 ||
            layer.indexOf("major road") >= 0 ||
            layer.indexOf("Motorway") >= 0 ||
            layer.indexOf("motorway") >= 0 ||
            layer.indexOf("International road") >= 0 ||
            layer.indexOf("international road") >= 0
        );
    }

    private isRoadSecondary(layer: string): boolean {
        return (
            layer.indexOf("connecting road") >= 0 ||
            layer.indexOf("Connecting road") >= 0 ||
            layer.indexOf("secondary road") >= 0 ||
            layer.indexOf("Secondary road") >= 0
        );
    }

    private isRailway(layer: string): boolean {
        return layer === "Railway";
    }

    private isFerry(layer: string): boolean {
        return layer === "Ferry road";
    }

    private isBorder(layer: string): boolean {
        return layer.indexOf("border") > 0;
    }

    private isCountryLabel(layer: string): boolean {
        return layer === "Country name" || layer === "Country label";
    }

    private isStateLabel(layer: string): boolean {
        return layer === "City" || layer.indexOf("city") > 0;
    }

    private isRegionLabel(layer: string): boolean {
        return layer === "Town";
    }

    private isCountyLabel(layer: string): boolean {
        return layer === "Village";
    }

    private isPlaceLabel(layer: string): boolean {
        return (
            layer === "Park" ||
            layer === "Railway station" ||
            layer === "Airport POI" ||
            layer === "Town greens"
        );
    }

    private isWaterLabel(layer: string): boolean {
        return (
            layer === "Ocean name" || layer === "River label" || layer.indexOf("water label") > 0
        );
    }

    private isMarineLabel(layer: string): boolean {
        return layer.indexOf("water label") > 0;
    }

    private isPoiLabel(layer: string): boolean {
        return (
            layer === "National park name" ||
            layer === "Landmark label" ||
            layer.indexOf("label") >= 0
        );
    }

    private isAeroway(layer: string): boolean {
        return layer === "Airport";
    }

    private isBuilding(layer: string): boolean {
        return layer.indexOf("building") >= 0;
    }

    private isTunnel(layer: string): boolean {
        return layer.indexOf("tunnel") >= 0;
    }

    private isBridge(layer: string): boolean {
        return layer.indexOf("bridge") >= 0;
    }
}
