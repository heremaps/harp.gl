/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

import {
    AtlasOptions,
    generateSprites,
    generateSpritesAtlas,
    ProcessingOptions
} from "@here/harp-atlas-tools/src";
import * as os from "os";
import * as path from "path";

// Allow to use console output, script runs in a shell (node), not in the browser.

const tmp = require("tmp");

function downloadMakiIcons(targetDir: string): Promise<string> {
    const ghdownload = require("github-download");
    const makiPath: string = path.join(__dirname, "..");
    return new Promise((resolve, reject) => {
        ghdownload("https://github.com/mapbox/maki#master", targetDir)
            .on("error", (err: any) => {
                reject(new Error(err));
            })
            .on("end", () => {
                resolve(path.join(makiPath, targetDir));
            });
    });
}

async function generateMakiAtlas(
    makiDir: string,
    atlasPath: string,
    smallIconsConfig: string,
    bigIconsConfig: string
) {
    const cpus: number = os.cpus() ? os.cpus().length : 4;
    // Create temprorary directory for sprites output inside makiDir
    const tmpDir = tmp.dirSync({ template: "sprites-XXXXXX", dir: makiDir, unsafeCleanup: true });
    const spritesInputPath: string = path.join(makiDir, "icons");
    const spritesOutputPath: string = tmpDir.name;

    // Smaller (11px) icons processing options.
    const spritesDaySmallOpt: ProcessingOptions = {
        input: path.join(spritesInputPath, "*-11.svg"),
        output: spritesOutputPath,
        width: 0,
        height: 0,
        verbose: false,
        jobs: cpus,
        processConfig: smallIconsConfig
    };

    // Bigger (15px) icons processing options.
    const spritesDayBigOpt: ProcessingOptions = {
        ...spritesDaySmallOpt,
        input: path.join(spritesInputPath, "*-15.svg"),
        processConfig: bigIconsConfig
    };

    try {
        // Generate maki -11 sprites (smaller size)
        await generateSprites(spritesDaySmallOpt);

        // Generate maki -15 sprites (bigger size)
        await generateSprites(spritesDayBigOpt);

        const atlasDayOpt: AtlasOptions = {
            input: path.join(spritesOutputPath, "*.png"),
            output: atlasPath,
            width: 0,
            height: 0,
            verbose: false,
            jobs: cpus,
            processConfig: "",
            padding: 1,
            minify: false
        };
        // Generate atlas from both sprites set
        await generateSpritesAtlas(atlasDayOpt);
    } finally {
        // Cleanup temporary directory
        tmpDir.removeCallback();
    }
}

async function prepareIcons() {
    const tmpDir = tmp.dirSync({ template: "resources-tmp-XXXXXX", dir: ".", unsafeCleanup: true });
    try {
        // Download maki icons set from github
        const makiDir: string = await downloadMakiIcons(tmpDir.name);

        // Create day mode icons atlas
        const atlasDay: string = "resources/maki_icons_day";
        const configDaySmall: string = "resources-dev/icons/configs/icons-day-maki-11.json";
        const configDayBig: string = "resources-dev/icons/configs/icons-day-maki-15.json";
        await generateMakiAtlas(makiDir, atlasDay, configDaySmall, configDayBig);

        // Create night mode icons atlas
        const atlasNight: string = "resources/maki_icons_night";
        const configNightSmall: string = "resources-dev/icons/configs/icons-night-maki-11.json";
        const configNightBig: string = "resources-dev/icons/configs/icons-night-maki-15.json";
        await generateMakiAtlas(makiDir, atlasNight, configNightSmall, configNightBig);
    } finally {
        // Manual cleanup
        tmpDir.removeCallback();
    }
}

prepareIcons()
    .then(() => {
        console.log("Assets prepare successful");
    })
    .catch(err => {
        console.error("Could not prepare assets! ", err);
    });
