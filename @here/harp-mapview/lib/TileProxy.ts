import { DecodedTile, TextPathGeometry } from "@here/harp-datasource-protocol";
import { GeoBox, Projection, TileKey } from "@here/harp-geoutils";
import { assert, GroupedPriorityList } from "@here/harp-utils";
import * as THREE from "three";
import { CopyrightInfo, DataSource, TextElement, Tile } from "..";
import {
    ITile,
    ITileLoader,
    RoadIntersectionData,
    TileObject,
    TileResourceUsageInfo
} from "./ITile";

/**
 * Proxies a Tile with a given offset (a numeric value to represent the longitudinal shift of the
 * tile (a multiple of 360 degrees)). The given offset should be non zero, because we don't need to
 * proxy the Tile at offset 0 (a Tile is by definition at offset 0).
 *
 * Why? we proxy because it saves resources (the underlying geometry / materials are shared) and it
 * is simple to offset the geometry (the THREE.Object3D must be cloned and then shifted,
 * unfortunately this is the only way to render a given mesh / material twice, a THREE.Object3D is
 * however quite lightweight so this doesn't pose any problem).
 */
export class TileProxy implements ITile {
    /**
     * Copies of the objects in the proxied [[Tile]].
     */
    objects: TileObject[] = [];

    /**
     * @inheritdoc
     *
     * Used to track the proxied [[Tile]]s geometry version (to know when it has changed so that the
     * objects can be cloned).
     */
    geometryVersion: number = 0;

    get geoBox(): GeoBox {
        return this.tile.geoBox;
    }

    get boundingBox(): THREE.Box3 {
        return this.tile.boundingBox;
    }

    get center(): THREE.Vector3 {
        return this.tile.center;
    }

    get placedTextElements(): GroupedPriorityList<TextElement> {
        return this.tile.placedTextElements;
    }

    get memoryUsage(): number {
        return this.tile.memoryUsage;
    }

    get usageStatistics(): TileResourceUsageInfo {
        return this.tile.usageStatistics;
    }

    get userTextElements(): TextElement[] {
        return this.tile.userTextElements;
    }

    get textElementGroups(): GroupedPriorityList<TextElement> {
        return this.tile.textElementGroups;
    }

    get disposed(): boolean {
        return this.tile.disposed;
    }

    get hasGeometry(): boolean {
        return this.tile.hasGeometry;
    }

    get dataSource(): DataSource {
        return this.tile.dataSource;
    }

    get tileKey(): TileKey {
        return this.tile.tileKey;
    }

    get textElementsChanged(): boolean {
        return this.tile.textElementsChanged;
    }

    set textElementsChanged(val: boolean) {
        this.tile.textElementsChanged = val;
    }

    get roadIntersectionData(): RoadIntersectionData | undefined {
        return this.tile.roadIntersectionData;
    }

    get copyrightInfo(): CopyrightInfo[] | undefined {
        return this.tile.copyrightInfo;
    }

    set copyrightInfo(val: CopyrightInfo[] | undefined) {
        this.tile.copyrightInfo = val;
    }

    get frameNumRequested(): number {
        return this.tile.frameNumRequested;
    }

    get frameNumVisible(): number {
        return this.tile.frameNumVisible;
    }

    set frameNumVisible(val: number) {
        this.tile.frameNumVisible = val;
    }

    get frameNumLastVisible(): number {
        return this.tile.frameNumLastVisible;
    }

    set frameNumLastVisible(val: number) {
        this.tile.frameNumLastVisible = val;
    }

    get numFramesVisible(): number {
        return this.tile.numFramesVisible;
    }

    set numFramesVisible(val: number) {
        this.tile.numFramesVisible = val;
    }

    get isVisible(): boolean {
        return this.tile.isVisible;
    }

    set isVisible(val: boolean) {
        this.tile.isVisible = val;
    }

    get visibleArea(): number {
        return this.tile.visibleArea;
    }

    set visibleArea(visibleArea: number) {
        this.tile.visibleArea = visibleArea;
    }

    get decodedTile(): DecodedTile | undefined {
        return this.tile.decodedTile;
    }

    get tileLoader(): ITileLoader | undefined {
        return this.tile.tileLoader;
    }

    get isProxy() {
        return true;
    }

    /**
     * Constructs a [[TileProxy]] object which proxies a [[Tile]]
     *
     * @param tile The [[Tile]] which is to be proxied.
     * @param offset An integer offset which indicates how many spins of the globe (along the
     * equator) is requried to reach the given tile. For example, an offset of 0 means no
     * longitudinal offset whereas 2 means that the globe is spun twice, and therefore has an
     * offset of 720 degrees, or 4*PI radians.
     */
    constructor(readonly tile: Tile, readonly offset: number) {
        assert(!tile.isProxy);
    }

    addUserTextElement(textElement: TextElement): void {
        this.tile.addUserTextElement(textElement);
    }

    removeUserTextElement(textElement: TextElement): boolean {
        return this.removeUserTextElement(textElement);
    }

    addTextElement(textElement: TextElement): void {
        this.addTextElement(textElement);
    }

    removeTextElement(textElement: TextElement): boolean {
        return this.removeTextElement(textElement);
    }

    prepareForRender(): void {
        this.tile.prepareForRender();
    }

    willRender(_zoomLevel: number): boolean {
        return this.tile.willRender(_zoomLevel);
    }

    didRender(): void {
        this.tile.didRender();
    }

    shouldDisposeObjectGeometry(object: TileObject): boolean {
        return this.shouldDisposeObjectGeometry(object);
    }

    shouldDisposeObjectMaterial(object: TileObject): boolean {
        return this.shouldDisposeObjectMaterial(object);
    }

    forceHasGeometry(value: boolean): void {
        this.tile.forceHasGeometry(value);
    }

    /**
     * Clears internal cleared items and asks the tile to reload.
     */
    reload(): void {
        this.dispose();
        this.tile.reload();
    }

    /**
     * Clears cloned items. We don't proxy the [[Tile]]s dispose method because this will be called
     * for that particular object (remember this object doesn't own the [[Tile]]), we just clear the
     * items we have cloned ourself.
     */
    dispose(): void {
        this.objects = [];
        this.geometryVersion = 0;
    }

    prepareTextPaths(textPathGeometries: TextPathGeometry[]): TextPathGeometry[] {
        return this.tile.prepareTextPaths(textPathGeometries);
    }

    createTextElements(decodedTile: DecodedTile): void {
        this.tile.createTextElements(decodedTile);
    }

    /**
     * Clones the underlying [[Tile]] TileObjects. The shifting of the positions is handled in the
     * [[renderTileObjects]] function in [[MapView]].
     */
    clone() {
        assert(this.geometryVersion !== this.tile.geometryVersion);
        assert(this.tile.hasGeometry);
        for (const tileObject of this.tile.objects) {
            // See: https://github.com/mrdoob/three.js/pull/15062
            if (!(tileObject instanceof THREE.Line)) {
                const clone = tileObject.clone();
                // These aren't cloned across unfortunately and must be manually transferred.
                clone.onBeforeRender = tileObject.onBeforeRender;
                clone.onAfterRender = tileObject.onAfterRender;
                this.objects.push(clone);
            }
        }
        // Todo: Clone text elements also.
        this.geometryVersion = this.tile.geometryVersion;
    }

    /**
     * Checks if the [[TileProxy]] can be cloned.
     */
    canClone() {
        return this.geometryVersion !== this.tile.geometryVersion && this.tile.hasGeometry;
    }
}
