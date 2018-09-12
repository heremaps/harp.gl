/*
 * Copyright (C) 2017-2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

import { assert } from "chai";

import { DecodedTile, getProjection, StyleSetEvaluator } from "@here/datasource-protocol";
import { TileKey } from "@here/geoutils";
import { loadTestResource } from "@here/test-utils";

import { OmvDecoder } from "../lib/OmvDecoder";

describe("OMVDecoder", () => {
    it(`decodes sample tile`, async () => {
        const [tileRaw, theme] = await Promise.all([
            loadTestResource("omv-datasource", "./test/resources/test.bin", "arraybuffer"),
            loadTestResource("map-theme", "./resources/day.json", "json")
        ]);

        const projection = getProjection("mercator");

        const styleSetEvaluator = new StyleSetEvaluator(theme.styles.omv);
        // const decoderOptions: OmvDecoderOptions = {
        //     gatherFeatureIds: false
        // };
        let resultTile: DecodedTile | undefined;
        const decoder = new OmvDecoder(projection, styleSetEvaluator, false);

        resultTile = decoder.getDecodedTile(TileKey.fromMortonCode(371506849), tileRaw);

        //Assess
        assert(resultTile);
        assert.equal(resultTile.geometries.length, 19);

        const geometry = resultTile.geometries[0];
        assert(geometry.groups);
        assert.equal(geometry.groups.length, 5);
        assert(geometry.index);
        assert(geometry.index!.buffer);
    });
});
