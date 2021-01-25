/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { waitImageLoaded } from "./DomImageUtils";

const SIZE = 15;
const SCALE = 10;

function rgbToHex(r: number, g: number, b: number) {
    if (r > 255 || g > 255 || b > 255) {
        throw new Error("Invalid color component");
    }
    return ((r << 16) | (g << 8) | b).toString(16).toUpperCase();
}
type RGBColorTuple = [number, number, number];

function rgbToString(rgb: RGBColorTuple) {
    return `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`;
}
function htmlColor(rgb: RGBColorTuple) {
    return "#" + rgbToHex(rgb[0], rgb[1], rgb[2]);
}
function colorIndicator(rgb: RGBColorTuple) {
    return `<div
        style='
            display: inline-block;
            border: 1px solid grey;
            height: 1em;
            width: 1em;
            background-color: ${htmlColor(rgb)}
        '></div>`;
}

const magnifier = document.createElement("div");
magnifier.style.display = "none";
magnifier.style.position = "fixed";
magnifier.style.backgroundColor = "white";
magnifier.style.border = "1px solid grey";
magnifier.style.zIndex = "1000";

const text = document.createElement("div");
const canvas = document.createElement("canvas");
canvas.width = SIZE * SCALE * 3 + 10;
canvas.height = SIZE * SCALE;
canvas.style.backgroundColor = "white";
canvas.style.width = `${SIZE * 3 * SCALE + 10}px`;
canvas.style.height = `${SIZE * SCALE}px`;

magnifier.appendChild(canvas);
magnifier.appendChild(text);
document.body.appendChild(magnifier);

/**
 * Install magnifier control on set of images.
 *
 * When user hover mouse over any of images, an popup with information given pixel will be shown.
 * If window has focus, one can also move focus point with keyboard.
 *
 * @param actual -
 * @param expected -
 * @param diff -
 */
export function installMagnifier(
    actual: HTMLImageElement,
    expected: HTMLImageElement,
    diff: HTMLImageElement
) {
    const actualClone = document.createElement("img");
    const expectedClone = document.createElement("img");
    const diffClone = document.createElement("img");
    actualClone.crossOrigin = "Anonymous";
    expectedClone.crossOrigin = "Anonymous";
    diffClone.crossOrigin = "Anonymous";

    let ready = false;
    Promise.all([waitImageLoaded(actual), waitImageLoaded(expected), waitImageLoaded(diff)]).then(
        () => {
            actualClone.src = actual.src;
            expectedClone.src = expected.src;
            diffClone.src = diff.src;

            ready = true;
        }
    );

    actualClone.src = actual.src;
    expectedClone.src = expected.src;
    diffClone.src = diff.src;
    let sx: number = 0;
    let sy: number = 0;

    function renderZoomer() {
        requestAnimationFrame(() => {
            if (!ready) {
                return;
            }
            const ctx = canvas.getContext("2d")!;
            ctx.fillStyle = "white";
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            (ctx as any).webkitImageSmoothingEnabled = false;
            (ctx as any).mozImageSmoothingEnabled = false;
            ctx.imageSmoothingEnabled = false;

            const sourceBlitOffset = Math.floor(SIZE / 2);
            ctx.drawImage(
                actualClone,
                sx - sourceBlitOffset,
                sy - sourceBlitOffset,
                SIZE,
                SIZE,
                SIZE * 0,
                0,
                SIZE * SCALE,
                SIZE * SCALE
            );
            ctx.drawImage(
                expectedClone,
                sx - sourceBlitOffset,
                sy - sourceBlitOffset,
                SIZE,
                SIZE,
                SCALE * SIZE * 1 + 5,
                0,
                SIZE * SCALE,
                SIZE * SCALE
            );
            ctx.drawImage(
                diffClone,
                sx - sourceBlitOffset,
                sy - sourceBlitOffset,
                SIZE,
                SIZE,
                SCALE * SIZE * 2 + 10,
                0,
                SIZE * SCALE,
                SIZE * SCALE
            );
            ctx.strokeStyle = "grey";

            const centerOutlineOffset = Math.floor((SIZE * SCALE) / 2 - SCALE / 2);
            const centerPixelOffset = Math.floor((SIZE * SCALE) / 2);
            ctx.strokeRect(
                SIZE * SCALE * 0 + centerOutlineOffset - 1,
                centerOutlineOffset - 1,
                SCALE + 1,
                SCALE + 1
            );
            ctx.strokeRect(
                SIZE * SCALE * 1 + 5 + centerOutlineOffset - 1,
                centerOutlineOffset - 1,
                SCALE + 1,
                SCALE + 1
            );
            ctx.strokeRect(
                SIZE * SCALE * 2 + 10 + centerOutlineOffset - 1,
                centerOutlineOffset - 1,
                SCALE + 1,
                SCALE + 1
            );

            const pixelColors = [
                ctx.getImageData(SIZE * SCALE * 0 + centerPixelOffset, centerPixelOffset, 1, 1),
                ctx.getImageData(SIZE * SCALE * 1 + centerPixelOffset, centerPixelOffset, 1, 1)
            ].map(image => {
                return [image.data[0], image.data[1], image.data[2]] as [number, number, number];
            });
            const [colorActual, colorExpected] = pixelColors;
            const colorDiff = [0, 0, 0].map((a, i) => {
                return Math.abs(colorActual[i] - colorExpected[i]);
            }) as RGBColorTuple;
            const colorDiffPercent = [0, 0, 0].map((a, i) => {
                return Math.abs(colorActual[i] - colorExpected[i]) / 255;
            }) as RGBColorTuple;
            text.innerHTML = `
                Position: ${sx} x ${sy} (of ${actualClone.width} x ${actualClone.height})<br>
                Actual: [${rgbToString(colorActual)}]
                    (${htmlColor(colorActual)} ${colorIndicator(colorActual)})<br>
                Expected: [${rgbToString(colorExpected)}]
                    (${htmlColor(colorExpected)} ${colorIndicator(colorExpected)})<br>
                Diff: [${rgbToString(colorDiff)}]<br>
                Diff %: [${rgbToString(colorDiffPercent)}]
            `;
        });
    }

    const onKeyDown = (ev: KeyboardEvent) => {
        switch (ev.key) {
            case "ArrowLeft":
                sx = Math.max(0, sx - 1);
                break;

            case "ArrowUp":
                sy = Math.max(0, sy - 1);
                break;

            case "ArrowRight":
                sx = Math.min(actualClone.width - 1, sx + 1);
                break;

            case "ArrowDown":
                sy = Math.min(actualClone.height - 1, sy + 1);
                break;

            default:
                return; // exit this handler for other keys
        }
        ev.preventDefault(); // prevent the default action (scroll / move caret)
        renderZoomer();
    };
    const onMouseMove = (ev: MouseEvent) => {
        magnifier.style.display = "block";
        magnifier.style.left = `${Math.min(
            window.innerWidth - (SIZE * SCALE * 3 + 10) - 2,
            ev.clientX + 4
        )}px`;
        magnifier.style.top = `${ev.clientY + 10}px`;

        const mx = actualClone.width / actual.clientWidth;
        const my = actualClone.height / actual.clientHeight;

        sx = Math.max(0, Math.floor(ev.offsetX * mx));
        sy = Math.max(0, Math.floor(ev.offsetY * my));

        renderZoomer();

        document.addEventListener("keydown", onKeyDown);
    };

    [actual, expected, diff].forEach(img => {
        img.onmousemove = onMouseMove;
        img.onmouseleave = () => {
            magnifier.style.display = "none";
            document.removeEventListener("keydown", onKeyDown);
        };
    });
}
