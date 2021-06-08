/*
 * Copyright (C) 2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { SolidLineMesh } from "./geometry/SolidLineMesh";
import { TileObject } from "./Tile";

/**
 * Transparent lines use the stencil buffer to avoid artifacts when two transparent lines overlap.
 * This class assigns unique stencil ref values to unique render orders, except that we use separate
 * render orders for the FIRST_PASS and SECOND_PASS objects which handle the AA for transparent
 * lines because otherwise we get artifacts at the tile borders, however these need to be assigned
 * the same stencil value, because they belong to the same object.
 */
export class SolidLineStencilRefManager {
    readonly DEFAULT_STENCIL_VALUE = 1;

    private readonly m_renderOrderStencilValues = new Map<number, number>();
    // Valid values start at 1, because the screen is cleared to zero
    private m_stencilValue: number = this.DEFAULT_STENCIL_VALUE;

    clearValues() {
        this.m_renderOrderStencilValues.clear();
        this.m_stencilValue = this.DEFAULT_STENCIL_VALUE;
    }

    updateStencilRef(object: TileObject) {
        if (object.renderOrder !== undefined && object instanceof SolidLineMesh) {
            const material = object.material;
            if (Array.isArray(material)) {
                material.forEach(mat => (mat.stencilRef = this.getStencilValue(object)));
            } else {
                material.stencilRef = this.getStencilValue(object);
            }
        }
    }

    private allocateStencilValue(renderOrder: number) {
        const stencilValue = this.m_stencilValue++;
        this.m_renderOrderStencilValues.set(renderOrder, stencilValue);
        return stencilValue;
    }

    private getStencilValue(object: SolidLineMesh) {
        // See SolidLineMesh::createAAMesh, we want the first and second passes to have the
        // exact same stencil value, however they must have a different render order to ensure that
        // there is no overlapping at the tile borders.
        const renderOrder = object.referenceRenderOrder ?? object.renderOrder;
        return (
            this.m_renderOrderStencilValues.get(renderOrder) ??
            this.allocateStencilValue(renderOrder)
        );
    }
}
