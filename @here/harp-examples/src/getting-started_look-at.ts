/*
 * Copyright (C) 2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoBox, GeoCoordinates, mercatorProjection, sphereProjection } from "@here/harp-geoutils";
import { GUI } from "dat.gui";

import { HelloWorldExample } from "./getting-started_hello-world_npm";

/**
 * This example builds on top of the [[HelloWorldExample]], so please consult that first for any
 * questions regarding basic setup of the map.
 *
 * In this example we show use the of [[MapView.lookAt]] method to focus camera on certain
 * world features (continents, countries, cities).
 *
 * Here a GUI is also set up so as to fiddle with the tilt and distance from the page.
 */
export namespace LookAtExample {
    const mapView = HelloWorldExample.mapView;
    mapView.projection = sphereProjection;
    mapView.setTheme({ extends: "resources/berlin_tilezen_base_globe.json" });
    mapView.tilt = 0;
    mapView.heading = 0;

    const exampleActions = {
        CenterGlobe() {
            mapView.lookAt({ target: { lat: 0, lng: 0 } });
        },
        ResetView() {
            mapView.lookAt({ heading: 0, tilt: 0 });
        },
        LookEast() {
            mapView.lookAt({ heading: 90 });
        },
        LookWest() {
            mapView.lookAt({ heading: -90 });
        },
        LookSouth() {
            mapView.lookAt({ heading: 180 });
        },
        Tilt45() {
            mapView.lookAt({ tilt: 45 });
        },
        Tilt0() {
            mapView.lookAt({ tilt: 0 });
        },
        GeoExtent10() {
            mapView.lookAt({ bounds: { latitudeSpan: 10, longitudeSpan: 10 } });
        },
        GeoExtentGlobe() {
            mapView.lookAt({ bounds: { latitudeSpan: 180, longitudeSpan: 360 } });
        }
    };

