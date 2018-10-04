/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

/**
 * Copy methods and properties from one prototype into another.
 *
 * @see https://www.typescriptlang.org/docs/handbook/mixins.html
 *
 * @param derivedCtor Class to mix methods and properties into.
 * @param baseCtors Class to take all methods and properties from.
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
 * @param derivedCtor Class to mix methods into.
 * @param baseCtors Class to take all methods from.
 */
export function applyMixinsWithoutProperties(derivedCtor: any, baseCtors: any[]) {
    baseCtors.forEach(baseCtor => {
        Object.getOwnPropertyNames(baseCtor.prototype).forEach(name => {
            const descriptor = Object.getOwnPropertyDescriptor(baseCtor.prototype, name);
            if (descriptor !== undefined && descriptor.get === undefined) {
                derivedCtor.prototype[name] = baseCtor.prototype[name];
            }
        });
    });
}
