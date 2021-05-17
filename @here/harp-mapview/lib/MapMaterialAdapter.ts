/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ColorUtils,
    Expr,
    getPropertyValue,
    TEXTURE_PROPERTY_KEYS,
    Value
} from "@here/harp-datasource-protocol";
import { disableBlending, enableBlending, RawShaderMaterial } from "@here/harp-materials";
import * as THREE from "three";

import { evaluateColorProperty } from "./DecodedTileHelpers";
import { MapView } from "./MapView";

/**
 * @hidden
 *
 * Pick of {@link MapView} properties required to update materials used [[MapMaterialAdapter]].
 */
export type MapAdapterUpdateEnv = Pick<MapView, "env" | "frameNumber">;

/**
 * @hidden
 *
 * Custom, callback based property evaluator used by [[MapObjectAdapter]] to evaluate dynamic
 * properties of object/material.
 */
export type StylePropertyEvaluator = (context: MapAdapterUpdateEnv) => Value;

/**
 * @hidden
 *
 * Styled properties of material managed by [[MapMaterialAdapter]].
 */
export interface StyledProperties {
    [name: string]: Expr | StylePropertyEvaluator | Value | undefined;
}

function isTextureProperty(propertyName: string): boolean {
    return TEXTURE_PROPERTY_KEYS.includes(propertyName);
}

/**
 * @hidden
 *
 * {@link MapView} specific data assigned to `THREE.Material` instance in installed in `userData`.
 *
 * [[MapMaterialAdapter]] is registered in `usedData.mapAdapter` property of `THREE.Material`.
 */
export class MapMaterialAdapter {
    /**
     * Resolve `MapMaterialAdapter` associated with `material`.
     */
    static get(material: THREE.Material): MapMaterialAdapter | undefined {
        const mapAdapter = material.userData?.mapAdapter;
        if (mapAdapter instanceof MapMaterialAdapter) {
            return mapAdapter;
        } else if (mapAdapter !== undefined) {
            // NOTE: we can rebuild MapMaterialAdapter here if userData.mapAdapter contains
            // stylesed etc, this can be done to rebuild previously saved scene
            return undefined;
        } else {
            return undefined;
        }
    }

    static install(objData: MapMaterialAdapter): MapMaterialAdapter {
        if (!objData.material.userData) {
            objData.material.userData = {};
        }
        return (objData.material.userData.mapAdapter = objData);
    }

    static create(
        material: THREE.Material,
        styledProperties: StyledProperties
    ): MapMaterialAdapter {
        return MapMaterialAdapter.install(new MapMaterialAdapter(material, styledProperties));
    }

    static ensureUpdated(material: THREE.Material, context: MapAdapterUpdateEnv): boolean {
        return MapMaterialAdapter.get(material)?.ensureUpdated(context) ?? false;
    }

    /**
     * Associated material object.
     */
    readonly material: THREE.Material;

    /**
     * Styled material properties.
     *
     * Usually pick from [[Technique]] attributes that constitute material properties managed
     * by this adapter.
     */
    readonly styledProperties: StyledProperties;

    /**
     * Current values of styled material properties.
     *
     * Actual values valid for scope of one frame updated in [[ensureUpdated]].
     */
    readonly currentStyledProperties: { [name: string]: Value | undefined };

    private m_lastUpdateFrameNumber = -1;
    private readonly m_dynamicProperties: Array<[string, Expr | StylePropertyEvaluator]>;
    private readonly tmpColor = new THREE.Color();

    constructor(material: THREE.Material, styledProperties: StyledProperties) {
        this.material = material;
        this.styledProperties = styledProperties;

        this.currentStyledProperties = {};
        this.m_dynamicProperties = [];
        for (const propName in styledProperties) {
            if (!styledProperties.hasOwnProperty(propName)) {
                continue;
            }
            const propDefinition = styledProperties![propName];
            if (Expr.isExpr(propDefinition) || typeof propDefinition === "function") {
                this.m_dynamicProperties.push([propName, propDefinition as any]);
            } else {
                this.currentStyledProperties[propName] = propDefinition;
            }
        }
        this.setupStaticProperties();
    }

    /**
     * Serialize contents.
     *
     * `THREE.Material.userData` is serialized during `clone`/`toJSON`, so we need to ensure that
     * we emit only "data" set of this object.
     */
    toJSON() {
        return { styledProperties: this.styledProperties };
    }

    /**
     * Ensure that underlying object is updated to current state of {@link MapView}.
     *
     * Updates dynamically styled properties of material by evaluating scene dependent expressions.
     *
     * Executes updates only once per frame basing on [[MapView.frameNumber]].
     *
     * @returns `true` if object performed some kind of update, `false` if no update was needed.
     */
    ensureUpdated(context: MapAdapterUpdateEnv) {
        if (this.m_lastUpdateFrameNumber === context.frameNumber) {
            return false;
        }
        this.m_lastUpdateFrameNumber = context.frameNumber;

        return this.updateDynamicProperties(context);
    }

