/*
 * Copyright (C) 2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import {
    BaseTechniqueParams,
    BufferAttribute,
    Env,
    Expr,
    ExtrudedPolygonTechnique,
    FillTechnique,
    Geometry,
    getArrayConstructor,
    getPropertyValue,
    Group,
    InterpolatedProperty,
    isExtrudedPolygonTechnique,
    isSolidLineTechnique,
    isTerrainTechnique,
    MakeTechniqueAttrs,
    needsVertexNormals,
    Technique,
    TextGeometry,
    TextPathGeometry
} from "@here/harp-datasource-protocol";
import { cameraToWorldDistance, EdgeMaterial, FadingFeature } from "@here/harp-materials";
import { assert } from "@here/harp-utils";
import {
    applyBaseColorToMaterial,
    createMaterial,
    getBufferAttribute
} from "../DecodedTileHelpers";
import { FadingParameters, PolygonFadingParameters } from "../geometry/TileGeometryCreator";
import { MapView } from "../MapView";
import { TextElement } from "../text/TextElement";
import { Tile, TileFeatureData, TileObject } from "../Tile";
import {
    TechniqueHandler,
    TechniqueUpdateContext,
    TechniqueUpdater,
    TileObjectEntry,
    TileWorldSpaceEntry
} from "./TechniqueHandler";

export abstract class WorldSpaceTechniqueHandlerBase<T extends Technique>
    implements TechniqueHandler {
    readonly technique: T;

    objects: TileWorldSpaceEntry[] = [];
    materials: THREE.Material[] = [];
    textures: THREE.Texture[] = [];

    mapView: MapView;

    protected updaters: TechniqueUpdater[] = [];

    private disposed: boolean = false;
    private lastUpdateFrameNumber: number = -1;

    constructor(technique: T, mapView: MapView) {
        this.technique = technique;
        this.mapView = mapView;
    }

    get isDynamic() {
        return this.updaters.length > 0;
    }

    /**
     * Dispose of this handler.
     *
     * Due to fact, that this is called during theme reset, we dispose only mark that we can be
     * disposed and perform real disposal of resources in [[removeTileObjects]].
     */
    dispose() {
        this.disposed = true;
    }

    removeTileObjects(tile: Tile) {
        this.objects = this.objects.filter(entry => entry.tile !== tile);
        if (this.objects.length === 0 && this.disposed) {
            this.reallyDispose();
        }
    }

    update(context: TechniqueUpdateContext): void {
        if (context.frameNumber === this.lastUpdateFrameNumber) {
            return;
        }
        this.lastUpdateFrameNumber = context.frameNumber;

        for (const updater of this.updaters) {
            updater(context);
        }
    }

    abstract addWorldSpaceObject(tile: Tile, srcGeometry: Geometry, group: Group): THREE.Object3D[];

    addScreenSpaceObject(tile: Tile, text: TextGeometry | TextPathGeometry): TextElement[] {
        assert(false, `addTextElement not supported by ${this.constructor.name}`);
        return [];
    }

    protected createMaterial(technique: Technique, context: TechniqueUpdateContext) {
        const onTextureReady = (texture: THREE.Texture) => {
            this.textures.push(texture);
            this.mapView.update();
        };
        const material = createMaterial({ technique, env: context.env }, onTextureReady);
        if (material === undefined) {
            throw new Error(`#createMaterial unknown technique ${technique.name}`);
        }
        this.materials.push(material);
        return material;
    }

    protected createObject<OT extends THREE.Object3D>(
        tile: Tile,
        srcGeometry: Geometry,
        group: Group | undefined,
        constructor: new (...args: any[]) => OT,
        material: THREE.Material
    ): OT {
        const bufferGeometry = TechniqueHandlerCommon.createGenericBufferGeometry(
            this.technique,
            srcGeometry,
            group
        );
        const object = new constructor(bufferGeometry, material);

        object.renderOrder = this.technique.renderOrder;

        this.registerObject(tile, object);
        return object;
    }

    protected registerObject(tile: Tile, object: THREE.Object3D): TileObject {
        const tileObject = object as TileObject;
        tileObject.techniqueHandler = this;
        this.objects.push({ tile, object });
        return tileObject;
    }

    protected reallyDispose() {
        for (const texture of this.textures) {
            texture.dispose();
        }

        for (const material of this.materials) {
            material.dispose();
        }
    }
}

