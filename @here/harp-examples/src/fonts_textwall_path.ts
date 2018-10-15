import { MapView, TextElement } from "@here/mapview";

import * as THREE from "three";

// Disable priority to enforce render override.
const PRIORITY_ALWAYS = -1;

export namespace OldPathFontsExample {
    const str = "AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz";
    const width = window.innerWidth * window.devicePixelRatio;
    const height = window.innerHeight * window.devicePixelRatio;

    // creates a new MapView for the HTMLCanvasElement of the given id
    function initializeMapView(id: string): MapView {
        const canvas = document.getElementById(id) as HTMLCanvasElement;

        const fontMapView = new MapView({
            canvas,
            theme: "resources/dayTwoFonts.json"
        });

        fontMapView.camera.position.set(0, 0, 800);

        window.addEventListener("resize", () => {
            fontMapView.resize(width, height);
        });

        return fontMapView;
    }

    // tslint:disable-next-line:no-unused-variable
    function addText(mapview: MapView) {
        const textArray: TextElement[] = [
            new TextElement(
                str,
                [new THREE.Vector2(0, 0), new THREE.Vector2(width, height)],
                PRIORITY_ALWAYS,
                3.0,
                0.0,
                0.0,
                undefined,
                "TestStyle0"
            )
        ];
        let offset = 0.15;
        let scale = 2.5;
        for (let i = 0; i < 30; i++) {
            const styleA = i % 2 > 0 ? "TestStyle0" : "TestStyle2";
            const styleB = i % 2 > 0 ? "TestStyle1" : "TestStyle3";

            const textA = new TextElement(
                str,
                [new THREE.Vector2(0, 0), new THREE.Vector2(width, height)],
                PRIORITY_ALWAYS,
                scale,
                0.0,
                offset * height,
                undefined,
                styleA
            );
            const textB = new TextElement(
                str,
                [new THREE.Vector2(0, 0), new THREE.Vector2(width, height)],
                PRIORITY_ALWAYS,
                scale,
                offset * width,
                0.0,
                undefined,
                styleB
            );
            textB.bold = true;
            textArray.push(textA, textB);
            offset += (0.15 * scale) / 3.0;
            scale = 3.0 - offset * 3.0;
        }
        mapView.addOverlayText(textArray);
    }

    const mapView = initializeMapView("mapCanvas");
    addText(mapView);
}
