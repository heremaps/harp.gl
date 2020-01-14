/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable-next-line:no-implicit-dependencies
import "../css/index.css";
import { createMapViewInWorker } from "./WorkerMapViewFacade";

const s3Base = "https://www.harp.gl/docs/";

//Update initial links to s3 base
document.querySelector<HTMLAnchorElement>(".examples-link")!.href = s3Base + "master/examples/";
document.querySelector<HTMLAnchorElement>(".docs-link")!.href = s3Base + "master/doc/";
document.querySelector<HTMLAnchorElement>("#docs-nav")!.href = s3Base + "master/doc/";
document.querySelector<HTMLAnchorElement>("#examples-nav")!.href = s3Base + "master/examples/";
document.querySelector<HTMLAnchorElement>("#docs-nav-mobile")!.href = s3Base + "master/doc/";

//Update year
(document.getElementById("year") as HTMLDivElement).innerText = `${new Date().getFullYear()}`;

const releases = [
    {
        date: "latest",
        hash: "master",
        version: "latest-dev"
    }
];
const dropdown = document.querySelector("select[name=versions]") as HTMLSelectElement;

fetch("./releases.json")
    .then(res => res.json())
    .then(res => {
        releases.push(...res);
        releases.forEach(release => {
            const option = document.createElement("option");
            option.innerText = release.version;
            dropdown.appendChild(option);
        });

        dropdown.onchange = () => {
            const selected = dropdown.querySelector<HTMLOptionElement>("option:checked")!;
            const release = releases.find(x => x.version === selected.innerText);
            if (!release) {
                return;
            }
            const hash = release.hash;
            const version = release.version;

            //Update examples button and link
            document.querySelector<HTMLAnchorElement>(".examples-link")!.href =
                s3Base + hash + "/examples/";
            document.querySelector<HTMLAnchorElement>(".examples-link")!.innerText =
                "Examples" + (hash !== "master" ? ` (${version})` : "");

            //Update docs button and link
            document.querySelector<HTMLAnchorElement>(".docs-link")!.href = s3Base + hash + "/doc/";
            document.querySelector<HTMLAnchorElement>(".docs-link")!.innerText =
                "Documentation" + (hash !== "master" ? ` (${version})` : "");
        };
    })
    .catch(() => {
        //In case network request to build information fails, add master link
        const option = document.createElement("option");
        option.innerText = "master";
        dropdown.appendChild(option);
    });

async function createMapInt(canvas: HTMLCanvasElement) {
    if (typeof canvas.transferControlToOffscreen === "function") {
        // tslint:disable-next-line:no-console
        console.log("#starting mapview in worker");
        return createMapViewInWorker(canvas);
    } else {
        // tslint:disable-next-line:no-console
        console.log("#starting mapview in main thread");
        return import(/* webpackChunkName: "mapview-main" */ "./MapView").then(({ createMap }) => {
            return createMap({ canvas });
        });
    }
}

async function main() {
    const theCanvas = document.getElementById("map") as HTMLCanvasElement;
    const map = await createMapInt(theCanvas);

    map.resize(window.innerWidth, 500);
    window.addEventListener("resize", () => map.resize(window.innerWidth, 500));

    map.addEventListener("frame-complete", () => {
        // tslint:disable-next-line:no-console
        console.log("#FirstFrameComplete, showing canvas");
        theCanvas.style.opacity = "1";
    });
}

main();
