/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as child_process from "child_process";

function shellSync(command: string) {
    const { status, signal } = child_process.spawnSync(command, {
        shell: true,
        stdio: "inherit"
    });

    if (status !== null && status !== 0) {
        throw new Error(`command '${command}' failed with exit code ${status}`);
    } else if (signal) {
        throw new Error(`command '${command}' failed with signal ${signal}`);
    }
}

shellSync("yarn workspace @here/harp-datasource-protocol generate-json-schema");
