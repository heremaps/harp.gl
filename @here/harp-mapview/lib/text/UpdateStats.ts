/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { IChannel } from "@here/harp-utils";

import { PrePlacementResult } from "./Placement";

export class UpdateStats {
    tiles: number = 0;
    totalGroups: number = 0;
    newGroups: number = 0;
    totalLabels: number = 0;
    results = new Array<number>(PrePlacementResult.Count);

    constructor(private readonly m_logger: IChannel) {
        this.results.fill(0);
    }

    clear() {
        this.tiles = 0;
        this.totalGroups = 0;
        this.newGroups = 0;
        this.totalLabels = 0;
        this.results.fill(0);
    }

    log() {
        this.m_logger.debug("Tiles", this.tiles);
        this.m_logger.debug("Total groups", this.totalGroups);
        this.m_logger.debug("New groups", this.newGroups);
        this.m_logger.debug("Total labels", this.totalLabels);
        this.m_logger.debug("Placed labels", this.results[PrePlacementResult.Ok]);
        this.m_logger.debug("Invisible", this.results[PrePlacementResult.Invisible]);
        this.m_logger.debug("Poi not ready", this.results[PrePlacementResult.NotReady]);
        this.m_logger.debug("Too far", this.results[PrePlacementResult.TooFar]);
        this.m_logger.debug("Duplicate", this.results[PrePlacementResult.Duplicate]);
    }
}
