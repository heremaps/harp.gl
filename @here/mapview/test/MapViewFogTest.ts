/*
 * Copyright (C) 2017-2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

import { assert } from "chai";

import { Theme } from "@here/datasource-protocol";
import { SolidLineMaterial } from "@here/materials";
import { BoxGeometry, Fog, Mesh, Scene } from "three";
import { MapViewFog } from "../lib/MapViewFog";

describe("MapViewFog", () => {
    it("adds fog if defined in the provided theme", () => {
        const theme: Theme = {
            sky: { colorBottom: "#ffff12", colorTop: "", groundColor: "", type: "" },
            fog: { startRatio: 0.8 }
        }; // Theme with a fog definition.
        const scene = new Scene(); // Scene without fog.
        const fog = new MapViewFog(scene);
        fog.reset(theme);

        assert.equal(scene.fog !== null, true);
        assert.equal(scene.fog instanceof Fog, true);
        assert.equal((scene.fog as Fog).color.getHexString(), "ffff12");
    });

    it("handles fog disabling via MapViewFog#enabled", () => {
        const theme: Theme = {
            sky: { colorBottom: "#ffff12", colorTop: "", groundColor: "", type: "" },
            fog: { startRatio: 0.8 }
        }; // Theme with a fog definition.
        const scene = new Scene(); // Scene without fog.
        const fog = new MapViewFog(scene);
        fog.reset(theme); // This should enable fog.
        fog.enabled = false; // But this should then remove it.

        assert.equal(scene.fog, null);
    });

    it("handles fog disabling if not defined in the provided theme", () => {
        const theme: Theme = {}; // Theme with no fog definition.
        const scene = new Scene();
        scene.fog = new Fog(0x000000); // Scene with fog.
        const fog = new MapViewFog(scene);
        fog.reset(theme);

        assert.equal(scene.fog, null); // Fog should be removed.
    });

    it("handles RawShaderMaterial fog", () => {
        const scene = new Scene();
        const box = new Mesh(new BoxGeometry(1, 1, 1), new SolidLineMaterial());
        scene.fog = new Fog(0x000000);
        scene.add(box);
        const fog = new MapViewFog(scene);
        fog.enabled = false; // This should remove the fog define in the SolidLineMaterial.

        assert.equal((box.material as SolidLineMaterial).defines.USE_FOG, undefined);
    });
});
