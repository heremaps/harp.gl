/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions
// Some expect assertions trigger this error.

import { SolidLineMaterial } from "@here/harp-materials";
import { expect } from "chai";
import * as THREE from "three";

import { DisplacedBufferGeometry } from "../lib/geometry/DisplacedBufferGeometry";
import { SolidLineMesh } from "../lib/geometry/SolidLineMesh";

class BufferGeometryBuilder {
    indices?: THREE.BufferAttribute;
    protected m_groups?: Array<{ start: number; count: number; materialIndex?: number }>;
    protected readonly m_attributes: {
        [name: string]: THREE.BufferAttribute;
    } = {};

    constructor(positions: number[]) {
        this.withPosition(positions);
    }

    withAttribute(name: string, values: number[], itemSize: number): BufferGeometryBuilder {
        this.m_attributes[name] = new THREE.BufferAttribute(new Float32Array(values), itemSize);
        return this;
    }

    withPosition(values: number[]): BufferGeometryBuilder {
        return this.withAttribute("position", values, 3);
    }

    withIndices(values: number[]): BufferGeometryBuilder {
        this.indices = new THREE.BufferAttribute(new Uint32Array(values), 1);
        return this;
    }

    withBitangent(values: number[]): BufferGeometryBuilder {
        return this.withAttribute("bitangent", values, 3);
    }

    withUv(values: number[]): BufferGeometryBuilder {
        return this.withAttribute("uv", values, 2);
    }

    withNormal(values: number[]): BufferGeometryBuilder {
        return this.withAttribute("normal", values, 3);
    }

    withGroups(
        groups: Array<{ start: number; count: number; materialIndex?: number }>
    ): BufferGeometryBuilder {
        this.m_groups = groups;
        return this;
    }

    build(): THREE.BufferGeometry {
        const geometry = new THREE.BufferGeometry();
        geometry.attributes = this.m_attributes;
        if (!this.indices) {
            this.withIndices([...Array(this.m_attributes.position.count).keys()]);
        }
        geometry.index = this.indices!;
        const count = geometry.index.count;
        geometry.groups = this.m_groups ? this.m_groups : [{ start: 0, count }];
        geometry.drawRange = { start: 0, count };
        return geometry;
    }
}

class SolidLineGeometryBuilder extends BufferGeometryBuilder {
    private static replicateToExtrudedVertices(attribute: number[], itemSize: number): number[] {
        const replicatedAttribute: number[] = [];
        for (let i = 0; i < attribute.length - itemSize; i += itemSize) {
            for (let j = i; j < i + 2 * itemSize; j += itemSize) {
                replicatedAttribute.push(
                    attribute[j],
                    attribute[j + 1],
                    attribute[j + 2],
                    attribute[j],
                    attribute[j + 1],
                    attribute[j + 2]
                );
            }
        }
        return replicatedAttribute;
    }

    private static computePositionsAndBitangents(
        polyline: number[],
        polylineBitangents: number[]
    ): { positions: number[]; bitangents: number[] } {
        const positions = SolidLineGeometryBuilder.replicateToExtrudedVertices(polyline, 3);
        const bitangents: number[] = [];
        const sameBitangent = polylineBitangents.length === 3;

        for (let i = 0; i < polyline.length - 3; i += 3) {
            for (let j = i; j < i + 6; j += 3) {
                const bitangent1Idx = sameBitangent ? 0 : j;
                const bitangent1 = new THREE.Vector3(
                    polylineBitangents[bitangent1Idx],
                    polylineBitangents[bitangent1Idx + 1],
                    polylineBitangents[bitangent1Idx + 2]
                ).normalize();
                bitangent1.toArray(bitangents, bitangents.length);
                bitangent1.negate().toArray(bitangents, bitangents.length);
            }
        }
        return { positions, bitangents };
    }

    private static triangulateLine(polyline: number[], indexOffset: number): number[] {
        // Same triangulation as in createLineGeometry() in Lines.ts.
        // line start
        // 1 ____0
        // |\    |
        // |  \  |
        // |____\|
        // 3     2
        // line end
        const indices = [];
        for (let i = 0; i < polyline.length / 3 - 1; ++i) {
            const base = indexOffset + i * 4;
            indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
        }
        return indices;
    }

    constructor(polyline: number[], polylineBitangents: number[]) {
        const { positions, bitangents } = SolidLineGeometryBuilder.computePositionsAndBitangents(
            polyline,
            polylineBitangents
        );
        super(positions);
        this.withIndices(SolidLineGeometryBuilder.triangulateLine(polyline, 0));
        this.withBitangent(bitangents);
    }

