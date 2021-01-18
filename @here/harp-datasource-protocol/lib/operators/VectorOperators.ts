/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import { Value } from "../Env";
import { CallExpr, NumberLiteralExpr } from "../Expr";
import { ExprEvaluatorContext, OperatorDescriptorMap } from "../ExprEvaluator";

type MakeVectorCallExpr = CallExpr & {
    _value?: THREE.Vector2 | THREE.Vector3 | THREE.Vector4;
};

function isVector(
    context: ExprEvaluatorContext,
    call: CallExpr,
    type: "vector2" | "vector3" | "vector4"
): Value {
    let ctor: new () => object;
    switch (type) {
        case "vector2":
            ctor = THREE.Vector2;
            break;
        case "vector3":
            ctor = THREE.Vector3;
            break;
        case "vector4":
            ctor = THREE.Vector4;
            break;
    }
    for (const childExpr of call.args) {
        const value = context.evaluate(childExpr);
        if (value instanceof ctor) {
            return value;
        }
    }
    throw new Error(`expected a "${type}"`);
}

function toVector(
    context: ExprEvaluatorContext,
    call: CallExpr,
    type: "vector2" | "vector3" | "vector4"
): Value {
    let VectorCtor: any;
    let components: number;

    switch (type) {
        case "vector2":
            VectorCtor = THREE.Vector2;
            components = 2;
            break;
        case "vector3":
            VectorCtor = THREE.Vector3;
            components = 3;
            break;
        case "vector4":
            VectorCtor = THREE.Vector4;
            components = 4;
            break;
    }

    for (const childExpr of call.args) {
        const value = context.evaluate(childExpr);
        if (value instanceof VectorCtor) {
            return value;
        } else if (
            Array.isArray(value) &&
            value.length === components &&
            value.every(v => typeof v === "number")
        ) {
            return new VectorCtor().fromArray(value);
        }
    }
    throw new Error(`expected a "${type}"`);
}

const operators = {
    "make-vector": {
        call: (context: ExprEvaluatorContext, call: MakeVectorCallExpr) => {
            if (call._value !== undefined) {
                return call._value;
            }

            if (call.args.length < 2) {
                throw new Error("not enough arguments");
            } else if (call.args.length > 4) {
                throw new Error("too many arguments");
            }

            const components = call.args.map(arg => context.evaluate(arg)) as number[];

            components.forEach((element, index) => {
                if (typeof element !== "number") {
                    throw new Error(
                        `expected vector component at index ${index} to have type "number"`
                    );
                }
            });

            let result: THREE.Vector2 | THREE.Vector3 | THREE.Vector4 | undefined;

            switch (components.length) {
                case 2:
                    result = new THREE.Vector2().fromArray(components);
                    break;
                case 3:
                    result = new THREE.Vector3().fromArray(components);
                    break;
                case 4:
                    result = new THREE.Vector4().fromArray(components);
                    break;
                default:
                    throw new Error("too many arguments");
            }

            if (call.args.every(arg => arg instanceof NumberLiteralExpr)) {
                call._value = result;
            }

            return result;
        }
    },
    vector2: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => isVector(context, call, "vector2")
    },
    vector3: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => isVector(context, call, "vector3")
    },
    vector4: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => isVector(context, call, "vector4")
    },
    "to-vector2": {
        call: (context: ExprEvaluatorContext, call: CallExpr) => toVector(context, call, "vector2")
    },
    "to-vector3": {
        call: (context: ExprEvaluatorContext, call: CallExpr) => toVector(context, call, "vector3")
    },
    "to-vector4": {
        call: (context: ExprEvaluatorContext, call: CallExpr) => toVector(context, call, "vector4")
    }
};

export const VectorOperators: OperatorDescriptorMap = operators;
export type VectorOperatorNames = keyof typeof operators;
