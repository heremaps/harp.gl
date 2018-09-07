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

import { TileKey } from "@here/geoutils";
import { DataStoreClient } from "@here/hype";
import { appCode, appId, hrn } from "../config";

/**
 * This example illustrates how to download data using the `@here/hype` library.
 *
 * The first step is to instantiate a new [[DataStore1Client]] object, passing the catalog
 * identifier (see [[HRN]]) and the credentials. In this example, the application is connected using
 * Appid and application code (AppCode):
 *
 * ```typescript
 * [[include:vislib_hype_gettile_1.ts]]
 * ```
 *
 * From the [[DataStoreClient]], catalogues can be requested either with a given version number, or
 * the very latest version (the default) by calling [[DataStore1Client.getCatalogClient]]. Since it
 * is an asynchronous function, it is called with `await`:
 *
 * ```typescript
 * [[include:vislib_hype_gettile_2.ts]]
 * ```
 *
 * After this function is called, the returned [[Catalog1Client]] contains all meta data that is
 * required to access a tile. Every catalog has zero or more layers, and in order to download a
 * tile, a layer needs to be specified. In this example, a layer called `mvt` is requested using
 * [[Catalog1Client.getLayer]]
 *
 * ```typescript
 * [[include:vislib_hype_gettile_3.ts]]
 * ```
 *
 * Now that a catalog and a layer are retrieved, tiles can be requested. Every tile is identified by
 * a [[TileKey]]. They are requested using [[Catalog1Layer.getTile]]:
 *
 * ```typescript
 * [[include:vislib_hype_gettile_4.ts]]
 * ```
 *
 * At first a check is perform whether there was an error downloading the tile, and an exception
 * thrown if the request was not successful.If the request was valid but there is no data at the
 * given tile, the returned http status is `204`, or "No Content".
 *
 * Finally, after ensuring there was no error and the payload is not empty, the actual data can be
 * requested. In this case, the raw binary data are expected, so they are retrieved using
 * [[DownloadResponse.arrayBuffer]]. If the catalog contains JSON formatted data, it could be
 * retrieved by calling [[DownloadResponse.json]].
 */
export namespace HypeGetTileExample {
    async function getTile(tileKeyRequested: TileKey): Promise<number> {
        // snippet:vislib_hype_gettile_1.ts
        const dataStoreClient = new DataStoreClient({
            appId,
            appCode,
            hrn
        });
        // end:vislib_hype_gettile_1.ts

        // snippet:vislib_hype_gettile_2.ts
        const catalogClient = await dataStoreClient.getCatalogClient();
        // end:vislib_hype_gettile_2.ts

        // snippet:vislib_hype_gettile_3.ts
        const layer = catalogClient.getLayer("mvt");
        // end:vislib_hype_gettile_3.ts

        // snippet:vislib_hype_gettile_4.ts
        const dataRequest = await layer.getTile(tileKeyRequested);
        if (!dataRequest.ok) {
            throw new Error("Request failed, " + dataRequest.statusText);
        }

        // status 204 is "NO CONTENT" - the tile exists, but it is empty. We're done.
        if (dataRequest.status === 204) {
            return 0;
        }

        // at this point, a successful request was made. Now the data is retrieved
        const payload = await dataRequest.arrayBuffer();
        // end:vislib_hype_gettile_4.ts

        // the payload is retrieved as an ArrayBuffer.
        return payload.byteLength;
    }

    // A tile somewhere in Berlin
    const tileKey = TileKey.fromHereTile("1451198");

    // Output some text to the document's body
    const body = document.body;
    body.innerHTML = `<p>Downloading tile ${tileKey.toHereTile()}... `;

    // now, call our async function, and report the result
    getTile(tileKey)
        .then(byteLength => {
            body.innerHTML += `<p>Success, received ${byteLength} bytes`;
        })
        .catch(err => {
            body.innerHTML += `<p>Failed: ${err}`;
        });
}
