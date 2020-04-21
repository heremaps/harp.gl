/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { MapEnv } from "@here/harp-datasource-protocol/lib/Env";
import { GeoBox, TileKey } from "@here/harp-geoutils";
import { ILogger } from "@here/harp-utils";
import { IGeometryProcessor, ILineGeometry, IPolygonGeometry } from "./IGeometryProcessor";
import { OmvFeatureFilter } from "./OmvDataFilter";
import { OmvDataAdapter } from "./OmvDecoder";
import { OmvGeometryType } from "./OmvDecoderDefs";

import * as THREE from "three";

import Pbf = require("pbf");

declare function require(name: string): any;

// tslint:disable:no-var-requires
const { VectorTile, VectorTileFeature } = require("@mapbox/vector-tile");

export class VTDataAdapter implements OmvDataAdapter {
    readonly id = "VtDataAdapter";

    constructor(
        readonly processor: IGeometryProcessor,
        readonly dataFilter?: OmvFeatureFilter,
        readonly m_logger?: ILogger
    ) {}

    canProcess(data: ArrayBufferLike | {}) {
        return data instanceof ArrayBuffer;
    }

    process(data: ArrayBufferLike, tileKey: TileKey, geoBox: GeoBox): void {
        const pbf = new Pbf(new Uint8Array(data));
        const vt = new VectorTile(pbf);

        const $zoom = Math.max(0, tileKey.level - (this.processor.storageLevelOffset || 0));
        const $level = tileKey.level;

        // tslint:disable-next-line: forin
        for (const layerName in vt.layers) {
            if (!vt.layers.hasOwnProperty(layerName)) {
                continue;
            }

            if (this.dataFilter?.wantsLayer(layerName, $level) === false) {
                continue;
            }

            const layer = vt.layers[layerName];
            for (let i = 0; i < layer.length; ++i) {
                const feature = layer.feature(i);
                const type = VectorTileFeature.types[feature.type];

                switch (type) {
                    case "Point": {
                        if (
                            this.dataFilter?.wantsPointFeature(
                                layerName,
                                OmvGeometryType.POINT,
                                $level
                            ) === false
                        ) {
                            break;
                        }

                        const coords: THREE.Vec2[][] = feature.loadGeometry();
                        const geometry: THREE.Vector2[] = [];
                        coords.forEach(points => {
                            points.forEach(p => {
                                geometry.push(new THREE.Vector2(p.x, p.y));
                            });
                        });
                        const env = new MapEnv({
                            ...feature.properties,
                            $geometryType: "point",
                            $layer: layerName,
                            $zoom,
                            $level
                        });

                        this.processor.processPointFeature(
                            layerName,
                            vt.extent ?? 4096,
                            geometry,
                            env,
                            tileKey.level
                        );

                        break;
                    }

                    case "Polygon": {
                        if (
                            this.dataFilter?.wantsPolygonFeature(
                                layerName,
                                OmvGeometryType.POLYGON,
                                $level
                            ) === false
                        ) {
                            break;
                        }

                        const coords: THREE.Vec2[][] = feature.loadGeometry();

                        const rings: THREE.Vector2[][] = coords.map(points =>
                            points.map(p => new THREE.Vector2(p.x, p.y))
                        );

                        const geometry: IPolygonGeometry = { rings };

                        const env = new MapEnv({
                            ...feature.properties,
                            $geometryType: "polygon",
                            $layer: layerName,
                            $zoom,
                            $level
                        });

                        this.processor.processPolygonFeature(
                            layerName,
                            vt.extent ?? 4096,
                            [geometry],
                            env,
                            tileKey.level
                        );

                        break;
                    }

                    case "LineString": {
                        if (
                            this.dataFilter?.wantsLineFeature(
                                layerName,
                                OmvGeometryType.LINESTRING,
                                $level
                            ) === false
                        ) {
                            break;
                        }

                        const coords: THREE.Vec2[][] = feature.loadGeometry();

                        const geometry: ILineGeometry[] = coords.map(points => {
                            const positions = points.map(c => new THREE.Vector2(c.x, c.y));
                            return { positions };
                        });

                        const env = new MapEnv({
                            ...feature.properties,
                            $geometryType: "line",
                            $layer: layerName,
                            $zoom,
                            $level
                        });

                        this.processor.processLineFeature(
                            layerName,
                            vt.extent ?? 4096,
                            geometry,
                            env,
                            tileKey.level
                        );
                        break;
                    }

                    default:
                        break;
                }
            }
        }
    }
}