    const exampleBounds = {
        ["London"]: new GeoBox(
            new GeoCoordinates(51.28043, -0.56316),
            new GeoCoordinates(51.68629, 0.28206)
        ),
        ["Berlin"]: new GeoBox(
            new GeoCoordinates(52.37615, 13.11938),
            new GeoCoordinates(52.66058, 13.65801)
        ),
        ["France"]: new GeoBox(
            new GeoCoordinates(41.33374, -5.1406),
            new GeoCoordinates(51.08906, 9.55932)
        ),
        ["India"]: new GeoBox(
            new GeoCoordinates(6.75649, 68.17939),
            new GeoCoordinates(33.25441, 97.16157)
        ),
        ["USA"]: new GeoBox(
            new GeoCoordinates(24.527135, -131.660156),
            new GeoCoordinates(51.289406, -71.367188)
        ),
        ["World"]: new GeoBox(new GeoCoordinates(-55, -180), new GeoCoordinates(78, 180)),
        ["Europe"]: new GeoBox(
            new GeoCoordinates(34.307144, -25.839844),
            new GeoCoordinates(66.548263, 44.121094)
        ),

        // These features are defined by random points surrouding them to show that [[lookAt]]
        // can work with arbitrary point clouds too.
        ["Africa"]: [
            new GeoCoordinates(32.66827, 36.15456),
            new GeoCoordinates(9.87776, 55.79889),
            new GeoCoordinates(-21.14927, 55.41922),
            new GeoCoordinates(-37.23619, 10.88411),
            new GeoCoordinates(-34.66981, 39.03188),
            new GeoCoordinates(12.9366, -25.47008),
            new GeoCoordinates(37.64753, -10.81045)
        ],
        ["Australia"]: [
            new GeoCoordinates(0.319314, 130.85031),
            new GeoCoordinates(-4.03136, 153.57669),
            new GeoCoordinates(-28.94059, 156.3926),
            new GeoCoordinates(-45.25263, 147.50161),
            new GeoCoordinates(-36.99093, 113.46194),
            new GeoCoordinates(-21.93939, 112.09722)
        ],
        ["Asia"]: [
            new GeoCoordinates(38.70557, 25.095676273814004),
            new GeoCoordinates(40.46185, 25.83294696123821),
            new GeoCoordinates(47.56539, 49.337120152451824),
            new GeoCoordinates(73.83876, 68.08862941747252),
            new GeoCoordinates(81.76084, 90.62772020101889),
            new GeoCoordinates(67.63809, -168.68095103187997),
            new GeoCoordinates(62.90522, -171.40633287870494),
            new GeoCoordinates(48.53365, 157.00900173445882),
            new GeoCoordinates(34.06298, 141.58701888473408),
            new GeoCoordinates(-4.09993, 131.63498333285776),
            new GeoCoordinates(-10.31057, 127.50500787226275),
            new GeoCoordinates(-12.24436, 115.18798058166826),
            new GeoCoordinates(12.1344, 43.53950783023524),
            new GeoCoordinates(28.33851, 32.586304605269305)
        ],
        ["SouthAmerica"]: [
            new GeoCoordinates(-0.037727, -85.18558),
            new GeoCoordinates(12.08309, -79.51376),
            new GeoCoordinates(14.99663, -62.62817),
            new GeoCoordinates(-5.82442, -30.97989),
            new GeoCoordinates(-58.76469, -63.97934),
            new GeoCoordinates(-55.51751, -77.08135)
        ],
        ["NorthAmerica"]: [
            new GeoCoordinates(51.95849, -169.69321),
            new GeoCoordinates(82.20267, -5.83541),
            new GeoCoordinates(68.46351, -20.30972),
            new GeoCoordinates(46.1365, -51.80882),
            new GeoCoordinates(17.92657, -65.01497),
            new GeoCoordinates(4.20772, -79.38697),
            new GeoCoordinates(20.15675, -112.33495)
        ],

        // These features cross antimeridian and/or include poles to showcase that we support
        // these weird scenarios too.
        ["Antarctica"]: [
            new GeoCoordinates(-65.29705, 51.32607),
            new GeoCoordinates(-67.30229, -5.99415),
            new GeoCoordinates(-60.20446, -57.72913),
            new GeoCoordinates(-69.89815, -123.99539),
            new GeoCoordinates(-64.45382, 157.49746),
            new GeoCoordinates(-58.62286, 98.65179),
            new GeoCoordinates(-90, 180),
            new GeoCoordinates(-90, -180)
        ],
        ["PacificOcean"]: [
            new GeoCoordinates(27.0819, 116.99188331207404),
            new GeoCoordinates(64.74506, -175.21090904770676),
            new GeoCoordinates(7.32805, -78.13612731489623),
            new GeoCoordinates(-55.58942, -70.25827916326132),
            new GeoCoordinates(-75.2942, -123.99212082420046),
            new GeoCoordinates(-16.05847, 146.5315368832761)
        ],
        ["ArcticOcean"]: [
            new GeoCoordinates(68.45423, -67.72241699176338),
            new GeoCoordinates(65.63336, -17.597189318841238),
            new GeoCoordinates(63.30735, 38.63837863819523),
            new GeoCoordinates(66.05542, 73.80738827811217),
            new GeoCoordinates(70.19595, 131.7552825070622),
            new GeoCoordinates(65.12073, -168.5813757864778),
            new GeoCoordinates(50.9709, -81.03147632358663),
            new GeoCoordinates(90, 180),
            new GeoCoordinates(90, -180)
        ],
        ["BeringSea"]: [
            new GeoCoordinates(50.95019, -179.1428493376325),
            new GeoCoordinates(52.91106, 159.02544759162745),
            new GeoCoordinates(69.90354, 179.15147738391926),
            new GeoCoordinates(70.25714, -161.597647174786),
            new GeoCoordinates(55.76049, -157.31410465785078)
        ]
    };

    let lastLocationName: keyof typeof exampleBounds;
    function useLocation(name: keyof typeof exampleBounds) {
        mapView.lookAt({ bounds: exampleBounds[name] });
        lastLocationName = name;
    }

    useLocation("Europe");

    const gui = new GUI();

    const options = { globe: true };
    gui.add(options, "globe").onChange(() => {
        mapView.projection = options.globe ? sphereProjection : mercatorProjection;
        mapView.lookAt({ bounds: exampleBounds[lastLocationName] });
    });

    for (const exampleAction of Object.keys(exampleActions)) {
        const name = exampleAction.replace(/example/i, "");
        guiAddButton(gui, name, exampleActions[exampleAction as keyof typeof exampleActions]);
    }

    const boundsFolder = gui.addFolder("Bounds");
    for (const areaName of Object.keys(exampleBounds)) {
        guiAddButton(boundsFolder, areaName, () => {
            useLocation(areaName as keyof typeof exampleBounds);
        });
    }
}

function guiAddButton(gui: GUI, name: string, callback: () => void) {
    gui.add(
        {
            [name]: callback
        },
        name
    );
}