    addPolyline(polyline: number[], polylineBitangents: number[]): SolidLineGeometryBuilder {
        const { positions, bitangents } = SolidLineGeometryBuilder.computePositionsAndBitangents(
            polyline,
            polylineBitangents
        );

        const oldPositions = this.m_attributes.position.array as Float32Array;
        const oldIndices = this.indices!.array as Uint32Array;
        const oldBitangents = this.m_attributes.bitangent.array as Float32Array;
        const indices = SolidLineGeometryBuilder.triangulateLine(polyline, oldPositions.length / 3);

        this.withPosition(Array.from(oldPositions).concat(positions));
        this.withBitangent(Array.from(oldBitangents).concat(bitangents));
        this.withIndices(Array.from(oldIndices).concat(indices));
        return this;
    }

    /** @override */
    withUv(polylineUvs: number[]): BufferGeometryBuilder {
        return super.withUv(SolidLineGeometryBuilder.replicateToExtrudedVertices(polylineUvs, 2));
    }

    /** @override */
    withNormal(polylineNormals: number[]): BufferGeometryBuilder {
        return super.withNormal(
            SolidLineGeometryBuilder.replicateToExtrudedVertices(polylineNormals, 3)
        );
    }
}

class SolidLineMeshBuilder {
    private static readonly DEFAULT_MATERIAL = new SolidLineMaterial({
        lineWidth: 1,
        outlineWidth: 1,
        rendererCapabilities: { isWebGL2: false } as any
    });

    readonly geometryBuilder: SolidLineGeometryBuilder;
    private readonly m_materials: THREE.Material[] = [SolidLineMeshBuilder.DEFAULT_MATERIAL];
    private m_featureStarts?: number[];
    private readonly m_groups = new Array<{
        start: number;
        count: number;
        materialIndex?: number;
    }>();

    constructor(polyline: number[], bitangents: number[]) {
        this.geometryBuilder = new SolidLineGeometryBuilder(polyline, bitangents);
    }

    addFeature(polyline: number[], bitangents: number[]): SolidLineMeshBuilder {
        if (!this.m_featureStarts) {
            this.m_featureStarts = [0];
        }
        this.m_featureStarts.push(this.geometryBuilder.indices!.count);
        this.geometryBuilder.addPolyline(polyline, bitangents);
        return this;
    }

    addGroup(
        startFeature: number,
        endFeature: number,
        material?: THREE.Material
    ): SolidLineMeshBuilder {
        let materialIndex = 0;
        if (material) {
            this.m_materials.push(material);
            materialIndex = this.m_materials.length - 1;
        }
        // Convert polyline vertex indices to mesh vertex indices.
        const start = this.m_featureStarts![startFeature];
        const count =
            endFeature < this.m_featureStarts!.length
                ? this.m_featureStarts![endFeature]
                : this.geometryBuilder.indices!.count - start;
        const group = { start, count, materialIndex };
        this.m_groups.push(group);

        return this;
    }

    build(): SolidLineMesh {
        if (this.m_groups.length > 0) {
            this.geometryBuilder.withGroups(this.m_groups);
        }
        const mesh = new SolidLineMesh(
            this.geometryBuilder.build(),
            this.m_materials.length === 1 ? this.m_materials[0] : this.m_materials
        );
        if (this.m_featureStarts) {
            mesh.userData.feature = {};
            mesh.userData.feature.starts = this.m_featureStarts;
        }
        return mesh;
    }
}

function buildRay(origin: number[], direction: number[]) {
    return new THREE.Raycaster(
        new THREE.Vector3().fromArray(origin),
        new THREE.Vector3().fromArray(direction).normalize()
    );
}

function buildRayTo(
    intersect: number[],
    origin: number[] = [0, 0, 1000]
): { raycaster: THREE.Raycaster; distance: number } {
    const rayOrigin = new THREE.Vector3().fromArray(origin);
    const rayIntersect = new THREE.Vector3().fromArray(intersect);
    const raycaster = new THREE.Raycaster(
        rayOrigin,
        rayIntersect.clone().sub(rayOrigin).normalize()
    );
    const distance = rayIntersect.distanceTo(rayOrigin);
    return { raycaster, distance };
}

function checkIntersect(
    actualIntersects: THREE.Intersection[],
    expectedIntersect: THREE.Intersection
) {
    expect(actualIntersects).has.lengthOf(1);
    const actualIntersect = actualIntersects[0];
    expect(actualIntersect.distance).closeTo(expectedIntersect.distance, 1e-5);
    expect(actualIntersect.index).equals(expectedIntersect.index);
    expect(actualIntersect.object).deep.equals(expectedIntersect.object);
    expect(actualIntersect.point.distanceTo(expectedIntersect.point)).closeTo(0, 1e-5);
}

