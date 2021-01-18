/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { createImgElement } from "./DomImageUtils";
import { ImageComparisonResult, TestImageProps } from "./Interface";
import { installMagnifier } from "./Magnifier";
import { getWebGlInfo } from "./RenderingTestHelper";

/**
 * Reports IBCT test results as simple table attached to end of `document.body`.
 *
 * Use in 'developer' testing, possibly with test suite filtered for work-in-progress tests with
 * `.only`. The test images (actual, current, diff) are shown in browser.
 */
export class DomReporter {
    private m_headerReported = false;
    reportImageComparisonResult(
        imageProps: TestImageProps,
        actualImage: ImageData,
        passed: boolean,
        referenceImage?: ImageData, // server already has reference image
        comparisonResult?: ImageComparisonResult
    ) {
        this.addHeaderIfNeeded();
        const diff = this.reportImageComparisonDOM(
            actualImage,
            referenceImage,
            comparisonResult && comparisonResult.diffImage
        );
        document.body.appendChild(document.createElement("hr"));
        const mismatchedPixels = comparisonResult ? `: ${comparisonResult.mismatchedPixels}` : "";

        const imageTitle = Object.keys(imageProps)
            .reduce((r, key) => {
                r.push(`${key}=${imageProps[key]}`);
                return r;
            }, [] as string[])
            .join(" / ");
        document.body.appendChild(
            document.createTextNode(`IBCT ${imageTitle}: ${mismatchedPixels}`)
        );
        document.body.appendChild(diff);
    }

    reportImageComparisonDOM(actual: ImageData, expected?: ImageData, diff?: ImageData) {
        const parent = document.createElement("div");
        parent.style.display = "flex";
        parent.style.justifyContent = "space-around";
        parent.className = "image-comparison-result";

        const group1 = document.createElement("div");
        group1.style.flex = "1";
        group1.appendChild(document.createTextNode("Actual"));
        const actualImg = createImgElement(actual);
        actualImg.style.width = "100%" as any;
        actualImg.style.height = "auto";
        actualImg.style.border = "1px solid grey";
        (actualImg.style as any).imageRendering = "pixelated";
        actualImg.className = "actual";
        group1.appendChild(actualImg);

        const group2 = document.createElement("div");
        group2.style.flex = "1";
        group2.appendChild(document.createTextNode("Reference"));
        const expectedImg = expected ? createImgElement(expected) : document.createElement("img");
        expectedImg.className = "expected";
        expectedImg.style.width = "100%" as any;
        expectedImg.style.height = "auto";
        expectedImg.style.border = "1px solid grey";
        (expectedImg.style as any).imageRendering = "pixelated";
        group2.appendChild(expectedImg);

        const group3 = document.createElement("div");
        group3.style.flex = "1";
        group3.appendChild(document.createTextNode("Difference"));
        const diffImg = diff ? createImgElement(diff) : document.createElement("img");
        diffImg.className = "diff";
        diffImg.style.width = "100%" as any;
        diffImg.style.height = "auto";
        diffImg.style.border = "1px solid grey";
        (diffImg.style as any).imageRendering = "pixelated";
        group3.appendChild(diffImg);

        parent.appendChild(group1);
        parent.appendChild(group2);
        parent.appendChild(group3);

        installMagnifier(actualImg, expectedImg, diffImg);

        return parent;
    }

    private addHeaderIfNeeded() {
        if (this.m_headerReported) {
            return;
        }
        const header = document.createElement("div");
        const webGLInfo = getWebGlInfo();
        header.innerHTML = `
            WebGL.vendor = ${webGLInfo.vendor}<br>
            WebGL.gpu = ${webGLInfo.gpu}
        `;
        document.body.appendChild(header);
        this.m_headerReported = true;
    }
}
