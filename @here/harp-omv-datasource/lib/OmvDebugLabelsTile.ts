/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { getPropertyValue, isTextTechnique } from "@here/harp-datasource-protocol";
import { TileKey } from "@here/harp-geoutils/lib/tiling/TileKey";
import { DataSource, TextElement } from "@here/harp-mapview";
import { debugContext } from "@here/harp-mapview/lib/DebugContext";
import {
    ContextualArabicConverter,
    FontUnit,
    TextLayoutStyle,
    TextRenderStyle
} from "@here/harp-text-canvas";
import * as THREE from "three";

import { TileGeometryCreator } from "@here/harp-mapview/lib/geometry/TileGeometryCreator";
import { OmvTile } from "./OmvTile";

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

export class OmvDebugLabelsTile extends OmvTile {
    constructor(dataSource: DataSource, tileKey: TileKey) {
        super(dataSource, tileKey);
    }

    /** @override */
    loadingFinished() {
        this.addLabelDebugInfo();
    }

    /**
     * Create [[TextElement]] objects from the given decoded [[Tile]] and list of materials.
     */
    private addLabelDebugInfo() {
        // activate in the browser with:
        // window.__debugContext.setValue("DEBUG_TEXT_PATHS", true)
        const debugTextPaths = debugContext.getValue("DEBUG_TEXT_PATHS");
        const debugTextPathsFull = debugContext.getValue("DEBUG_TEXT_PATHS_FULL");
        const debugTextPoisFull = debugContext.getValue("DEBUG_TEXT_POIS_FULL");

        if (!(debugTextPaths || debugTextPathsFull) || this.decodedTile === undefined) {
            return;
        }

        const tileGeometryCreator = TileGeometryCreator.instance;
        const decodedTile = this.decodedTile!;

        tileGeometryCreator.createTextElements(this, decodedTile);

        const colorMap = new Map<number, THREE.Color>();

        // allow limiting to specific names and/or index. There can be many paths with the same text
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

        let pointLabelIndex = 0;

        if (this.textElementGroups.count() > 0) {
            const bluePointGeometry = new THREE.BufferGeometry();
            const bluePointIndices = new Array<number>();
            const bluePointPositions = new Array<number>();

            const addedTextElements: TextElement[] = [];

            this.textElementGroups.forEach((textElement: TextElement) => {
                if (textElement.path !== undefined) {
                    return;
                }

                const x = textElement.position.x - centerX;
                const y = textElement.position.y - centerY;
                const z = 5 - centerZ;

                // bluePointIndices.push(bluePointPositions.length / 3);
                // bluePointPositions.push(x, y, z);

                const pointSize = pointScale * 3;

                bluePointPositions.push(x, y - pointSize, z);
                bluePointPositions.push(x + pointSize, y, z);
                bluePointPositions.push(x, y + pointSize, z);
                bluePointPositions.push(x - pointSize, y, z);

                const pointIndex = bluePointPositions.length / 3;

                bluePointIndices.push(pointIndex - 4);
                bluePointIndices.push(pointIndex - 3);
                bluePointIndices.push(pointIndex - 2);
                bluePointIndices.push(pointIndex - 4);
                bluePointIndices.push(pointIndex - 2);
                bluePointIndices.push(pointIndex - 1);

                if (debugTextPoisFull) {
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
            });

            for (const labelElement of addedTextElements) {
                this.addTextElement(labelElement);
            }

            if (bluePointIndices.length > 0) {
                bluePointGeometry.addGroup(0, bluePointIndices.length, 0);

                bluePointGeometry.setAttribute(
                    "position",
                    new THREE.BufferAttribute(new Float32Array(bluePointPositions), 3)
                );

                bluePointGeometry.setIndex(
                    new THREE.BufferAttribute(new Uint32Array(bluePointIndices), 1)
                );
                const bluePointMesh = new THREE.Mesh(bluePointGeometry, debugBlueCircleMaterial);
                bluePointMesh.renderOrder = PRIORITY_ALWAYS;
                this.objects.push(bluePointMesh);
            }
        }

        if (this.preparedTextPaths !== undefined) {
            const lineGeometry = new THREE.BufferGeometry();
            const lineIndices = new Array<number>();
            const linePositions = new Array<number>();

            const redPointGeometry = new THREE.BufferGeometry();
            const redPointIndices = new Array<number>();
            const redPointPositions = new Array<number>();

            const blackPointGeometry = new THREE.BufferGeometry();
            const blackPointIndices = new Array<number>();
            const blackPointPositions = new Array<number>();

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

                baseVertex = linePositions.length / 3;

                const text = textPath.text;

                const elementIndex = this.preparedTextPaths.indexOf(textPath);

                const createDebugInfo =
                    (!textFilter || (text && text.indexOf(textFilter) >= 0)) &&
                    (indexFilter === undefined || indexFilter === elementIndex);

                if (createDebugInfo) {
                    const zHeight = 10;

                    for (let i = 0; i < textPath.path.length; i += 3) {
                        const pathIndex = i / 3;
                        const x = textPath.path[i] - centerX;
                        const y = textPath.path[i + 1] - centerY;
                        // raise it a bit, so we get identify connectivity visually by tilting
                        const z = zHeight + textPath.path[i + 2] + i / 3 - centerZ;

                        if (debugTextPaths) {
                            linePositions.push(x, y, z);
                        }

                        const isRedPoint = i === 0;

                        if (debugTextPathsFull || isRedPoint) {
                            const pointSize = pointScale * (isRedPoint ? 6 : 4);

                            const positions = isRedPoint ? redPointPositions : blackPointPositions;
                            const indices = isRedPoint ? redPointIndices : blackPointIndices;

                            positions.push(x, y - pointSize, z);
                            positions.push(x + pointSize, y, z);
                            positions.push(x, y + pointSize, z);
                            positions.push(x - pointSize, y, z);

                            const pointIndex = positions.length / 3;

                            indices.push(pointIndex - 4);
                            indices.push(pointIndex - 3);
                            indices.push(pointIndex - 2);
                            indices.push(pointIndex - 4);
                            indices.push(pointIndex - 2);
                            indices.push(pointIndex - 1);

                            if (debugTextPathsFull) {
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
                                    getPropertyValue(technique.priority || 0, env),
                                    technique.xOffset || 0.0,
                                    technique.yOffset || 0.0
                                );
                                labelElement.minZoomLevel = technique.minZoomLevel;
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
                            lineIndices.push(baseVertex + i);
                        }
                        if (i + 1 < N) {
                            lineIndices.push(baseVertex + i);
                        }
                    }
                }
            }

            if (lineIndices.length > 0) {
                lineGeometry.addGroup(0, lineIndices.length, 0);

                lineGeometry.setAttribute(
                    "position",
                    new THREE.BufferAttribute(new Float32Array(linePositions), 3)
                );

                lineGeometry.setIndex(new THREE.BufferAttribute(new Uint32Array(lineIndices), 1));
                const lineMesh = new THREE.LineSegments(lineGeometry, debugMaterial);
                lineMesh.renderOrder = PRIORITY_ALWAYS - 2;
                this.objects.push(lineMesh);
            }

            if (redPointIndices.length > 0) {
                redPointGeometry.addGroup(0, redPointIndices.length, 0);

                redPointGeometry.setAttribute(
                    "position",
                    new THREE.BufferAttribute(new Float32Array(redPointPositions), 3)
                );

                redPointGeometry.setIndex(
                    new THREE.BufferAttribute(new Uint32Array(redPointIndices), 1)
                );
                const redPointMesh = new THREE.Mesh(redPointGeometry, debugCircleMaterial);
                redPointMesh.renderOrder = PRIORITY_ALWAYS;
                this.objects.push(redPointMesh);
            }

            if (blackPointIndices.length > 0) {
                blackPointGeometry.addGroup(0, blackPointIndices.length, 0);

                blackPointGeometry.setAttribute(
                    "position",
                    new THREE.BufferAttribute(new Float32Array(blackPointPositions), 3)
                );

                blackPointGeometry.setIndex(
                    new THREE.BufferAttribute(new Uint32Array(blackPointIndices), 1)
                );
                const blackPointMesh = new THREE.Mesh(blackPointGeometry, debugBlackCircleMaterial);
                blackPointMesh.renderOrder = PRIORITY_ALWAYS - 1;
                this.objects.push(blackPointMesh);
            }
        }
    }
}
