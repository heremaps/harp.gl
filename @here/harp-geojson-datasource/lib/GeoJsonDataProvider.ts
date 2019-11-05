/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoJson, ITiler, WorkerServiceProtocol } from "@here/harp-datasource-protocol";
import "@here/harp-fetch";
import { TileKey } from "@here/harp-geoutils";
import { ConcurrentTilerFacade } from "@here/harp-mapview";
import { DataProvider } from "@here/harp-mapview-decoder";
import { LoggerManager } from "@here/harp-utils";

const logger = LoggerManager.instance.create("GeoJsonDataProvider");

export interface GeoJsonDataProviderOptions {
    /**
     * Worker script hosting [[Tiler Service]]
     * @default `./decoder.bundle.ts`
     */
    workerTilerUrl?: string;

    /**
     * Custom tiler instance.
     * If not provided, [[GeoJsonDataProvider]] will obtain [[WorkerBasedTiler]]
     * from [[ConcurrentTilerFacade]].
     */
    tiler?: ITiler;
}

let missingTilerServiceInfoEmitted: boolean = false;

/**
 * GeoJson [[DataProvider]]. Automatically handles tiling and simplification of static GeoJson.
 */
export class GeoJsonDataProvider implements DataProvider {
    private m_tiler: ITiler;
    private m_registered = false;

    /**
     * Constructs a new `GeoJsonDataProvider`.
     *
     * @param name Name to be used to reference this `DataProvider`
     * @param input URL of the GeoJSON, or a GeoJSON.
     * @param options Optional
     * @returns New `GeoJsonDataProvider`.
     */
    constructor(
        readonly name: string,
        public input: URL | GeoJson,
        options?: GeoJsonDataProviderOptions
    ) {
        this.m_tiler =
            (options && options.tiler) ||
            ConcurrentTilerFacade.getTiler("vector-tiler", options && options.workerTilerUrl);
    }

    async connect(): Promise<void> {
        try {
            await this.m_tiler.connect();
        } catch (error) {
            if (
                WorkerServiceProtocol.isUnknownServiceError(error) &&
                !missingTilerServiceInfoEmitted
            ) {
                logger.info(
                    "Unable to start GeoJson tiler service in worker. Use " +
                        " 'VectorTilerService.start();' in decoder script."
                );
                missingTilerServiceInfoEmitted = true;
            }
            throw error;
        }

        await this.m_tiler.registerIndex(this.name, this.input);
        this.m_registered = true;
    }

    updateInput(input: URL | GeoJson) {
        this.input = input;
        this.m_tiler.updateIndex(this.name, this.input);
    }

    ready(): boolean {
        return this.m_registered;
    }

    async getTile(tileKey: TileKey): Promise<{}> {
        return this.m_tiler.getTile(this.name, tileKey);
    }
}
