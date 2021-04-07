/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { IconMaterial } from "@here/harp-materials";
import { expect } from "chai";
import * as sinon from "sinon";
import * as THREE from "three";

import { PoiBatchRegistry, PoiLayer } from "../lib/poi/PoiRenderer";
import { TextElement } from "../lib/text/TextElement";
import { PoiInfoBuilder } from "./PoiInfoBuilder";

describe("PoiBatchRegistry", () => {
    const renderer = { capabilities: { isWebGL2: false } } as THREE.WebGLRenderer;
    let registry: PoiBatchRegistry;
    const textElement = {} as TextElement;
    const defaultPoiLayer: PoiLayer = {
        id: 0,
        scene: new THREE.Scene()
    };

    beforeEach(() => {
        registry = new PoiBatchRegistry(renderer.capabilities);
    });
    describe("registerPoi", function () {
        it("marks PoiInfo as invalid if it has no image item", () => {
            const poiInfo = new PoiInfoBuilder().build(textElement);
            const buffer = registry.registerPoi(poiInfo, defaultPoiLayer);

            expect(buffer).to.be.undefined;
            expect((poiInfo as any).isValid).to.be.false;
        });

        it("uses PoiInfo's imageTexture's image by default as batch key", () => {
            const poiInfo1 = new PoiInfoBuilder()
                .withImageTexture({ name: "tex1", image: "image1" })
                .withImageItem()
                .build(textElement);

            const buffer1 = registry.registerPoi(poiInfo1, defaultPoiLayer);
            const buffer2 = registry.registerPoi(
                new PoiInfoBuilder()
                    .withImageTexture({ name: "tex2", image: poiInfo1.imageTexture!.image })
                    .withImageItem()
                    .build(textElement),
                defaultPoiLayer
            );

            expect(buffer1).equals(buffer2).and.not.undefined;
        });

        it("uses PoiInfo's imageTextureName as batch key if imageTexture is undefined", () => {
            const poiInfo1 = new PoiInfoBuilder()
                .withImageTextureName("image1")
                .withImageItem()
                .build(textElement);

            const buffer1 = registry.registerPoi(poiInfo1, defaultPoiLayer);
            const buffer2 = registry.registerPoi(
                new PoiInfoBuilder()
                    .withImageTextureName(poiInfo1.imageTextureName)
                    .withImageItem()
                    .build(textElement),
                defaultPoiLayer
            );
            expect(buffer1).equals(buffer2).and.not.undefined;
        });

        it("POIs with same image but diff. render order share only material (and texture)", () => {
            const poiInfo1 = new PoiInfoBuilder()
                .withImageTextureName("image1")
                .withImageItem()
                .withRenderOrder(0)
                .build(textElement);

            const buffer1 = registry.registerPoi(poiInfo1, defaultPoiLayer);
            const buffer2 = registry.registerPoi(
                new PoiInfoBuilder()
                    .withImageTextureName(poiInfo1.imageTextureName)
                    .withImageItem()
                    .withRenderOrder(1)
                    .build(textElement),
                {
                    id: 1,
                    scene: new THREE.Scene()
                }
            );
            expect(buffer1).not.undefined;
            expect(buffer2).not.undefined;
            expect(buffer1).not.equals(buffer2);

            const mesh1 = buffer1!.buffer.mesh;
            const mesh2 = buffer2!.buffer.mesh;

            expect(buffer1!.buffer).not.equals(buffer2!.buffer);
            expect(mesh1).not.equals(mesh2);
            expect(mesh1.material).equals(mesh2.material);
        });

        it("POIs with same image and render order share buffer", () => {
            const poiInfo1 = new PoiInfoBuilder()
                .withImageTextureName("image1")
                .withImageItem()
                .build(textElement);

            const buffer1 = registry.registerPoi(poiInfo1, defaultPoiLayer);
            const buffer2 = registry.registerPoi(
                new PoiInfoBuilder()
                    .withImageTextureName(poiInfo1.imageTextureName)
                    .withImageItem()
                    .build(textElement),
                defaultPoiLayer
            );

            expect(buffer1).equals(buffer2).and.not.undefined;
            expect(buffer1!.buffer).equals(buffer2!.buffer);
        });

        it("POIs with different image do not share resources", () => {
            const buffer1 = registry.registerPoi(
                new PoiInfoBuilder()
                    .withImageTextureName("image1")
                    .withImageItem()
                    .build(textElement),
                defaultPoiLayer
            );
            const buffer2 = registry.registerPoi(
                new PoiInfoBuilder()
                    .withImageTextureName("image2")
                    .withImageItem()
                    .build(textElement),
                defaultPoiLayer
            );
            expect(buffer1).not.undefined;
            expect(buffer2).not.undefined;
            expect(buffer1).not.equals(buffer2);

            expect(buffer1!.buffer).not.equals(buffer2!.buffer);
            const mesh1 = buffer1!.buffer.mesh;
            const mesh2 = buffer2!.buffer.mesh;
            expect(mesh1).not.equals(mesh2);
            expect(mesh1.material).not.equals(mesh2.material);
            expect(mesh1.material).instanceOf(IconMaterial);
            expect(mesh2.material).instanceOf(IconMaterial);
            const material1 = mesh1.material as IconMaterial;
            const material2 = mesh2.material as IconMaterial;
            expect(material1.map).not.equals(material2.map);
        });

        it("resources are disposed when unused", () => {
            const result = registry.registerPoi(
                new PoiInfoBuilder().withImageItem().build(textElement),
                defaultPoiLayer
            );
            expect(result).not.undefined;
            const poiBuffer = result!;
            const material = poiBuffer.buffer.mesh.material as IconMaterial;

            const disposalSpies: sinon.SinonSpy[] = [
                sinon.spy(poiBuffer.buffer, "dispose"),
                sinon.spy(poiBuffer.layer.scene, "remove"),
                sinon.spy(material, "dispose"),
                sinon.spy(material.map, "dispose")
            ];

            poiBuffer.decreaseRefCount();

            for (const spy of disposalSpies) {
                expect(spy.calledOnce).is.true;
            }
        });
    });
});
