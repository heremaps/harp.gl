/*
 * Copyright (C) 2017-2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

import { MapView, TextElement } from "@here/mapview";
import { TextVerticalAlignment } from "@here/text-renderer";

import * as THREE from "three";

// Disable priority to enforce render override.
const PRIORITY_ALWAYS = -1;

export namespace NewFontsExample {
    // creates a new MapView for the HTMLCanvasElement of the given id
    function initializeMapView(id: string): MapView {
        const canvas = document.getElementById(id) as HTMLCanvasElement;

        const fontMapView = new MapView({
            canvas,
            theme: "resources/dayTwoFonts.json"
        });

        fontMapView.camera.position.set(0, 0, 800);

        window.addEventListener("resize", () => {
            fontMapView.resize(window.innerWidth, window.innerHeight);
        });

        return fontMapView;
    }

    function addText(mapview: MapView) {
        const textArray: TextElement[] = [];
        const textA = new TextElement(
            "egypt",
            new THREE.Vector2(0, 0),
            PRIORITY_ALWAYS,
            1.5,
            0.0,
            0.0 * window.innerHeight,
            undefined,
            "TestStyle0"
        );
        textA.verticalAlignment = TextVerticalAlignment.Below;
        const textB = new TextElement(
            "مصر",
            new THREE.Vector2(0, 0),
            PRIORITY_ALWAYS,
            1.5,
            0.0,
            0.1 * window.innerHeight,
            undefined,
            "TestStyle0"
        );
        textB.verticalAlignment = TextVerticalAlignment.Below;
        const textC = new TextElement(
            "bahrain مصر kuwait",
            new THREE.Vector2(0, 0),
            PRIORITY_ALWAYS,
            1.5,
            0.0,
            0.2 * window.innerHeight,
            undefined,
            "TestStyle0"
        );
        textC.verticalAlignment = TextVerticalAlignment.Below;
        const textD = new TextElement(
            "The title is مفتاح معايير الويب, in Arabic.",
            new THREE.Vector2(0, 0),
            PRIORITY_ALWAYS,
            1.5,
            0.0,
            0.3 * window.innerHeight,
            undefined,
            "TestStyle0"
        );
        textD.verticalAlignment = TextVerticalAlignment.Below;
        const textE = new TextElement(
            "one two ثلاثة 1234 خمسة",
            new THREE.Vector2(0, 0),
            PRIORITY_ALWAYS,
            1.5,
            0.0,
            0.4 * window.innerHeight,
            undefined,
            "TestStyle0"
        );
        textE.verticalAlignment = TextVerticalAlignment.Below;
        const textF = new TextElement(
            "one two ثلاثة ١٢٣٤ خمسة",
            new THREE.Vector2(0, 0),
            PRIORITY_ALWAYS,
            1.5,
            0.0,
            0.5 * window.innerHeight,
            undefined,
            "TestStyle0"
        );
        textF.verticalAlignment = TextVerticalAlignment.Below;
        const textG = new TextElement(
            "0123456789",
            new THREE.Vector2(0, 0),
            PRIORITY_ALWAYS,
            1.5,
            0.0,
            0.6 * window.innerHeight,
            undefined,
            "TestStyle0"
        );
        textG.verticalAlignment = TextVerticalAlignment.Below;
        const textH = new TextElement(
            "سد 9 أبريل 1947",
            [
                new THREE.Vector2(0, 0.7 * window.innerHeight * window.devicePixelRatio),
                new THREE.Vector2(
                    0.25 * window.innerWidth * window.devicePixelRatio,
                    0.825 * window.innerHeight * window.devicePixelRatio
                ),
                new THREE.Vector2(
                    0.45 * window.innerWidth * window.devicePixelRatio,
                    0.75 * window.innerHeight * window.devicePixelRatio
                ),
                new THREE.Vector2(
                    0.95 * window.innerWidth * window.devicePixelRatio,
                    0.875 * window.innerHeight * window.devicePixelRatio
                ),
                new THREE.Vector2(
                    window.innerWidth * window.devicePixelRatio,
                    window.innerHeight * window.devicePixelRatio
                )
            ],
            PRIORITY_ALWAYS,
            1.5,
            0.0,
            0.0,
            undefined,
            "TestStyle0"
        );
        textH.verticalAlignment = TextVerticalAlignment.Below;
        const textI = new TextElement(
            "The title is مفتاح (معايير) الويب, in Arabic.",
            [
                new THREE.Vector2(0, 0.8 * window.innerHeight * window.devicePixelRatio),
                new THREE.Vector2(
                    0.25 * window.innerWidth * window.devicePixelRatio,
                    0.925 * window.innerHeight * window.devicePixelRatio
                ),
                new THREE.Vector2(
                    0.45 * window.innerWidth * window.devicePixelRatio,
                    0.85 * window.innerHeight * window.devicePixelRatio
                ),
                new THREE.Vector2(
                    0.95 * window.innerWidth * window.devicePixelRatio,
                    0.975 * window.innerHeight * window.devicePixelRatio
                ),
                new THREE.Vector2(
                    window.innerWidth * window.devicePixelRatio,
                    window.innerHeight * window.devicePixelRatio
                )
            ],
            PRIORITY_ALWAYS,
            1.5,
            0.0,
            0.0,
            undefined,
            "TestStyle0"
        );
        textI.verticalAlignment = TextVerticalAlignment.Below;

        textArray.push(textA, textB, textC, textD, textE, textF, textG, textH, textI);
        mapview.addOverlayText(textArray);
    }

    const mapView = initializeMapView("mapCanvas");
    addText(mapView);
}
