/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ImageComparisonResult {
    mismatchedPixels: number;
    diffImage: ImageData;
}
export interface TestImageProps {
    [prop: string]: string;
}

export interface Reporter {
    reportImageComparisonResult(
        imageProps: TestImageProps,
        actualImage: ImageData,
        passed: boolean,
        referenceImage?: ImageData,
        comparisonResult?: ImageComparisonResult
    ): void;
}

export interface ReferenceImageRepo {
    storeReferenceCandidate(imageProps: TestImageProps, actualImage: ImageData): Promise<void>;

    getReferenceImageUrl(imageProps: TestImageProps): string;
}

/**
 * Image test result transferable using Web API.
 *
 * Images are referenced by URIs.
 */
export interface ImageTestResultRequest {
    imageProps: TestImageProps;

    // URL or data-uri payload
    actualImage: string;
    passed: boolean;

    comparisonResult?: {
        mismatchedPixels: number;

        // URL or data-uri payload
        diffImage: string;
    };

    approveDifference?: boolean;
}

/**
 * Image test result in local context.
 *
 * Images are referenced by local filesystem paths.
 */
export interface ImageTestResultLocal {
    imageProps: TestImageProps;
    passed: boolean;

    actualImagePath?: string;
    diffImagePath?: string;
    mismatchedPixels?: number;
    approveDifference?: boolean;
}