export namespace TechniqueHandlerCommon {
    type MaterialWithBaseColor = THREE.Material & {
        color: THREE.Color;
    };

    interface TechniqueWithColor {
        color?: string | number | Expr | InterpolatedProperty;
        opacity?: number | Expr | InterpolatedProperty;
    }

    export function forEachTileObject<T>(
        objects: Array<TileObjectEntry<T>>,
        context: TechniqueUpdateContext,
        callback: (target: T) => void
    ) {
        for (const entry of objects) {
            if (entry.tile.frameNumLastVisible === context.frameNumber) {
                callback(entry.object);
            }
        }
    }

    export function updateBaseColor(
        material: MaterialWithBaseColor,
        objects: TileWorldSpaceEntry[],
        technique: Technique & TechniqueWithColor,
        context: TechniqueUpdateContext
    ) {
        const lastOpacity = material.opacity;
        applyBaseColorToMaterial(
            material,
            material.color,
            technique,
            technique.color!,
            context.env
        );
        if (lastOpacity !== material.opacity) {
            forEachTileObject(objects, context, target => {
                target.visible = material.opacity > 0;
            });
        }
    }

    export function getFadingParams(
        technique: MakeTechniqueAttrs<BaseTechniqueParams>,
        env: Env
    ): FadingParameters {
        const fadeNear =
            technique.fadeNear !== undefined
                ? getPropertyValue(technique.fadeNear, env)
                : FadingFeature.DEFAULT_FADE_NEAR;
        const fadeFar =
            technique.fadeFar !== undefined
                ? getPropertyValue(technique.fadeFar, env)
                : FadingFeature.DEFAULT_FADE_FAR;
        return {
            fadeNear,
            fadeFar
        };
    }

    export function getPolygonFadingParams(
        technique: FillTechnique | ExtrudedPolygonTechnique,
        env: Env
    ): PolygonFadingParameters {
        let color: string | number | undefined;
        let colorMix = EdgeMaterial.DEFAULT_COLOR_MIX;

        if (technique.lineColor !== undefined) {
            color = getPropertyValue(technique.lineColor, env);
            if (isExtrudedPolygonTechnique(technique)) {
                const extrudedPolygonTechnique = technique as ExtrudedPolygonTechnique;
                colorMix =
                    extrudedPolygonTechnique.lineColorMix !== undefined
                        ? extrudedPolygonTechnique.lineColorMix
                        : EdgeMaterial.DEFAULT_COLOR_MIX;
            }
        }

        const fadeNear =
            technique.fadeNear !== undefined
                ? getPropertyValue(technique.fadeNear, env)
                : FadingFeature.DEFAULT_FADE_NEAR;
        const fadeFar =
            technique.fadeFar !== undefined
                ? getPropertyValue(technique.fadeFar, env)
                : FadingFeature.DEFAULT_FADE_FAR;

        const lineFadeNear =
            technique.lineFadeNear !== undefined
                ? getPropertyValue(technique.lineFadeNear, env)
                : fadeNear;
        const lineFadeFar =
            technique.lineFadeFar !== undefined
                ? getPropertyValue(technique.lineFadeFar, env)
                : fadeFar;

        if (color === undefined) {
            color = EdgeMaterial.DEFAULT_COLOR;
        }

        return {
            color,
            colorMix,
            fadeNear,
            fadeFar,
            lineFadeNear,
            lineFadeFar
        };
    }

    export function isFadingFeatureEnabled(fadingParameters: FadingParameters) {
        let { fadeFar, fadeNear } = fadingParameters;

        if (fadeNear === FadingFeature.DEFAULT_FADE_NEAR) {
            fadeNear = undefined;
        }
        if (fadeFar === FadingFeature.DEFAULT_FADE_FAR) {
            fadeFar = undefined;
        }

        return fadeNear !== undefined || fadeFar !== undefined;
    }