describe("SolidLineMesh", function () {
    it("raycast returns intersection on minimal hit example", function () {
        const mesh = new SolidLineMeshBuilder([0, 0, 0, 1, 0, 0], [0, 1, 0]).build();
        const intersects: THREE.Intersection[] = [];
        const { raycaster, distance } = buildRayTo([0, 1, 0]);
        mesh.raycast(raycaster, intersects);

        checkIntersect(intersects, {
            distance,
            point: new THREE.Vector3(0, 1, 0),
            index: 0,
            object: mesh
        });
    });

    it("raycast returns intersection on hit with ray collinear to extruded line", function () {
        const mesh = new SolidLineMeshBuilder([0, 0, 0, 1, 0, 0], [0, 1, 0]).build();
        const intersects: THREE.Intersection[] = [];
        mesh.raycast(buildRay([2, 0, 0], [-1, 0, 0]), intersects);

        checkIntersect(intersects, {
            distance: 0,
            point: new THREE.Vector3(2, 0, 0),
            index: 0,
            object: mesh
        });

        intersects.length = 0;
        mesh.raycast(buildRay([1, 0, 0], [-1, 0, 0]), intersects);

        checkIntersect(intersects, {
            distance: 0,
            point: new THREE.Vector3(1, 0, 0),
            index: 0,
            object: mesh
        });

        intersects.length = 0;
        mesh.raycast(buildRay([0.5, 0, 0], [-1, 0, 0]), intersects);

        checkIntersect(intersects, {
            distance: 0,
            point: new THREE.Vector3(0.5, 0, 0),
            index: 0,
            object: mesh
        });

        intersects.length = 0;
        mesh.raycast(buildRay([0, 0, 0], [1, 0, 0]), intersects);

        checkIntersect(intersects, {
            distance: 0,
            point: new THREE.Vector3(0, 0, 0),
            index: 0,
            object: mesh
        });

        intersects.length = 0;
        mesh.raycast(buildRay([-2, 0, 0], [1, 0, 0]), intersects);

        checkIntersect(intersects, {
            distance: 1,
            point: new THREE.Vector3(-1, 0, 0),
            index: 0,
            object: mesh
        });
    });

    it("raycast returns no intersection on miss with ray collinear to extruded line", function () {
        const mesh = new SolidLineMeshBuilder([0, 0, 0, 1, 0, 0], [0, 1, 0]).build();
        const intersects: THREE.Intersection[] = [];
        mesh.raycast(buildRay([2.1, 0, 0], [1, 0, 0]), intersects);

        expect(intersects).empty;

        intersects.length = 0;
        mesh.raycast(buildRay([-1.1, 0, 0], [-1, 0, 0]), intersects);

        expect(intersects).empty;
    });

    it("raycast returns intersection on coplanar ray hit with extruded line", function () {
        const mesh = new SolidLineMeshBuilder([0, 0, 0, 1, 0, 0], [0, 1, 0]).build();
        const intersects: THREE.Intersection[] = [];
        mesh.raycast(buildRay([0.5, 2, 0], [0, -1, 0]), intersects);

        checkIntersect(intersects, {
            distance: 1,
            point: new THREE.Vector3(0.5, 1, 0),
            index: 0,
            object: mesh
        });
    });

    it("raycast returns intersection on coplanar ray orig hit with extruded line", function () {
        const mesh = new SolidLineMeshBuilder([0, 0, 0, 1, 0, 0], [0, 1, 0]).build();
        const intersects: THREE.Intersection[] = [];
        mesh.raycast(buildRay([0.5, 1, 0], [0, 1, 0]), intersects);

        checkIntersect(intersects, {
            distance: 0,
            point: new THREE.Vector3(0.5, 1, 0),
            index: 0,
            object: mesh
        });

        intersects.length = 0;
        mesh.raycast(buildRay([0.5, 0.5, 0], [0, 1, 0]), intersects);

        checkIntersect(intersects, {
            distance: 0,
            point: new THREE.Vector3(0.5, 0.5, 0),
            index: 0,
            object: mesh
        });
    });

    it("raycast returns no intersection on coplanar ray miss with extruded line", function () {
        const mesh = new SolidLineMeshBuilder([0, 0, 0, 1, 0, 0], [0, 1, 0]).build();
        const intersects: THREE.Intersection[] = [];
        mesh.raycast(buildRay([0.5, 1.1, 0], [0, 1, 0]), intersects);

        expect(intersects).empty;
    });

    it("raycast returns intersection on coplanar ray hit with extruded line cap", function () {
        const mesh = new SolidLineMeshBuilder([0, 0, 0, 1, 0, 0], [0, 1, 0]).build();
        const intersects: THREE.Intersection[] = [];
        const raycaster = buildRay([3, 2, 0], [-1, -1, 0]);
        mesh.raycast(raycaster, intersects);

        checkIntersect(intersects, {
            distance: 2 * Math.SQRT2 - 1,
            point: new THREE.Vector3(1 + Math.SQRT2 / 2, Math.SQRT2 / 2, 0),
            index: 0,
            object: mesh
        });
    });

    it("raycast returns no intersection on degenerate line segment", function () {
        const intersects: THREE.Intersection[] = [];

        // Line segment with length 0
        const mesh = new SolidLineMeshBuilder([0, 0, 0, 0, 0, 0], [1, 0, 0]).build();
        mesh.raycast(buildRayTo([0, 0, 0]).raycaster, intersects);

        expect(intersects).empty;

        // Line segment with zero-length extrusion vector.
        const mesh2 = new SolidLineMeshBuilder([0, 0, 0, 1, 0, 0], [0, 0, 0]).build();
        mesh2.raycast(buildRayTo([0, 0, 0]).raycaster, intersects);

        expect(intersects).empty;

        // Line segment with same direction as extrusion vector.
        const mesh3 = new SolidLineMeshBuilder([0, 0, 0, 1, 0, 0], [1, 0, 0]).build();
        mesh3.raycast(buildRayTo([0, 0, 0]).raycaster, intersects);

        expect(intersects).empty;
    });

    it("raycast returns no intersection on extruded line miss", function () {
        const mesh = new SolidLineMeshBuilder([0, 0, 0, 0, 1, 0], [1, 0, 0]).build();
        const intersects: THREE.Intersection[] = [];
        mesh.raycast(buildRay([1.1, 1, 1], [0, 0, -1]), intersects);

        expect(intersects).empty;
    });

    it("raycast returns no intersection on extrusion plane miss", function () {
        const mesh = new SolidLineMeshBuilder([0, 0, 0, 1, 1, 0], [-1, 1, 0]).build();
        const intersects: THREE.Intersection[] = [];
        mesh.raycast(buildRay([0, 0, 1], [-1, 1, 0]), intersects);

        expect(intersects).empty;
    });

    it("raycast returns no intersection on bounding sphere miss", function () {
        const mesh = new SolidLineMeshBuilder([-1, -1, -1, 1, 1, 1], [-1, 1, 1]).build();
        const intersects: THREE.Intersection[] = [];
        mesh.raycast(buildRay([3, 0, 3], [0, 0, -1]), intersects);

        expect(mesh.userData.feature?.boundingVolumes).is.an("array").with.lengthOf(1);
        expect(mesh.userData.feature.boundingVolumes[0]).deep.equals(
            new THREE.Sphere(new THREE.Vector3(0, 0, 0), Math.sqrt(3))
        );
        expect(intersects).empty;
    });

    it("raycast returns no intersection on near/far range miss", function () {
        const mesh = new SolidLineMeshBuilder([0, 0, 0, 1, 0, 0], [0, 1, 0]).build();
        const intersects: THREE.Intersection[] = [];
        const { raycaster, distance } = buildRayTo([0, 1, 0]);
        raycaster.near = distance + 1;
        mesh.raycast(raycaster, intersects);
        expect(intersects).empty;

        raycaster.near = 0;
        raycaster.far = distance - distance / 2;
        mesh.raycast(raycaster, intersects);
        expect(intersects).empty;
    });

    it("raycast returns intersection on hit with transformed mesh", function () {
        // prettier-ignore
        const worldToLocal = new THREE.Matrix4().set(2, 0, 0, 4,
                                                     0, 2, 0, 5,
                                                     0, 0, 2, 6,
                                                     0, 0, 0, 1);
        const vertex1 = new THREE.Vector3(0, 0, 0).applyMatrix4(worldToLocal);
        const vertex2 = new THREE.Vector3(1, 0, 0).applyMatrix4(worldToLocal);
        const bitangent = new THREE.Vector3(0, 1, 0).transformDirection(worldToLocal);
        const mesh = new SolidLineMeshBuilder(
            vertex1.toArray().concat(vertex2.toArray()),
            bitangent.toArray()
        ).build();
        const localToWorld = new THREE.Matrix4().copy(worldToLocal).invert();
        mesh.applyMatrix4(localToWorld);
        mesh.updateMatrixWorld();

        const intersects: THREE.Intersection[] = [];
        const { raycaster, distance } = buildRayTo([1, 0, 0], [1, 0, 1]);
        mesh.raycast(raycaster, intersects);

        checkIntersect(intersects, {
            distance,
            point: new THREE.Vector3(1, 0, 0),
            index: 0,
            object: mesh
        });
    });

    it("raycast returns intersection on hit with mesh with multiple features", function () {
        const mesh = new SolidLineMeshBuilder([0, 0, 0, 1, 0, 0, 2, 0, 0], [0, 1, 0])
            .addFeature([5, 5, 5, 7, 7, 7], [-1, 1, 1])
            .build();
        const intersects: THREE.Intersection[] = [];
        const { raycaster, distance } = buildRayTo([5, 5, 5], [5, 5, 7]);
        mesh.raycast(raycaster, intersects);

        expect(mesh.userData.feature?.boundingVolumes).is.an("array").with.lengthOf(2);
        expect(mesh.userData.feature.boundingVolumes[0]).deep.equals(
            new THREE.Sphere(new THREE.Vector3(1, 0, 0), 1)
        );
        expect(mesh.userData.feature.boundingVolumes[1]).deep.equals(
            new THREE.Sphere(new THREE.Vector3(6, 6, 6), Math.sqrt(3))
        );
        checkIntersect(intersects, {
            distance,
            point: new THREE.Vector3(5, 5, 5),
            index: 12,
            object: mesh
        });
    });

    it("raycast returns intersection on hit with mesh with multiple groups", function () {
        const mesh = new SolidLineMeshBuilder([0, 0, 0, 1, 0, 0, 2, 0, 0], [0, 1, 0])
            .addFeature([5, 5, 5, 7, 7, 7], [-1, 1, 1])
            .addGroup(0, 1)
            .addGroup(
                1,
                2,
                new SolidLineMaterial({
                    lineWidth: 5,
                    rendererCapabilities: { isWebGL2: false } as any
                })
            )
            .build();
        const intersects: THREE.Intersection[] = [];
        const { raycaster, distance } = buildRayTo([5, 5, 5], [5, 5, 7]);
        mesh.raycast(raycaster, intersects);

        checkIntersect(intersects, {
            distance,
            point: new THREE.Vector3(5, 5, 5),
            index: 12,
            object: mesh
        });
    });

    it("raycast on displaced geometry expands bounding sphere by displacement range", function () {
        const meshBuilder = new SolidLineMeshBuilder([0, 0, 0, 2, 0, 0], [0, 1, 0]);
        meshBuilder.geometryBuilder.withUv([0, 0, 1, 1]).withNormal([0, 0, 1, 0, 0, 1]);
        const mesh = meshBuilder.build();
        mesh.geometry = new DisplacedBufferGeometry(
            mesh.geometry as THREE.BufferGeometry,
            new THREE.DataTexture(new Float32Array([10.0, 12.0, 10.0, 12.0]), 2, 2),
            { min: 10, max: 12 }
        );
        const intersects: THREE.Intersection[] = [];
        const { raycaster, distance } = buildRayTo([0, 1, 10]);
        mesh.raycast(raycaster, intersects);

        expect(mesh.userData.feature?.boundingVolumes).is.an("array").with.lengthOf(1);
        expect(mesh.userData.feature.boundingVolumes[0]).deep.equals(
            new THREE.Sphere(new THREE.Vector3(1, 0, 11), Math.SQRT2)
        );

        checkIntersect(intersects, {
            distance,
            point: new THREE.Vector3(0, 1, 10),
            index: 0,
            object: mesh
        });
    });

    it("raycast returns intersection on modified geometry (auto update bounding volume)", function () {
        const mesh = new SolidLineMeshBuilder([0, 0, 0, 1, 0, 0], [0, 1, 0]).build();
        const intersects: THREE.Intersection[] = [];
        const { raycaster, distance } = buildRayTo([5, 1, 0]);
        mesh.raycast(raycaster, intersects);

        expect(intersects).empty;

        const geometryBuilder = new SolidLineGeometryBuilder([0, 0, 0, 5, 0, 0], [0, 1, 0]);
        mesh.geometry = geometryBuilder.build();
        mesh.raycast(raycaster, intersects);

        checkIntersect(intersects, {
            distance,
            point: new THREE.Vector3(5, 1, 0),
            index: 0,
            object: mesh
        });
    });
});
