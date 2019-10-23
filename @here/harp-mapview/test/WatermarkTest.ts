/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
// Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import * as TestUtils from "@here/harp-test-utils/lib/WebGLStub";
import { assert, expect } from "chai";
import * as sinon from "sinon";
import * as THREE from "three";
import { Watermark } from "../lib/Watermark";

describe("Watermark", function() {
    const sandbox = sinon.createSandbox();

    beforeEach(function() {
        sandbox
            .stub(THREE, "WebGLRenderer")
            .returns(TestUtils.getWebGLRendererStub(sinon, sandbox.stub()));

        sandbox
            .stub(THREE.TextureLoader.prototype, "load")
            .returns(new THREE.DataTexture(new Uint8Array(), 4, 4));
    });

    afterEach(function() {
        sandbox.restore();
    });

    it("Updates watermark position on rendering", function() {
        const watermark = new Watermark("", 10, 5);

        assert.exists(watermark, "object is created");

        const mesh = (watermark as any).m_watermarkMesh as THREE.Mesh;

        assert.exists(mesh, "mesh is created");

        const renderer = new THREE.WebGLRenderer();

        watermark.render(renderer, new THREE.OrthographicCamera(-200, 200, 100, -100));

        expect(mesh.position.x).to.equal(-190);
        expect(mesh.position.y).to.equal(-90);

        watermark.render(renderer, new THREE.OrthographicCamera(-100, 100, 200, -200));

        expect(mesh.position.x).to.equal(-90);
        expect(mesh.position.y).to.equal(-190);
    });
});
