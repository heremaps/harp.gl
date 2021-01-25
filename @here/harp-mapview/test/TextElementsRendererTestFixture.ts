/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { MapEnv, Theme } from "@here/harp-datasource-protocol";
import { identityProjection, TileKey } from "@here/harp-geoutils";
import { silenceLoggingAroundFunction } from "@here/harp-test-utils";
import { FontCatalog, TextCanvas } from "@here/harp-text-canvas";
import { assert, expect } from "chai";
import * as sinon from "sinon";
import * as THREE from "three";

import { PoiRenderer } from "../lib/poi/PoiRenderer";
import { ScreenCollisions } from "../lib/ScreenCollisions";
import { ScreenProjector } from "../lib/ScreenProjector";
import * as FontCatalogLoader from "../lib/text/FontCatalogLoader";
import { TextCanvasFactory } from "../lib/text/TextCanvasFactory";
import { TextElement } from "../lib/text/TextElement";
import { TextElementsRenderer } from "../lib/text/TextElementsRenderer";
import { TextElementsRendererOptions } from "../lib/text/TextElementsRendererOptions";
import { TextElementType } from "../lib/text/TextElementType";
import { ViewState } from "../lib/text/ViewState";
import { Tile } from "../lib/Tile";
import { TileOffsetUtils } from "../lib/Utils";
import { DataSourceTileList } from "../lib/VisibleTileSet";
import { FakeOmvDataSource } from "./FakeOmvDataSource";
import {
    ElevationProviderStub,
    fakeTileDisplacementMap,
    stubElevationProvider
} from "./stubElevationProvider";
import { stubFontCatalog } from "./stubFontCatalog";
import { stubPoiManager } from "./stubPoiManager";
import { stubPoiRenderer } from "./stubPoiRenderer";
import { stubTextCanvas, stubTextCanvasFactory } from "./stubTextCanvas";
import { FadeState } from "./TextElementsRendererTestUtils";

//    expect-type assertions are unused expressions and are perfectly valid

//    lots of stubs are needed which are just placeholders and are empty

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

function createViewState(worldCenter: THREE.Vector3, sandbox: sinon.SinonSandbox): ViewState {
    return {
        worldCenter,
        cameraIsMoving: false,
        maxVisibilityDist: 10000,
        // This level affects the distance tolerance applied to find label replacement by location.
        zoomLevel: 20,
        env: new MapEnv({ $zoom: 20 }),
        frameNumber: 0,
        lookAtVector: new THREE.Vector3(0, 0, 1),
        lookAtDistance: 10,
        isDynamic: false,
        hiddenGeometryKinds: undefined,
        renderedTilesChanged: false,
        projection: identityProjection,
        elevationProvider: undefined
    };
}

type OpacityMatcher = (opacity: number) => boolean;

export const SCREEN_WIDTH = 1920;
export const SCREEN_HEIGHT = 1080;
export const DEF_TEXT_WIDTH = 30;
export const DEF_TEXT_HEIGHT = 10;
export const WORLD_SCALE = 100;

const TILE_LEVEL = 5; // dummy tile level.

/**
 * Sets up a screen projector so that world coordinates are equivalent to normalized device
 * coordinates multiplied by WORLD_SCALE.
 * @returns Screen projector.
 */
function createScreenProjector(): ScreenProjector {
    const camera = new THREE.OrthographicCamera(
        -WORLD_SCALE,
        WORLD_SCALE,
        WORLD_SCALE,
        -WORLD_SCALE,
        0,
        WORLD_SCALE
    );
    camera.position.z = WORLD_SCALE;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const screenProjector = new ScreenProjector(camera);
    screenProjector.update(camera, SCREEN_WIDTH, SCREEN_HEIGHT);
    return screenProjector;
}

/**
 * Test fixture used to test TextElementsRenderer.
 */
