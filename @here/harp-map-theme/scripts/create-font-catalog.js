/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Script designed to generate the FontCatalog assets used to support multiple SDF fonts in
 * HARP4WEB.
 * Usage: npm run create-font-catalog -- -n <name> -f <file>
 */

const minimist = require("minimist");
const fs = require("fs");
const path = require("path");
const mkpath = require("mkpath");
const fontkit = require("fontkit");
const unicodeRanges = require("unicode-range-json");
const generateBMFont = require("msdf-bmfont-xml");

// Output JSON.
const fontCatalog = {
    name: "",
    fonts: [],
    supportedRanges: [],
    supportedSubranges: []
};

// SDF Texture Generation options.
const sdfOptions = {
    outputType: "json",
    filename: "",
    charset: "",
    fontSize: 32,
    texturePadding: 2,
    fieldType: "sdf",
    distanceRange: 8,
    smartSize: true
};

async function createFontRangeAssets(font, fontPath, unicodeRange, info, bold) {
    return new Promise((resolve, reject) => {
        const assetsDir = path.resolve(
            fontPath,
            bold === true
                ? `../../../resources/fonts/${fontCatalog.name}_BoldAssets/`
                : `../../../resources/fonts/${fontCatalog.name}_Assets/`
        );
        sdfOptions.filename = unicodeRange.category.replace(/ /g, "_");

        // Make sure that, for each unicode range, we store only the characters supported by the
        // font.
        let supportedCharset = "";
        for (let i = 0; i < info.characterSet.length; i++) {
            const codepoint = info.characterSet[i];
            if (codepoint >= unicodeRange.range[0] && codepoint <= unicodeRange.range[1]) {
                supportedCharset += String.fromCodePoint(codepoint);
            }
        }
        sdfOptions.charset = supportedCharset;

        if (sdfOptions.charset === "") {
            reject(
                `No characters in range "${unicodeRange.category}" are supported by font "${
                    font.name
                }".`
            );
        } else {
            console.log(
                (bold === true
                    ? "Generating BOLD assets for range: "
                    : "Generating assets for range: ") + unicodeRange.category
            );
            generateBMFont(fontPath, sdfOptions, (error, textures, rawJson) => {
                if (error) {
                    reject(error);
                    return;
                }

                // Make sure the destination path exists.
                mkpath.sync(assetsDir + "/" + font.name);

                // Save all the texture pages.
                textures.forEach((texture, index) => {
                    fs.writeFileSync(
                        `${assetsDir}/${font.name}/${texture.filename}.png`,
                        texture.texture
                    );
                });

                // Extend the json with ttf font information.
                // For more info regarding these metrics visit:
                // * https://www.freetype.org/freetype2/docs/glyphs/glyphs-3.html
                // * https://www.canva.com/learn/typography-terms/
                const json = JSON.parse(rawJson.data);
                json.metrics = {};
                json.metrics.unitsPerEm = info.unitsPerEm;
                json.metrics.ascent = info.ascent;
                json.metrics.descent = info.descent;
                json.metrics.lineGap = info.lineGap;
                json.metrics.underlinePosition = info.underlinePosition;
                json.metrics.underlineThickness = info.underlineThickness;
                json.metrics.italicAngle = info.italicAngle;
                json.metrics.capHeight = info.capHeight;
                json.metrics.xHeight = info.xHeight;
                json.metrics.bbox = info.bbox;
                const data = JSON.stringify(json);

                // Save the generated json.
                fs.writeFileSync(
                    `${assetsDir}/${font.name}/${unicodeRange.category.replace(/ /g, "_")}.json`,
                    data
                );
                resolve();
            });
        }
    });
}

async function createFontAssets(font, path, info, bold) {
    console.log("Generating assets for font: " + bold === true ? font.bold : font.name);

    // Generate an individual BMFont asset for each unicode range supported by this font.
    for (range of font.ranges) {
        let unicodeRange = undefined;
        for (let i = 0; i < unicodeRanges.length; i++) {
            if (unicodeRanges[i].category === range) {
                unicodeRange = unicodeRanges[i];
                break;
            }
        }

        // Check if we have a valid range.
        if (unicodeRange === undefined) {
            console.log(`WARN: Range "${range}" is not a valid Unicode Range.`);
            continue;
        }

        // Try generating assets for this range.
        try {
            await createFontRangeAssets(font, path, unicodeRange, info, bold);
        } catch (e) {
            console.log("WARN: " + e);
            continue;
        }

        // If suceeded, register this range in the fontCatalog.
        const rangeEntry = fontCatalog.supportedRanges.find(function(element) {
            return element.name === range.replace(/ /g, "_");
        });
        if (rangeEntry === undefined) {
            fontCatalog.supportedRanges.push({
                name: range.replace(/ /g, "_"),
                min: unicodeRange.range[0],
                max: unicodeRange.range[1],
                fonts: [font.name]
            });
        } else if (bold === false) {
            rangeEntry.fonts.push(font.name);
        }
    }
}

async function main() {
    const args = minimist(process.argv.slice(2));
    fontCatalog.name = args.n !== undefined ? args.n : "Default";

    console.log("Creating: " + fontCatalog.name);

    if (args.f === undefined) {
        console.error("ERROR: No supported fonts file was specified (-f).");
        return;
    }

    // Get the JSON file containing a description of all fonts included in this font catalog, and
    // the unicode ranges each one should support.
    const jsonDir = path.resolve(__dirname, args.f);
    const fontsJson = JSON.parse(
        fs.readFileSync(jsonDir, {
            encoding: "utf8"
        })
    );
    const fontDir = path.resolve(jsonDir, fontsJson.dir);

    // Generate the BMFont assets for all fonts.
    for (const font of fontsJson.fonts) {
        const fontPath = `${fontDir}/${font.name}.ttf`;
        const fontInfo = fontkit.openSync(fontPath);
        const fontObject = { name: font.name };

        // Store the unicode subranges supported by this font.
        const subranges = [];
        let minCodepoint = fontInfo.characterSet[0];
        let maxCodepoint = minCodepoint;
        for (let i = 0; i < fontInfo.characterSet.length; i++) {
            const codepoint = fontInfo.characterSet[i];
            const nextCodepoint = fontInfo.characterSet[(i + 1) % fontInfo.characterSet.length];
            if (i === fontInfo.characterSet.length - 1) {
                subranges.push({
                    min: minCodepoint,
                    max: codepoint
                });
            } else if (nextCodepoint - codepoint <= 1) {
                maxCodepoint = nextCodepoint;
            } else {
                subranges.push({
                    min: minCodepoint,
                    max: maxCodepoint
                });
                minCodepoint = nextCodepoint;
                maxCodepoint = minCodepoint;
            }
        }
        fontCatalog.supportedSubranges.push({
            name: font.name,
            subranges: subranges
        });

        // Create the font assets.
        await createFontAssets(font, fontPath, fontInfo, false);

        // Check if we need to also create assets for the bold font variant.
        if (font.bold !== undefined) {
            const bolFontPath = `${fontDir}/${font.bold}.ttf`;
            const bolFontInfo = fontkit.openSync(bolFontPath);
            fontObject.bold = font.bold;
            await createFontAssets(font, bolFontPath, bolFontInfo, true);
        }

        fontCatalog.fonts.push(fontObject);
    }

    // Wrote the font catalog to a file.
    const fontCatalogData = JSON.stringify(fontCatalog);
    fs.writeFileSync(
        path.resolve(__dirname, `../resources/fonts/${fontCatalog.name}_FontCatalog.json`),
        fontCatalogData
    );
}

main();
