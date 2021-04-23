/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { baseUrl } from "./UrlUtils";

/**
 * Get base URL for from where relative URLs will be loaded.
 *
 * * In browser, it resolves to `baseUrl(location.href)` i.e document's base URL
 * (see: https://www.w3.org/TR/WD-html40-970917/htmlweb.html#h-5.1.2).
 *
 * * In node, it resolves to `file://${process.cwd()}`.
 */
export function getAppBaseUrl() {
    var regex = new RegExp("data\:text\/html\;base64\,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{4})$");
    if (regex.test(window.location.href)) {
        return baseUrl("");
    }
    return baseUrl(window.location.href);
}
