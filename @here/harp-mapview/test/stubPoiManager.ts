/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import * as sinon from "sinon";

import { PoiManager } from "../lib/poi/PoiManager";

/**
 * Stubs poi manager.
 * @param sandbox - Sinon sandbox used to track created stubs.
 * @returns PoiManager stub.
 */
export function stubPoiManager(sandbox: sinon.SinonSandbox): PoiManager {
    const stub = sandbox.createStubInstance(PoiManager);
    stub.updatePoiFromPoiTable.returns(true);

    return (stub as unknown) as PoiManager;
}
