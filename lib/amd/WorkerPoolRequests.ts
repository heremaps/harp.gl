/** @module @here/mapview-decoder **//** */

export class InitializeWorkerRequest {
    public readonly type = "initialize";

    constructor(public readonly id: string, public readonly moduleName: string,
                public readonly decoderFunction: string, public readonly additionalModules?: string[]) {
    }
};

export function isInitializeWorkerRequest(message: any): message is InitializeWorkerRequest {
    return message.type === "initialize";
}
