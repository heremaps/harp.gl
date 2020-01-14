/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//
// Polyfill required for webpack infrastructure is able to load async chunks in worker context.
//
// See:
//   * https://github.com/webpack/webpack/issues/6472
//   * https://stackoverflow.com/a/59743427/269448
//
// Also, note that worker "main" script must load all the "dependent" code using dynamic import, i.e
//
// So, instead of:
//
//   import { start } from "./MyWorker";
//   start();
//
// we must do it asynchronously:
//
//   import("./MyWorker").then(({ start }) => {
//       start();
//   });
//

const extendedSelf = (self as any) as WindowOrWorkerGlobalScope & {
    document: any;
    importScripts(script: string): void;
};
if (
    typeof extendedSelf.document === "undefined" &&
    typeof extendedSelf.importScripts === "function"
) {
    extendedSelf.document = {
        createElement(tagName: string): any {
            if (tagName.toLowerCase() !== "script") {
                throw new Error("WebpackWorkerChunkPolyfill supports only faked <script> element");
            }
            return { tagName };
        },
        head: {
            appendChild(element: Element) {
                if (!element.tagName && element.tagName.toLowerCase() !== "script") {
                    throw new Error("WebpackWorkerChunkPolyfill invalid input");
                }
                const scriptElement = element as HTMLScriptElement;
                try {
                    extendedSelf.importScripts(scriptElement.src);
                    if (scriptElement.onload) {
                        scriptElement.onload(({
                            target: element,
                            type: "load"
                        } as unknown) as Event);
                    }
                } catch (error) {
                    // tslint:disable-next-line:no-console
                    console.error("WebpackWorkerChunkPolyfill: importScripts failed", error);
                    if (scriptElement.onerror) {
                        scriptElement.onerror(({
                            target: element,
                            type: "error"
                        } as unknown) as Event);
                    }
                }
            }
        }
    };
}