export class TestFixture {
    private readonly m_screenCollisions: ScreenCollisions;
    private readonly tileLists: DataSourceTileList[] = [];
    private readonly m_poiRendererStub: sinon.SinonStubbedInstance<PoiRenderer>;
    private readonly m_elevationProviderStub: ElevationProviderStub;
    private readonly m_renderPoiSpy: sinon.SinonSpy;
    private readonly m_addTextSpy: sinon.SinonSpy;
    private readonly m_addTextBufferObjSpy: sinon.SinonSpy;
    private readonly m_dataSource: FakeOmvDataSource = new FakeOmvDataSource({ name: "omv" });
    private readonly m_screenProjector: ScreenProjector;
    private readonly m_theme: Theme = {};
    private m_viewState: ViewState;
    private m_options: TextElementsRendererOptions = {};
    private m_screenCollisionTestStub: sinon.SinonStub | undefined;
    private m_textCanvasStub: TextCanvas | undefined;
    private m_textRenderer: TextElementsRenderer | undefined;
    private m_loadCatalogStub: sinon.SinonStub | undefined;
    private m_textCanvasFactoryStub: sinon.SinonStubbedInstance<TextCanvasFactory> | undefined;
    private m_fontCatalog: FontCatalog | undefined;
    private m_defaultTile: Tile | undefined;
    private m_allTiles: Tile[] = [];
    private readonly m_allTextElements: TextElement[][] = [];

    constructor(readonly sandbox: sinon.SinonSandbox) {
        this.m_screenCollisions = new ScreenCollisions();
        this.m_screenCollisions.update(SCREEN_WIDTH, SCREEN_HEIGHT);
        this.m_viewState = createViewState(new THREE.Vector3(), sandbox);
        this.m_renderPoiSpy = sandbox.spy();
        this.m_addTextSpy = sandbox.spy();
        this.m_addTextBufferObjSpy = sandbox.spy();
        this.m_poiRendererStub = stubPoiRenderer(this.sandbox, this.m_renderPoiSpy);
        this.m_elevationProviderStub = stubElevationProvider(this.sandbox);
        this.m_screenProjector = createScreenProjector();
    }

    /**
     * Sets up required before every test case.
     */
    async setUp(): Promise<void> {
        this.m_defaultTile = this.m_dataSource.getTile(new TileKey(0, 0, TILE_LEVEL));
        this.m_defaultTile.textElementsChanged = true;
        this.m_allTiles = [];
        this.tileLists.push({
            dataSource: this.m_dataSource,
            zoomLevel: 0,
            storageLevel: 0,
            allVisibleTileLoaded: false,
            numTilesLoading: 0,
            visibleTiles: [this.m_defaultTile],
            renderedTiles: new Map([[1, this.m_defaultTile]])
        });
        this.m_options = {
            labelDistanceScaleMin: 1,
            labelDistanceScaleMax: 1,
            fontCatalog: "./resources/fonts/Default_FontCatalog.json"
        };
        this.m_fontCatalog = stubFontCatalog(this.sandbox);
        this.m_textCanvasStub = stubTextCanvas(
            this.sandbox,
            this.m_addTextSpy,
            this.m_addTextBufferObjSpy,
            this.m_fontCatalog,
            DEF_TEXT_WIDTH,
            DEF_TEXT_HEIGHT
        );
        const dummyUpdateCall = () => {};
        this.m_loadCatalogStub = this.sandbox.stub(FontCatalogLoader, "loadFontCatalog").resolves();

        this.m_textCanvasFactoryStub = stubTextCanvasFactory(this.sandbox, this.m_textCanvasStub);
        this.m_textRenderer = new TextElementsRenderer(
            this.m_viewState,
            dummyUpdateCall,
            this.m_screenProjector,
            stubPoiManager(this.sandbox),
            sinon.createStubInstance(THREE.WebGLRenderer),
            [],
            this.m_options,
            (this.m_textCanvasFactoryStub as unknown) as TextCanvasFactory,
            (this.m_poiRendererStub as unknown) as PoiRenderer,
            this.m_screenCollisions
        );
        this.m_textRenderer.updateTextStyles(this.m_theme.textStyles);
        this.m_loadCatalogStub.yieldOn("onSuccess", "default", this.m_fontCatalog);
        return this.m_textRenderer.waitLoaded();
    }

