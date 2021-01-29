/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Attachment,
    DecodedTile,
    GeometryType,
    IndexedTechnique,
    MapEnv,
    StyleSet
} from "@here/harp-datasource-protocol";
import { StyleSetEvaluator, ThreeBufferUtils } from "@here/harp-datasource-protocol/index-decoder";
import { ViewRanges } from "@here/harp-datasource-protocol/lib/ViewRanges";
import {
    mercatorProjection,
    TileKey,
    TilingScheme,
    webMercatorTilingScheme
} from "@here/harp-geoutils";
import { MapMeshBasicMaterial } from "@here/harp-materials";
import { assert, expect } from "chai";
import * as sinon from "sinon";
import * as THREE from "three";
import { RawShaderMaterial } from "three";

import { DataSource } from "../lib/DataSource";
import { isDepthPrePassMesh } from "../lib/DepthPrePass";
import { DisplacementMap } from "../lib/DisplacementMap";
import { TileGeometryCreator } from "../lib/geometry/TileGeometryCreator";
import { MapObjectAdapter } from "../lib/MapObjectAdapter";
import { Tile } from "../lib/Tile";

class FakeMapView {
    private readonly m_scene = new THREE.Scene();
    private readonly m_renderer = { capabilities: { isWebGL2: false } };

    get zoomLevel(): number {
        return 0;
    }

    get viewRanges(): ViewRanges {
        return { near: 0, far: 0, minimum: 0, maximum: 0 };
    }

    get clearColor(): number {
        return 0;
    }

    get animatedExtrusionHandler() {
        return undefined;
    }

    get scene() {
        return this.m_scene;
    }

    get projection() {
        return mercatorProjection;
    }

    get renderer() {
        return this.m_renderer;
    }
}

class MockDataSource extends DataSource {
    /** @override */
    getTilingScheme(): TilingScheme {
        throw new Error("Method not implemented.");
    }

    /** @override */
    getTile(tileKey: TileKey): Tile | undefined {
        throw new Error("Method not implemented.");
    }
}

function getExtrudedPolygonTile(): DecodedTile {
    return {
        geometries: [
            {
                type: GeometryType.Polygon,
                vertexAttributes: [
                    {
                        name: "position",
                        buffer: new Float32Array([1.0, 2.0, 3.0]),
                        type: "float",
                        itemCount: 3
                    }
                ],
                groups: [{ start: 0, count: 1, technique: 0, createdOffsets: [] }],
                edgeIndex: {
                    name: "index",
                    buffer: new Uint16Array([0]),
                    type: "float",
                    itemCount: 1
                }
            }
        ],
        techniques: [
            {
                name: "extruded-polygon",
                lineWidth: 0,
                opacity: 0.1,
                renderOrder: 0,
                _index: 0,
                _styleSetIndex: 0
            }
        ]
    };
}

function getFillTile(): DecodedTile {
    return {
        geometries: [
            {
                type: GeometryType.Polygon,
                vertexAttributes: [
                    {
                        name: "position",
                        buffer: new Float32Array([1.0, 2.0, 3.0]),
                        type: "float",
                        itemCount: 3
                    }
                ],
                groups: [{ start: 0, count: 1, technique: 0, createdOffsets: [] }],
                edgeIndex: {
                    name: "index",
                    buffer: new Uint16Array([0]),
                    type: "float",
                    itemCount: 1
                }
            }
        ],
        techniques: [
            {
                name: "fill",
                renderOrder: 0,
                _index: 0,
                _styleSetIndex: 0
            }
        ]
    };
}

function getSolidLineTile(): DecodedTile {
    return {
        geometries: [
            {
                type: GeometryType.Polygon,
                vertexAttributes: [],
                groups: [{ start: 0, count: 1, technique: 0, createdOffsets: [] }]
            }
        ],
        techniques: [
            {
                name: "solid-line",
                color: "red",
                lineWidth: 1,
                renderOrder: 0,
                _index: 0,
                _styleSetIndex: 0
            }
        ]
    };
}

