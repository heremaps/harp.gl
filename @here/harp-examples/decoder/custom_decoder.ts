/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    DecodedTile,
    Geometry,
    GeometryType,
    InterleavedBufferAttribute
} from "@here/harp-datasource-protocol";
import {
    MapEnv,
    StyleSetEvaluator,
    ThreeBufferUtils
} from "@here/harp-datasource-protocol/index-decoder";
import { GeoCoordinates, Projection, TileKey, webMercatorTilingScheme } from "@here/harp-geoutils";
import { LineGroup } from "@here/harp-lines";
import {
    ThemedTileDecoder,
    TileDecoderService,
    WorkerServiceManager
} from "@here/harp-mapview-decoder/index-worker";
import { BoxBufferGeometry, Matrix4, Vector3 } from "three";
import { CUSTOM_DECODER_SERVICE_TYPE } from "./custom_decoder_defs";

export // snippet:custom_datasource_example_custom_decoder.ts
class CustomDecoder extends ThemedTileDecoder
// end:custom_datasource_example_custom_decoder.ts
{
    /** @override */
    connect() {
        return Promise.resolve();
    }

    /** @override */
    decodeThemedTile(
        data: ArrayBufferLike | {},
        tileKey: TileKey,
        styleSetEvaluator: StyleSetEvaluator,
        projection: Projection
    ): Promise<DecodedTile> {
        const geometries: Geometry[] = [];
        this.processLineFeatures(data, tileKey, styleSetEvaluator, projection, geometries);
        this.processMeshFeatures(tileKey, styleSetEvaluator, geometries);

        const decodedTile = {
            techniques: styleSetEvaluator.techniques,
            geometries
        };
        return Promise.resolve(decodedTile);
    }

    private createLineGeometry(lineGroup: LineGroup, techniqueIndex: number) {
        const { vertices, indices } = lineGroup;
        const buffer = new Float32Array(vertices).buffer as ArrayBuffer;
        const index = new Uint32Array(indices).buffer as ArrayBuffer;
        const attr: InterleavedBufferAttribute = {
            type: "float",
            stride: lineGroup.stride,
            buffer,
            attributes: lineGroup.vertexAttributes
        };
        const geometry: Geometry = {
            type: GeometryType.SolidLine,
            index: {
                buffer: index,
                itemCount: 1,
                type: "uint32",
                name: "index"
            },
            interleavedVertexAttributes: [attr],
            groups: [
                {
                    start: 0,
                    count: indices.length,
                    technique: techniqueIndex,
                    renderOrderOffset: 0
                }
            ],
            vertexAttributes: []
        };

        return geometry;
    }

    private processLineFeatures(
        data: ArrayBufferLike | {},
        tileKey: TileKey,
        styleSetEvaluator: StyleSetEvaluator,
        projection: Projection,
        geometries: Geometry[]
    ) {
        // Setup an environment for this "layer". This does normaly come from the data and should
        // contain all the attributes of a specific feature, so that it can be styled properly.
        const env = new MapEnv({ layer: "line-layer" });

        const techniques = styleSetEvaluator.getMatchingTechniques(env);

        const geoCenter = webMercatorTilingScheme.getGeoBox(tileKey).center;
        const worldCenter = projection.projectPoint(geoCenter, new Vector3());

        // Convert the input coordinates to local world coord coordinates (i.e. projected world
        // coordinates relative to the tile center in world coordinates)
        const worldPoints = this.convertToLocalWorldCoordinates(
            data,
            geoCenter,
            projection,
            worldCenter
        );

        // Create actual line-geometry out of the data.
        const lineGroup = new LineGroup();
        lineGroup.add(worldCenter, worldPoints);

        for (const technique of techniques) {
            geometries.push(this.createLineGeometry(lineGroup, technique._index));
        }
    }

    private convertToLocalWorldCoordinates(
        data: {} | ArrayBuffer | SharedArrayBuffer,
        geoCenter: GeoCoordinates,
        projection: Projection,
        worldCenter: Vector3
    ) {
        // We assume that the input data is in relative-geo-coordinates
        // (i.e. relative lat/long to the tile center).

        const points = new Float32Array(data as ArrayBuffer);
        const tmpGeoPoint = geoCenter.clone();
        const tmpWorldPoint = new Vector3();
        const worldPoints = new Array<number>((points.length / 2) * 3);
        for (let i = 0; i < points.length; i += 2) {
            tmpGeoPoint.copy(geoCenter);
            tmpGeoPoint.latitude += points[i];
            tmpGeoPoint.longitude += points[i + 1];
            projection.projectPoint(tmpGeoPoint, tmpWorldPoint);
            tmpWorldPoint.sub(worldCenter).toArray(worldPoints, (i / 2) * 3);
        }
        return worldPoints;
    }

    private processMeshFeatures(
        tileKey: TileKey,
        styleSetEvaluator: StyleSetEvaluator,
        geometries: Geometry[]
    ) {
        const env = new MapEnv({ layer: "mesh-layer" });
        const techniques = styleSetEvaluator.getMatchingTechniques(env);

        // Scale the mesh so that its size is relative to the tile size.
        // tslint:disable-next-line: no-bitwise
        const scale = (1 << 20) / (1 << tileKey.level);
        const boxGeometry = new BoxBufferGeometry(1.0 * scale, 5.0 * scale, 5.0 * scale);
        const matrix = new Matrix4();
        matrix.makeTranslation(2.0 * scale, 1.0 * scale, 0);
        boxGeometry.applyMatrix(matrix);

        for (const technique of techniques) {
            const geometry = ThreeBufferUtils.fromThreeBufferGeometry(
                boxGeometry,
                technique._index
            );
            geometries.push(geometry);
        }
    }
}

// snippet:custom_datasource_example_custom_decoder_service.ts
export class CustomDecoderService {
    static start() {
        WorkerServiceManager.getInstance().register({
            serviceType: CUSTOM_DECODER_SERVICE_TYPE,
            factory: (serviceId: string) => TileDecoderService.start(serviceId, new CustomDecoder())
        });
    }
}
// end:custom_datasource_example_custom_decoder_service.ts