    /**
     * Checks that the fading state of a given text element has the specified expected value.
     * @param textElement - The text element to verify.
     * @param expectedState - The expected fading state of the text element.
     * @param expectedIconState - The expected fading state of the icon.
     * @param prevOpacities - The text and icon opacities in the previous frame.
     * @param lineMarkerIndex - Line marker index if the text element contains line markers.
     * @returns The text and icon opacity in the current frame.
     */
    checkTextElementState(
        textElement: TextElement,
        expectedState: FadeState,
        expectedIconState: FadeState | undefined,
        prevOpacities: [number, number],
        lineMarkerIndex?: number
    ): [number, number] {
        let iconOpacityMatcher: ((arg0: number) => boolean) | undefined;
        let iconRendered = true;

        if (expectedIconState !== undefined) {
            switch (expectedIconState) {
                case FadeState.FadingIn:
                    iconOpacityMatcher = (opacity: number) => {
                        return opacity > prevOpacities[1];
                    };
                    break;
                case FadeState.FadingOut:
                    iconOpacityMatcher = (opacity: number) => {
                        return opacity < prevOpacities[1];
                    };
                    break;
                case FadeState.FadedIn:
                    iconOpacityMatcher = (opacity: number) => {
                        return opacity === 1;
                    };
                    break;
                case FadeState.FadedOut:
                    iconOpacityMatcher = (opacity: number) => {
                        return opacity === 0;
                    };
                    iconRendered = false;
                    break;
            }
        }

        let newOpacities: [number, number] = [0, 0];
        switch (expectedState) {
            case FadeState.FadingIn:
                newOpacities = this.checkTextElementRendered(
                    textElement,
                    (opacity: number) => {
                        return opacity > prevOpacities[0];
                    },
                    iconRendered,
                    iconOpacityMatcher,
                    lineMarkerIndex
                );
                break;
            case FadeState.FadingOut:
                newOpacities = this.checkTextElementRendered(
                    textElement,
                    (opacity: number) => {
                        return opacity < prevOpacities[0];
                    },
                    iconRendered,
                    iconOpacityMatcher,
                    lineMarkerIndex
                );
                break;
            case FadeState.FadedIn:
                newOpacities = this.checkTextElementRendered(
                    textElement,
                    (opacity: number) => {
                        return opacity === 1;
                    },
                    iconRendered,
                    iconOpacityMatcher,
                    lineMarkerIndex
                );
                break;
            case FadeState.FadedOut:
                this.checkTextElementNotRendered(textElement, lineMarkerIndex);
                break;
        }
        return newOpacities;
    }

    /**
     * Adds a tile for testing that will contain the specified text elements. Tiles added this way
     * can later be referenced by index when rendering a frame. See [[renderFrame]].
     * @param elements - The text elements the new tile will contain.
     */
    addTile(elements: TextElement[]) {
        const tile =
            this.m_allTiles.length > 0
                ? this.m_dataSource.getTile(
                      new TileKey(
                          this.m_allTiles[this.m_allTiles.length - 1].tileKey.row + 1,
                          0,
                          TILE_LEVEL
                      )
                  )
                : this.m_defaultTile!;
        for (const element of elements) {
            tile.addTextElement(element);
        }
        this.m_allTiles.push(tile);
        this.m_allTextElements.push(elements);
    }

    setTileTextElements(tileIndex: number, elementEnabled: boolean[]) {
        const tile = this.m_allTiles[tileIndex];
        const allElements = this.m_allTextElements[tileIndex];
        const tileElementGroups = tile.textElementGroups;
        assert(allElements.length === elementEnabled.length);

        for (let i = 0; i < allElements.length; ++i) {
            const element = allElements[i];
            const addElement = elementEnabled[i];
            const elementPresent = [...tileElementGroups.groups.values()].find(group =>
                group.elements.includes(element)
            );
            if (addElement && !elementPresent) {
                tile.addTextElement(element);
            } else if (!addElement && elementPresent) {
                tile.removeTextElement(element);
            }
        }
    }

