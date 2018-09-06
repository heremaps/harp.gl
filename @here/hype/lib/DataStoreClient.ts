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

import { DataStore1Client, DataStoreClient1Parameters } from "./v1/DataStore1Client";
import { DataStore2Client } from "./v2/DataStore2Client";

export {
    DataStore1Client as DataStoreClient,
    DataStoreClient1Parameters as DataStoreClientParameters
} from "./v1/DataStore1Client";

/**
 * Returns a new instance of a `DataStoreClient` supporting either version 1 or version 2 of the
 * Data Service API.
 *
 * For DataStore 1.0 the syntax of HRN when used to identify catalogs is the following:
 * `hrn:{partition}:datastore:::{catalogId}`
 *
 * For DataStore 2.0 the syntax differs for service:
 * `hrn:{partition}:data:::{catalogId}`
 *
 * Refer to https://confluence.in.here.com/display/OLP/HRN+use+in+OLP for more details.
 *
 * @param params Initialization parameters for the `DataStoreClient`.
 */
export function createDataStoreClient(
    params: DataStoreClient1Parameters
): DataStore1Client | DataStore2Client {
    switch (params.hrn.data.service) {
        case "datastore":
            return new DataStore1Client(params);
        case "data":
            return new DataStore2Client(params);
        default:
            throw new Error(`Unknown service ${params.hrn.data.service}`);
    }
}
