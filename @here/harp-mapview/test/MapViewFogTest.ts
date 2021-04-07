/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { Fog as FogConfig } from "@here/harp-datasource-protocol";
import { SolidLineMaterial } from "@here/harp-materials";
import { assert } from "chai";
import { BoxGeometry, Fog, Mesh, Scene } from "three";

import { MapViewFog } from "../lib/MapViewFog";

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

describe("MapViewFog", function () {
    it("adds fog if defined in the provided theme", function () {
        const fogConfig: FogConfig = { color: "#ffff12", startRatio: 0.8 };
        const scene = new Scene(); // Scene without fog.
        const fog = new MapViewFog(scene);
        fog.reset(fogConfig);

        assert.equal(scene.fog !== null, true);
        assert.equal(scene.fog instanceof Fog, true);
        assert.equal((scene.fog as Fog).color.getHexString(), "ffff12");
    });

    it("handles fog disabling via MapViewFog#enabled", function () {
        const fogConfig: FogConfig = { color: "#ffff12", startRatio: 0.8 };
        const scene = new Scene(); // Scene without fog.
        const fog = new MapViewFog(scene);
        fog.reset(fogConfig); // This should enable fog.
        fog.enabled = false; // But this should then remove it.

        assert.equal(scene.fog, null);
    });

    it("handles fog disabling if not defined in the provided theme", function () {
        const scene = new Scene();
        scene.fog = new Fog(0x000000); // Scene with fog.
        const fog = new MapViewFog(scene);
        fog.reset();

        assert.equal(scene.fog, null); // Fog should be removed.
    });

    it("handles RawShaderMaterial fog", function () {
        const scene = new Scene();
        const box = new Mesh(
            new BoxGeometry(1, 1, 1),
            new SolidLineMaterial({ rendererCapabilities: { isWebGL2: false } as any })
        );
        scene.fog = new Fog(0x000000);
        scene.add(box);
        const fog = new MapViewFog(scene);
        fog.enabled = false; // This should remove the fog define in the SolidLineMaterial.

        assert.equal((box.material as SolidLineMaterial).defines.USE_FOG, undefined);
    });
});
