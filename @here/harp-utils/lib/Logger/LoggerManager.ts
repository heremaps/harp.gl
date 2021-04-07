/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { ILoggerManager } from "./ILoggerManager";
import { LoggerManagerImpl } from "./LoggerManagerImpl";

/**
 * The LoggerManager class implements a singleton object that handles logging.
 *
 * Example:
 *
 * ```typescript
 *
 * const logger = LoggerManager.instance.create("MyFontLoaderClass");
 * if (missingFonts.length > 0) {
 *     logger.error("These fonts can not be loaded: ", missingFonts);
 * } else {
 *     logger.log("All fonts have been loaded.");
 * }
 * ```
 */
export class LoggerManager {
    private static m_instance: ILoggerManager;

    static get instance(): ILoggerManager {
        return this.m_instance || (this.m_instance = new LoggerManagerImpl());
    }
}
