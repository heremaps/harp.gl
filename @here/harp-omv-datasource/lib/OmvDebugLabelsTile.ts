/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
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
    linewidth: 2,
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

const textRenderStyle = new TextRenderStyle();
const textLayoutStyle = new TextLayoutStyle();

textRenderStyle.fontSize = {
    unit: FontUnit.Point,
    size: 9,
    backgroundSize: 0
};
textRenderStyle.opacity = 0.75;
textRenderStyle.backgroundOpacity = 0.75;

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
        const env = this.mapView.mapEnv;

        if (decodedTile.textPathGeometries !== undefined) {
            this.preparedTextPaths = tileGeometryCreator.prepareTextPaths(
                decodedTile.textPathGeometries,
                decodedTile
            );
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
            const pointScale = this.mapView.pixelToWorld;
            const worldOffsetX = this.computeWorldOffsetX();

            for (const textPath of this.preparedTextPaths) {
                const technique = decodedTile.techniques[textPath.technique];
                if (!isTextTechnique(technique)) {
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
                    for (let i = 0; i < textPath.path.length; i += 3) {
                        const pathIndex = i / 3;
                        const x = textPath.path[i];
                        const y = textPath.path[i + 1];
                        // raise it a bit, so we get identify connectivity visually by tilting
                        const z = textPath.path[i + 2] + i / 3;

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
                                    new THREE.Vector3(x + worldOffsetX, y, z),
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
                                this.addUserTextElement(labelElement);
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
                lineMesh.renderOrder = 2000;
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
                redPointMesh.renderOrder = 3000;
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
                blackPointMesh.renderOrder = 2500;
                this.objects.push(blackPointMesh);
            }
        }
    }
}
