/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { MapEnv } from "@here/datasource-protocol";
import { LoggerManager } from "@here/utils";
import { OmvGenericFeatureModifier } from "./OmvDataFilter";
import { OmvFeatureFilterDescription, OmvFilterDescription } from "./OmvDecoderDefs";
import { com } from "./proto/vector_tile";

const logger = LoggerManager.instance.create("OmvTomTomFeatureModifier");

const DEFAULT_BUILDING_COLOR = "#AAAAAA";
const DEFAULT_DO_EXTRUDE_BUILDINGS = "true";
const DEFAULT_BUILDING_MIN_HEIGHT = "2";
const DEFAULT_BUILDING_HEIGHT = "20";

/**
 * Modifies the MapEnv of the TomTom Vector Tiles to be similar to the OMV format, so that the same
 * theme files can be used.
 */
export class OmvTomTomFeatureModifier extends OmvGenericFeatureModifier {
    constructor(description: OmvFeatureFilterDescription) {
        super(description);
    }

    protected doProcessFeature(
        itemsToProcess: OmvFilterDescription[],
        itemsToIgnore: OmvFilterDescription[],
        layer: com.mapbox.pb.Tile.ILayer,
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
    private rewriteEnvironment(layer: com.mapbox.pb.Tile.ILayer, env: MapEnv) {
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

    private isWood(layer: com.mapbox.pb.Tile.ILayer): boolean {
        return layer.name === "Woodland" || layer.name === "Moor or heathland";
    }

    private isHospital(layer: com.mapbox.pb.Tile.ILayer): boolean {
        return layer.name === "Hospital";
    }

    private isCemetery(layer: com.mapbox.pb.Tile.ILayer): boolean {
        return layer.name === "Cemetery";
    }

    private isIndustrial(layer: com.mapbox.pb.Tile.ILayer): boolean {
        return layer.name.indexOf("Industrial") >= 0 || layer.name === "Airport";
    }

    private isPark(layer: com.mapbox.pb.Tile.ILayer): boolean {
        return (
            layer.name === "Park" ||
            layer.name === "City park" ||
            layer.name === "National park" ||
            layer.name === "Regional park" ||
            layer.name.indexOf("grass") >= 0 ||
            layer.name.indexOf("greens") >= 0
        );
    }

    private isBuiltup(layer: com.mapbox.pb.Tile.ILayer): boolean {
        return (
            layer.name === "Built-up area" ||
            layer.name === "Town paved area" ||
            layer.name === "Shopping" ||
            layer.name === "University" ||
            layer.name === "Stadium" ||
            layer.name.indexOf("ground") > 0
        );
    }

    private isWater(layer: com.mapbox.pb.Tile.ILayer): boolean {
        return (
            layer.name === "Other water" ||
            layer.name === "Ocean or sea" ||
            layer.name === "Ocean" ||
            layer.name === "Lake" ||
            layer.name === "Sea" ||
            layer.name === "Town swimming pool" ||
            layer.name === "River"
        );
    }

    private isRoadLabel(layer: com.mapbox.pb.Tile.ILayer): boolean {
        return layer.name.indexOf("road label") >= 0;
    }

    private isRoadPath(layer: com.mapbox.pb.Tile.ILayer): boolean {
        return (
            layer.name.indexOf("path") > 0 ||
            layer.name === "Parking road" ||
            layer.name === "Town walkway" ||
            layer.name === "Pedestrian road" ||
            layer.name === "Walkway road" ||
            layer.name === "Town carriageway divider" ||
            layer.name === "Runway" ||
            layer.name === "Non public road"
        );
    }

    private isRoadStreet(layer: com.mapbox.pb.Tile.ILayer): boolean {
        return (
            layer.name.indexOf("Minor local road") >= 0 ||
            layer.name.indexOf("minor local road") >= 0 ||
            layer.name.indexOf("Toll local road") >= 0 ||
            layer.name.indexOf("Local road") >= 0
        );
    }
    private isRoadPrimary(layer: com.mapbox.pb.Tile.ILayer): boolean {
        return (
            layer.name.indexOf("Major local road") >= 0 ||
            layer.name.indexOf("Major road") >= 0 ||
            layer.name.indexOf("major road") >= 0 ||
            layer.name.indexOf("Motorway") >= 0 ||
            layer.name.indexOf("motorway") >= 0 ||
            layer.name.indexOf("International road") >= 0 ||
            layer.name.indexOf("international road") >= 0
        );
    }

    private isRoadSecondary(layer: com.mapbox.pb.Tile.ILayer): boolean {
        return (
            layer.name.indexOf("connecting road") >= 0 ||
            layer.name.indexOf("Connecting road") >= 0 ||
            layer.name.indexOf("secondary road") >= 0 ||
            layer.name.indexOf("Secondary road") >= 0
        );
    }

    private isRailway(layer: com.mapbox.pb.Tile.ILayer): boolean {
        return layer.name === "Railway";
    }

    private isFerry(layer: com.mapbox.pb.Tile.ILayer): boolean {
        return layer.name === "Ferry road";
    }

    private isBorder(layer: com.mapbox.pb.Tile.ILayer): boolean {
        return layer.name.indexOf("border") > 0;
    }

    private isCountryLabel(layer: com.mapbox.pb.Tile.ILayer): boolean {
        return layer.name === "Country name" || layer.name === "Country label";
    }

    private isStateLabel(layer: com.mapbox.pb.Tile.ILayer): boolean {
        return layer.name === "City" || layer.name.indexOf("city") > 0;
    }

    private isRegionLabel(layer: com.mapbox.pb.Tile.ILayer): boolean {
        return layer.name === "Town";
    }

    private isCountyLabel(layer: com.mapbox.pb.Tile.ILayer): boolean {
        return layer.name === "Village";
    }

    private isPlaceLabel(layer: com.mapbox.pb.Tile.ILayer): boolean {
        return (
            layer.name === "Park" ||
            layer.name === "Railway station" ||
            layer.name === "Airport POI" ||
            layer.name === "Town greens"
        );
    }

    private isWaterLabel(layer: com.mapbox.pb.Tile.ILayer): boolean {
        return (
            layer.name === "Ocean name" ||
            layer.name === "River label" ||
            layer.name.indexOf("water label") > 0
        );
    }

    private isMarineLabel(layer: com.mapbox.pb.Tile.ILayer): boolean {
        return layer.name.indexOf("water label") > 0;
    }

    private isPoiLabel(layer: com.mapbox.pb.Tile.ILayer): boolean {
        return (
            layer.name === "National park name" ||
            layer.name === "Landmark label" ||
            layer.name.indexOf("label") >= 0
        );
    }

    private isAeroway(layer: com.mapbox.pb.Tile.ILayer): boolean {
        return layer.name === "Airport";
    }

    private isBuilding(layer: com.mapbox.pb.Tile.ILayer): boolean {
        return layer.name.indexOf("building") >= 0;
    }

    private isTunnel(layer: com.mapbox.pb.Tile.ILayer): boolean {
        return layer.name.indexOf("tunnel") >= 0;
    }

    private isBridge(layer: com.mapbox.pb.Tile.ILayer): boolean {
        return layer.name.indexOf("bridge") >= 0;
    }
}
