/** @module @here/mapview-decoder **//** */

export class InitializeWorkerRequest {
    public readonly type = "initialize";

    constructor(public readonly moduleName: string, public readonly config?: object) {
    }
};

export function isInitializeWorkerRequest(message: any): message is InitializeWorkerRequest {
    return message.type === "initialize";
}
