/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { mercatorProjection, ProjectionType, sphereProjection } from "@here/harp-geoutils";
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
     * If specified, allows to switch between mercator and sphere projections at runtime.
     */
    projectionSwitch?: boolean;

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

    private readonly m_buttonsElement: HTMLDivElement = document.createElement("div");

    /**
     * Displays zoom level if [[MapControlsUIOptions.zoomLevel]] is defined.
     */
    private readonly m_zoomLevelElement: HTMLDivElement | HTMLInputElement | null = null;

    /**
     * Displays zoom level if [[MapControlsUIOptions.projectionSwitch]] is defined.
     */
    private readonly m_projectionSwitchElement: HTMLButtonElement | null = null;

    /**
     * Removes focus from input element.
     */
    private readonly m_onWindowClick: (event: MouseEvent) => void;

    /**
     * Updates the display of the zoom level.
     */
    private readonly m_onMapViewRenderEvent: () => void;

    /**
     * Constructor of the UI.
     *
     * @param controls - Controls referencing a [[MapView]].
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
                event.target === input ||
                (event.target as HTMLElement).contains(input)
            ) {
                return;
            }
            input.blur();
        };

        // Empty element to dynamically align the controls vertically, depending on which buttons
        // are enabled. Avoids unreliable style computations in the script.
        const verticalAligner = document.createElement("span");
        verticalAligner.className = "harp-gl_v-align";
        this.domElement.appendChild(verticalAligner);

        // This element will receive the controls and ensure the vertical alignment in the CSS.
        this.m_buttonsElement = document.createElement("div");
        this.m_buttonsElement.className = "harp-gl_v-aligned";
        this.domElement.appendChild(this.m_buttonsElement);

        const zoomInButton = document.createElement("button");
        zoomInButton.innerText = "+";
        zoomInButton.className = "harp-gl_controls_button-top";
        zoomInButton.classList.add("harp-gl_controls-button");

        const zoomOutButton = document.createElement("button");
        zoomOutButton.innerText = "-";
        zoomOutButton.className = "harp-gl_controls_button-bottom";
        zoomOutButton.classList.add("harp-gl_controls-button");

        const tiltButton = document.createElement("button");
        tiltButton.innerText = "3D";
        tiltButton.id = "harp-gl_controls_tilt-button-ui";
        tiltButton.title = "Toggle tilt";
        tiltButton.classList.add("harp-gl_controls-button");
        tiltButton.classList.add("harp-gl_controls_button-bottom");

        const compassButton = document.createElement("button");
        compassButton.id = "harp-gl_controls-button_compass";
        compassButton.title = "Reset North";
        compassButton.classList.add("harp-gl_controls-button");
        compassButton.classList.add("harp-gl_controls_button-top");
        const compass = document.createElement("span");
        compass.id = "harp-gl_controls_compass";
        compassButton.appendChild(compass);

        // Optional zoom level displaying
        if (options.zoomLevel === "show") {
            this.m_zoomLevelElement = document.createElement("div");
            controls.mapView.addEventListener(
                MapViewEventNames.Render,
                this.m_onMapViewRenderEvent
            );
        } else if (options.zoomLevel === "input") {
            const input = document.createElement("input");
            input.type = "number";
            input.step = "0.1"; // Avoids messages in the UI on hovering, when a tenth value exists.
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

        if (options.projectionSwitch) {
            const switcher = document.createElement("button");
            switcher.id = "harp-gl_controls_switch_projection";
            switcher.classList.add("harp-gl_controls-button");
            const getTitle: () => string = () => {
                return `Switch to ${
                    this.controls.mapView.projection.type === ProjectionType.Spherical
                        ? "flat"
                        : "globe"
                } projection`;
            };
            switcher.title = getTitle();
            const globeSVG = getGlobeSVG();
            const flatMapSVG = getFlatMapSVG();
            switcher.innerHTML =
                this.controls.mapView.projection.type === ProjectionType.Spherical
                    ? flatMapSVG
                    : globeSVG;
            switcher.addEventListener("click", () => {
                this.controls.mapView.projection =
                    this.controls.mapView.projection.type === ProjectionType.Spherical
                        ? mercatorProjection
                        : sphereProjection;
                switcher.title = getTitle();
                switcher.innerHTML =
                    this.controls.mapView.projection.type === ProjectionType.Spherical
                        ? flatMapSVG
                        : globeSVG;
            });
            this.m_projectionSwitchElement = switcher;
        }

        this.m_buttonsElement.appendChild(zoomInButton);
        if (this.m_zoomLevelElement !== null) {
            this.m_buttonsElement.appendChild(this.m_zoomLevelElement);
        }
        this.m_buttonsElement.appendChild(zoomOutButton);
        this.m_buttonsElement.appendChild(compassButton);
        this.m_buttonsElement.appendChild(tiltButton);
        if (this.m_projectionSwitchElement !== null) {
            this.m_buttonsElement.appendChild(this.m_projectionSwitchElement);
        }

        zoomInButton.addEventListener("click", event => {
            const zoomLevel = controls.zoomLevelTargeted + controls.zoomLevelDeltaOnControl;
            controls.setZoomLevel(zoomLevel);
        });
        zoomInButton.addEventListener("dblclick", event => {
            // HARP-10298: Avoid double click event propagation to canvas in WebKit-based browsers
            // when a zoom button is quickly clicked multiple times.
            event.stopPropagation();
        });
        zoomOutButton.addEventListener("click", event => {
            const zoomLevel = controls.zoomLevelTargeted - controls.zoomLevelDeltaOnControl;
            controls.setZoomLevel(zoomLevel);
        });
        zoomOutButton.addEventListener("dblclick", event => {
            // HARP-10298: Avoid double click event propagation to canvas in WebKit-based browsers
            // when a zoom button is quickly clicked multiple times.
            event.stopPropagation();
        });
        tiltButton.addEventListener("click", event => {
            controls.toggleTilt();
        });
        compassButton.addEventListener("click", event => {
            controls.pointToNorth();
        });
        controls.mapView.addEventListener(MapViewEventNames.AfterRender, () => {
            compass.style.transform = `rotate(${controls.mapView.heading}deg)`;
        });

        this.domElement.className = "harp-gl_controls";

        if (this.m_zoomLevelElement !== null) {
            this.m_zoomLevelElement.classList.add("harp-gl_controls_zoom-level");
        }

        if (options.disableDefaultStyle !== true) {
            this.initStyle();
            this.domElement.style.cssText = `
                position: absolute;
                right: 5px;
                top: 0;
                height: 100%; /* Vertical alignment is done dynamically, in the rest of the CSS. */
                pointer-events: none; /* Allows to click the map even though height is 100%. */
            `;
        }

        return this;
    }

    get projectionSwitchElement(): HTMLButtonElement | null {
        return this.m_projectionSwitchElement;
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
        style.appendChild(document.createTextNode(getTextStyle()));
        document.head.appendChild(style);
    }
}

function getTextStyle() {
    return `
        /* CSS trick to align another div dynamically. */
        .harp-gl_v-align{
            height: 100%;
            display: inline-block;
            vertical-align: middle;
        }
        /* The target element to align vertically with vertical-align. */
        .harp-gl_v-aligned{
            pointer-events: all;
            vertical-align: middle;
            display: inline-block;
        }
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
            box-shadow: 0px 0px 5px 0 hsl(220, 4%, 40%);
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
        .harp-gl_controls_button-top{
            margin-bottom:0;
            border-bottom-right-radius:0;
            border-bottom-left-radius:0;
        }
        .harp-gl_controls_button-bottom{
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
            overflow: hidden;
            margin: 5px 0 0 0;
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
        #harp-gl_controls_switch_projection{
            margin-top:5px;
        }
        .harp-gl_controls_switch_svg{
            width: 25px;
            height: 25px;
            stroke: #d4d5d7;
            fill: #d4d5d7;
        }
    `;
}

function getFlatMapSVG() {
    return `
    <svg style="margin-top:5px;" class="harp-gl_controls_switch_svg" width="25" height="25" xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg">
        <rect id="svg_1" stroke-width="2" height="13.51524" width="18.35821" y="5.80349" x="3.21307" fill="none"/>
        <path id="svg_14" d="m9.52018,7.71815l1.2357,-0.0032l-0.61945,1.18258l-0.61625,-1.17938z"/>
        <path id="svg_15" d="m4.11409,7.32396l3.65718,-0.0032l0.28156,2.13991l-2.59042,1.57678l0.50682,1.80203l2.25254,0.8447l-0.90101,2.0836l0.28157,2.25254l-3.26619,-3.04093l0.67576,-2.02728l-0.61945,-1.97097l-1.01364,-3.15356l0.73528,-0.50362z"/>
        <path id="svg_17" d="m13.23688,7.4929l2.02409,-0.0032l0.78839,1.29521l2.47779,-1.35152l2.75936,0.78839l0,1.57678l-0.73208,0.61945l-0.28157,1.97097c0,0 -0.67256,0.8479 -0.72888,0.90422c-0.05631,0.05631 0.28157,1.06996 0.33788,1.18258c0.05631,0.11263 -1.68941,-1.35152 -1.6926,-1.35472c-0.0032,-0.0032 -0.16574,1.29841 -0.16894,1.29521c-0.0032,-0.0032 -1.57358,-1.34832 -1.57678,-1.35152c-0.0032,-0.0032 -0.72888,0.67896 -0.73208,0.67576c-0.0032,-0.0032 -0.8415,-0.67256 -0.8447,-0.67576c-0.0032,-0.0032 0.73528,2.0868 0.79159,2.0868c0.05631,0 -0.50682,3.20987 -0.51002,3.20667c-0.0032,-0.0032 -1.2357,-0.16574 -1.34832,-0.16574c-0.11263,0 -0.95733,-1.52046 -0.90102,-1.57678c0.05631,-0.05631 0,-1.80203 -0.0032,-1.80523c-0.0032,-0.0032 -1.40464,-0.33468 -1.40784,-0.33788c-0.0032,-0.0032 -0.05311,-1.74252 -0.05631,-1.74572c-0.0032,-0.0032 1.18578,-0.8415 1.18258,-0.8447c-0.0032,-0.0032 1.69261,-0.16574 1.74892,-0.16574c0.05631,0 1.2389,-1.06996 1.2357,-1.07316c-0.0032,-0.0032 -1.91146,-0.10943 -1.91466,-0.11263c-0.0032,-0.0032 -1.96777,0.17214 -1.97097,0.16894c-0.0032,-0.0032 1.52366,-3.20667 1.52366,-3.20667z"/>
    </svg>`;
}

function getGlobeSVG() {
    return `
    <svg style="margin-top:5px;" stroke-width="2" class="harp-gl_controls_switch_svg" width="50" height="50" viewBox="0 0 25 25" xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg">
        <ellipse ry="9.79855" rx="4.56139" id="svg_6" cy="11.99798" cx="11.99798" fill="none"/>
        <line id="svg_8" y2="8.16866" x2="21.12086" y1="8.16866" x1="3.10044"/>
        <line id="svg_9" y2="16.10887" x2="21.0645" y1="16.10887" x1="3.04409"/>
        <ellipse id="svg_11" ry="9.79855" rx="9.82671" cy="11.94167" cx="12.02614" fill="none"/>
    </svg>`;
}
