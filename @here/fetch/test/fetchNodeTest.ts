/*
 * Copyright (C) 2017-2018 HERE Global B.V. and its affiliate(s).
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

// @here:check-imports:environment:node
/* tslint:disable:completed-docs */

import { assert } from "chai";
import * as https from "https";
import * as sinon from "sinon";
import { Readable } from "stream";
import * as zlib from "zlib";
import * as cf from "../index_node";

function stubOnEvent(sandbox: sinon.SinonSandbox) {
    const onEventStub = sandbox.stub();

    onEventStub.withArgs("error").yields('{ "data": "error" }');
    onEventStub.withArgs("end").yields('{ "data": "end" }');
    onEventStub.withArgs("data").yields('{ "data": 123456 }');
    onEventStub.withArgs("abort").yields('{ "data": "abort" }');

    return onEventStub;
}

function stubClientRequest() {
    const stubReq = {
        on: () => {
            return;
        },
        end: () => {
            return;
        }
    };
    return stubReq;
}

function mockClientResponse(
    sandbox: sinon.SinonSandbox,
    statusCode?: number,
    ok?: boolean,
    statusText?: string,
    rawHeaders?: string[]
) {
    return {
        statusText: statusText ? statusText : "success",
        ok: ok ? ok : true,
        statusCode: statusCode ? statusCode : 200,
        rawHeaders: rawHeaders ? rawHeaders : ["content-type", "text/plain"],
        arrayBuffer: sandbox.stub(),
        json: sandbox.stub(),
        text: sandbox.stub(),
        pipe: sandbox.stub(),
        setEncoding: sandbox.stub(),
        on: stubOnEvent
    };
}

