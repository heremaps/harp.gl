/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

declare let self: Worker;
import { GeoCoordinates } from "@here/harp-geoutils";
import { MapView, RenderEvent } from "@here/harp-mapview";
import { setAppBaseUrl } from "@here/harp-utils";
import { EventEmitter } from "events";
import { createMap } from "./MapView";

export function init() {
    let map!: MapView;
    const eventHandler = new EventEmitter();

    self.addEventListener("message", (event: MessageEvent) => {
        const message = event.data;
        switch (message.type) {
            case "mapview-worker-init":
                {
                    setAppBaseUrl(message.baseUrl);
                    const canvas: OffscreenCanvas = message.canvas;
                    (canvas as any).style = {
                        width: `${message.clientWidth}px`,
                        height: `${message.clientHeight}px`
                    };
                    (canvas as any).clientWidth = message.clientWidth;
                    (canvas as any).clientHeight = message.clientHeight;

                    map = createMap({
                        canvas: (canvas as unknown) as HTMLCanvasElement,
                        pixelRatio: message.pixelRatio
                    });
                }
                break;
            case "resize":
                {
                    (map.canvas as any).style = {
                        width: `${message.width}px`,
                        height: `${message.height}px`
                    };
                    (map.canvas as any).clientHeight = message.height;
                    (map.canvas as any).clientWidth = message.width;
                    map.resize(message.width, message.height);
                }
                break;
            case "lookAt":
                {
                    map.lookAt(
                        new GeoCoordinates(message.lat, message.long),
                        message.distance,
                        message.tiltDeg,
                        message.headingDeg
                    );
                }
                break;
            case "beginAnimation":
                {
                    map.beginAnimation();
                }
                break;
            case "addEventListener":
                {
                    if (eventHandler.listenerCount(message.name) === 0) {
                        map.addEventListener(message.name, (ev: RenderEvent) => {
                            self.postMessage({
                                type: "event",
                                eventName: ev.type,
                                data: { type: ev.type, time: ev.time }
                            });
                        });
                    }
                }
                break;
        }
    });
}
