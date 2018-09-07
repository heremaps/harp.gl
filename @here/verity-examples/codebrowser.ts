/*
 * Copyright (C) 2017-2018 HERE Global B.V. and its affiliate(s).
 * All rights reserved.
 *
 * This software and other materials contain proprietary information
 * controlled by HERE and are protected by applicable copyright legislation.
 * Any use and utilization of this software and other materials and
 * disclosure to any third parties is conditional upon having a separate
 * agreement with HERE for the access, use, utilization or disclosure of this
 * software. In the absence of such agreement, the use of the software is not
 * allowed.
 */

import * as hljs from "highlight.js";
import "style-loader!css-loader!highlight.js/styles/default.css";

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
            const language = src.endsWith('.html')
                    ? 'html'
                    : 'typescript';
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
