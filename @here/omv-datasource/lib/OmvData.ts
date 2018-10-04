/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

import { GeoBox, TileKey } from "@here/geoutils";
import { com } from "./proto/vector_tile";

/**
 * @hidden
 */
export enum CommandKind {
    MoveTo = 1,
    LineTo = 2,
    ClosePath = 7
}

/**
 * @hidden
 */
export interface BaseCommand {
    kind: CommandKind;
}

/**
 * @hidden
 */
export interface PositionCommand extends BaseCommand {
    latitude: number;
    longitude: number;
}

/**
 * @hidden
 */
export type GeometryCommand = BaseCommand | PositionCommand;

/**
 * @hidden
 */
export function isMoveToCommand(command: GeometryCommand): command is PositionCommand {
    return command.kind === CommandKind.MoveTo;
}

/**
 * @hidden
 */
export function isLineToCommand(command: GeometryCommand): command is PositionCommand {
    return command.kind === CommandKind.LineTo;
}

/**
 * @hidden
 */
export function isClosePathCommand(command: GeometryCommand): command is PositionCommand {
    return command.kind === CommandKind.ClosePath;
}

/**
 * @hidden
 */
export interface OmvVisitor {
    visitLayer?(layer: com.mapbox.pb.Tile.ILayer): boolean;
    endVisitLayer?(layer: com.mapbox.pb.Tile.ILayer): void;
    visitPointFeature?(feature: com.mapbox.pb.Tile.IFeature): void;
    visitLineFeature?(feature: com.mapbox.pb.Tile.IFeature): void;
    visitPolygonFeature?(feature: com.mapbox.pb.Tile.IFeature): void;
}

/**
 * @hidden
 */
export function visitOmv(vectorTile: com.mapbox.pb.Tile, visitor: OmvVisitor) {
    if (!vectorTile.layers) {
        return;
    }

    for (const layer of vectorTile.layers) {
        if (!visitor.visitLayer || visitor.visitLayer(layer)) {
            visitOmvLayer(layer, visitor);
        }
        if (visitor.endVisitLayer) {
            visitor.endVisitLayer(layer);
        }
    }
}

/**
 * @hidden
 */
export function visitOmvLayer(layer: com.mapbox.pb.Tile.ILayer, visitor: OmvVisitor) {
    if (!visitor.visitLayer || visitor.visitLayer(layer)) {
        if (layer.features) {
            for (const feature of layer.features) {
                switch (feature.type) {
                    case com.mapbox.pb.Tile.GeomType.UNKNOWN:
                        break;

                    case com.mapbox.pb.Tile.GeomType.POINT:
                        if (visitor.visitPointFeature) {
                            visitor.visitPointFeature(feature);
                        }
                        break;

                    case com.mapbox.pb.Tile.GeomType.LINESTRING:
                        if (visitor.visitLineFeature) {
                            visitor.visitLineFeature(feature);
                        }
                        break;

                    case com.mapbox.pb.Tile.GeomType.POLYGON:
                        if (visitor.visitPolygonFeature) {
                            visitor.visitPolygonFeature(feature);
                        }
                        break;
                }
            }
        }
    }

    if (visitor.endVisitLayer) {
        visitor.endVisitLayer(layer);
    }
}

/**
 * @hidden
 */
export interface FeatureAttributesVisitor {
    visitAttribute(name: string, value: com.mapbox.pb.Tile.IValue): boolean;
}

/**
 * @hidden
 */
export class FeatureAttributes {
    accept(
        layer: com.mapbox.pb.Tile.ILayer,
        feature: com.mapbox.pb.Tile.IFeature,
        visitor: FeatureAttributesVisitor
    ): void {
        const { keys, values } = layer;
        const tags = feature.tags;

        if (!tags || !keys || !values) {
            return;
        }

        for (let i = 0; i < tags.length; i += 2) {
            const key = keys[tags[i]];
            const value = values[tags[i + 1]];
            if (!visitor.visitAttribute(key, value)) {
                break;
            }
        }
    }
}

/**
 * @hidden
 */
export interface GeometryCommandsVisitor {
    visitCommand(command: GeometryCommand): void;
}

function lat2tile(lat: number, zoom: number): number {
    return Math.floor(
        ((1 -
            Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) /
                Math.PI) /
            2) *
            Math.pow(2, zoom)
    );
}

function tile2lat(y: number, level: number): number {
    const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, level);
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/**
 * @hidden
 */
export class GeometryCommands {
    accept(
        geometry: number[],
        tileKey: TileKey,
        geoBox: GeoBox,
        extent: number = 4096,
        visitor: GeometryCommandsVisitor
    ) {
        const longitudeScale = geoBox.longitudeSpan / extent;

        const geometryCount = geometry.length;

        const { north, west } = geoBox;

        const N = Math.log2(extent);

        const top = lat2tile(north, tileKey.level + N);

        let offsetX = 0;
        let offsetY = 0;

        for (let cmdIndex = 0; cmdIndex < geometryCount; ) {
            // tslint:disable:no-bitwise
            const kind = (geometry[cmdIndex] & 0x7) as CommandKind;
            const count = geometry[cmdIndex] >> 0x3;
            // tslint:enable:no-bitwise
            ++cmdIndex;

            if (kind === CommandKind.MoveTo || kind === CommandKind.LineTo) {
                for (let n = 0; n < count; ++n) {
                    const xx = geometry[cmdIndex++];
                    const yy = geometry[cmdIndex++];
                    // tslint:disable:no-bitwise
                    offsetX += (xx >> 1) ^ -(xx & 1);
                    offsetY += (yy >> 1) ^ -(yy & 1);
                    // tslint:enable:no-bitwise

                    const longitude = west + offsetX * longitudeScale;
                    const latitude = tile2lat(top + offsetY, tileKey.level + N);

                    visitor.visitCommand({ kind, latitude, longitude });
                }
            } else {
                visitor.visitCommand({ kind });
            }
        }
    }
}
