/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Get base URL for from where relative URLs will be loaded.
 *
 * * In browser, it resolves to `baseUrl(location.href)` i.e document's base URL
 * (see: https://www.w3.org/TR/WD-html40-970917/htmlweb.html#h-5.1.2).
 *
 * * In node, it resolves to `file://${process.cwd()}`.
 */
export function getAppBaseUrl() {
    return `file://${process.cwd()}/`;
}
