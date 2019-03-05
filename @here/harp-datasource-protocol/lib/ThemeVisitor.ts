/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Style, Theme } from "./Theme";

/**
 * The ThemeVisitor visits every style in the theme in a depth-first fashion.
 */
export class ThemeVisitor {
    constructor(readonly theme: Theme) {}
    /**
     * Applies a function to every style in the theme.
     *
     * @param visitFunc Function to be called with `style` as an argument. Function should return
     *                  `true` to cancel visitation.
     * @returns `true` if function has finished prematurely.
     */
    visitStyles(visitFunc: (style: Style) => boolean): boolean {
        const visit = (style: Style): boolean => {
            if (visitFunc(style)) {
                return true;
            }
            if (style.styles !== undefined) {
                for (const currStyle of style.styles) {
                    if (visit(currStyle)) {
                        return true;
                    }
                }
            }
            return false;
        };
        if (this.theme.styles !== undefined) {
            for (const styleSetName in this.theme.styles) {
                if (this.theme.styles[styleSetName] !== undefined) {
                    for (const style of this.theme.styles[styleSetName]) {
                        if (visit(style)) {
                            return true;
                        }
                    }
                }
            }
        }
        return false;
    }
}
