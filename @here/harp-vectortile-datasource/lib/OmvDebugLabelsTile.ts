/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { getPropertyValue, isTextTechnique } from "@here/harp-datasource-protocol";
import { TileKey } from "@here/harp-geoutils/lib/tiling/TileKey";
import { DataSource, TextElement, Tile } from "@here/harp-mapview";
import { debugContext } from "@here/harp-mapview/lib/DebugContext";
import { TileGeometryCreator } from "@here/harp-mapview/lib/geometry/TileGeometryCreator";
import { TextElementType } from "@here/harp-mapview/lib/text/TextElementType";
import {
    ContextualArabicConverter,
    FontUnit,
    TextLayoutStyle,
    TextRenderStyle
} from "@here/harp-text-canvas";
import * as THREE from "three";

const debugMaterial = new THREE.LineBasicMaterial({
    color: 0x000000,
    linewidth: 1,
    depthTest: false,
    depthFunc: THREE.NeverDepth
});

const debugCircleMaterial = new THREE.MeshBasicMaterial({
    color: 0xff0000,
    depthTest: false,
    depthFunc: THREE.NeverDepth
});

const debugCircleMaterialWF = new THREE.MeshBasicMaterial({
    color: 0xff0000,
    depthTest: false,
    depthFunc: THREE.NeverDepth
});
debugCircleMaterialWF.wireframe = true;

const debugCircleMaterial2WF = new THREE.MeshBasicMaterial({
    color: 0x8080ff,
    depthTest: false,
    depthFunc: THREE.NeverDepth
});
debugCircleMaterial2WF.wireframe = true;

const debugBlackCircleMaterial = new THREE.MeshBasicMaterial({
    color: 0x000000,
    depthTest: false,
    depthFunc: THREE.NeverDepth
});

const debugBlueCircleMaterial = new THREE.MeshBasicMaterial({
    color: 0x0000ff,
    depthTest: false,
    depthFunc: THREE.NeverDepth,
    opacity: 0.75,
    transparent: true
});

const debugOrangeCircleMaterial = new THREE.MeshBasicMaterial({
    color: 0xa07000,
    depthTest: false,
    depthFunc: THREE.NeverDepth,
    opacity: 0.75,
    transparent: true
});

const textRenderStyle = new TextRenderStyle();
const textLayoutStyle = new TextLayoutStyle();

textRenderStyle.fontSize = {
    unit: FontUnit.Point,
    size: 9,
    backgroundSize: 0
};
textRenderStyle.opacity = 0.75;
textRenderStyle.backgroundOpacity = 0.75;
textRenderStyle.color = new THREE.Color(0.8, 0.2, 0.2);

// Set maximum priority.
const PRIORITY_ALWAYS = Number.MAX_SAFE_INTEGER;

class DebugGeometry {
    geometry = new THREE.BufferGeometry();
    indices = new Array<number>();
    positions = new Array<number>();
}

function addPoint(
    xPos: number,
    yPos: number,
    zPos: number,
    size: number,
    debugGeometry: DebugGeometry
) {
    debugGeometry.positions.push(xPos, yPos - size, zPos);
    debugGeometry.positions.push(xPos + size, yPos, zPos);
    debugGeometry.positions.push(xPos, yPos + size, zPos);
    debugGeometry.positions.push(xPos - size, yPos, zPos);

    const index = debugGeometry.positions.length / 3;

    debugGeometry.indices.push(index - 4);
    debugGeometry.indices.push(index - 3);
    debugGeometry.indices.push(index - 2);
    debugGeometry.indices.push(index - 4);
    debugGeometry.indices.push(index - 2);
    debugGeometry.indices.push(index - 1);
}

function addObject(
    objects: THREE.Object3D[],
    debugGeometry: DebugGeometry,
    priorityOffset: number = 0,
    factory: (geom: THREE.BufferGeometry) => THREE.Object3D
) {
    if (debugGeometry.indices.length > 0) {
        debugGeometry.geometry.addGroup(0, debugGeometry.indices.length, 0);

        debugGeometry.geometry.setAttribute(
            "position",
            new THREE.BufferAttribute(new Float32Array(debugGeometry.positions), 3)
        );

        debugGeometry.geometry.setIndex(
            new THREE.BufferAttribute(new Uint32Array(debugGeometry.indices), 1)
        );
        const mesh = factory(debugGeometry.geometry);
        mesh.renderOrder = PRIORITY_ALWAYS - priorityOffset;
        objects.push(mesh);
    }
}

