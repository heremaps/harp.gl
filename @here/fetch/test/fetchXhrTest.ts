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

/* tslint:disable:completed-docs */
import { assert } from "chai";
import * as sinon from "sinon";
import * as cf from "../index.web";

let currentXHRMock: any;

class XMLHttpRequest {
    UNSENT = 0;
    OPENED = 1;
    HEADERS_RECEIVED = 2;
    LOADING = 3;
    DONE = 4;

    onload: () => void = sinon.stub();
    onerror: () => void = sinon.stub();
    ontimeout: () => void = sinon.stub();
    onabort: () => void = sinon.stub();
    onreadystatechange: () => void = sinon.stub();

    status?: string;
    statusText?: string;
    response?: ArrayBuffer | any;
    reponseType?: string;
    responseText?: string;
    headers?: string;
    send: sinon.SinonStub = sinon.stub();
    open: sinon.SinonStub = sinon.stub();
    abort: sinon.SinonStub = sinon.stub();

    constructor() {
        currentXHRMock = this;
    }

    getResponseHeader() {
        return this.headers;
    }

    getAllResponseHeaders() {
        return this.headers;
    }
}

describe("Fetch with mocked XMLHttpRequest (browser)", () => {
    const originalXHR = (global as any).XMLHttpRequest;
    const dataUrl = `https://dummy.test.url`;
    const cancellationToken = new cf.CancellationToken();

    beforeEach(() => {
        /**
         *  Note,that webpack will by default convert global object to window object when the
         *  project would be targeted for web, check here for more details:
         *  https://webpack.js.org/configuration/node/#node-global
         */
        (global as any).XMLHttpRequest = XMLHttpRequest;
    });

    afterEach(() => {
        /**
         * After testing, restore the original XMLHttpRequest in global/window scope.
         */
        (global as any).XMLHttpRequest = originalXHR;
    });

    it("#stubbed XHR fetch performs successful fetch as json", () => {
        // Arrange
        const fetchXHR = cf.fetch(dataUrl, { cancellationToken });

        assert(currentXHRMock);
        currentXHRMock.responseType = "json";
        currentXHRMock.response = { data: 123456 };
        currentXHRMock.onload();

        // Act
        return fetchXHR
            .then(response => {
                return response.json();
            })
            .then(data => {
                // Assert
                assert.isNotEmpty(data);
                assert.deepEqual(data, { data: 123456 });
                assert.isFalse(cancellationToken.isCancelled);
                assert.isTrue(currentXHRMock.send.calledOnce);
                assert.isTrue(currentXHRMock.open.calledOnce);
                assert.isTrue(currentXHRMock.abort.notCalled);
            });
    });

    it("#stubbed XHR fetch performs error when fetch as json", () => {
        // Arrange
        const fetchXHR = cf.fetch(dataUrl, { cancellationToken });
        assert(currentXHRMock);
        currentXHRMock.onload();

        // Act
        return fetchXHR
            .then(response => {
                assert.isFalse(response.ok);
                return response.json();
            })
            .catch(e => {
                // Assert
                assert.equal(e.message, 'Response type must be "json" but is undefined');
                assert.isTrue(currentXHRMock.send.calledOnce);
                assert.isTrue(currentXHRMock.open.calledOnce);
                assert.isTrue(currentXHRMock.abort.notCalled);
            });
    });

    it("#stubbed XHR fetch performs successful fetch as arrayBuffer", () => {
        // String to ArrayBuffer
        const str = "HERE ist großartig";
        const buf = new ArrayBuffer(str.length);
        const bufView = new Uint8Array(buf);
        for (let i = 0, strLen = str.length; i < strLen; i++) {
            bufView[i] = str.charCodeAt(i);
        }
        const retArrBuf = bufView.buffer as ArrayBuffer;

        // Arrange
        const fetchXHR = cf.fetch(dataUrl, { cancellationToken });
        assert(currentXHRMock);
        currentXHRMock.responseType = "arraybuffer";
        currentXHRMock.response = retArrBuf;
        currentXHRMock.onload();

        // Act
        return fetchXHR
            .then(response => {
                return response.arrayBuffer();
            })
            .then(data => {
                // Assert
                const dataString = String.fromCharCode.apply(null, new Uint8Array(data));
                assert.isNotEmpty(dataString);
                assert.equal(dataString, "HERE ist großartig");
                assert.equal(data.byteLength, 18);
                assert.isFalse(cancellationToken.isCancelled);
                assert.isTrue(currentXHRMock.send.calledOnce);
                assert.isTrue(currentXHRMock.open.calledOnce);
                assert.isTrue(currentXHRMock.abort.notCalled);
            });
    });

    it("#stubbed XHR fetch performs error when fetch as arrayBuffer", () => {
        // Arrange
        const fetchXHR = cf.fetch(dataUrl, { cancellationToken });

        assert(currentXHRMock);
        currentXHRMock.headers = "Content-Type text/plain;";
        currentXHRMock.responseType = "json";
        currentXHRMock.onload();

        // Act
        return fetchXHR
            .then(response => {
                return response.arrayBuffer();
            })
            .catch(e => {
                // Assert
                assert.equal(
                    e.message,
                    "Content type Content-Type text/plain cannot be expressed as ArrayBuffer, " +
                        "please use json() or text() instead."
                );
                assert.isTrue(currentXHRMock.send.calledOnce);
                assert.isTrue(currentXHRMock.open.calledOnce);
                assert.isTrue(currentXHRMock.abort.notCalled);
            });
    });

    it("#stubbed XHR fetch performs successful fetch as text", () => {
        // Arrange
        const fetchXHR = cf.fetch(dataUrl, { cancellationToken });

        assert(currentXHRMock);
        currentXHRMock.responseType = "text";
        currentXHRMock.responseText = "HERE ist großartig";
        currentXHRMock.onload();

        // Act
        return fetchXHR
            .then(response => {
                return response.text();
            })
            .then(data => {
                // Assert
                assert.isNotEmpty(data);
                assert.equal(data, "HERE ist großartig");
                assert.isFalse(cancellationToken.isCancelled);
                assert.isTrue(currentXHRMock.send.calledOnce);
                assert.isTrue(currentXHRMock.open.calledOnce);
                assert.isTrue(currentXHRMock.abort.notCalled);
            });
    });

    it("#stubbed XHR fetch performs fetch as json, returned statusCode = 301", () => {
        // Arrange
        const fetchXHR = cf.fetch(dataUrl, { cancellationToken });

        assert(currentXHRMock);
        currentXHRMock.responseType = "json";
        currentXHRMock.response = { data: 123456 };
        currentXHRMock.status = 302;
        currentXHRMock.header = "location: https://redirected.dummy.url";
        currentXHRMock.onload();

        // Act
        return fetchXHR
            .then(response => {
                assert.isFalse(response.ok); // ok false when status code > 300
                return response.json();
            })
            .then(data => {
                // Assert
                assert.isNotEmpty(data);
                assert.deepEqual(data, { data: 123456 });
                assert.isFalse(cancellationToken.isCancelled);
                assert.isTrue(currentXHRMock.send.calledOnce);
                assert.isTrue(currentXHRMock.open.calledOnce);
                assert.isTrue(currentXHRMock.abort.notCalled);
            });
    });

    it("#stubbed XHR fetch performs fetch as text, returned statusCode = 307", () => {
        // Arrange
        const fetchXHR = cf.fetch(dataUrl, { cancellationToken });

        assert(currentXHRMock);
        currentXHRMock.responseType = "text";
        currentXHRMock.responseText = "HERE ist großartig";
        currentXHRMock.status = 302;
        currentXHRMock.header = "location: https://redirected.dummy.url";
        currentXHRMock.onload();

        // Act
        return fetchXHR
            .then(response => {
                assert.isFalse(response.ok); // ok false when status code > 300
                return response.text();
            })
            .then(data => {
                // Assert
                assert.isNotEmpty(data);
                assert.equal(data, "HERE ist großartig");
                assert.isFalse(cancellationToken.isCancelled);
                assert.isTrue(currentXHRMock.send.calledOnce);
                assert.isTrue(currentXHRMock.open.calledOnce);
                assert.isTrue(currentXHRMock.abort.notCalled);
            });
    });

    it("#stubbed XHR fetch shows error when statusCode < 200 returned", () => {
        // Arrange
        const fetchXHR = cf.fetch(dataUrl, { cancellationToken });
        assert(currentXHRMock);
        currentXHRMock.responseType = "text";
        currentXHRMock.responseText = "HERE ist großartig";
        currentXHRMock.status = 104;
        currentXHRMock.header = "location: https://redirected.dummy.url";
        currentXHRMock.onload();

        // Act
        return fetchXHR
            .then(response => {
                assert.isFalse(response.ok); // ok false when status code < 200
                return response.text();
            })
            .then(data => {
                // Assert
                assert.isNotEmpty(data);
                assert.equal(data, "HERE ist großartig");
                assert.isFalse(cancellationToken.isCancelled);
                assert.isTrue(currentXHRMock.send.calledOnce);
                assert.isTrue(currentXHRMock.open.calledOnce);
                assert.isTrue(currentXHRMock.abort.notCalled);
            });
    });

    it("#stubbed XHR fetch onreadystatechange json contentType from vnd.geo+json header", () => {
        // Arrange
        cf.fetch(dataUrl, { cancellationToken });
        assert(currentXHRMock);
        currentXHRMock.responseType = "";
        currentXHRMock.readyState = 2;
        currentXHRMock.headers = "application/vnd.geo+json";

        // Act
        currentXHRMock.onreadystatechange();

        //Assert
        assert.equal(currentXHRMock.responseType, "json");
        assert.isTrue(currentXHRMock.send.calledOnce);
        assert.isTrue(currentXHRMock.open.calledOnce);
        assert.isTrue(currentXHRMock.abort.notCalled);
    });

    it("#stubbed XHR fetch onreadystatechange json contentType from application/json", () => {
        // Arrange
        cf.fetch(dataUrl, { cancellationToken });
        assert(currentXHRMock);
        currentXHRMock.responseType = "";
        currentXHRMock.readyState = 2;
        currentXHRMock.headers = "application/json";

        // Act
        currentXHRMock.onreadystatechange();

        // Assert
        assert.equal(currentXHRMock.responseType, "json");
        assert.isTrue(currentXHRMock.send.calledOnce);
        assert.isTrue(currentXHRMock.open.calledOnce);
        assert.isTrue(currentXHRMock.abort.notCalled);
    });

    it("#stubbed XHR fetch onreadystatechange text contentType from text/plain header", () => {
        // Arrange
        cf.fetch(dataUrl, { cancellationToken });
        assert(currentXHRMock);
        currentXHRMock.responseType = "";
        currentXHRMock.readyState = 2;
        currentXHRMock.headers = "text/plain";

        // Act
        currentXHRMock.onreadystatechange();

        // Assert
        assert.equal(currentXHRMock.responseType, "text");
        assert.isTrue(currentXHRMock.send.calledOnce);
        assert.isTrue(currentXHRMock.open.calledOnce);
        assert.isTrue(currentXHRMock.abort.notCalled);
    });

    it("#stubbed XHR fetch onreadystatechange default to arraybuffer for contentType", () => {
        // Arrange
        cf.fetch(dataUrl, { cancellationToken });
        assert(currentXHRMock);
        currentXHRMock.responseType = "";
        currentXHRMock.readyState = 2;
        currentXHRMock.headers = "";

        // Act
        currentXHRMock.onreadystatechange();

        // Assert
        assert.equal(currentXHRMock.responseType, "arraybuffer");
        assert.isTrue(currentXHRMock.send.calledOnce);
        assert.isTrue(currentXHRMock.open.calledOnce);
        assert.isTrue(currentXHRMock.abort.notCalled);
    });

    it("#stubbed XHR fetch throws: onerror", () => {
        // Arrange
        const fetchXHR = cf.fetch(dataUrl, { cancellationToken });
        assert(currentXHRMock);

        // Act
        currentXHRMock.onerror();

        return fetchXHR
            .then(() => {
                assert(false, "This should not be reached");
            })
            .catch(e => {
                // Assert
                assert.equal(e.message, "Network request failed");
                assert.isTrue(currentXHRMock.send.calledOnce);
                assert.isTrue(currentXHRMock.open.calledOnce);
                assert.isTrue(currentXHRMock.abort.notCalled);
            });
    });

    it("#stubbed XHR fetch throws: ontimeout", () => {
        // Arrange
        const fetchXHR = cf.fetch(dataUrl, { cancellationToken });
        assert(currentXHRMock);

        // Act
        currentXHRMock.ontimeout();

        return fetchXHR
            .then(() => {
                assert(false, "This should not be reached");
            })
            .catch(e => {
                // Assert
                assert.equal(e.message, "Network request timed out");
                assert.isTrue(currentXHRMock.send.calledOnce);
                assert.isTrue(currentXHRMock.open.calledOnce);
                assert.isTrue(currentXHRMock.abort.notCalled);
            });
    });

    it("#stubbed XHR fetch throws: onabort", () => {
        // Arrange
        const fetchXHR = cf.fetch(dataUrl, { cancellationToken });
        assert(currentXHRMock);

        // Act
        currentXHRMock.onabort();

        return fetchXHR
            .then(() => {
                assert(false, "This should not be reached");
            })
            .catch(e => {
                // Assert
                assert.equal(e.message, "Request cancelled");
                assert.isTrue(currentXHRMock.send.calledOnce);
                assert.isTrue(currentXHRMock.open.calledOnce);
                assert.isTrue(currentXHRMock.abort.notCalled);
            });
    });
});
