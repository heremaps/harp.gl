/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
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

        const array = new Float32Array(data as ArrayBuffer);
        this.processLineFeatures(array, tileKey, styleSetEvaluator, projection, geometries);
        this.processMeshFeatures(tileKey, styleSetEvaluator, geometries);
        const dependencies: number[] = [];
        this.processDependencies(array, dependencies);

        const decodedTile: DecodedTile = {
            techniques: styleSetEvaluator.techniques,
            geometries,
            dependencies
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
                    technique: techniqueIndex
                }
            ],
            vertexAttributes: []
        };

        return geometry;
    }

    private processLineFeatures(
        data: Float32Array,
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
        lineGroup.add(worldCenter, worldPoints, projection);

        for (const technique of techniques) {
            geometries.push(this.createLineGeometry(lineGroup, technique._index));
        }
    }

    private convertToLocalWorldCoordinates(
        data: Float32Array,
        geoCenter: GeoCoordinates,
        projection: Projection,
        worldCenter: Vector3
    ) {
        // We assume that the input data is in relative-geo-coordinates
        // (i.e. relative lat/long to the tile center). The first number is the
        // number of points, the points are after that.

        const numPoints = data[0];
        const tmpGeoPoint = geoCenter.clone();
        const tmpWorldPoint = new Vector3();
        const worldPoints = new Array<number>((numPoints / 2) * 3);
        for (let i = 0; i < numPoints; i += 2) {
            tmpGeoPoint.copy(geoCenter);
            // We add +1 to skip the first entry which has the number of points
            tmpGeoPoint.latitude += data[i + 1];
            tmpGeoPoint.longitude += data[i + 2];
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
        const scale = (1 << 20) / (1 << tileKey.level);
        const boxGeometry = new BoxBufferGeometry(1.0 * scale, 5.0 * scale, 5.0 * scale);
        const matrix = new Matrix4();
        matrix.makeTranslation(2.0 * scale, 1.0 * scale, 0);
        boxGeometry.applyMatrix4(matrix);

        for (const technique of techniques) {
            const geometry = ThreeBufferUtils.fromThreeBufferGeometry(
                boxGeometry,
                technique._index
            );
            geometries.push(geometry);
        }
    }

    private processDependencies(data: Float32Array, dependencies: number[]) {
        const numberPoints = data[0];
        const numberDependenciesIndex = numberPoints + 1;
        // Add 1 because we need to skip the first element
        const numberDependencies = data[numberDependenciesIndex];
        for (let i = 0; i < numberDependencies; i++) {
            // Add 1 to skip the number of dependencies
            dependencies.push(data[numberDependenciesIndex + i + 1]);
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