    /**
     * Renders text elements for a given frame.
     * @param time - The time when the frame takes place.
     * @param tileIndices - The indices of the tiles that will be visible in this frame.
     * @param terrainTileIndices - The indices of the terrain tiles that will be ready in
     *                             this frame.
     * @param collisionEnabled - Whether label collision will be enabled in this frame.
     */
    async renderFrame(
        time: number,
        tileIndices: number[],
        terrainTileIndices: number[],
        collisionEnabled: boolean = true
    ) {
        this.sandbox.resetHistory();
        if (collisionEnabled && this.m_screenCollisionTestStub !== undefined) {
            this.m_screenCollisionTestStub.restore();
            this.m_screenCollisionTestStub = undefined;
        } else if (!collisionEnabled && this.m_screenCollisionTestStub === undefined) {
            this.m_screenCollisionTestStub = (this.sandbox
                .stub(this.m_screenCollisions, "intersectsDetails")
                .returns(false) as unknown) as sinon.SinonStub;
        }
        if (this.textRenderer.loading) {
            await this.textRenderer.waitLoaded();
        }
        this.m_viewState.renderedTilesChanged = false;
        if (tileIndices !== undefined) {
            this.m_viewState.renderedTilesChanged = this.setVisibleTiles(tileIndices);
        }

        if (this.m_viewState.elevationProvider) {
            this.setTerrainTiles(terrainTileIndices);
        }

        this.m_viewState.frameNumber++;
        silenceLoggingAroundFunction(["TextElementsRenderer", "TextElementsStateCache"], () => {
            this.textRenderer.placeText(this.tileLists, time);
        });
    }

    get textRenderer(): TextElementsRenderer {
        assert(this.m_textRenderer !== undefined);
        return this.m_textRenderer!;
    }

    get loadCatalogStub(): sinon.SinonStub {
        assert(this.m_loadCatalogStub !== undefined);
        return this.m_loadCatalogStub!;
    }

    get fontCatalog(): FontCatalog {
        assert(this.m_fontCatalog !== undefined);
        return this.m_fontCatalog!;
    }

    get textCanvasFactoryStub(): sinon.SinonStubbedInstance<TextCanvasFactory> {
        assert(this.m_textCanvasFactoryStub !== undefined);
        return this.m_textCanvasFactoryStub!;
    }

    setElevationProvider(enabled: boolean) {
        this.m_viewState.elevationProvider = enabled ? this.m_elevationProviderStub : undefined;
    }

    private checkTextElementRendered(
        textElement: TextElement,
        opacityMatcher: OpacityMatcher | undefined,
        iconRendered: boolean,
        iconOpacityMatcher: OpacityMatcher | undefined,
        lineMarkerIndex?: number
    ): [number, number] {
        if (this.m_viewState.elevationProvider) {
            assert(
                textElement.elevated,
                this.getErrorHeading(textElement, lineMarkerIndex) + " was NOT elevated."
            );
        }
        if (textElement.type === TextElementType.PathLabel) {
            return [this.checkPathTextRendered(textElement, opacityMatcher), 0];
        } else {
            if (textElement.poiInfo !== undefined) {
                return this.checkPoiRendered(
                    textElement,
                    opacityMatcher,
                    iconRendered,
                    iconOpacityMatcher,
                    lineMarkerIndex
                );
            } else {
                return [
                    this.checkPointTextRendered(textElement, opacityMatcher, lineMarkerIndex),
                    0
                ];
            }
        }
    }

    private checkTextElementNotRendered(textElement: TextElement, lineMarkerIndex?: number) {
        if (textElement.type === TextElementType.PathLabel) {
            return this.checkPathTextNotRendered(textElement);
        } else {
            // PathLabel or LineMarker
            if (textElement.poiInfo !== undefined) {
                return this.checkPoiNotRendered(textElement, lineMarkerIndex);
            } else {
                return this.checkPointTextNotRendered(textElement, lineMarkerIndex);
            }
        }
    }

    private setVisibleTiles(indices: number[]): boolean {
        const newVisibleTiles = indices.map((tileIdx: number) => {
            return this.m_allTiles[tileIdx];
        });
        let changed = indices.length !== this.visibleTiles.length;
        if (!changed) {
            for (let i = 0; i < this.visibleTiles.length; ++i) {
                const oldTile = this.visibleTiles[i];
                const newTile = this.m_allTiles[indices[i]];
                if (oldTile !== newTile) {
                    changed = true;
                    break;
                }
            }
        }
        if (!changed) {
            return false;
        }
        this.visibleTiles = newVisibleTiles;
        return true;
    }

