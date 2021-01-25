/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Env } from "@here/harp-datasource-protocol";
import { Math2D } from "@here/harp-utils";
import * as sinon from "sinon";
import * as THREE from "three";

import { PoiRenderer } from "../lib/poi/PoiRenderer";
import { ScreenCollisions } from "../lib/ScreenCollisions";
import { PoiInfo } from "../lib/text/TextElement";

/**
 * Creates a PoiRenderer stub.
 * @param sandbox - Sinon sandbox used to keep track of created stubs.
 * @param renderPoiSpy - Spy that will be called when [[renderPoi]] method is called on
 * the created PoiRenderer stub.
 * @returns PoiRenderer stub.
 */
export function stubPoiRenderer(
    sandbox: sinon.SinonSandbox,
    renderPoiSpy: sinon.SinonSpy
): sinon.SinonStubbedInstance<PoiRenderer> {
    const stub = sandbox.createStubInstance(PoiRenderer);
    stub.prepareRender.returns(true);

    // Workaround to capture the value of screenPosition vector on the time of the call,
    // otherwise it's lost afterwards since the same vector is used to pass positions for
    // other pois.
    stub.addPoi.callsFake(
        (
            poiInfo: PoiInfo,
            screenPosition: THREE.Vector2,
            screenCollisions: ScreenCollisions,
            _viewDistance: number,
            scale: number,
            allocateScreenSpace: boolean,
            opacity: number,
            env: Env
        ) => {
            // TODO: HARP-7648 Refactor PoiRenderer.renderPoi, to take out
            // bbox computation(already done during placement) and screen allocation (should
            // be done during placement instead).
            const bbox = new Math2D.Box();
            PoiRenderer.computeIconScreenBox(poiInfo, screenPosition, scale, env, bbox);
            if (allocateScreenSpace) {
                screenCollisions.allocate(bbox);
            }
            const screenPosCopy = screenPosition.toArray();
            if (opacity > 0) {
                renderPoiSpy(poiInfo, screenPosCopy, opacity);
                return true;
            }
            return false;
        }
    );

    return stub;
}
