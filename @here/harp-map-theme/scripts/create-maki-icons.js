/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Create a texture atlas containing all the maki icons from the maki module.
 * run in map-theme: `node ./scripts/create-maki-icons.js`
 */

var fs = require("fs");
var Spritesmith = require("spritesmith");
const copyfiles = require("copyfiles");
const path = require("path");
const mkpath = require("mkpath");
const svg2png = require("svg2png");
const PNGImage = require("pngjs-image");
var Jimp = require("jimp");
var promiseLimit = require("promise-limit");

const makiSvgPath = path.resolve(__dirname, "../../../node_modules/@mapbox/maki/icons");

const resourcePath = path.resolve(__dirname, "../resources");
const resourcePathDev = resourcePath + "-dev";

const tempPath = path.resolve(__dirname, "../resources/temp");

mkpath.sync(tempPath);

// gather all maki SVG icons.
var svgFiles = [];

var files = fs.readdirSync(makiSvgPath);

files.map(fileName => {
    if (fileName.toLowerCase().indexOf(".svg") > 0) {
        svgFiles.push(fileName);
    }
});

// svgFiles = svgFiles.slice(0, 5);
// console.log(svgFiles);

// The two standard icon backgrounds as used in roads_shields.png. They are just white rounded
// squares, some more options are certainly required.
const bgImage17x17 = PNGImage.readImageSync(resourcePathDev + "/" + "icon-bg-17x17.png");
const bgImage22x22 = PNGImage.readImageSync(resourcePathDev + "/" + "icon-bg-22x22.png");

function alpha(value) {
    return value >> 24 >= 0 ? value >> 24 : 256 + (value >> 24);
}

function blue(value) {
    return (value >> 16) & 255;
}

function green(value) {
    return (value >> 8) & 255;
}

function red(value) {
    return value & 255;
}

/**
 * Mix fg and bg color, taking alpha into account.
 * @param {*} bg
 * @param {*} fg
 */
function mix(bg, fg) {
    const a = alpha(fg) / 255;

    let r = red(bg) * (1 - a) + red(fg) * a;
    let g = green(bg) * (1 - a) + green(fg) * a;
    let b = blue(bg) * (1 - a) + blue(fg) * a;

    return (alpha(bg) << 24) | ((Math.floor(b) << 16) + (Math.floor(g) << 8) + Math.floor(r));
}

/**
 * Mix fg and bg color, taking alpha into account. (premultiplied alpha)
 *
 * @param {*} bg
 * @param {*} fg
 */
function mixPremultiplied(bg, fg) {
    const a = alpha(fg) / 255;

    let r = red(bg) * (1 - a) + red(fg);
    let g = green(bg) * (1 - a) + green(fg);
    let b = blue(bg) * (1 - a) + blue(fg);

    return (alpha(bg) << 24) | ((Math.floor(b) << 16) + (Math.floor(g) << 8) + Math.floor(r));
}

function print(v) {
    const r = red(v);
    const g = green(v);
    const b = blue(v);
    const a = alpha(v);
    console.log(r, g, b, a);
}

/**
 * Render the fgImage into the bgImage, applying alpha in the fgImage.
 *
 * @param {*} bgImage
 * @param {*} fgImage
 * @param {*} offsetX
 * @param {*} offsetY
 */
function combineImages(bgImage, fgImage, offsetX = 0, offsetY = 0) {
    const outImage = PNGImage.copyImage(bgImage);

    const w = fgImage.getWidth();
    const h = fgImage.getHeight();

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const bgColor = bgImage.getAt(offsetX + x, offsetY + y);
            const fgColor = fgImage.getAt(x, y);
            outImage.setAt(offsetX + x, offsetY + y, mixPremultiplied(bgColor, fgColor));
        }
    }

    return outImage;
}

/**
 * Read the SVG file, convert to PNG. Option to use an internal scale factor to get smoother
 * results. Does not look much better, but kept in the code.
 *
 * @param {*} svgFileName
 * @param {*} pngFilename
 * @param {*} scale
 */
