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

import "@here/fetch";

/**
 * Platform specific parts of signing a request using cryptographically
 * strong algorithms.
 */
export interface Signer {
    /**
     * Signs the data using the secret key and returns the string.
     */
    sign: (data: ArrayBufferLike, secretKey: string) => Promise<string>;
    /**
     * Returns a uid that can be used for the nonce parameter of oauth.
     */
    getRandomValues: (data: Uint8Array) => Uint8Array;
}

export interface OAuthArgs {
    url: string;
    consumerKey: string;
    secretKey: string;
    nonce?: string;
    timestamp?: number;
    expiresIn?: number;
}

export interface Token {
    accessToken: string;
    tokenType: string;
    expiresIn: number;
}

function signLatin1(data: string, secretKey: string, tokenSigner: Signer): Promise<string> {
    const buf = new Uint8Array(data.length);
    for (let i = 0; i < data.length; ++i) {
        buf[i] = data.charCodeAt(i);
    }
    return tokenSigner.sign(buf.buffer, secretKey);
}

function generateUid(randomValues: Uint8Array): string {
    const pad2 = (str: string) => (str.length === 1 ? "0" + str : str);
    return randomValues.reduce((result, byte) => (result += pad2(byte.toString(16))), "");
}

async function getOAuthAuthorization(args: OAuthArgs, tokenSigner: Signer): Promise<string> {
    if (args.timestamp === undefined) {
        args.timestamp = Math.floor(Date.now() / 1000);
    }
    if (args.nonce === undefined) {
        args.nonce = generateUid(tokenSigner.getRandomValues(new Uint8Array(16)));
    }

    const signatureBase =
        "POST&" +
        encodeURIComponent(args.url) +
        "&" +
        encodeURIComponent(
            `oauth_consumer_key=${args.consumerKey}&oauth_nonce=${
                args.nonce
            }&oauth_signature_method=HMAC-SHA1&oauth_timestamp=${args.timestamp}&oauth_version=1.0`
        );

    const signature = await signLatin1(signatureBase, args.secretKey + "&", tokenSigner);

    return `OAuth oauth_consumer_key="${encodeURIComponent(
        args.consumerKey
    )}",oauth_nonce="${encodeURIComponent(
        args.nonce
    )}",oauth_signature_method="HMAC-SHA1",oauth_timestamp="${
        args.timestamp
    }",oauth_version="1.0",oauth_signature="${encodeURIComponent(signature)}"`;
}

export async function requestToken_common(args: OAuthArgs, tokenSigner: Signer): Promise<Token> {
    const authorization = await getOAuthAuthorization(args, tokenSigner);

    const body = {
        grantType: "client_credentials",
        expiresIn: args.expiresIn === undefined ? 60 * 60 : args.expiresIn
    };

    const headers = new Headers({
        Authorization: authorization,
        "Content-Type": "application/json"
    });

    const request = await fetch(args.url, {
        method: "POST",
        body: JSON.stringify(body),
        headers
    });

    if (!request.ok) {
        throw new Error(request.statusText);
    }

    return request.json();
}
