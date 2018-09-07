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

export { IndexMap, AggregatedDownloadResponse } from "./CatalogClientCommon";

export {
    Catalog1Client as CatalogClient,
    Catalog1Layer as CatalogLayer
} from "./v1/Catalog1Client";