function readAndScaleImage(svgFileName, pngFilename, scale = 1.0) {
    let promise = new Promise((resolve, reject) => {
        console.log("converting to PNG:", svgFileName);

        fs.readFile(svgFileName, {}, (err, buffer) => {
            svg2png(buffer).then(outBuffer => {
                if (scale !== 1.0) {
                    fs.writeFile(pngFilename, outBuffer, {}, () => {
                        let image = PNGImage.readImageSync(pngFilename);
                        const imageWidth = image.getWidth();
                        const imageHeight = image.getHeight();
                        const targetWidth = Math.floor(imageWidth * scale);
                        const targetHeight = Math.floor(imageHeight * scale);
                        buffer = fs.readFileSync(svgFileName);

                        svg2png(buffer, { width: targetWidth, height: targetHeight }).then(
                            outBuffer => {
                                fs.writeFileSync(pngFilename, outBuffer);

                                const loadPromise = Jimp.read(pngFilename);

                                loadPromise
                                    .then(image => {
                                        image
                                            .resize(imageWidth, imageHeight, Jimp.RESIZE_BICUBIC)
                                            .write(pngFilename, image => {
                                                console.log("...scaled image:", pngFilename);
                                                resolve();
                                            });
                                    })
                                    .catch(function(err) {
                                        console.log("FAILED: readAndScaleImage", err);
                                        reject(new Error(err));
                                    });
                            }
                        );
                    });
                } else {
                    fs.writeFileSync(pngFilename, outBuffer);
                    resolve();
                }
            });
        });
    });

    return promise;
}

const SVG_SCALE_FACTOR = 1;

// Process the SVG icons in the maki folder. Since this is running in one process per icon, the
// number of promises/parallel jobs is limited to 16 (2 per CPU thread). Otherwise, the memory usage
// amy explode (> 16GB).

const readPromises = [];
var jobLimit = promiseLimit(16);

for (let svgFile of svgFiles) {
    const inFile = path.resolve(makiSvgPath, svgFile);
    let outFile = path.resolve(tempPath, path.basename(svgFile, path.extname(svgFile)) + ".png");
    const readPromise = jobLimit(() => {
        return readAndScaleImage(inFile, outFile, SVG_SCALE_FACTOR);
    });
    readPromises.push(readPromise);
}

// All SVG icons have been prepared as PNG images, and can now be processed by SPRITESMITH
Promise.all(readPromises).then(() => {
    for (let svgFile of svgFiles) {
        let outFile = path.resolve(
            tempPath,
            path.basename(svgFile, path.extname(svgFile)) + ".png"
        );

        let image = PNGImage.readImageSync(outFile);

        const w = image.getWidth();
        const h = image.getHeight();

        const bgImage = PNGImage.createImage(w, h);

        let outImage;

        if (w === 11) {
            outImage = combineImages(bgImage17x17, image, 3, 3);
        } else if (w === 15) {
            outImage = combineImages(bgImage22x22, image, 3, 3);
        }

        if (outImage) {
            outImage.writeImageSync(outFile);
        }
    }

    var iconFiles = fs.readdirSync(tempPath);

    iconFiles = iconFiles.map(name => {
        return path.resolve(tempPath, name);
    });

    console.log("Generating sprites.png...");

    // console.log(iconFiles);

    // Generate our texture atlas
    Spritesmith.run(
        {
            src: iconFiles,
            padding: 1 // Exaggerated for visibility, normally 1 or 2
        },
        function handleResult(err, result) {
            // If there was an error, throw it
            if (err) {
                throw err;
            }

            // Output the image
            fs.writeFileSync(path.resolve(resourcePath, "maki_icons.png"), result.image);

            const cleanResult = {};

            for (var filePath in result.coordinates) {
                cleanResult[path.basename(filePath, path.extname(filePath))] =
                    result.coordinates[filePath];
            }
            // Coordinates and properties
            // const text = JSON.stringify(cleanResult, undefined, 4);
            const text = JSON.stringify(cleanResult);
            fs.writeFileSync(path.resolve(resourcePath, "maki_icons.json"), text);

            console.log(cleanResult);

            iconFiles.forEach(tempFile => {
                fs.unlinkSync(tempFile);
            });
            fs.rmdirSync(tempPath);
        }
    );
});
