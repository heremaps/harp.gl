/*
 * Copyright (C) 2017 HERE Global B.V. and its affiliate(s).
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

/** @module @here/mapview-decoder **//** */

export class InitializeWorkerRequest {
    public readonly type = "initialize";

    constructor(public readonly moduleName: string, public readonly config?: object) {
    }
};

export function isInitializeWorkerRequest(message: any): message is InitializeWorkerRequest {
    return message.type === "initialize";
}
