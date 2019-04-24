/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
// Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";
import { Ring } from "../lib/OmvDecoder";

describe("OmvDecoder", function() {
    it("Ring data conversion to lines data: shape 1", function() {
        //  square test
        //  0,0,0       1,0,0
        //       #######
        //       #     #
        //       #     #
        //       #     #
        //       #######
        //  0,1,0       1,1,0

        const ring = new Ring(
            // VertexStride
            3,
            // Contour
            [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0],
            // ContourOutlines
            [true, true, true, true]
        );
        const lines: number[][] = ring.getOutlines();

        const lineBegin = lines[0].slice(0, 3);
        const lineEnd = lines[0].slice(-3);

        assert.equal(lines.length, 1, "is only one outline created");
        assert.equal(lines[0].length, 15, "15 coordinates (the loop is closed)");
        assert.equal(lineBegin[0], lineEnd[0]);
        assert.equal(lineBegin[1], lineEnd[1]);
    });

    it("Ring data conversion to lines data: shape 2", function() {
        //  square test
        //  0,0,0       1,0,0
        //       #######
        //       .     #
        //       .     #
        //       .     #
        //       #######
        //  0,1,0       1,1,0

        const ring = new Ring(
            // VertexStride
            3,
            // Contour
            [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0],
            // ContourOutlines
            [true, true, true, false]
        );
        const lines: number[][] = ring.getOutlines();

        const lineBegin = lines[0].slice(0, 3);
        const lineEnd = lines[0].slice(-3);

        assert.equal(lines.length, 1, "is only one outline created");
        assert.equal(lines[0].length, 12, "12 coordinates (the loop is closed)");
        assert.notEqual(lineBegin[0], lineEnd[0]);
        assert.notEqual(lineBegin[1], lineEnd[1]);
    });

    it("Ring data conversion to lines data: shape 3", function() {
        //  0,0,0           2,0,0
        //       ###########
        //       #         .
        //       #         .
        //       #         .
        //       #    ###### 2,1,0
        //       #    # 1,1,0
        //       #    #
        //       #    # 1,2,0
        //       #    ###### 2,2,0
        //       #         .
        //       #         .
        //       #         .
        //       ###########
        //  0,3,0           2,3,0
        //
        // 0,0,0 - start

        const ring = new Ring(
            // VertexStride
            3,
            // Contour
            [0, 0, 0, 2, 0, 0, 2, 1, 0, 1, 1, 0, 1, 2, 0, 2, 2, 0, 2, 3, 0, 0, 3, 0],
            // ContourOutlines
            [true, false, true, true, true, false, true, true]
        );
        const lines: number[][] = ring.getOutlines();

        const lineBegin = lines[0].slice(0, 3);
        const lineEnd = lines[2].slice(-3);

        assert.equal(lines.length, 3, "3 outlines created");
        assert.equal(lines[0].length, 6, "data length");
        assert.equal(lines[1].length, 12, "data length");
        assert.equal(lines[2].length, 9, "data length");
        assert.equal(lineBegin[0], lineEnd[0], "start and end is matching x");
        assert.equal(lineBegin[1], lineEnd[1], "start and end is matching y");
    });
});
