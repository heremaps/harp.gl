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

import * as crypto from "crypto";
import { OAuthArgs, requestToken_common, Token } from "./requestToken_common";

function signNode(data: ArrayBufferLike, secretKey: string): Promise<string> {
    const hmac = crypto.createHmac("sha1", secretKey);
    hmac.update(new Buffer(data));
    return Promise.resolve(hmac.digest("base64"));
}

export async function requestToken(args: OAuthArgs): Promise<Token> {
    return requestToken_common(args, signNode);
}
