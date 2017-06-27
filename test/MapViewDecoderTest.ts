/*
 * Copyright (C) 2017 HERE Global B.V. and its affiliate(s).
 * All rights reserved.
 *
 * This software and other materials contain proprietary information
 * controlled by HERE and are protected by applicable copyright legislation.
 * Any use and utilization of this software and other materials and
 * disclosure to any third parties is conditional upon having a separate
 * agreement with HERE for the access, use, utilization or disclosure of this
 * software. In the absence of such agreement, the use of the software is not
 * allowed.
 */

import { assert } from "chai";
import * as decoder from '../index';

describe("MapViewDecoder", function() {
    it("postMessage", function(done) {

        if (typeof Blob === "undefined") {
            done();
            return; // requires Blob support doesn't work in nodejs
        }

        assert.isDefined(decoder);

        /** ### AMD

        const script = `define({
            testFunction: (message) => {
                const result = message.data.value + 1;
                self.postMessage({ type: 'test', value: result });
            }
        });`;

        const blob = new Blob([script], {type: 'application/javascript'});
        const url = URL.createObjectURL(blob);

        const pool = new decoder.Decoder(1);
        pool.addEventListener('test', (message: any) => {
            assert.strictEqual(message.data.value, 43);
            done();
        });
        pool.registerWorkerFunction('test', url, 'testFunction').then(() => {
            pool.postMessage({ type: 'test', value: 42 });
        }).catch((err) => done(err));

         */
    });
});
