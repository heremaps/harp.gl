/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoCoordinatesLike } from "@here/harp-geoutils";
import { getAppBaseUrl } from "@here/harp-utils";
import { EventEmitter } from "events";

export async function createMapViewInWorker(canvas: HTMLCanvasElement) {
    const offscreen = canvas.transferControlToOffscreen();
    const worker = new Worker("mapview-worker.main.js");

    worker.addEventListener("error", (event: ErrorEvent) => {
        // tslint:disable-next-line:no-console
        console.log("MapViewWorkerFacade#error!", event);
    });

    worker.postMessage(
        {
            type: "mapview-worker-init",
            canvas: offscreen,
            baseUrl: getAppBaseUrl(),
            clientHeight: canvas.clientHeight,
            clientWidth: canvas.clientWidth,
            pixelRatio: window.devicePixelRatio
        },
        [(offscreen as unknown) as Transferable]
    );

    const eventHandler = new EventEmitter();
    worker.addEventListener("message", (event: MessageEvent) => {
        const message = event.data;
        if (message.type === "event") {
            eventHandler.emit(message.eventName, message.data);
        }
    });

    return {
        resize(width: number, height: number) {
            worker.postMessage({ type: "resize", width, height });
        },
        addEventListener(name: string, listener: () => void) {
            if (eventHandler.listenerCount(name) === 0) {
                worker.postMessage({ type: "addEventListener", name });
            }

            eventHandler.on(name, listener);
        },
        // removeEventListener() {},
        lookAt(geoPos: GeoCoordinatesLike, distance: number, tiltDeg: number, headingDeg?: number) {
            worker.postMessage({
                type: "lookAt",
                lat: geoPos.latitude,
                long: geoPos.longitude,
                distance,
                tiltDeg,
                headingDeg
            });
        },
        beginAnimation() {
            worker.postMessage({ type: "beginAnimation" });
        }
    };
}
