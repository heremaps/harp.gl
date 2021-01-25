/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import "style-loader!css-loader!highlight.js/styles/default.css";

import * as hljs from "highlight.js";

(() => {
    if (location.search === undefined || location.search.length === 0) {
        throw new Error("no query parameters");
    }

    const params = new URLSearchParams(location.search.slice(1));
    const src = params.get("src");
    if (!src || src.length === 0) {
        throw new Error("no 'src' query parameter");
    }

    const importRe = /(import.*(?:'|"))(\..*?)('|")/g;

    fetch(src, { credentials: "same-origin" })
        .then(response => {
            if (!response.ok) {
                throw new Error(response.statusText);
            }
            return response.text();
        })
        .then(contents => {
            const codeElement = document.getElementById("code");
            if (!codeElement) {
                throw new Error("no 'code' element in page");
            }

            const baseDir = src.substring(0, src.lastIndexOf("/"));
            const language = src.endsWith(".html") ? "html" : "typescript";
            const highlightedContents = hljs.highlight(language, contents, true);

            let highlightedHtml = highlightedContents.value;
            highlightedHtml = highlightedHtml.replace(importRe, (_, p1, p2, p3) => {
                return `${p1}<a href="${location.pathname}?src=${encodeURIComponent(
                    baseDir + "/" + p2 + ".ts"
                )}">${p2}</a>${p3}`;
            });

            codeElement.innerHTML = highlightedHtml;
        });
})();
