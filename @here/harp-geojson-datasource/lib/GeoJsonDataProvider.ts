/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { ITiler } from "@here/harp-datasource-protocol";
import "@here/harp-fetch";
import { TileKey } from "@here/harp-geoutils";
import { ConcurrentTilerFacade } from "@here/harp-mapview";
import { DataProvider } from "@here/harp-mapview-decoder";

/**
 * GeoJson [[DataProvider]]. Automatically handles tiling and simplification of static GeoJson.
 */
export class GeoJsonDataProvider implements DataProvider {
    private m_tiler: ITiler;
    private m_registered = false;

    /**
     * Constructs a new `GeoJsonDataProvider`.
     *
     * @param url URL of the input GeoJson.
     *
     * @returns New `GeoJsonDataProvider`.
     */
    constructor(readonly name: string, readonly url: URL) {
        this.m_tiler = ConcurrentTilerFacade.getTiler("omv-tiler");
    }

    async connect(): Promise<void> {
        await this.m_tiler.connect();
        this.m_tiler.registerIndex(this.name, this.url.href).then(() => {
            this.m_registered = true;
        });
    }

    ready(): boolean {
        return this.m_registered;
    }

    async getTile(tileKey: TileKey): Promise<{}> {
        return this.m_tiler.getTile(this.name, tileKey);
    }
}
