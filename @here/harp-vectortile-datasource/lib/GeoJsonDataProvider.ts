/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import "@here/harp-fetch";

import { GeoJson, ITiler, WorkerServiceProtocol } from "@here/harp-datasource-protocol";
import { TileKey } from "@here/harp-geoutils";
import { ConcurrentTilerFacade } from "@here/harp-mapview";
import { DataProvider } from "@here/harp-mapview-decoder";
import { LoggerManager } from "@here/harp-utils";

import { GEOJSON_TILER_SERVICE_TYPE } from "./OmvDecoderDefs";

const logger = LoggerManager.instance.create("GeoJsonDataProvider");

const INVALIDATED = "invalidated";

export interface GeoJsonDataProviderOptions {
    /**
     * Worker script hosting `Tiler` service.
     * @default `./decoder.bundle.ts`
     */
    workerTilerUrl?: string;

    /**
     * Custom tiler instance.
     *
     * @remarks
     * If not provided, {@link GeoJsonDataProvider} will obtain `WorkerBasedTiler`
     * from `ConcurrentTilerFacade`.
     */
    tiler?: ITiler;
}

let missingTilerServiceInfoEmitted: boolean = false;

/**
 * GeoJson {@link @here/harp-mapview-decoder@DataProvider}.
 *
 * @remarks
 * Automatically handles tiling and simplification of static GeoJson.
 */
export class GeoJsonDataProvider extends DataProvider {
    private readonly m_tiler: ITiler;
    private m_registered = false;

    /**
     * Constructs a new `GeoJsonDataProvider`.
     *
     * @param name - Name to be used to reference this `DataProvider`
     * @param input - URL of the GeoJSON, or a GeoJSON.
     * @param options - Optional
     * @returns New `GeoJsonDataProvider`.
     */
    constructor(
        readonly name: string,
        public input: URL | GeoJson,
        options?: GeoJsonDataProviderOptions
    ) {
        super();

        this.m_tiler =
            options?.tiler ??
            ConcurrentTilerFacade.getTiler(
                GEOJSON_TILER_SERVICE_TYPE,
                options && options.workerTilerUrl
            );
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
                        " 'OmvTilerService.start();' in decoder script."
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
        this.dispatchEvent({ type: INVALIDATED });
    }

    ready(): boolean {
        return this.m_registered;
    }

    async getTile(tileKey: TileKey): Promise<{}> {
        return await this.m_tiler.getTile(this.name, tileKey);
    }

    onDidInvalidate(listener: () => void) {
        this.addEventListener(INVALIDATED, listener);
        return () => this.removeEventListener(INVALIDATED, listener);
    }

    /**
     * Destroys this `GeoJsonDataProvider`.
     */
    dispose() {
        this.m_tiler.dispose();
    }
}
