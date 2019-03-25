/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { MapControls } from "./MapControls";

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
    constructor(readonly controls: MapControls) {
        this.initStyle();

        this.domElement = document.createElement("div");
        const zoomInButton = document.createElement("button");
        zoomInButton.innerText = "+";
        const zoomOutButton = document.createElement("button");
        zoomOutButton.innerText = "-";
        const tiltButton = document.createElement("button");
        tiltButton.innerText = "3D";
        this.domElement.appendChild(zoomInButton);
        this.domElement.appendChild(tiltButton);
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

        this.domElement.style.cssText =
            "position: absolute; right: 10px; top: 50%; margin-top: -70px;";
        zoomInButton.className = zoomOutButton.className = tiltButton.className =
            "harp-gl_controls-button";

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
            }
            .harp-gl_controls-button:active {
                background-color: #37afaa;
                color: #eee
            }`)
        );
        document.head.appendChild(style);
    }
}