    /**
     * Applies static properties to target material.
     */
    private setupStaticProperties() {
        let updateBaseColor = false;
        for (const propName in this.styledProperties) {
            if (!this.styledProperties.hasOwnProperty(propName)) {
                continue;
            }
            const currentValue = this.currentStyledProperties[propName];
            if (currentValue === undefined || currentValue === null) {
                continue;
            }
            if (propName === "color" || propName === "opacity") {
                updateBaseColor = true;
            } else if (!isTextureProperty(propName)) {
                // Static textures are already set in the material during tile construction.
                this.applyMaterialGenericProp(propName, currentValue);
            }
        }
        if (updateBaseColor) {
            const color = (this.currentStyledProperties.color as number) ?? 0xff0000;
            const opacity = (this.currentStyledProperties.opacity as number) ?? 1;
            this.applyMaterialBaseColor(color, opacity);
        }
    }

    /**
     * Applies static properties to target material.
     */
    private updateDynamicProperties(context: MapAdapterUpdateEnv) {
        let somethingChanged = false;
        if (this.m_dynamicProperties.length > 0) {
            let updateBaseColor = false;

            for (const [propName, propDefinition] of this.m_dynamicProperties) {
                const newValue = Expr.isExpr(propDefinition)
                    ? getPropertyValue(propDefinition, context.env)
                    : propDefinition(context);
                if (newValue === this.currentStyledProperties[propName]) {
                    continue;
                }
                this.currentStyledProperties[propName] = newValue;

                // `color` and `opacity` are special properties to support RGBA
                if (propName === "color" || propName === "opacity") {
                    updateBaseColor = true;
                } else if (isTextureProperty(propName)) {
                    this.applyMaterialTextureProp(propName, newValue);
                    somethingChanged = true;
                } else {
                    this.applyMaterialGenericProp(propName, newValue);
                    somethingChanged = true;
                }
            }

            if (updateBaseColor) {
                const color = this.currentStyledProperties.color ?? 0xff0000;
                const opacity = (this.currentStyledProperties.opacity as number) ?? 1;
                this.applyMaterialBaseColor(color, opacity);
                somethingChanged = true;
            }
        }
        return somethingChanged;
    }

    private applyMaterialTextureProp(propName: string, value: Value) {
        const m = this.material as any;
        // Wait until the texture is loaded for the first time on tile creation, that way,
        // the old texture properties can be copied to the new texture.
        if (!m[propName] || value === null) {
            return;
        }
        const oldTexture = m[propName];
        let newTexture: THREE.Texture | undefined;

        if (typeof value === "string") {
            newTexture = new THREE.TextureLoader().load(value, (texture: THREE.Texture) => {
                m[propName] = texture;
            });
        } else if (typeof value === "object") {
            const element = value as any;
            const isImage = element.nodeName === "IMG";
            const isCanvas = element.nodeName === "CANVAS";
            if (isImage || isCanvas) {
                newTexture = new THREE.CanvasTexture(element);

                if (isImage && !element.complete) {
                    const onLoad = () => {
                        m[propName] = newTexture;
                        element.removeEventListener("load", onLoad);
                    };
                    element.addEventListener("load", onLoad);
                } else {
                    m[propName] = newTexture;
                }
            }
        }

        if (newTexture) {
            newTexture.wrapS = oldTexture.wrapS;
            newTexture.wrapT = oldTexture.wrapT;
            newTexture.magFilter = oldTexture.magFilter;
            newTexture.minFilter = oldTexture.minFilter;
            newTexture.flipY = oldTexture.flipY;
            newTexture.repeat = oldTexture.repeat;
        }
    }

    private applyMaterialGenericProp(propName: string, value: Value) {
        const m = this.material as any;
        if (m[propName] instanceof THREE.Color) {
            let colorValue = value;
            if (typeof colorValue !== "number") {
                const parsed = evaluateColorProperty(colorValue);
                if (parsed === undefined) {
                    return;
                }
                colorValue = parsed;
            }
            const rgbValue = ColorUtils.removeAlphaFromHex(colorValue);
            this.tmpColor.set(rgbValue);
            // We set the value, i.e. using =, as opposed to setting the color directly using set
            // because the material may be a custom material with a setter.
            value = this.tmpColor;
        }

        m[propName] = value;
    }

    private applyMaterialBaseColor(color: Value, opacity: number | undefined) {
        if (typeof color !== "number") {
            const parsed = evaluateColorProperty(color);
            if (parsed === undefined) {
                return;
            }
            color = parsed;
        }
        const { r, g, b, a } = ColorUtils.getRgbaFromHex(color ?? 0xff0000);

        const actualOpacity = a * THREE.MathUtils.clamp(opacity ?? 1, 0, 1);
        if (this.material instanceof RawShaderMaterial) {
            this.material.setOpacity(actualOpacity);
        } else {
            this.material.opacity = actualOpacity;
        }

        (this.material as any).color.setRGB(r, g, b);

        const opaque = actualOpacity >= 1.0;
        if (!opaque) {
            enableBlending(this.material);
        } else {
            disableBlending(this.material);
        }
    }
}
