import { ScreenProjector } from "../lib/ScreenProjector";

import { assert } from "chai";
import * as THREE from "three";

describe("screen projector test", () => {
    it("project3", () => {
        const camera = new THREE.PerspectiveCamera(45, 1, 1, 10);
        const sp = new ScreenProjector(camera);
        const result = new THREE.Vector3();

        assert.isUndefined(sp.project3(new THREE.Vector3(0, 0, 0), result));
        assert.deepEqual(new THREE.Vector3(), result);

        // On the near plane, rejected.
        assert.isUndefined(sp.project3(new THREE.Vector3(0, 0, -1), result));
        assert.deepEqual(new THREE.Vector3(), result);

        // Within near plane
        assert.exists(sp.project3(new THREE.Vector3(0, 0, -1.01), result));
        assert.notDeepEqual(new THREE.Vector3(), result);
        assert.exists(sp.project3(new THREE.Vector3(0, 0, -9.999), result));

        // At far plane, but rejected
        assert.isUndefined(sp.project3(new THREE.Vector3(0, 0, -10), result));
        assert.isUndefined(sp.project3(new THREE.Vector3(0, 0, -1000), result));
    });
});