    private setTerrainTiles(indices: number[]) {
        expect(this.m_viewState.elevationProvider).not.undefined;
        this.m_elevationProviderStub.getDisplacementMap.resetBehavior();
        this.m_elevationProviderStub.getDisplacementMap.returns(undefined);

        for (const index of indices) {
            const tileKey = this.m_allTiles[index].tileKey;
            this.m_elevationProviderStub.getDisplacementMap
                .withArgs(
                    sinon.match
                        .has("row", tileKey.row)
                        .and(sinon.match.has("column", tileKey.column))
                        .and(sinon.match.has("level", tileKey.level))
                )
                .callsFake(fakeTileDisplacementMap);
        }
    }

    private get visibleTiles(): Tile[] {
        return this.tileLists[0].visibleTiles;
    }

    private set visibleTiles(tiles: Tile[]) {
        this.tileLists[0].visibleTiles = tiles;
        this.tileLists[0].renderedTiles.clear();
        for (const tile of tiles) {
            this.tileLists[0].renderedTiles.set(
                TileOffsetUtils.getKeyForTileKeyAndOffset(tile.tileKey, 0),
                tile
            );
        }
    }

    private checkPointTextRendered(
        textElement: TextElement,
        opacityMatcher: OpacityMatcher | undefined,
        posIdx?: number
    ): number {
        const screenCoords = this.computeScreenCoordinates(
            textElement,
            textElement.xOffset,
            textElement.yOffset,
            posIdx
        );
        expect(screenCoords).to.exist;
        assert(
            this.m_addTextBufferObjSpy.calledWith(
                sinon.match.same(textElement),
                sinon.match.any,
                sinon.match.any
            ),
            this.getErrorHeading(textElement, posIdx) + "point text was NOT rendered."
        );

        const addBufferObjSpy = this.m_addTextBufferObjSpy.withArgs(
            sinon.match.same(textElement),
            sinon.match.any,
            sinon.match.array.deepEquals(screenCoords!.toArray())
        );
        assert(
            addBufferObjSpy.calledOnce,
            this.getErrorHeading(textElement, posIdx) +
                "point text was NOT in expected position " +
                JSON.stringify(screenCoords)
        );
        const actualOpacity = addBufferObjSpy.firstCall.args[1];
        this.checkOpacity(actualOpacity, textElement, "text", opacityMatcher);
        return actualOpacity;
    }

    private checkPointTextNotRendered(textElement: TextElement, posIdx?: number) {
        const screenCoords = this.computeScreenCoordinates(
            textElement,
            textElement.xOffset,
            textElement.yOffset,
            posIdx
        );
        assert(
            this.m_addTextBufferObjSpy.neverCalledWith(
                sinon.match.same(textElement),
                sinon.match.any,
                sinon.match.array.deepEquals(screenCoords!.toArray())
            ),
            this.getErrorHeading(textElement, posIdx) + "point text was rendered."
        );
    }

    private checkIconRendered(
        textElement: TextElement,
        opacityMatcher: OpacityMatcher | undefined,
        posIdx?: number
    ): number {
        const screenCoords = this.computeScreenCoordinates(textElement, 0, 0, posIdx);
        expect(screenCoords).to.exist;
        assert(
            this.m_renderPoiSpy.calledWith(
                sinon.match.same(textElement.poiInfo),
                sinon.match.any,
                sinon.match.any
            ),
            this.getErrorHeading(textElement, posIdx) + "icon was NOT rendered."
        );
        const renderPoiSpy = this.m_renderPoiSpy.withArgs(
            sinon.match.same(textElement.poiInfo),
            sinon.match.array.deepEquals(screenCoords!.toArray()),
            sinon.match.any
        );
        assert(
            renderPoiSpy.called,
            this.getErrorHeading(textElement, posIdx) +
                "icon was NOT rendered in expected position " +
                JSON.stringify(screenCoords)
        );
        const actualOpacity = renderPoiSpy.firstCall.args[2];
        let labelPartDescription: string = "icon";
        if (posIdx !== undefined) {
            labelPartDescription += " " + posIdx;
        }
        this.checkOpacity(actualOpacity, textElement, labelPartDescription, opacityMatcher);
        return actualOpacity;
    }

