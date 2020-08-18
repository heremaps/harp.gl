/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
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
    EarthConstants,
    MercatorConstants,
    mercatorProjection,
    TileKey,
    TilingScheme,
    webMercatorTilingScheme
} from "@here/harp-geoutils";
import { MapMeshBasicMaterial } from "@here/harp-materials";
import { assert, expect } from "chai";
import * as sinon from "sinon";
import * as THREE from "three";
import { DataSource } from "../lib/DataSource";
import { isDepthPrePassMesh } from "../lib/DepthPrePass";
import { DisplacementMap } from "../lib/DisplacementMap";
import { TileGeometryCreator } from "../lib/geometry/TileGeometryCreator";
import { MapObjectAdapter } from "../lib/MapObjectAdapter";
import { Tile } from "../lib/Tile";

class FakeMapView {
    private readonly m_scene = new THREE.Scene();

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

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

describe("TileGeometryCreator", () => {
    let mockDatasource: sinon.SinonStubbedInstance<MockDataSource>;
    let newTile: Tile;
    const tgc = TileGeometryCreator.instance;
    const mapView = new FakeMapView();

    before(function() {
        mockDatasource = sinon.createStubInstance(MockDataSource);

        mockDatasource.getTilingScheme.callsFake(() => webMercatorTilingScheme);
        sinon.stub(mockDatasource, "projection").get(() => mercatorProjection);
        sinon.stub(mockDatasource, "mapView").get(() => mapView);
    });

    beforeEach(function() {
        newTile = new Tile(
            (mockDatasource as unknown) as DataSource,
            TileKey.fromRowColumnLevel(0, 0, 0)
        );
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

    it("background geometry is registered as non-pickable", () => {
        tgc.addGroundPlane(newTile, 0);
        assert.equal(newTile.objects.length, 1);
        const adapter = MapObjectAdapter.get(newTile.objects[0]);
        expect(adapter).not.equals(undefined);
        expect(adapter!.isPickable(new MapEnv({}))).to.equal(false);
    });

    it("extruded polygon depth prepass and edges geometries are registered as non-pickable", () => {
        const decodedTile: DecodedTile = {
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
        tgc.createObjects(newTile, decodedTile);
        assert.equal(newTile.objects.length, 3);

        newTile.objects.forEach(object => {
            const adapter = MapObjectAdapter.get(object);
            expect(adapter).not.equals(undefined);
            expect(adapter!.isPickable(new MapEnv({}))).to.equal(
                !isDepthPrePassMesh(object) && !(object as any).isLine
            );
        });
    });

    it("fill outline geometry is registered as non-pickable", () => {
        const decodedTile: DecodedTile = {
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
        tgc.createObjects(newTile, decodedTile);
        assert.equal(newTile.objects.length, 2);
        const adapter0 = MapObjectAdapter.get(newTile.objects[0]);
        expect(adapter0).not.equals(undefined);
        expect(adapter0!.isPickable(new MapEnv({}))).to.equal(true);

        const adapter1 = MapObjectAdapter.get(newTile.objects[1]);
        expect(adapter1).not.equals(undefined);
        expect(adapter1!.isPickable(new MapEnv({}))).to.equal(false);
    });

    it("solid line without outline is registered as pickable", () => {
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
                    renderOrder: 0,
                    _index: 0,
                    _styleSetIndex: 0
                }
            ]
        };
        tgc.createObjects(newTile, decodedTile);
        assert.equal(newTile.objects.length, 1);
        const adapter = MapObjectAdapter.get(newTile.objects[0]);
        expect(adapter).not.equals(undefined);
        expect(adapter!.isPickable(new MapEnv({}))).to.equal(true);
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
        expect(adapter0!.isPickable(new MapEnv({}))).to.equal(false);

        const adapter1 = MapObjectAdapter.get(newTile.objects[1]);
        expect(adapter1).not.equals(undefined);
        expect(adapter1!.isPickable(new MapEnv({}))).to.equal(true);
    });

    it("categories", () => {
        type IndexedDecodedTile = Omit<DecodedTile, "techniques"> & {
            techniques?: IndexedTechnique[];
        };

        const decodedTile: IndexedDecodedTile = {
            geometries: [
                {
                    type: GeometryType.Polygon,
                    vertexAttributes: [],
                    groups: [{ start: 0, count: 1, technique: 0, createdOffsets: [] }]
                },
                {
                    type: GeometryType.Polygon,
                    vertexAttributes: [],
                    groups: [{ start: 0, count: 1, technique: 1, createdOffsets: [] }]
                }
            ],
            techniques: [
                {
                    _styleSet: "tilezen",
                    _category: "hi-priority",
                    _index: 0,
                    _styleSetIndex: 0,
                    renderOrder: -1,
                    name: "line",
                    color: "rgb(255,0,0)",
                    lineWidth: 1
                },
                {
                    _styleSet: "tilezen",
                    _category: "low-priority",
                    _index: 1,
                    _styleSetIndex: 0,
                    renderOrder: -1,
                    name: "circles"
                }
            ]
        };

        const savedTheme = newTile.mapView.theme;

        newTile.mapView.theme = {
            priorities: [
                { group: "tilezen", category: "low-priority" },
                { group: "tilezen", category: "hi-priority" }
            ]
        };

        newTile.decodedTile = decodedTile as DecodedTile;

        tgc.processTechniques(newTile, undefined, undefined);
        tgc.createObjects(newTile, decodedTile as DecodedTile);

        assert.strictEqual(newTile.objects.length, 2);
        assert.strictEqual(newTile.objects[0].renderOrder, 20);
        assert.strictEqual(newTile.objects[1].renderOrder, 10);

        newTile.mapView.theme = savedTheme;
    });

    it("attachments", () => {
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

        newTile.mapView.theme = {
            styles: { rules }
        };

        // create `StyleSetEvaluator` to instantiate techniques
        // for the test polygons.
        const styleSetEvaluator = new StyleSetEvaluator(rules);

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

    it("generates tile corners ", () => {
        const delta = 0.0000000000001;
        const corners = tgc.generateTilePlaneCorners(newTile.geoBox, mercatorProjection);

        //SOUTH WEST
        assert.equal(corners.sw.x, 0);
        assert.equal(corners.sw.y, 6.673830935484984e-9);
        assert.equal(corners.sw.z, 0);

        const southWestGeo = mapView.projection.unprojectPoint(corners.sw);
        assert.equal(
            southWestGeo.latitude,
            -THREE.MathUtils.radToDeg(MercatorConstants.MAXIMUM_LATITUDE)
        );
        assert.equal(southWestGeo.longitude, -180);
        assert.equal(southWestGeo.altitude, 0);

        //SOUTH EAST
        assert.closeTo(corners.se.x, EarthConstants.EQUATORIAL_CIRCUMFERENCE, delta);
        assert.equal(corners.se.y, 6.673830935484984e-9);
        assert.equal(corners.se.z, 0);

        const southEastGeo = mapView.projection.unprojectPoint(corners.se);
        assert.equal(
            southEastGeo.latitude,
            -THREE.MathUtils.radToDeg(MercatorConstants.MAXIMUM_LATITUDE)
        );
        assert.equal(southEastGeo.longitude, 180);
        assert.equal(southEastGeo.altitude, 0);

        //NORTH EAST
        assert.closeTo(corners.ne.x, EarthConstants.EQUATORIAL_CIRCUMFERENCE, delta);
        assert.closeTo(corners.ne.y, EarthConstants.EQUATORIAL_CIRCUMFERENCE, delta);
        assert.equal(corners.ne.z, 0);

        const northEastGeo = mapView.projection.unprojectPoint(corners.ne);
        assert.closeTo(
            northEastGeo.latitude,
            THREE.MathUtils.radToDeg(MercatorConstants.MAXIMUM_LATITUDE),
            0.0000000000001
        );
        assert.equal(northEastGeo.longitude, 180);
        assert.equal(northEastGeo.altitude, 0);

        //NORTH WEST
        assert.equal(corners.nw.x, 0);
        assert.closeTo(corners.nw.y, EarthConstants.EQUATORIAL_CIRCUMFERENCE, delta);
        assert.equal(corners.nw.z, 0);

        const northWestGeo = mapView.projection.unprojectPoint(corners.nw);
        assert.closeTo(
            northWestGeo.latitude,
            THREE.MathUtils.radToDeg(MercatorConstants.MAXIMUM_LATITUDE),
            delta
        );
        assert.equal(northWestGeo.longitude, -180);
        assert.equal(northWestGeo.altitude, 0);
    });
});
