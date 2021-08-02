/*
 * Copyright (C) 2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { TileKey } from "@here/harp-geoutils";
import { expect } from "chai";
import * as sinon from "sinon";
import * as THREE from "three";

import { MapView } from "../lib/MapView";
import { PickHandler } from "../lib/PickHandler";
import { Tile } from "../lib/Tile";

describe("PickHandler", function () {
    let pickHandler: PickHandler;
    let mapViewMock: MapView;
    let tile: Tile;
    beforeEach(function () {
        const size = new THREE.Vector2(800, 600);
        const camera = new THREE.PerspectiveCamera();
        tile = ({
            boundingBox: {
                extents: new THREE.Vector3(1252344.2714, 1252344.2714, 11064),
                position: new THREE.Vector3(21289852.6142, 26299229.6999, 11064),
                xAxis: new THREE.Vector3(1, 0, 0),
                yAxis: new THREE.Vector3(0, 1, 0),
                zAxis: new THREE.Vector3(0, 0, 1)
            },
            computeWorldOffsetX: () => 0,
            dependencies: [],
            tileKey: TileKey.fromRowColumnLevel(1, 2, 3)
        } as unknown) as Tile;

        mapViewMock = ({
            camera,
            worldCenter: new THREE.Vector3(21429001.9777, 25228494.0575, 2160787.9966),
            renderer: {
                getSize: () => size
            },
            mapAnchors: {
                children: []
            },
            getNormalizedScreenCoordinates: (x: number, y: number) =>
                new THREE.Vector3(x / size.x - 1, -y / size.y + 1, 0),
            visibleTileSet: {
                dataSourceTileList: [
                    {
                        dataSource: {
                            enablePicking: true
                        },
                        renderedTiles: new Map().set(1, tile)
                    }
                ]
            },
            getWorldPositionAt: () => {} // to be overridden (by stubs) for given coords
        } as unknown) as MapView;

        pickHandler = new PickHandler(mapViewMock, camera, true);
    });

    describe("#intersectMapObjects", function () {
        let raycasterFromScreenPointStub: sinon.SinonStub<[x: number, y: number], THREE.Raycaster>;

        beforeEach(function () {
            raycasterFromScreenPointStub = sinon.stub(pickHandler, "raycasterFromScreenPoint");
        });

        it("collects results for objects based on '.faceIndex' of intersection", function () {
            sinon
                .stub(mapViewMock, "getWorldPositionAt")
                .callsFake(() => new THREE.Vector3(21604645.272347387, 25283546.433446992, 0));

            raycasterFromScreenPointStub.callsFake((x: number, y: number) => {
                const raycaster = raycasterFromScreenPointStub.wrappedMethod.call(
                    pickHandler,
                    x,
                    y
                );

                sinon
                    .stub(raycaster, "intersectObjects")
                    .callsFake((objects, recursive, target: THREE.Intersection[] = []) => {
                        // contains ".face" and ".faceIndex", but doesn't contain ".index"
                        target.push({
                            distance: 2168613.8654252696,
                            point: new THREE.Vector3(175643.2946, 55052.3759, -2160787.9966),
                            face: {
                                a: 1661,
                                b: 1737,
                                c: 1736,
                                materialIndex: 0,
                                normal: new THREE.Vector3(0, 0, 1)
                            },
                            faceIndex: 1653,
                            object: ({
                                renderOrder: 1000,
                                userData: {
                                    dataSource: "geojson",
                                    feature: {
                                        geometryType: 7,
                                        starts: [
                                            0,
                                            558,
                                            690,
                                            1329,
                                            1704,
                                            2169,
                                            2448,
                                            2778,
                                            3282,
                                            3726,
                                            3789,
                                            3795,
                                            3804,
                                            3810,
                                            3816,
                                            3822,
                                            3825,
                                            4128,
                                            4131,
                                            4383,
                                            4797,
                                            5031,
                                            5223,
                                            5370,
                                            5523,
                                            5550,
                                            5658,
                                            5688,
                                            5694
                                        ],
                                        objInfos: [
                                            // duplicate entries are taken from original multi-polygons
                                            // and correspond to the index defined in ".starts"
                                            { $id: "KLRKDk6pCr", name: "piemonte" },
                                            { $id: "XBfAalZEh7", name: "valle d'aosta" },
                                            { $id: "Xgfuk2roHZ", name: "lombardia" },
                                            { $id: "pJMwZ8oREr", name: "trentino-alto adige" },
                                            { $id: "ZKFRobO3Pm", name: "veneto" },
                                            { $id: "QogIXpZ2Z6", name: "friuli venezia giulia" },
                                            { $id: "Qu7fcJcV84", name: "liguria" },
                                            { $id: "7FkQc7sUxe", name: "emilia-romagna" },
                                            { $id: "cWl3QbtsTR", name: "toscana" },
                                            { $id: "cWl3QbtsTR", name: "toscana" },
                                            { $id: "cWl3QbtsTR", name: "toscana" },
                                            { $id: "cWl3QbtsTR", name: "toscana" },
                                            { $id: "cWl3QbtsTR", name: "toscana" },
                                            { $id: "cWl3QbtsTR", name: "toscana" },
                                            { $id: "cWl3QbtsTR", name: "toscana" },
                                            { $id: "cWl3QbtsTR", name: "toscana" },
                                            { $id: "vaPSWJfKuh", name: "umbria" },
                                            { $id: "vaPSWJfKuh", name: "umbria" },
                                            { $id: "ZOU85Bs5O0", name: "marche" },
                                            { $id: "jmfNYjkZJr", name: "lazio" },
                                            { $id: "yVgD20bhJO", name: "abruzzo" },
                                            { $id: "GwuetqFMcf", name: "molise" },
                                            { $id: "2J3GTgA5fc", name: "campania" },
                                            { $id: "tZ9VB13xm1", name: "puglia" },
                                            { $id: "GT1soJEJke", name: "basilicata" },
                                            { $id: "z3HpNZ0YaQ", name: "sardegna" },
                                            { $id: "z3HpNZ0YaQ", name: "sardegna" },
                                            { $id: "z3HpNZ0YaQ", name: "sardegna" },
                                            { $id: "z3HpNZ0YaQ", name: "sardegna" }
                                        ]
                                    }
                                }
                            } as unknown) as THREE.Object3D
                        });

                        return target;
                    });

                return raycaster;
            });

            const results = pickHandler.intersectMapObjects(467, 279);

            expect(results).not.to.be.empty;
            expect(results[0].featureId).to.equal("yVgD20bhJO");
            expect(results[0].userData).to.deep.equal({
                $id: "yVgD20bhJO",
                name: "abruzzo"
            });
        });

        it("collects results for objects based on '.index' of intersection", function () {
            sinon
                .stub(mapViewMock, "getWorldPositionAt")
                .callsFake(() => new THREE.Vector3(21604645.272347387, 25315004.93397993, 0));

            raycasterFromScreenPointStub.callsFake((x: number, y: number) => {
                const raycaster = raycasterFromScreenPointStub.wrappedMethod.call(
                    pickHandler,
                    x,
                    y
                );

                sinon
                    .stub(raycaster, "intersectObjects")
                    .callsFake((objects, recursive, target: THREE.Intersection[] = []) => {
                        // contains ".index", but doesn't contain ".face" and ".faceIndex"
                        target.push({
                            distance: 2168743.4081880464,
                            point: new THREE.Vector3(174781.2243, 62415.6655, -2160787.9966),
                            index: 3318,
                            object: ({
                                renderOrder: 1000,
                                userData: {
                                    dataSource: "geojson",
                                    feature: {
                                        geometryType: 7,
                                        starts: [
                                            0,
                                            378,
                                            472,
                                            904,
                                            1160,
                                            1476,
                                            1668,
                                            1894,
                                            2234,
                                            2536,
                                            2584,
                                            2594,
                                            2606,
                                            2616,
                                            2626,
                                            2636,
                                            2644,
                                            2852,
                                            2860,
                                            3034,
                                            3316,
                                            3478,
                                            3612,
                                            3712,
                                            3828,
                                            3848,
                                            3922,
                                            3948,
                                            3958
                                        ],
                                        objInfos: [
                                            { $id: "KLRKDk6pCr", name: "piemonte" },
                                            { $id: "XBfAalZEh7", name: "valle d'aosta" },
                                            { $id: "Xgfuk2roHZ", name: "lombardia" },
                                            { $id: "pJMwZ8oREr", name: "trentino-alto adige" },
                                            { $id: "ZKFRobO3Pm", name: "veneto" },
                                            { $id: "QogIXpZ2Z6", name: "friuli venezia giulia" },
                                            { $id: "Qu7fcJcV84", name: "liguria" },
                                            { $id: "7FkQc7sUxe", name: "emilia-romagna" },
                                            { $id: "cWl3QbtsTR", name: "toscana" },
                                            { $id: "cWl3QbtsTR", name: "toscana" },
                                            { $id: "cWl3QbtsTR", name: "toscana" },
                                            { $id: "cWl3QbtsTR", name: "toscana" },
                                            { $id: "cWl3QbtsTR", name: "toscana" },
                                            { $id: "cWl3QbtsTR", name: "toscana" },
                                            { $id: "cWl3QbtsTR", name: "toscana" },
                                            { $id: "cWl3QbtsTR", name: "toscana" },
                                            { $id: "vaPSWJfKuh", name: "umbria" },
                                            { $id: "vaPSWJfKuh", name: "umbria" },
                                            { $id: "ZOU85Bs5O0", name: "marche" },
                                            { $id: "jmfNYjkZJr", name: "lazio" },
                                            { $id: "yVgD20bhJO", name: "abruzzo" },
                                            { $id: "GwuetqFMcf", name: "molise" },
                                            { $id: "2J3GTgA5fc", name: "campania" },
                                            { $id: "tZ9VB13xm1", name: "puglia" },
                                            { $id: "GT1soJEJke", name: "basilicata" },
                                            { $id: "z3HpNZ0YaQ", name: "sardegna" },
                                            { $id: "z3HpNZ0YaQ", name: "sardegna" },
                                            { $id: "z3HpNZ0YaQ", name: "sardegna" },
                                            { $id: "z3HpNZ0YaQ", name: "sardegna" }
                                        ]
                                    }
                                }
                            } as unknown) as THREE.Object3D
                        });

                        return target;
                    });

                return raycaster;
            });

            const results = pickHandler.intersectMapObjects(467, 276);

            expect(results).not.to.be.empty;
            expect(results[0].featureId).to.equal("yVgD20bhJO");
            expect(results[0].userData).to.deep.equal({
                $id: "yVgD20bhJO",
                name: "abruzzo"
            });
        });

        it("returns an array of PickResult objects each having the expected properties", function () {
            sinon
                .stub(mapViewMock, "getWorldPositionAt")
                .callsFake(() => new THREE.Vector3(21604645.272347387, 25315004.93397993, 0));

            raycasterFromScreenPointStub.callsFake((x: number, y: number) => {
                const raycaster = raycasterFromScreenPointStub.wrappedMethod.call(
                    pickHandler,
                    x,
                    y
                );

                sinon
                    .stub(raycaster, "intersectObjects")
                    .callsFake((objects, recursive, target: THREE.Intersection[] = []) => {
                        target.push({
                            point: new THREE.Vector3(174781.2243, 62415.6655, -2160787.9966),
                            distance: 2168613.8654252696,
                            object: ({
                                userData: {}
                            } as any) as THREE.Object3D
                        });

                        return target;
                    });

                return raycaster;
            });

            const results = pickHandler.intersectMapObjects(467, 276);
            expect(results).not.to.be.empty;
            expect(results[0].tileKey).to.equal(tile.tileKey);
            // TODO: expand to other properties in PickResult
        });
    });
});
