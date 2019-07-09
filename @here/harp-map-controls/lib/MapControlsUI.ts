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
    readonly domElement = document.createElement("div");

    /**
     * Displays zoom level if [[MapControlsUIOptions.zoomLevel]] is defined.
     */
    private m_zoomLevelElement: HTMLDivElement | HTMLInputElement | null = null;
    /**
     * Removes focus from input element.
     */
    private m_onWindowClick: (event: MouseEvent) => void;
    /**
     * Updates the display of the zoom level.
     */
    private m_onMapViewRenderEvent: () => void;

    /**
     * Constructor of the UI.
     *
     * @param controls Controls referencing a [[MapView]].
     */
    constructor(readonly controls: MapControls, options: MapControlsUIOptions = {}) {
        this.m_onMapViewRenderEvent = () => {
            if (this.m_zoomLevelElement === null) {
                return;
            }

            const zoom = this.controls.zoomLevelTargeted.toFixed(1);

            if (this.m_zoomLevelElement.tagName === "INPUT") {
                (this.m_zoomLevelElement as HTMLInputElement).value = zoom;
            } else {
                (this.m_zoomLevelElement as HTMLDivElement).innerHTML = zoom;
            }
        };

        this.m_onWindowClick = (event: MouseEvent) => {
            const input = this.m_zoomLevelElement as HTMLInputElement;
            if (
                !event ||
                !event.target ||
                !(event.target as any).contains ||
                (event.target === input || (event.target as HTMLElement).contains(input))
            ) {
                return;
            }
            input.blur();
        };

        const zoomInButton = document.createElement("button");
        zoomInButton.innerText = "+";

        const zoomOutButton = document.createElement("button");
        zoomOutButton.innerText = "-";

        const tiltButton = document.createElement("button");
        tiltButton.innerText = "3D";
        tiltButton.id = "tiltButtonUi";

        // Optional zoom level displaying
        if (options.zoomLevel === "show") {
            const div = document.createElement("div");
            controls.mapView.addEventListener(
                MapViewEventNames.Render,
                this.m_onMapViewRenderEvent
            );
            this.m_zoomLevelElement = div;
        } else if (options.zoomLevel === "input") {
            const input = document.createElement("input");
            input.type = "number";
            controls.mapView.addEventListener(
                MapViewEventNames.Render,
                this.m_onMapViewRenderEvent
            );

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
            window.addEventListener("click", this.m_onWindowClick);
            this.m_zoomLevelElement = input;
        }

        this.domElement.appendChild(zoomInButton);
        this.domElement.appendChild(tiltButton);
        if (this.m_zoomLevelElement !== null) {
            this.domElement.appendChild(this.m_zoomLevelElement);
        }
        this.domElement.appendChild(zoomOutButton);

        zoomInButton.addEventListener("click", event => {
            const zoomLevel = controls.zoomLevelTargeted + controls.zoomLevelDeltaOnControl;
            controls.setZoomLevel(zoomLevel);
        });
        zoomOutButton.addEventListener("click", event => {
            const zoomLevel = controls.zoomLevelTargeted - controls.zoomLevelDeltaOnControl;
            controls.setZoomLevel(zoomLevel);
        });
        tiltButton.addEventListener("click", event => {
            controls.toggleTilt();
        });

        this.domElement.className = "harp-gl_controls";

        zoomInButton.className = zoomOutButton.className = tiltButton.className =
            "harp-gl_controls-button";

        if (this.m_zoomLevelElement !== null) {
            this.m_zoomLevelElement.className = "harp-gl_controls-zoom";
        }

        if (options.disableDefaultStyle !== true) {
            this.initStyle();
            this.domElement.style.cssText =
                "position: absolute; right: 10px; top: 50%; margin-top: -70px;";
        }

        return this;
    }

    /**
     * Destroy this [[MapControlsUI]] instance. Unregisters all event handlers used. This method
     * should be called when you stop using [[MapControlsUI]].
     */
    dispose() {
        if (this.m_zoomLevelElement !== null && this.m_zoomLevelElement.tagName === "INPUT") {
            window.removeEventListener("click", this.m_onWindowClick);
        }

        this.controls.mapView.removeEventListener(
            MapViewEventNames.Render,
            this.m_onMapViewRenderEvent
        );

        this.domElement.remove();
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
                background-color: #272d37;
                width: 40px;
                height: 40px;
                font-size: 22px;
                font-weight: bold;
                outline: none;
                margin: 5px;
                border: none;
                color: rgba(255, 255, 255, 0.8);
                cursor: pointer;
                border-radius: 4px;
                box-shadow: 0 1px 4px 0  rgba(15, 22, 33, 0.4);
                transition: all 0.1s;
                padding: 0 0 1px 1px;
                user-select: none;
            }
            #tiltButtonUi {
               font-size: 16px;
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
