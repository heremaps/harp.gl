import { IChannel } from "./IChannel";

/**
 * Class for the default console channel.
 */

export class ConsoleChannel implements IChannel {
    error(message?: any, ...optionalParams: any[]) {
        // tslint:disable-next-line:no-console
        console.error(message, ...optionalParams);
    }

    debug(message?: any, ...optionalParams: any[]) {
        // tslint:disable-next-line:no-console
        console.debug(message, ...optionalParams);
    }

    info(message?: any, ...optionalParams: any[]) {
        // tslint:disable-next-line:no-console
        console.info(message, ...optionalParams);
    }

    log(message?: any, ...optionalParams: any[]) {
        // tslint:disable-next-line:no-console
        console.log(message, ...optionalParams);
    }

    trace(message?: any, ...optionalParams: any[]) {
        // tslint:disable-next-line:no-console
        console.trace(message, ...optionalParams);
    }

    warn(message?: any, ...optionalParams: any[]) {
        // tslint:disable-next-line:no-console
        console.warn(message, ...optionalParams);
    }
}
