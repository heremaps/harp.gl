/** @module @here/mapview-decoder **//** */

import { TileKey } from "@here/geoutils";

export abstract class DataProvider {
    abstract async connect(): Promise<void>;
    abstract ready(): boolean;
    abstract async getTile(tileKey: TileKey): Promise<ArrayBuffer>;
}
