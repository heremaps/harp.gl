/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//@ts-check

const { options } = require("./karma.options");

/**
 * @param {import("karma").Config} config
 */
("use.strict");
module.exports = function (config) {
    config.set({
        ...options(config.coverage, false, "")
    });
};
