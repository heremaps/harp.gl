/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { MapViewEventNames, MapViewUtils } from "@here/harp-mapview";
import * as THREE from "three";
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
        zoomInButton.id = "harp-gl_controls_zoom-in";

        const zoomOutButton = document.createElement("button");
        zoomOutButton.innerText = "-";
        zoomOutButton.id = "harp-gl_controls_zoom-out";

        const tiltButton = document.createElement("button");
        tiltButton.innerText = "3D";
        tiltButton.id = "harp-gl_controls_tilt-button-ui";

        const compassButton = document.createElement("button");
        compassButton.id = "harp-gl_controls-button_compass";
        const compass = document.createElement("span");
        compass.id = "harp-gl_controls_compass";
        compassButton.appendChild(compass);

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
        if (this.m_zoomLevelElement !== null) {
            this.domElement.appendChild(this.m_zoomLevelElement);
        }
        this.domElement.appendChild(zoomOutButton);
        this.domElement.appendChild(compassButton);
        this.domElement.appendChild(tiltButton);

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
        compassButton.addEventListener("click", event => {
            controls.pointToNorth();
        });
        controls.mapView.addEventListener(MapViewEventNames.AfterRender, () => {
            compass.style.transform = `rotate(${THREE.Math.radToDeg(
                MapViewUtils.extractAttitude(controls.mapView, controls.mapView.camera).yaw
            )}deg)`;
        });

        this.domElement.className = "harp-gl_controls";

        zoomInButton.className = zoomOutButton.className = "harp-gl_controls-button";
        tiltButton.className = compassButton.className = "harp-gl_controls-button";

        if (this.m_zoomLevelElement !== null) {
            this.m_zoomLevelElement.className = "harp-gl_controls_zoom-level";
        }

        if (options.disableDefaultStyle !== true) {
            this.initStyle();
            this.domElement.style.cssText =
                "position: absolute; right: 5px; top: 50%; margin-top: -85px;";
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
                margin:0;
                border: none;
                color: rgba(255, 255, 255, 0.8);
                cursor: pointer;
                border-radius: 4px;
                box-shadow: 0 1px 4px 0  rgba(15, 22, 33, 0.4);
                transition: all 0.1s;
                padding: 0 0 1px 1px;
                user-select: none;
                position:relative;
            }
            #harp-gl_controls_tilt-button-ui {
               font-size: 16px;
            }
            .harp-gl_controls-button:active {
                background-color: #37afaa;
                color: #eee;
            }
            .harp-gl_controls-button:focus {
                outline:none;
            }
            #harp-gl_controls_zoom-in{
                margin-bottom:0;
                border-bottom-right-radius:0;
                border-bottom-left-radius:0;
            }
            #harp-gl_controls_zoom-out{
                margin-top:1px;
                border-top-right-radius:0;
                border-top-left-radius:0;
            }
            .harp-gl_controls_zoom-level {
                display: block;
                background-color: #fff;
                width: 40px;
                height: 20px;
                font-size: 12px;
                font-weight: bold;
                outline: none;
                border: none;
                color: #555;
                margin-left:5px;
                opacity: 0.87;
                box-shadow: 0px 0px 4px #aaa;
                padding: 2px 0 0;
                text-align: center;
                user-select: text;
            }
            input.harp-gl_controls_zoom-level::-webkit-outer-spin-button,
            input.harp-gl_controls_zoom-level::-webkit-inner-spin-button {
                /* display: none; <- Crashes Chrome on hover */
                -webkit-appearance: none;
                margin: 0; /* <-- Apparently some margin are still there even though it's hidden */
            }
            input.harp-gl_controls_zoom-level[type=number] {
                -moz-appearance:textfield; /* Firefox */
            }
            #harp-gl_controls-button_compass{
                margin: 5px 0;
            }
            #harp-gl_controls_compass{
                pointer-events:none;
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                margin:0
            }
            #harp-gl_controls_compass::after{
                content: " ";
                position:absolute;
                left:50%;
                margin-left:-3px;
                top:50%;
                margin-top: -18px;
                border:solid 3px rgba(0,0,0,0);
                border-bottom:solid 15px #a34f2e;
            }
            #harp-gl_controls_compass::before{
                content: " ";
                position:absolute;
                left:50%;
                margin-left:-3px;
                top:50%;
                margin-top:0px;
                border:solid 3px rgba(0,0,0,0);
                border-top:solid 15px #eee;
            }
            `)
        );
        document.head.appendChild(style);
    }
}
