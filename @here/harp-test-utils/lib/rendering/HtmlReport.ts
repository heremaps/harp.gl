/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImageTestResultLocal } from "./Interface";
import { getOutputImagePath } from "./RenderingTestResultCommon";

export interface HtmlReportOptions {
    title?: string;
}

export async function genHtmlReport(
    results: ImageTestResultLocal[],
    options: HtmlReportOptions,
    basePath: string
): Promise<[boolean, string]> {
    let someTestsFailed = false;
    const summaries = results.reduce(
        (r, result) => {
            const status =
                result.mismatchedPixels === undefined
                    ? "skipped"
                    : result.mismatchedPixels === 0
                    ? "success"
                    : "failed";
            if (status === "failed") {
                someTestsFailed = true;
            }
            Object.keys(result.imageProps).forEach(prop => {
                const value = result.imageProps[prop];
                const key = `${prop}=${value}`;
                if (!r[key]) {
                    r[key] = {
                        success: 0,
                        skipped: 0,
                        failed: 0
                    };
                }
                r[key][status] += 1;
            });
            r.summary[status] += 1;

            return r;
        },
        {
            summary: {
                success: 0,
                skipped: 0,
                failed: 0
            }
        } as any
    );
    const extendedResults = results.map(result => {
        return {
            ...result,
            title: Object.keys(result.imageProps)
                .sort()
                .map(key => `${key}=${result.imageProps[key]}`)
                .join(" / "),
            classes: Object.keys(result.imageProps)
                .map(key => cssClassName(result.imageProps[key]))
                .join(" ")
        };
    });

    function cssClassName(key: string) {
        return key.replace(/\./g, "-");
    }
    function onSelectKey(toggledKey: string) {
        // hide all

        const keyClassName = cssClassName(toggledKey);
        const globalSelections = (window as any).globalSelections;
        globalSelections[keyClassName] = !globalSelections[keyClassName];

        filterTestsResults();
        updateSelectorList();

        function filterTestsResults() {
            const all = document.querySelectorAll(".test-result");
            if (!all) {
                return;
            }
            all.forEach(item => {
                const htmlItem = item as HTMLElement;

                const enabled = Object.keys(globalSelections).reduce((result, key) => {
                    const keyEnabled = globalSelections[key];
                    if (keyEnabled) {
                        return result && htmlItem.classList.contains(key);
                    } else {
                        return result;
                    }
                }, true);

                htmlItem.style.display = enabled ? "block" : "none";
            });
        }
        function updateSelectorList() {
            const all = document.querySelectorAll(".selector");
            if (!all) {
                return;
            }
            all.forEach(item => {
                const htmlItem = item as HTMLElement;
                let enabled = false;
                htmlItem.classList.forEach(className => {
                    if (globalSelections[className]) {
                        enabled = true;
                    }
                });

                htmlItem.style.fontWeight = enabled ? "bold" : "normal";
            });
        }
    }

    const html = `
<html>
<head>
    <title>${options.title ?? "Image Based Tests Results"}</title>
    <script>
        var globalSelections = {};
        ${cssClassName}
        ${onSelectKey}
    </script>
    <style>
        .selected {
            font-weight: bold;
        }
        #navigation {
            position: fixed;
            left: 0px;
            width: 310px;
            height: 100%;
            overflow: auto;
            background: #fafafa;
        }
        #test-results {
            position: absolute;
            border: 0px;
            left: 310px;
            width: calc(100% - 310px);
        }
    </style>
</head>
<body>
    <div id="navigation">
        <h1>${options.title ?? "Image Based Tests Results"}</h1>
        <h3>Categories</h3>
        <ul>
            ${Object.keys(summaries)
                .filter(name => name !== "summary")
                .sort()
                .map(categoryTitle => {
                    const key2 = categoryTitle.split("=")[1];
                    return `
                    <li>
                        <a
                            class="selector ${cssClassName(key2)}"
                            onclick='javascript:onSelectKey("${key2}")'
                        >
                            ${categoryTitle}
                        </a>
                    </li>
                `;
                })
                .join("\n")}
        </ul>
        <h3>Tests</h3>
        <ul>
            ${extendedResults
                .map(result => {
                    return `
                    <li>
                        <a class="selector ${result.classes}" href="#${result.title}">
                            ${result.title}
                        </a>
                    </li>
                `;
                })
                .join("\n")}
        </ul>
    </div>
    <h2>
    <div id="test-results">
        <table>
            <thead>
                <tr>
                    <th>Category</th>
                    <th>Success</th>
                    <th>Failed</th>
                    <th>Skipped</th>
                </tr>
            </thead>
            ${Object.keys(summaries)
                .sort()
                .map(key => {
                    const summary = summaries[key];
                    const key2 = key.split("=")[1] || "";
                    return `
                    <tr>
                        <td class="selector ${cssClassName(key2)}">${key}</td>
                        <td>${summary.success}</td>
                        <td>${summary.failed}</td>
                        <td>${summary.skipped}</td>
                    </tr>
                `;
                })
                .join("\n")}
        </table>
        ${extendedResults
            .map((result, i) => {
                const referencePath = getOutputImagePath(result.imageProps, basePath);
                const classes = result.classes;
                const title = result.title;
                const actualImagePath = result.actualImagePath;

                return `
                    <div class="test-result ${classes}">
                        ${i !== 0 ? "<hr>" : ""}
                        <h2>${title}</h2>
                        <div style="display: flex; justify-content: space-around">
                            <div style="flex: 1 1 0%">
                                <img src="${actualImagePath}" style="width:100%; height: auto">
                            </div>
                            <div style="flex: 1 1 0%">
                                <img src="${referencePath}" style="width:100%; height: auto">
                            </div>
                            <div style="flex: 1 1 0%">
                                <img src="${
                                    result.diffImagePath ?? ""
                                }"  style="width:100%; height: auto">
                            </div>
                        </div>
                    </div>
                `;
            })
            .join("\n")}
    </div>
</body>
</html>
        `;
    return [someTestsFailed, html];
}
