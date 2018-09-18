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

import { OAuthArgs, requestToken_common, Token } from "./requestToken_common";

function toBase64(buf: ArrayBuffer) {
    const buf8 = new Uint8Array(buf);
    const stringBuf = buf8.reduce((data, value) => data + String.fromCharCode(value), "");
    return btoa(stringBuf);
}

async function signBrowser(data: ArrayBufferLike, secretKey: string): Promise<string> {
    const keyData = new ArrayBuffer(secretKey.length);
    const keyView = new Uint8Array(keyData);

    for (let i = 0; i < secretKey.length; ++i) {
        keyView[i] = secretKey.charCodeAt(i);
    }

    const key = await crypto.subtle.importKey(
        "raw",
        keyData,
        {
            name: "HMAC",
            hash: { name: "SHA-1" }
        },
        false,
        ["sign"]
    );

    const signature = await crypto.subtle.sign("HMAC", key, data as ArrayBuffer);

    return toBase64(signature);
}

export async function requestToken(args: OAuthArgs): Promise<Token> {
    return requestToken_common(args, signBrowser);
}