describe("Fetch node", () => {
    const dataUrl = `https://dummy.test.url`;
    const cancellationToken = new cf.CancellationToken();
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.sandbox.create();
    });

    afterEach(() => {
        sandbox.restore();
    });

    it("#stubbed node fetch performs successful fetch as json", () => {
        // Arrange
        const onEventStub = stubOnEvent(sandbox);
        onEventStub.withArgs("data").yields('{ "data": 123456 }');

        const mockResponse = mockClientResponse(sandbox, 200);
        mockResponse.on = sinon.stub().callsFake(onEventStub);

        const transportStub = sandbox.stub(https, "request");
        transportStub.returns(stubClientRequest()).yieldsAsync(mockResponse);

        // Act
        return cf
            .fetch(dataUrl, {})
            .then(response => {
                assert.isTrue(response.ok);
                return response.json();
            })
            .then(data => {
                // Assert
                assert.isNotEmpty(data);
                assert.deepEqual(data, { data: 123456 });
                assert.isTrue(transportStub.calledOnce);
                assert.isFalse(cancellationToken.isCancelled);
                assert.isTrue(onEventStub.calledWith("end"));
                assert.isTrue(onEventStub.calledWith("data"));
            });
    });

    it("#stubbed node fetch performs successful fetch as arrayBuffer", () => {
        // String to ArrayBuffer
        const str = "HERE ist großartig";
        const buf = new ArrayBuffer(str.length);
        const bufView = new Uint8Array(buf);
        for (let i = 0, strLen = str.length; i < strLen; i++) {
            bufView[i] = str.charCodeAt(i);
        }
        const retArrBuf = bufView.buffer as ArrayBuffer;

        // Arrange
        const onEventStub = stubOnEvent(sandbox);
        const resultBuffer = Buffer.from(retArrBuf);

        onEventStub.withArgs("data").yields(resultBuffer);

        const mockResponse = mockClientResponse(sandbox, 200);
        mockResponse.rawHeaders = ["content-type", "application/octet-stream"];
        mockResponse.on = sinon.stub().callsFake(onEventStub);

        const transportStub = sandbox.stub(https, "request");
        transportStub.returns(stubClientRequest()).yieldsAsync(mockResponse);

        // Act
        return cf
            .fetch(dataUrl, { cancellationToken })
            .then(response => {
                assert.isTrue(response.ok);
                return response.arrayBuffer();
            })
            .then(data => {
                // Assert
                const dataString = String.fromCharCode.apply(null, new Uint8Array(data));
                assert.isNotEmpty(dataString);
                assert.equal(dataString, "HERE ist großartig");
                assert.equal(data.byteLength, 18);
                assert.isTrue(transportStub.calledOnce);
                assert.isFalse(cancellationToken.isCancelled);
                assert.isTrue(onEventStub.calledWith("end"));
                assert.isTrue(onEventStub.calledWith("data"));
            });
    });

    it("#stubbed node fetch performs successful fetch as text", () => {
        // Arrange
        const onEventStub = stubOnEvent(sandbox);
        onEventStub.withArgs("data").yields("HERE text");

        const mockResponse = mockClientResponse(sandbox, 200);
        mockResponse.rawHeaders = ["content-type", "text/plain"];
        mockResponse.on = sinon.stub().callsFake(onEventStub);

        const transportStub = sandbox.stub(https, "request");
        transportStub.returns(stubClientRequest()).yieldsAsync(mockResponse);

        // Act
        return cf
            .fetch(dataUrl, { cancellationToken })
            .then(response => {
                assert.isTrue(response.ok);
                return response.text();
            })
            .then(data => {
                // Assert
                assert.isNotEmpty(data);
                assert.deepEqual(data, "HERE text");
                assert.isTrue(transportStub.calledOnce);
                assert.isFalse(cancellationToken.isCancelled);
                assert.isTrue(onEventStub.calledWith("end"));
                assert.isTrue(onEventStub.calledWith("data"));
            });
    });

    it("#stubbed node fetch performs fetch as json, returned statusCode = 301", () => {
        // Arrange
        const onEventStub = stubOnEvent(sandbox);
        const transportStub = sandbox.stub(https, "request");
        onEventStub.withArgs("data").yields('{ "data": 123456 }');

        const response301 = mockClientResponse(sandbox, 301);
        const response200 = mockClientResponse(sandbox, 200);
        response301.rawHeaders = [
            "content-type",
            "text/plain",
            "location",
            "https://redirect.dummy.url"
        ];

        response200.on = onEventStub;
        response301.on = onEventStub;

        transportStub
            .onFirstCall()
            .callsFake((_options, callback) => {
                callback(response301);
                return stubClientRequest();
            })
            .onSecondCall()
            .callsFake((_options, callback) => {
                callback(response200);
                return stubClientRequest();
            });

        // Act
        return cf
            .fetch(dataUrl, {})
            .then(response => {
                assert.isTrue(response.ok);
                return response.json();
            })
            .then(data => {
                // Assert
                assert.isTrue(transportStub.calledTwice);
                assert.isFalse(cancellationToken.isCancelled);
                assert.isNotEmpty(data);
                assert.strictEqual(JSON.stringify(data), '{"data":123456}');
            });
    });

    it("#stubbed node fetch performs fetch as text, returned statusCode = 307", () => {
        // Arrange
        const onEventStub = stubOnEvent(sandbox);
        const transportStub = sandbox.stub(https, "request");

        onEventStub.withArgs("data").yields("HERE text");

        const response307 = mockClientResponse(sandbox, 307);
        response307.rawHeaders = [
            "content-type",
            "text/plain",
            "location",
            "https://redirected.dummy.url"
        ];
        const response200 = mockClientResponse(sandbox, 200);

        response200.on = onEventStub;
        response307.on = onEventStub;

        transportStub
            .onFirstCall()
            .callsFake((_options, callback) => {
                callback(response307);
                return stubClientRequest();
            })
            .onSecondCall()
            .callsFake((_options, callback) => {
                callback(response200);
                return stubClientRequest();
            });

        // Act
        return cf
            .fetch(dataUrl, {})
            .then(response => {
                assert.isTrue(response.ok);
                return response.text();
            })
            .then(data => {
                // Assert
                assert.isTrue(transportStub.calledTwice);
                assert.isFalse(cancellationToken.isCancelled);
                assert.isNotEmpty(data);
                assert.strictEqual(data, "HERE text");
            });
    });

    it("#stubbed node fetch throws 'No location header in redirect' when statusCode 307", () => {
        // Arrange
        const mockResponse307 = mockClientResponse(sandbox, 307);
        mockResponse307.rawHeaders = [
            "content-type",
            "text/plain",
            "url",
            "https://redirected.dummy.url"
        ];

        const mockResponse200 = mockClientResponse(sandbox, 200);
        mockResponse200.rawHeaders = ["content-type", "text/plain", "location"];

        const onEventStub = stubOnEvent(sandbox);
        const transportStub = sandbox.stub(https, "request");
        onEventStub.withArgs("data").yields("HERE text");

        mockResponse307.on = onEventStub;
        mockResponse200.on = onEventStub;

        transportStub.onFirstCall().callsFake((_options, callback) => {
            callback(mockResponse307);
        });

        // Act
        return cf
            .fetch(dataUrl, { cancellationToken })
            .then(_e => {
                assert(false);
            })
            .catch(e => {
                // Assert
                assert.equal(e.statusText, "No location header in redirect");
            });
    });

    it('#stubbed node fetch throws "No Content" when statusCode 204 returned', () => {
        // Arrange
        const mockResponse204 = mockClientResponse(sandbox, 204);
        const onEventStub = stubOnEvent(sandbox);
        const transportStub = sandbox.stub(https, "request");
        onEventStub.withArgs("data").yields("HERE text");

        mockResponse204.on = onEventStub;

        transportStub.callsFake((_options, callback) => {
            callback(mockResponse204);
        });

        // Act
        return cf.fetch(dataUrl, { cancellationToken }).then(response => {
            // Assert
            assert.isNotEmpty(response);
            assert.isTrue(response && response.ok);
            assert.equal(response && response.type, "error");
            assert.equal(response && response.statusText, "No Content");
        });
    });

    it("#stubbed node fetch throws ErrorResponse when statusCode < 200 returned", () => {
        // Arrange
        const mockResponse104 = mockClientResponse(sandbox, 104);
        const onEventStub = stubOnEvent(sandbox);
        const transportStub = sandbox.stub(https, "request");
        onEventStub.withArgs("data").yields("HERE text");

        mockResponse104.on = onEventStub;

        transportStub.onFirstCall().callsFake((_options, callback) => {
            callback(mockResponse104);
        });
        // Act
        return cf.fetch(dataUrl, { cancellationToken }).then(response => {
            // Assert
            assert.isNotEmpty(response);
            assert.isFalse(response.ok);
        });
    });

    it("#stubbed node fetch performs compressed fetch", () => {
        // Arrange
        const originalData = { data: "something to send" };

        const stream = new Readable();
        stream.push(JSON.stringify(originalData));
        stream.push(null);

        const mockResponse = mockClientResponse(sandbox, 201);
        mockResponse.rawHeaders = ["content-type", "application/json", "content-encoding", "gzip"];
        mockResponse.pipe.returns(stream.pipe(zlib.createGzip()));
        mockResponse.on = sandbox.stub();

        const transportStub = sandbox.stub(https, "request");
        transportStub.returns(mockResponse).yields(mockResponse);

        // Act
        return cf
            .fetch(dataUrl, {})
            .then(response => {
                assert.isTrue(response.ok);
                return response.json();
            })
            .then(data => {
                // Assert
                assert.isTrue(transportStub.calledOnce);
                assert.isNotEmpty(data);
                assert.deepEqual(originalData, data);
            });
    });
});
