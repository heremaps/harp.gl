/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

import { Definitions, Style, Styles, Theme } from "./Theme";

interface ThemeDeltaOptions {
    verbose: boolean;
}

export class ThemeDelta {
    readonly verbose: boolean = true;

    constructor(oldTheme: Theme, newTheme: Theme, options: Partial<ThemeDeltaOptions>) {
        this.verbose = options.verbose ?? false;

        this.diffDefinitions(oldTheme.definitions, newTheme.definitions);
        this.diffStyles(oldTheme.styles, newTheme.styles);
    }

    diffStyles(oldStyles: Styles | undefined, newStyles: Styles | undefined) {
        const oldStyleSetNames = oldStyles ? Object.keys(oldStyles) : [];
        const newStyleSetNames = newStyles ? Object.keys(newStyles) : [];
        const commonStyleSetNames = newStyleSetNames.filter(name =>
            oldStyleSetNames.includes(name)
        );
        commonStyleSetNames.forEach(styleSetName => {
            const oldStyleSet = oldStyles![styleSetName];
            const newStyleSet = newStyles![styleSetName];
            if (oldStyleSet.length === newStyleSet.length) {
                oldStyleSet.forEach((oldStyle, i) =>
                    this.diffStyle(styleSetName, i, oldStyle, newStyleSet[i])
                );
            } else {
                console.log("todo: style set with different rule count");
            }
        });
    }

    diffStyle(styleSetName: string, index: number, oldStyle: Style, newStyle: Style): void {
        const oldPropertyNames = Object.keys(oldStyle);
        const newPropertyNames = Object.keys(newStyle);
        const commonPropertyNames = newPropertyNames.filter(
            name => oldPropertyNames.includes(name) && name !== "attr"
        );
        const changedPropertyNames = commonPropertyNames.filter(name => {
            const oldProperty = (oldStyle as any)[name];
            const newProperty = (newStyle as any)[name];
            return !this.sameExpr(oldProperty, newProperty);
        });
        if (this.verbose) {
            changedPropertyNames.forEach(name => {
                const oldProperty = (oldStyle as any)[name];
                const newProperty = (newStyle as any)[name];
                console.log(`style ${styleSetName}:${index} property ${name} changed`);
                console.log("  old", JSON.stringify(oldProperty));
                console.log("  new", JSON.stringify(newProperty));
            });
        }
        this.diffAttr(styleSetName, index, oldStyle.attr, newStyle.attr);
    }

    diffAttr(styleSetName: string, index: number, oldAttr: any, newAttr: any): void {
        const oldPropertyNames = oldAttr ? Object.keys(oldAttr) : [];
        const newPropertyNames = newAttr ? Object.keys(newAttr) : [];
        const commonPropertyNames = newPropertyNames.filter(name =>
            oldPropertyNames.includes(name)
        );
        const changedPropertyNames = commonPropertyNames.filter(name => {
            const oldProperty = (oldAttr as any)[name];
            const newProperty = (newAttr as any)[name];
            return !this.sameExpr(oldProperty, newProperty);
        });
        if (this.verbose) {
            changedPropertyNames.forEach(name => {
                const oldProperty = (oldAttr as any)[name];
                const newProperty = (newAttr as any)[name];
                console.log(`style ${styleSetName}:${index} property ${name} changed`);
                console.log("  old", JSON.stringify(oldProperty));
                console.log("  new", JSON.stringify(newProperty));
            });
        }
    }

    sameExpr(left: any, right: any): boolean {
        if (left === right) {
            return true;
        }
        // return JSON.stringify(left) === JSON.stringify(right); // slow version can also handle objects
        if (Array.isArray(left) && Array.isArray(right)) {
            return left.length === right.length && left.every((e, i) => this.sameExpr(e, right[i]));
        }
        return false;
    }

    diffDefinitions(
        oldDefinitions: Definitions | undefined,
        newDefinitions: Definitions | undefined
    ) {
        const oldDefinitionNames = oldDefinitions ? Object.keys(oldDefinitions) : [];
        const newDefinitionNames = newDefinitions ? Object.keys(newDefinitions) : [];

        //const added = newDefinitionNames.filter(name => !oldDefinitionNames.includes(name));
        //const removed = oldDefinitionNames.filter(name => !newDefinitionNames.includes(name));

        const commonDefinitions = newDefinitionNames.filter(name =>
            oldDefinitionNames.includes(name)
        );

        const changedDefinitions = commonDefinitions.filter(
            name => !this.sameExpr(oldDefinitions![name].value, newDefinitions![name].value)
        );

        if (this.verbose) {
            changedDefinitions.forEach(name => {
                const oldDef = JSON.stringify(oldDefinitions![name].value);
                const newDef = JSON.stringify(newDefinitions![name].value);
                console.log("definition:", name);
                console.log("  old:", oldDef);
                console.log("  new:", newDef);
            });
        }
    }
}
