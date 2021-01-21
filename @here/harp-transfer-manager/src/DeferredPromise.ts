/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 *
 * DeferredPromise takes an executor function for executing it later, when [[exec]] is called.
 * This class allows wrapping other promises or long running functions for later execution.
 * @internal
 * @hidden
 */
export class DeferredPromise<T> {
    /**
     * Internal promise to store the result of the deferred executor function.
     */
    readonly promise: Promise<T>;
    private resolveFunc?: (result: T) => void;
    private rejectFunc?: (reason?: any) => void;

    /**
     * Constructs a new [[DeferredPromise]]
     * @param executor - Async function that should be executed at a later point in time.
     */
    constructor(private readonly executor: () => Promise<T>) {
        this.promise = new Promise<T>((resolve, reject) => {
            this.resolveFunc = resolve;
            this.rejectFunc = reject;
        });
    }

    /**
     * When `exec` is called the deferred executor function is executed.
     */
    exec() {
        this.executor()
            .then(result => this.resolveFunc!(result))
            .catch(error => this.rejectFunc!(error));
    }
}
