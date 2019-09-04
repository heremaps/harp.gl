/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { assert } from "@here/harp-utils";
import { SceneStateEnv } from "../DynamicTechniqueAttr";
import { Expr } from "../Expr";
import { ExprEvaluatorContext, OperatorDescriptorMap } from "../ExprEvaluator";

const operators = {
    /**
     * Access [[SceneState]] attribute.
     *
     * Synopsis:
     *
     *    `["scene", "zoom"]` - get zoom level
     *    `["scene", "pixel2world"]` - get pixel2world ratio
     *    ...
     */
    scene: (context: ExprEvaluatorContext, args: Expr[]) => {
        const sceneEnv = context.env as SceneStateEnv;
        const v = context.evaluate(args[0]);
        if (v === "zoom") {
            return sceneEnv.sceneState.zoomLevel;
        } else if (v === "pixel2world") {
            return sceneEnv.sceneState.pixelToMeters;
        } else if (v === "time") {
            return sceneEnv.sceneState.time;
        } else if (v === "frame") {
            return sceneEnv.sceneState.frameNumber;
        } else if (v === "maxVisibility") {
            return sceneEnv.sceneState.maxVisibility;
        } else {
            return null;
        }
    },
    time: {
        call: (context: ExprEvaluatorContext, args: Expr[]) => {
            assert(context.env instanceof SceneStateEnv);
            return (context.env as SceneStateEnv).sceneState.time;
        }
    },
    frameNumber: {
        call: (context: ExprEvaluatorContext, args: Expr[]) => {
            assert(context.env instanceof SceneStateEnv);
            return (context.env as SceneStateEnv).sceneState.frameNumber;
        }
    },
    zoom: {
        call: (context: ExprEvaluatorContext, args: Expr[]) => {
            assert(context.env instanceof SceneStateEnv);
            return (context.env as SceneStateEnv).sceneState.zoomLevel;
        }
    }
};

export const SceneStateOperators: OperatorDescriptorMap = operators;
export type SceneStateOperatorNames = keyof typeof operators;