function checkGlslVersion(objects: THREE.Object3D[], isWebGL2: boolean) {
    const expectedVersion = isWebGL2 ? THREE.GLSL3 : THREE.GLSL1;
    objects.forEach(object => {
        const material = (object as any).material;
        if (material instanceof RawShaderMaterial) {
            assert.equal(material.glslVersion, expectedVersion);
        }
    });
}

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

describe("TileGeometryCreator", () => {
    let mockDatasource: sinon.SinonStubbedInstance<MockDataSource>;
    let newTile: Tile;
    const tgc = TileGeometryCreator.instance;
    let mapView: FakeMapView;
    const sandbox = sinon.createSandbox();

    beforeEach(function () {
        mapView = new FakeMapView();
        mockDatasource = sandbox.createStubInstance(MockDataSource);
        mockDatasource.getTilingScheme.callsFake(() => webMercatorTilingScheme);
        sandbox.stub(mockDatasource, "projection").get(() => mercatorProjection);
        sandbox.stub(mockDatasource, "mapView").get(() => mapView);
        newTile = new Tile(
            (mockDatasource as unknown) as DataSource,
            TileKey.fromRowColumnLevel(0, 0, 0)
        );
    });

    afterEach(function () {
        sandbox.restore();
    });

    it("add label blocking elements", () => {
        const decodedTile: DecodedTile = {
            pathGeometries: [{ path: [new THREE.Vector3(1, 1, 1), new THREE.Vector3(2, 2, 2)] }],
            geometries: [],
            techniques: []
        };
        tgc.createLabelRejectionElements(newTile, decodedTile);
        // There should one line with two points.
        assert.equal(newTile.blockingElements.length, 1);
        assert.equal(newTile.blockingElements[0].points.length, 2);
    });

    it("terrain tile gets tile displacement map as user data", () => {
        const decodedDisplacementMap: DisplacementMap = {
            xCountVertices: 2,
            yCountVertices: 3,
            buffer: new Float32Array()
        };
        const decodedTile: DecodedTile = {
            geometries: [
                {
                    type: GeometryType.Polygon,
                    vertexAttributes: [],
                    groups: [{ start: 0, count: 1, technique: 0, createdOffsets: [] }],
                    objInfos: [decodedDisplacementMap]
                }
            ],
            techniques: [{ name: "terrain", renderOrder: 0, _index: 0, _styleSetIndex: 0 }]
        };
        tgc.createObjects(newTile, decodedTile);
        assert.equal(newTile.objects.length, 1);
        const userData = newTile.objects[0].userData;
        expect(userData).to.be.an("object");

        expect(userData).to.have.property("displacementMap");
        assert.strictEqual(userData.displacementMap, decodedDisplacementMap);

        expect(userData).to.have.property("texture");
        expect(userData.texture).to.be.an.instanceOf(THREE.DataTexture);
        const imageData: ImageData = (userData.texture as THREE.DataTexture).image;
        assert.equal(imageData.width, decodedDisplacementMap.xCountVertices);
        assert.equal(imageData.height, decodedDisplacementMap.yCountVertices);
    });

    for (const isWebGL2 of [false, true]) {
        const webGLVersion = isWebGL2 ? "WebGL2" : "WebGL1";

        describe(`${webGLVersion} support`, () => {
            beforeEach(() => {
                mapView.renderer.capabilities.isWebGL2 = isWebGL2;
            });
            it("extruded polygon materials have expected glslVersion", () => {
                const decodedTile: DecodedTile = getExtrudedPolygonTile();
                tgc.createObjects(newTile, decodedTile);

                checkGlslVersion(newTile.objects, isWebGL2);
            });

            it("fill polygon materials have expected glslVersion", () => {
                const decodedTile: DecodedTile = getFillTile();
                tgc.createObjects(newTile, decodedTile);

                checkGlslVersion(newTile.objects, isWebGL2);
            });

            it("solid line materials have expected glslVersion", () => {
                const decodedTile: DecodedTile = getSolidLineTile();
                tgc.createObjects(newTile, decodedTile);

                checkGlslVersion(newTile.objects, isWebGL2);
            });
        });
    }
    describe("pickable geometry", () => {
        it("extruded polygon depth prepass and edges geometries are registered as non-pickable", () => {
            const decodedTile: DecodedTile = getExtrudedPolygonTile();
            tgc.createObjects(newTile, decodedTile);
            assert.equal(newTile.objects.length, 3);

            newTile.objects.forEach(object => {
                const adapter = MapObjectAdapter.get(object);
                expect(adapter).not.equals(undefined);
                expect(adapter!.isPickable()).to.equal(
                    !isDepthPrePassMesh(object) && !(object as any).isLine
                );
            });
        });

        it("fill outline geometry is registered as pickable", () => {
            const decodedTile: DecodedTile = getFillTile();
            tgc.createObjects(newTile, decodedTile);
            assert.equal(newTile.objects.length, 2);
            const adapter0 = MapObjectAdapter.get(newTile.objects[0]);
            expect(adapter0).not.equals(undefined);
            expect(adapter0!.isPickable()).to.equal(true);

            const adapter1 = MapObjectAdapter.get(newTile.objects[1]);
            expect(adapter1).not.equals(undefined);
            expect(adapter1!.isPickable()).to.equal(true);
        });

        it("solid line without outline is registered as pickable", () => {
            const decodedTile: DecodedTile = getSolidLineTile();
            tgc.createObjects(newTile, decodedTile);
            assert.equal(newTile.objects.length, 1);
            const adapter = MapObjectAdapter.get(newTile.objects[0]);
            expect(adapter).not.equals(undefined);
            expect(adapter!.isPickable()).to.equal(true);
        });

        it("only outline geometry from solid line with outline is registered as pickable", () => {
            const decodedTile: DecodedTile = {
                geometries: [
                    {
                        type: GeometryType.Polygon,
                        vertexAttributes: [],
                        groups: [{ start: 0, count: 1, technique: 0, createdOffsets: [] }]
                    }
                ],
                techniques: [
                    {
                        name: "solid-line",
                        color: "red",
                        lineWidth: 1,
                        secondaryWidth: 2,
                        renderOrder: 0,
                        _index: 0,
                        _styleSetIndex: 0
                    }
                ]
            };
            tgc.createObjects(newTile, decodedTile);
            assert.equal(newTile.objects.length, 2);
            const adapter0 = MapObjectAdapter.get(newTile.objects[0]);
            expect(adapter0).not.equals(undefined);
            expect(adapter0!.isPickable()).to.equal(false);

            const adapter1 = MapObjectAdapter.get(newTile.objects[1]);
            expect(adapter1).not.equals(undefined);
            expect(adapter1!.isPickable()).to.equal(true);
        });
    });

    it("attachments", async () => {
        // create a simple style set defining rules and techniques
        // to style polygons.
        const rules: StyleSet = [
            {
                when: ["get", "red-polygon"],
                technique: "fill",
                renderOrder: 100,
                attr: {
                    color: "#ff0000"
                }
            },
            {
                when: ["get", "yellow-polygon"],
                technique: "fill",
                renderOrder: 200,
                attr: {
                    color: "#00ff00"
                }
            }
        ];

        // create `StyleSetEvaluator` to instantiate techniques
        // for the test polygons.
        const styleSetEvaluator = new StyleSetEvaluator({ styleSet: rules });

        // get the instantiated `TechniqueIndex` associated with red-polygon.
        const redPolygonTechnique = styleSetEvaluator.getMatchingTechniques(
            new MapEnv({ "red-polygon": true })
        )[0];

        // get the instantiated `TechniqueIndex` associated with yellow-polygon.
        const yellowPolygonTechnique = styleSetEvaluator.getMatchingTechniques(
            new MapEnv({ "yellow-polygon": true })
        )[0];

        // create a three.js box geometry
        const boxGeometry = new THREE.BoxBufferGeometry(100, 100, 1);

        // encode the three.js geometry so it can be trasferred using
        // DecodedTile.
        const geometry = ThreeBufferUtils.fromThreeBufferGeometry(
            boxGeometry,
            redPolygonTechnique._index
        );

        geometry.uuid = "main";

        // get the draw range of the main geometry.
        const { start, count } = geometry.groups[0];

        // create an attachment that renders the geometry using the
        // yellow-polygon technique
        const attachment: Attachment = {
            uuid: "attachment-1",
            groups: [{ start, count, technique: yellowPolygonTechnique._index }]
        };

        const decodedTile: DecodedTile = {
            geometries: [{ ...geometry, attachments: [attachment] }],
            techniques: styleSetEvaluator.decodedTechniques
        };

        tgc.initDecodedTile(decodedTile);
        tgc.createObjects(newTile, decodedTile);

        // get the main object
        const mainObject = newTile.objects.find(o => o.uuid === geometry.uuid) as THREE.Mesh;

        // get the attachment object
        const attachmentObject = newTile.objects.find(
            o => o.uuid === attachment.uuid
        ) as THREE.Mesh;

        const mainObjectGeometry = mainObject.geometry as THREE.BufferGeometry;
        assert.isTrue(mainObjectGeometry.isBufferGeometry);

        const attachmentObjectGeometry = mainObject.geometry as THREE.BufferGeometry;
        assert.isTrue(attachmentObjectGeometry.isBufferGeometry);

        assert.isObject(mainObjectGeometry.getAttribute("position"));
        assert.isObject(mainObjectGeometry.getAttribute("normal"));
        assert.isObject(mainObjectGeometry.getAttribute("uv"));

        assert.isObject(attachmentObjectGeometry.getAttribute("position"));
        assert.isObject(attachmentObjectGeometry.getAttribute("normal"));
        assert.isObject(attachmentObjectGeometry.getAttribute("uv"));

        // test that the buffers of the main geometry are shared
        // with the buffer of the attachment.

        assert.strictEqual(
            mainObjectGeometry.getAttribute("position"),
            attachmentObjectGeometry.getAttribute("position")
        );

        assert.strictEqual(
            mainObjectGeometry.getAttribute("normal"),
            attachmentObjectGeometry.getAttribute("normal")
        );

        assert.strictEqual(
            mainObjectGeometry.getAttribute("uv"),
            attachmentObjectGeometry.getAttribute("uv")
        );

        assert.strictEqual(mainObjectGeometry.getIndex(), attachmentObjectGeometry.getIndex());

        const mainObjectMaterial = mainObject.material as MapMeshBasicMaterial;
        const attachmentObjectMaterial = attachmentObject.material as MapMeshBasicMaterial;

        // test that the technique used to create the main geometry is red-polygon
        assert.strictEqual(mainObjectMaterial.color.getHexString(), "ff0000");
        assert.strictEqual(mainObject.renderOrder, redPolygonTechnique.renderOrder);

        // test that the technique used to create the attachment is yellow-polygon
        assert.strictEqual(attachmentObjectMaterial.color.getHexString(), "00ff00");
        assert.strictEqual(attachmentObject.renderOrder, yellowPolygonTechnique.renderOrder);
    });

    describe("test side of the geometry", () => {
        const techniques: Array<IndexedTechnique["name"]> = [
            "solid-line",
            "fill",
            "standard",
            "extruded-polygon"
        ];

        techniques.forEach(technique => {
            it(`side of the geometry - technique ${technique}`, () => {
                const decodedTile: DecodedTile = {
                    geometries: [
                        {
                            type: GeometryType.Polygon,
                            vertexAttributes: [],
                            groups: [{ start: 0, count: 1, technique: 0, createdOffsets: [] }]
                        }
                    ],
                    techniques: [
                        {
                            name: technique,
                            color: "red",
                            lineWidth: 1,
                            renderOrder: 0,
                            _index: 0,
                            _styleSetIndex: 0,
                            side: THREE.DoubleSide
                        } as any
                    ]
                };
                tgc.createObjects(newTile, decodedTile);
                assert.equal(newTile.objects.length, 1);
                const object = newTile.objects[0] as THREE.Mesh;
                assert.isTrue(object.isMesh);
                const material = object.material as THREE.Material;
                assert.isObject(material);
                assert.isTrue(material.isMaterial);
                assert.strictEqual(material.side, THREE.DoubleSide);
            });
        });
    });
});
