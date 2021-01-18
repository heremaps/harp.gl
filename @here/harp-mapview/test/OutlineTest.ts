/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { assert, expect } from "chai";
import * as sinon from "sinon";
import * as THREE from "three";

import { OutlineEffect } from "../lib/composing/Outline";

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

const cameraMock: any = {
    fov: 40,
    rotation: {
        z: 0
    },
    quaternion: new THREE.Quaternion(),
    matrixWorld: new THREE.Matrix4()
};

const sceneMock: any = {
    traverse: (callback: (object: any) => any) => {
        //
    }
};

const rendererMock: any = {
    autoClear: false,
    domElement: undefined,
    shadowMap: {
        enabled: true
    },

    render: (scene: any, camera: any): void => {
        //
    }
};

describe("Outline", function () {
    function createOutlineEffect(): OutlineEffect {
        const outlineEffect = new OutlineEffect(rendererMock as THREE.WebGLRenderer);
        return outlineEffect;
    }

    it("create", function () {
        const outlineEffect = createOutlineEffect();
        expect(outlineEffect).to.not.be.equal(undefined);
    });

    it("create accessors", function () {
        const renderer: any = {
            autoClear: false,
            domElement: undefined,
            shadowMap: {
                enabled: true
            }
        };

        const outlineEffect = new OutlineEffect(renderer as THREE.WebGLRenderer);
        expect(outlineEffect).to.not.be.equal(undefined);
        expect(outlineEffect.autoClear).to.be.equal(renderer.autoClear);
        expect(outlineEffect.domElement).to.be.equal(renderer.domElement);
        expect(outlineEffect.shadowMap).to.be.equal(renderer.shadowMap);
    });

    it("render", function () {
        const outlineEffect = createOutlineEffect();
        const traverseStub = sinon.stub(sceneMock, "traverse");
        const renderStub = sinon.stub(rendererMock, "render");
        outlineEffect.render(sceneMock, cameraMock);
        assert(traverseStub.called);
        assert(renderStub.called);
        traverseStub.restore();
        renderStub.restore();
    });
});
