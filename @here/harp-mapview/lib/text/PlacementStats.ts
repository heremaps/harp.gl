/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { IChannel } from "@here/harp-utils";

export class PlacementStats {
    totalGroups: number = 0;
    resortedGroups: number = 0;
    total: number = 0;
    uninitialized: number = 0;
    tooFar: number = 0;
    numNotVisible: number = 0;
    numPathTooSmall: number = 0;
    numCannotAdd: number = 0;
    numRenderedPoiIcons: number = 0;
    numRenderedPoiTexts: number = 0;
    numPoiTextsInvisible: number = 0;
    numRenderedTextElements: number = 0;

    constructor(private readonly m_logger: IChannel) {}

    clear() {
        this.totalGroups = 0;
        this.resortedGroups = 0;
        this.total = 0;
        this.uninitialized = 0;
        this.tooFar = 0;
        this.numNotVisible = 0;
        this.numPathTooSmall = 0;
        this.numCannotAdd = 0;
        this.numRenderedPoiIcons = 0;
        this.numRenderedPoiTexts = 0;
        this.numPoiTextsInvisible = 0;
        this.numRenderedTextElements = 0;
    }

    log() {
        const numNotRendered =
            this.uninitialized +
            this.numPoiTextsInvisible +
            this.tooFar +
            this.numNotVisible +
            this.numCannotAdd;
        this.m_logger.debug("Total groups", this.totalGroups);
        this.m_logger.debug("Resorted groups", this.resortedGroups);
        this.m_logger.debug("Total labels", this.total);
        this.m_logger.debug("Rendered labels", this.numRenderedTextElements);
        this.m_logger.debug("Rejected labels", numNotRendered);
        this.m_logger.debug("Unitialized labels", this.uninitialized);
        this.m_logger.debug("Rendered poi icons", this.numRenderedPoiIcons);
        this.m_logger.debug("Rendered poi texts", this.numRenderedPoiTexts);
        this.m_logger.debug("Poi text invisible", this.numPoiTextsInvisible);
        this.m_logger.debug("Too far", this.tooFar);
        this.m_logger.debug("Not visible", this.numNotVisible);
        this.m_logger.debug("Path too small", this.numPathTooSmall);
        this.m_logger.debug("Rejected, max glyphs reached", this.numCannotAdd);
    }
}
