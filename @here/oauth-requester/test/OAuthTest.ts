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

import { LoggerManager } from "@here/utils";
import { assert } from "chai";
import { requestToken } from "../index";

const logger = LoggerManager.instance.create("OAuthTest");

describe("oauth-requester", () => {
    // requires CONSUMER_KEY and SECRET_KEY env variables, disabled by default
    xit("getToken", async () => {
        let consumerKey: string = "";
        let secretKey: string = "";

        assert.doesNotThrow(() => {
            consumerKey = process.env.CONSUMER_KEY as string;
            secretKey = process.env.SECRET_KEY as string;
        });
        assert.isDefined(consumerKey);
        assert.isDefined(secretKey);
        assert.isNotEmpty(consumerKey);
        assert.isNotEmpty(secretKey);

        const reply = await requestToken({
            url: "https://stg.account.api.here.com/oauth2/token",
            consumerKey,
            secretKey
        });

        assert.strictEqual(reply.tokenType, "bearer");
        assert.isAbove(reply.expiresIn, 600);
        assert.isNotEmpty(reply.accessToken);

        logger.log(reply);
    });
});
