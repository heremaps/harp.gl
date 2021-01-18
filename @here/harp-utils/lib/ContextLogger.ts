/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Refinement of `console` interface only for important information i.e `info`, `warn` and `errors`.
 */
export interface ISimpleChannel {
    info(message?: any, ...optionalParams: any[]): void;
    warn(message?: any, ...optionalParams: any[]): void;
    error(message?: any, ...optionalParams: any[]): void;
}

/**
 * Extension of {@link ISimpleChannel} to support contextual logging by adding stack of prefixes.
 */
export interface IContextLogger extends ISimpleChannel {
    /**
     * Push "attribute-like" context.
     */
    pushAttr(name: string): void;

    /**
     * Push "index-like" context.
     *
     * Following log messages will be prefixed with `[index]`.
     */
    pushIndex(index: string | number): void;

    /**
     * Remove current context from top of stack.
     */
    pop(): void;
}

/**
 * Context-aware logger that decorates log message with stack-based prefix, emits `headerMessage`
 * before first actual log message.
 */
export class ContextLogger implements IContextLogger {
    private readonly context: string[] = [];
    private m_headerLogged = false;

    /**
     * Construct a context-aware logger that logs to `m_logger`.
     */
    constructor(readonly m_logger: ISimpleChannel, readonly headerMessage: string) {}

    /**
     * Push "attribute-like" context.
     *
     * Following log messages will be prefixed with `name` or `.name` depending on current context.
     */
    pushAttr(name: string) {
        this.context.push(`${this.context.length > 0 ? "." : ""}${name}`);
    }

    /**
     * Push "index-like" context.
     *
     * Following log messages will be prefixed with `[index]`.
     */
    pushIndex(index: string | number) {
        this.context.push(`[${index}]`);
    }

    pop() {
        this.context.pop();
    }

    // They, are public member functions it's just tslint who doesn't understand this.

    warn = this.createLogMethod("warn");
    info = this.createLogMethod("info");
    error = this.createLogMethod("error");

    private createLogMethod(severity: "warn" | "info" | "error") {
        return (message: string, ...rest: any[]) => {
            if (!this.m_headerLogged) {
                this.m_logger.info(this.headerMessage);
                this.m_headerLogged = true;
            }
            this.m_logger[severity](`${this.context.join("")}: ${message}`, ...rest);
        };
    }
}
