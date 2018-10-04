/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
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
