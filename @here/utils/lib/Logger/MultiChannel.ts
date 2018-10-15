import { IChannel } from "./IChannel";

/**
 * Class allowing mixing several channels.
 */
export class MultiChannel implements IChannel {
    private readonly channels: IChannel[] = [];
    constructor(...channels: IChannel[]) {
        this.channels = channels;
    }

    error(message?: any, ...optionalParams: any[]) {
        for (const channel of this.channels) {
            channel.error(message, ...optionalParams);
        }
    }

    debug(message?: any, ...optionalParams: any[]) {
        for (const channel of this.channels) {
            channel.debug(message, ...optionalParams);
        }
    }

    info(message?: any, ...optionalParams: any[]) {
        for (const channel of this.channels) {
            channel.info(message, ...optionalParams);
        }
    }

    log(message?: any, ...optionalParams: any[]) {
        for (const channel of this.channels) {
            channel.log(message, ...optionalParams);
        }
    }

    trace(message?: any, ...optionalParams: any[]) {
        for (const channel of this.channels) {
            channel.trace(message, ...optionalParams);
        }
    }

    warn(message?: any, ...optionalParams: any[]) {
        for (const channel of this.channels) {
            channel.warn(message, ...optionalParams);
        }
    }
}
