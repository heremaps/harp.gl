import { MapView, TextElement } from "@here/mapview";
import { TextVerticalAlignment } from "@here/text-renderer";

import * as THREE from "three";

// Disable priority to enforce render override.
const PRIORITY_ALWAYS = -1;

export namespace NewFontsExample {
    const str = "AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz";

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

    function addBigText(fontMapView: MapView) {
        const textArray: TextElement[] = [];
        const textA = new TextElement(
            str,
            new THREE.Vector2(0, 0),
            PRIORITY_ALWAYS,
            3.0,
            0.0,
            0.0 * window.innerHeight,
            undefined,
            "TestStyle0"
        );
        textA.verticalAlignment = TextVerticalAlignment.Below;
        const textB = new TextElement(
            str,
            new THREE.Vector2(0, 0),
            PRIORITY_ALWAYS,
            3.0,
            0.0,
            0.1 * window.innerHeight,
            undefined,
            "TestStyle1"
        );
        textB.bold = true;
        textB.verticalAlignment = TextVerticalAlignment.Below;
        const textC = new TextElement(
            str,
            new THREE.Vector2(0, 0),
            PRIORITY_ALWAYS,
            2.0,
            0.0,
            0.21 * window.innerHeight,
            undefined,
            "TestStyle2"
        );
        textC.verticalAlignment = TextVerticalAlignment.Below;
        const textD = new TextElement(
            str,
            new THREE.Vector2(0, 0),
            PRIORITY_ALWAYS,
            2.0,
            0.0,
            0.28 * window.innerHeight,
            undefined,
            "TestStyle3"
        );
        textD.bold = true;
        textD.verticalAlignment = TextVerticalAlignment.Below;
        textArray.push(textA, textB, textC, textD);
        fontMapView.addOverlayText(textArray);
    }

    function addMediumText(fontMapView: MapView) {
        const textArray: TextElement[] = [];
        let offset = 0;
        let scale = 1.5;
        for (let i = 0; i < 10; i++) {
            const styleA = i % 2 > 0 ? "TestStyle2" : "TestStyle0";
            const styleB = i % 2 > 0 ? "TestStyle3" : "TestStyle1";

            const textA = new TextElement(
                str,
                new THREE.Vector2(0, 0),
                PRIORITY_ALWAYS,
                scale,
                0.0,
                (0.36 + offset) * window.innerHeight,
                undefined,
                styleA
            );
            textA.verticalAlignment = TextVerticalAlignment.Below;
            const textB = new TextElement(
                str,
                new THREE.Vector2(0, 0),
                PRIORITY_ALWAYS,
                scale,
                0.0,
                (0.36 + offset + scale * 0.033) * window.innerHeight,
                undefined,
                styleB
            );
            textB.bold = true;
            textB.verticalAlignment = TextVerticalAlignment.Below;
            textArray.push(textA, textB);
            offset += 0.066 * scale;
            scale = 1.25 - offset;
        }
        fontMapView.addOverlayText(textArray);
    }

    function addSmallText(fontMapView: MapView) {
        const textArray: TextElement[] = [];
        let offset = 0;
        let scale = 0.5;
        for (let i = 0; i < 25; i++) {
            const styleA = i % 2 > 0 ? "TestStyle2" : "TestStyle0";
            const styleB = i % 2 > 0 ? "TestStyle3" : "TestStyle1";

            const textA = new TextElement(
                str,
                new THREE.Vector2(0, 0),
                PRIORITY_ALWAYS,
                scale,
                0.66 * window.innerWidth,
                (0.57 + offset) * window.innerHeight,
                undefined,
                styleA
            );
            textA.verticalAlignment = TextVerticalAlignment.Below;
            const textB = new TextElement(
                str,
                new THREE.Vector2(0, 0),
                PRIORITY_ALWAYS,
                scale,
                0.66 * window.innerWidth,
                (0.57 + offset + scale * 0.033) * window.innerHeight,
                undefined,
                styleB
            );
            textB.bold = true;
            textB.verticalAlignment = TextVerticalAlignment.Below;
            textArray.push(textA, textB);
            offset += 0.066 * scale;
            scale = 0.5 - offset;
        }
        fontMapView.addOverlayText(textArray);
    }

    function addText(mapview: MapView) {
        addBigText(mapview);
        addMediumText(mapview);
        addSmallText(mapview);
    }

    const mapView = initializeMapView("mapCanvas");
    addText(mapView);
}