export class OmvDebugLabelsTile extends Tile {
    constructor(dataSource: DataSource, tileKey: TileKey) {
        super(dataSource, tileKey);
    }

    /**
     * @override
     * Create [[TextElement]] objects for label debugging.
     */
    loadingFinished() {
        // activate in the browser with:
        // window.__debugContext.setValue("DEBUG_TEXT_PATHS", true)
        const debugTextPaths = debugContext.getValue("DEBUG_TEXT_PATHS");
        const debugTextPathsFull = debugContext.getValue("DEBUG_TEXT_PATHS_FULL");
        const debugTextPoisFull = debugContext.getValue("DEBUG_TEXT_POIS_FULL");
        const debugLineMarkers = debugContext.getValue("DEBUG_TEXT_LINE_MARKER");

        if (
            !(debugTextPaths || debugTextPathsFull || debugLineMarkers) ||
            this.decodedTile === undefined
        ) {
            return;
        }

        const tileGeometryCreator = TileGeometryCreator.instance;
        const decodedTile = this.decodedTile!;
        const colorMap = new Map<number, THREE.Color>();

        // allow limiting to specific names and/or index. There can be many paths with the
        // same text
        const textFilter = debugContext.getValue("DEBUG_TEXT_PATHS.FILTER.TEXT");
        const indexFilter = debugContext.getValue("DEBUG_TEXT_PATHS.FILTER.INDEX");
        const env = this.mapView.env;

        if (decodedTile.textPathGeometries !== undefined) {
            this.preparedTextPaths = tileGeometryCreator.prepareTextPaths(
                decodedTile.textPathGeometries,
                decodedTile
            );
        }

        const centerX = this.center.x;
        const centerY = this.center.y;
        const centerZ = this.center.z;
        const pointScale = this.mapView.pixelToWorld;
        const worldOffsetX = this.computeWorldOffsetX();
        const zHeight = 10;

        let pointLabelIndex = 0;

        if (this.textElementGroups.count() > 0) {
            const bluePoints = new DebugGeometry();
            const orangePoints = new DebugGeometry();
            const addedTextElements: TextElement[] = [];

            this.textElementGroups.forEach((textElement: TextElement) => {
                if (
                    textElement.type !== TextElementType.LineMarker &&
                    textElement.type !== TextElementType.PoiLabel
                ) {
                    return;
                }

                const isLineMarker = textElement.type === TextElementType.LineMarker;
                const geometry = isLineMarker ? orangePoints : bluePoints;
                const pointSize = pointScale * 5;

                const addLabel = (x: number, y: number, z: number) => {
                    addPoint(x, y, z, pointSize, geometry);

                    if (debugTextPoisFull || debugLineMarkers) {
                        const offsetXY = pointSize * 0.5;
                        const label: string = `${textElement.text} [${pointLabelIndex}]`;

                        const labelElement = new TextElement(
                            ContextualArabicConverter.instance.convert(label),
                            new THREE.Vector3(
                                x + worldOffsetX + centerX + offsetXY,
                                y + centerY + offsetXY,
                                z + centerZ
                            ),
                            textRenderStyle,
                            textLayoutStyle,
                            PRIORITY_ALWAYS,
                            0.0,
                            0.0
                        );
                        labelElement.minZoomLevel = 0;
                        labelElement.mayOverlap = true;
                        labelElement.reserveSpace = false;
                        labelElement.alwaysOnTop = true;
                        labelElement.ignoreDistance = true;
                        labelElement.priority = TextElement.HIGHEST_PRIORITY;

                        (labelElement as any)._isDebug = true;

                        addedTextElements.push(labelElement);
                    }

                    pointLabelIndex++;
                };

                if (textElement.path !== undefined && Array.isArray(textElement.path)) {
                    for (let i = 0; i < textElement.path.length; i++) {
                        const pos = textElement.path[i];
                        const x = pos.x - centerX;
                        const y = pos.y - centerY;
                        const z = zHeight + pos.z + i * 5 - centerZ;
                        addLabel(x, y, z);
                    }
                } else if (debugTextPoisFull) {
                    const x = textElement.position.x - centerX;
                    const y = textElement.position.y - centerY;
                    const z = 5 - centerZ;
                    addLabel(x, y, z);
                }
            });

            for (const labelElement of addedTextElements) {
                this.addTextElement(labelElement);
            }

            addObject(
                this.objects,
                bluePoints,
                0,
                (geometry: THREE.BufferGeometry): THREE.Object3D => {
                    return new THREE.Mesh(geometry, debugBlueCircleMaterial);
                }
            );
            addObject(
                this.objects,
                orangePoints,
                0,
                (geometry: THREE.BufferGeometry): THREE.Object3D => {
                    return new THREE.Mesh(geometry, debugOrangeCircleMaterial);
                }
            );
        }

        if (this.preparedTextPaths !== undefined) {
            const lines = new DebugGeometry();
            const redPoints = new DebugGeometry();
            const blackPoints = new DebugGeometry();

            let baseVertex = 0;

            for (const textPath of this.preparedTextPaths) {
                const technique = decodedTile.techniques[textPath.technique];
                if (!isTextTechnique(technique) || (textPath as any)._isDebug !== undefined) {
                    continue;
                }
                if (technique.color !== undefined) {
                    colorMap.set(
                        textPath.technique,
                        new THREE.Color(getPropertyValue(technique.color, env))
                    );
                }

                baseVertex = lines.positions.length / 3;

                const text = textPath.text;

                const elementIndex = this.preparedTextPaths.indexOf(textPath);

                const createDebugInfo =
                    (!textFilter || (text && text.includes(textFilter))) &&
                    (indexFilter === undefined || indexFilter === elementIndex);

                if (createDebugInfo) {
                    for (let i = 0; i < textPath.path.length; i += 3) {
                        const pathIndex = i / 3;
                        const x = textPath.path[i] - centerX;
                        const y = textPath.path[i + 1] - centerY;
                        // raise it a bit, so we get identify connectivity visually by tilting
                        const z = zHeight + textPath.path[i + 2] + i / 3 - centerZ;

                        if (debugTextPaths) {
                            lines.positions.push(x, y, z);
                        }

                        const isRedPoint = i === 0 && debugTextPaths;

                        if (debugTextPathsFull || isRedPoint) {
                            const pointSize = pointScale * (isRedPoint ? 6 : 4);
                            const geometry = isRedPoint ? redPoints : blackPoints;

                            addPoint(x, y, z, pointSize, geometry);

                            if (debugTextPathsFull) {
                                const xOffset = technique.xOffset ?? 0.0;
                                const yOffset = technique.yOffset ?? 0.0;
                                const minZoomLevel = technique.minZoomLevel;
                                // give point index a label
                                const label: string =
                                    pathIndex % 5 === 0
                                        ? text + ":" + pathIndex
                                        : Number(pathIndex).toString();
                                const labelElement = new TextElement(
                                    ContextualArabicConverter.instance.convert(label),
                                    new THREE.Vector3(
                                        x + worldOffsetX + centerX,
                                        y + centerY,
                                        z + centerZ
                                    ),
                                    textRenderStyle,
                                    textLayoutStyle,
                                    getPropertyValue(technique.priority ?? 0, env),
                                    xOffset,
                                    yOffset
                                );
                                labelElement.minZoomLevel = getPropertyValue(minZoomLevel, env);
                                labelElement.mayOverlap = true;
                                labelElement.reserveSpace = false;
                                labelElement.alwaysOnTop = true;
                                labelElement.ignoreDistance = true;
                                labelElement.priority = TextElement.HIGHEST_PRIORITY;
                                this.addTextElement(labelElement);
                            }
                        }
                    }

                    // the lines of a path share a common geometry
                    const N = textPath.path.length / 3;
                    for (let i = 0; i < N; ++i) {
                        if (i > 0) {
                            lines.indices.push(baseVertex + i);
                        }
                        if (i + 1 < N) {
                            lines.indices.push(baseVertex + i);
                        }
                    }
                }
            }

            addObject(
                this.objects,
                lines,
                -2,
                (geometry: THREE.BufferGeometry): THREE.Object3D => {
                    return new THREE.LineSegments(geometry, debugMaterial);
                }
            );
            addObject(
                this.objects,
                redPoints,
                0,
                (geometry: THREE.BufferGeometry): THREE.Object3D => {
                    return new THREE.Mesh(geometry, debugCircleMaterial);
                }
            );
            addObject(
                this.objects,
                blackPoints,
                -1,
                (geometry: THREE.BufferGeometry): THREE.Object3D => {
                    return new THREE.Mesh(geometry, debugBlackCircleMaterial);
                }
            );
        }
    }
}
