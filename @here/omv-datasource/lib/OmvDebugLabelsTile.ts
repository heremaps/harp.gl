/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { DecodedTile } from "@here/datasource-protocol";
import { TileKey } from "@here/geoutils/lib/tiling/TileKey";
import { DataSource, TextElement } from "@here/mapview";
import { debugContext } from "@here/mapview/lib/DebugContext";
import * as THREE from "three";
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

const debugBlackCircleMaterial = new THREE.MeshBasicMaterial({
    color: 0x000000,
    depthTest: false,
    depthFunc: THREE.NeverDepth
});

export class OmvDebugLabelsTile extends OmvTile {
    constructor(dataSource: DataSource, tileKey: TileKey) {
        super(dataSource, tileKey);
    }

    /**
     * Create [[TextElement]] objects from the given decoded [[Tile]] and list of materials.
     *
     * @param decodedTile The decoded tile.
     */
    createTextElements(decodedTile: DecodedTile) {
        super.createTextElements(decodedTile);

        const colorMap = new Map<number, THREE.Color>();
        // black color for point numbers
        const black = new THREE.Color(0);

        // activate in the browser with:
        // window.__debugContext.setValue("DEBUG_TEXT_PATHS", true)
        const debugTextPaths = debugContext.getValue("DEBUG_TEXT_PATHS");

        // allow limiting to specific names and/or index. There can be many paths with the same text
        const textFilter = debugContext.getValue("DEBUG_TEXT_PATHS.FILTER.TEXT");
        const indexFilter = debugContext.getValue("DEBUG_TEXT_PATHS.FILTER.INDEX");

        if (this.preparedTextPaths !== undefined) {
            for (const textPath of this.preparedTextPaths) {
                const technique = decodedTile.techniques[textPath.technique];
                if (technique.name !== "text") {
                    continue;
                }
                if (technique.color !== undefined) {
                    colorMap.set(textPath.technique, new THREE.Color(technique.color));
                }

                const path: THREE.Vector2[] = [];
                for (let i = 0; i < textPath.path.length; i += 2) {
                    path.push(new THREE.Vector2(textPath.path[i], textPath.path[i + 1]));
                }

                const text = textPath.text;

                if (debugTextPaths) {
                    const elementIndex = this.preparedTextPaths.indexOf(textPath);

                    const createDebugInfo =
                        (!textFilter || (text && text.indexOf(textFilter) >= 0)) &&
                        (indexFilter === undefined || indexFilter === elementIndex);

                    if (createDebugInfo) {
                        const positions = new Array<number>();
                        const indices = new Array<number>();
                        const geometry = new THREE.BufferGeometry();

                        const baseVertex = positions.length / 3;

                        for (let i = 0; i < textPath.path.length; i += 2) {
                            const pointIndex = i / 2;
                            const x = textPath.path[i];
                            const y = textPath.path[i + 1];
                            const z = i / 3; // raise it a bit, so we get identify connectivity
                            // visually by tilting
                            positions.push(x, y, z);

                            // give path point a simple geometry: a diamond
                            const circleGeometry = new THREE.CircleGeometry(2, 4);
                            circleGeometry.translate(x, y, z);
                            const cmesh = new THREE.Mesh(
                                circleGeometry,
                                i > 0 ? debugCircleMaterial : debugBlackCircleMaterial
                            );
                            cmesh.renderOrder = 3000 - i;
                            this.objects.push(cmesh);

                            // give point index a label
                            const label: string =
                                pointIndex % 5 === 0
                                    ? text + ":" + pointIndex
                                    : Number(pointIndex).toString();
                            const labelElement = new TextElement(
                                label,
                                new THREE.Vector3(x, y, z),
                                technique.priority || 0,
                                technique.scale || 1.0,
                                technique.xOffset || 0.0,
                                technique.yOffset || 0.0
                            );
                            labelElement.color = black;
                            labelElement.minZoomLevel = technique.minZoomLevel;
                            labelElement.mayOverlap = true;
                            labelElement.reserveSpace = false;
                            labelElement.alwaysOnTop = true;
                            labelElement.ignoreDistance = true;
                            this.addUserTextElement(labelElement);
                        }

                        // the lines of a path share a common geometry
                        const N = textPath.path.length / 2;
                        for (let i = 0; i < N; ++i) {
                            if (i > 0) {
                                indices.push(baseVertex + i);
                            }
                            if (i + 1 < N) {
                                indices.push(baseVertex + i);
                            }
                        }

                        geometry.addGroup(0, indices.length, 0);
                        geometry.addAttribute(
                            "position",
                            new THREE.BufferAttribute(new Float32Array(positions), 3)
                        );
                        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
                        const mesh = new THREE.LineSegments(geometry, debugMaterial);
                        mesh.renderOrder = 2000;
                        this.objects.push(mesh);
                    }
                }
            }
        }
    }

    /**
     * Create the geometries for the decoded [[Tile]].
     *
     * @param decodedTile The decoded tile.
     */
    createGeometries(decodedTile: DecodedTile) {
        super.createGeometries(decodedTile);
    }
}
