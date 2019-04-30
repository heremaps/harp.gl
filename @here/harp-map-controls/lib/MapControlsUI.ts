/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { MapViewEventNames } from "@here/harp-mapview";
import { MapControls } from "./MapControls";

/**
 * Option for MapControlsUI.
 */
interface MapControlsUIOptions {
    /**
     * If specified, turns on the zoom level display or zoom level input.
     */
    zoomLevel?: "show" | "input";

    /**
     * Turns off default CSS styling for controls.
     */
    disableDefaultStyle?: boolean;
}

/**
 * Base class to handle UI overlay elements.
 */
export class MapControlsUI {
    /**
     * The DOM node containing the UI.
     */
    domElement: HTMLDivElement;

    /**
     * Constructor of the UI.
     *
     * @param controls Controls referencing a [[MapView]].
     */
    constructor(readonly controls: MapControls, options: MapControlsUIOptions = {}) {
        this.domElement = document.createElement("div");

        const zoomInButton = document.createElement("button");
        zoomInButton.innerText = "+";

        const zoomOutButton = document.createElement("button");
        zoomOutButton.innerText = "-";

        const tiltButton = document.createElement("button");
        tiltButton.innerText = "3D";

        // Optional zoom level displaying
        let zoomLevelElement: HTMLDivElement | HTMLInputElement | null = null;
        if (options.zoomLevel === "show") {
            const div = document.createElement("div");
            controls.mapView.addEventListener(MapViewEventNames.Render, () => {
                div.innerText = controls.zoomLevelTargetted.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                });
            });
            zoomLevelElement = div;
        } else if (options.zoomLevel === "input") {
            const input = document.createElement("input") as HTMLInputElement;
            input.type = "number";
            controls.mapView.addEventListener(MapViewEventNames.Render, () => {
                input.value = controls.zoomLevelTargetted.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                });
            });

            const updateZoom = (event: KeyboardEvent | FocusEvent) => {
                controls.setZoomLevel(parseFloat(input.value));
                event.preventDefault();
            };

            input.addEventListener("blur", updateZoom);
            input.addEventListener("keypress", event => {
                if (event.key === "Enter") {
                    updateZoom(event);
                }
            });

            // Removes focus from input element.
            window.addEventListener("click", event => {
                if (
                    !event ||
                    !event.target ||
                    !(event.target as any).contains ||
                    (event.target === input || (event.target as HTMLElement).contains(input))
                ) {
                    return;
                }
                input.blur();
            });

            zoomLevelElement = input;
        }

        this.domElement.appendChild(zoomInButton);
        this.domElement.appendChild(tiltButton);
        if (zoomLevelElement !== null) {
            this.domElement.appendChild(zoomLevelElement);
        }
        this.domElement.appendChild(zoomOutButton);

        zoomInButton.addEventListener("click", event => {
            const zoomLevel = controls.zoomLevelTargetted + controls.zoomLevelDeltaOnControl;
            controls.setZoomLevel(zoomLevel);
        });
        zoomOutButton.addEventListener("click", event => {
            const zoomLevel = controls.zoomLevelTargetted - controls.zoomLevelDeltaOnControl;
            controls.setZoomLevel(zoomLevel);
        });
        tiltButton.addEventListener("click", event => {
            controls.toggleTilt();
        });

        this.domElement.className = "harp-gl_controls";

        zoomInButton.className = zoomOutButton.className = tiltButton.className =
            "harp-gl_controls-button";

        if (zoomLevelElement !== null) {
            zoomLevelElement.className = "harp-gl_controls-zoom";
        }

        if (options.disableDefaultStyle !== true) {
            this.initStyle();
            this.domElement.style.cssText =
                "position: absolute; right: 10px; top: 50%; margin-top: -70px;";
        }

        return this;
    }

    private initStyle() {
        if (document.getElementById("here-harp-controls.map-controls-ui-styles") !== null) {
            return;
        }
        const style = document.createElement("style");
        style.id = "here-harp-controls.map-controls-ui-styles";
        style.appendChild(
            document.createTextNode(`
            .harp-gl_controls-button {
                display: block;
                background-color: #fff;
                width: 40px;
                height: 40px;
                font-size: 22px;
                font-weight: bold;
                outline: none;
                margin: 5px;
                border: none;
                color: #555;
                opacity: 0.87;
                cursor: pointer;
                border-radius: 4px;
                box-shadow: 0px 0px 4px #aaa;
                transition: all 0.1s;
                padding: 0 0 1px 1px;
                user-select: none;
            }
            .harp-gl_controls-button:active {
                background-color: #37afaa;
                color: #eee;
            }
            .harp-gl_controls-zoom {
                display: block;
                background-color: #fff;
                width: 40px;
                height: 20px;
                font-size: 12px;
                font-weight: bold;
                outline: none;
                margin: 5px;
                border: none;
                color: #555;
                opacity: 0.87;
                border-radius: 4px;
                box-shadow: 0px 0px 4px #aaa;
                padding: 2px 0 0;
                text-align: center;
                user-select: text;
            }
            input.harp-gl_controls-zoom::-webkit-outer-spin-button,
            input.harp-gl_controls-zoom::-webkit-inner-spin-button {
                /* display: none; <- Crashes Chrome on hover */
                -webkit-appearance: none;
                margin: 0; /* <-- Apparently some margin are still there even though it's hidden */
            }
            input.harp-gl_controls-zoom[type=number] {
                -moz-appearance:textfield; /* Firefox */
            }`)
        );
        document.head.appendChild(style);
    }
}