    export function updateFadingParams(
        material: FadingFeature,
        fadingParameters: FadingParameters,
        context: TechniqueUpdateContext
    ) {
        const { fadeFar, fadeNear } = fadingParameters;

        if (fadeNear !== undefined) {
            material.fadeNear = cameraToWorldDistance(fadeNear, context.viewRanges);
        }
        if (fadeFar !== undefined) {
            material.fadeFar = cameraToWorldDistance(fadeFar, context.viewRanges);
        }
    }

    export function updateEdgeFadingParams(
        material: FadingFeature,
        fadingParameters: PolygonFadingParameters,
        context: TechniqueUpdateContext
    ) {
        const fadeFar = fadingParameters.lineFadeFar;
        const fadeNear = fadingParameters.lineFadeNear;

        if (fadeNear !== undefined) {
            material.fadeNear = cameraToWorldDistance(fadeNear, context.viewRanges);
        }
        if (fadeFar !== undefined) {
            material.fadeFar = cameraToWorldDistance(fadeFar, context.viewRanges);
        }
    }

    export function createGenericBufferGeometry(
        technique: Technique,
        srcGeometry: Geometry,
        group?: Group
    ) {
        const bufferGeometry = new THREE.BufferGeometry();

        srcGeometry.vertexAttributes.forEach((vertexAttribute: BufferAttribute) => {
            const buffer = getBufferAttribute(vertexAttribute);
            bufferGeometry.setAttribute(vertexAttribute.name, buffer);
        });

        if (srcGeometry.interleavedVertexAttributes !== undefined) {
            srcGeometry.interleavedVertexAttributes.forEach(
                (attr: {
                    type: any;
                    buffer: any;
                    stride: any;
                    attributes: {
                        forEach: (
                            arg0: (interleavedAttr: {
                                itemSize: any;
                                offset: any;
                                name: any;
                            }) => void
                        ) => void;
                    };
                }) => {
                    const ArrayCtor = getArrayConstructor(attr.type);
                    const buffer = new THREE.InterleavedBuffer(
                        new ArrayCtor(attr.buffer),
                        attr.stride
                    );
                    attr.attributes.forEach(
                        (interleavedAttr: { itemSize: any; offset: any; name: any }) => {
                            const attribute = new THREE.InterleavedBufferAttribute(
                                buffer,
                                interleavedAttr.itemSize,
                                interleavedAttr.offset,
                                false
                            );
                            bufferGeometry.setAttribute(interleavedAttr.name, attribute);
                        }
                    );
                }
            );
        }

        if (srcGeometry.index) {
            bufferGeometry.setIndex(getBufferAttribute(srcGeometry.index));
        }

        if (!bufferGeometry.getAttribute("normal") && needsVertexNormals(technique)) {
            bufferGeometry.computeVertexNormals();
        }

        if (group !== undefined) {
            bufferGeometry.addGroup(group.start, group.count);
        }
        return bufferGeometry;
    }

    export function setupUserData(
        srcGeometry: Geometry,
        technique: Technique,
        object: THREE.Object3D
    ) {
        if (srcGeometry.uuid !== undefined) {
            object.userData.geometryId = srcGeometry.uuid;
        }

        if ((srcGeometry.objInfos?.length ?? 0) === 0) {
            return;
        }

        if (isTerrainTechnique(technique)) {
            // TODO: why terrain technique retrofits something strange into objInfos?
            return;
        } else if (isSolidLineTechnique(technique)) {
            object.userData = srcGeometry.objInfos!;
        } else {
            // Set the feature data for picking with `MapView.intersectMapObjects()` except for
            // solid-line which uses tile-based picking.
            const featureData: TileFeatureData = {
                geometryType: srcGeometry.type,
                starts: srcGeometry.featureStarts,
                objInfos: srcGeometry.objInfos
            };
            object.userData.feature = featureData;
            object.userData.technique = technique;
        }
    }
}
