/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { mercatorProjection } from "@here/harp-geoutils";
import { SolidLineMaterial, SolidLineMaterialParameters } from "@here/harp-materials";
import { RenderingTestHelper } from "@here/harp-test-utils";
import * as THREE from "three";

import { createLineGeometry, LineGroup } from "../../lib/Lines";

function createFakeDisplacementMap(sideSize: number): THREE.DataTexture {
    const array = new Float32Array(sideSize * sideSize);

    for (let y = 0; y < sideSize; y++) {
        for (let x = 0; x < sideSize; x++) {
            const index = y * sideSize + x;

            array[index] =
                (sideSize / 2) *
                Math.sin((2 * Math.PI * x) / sideSize + Math.PI / 2) *
                Math.sin((2 * Math.PI * y) / sideSize + Math.PI / 2);
        }
    }

    return new THREE.DataTexture(array, sideSize, sideSize, THREE.LuminanceFormat, THREE.FloatType);
}

function createPerspectiveCamera(width: number, height: number): THREE.PerspectiveCamera {
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 4000);
    camera.position.set(0, height, height);
    camera.lookAt(new THREE.Vector3(0, 0, 0));

    return camera;
}

describe("Rendering lines: ", function () {
    const maxColumnCount = 3;
    const cellSize = 150;

    let canvas: HTMLCanvasElement;
    let webglRenderer: THREE.WebGLRenderer;

    beforeEach(() => {
        canvas = document.createElement("canvas");
        // Enable backward compatibility with three.js <= 0.117
        webglRenderer = new ((THREE as any).WebGL1Renderer ?? THREE.WebGLRenderer)({ canvas });
    });

    afterEach(() => {
        if (webglRenderer !== undefined) {
            webglRenderer.dispose();
        }
    });

    interface TestLineParams {
        name: string;
        points: number[];
    }

    const linesConfig: TestLineParams[] = [
        {
            name: "straight line 2 points",
            points: [-50, 0, 10, 50, 0, 10]
        },
        {
            name: "straight line 3 points",
            points: [-50, 0, 10, 0, 0, 10, 50, 0, 10]
        },
        {
            name: "line at right angle - left",
            points: [-50, 0, 10, 0, 0, 10, 0, 50, 10]
        },
        {
            name: "line at right angle - right",
            points: [-50, 0, 10, 0, 0, 10, 0, -50, 10]
        },
        {
            name: "line at acute angle - left",
            points: [-50, 0, 10, 0, 0, 10, -50, 10, 10]
        },
        {
            name: "line at acute angle - right",
            points: [-50, 0, 10, 0, 0, 10, -50, -10, 10]
        },
        {
            name: "line at obtuse angle - left",
            points: [-50, 0, 10, 0, 0, 10, 50, 50, 10]
        },
        {
            name: "line at obtuse angle - right",
            points: [-50, 0, 10, 0, 0, 10, 50, -50, 10]
        },
        {
            name: "lines that cross",
            points: [-50, 0, 0, 50, 0, 0, 0, 50, 0, 0, -50, 0]
        }
    ];

    const displacedLinesConfig: TestLineParams[] = [
        {
            name: "straight line 15 points",
            // prettier-ignore
            points: [-70, 0, 0,
                -60, 0, 0,
                -50, 0, 0,
                -40, 0, 0,
                -30, 0, 0,
                -20, 0, 0,
                -10, 0, 0,
                0, 0, 0,
                10, 0, 0,
                20, 0, 0,
                30, 0, 0,
                40, 0, 0,
                50, 0, 0,
                60, 0, 0,
                70, 0, 0]
        },
        {
            name: "line at right angle - right",
            // prettier-ignore
            points: [-70, -70, 0,
                -70, -60, 0,
                -70, -50, 0,
                -70, -40, 0,
                -70, -30, 0,
                -70, -20, 0,
                -70, -10, 0,
                -70, 0, 0,
                -60, 0, 0,
                -50, 0, 0,
                -40, 0, 0,
                -30, 0, 0,
                -20, 0, 0,
                -10, 0, 0,
                0, 0, 0]
        },
        {
            name: "line at right angle - left",
            // prettier-ignore
            points: [-70, 0, 0,
                -60, 0, 0,
                -50, 0, 0,
                -40, 0, 0,
                -30, 0, 0,
                -20, 0, 0,
                -10, 0, 0,
                0, 0, 0,
                0, 10,0,
                0, 20,0,
                0, 30,0,
                0, 40,0,
                0, 50,0,
                0, 60,0,
                0, 70, 0]
        }
    ];

    const checkOverDrawLines: TestLineParams[] = [
        {
            name: "straight line 3 points",
            points: [-50, 0, 0, 0, 0, 0, 50, 0, 0]
        },
        {
            name: "line 3 points - left: 1",
            points: [-50, 0, 0, 0, 0, 0, 50, 1, 0]
        },
        {
            name: "line 3 points - right: -1",
            points: [-50, 0, 0, 0, 0, 0, 50, -1, 0]
        },
        {
            name: "line 3 points - left: 2",
            points: [-50, 0, 0, 0, 0, 0, 50, 2, 0]
        },
        {
            name: "line 3 points - right: -2",
            points: [-50, 0, 0, 0, 0, 0, 50, -2, 0]
        },
        {
            name: "line 3 points - left: 5",
            points: [-50, 0, 0, 0, 0, 0, 50, 5, 0]
        },
        {
            name: "line 3 points - right: -5",
            points: [-50, 0, 0, 0, 0, 0, 50, -5, 0]
        },
        {
            name: "line 3 points - left: 10",
            points: [-50, 0, 0, 0, 0, 0, 50, 10, 0]
        },
        {
            name: "line 3 point - right: -10",
            points: [-50, 0, 0, 0, 0, 0, 50, -10, 0]
        },
        {
            name: "line 3 points - right: -3",
            points: [-50, 0, 0, 0, 0, 0, 0, 3, 0]
        },
        {
            name: "line 3 points - right: -3",
            points: [-50, 0, 0, 0, 0, 0, 0, -3, 0]
        },
        {
            name: "lines that cross",
            points: [-50, 0, 0, 50, 0, 0, 0, 50, 0, 0, -50, 0]
        }
    ];

    function getCanvasSize(config: TestLineParams[]): { width: number; height: number } {
        const ConfigCasesNum = config.length;
        const rowCount = Math.ceil(ConfigCasesNum / maxColumnCount);
        return { width: maxColumnCount * cellSize, height: rowCount * cellSize };
    }
    async function renderLines(
        config: TestLineParams[],
        context: Mocha.Context,
        name: string,
        lineStyle: SolidLineMaterialParameters,
        camera?: THREE.Camera
    ) {
        const scene = new THREE.Scene();

        const canvasSize = getCanvasSize(config);
        webglRenderer.setSize(canvasSize.width, canvasSize.height);

        if (!camera) {
            const orthoCamera = new THREE.OrthographicCamera(
                -canvas.width / 2.0,
                canvas.width / 2.0,
                canvas.height / 2.0,
                -canvas.height / 2.0
            );
            orthoCamera.position.z = 11.0;
            orthoCamera.near = 0.0;
            camera = orthoCamera;
        }

        let step: number = 0;
        let row: number;
        let column: number;
        const halfCellSize = cellSize / 2;

        for (const test of config) {
            const lineParams = lineStyle;
            let uvs: number[] | undefined;
            if (lineParams.displacementMap) {
                uvs = [];
                for (let i = 0; i < test.points.length; i += 3) {
                    uvs.push(test.points[i] / cellSize + 0.5, test.points[i + 1] / cellSize + 0.5);
                }
            }
            lineParams.rendererCapabilities = { isWebGL2: false } as any;
            const material = new SolidLineMaterial(lineParams);
            const lineGeometry = createLineGeometry(
                new THREE.Vector3(),
                test.points,
                mercatorProjection,
                undefined,
                uvs
            );
            const geometry = new THREE.BufferGeometry();

            const hasNormalsAndUvs = uvs !== undefined;
            LineGroup.createGeometry(
                lineGeometry.vertices,
                lineGeometry.vertexColors,
                lineGeometry.indices,
                geometry,
                hasNormalsAndUvs
            );

            const mesh = new THREE.Mesh(geometry, material);
            column = cellSize * (step % maxColumnCount) + halfCellSize;
            row = canvas.height - cellSize * Math.floor(step / maxColumnCount) - halfCellSize;
            mesh.position.set(column, row, 0);
            if (lineParams.displacementMap) {
                (mesh.material as SolidLineMaterial).displacementMap = lineParams.displacementMap;
            }

            step += 1;
            scene.add(mesh);
        }

        scene.position.set(-canvas.width / 2, -canvas.height / 2, 0);
        webglRenderer.setClearColor(0x000000, 0.0);

        webglRenderer.render(scene, camera);
        const ibct = new RenderingTestHelper(context, { module: "webglrenderer" });
        await ibct.assertCanvasMatchesReference(canvas, `${name}`);
    }

    it("renders solid lines - lineWidth: 2", async function (this: Mocha.Context) {
        const lineStyle = {
            lineWidth: 2,
            color: "#FFF",
            rendererCapabilities: webglRenderer.capabilities
        };
        await renderLines(linesConfig, this, "solid-lines-1px", lineStyle);
    });

    it("renders solid lines - lineWidth: 2 - offset: 2", async function (this: Mocha.Context) {
        const lineStyle = {
            lineWidth: 2,
            color: "#FFF",
            offset: 2,
            rendererCapabilities: webglRenderer.capabilities
        };
        await renderLines(linesConfig, this, "solid-lines-1px-offset-2", lineStyle);
    });

    it("renders solid lines - lineWidth: 2 - offset: -2", async function (this: Mocha.Context) {
        const lineStyle = {
            lineWidth: 2,
            color: "#FFF",
            offset: -2,
            rendererCapabilities: webglRenderer.capabilities
        };
        await renderLines(linesConfig, this, "solid-lines-1px-offset--2", lineStyle);
    });

    it("renders undisplaced solid lines - perspective camera", async function (this: Mocha.Context) {
        const config = displacedLinesConfig;
        const { width, height } = getCanvasSize(config);
        const camera = createPerspectiveCamera(width, height);

        const lineStyle = {
            lineWidth: 2,
            color: "#FFF",
            rendererCapabilities: webglRenderer.capabilities
        };
        await renderLines(config, this, "undisplaced-solid-lines-persective", lineStyle, camera);
    });

    it("renders displaced solid lines - perspective camera", async function (this: Mocha.Context) {
        const config = displacedLinesConfig;
        const { width, height } = getCanvasSize(config);
        const camera = createPerspectiveCamera(width, height);

        const displacementMap: THREE.Texture = createFakeDisplacementMap(cellSize);
        const lineStyle = {
            lineWidth: 2,
            color: "#FFF",
            displacementMap,
            rendererCapabilities: webglRenderer.capabilities
        };
        await renderLines(config, this, "displaced-solid-lines-persective", lineStyle, camera);
    });

    it("renders solid lines - lineWidth: 20", async function (this: Mocha.Context) {
        const lineStyle = {
            lineWidth: 40,
            color: "#FFF",
            rendererCapabilities: webglRenderer.capabilities
        };
        await renderLines(linesConfig, this, "solid-lines-20px", lineStyle);
    });

    it("renders solid lines with outline - outlineWidth: 5", async function (this: Mocha.Context) {
        const lineStyle = {
            lineWidth: 20,
            color: "#F00",
            outlineWidth: 5,
            outlineColor: "#0F0",
            rendererCapabilities: webglRenderer.capabilities
        };
        await renderLines(linesConfig, this, "solid-lines-outline", lineStyle);
    });

    it("renders dashed lines with outline - outlineWidth: 3, dashSize: 4", async function (this: Mocha.Context) {
        const lineStyle = {
            lineWidth: 8,
            color: "#F00",
            gapSize: 4,
            dashSize: 4,
            dashColor: "#00F",
            outlineWidth: 3,
            outlineColor: "#0F0",
            rendererCapabilities: webglRenderer.capabilities
        };
        await renderLines(linesConfig, this, "dashed-lines-outline", lineStyle);
    });

    it("renders dashed lines with outline - transparent", async function (this: Mocha.Context) {
        const lineStyle = {
            lineWidth: 8,
            color: "#F00",
            gapSize: 4,
            dashSize: 4,
            outlineWidth: 3,
            outlineColor: "#0F0",
            rendererCapabilities: webglRenderer.capabilities
        };
        await renderLines(linesConfig, this, "dashed-lines-outline-alpha", lineStyle);
    });

    it("renders dashed lines - lineWidth: 2, gapSize: 2, dashSize: 2", async function (this: Mocha.Context) {
        const lineStyle = {
            lineWidth: 2,
            color: "#FFF",
            gapSize: 2,
            dashSize: 2,
            rendererCapabilities: webglRenderer.capabilities
        };
        await renderLines(linesConfig, this, "dashed-lines-1px", lineStyle);
    });

    it("renders dashed lines with dashColor: #F00", async function (this: Mocha.Context) {
        const lineStyle = {
            lineWidth: 2,
            color: "#FFF",
            gapSize: 2,
            dashSize: 2,
            dashColor: "#0F0",
            rendererCapabilities: webglRenderer.capabilities
        };
        await renderLines(linesConfig, this, "dashed-lines-color", lineStyle);
    });

    it("renders dashed lines - lineWidth: 20,gapSize: 2, dashSize: 2", async function (this: Mocha.Context) {
        const lineStyle = {
            lineWidth: 40,
            color: "#FFF",
            gapSize: 2,
            dashSize: 2,
            rendererCapabilities: webglRenderer.capabilities
        };
        await renderLines(linesConfig, this, "dashed-lines-20px", lineStyle);
    });

    it("renders solid lines - overdraw check", async function (this: Mocha.Context) {
        const lineStyle = {
            lineWidth: 40,
            color: "#FFF",
            opacity: 0.5,
            transparent: true,
            rendererCapabilities: webglRenderer.capabilities
        };
        await renderLines(checkOverDrawLines, this, "solid-lines-overdraw-20px", lineStyle);
    });

    it("renders dashed lines - overdraw check", async function (this: Mocha.Context) {
        const lineStyle = {
            lineWidth: 40,
            color: "#FFF",
            opacity: 0.5,
            transparent: true,
            gapSize: 2,
            dashSize: 2,
            rendererCapabilities: webglRenderer.capabilities
        };
        await renderLines(checkOverDrawLines, this, "dashed-lines-overdraw-20px", lineStyle);
    });

    it("renders dashed lines with round dashes - no outline, dashSize: 16", async function (this: Mocha.Context) {
        const lineStyle = {
            dashes: "Round",
            lineWidth: 16,
            color: "#F00",
            gapSize: 16,
            dashSize: 16,
            dashColor: "#00F",
            rendererCapabilities: webglRenderer.capabilities
        };
        await renderLines(
            linesConfig,
            this,
            "dashed-lines-round-no-outline",
            lineStyle as SolidLineMaterialParameters
        );
    });

    it("renders dashed lines with round dashes - outlineWidth: 3, dashSize: 16", async function (this: Mocha.Context) {
        const lineStyle = {
            dashes: "Round",
            lineWidth: 16,
            color: "#F00",
            gapSize: 16,
            dashSize: 16,
            dashColor: "#00F",
            outlineWidth: 3,
            outlineColor: "#0F0",
            rendererCapabilities: webglRenderer.capabilities
        };
        await renderLines(
            linesConfig,
            this,
            "dashed-lines-round-outline",
            lineStyle as SolidLineMaterialParameters
        );
    });

    it("renders dashed lines with diamond dashes - no outline, dashSize: 16", async function (this: Mocha.Context) {
        const lineStyle = {
            dashes: "Diamond",
            lineWidth: 16,
            color: "#F00",
            gapSize: 16,
            dashSize: 16,
            dashColor: "#00F",
            rendererCapabilities: webglRenderer.capabilities
        };
        await renderLines(
            linesConfig,
            this,
            "dashed-lines-diamond-no-outline",
            lineStyle as SolidLineMaterialParameters
        );
    });

    it("renders dashed lines w/ diamond dashes - outlineWidth: 3, dashSize: 16", async function (this: Mocha.Context) {
        const lineStyle = {
            dashes: "Diamond",
            lineWidth: 16,
            color: "#F00",
            gapSize: 16,
            dashSize: 16,
            dashColor: "#00F",
            outlineWidth: 3,
            outlineColor: "#0F0",
            rendererCapabilities: webglRenderer.capabilities
        };
        await renderLines(
            linesConfig,
            this,
            "dashed-lines-diamond-outline",
            lineStyle as SolidLineMaterialParameters
        );
    });

    it("renders dashed lines with stretched diamond dashes", async function (this: Mocha.Context) {
        const lineStyle = {
            dashes: "Diamond",
            lineWidth: 16,
            color: "#F00",
            gapSize: 0.01,
            dashSize: 32,
            dashColor: "#00F",
            rendererCapabilities: webglRenderer.capabilities
        };
        await renderLines(
            linesConfig,
            this,
            "dashed-lines-diamond-stretched",
            lineStyle as SolidLineMaterialParameters
        );
    });

    it("renders solid lines - caps check round", async function (this: Mocha.Context) {
        const lineStyle = {
            lineWidth: 40,
            color: "#FFF",
            opacity: 0.5,
            transparent: true,
            caps: "Round",
            rendererCapabilities: webglRenderer.capabilities
        };
        await renderLines(
            linesConfig,
            this,
            "solid-lines-caps-round-20px",
            lineStyle as SolidLineMaterialParameters
        );
    });

    it("renders solid lines - caps check none", async function (this: Mocha.Context) {
        const lineStyle = {
            lineWidth: 40,
            color: "#FFF",
            opacity: 0.5,
            transparent: true,
            caps: "None",
            rendererCapabilities: webglRenderer.capabilities
        };
        await renderLines(
            linesConfig,
            this,
            "solid-lines-caps-none-20px",
            lineStyle as SolidLineMaterialParameters
        );
    });

    it("renders solid lines - caps check square", async function (this: Mocha.Context) {
        const lineStyle = {
            lineWidth: 40,
            color: "#FFF",
            opacity: 0.5,
            transparent: true,
            caps: "Square",
            rendererCapabilities: webglRenderer.capabilities
        };
        await renderLines(
            linesConfig,
            this,
            "solid-lines-caps-square-20px",
            lineStyle as SolidLineMaterialParameters
        );
    });

    it("renders solid lines - caps check triangle out", async function (this: Mocha.Context) {
        const lineStyle = {
            lineWidth: 40,
            color: "#FFF",
            opacity: 0.5,
            transparent: true,
            caps: "TriangleOut",
            rendererCapabilities: webglRenderer.capabilities
        };
        await renderLines(
            linesConfig,
            this,
            "solid-lines-caps-triangle-out-20px",
            lineStyle as SolidLineMaterialParameters
        );
    });

    it("renders solid lines - caps check triangle in", async function (this: Mocha.Context) {
        const lineStyle = {
            lineWidth: 40,
            color: "#FFF",
            opacity: 0.5,
            transparent: true,
            caps: "TriangleIn",
            rendererCapabilities: webglRenderer.capabilities
        };
        await renderLines(
            linesConfig,
            this,
            "solid-lines-caps-triangle-in-20px",
            lineStyle as SolidLineMaterialParameters
        );
    });
});