    private checkIconNotRendered(textElement: TextElement, posIdx?: number) {
        const screenCoords = this.computeScreenCoordinates(textElement, 0, 0, posIdx);
        assert(
            this.m_renderPoiSpy.neverCalledWith(
                sinon.match.same(textElement.poiInfo),
                sinon.match
                    .typeOf("undefined")
                    .or(sinon.match.array.deepEquals(screenCoords!.toArray())),
                sinon.match.any
            ),
            this.getErrorHeading(textElement, posIdx) + "icon was rendered."
        );
    }

    private checkPoiRendered(
        textElement: TextElement,
        opacityMatcher: OpacityMatcher | undefined,
        iconRendered: boolean,
        iconOpacityMatcher: OpacityMatcher | undefined,
        lineMarkerIndex?: number
    ): [number, number] {
        const textOpacity = this.checkPointTextRendered(
            textElement,
            opacityMatcher,
            lineMarkerIndex
        );
        let iconOpacity = 0;
        if (iconRendered) {
            iconOpacity = this.checkIconRendered(textElement, iconOpacityMatcher, lineMarkerIndex);
        } else {
            this.checkIconNotRendered(textElement, lineMarkerIndex);
        }
        return [textOpacity, iconOpacity];
    }

    private checkPoiNotRendered(textElement: TextElement, lineMarkerIndex?: number) {
        this.checkPointTextNotRendered(textElement, lineMarkerIndex);
        this.checkIconNotRendered(textElement, lineMarkerIndex);
    }

    private checkPathTextRendered(
        textElement: TextElement,
        opacityMatcher: OpacityMatcher | undefined
    ): number {
        const addTextSpy = this.m_addTextSpy.withArgs(sinon.match.same(textElement));
        expect(textElement.renderStyle, this.getErrorHeading(textElement) + "render style not set")
            .exist;
        assert(
            addTextSpy.calledOnce,
            this.getErrorHeading(textElement) + "path text was NOT rendered."
        );
        const actualOpacity = addTextSpy.firstCall.args[1];
        this.checkOpacity(actualOpacity, textElement, "text", opacityMatcher);
        return actualOpacity;
    }

    private checkPathTextNotRendered(textElement: TextElement) {
        const addTextStub = this.m_textCanvasStub!.addText as sinon.SinonStub;
        assert(
            addTextStub.neverCalledWith(sinon.match.same(textElement)),
            this.getErrorHeading(textElement) + "path text was rendered."
        );
    }

    private computeScreenCoordinates(
        textElement: TextElement,
        xOffset: number,
        yOffset: number,
        positionIndex?: number
    ): THREE.Vector2 | undefined {
        if (positionIndex !== undefined) {
            expect(textElement.path).exist;
        }
        const worldCoords =
            positionIndex !== undefined ? textElement.path![positionIndex] : textElement.position;
        return this.m_screenProjector!.project(worldCoords)?.add(
            new THREE.Vector2(xOffset, yOffset)
        );
    }

    private checkOpacity(
        actualOpacity: number,
        textElement: TextElement,
        labelPartDescription: string,
        opacityMatcher: OpacityMatcher | undefined
    ) {
        const errorMessage =
            this.getErrorHeading(textElement) +
            "has wrong " +
            labelPartDescription +
            " opacity " +
            actualOpacity;
        expect(actualOpacity, errorMessage).gte(0).and.lte(1);
        if (opacityMatcher !== undefined) {
            assert(opacityMatcher(actualOpacity), errorMessage);
        }
    }

    private getErrorHeading(textElement: TextElement, posIdx?: number): string {
        // Subtract first initialization frame and 1 more because the view state holds the number
        // of the next frame.
        const currentFrame = this.m_viewState.frameNumber - 2;
        const posIdxStr = posIdx !== undefined ? `(pIdx ${posIdx})` : "";
        return `Frame ${currentFrame}, label '${textElement.text}' ${posIdxStr}: `;
    }
}
