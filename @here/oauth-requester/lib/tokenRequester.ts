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
import { requestToken } from "./requestToken";

//Create a logger without a name, so the name does not show up in the output
const logger = LoggerManager.instance.create("");

const args = process.argv.slice(2);
if (args.length !== 3) {
    logger.error("Usage: [server] [consumer key] [secret key]");
    process.exit(1);
}

requestToken({
    url: args[0],
    consumerKey: args[1],
    secretKey: args[2],
    expiresIn: 60 * 60 * 24
})
    // tslint:disable-next-line:no-console
    .then(result => console.log(result.accessToken))
    .catch(err => {
        logger.error("ERROR:", err);
        process.exit(1);
    });
