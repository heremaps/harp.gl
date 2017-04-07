import { assert } from "chai";
import * as decoder from '../index';

describe("MapViewDecoder", function() {
    it("postMessage", function(done) {

        if (typeof Blob === "undefined") {
            done();
            return; // requires Blob support doesn't work in nodejs
        }

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
    });
});
