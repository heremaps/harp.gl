/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Copy methods and properties from one prototype into another.
 *
 * @see https://www.typescriptlang.org/docs/handbook/mixins.html
 *
 * @param derivedCtor - Class to mix methods and properties into.
 * @param baseCtors - Class to take all methods and properties from.
 */
export function applyMixins(derivedCtor: any, baseCtors: any[]) {
    baseCtors.forEach(baseCtor => {
        Object.getOwnPropertyNames(baseCtor.prototype).forEach(name => {
            derivedCtor.prototype[name] = baseCtor.prototype[name];
        });
    });
}

/**
 * Copy methods from one prototype into another.
 *
 * @see https://www.typescriptlang.org/docs/handbook/mixins.html
 *
 * @param derivedCtor - Class to mix methods into.
 * @param baseCtors - Class to take all methods from.
 */
export function applyMixinsWithoutProperties(derivedCtor: any, baseCtors: any[]) {
    baseCtors.forEach(baseCtor => {
        Object.getOwnPropertyNames(baseCtor.prototype).forEach(name => {
            const descriptor = Object.getOwnPropertyDescriptor(baseCtor.prototype, name);
            if (
                descriptor !== undefined &&
                descriptor.get === undefined &&
                name !== "constructor"
            ) {
                derivedCtor.prototype[name] = baseCtor.prototype[name];
            }
        });
    });
}
