import { TileKey } from "./TileKey";

export class SubTiles {
    private m_tileKey: TileKey;
    private m_level: number;
    private m_count: number;
    private m_mask: number;
    private m_shift: number;

    constructor(tileKey: TileKey, level: number, mask: number) {
        this.m_tileKey = tileKey;
        this.m_level = level;
        // tslint:disable:no-bitwise
        this.m_count = 1 << (level << 1);
        this.m_mask = mask;
        this.m_shift = level > 2 ? (level - 2) << 1 : 0;
        // tslint:enable:no-bitwise
    }

    get length(): number {
        return this.m_count;
    }
    get level(): number {
        return this.m_level;
    }
    get tileKey(): TileKey {
        return this.m_tileKey;
    }

    iterator() {
        return new SubTiles.Iterator(this);
    }

    skip(index: number): number {
        // tslint:disable:no-bitwise
        if (this.m_mask !== ~0) {
            while (index < this.m_count && (this.m_mask & (1 << (index >> this.m_shift))) === 0) {
                ++index;
            }
        }
        // tslint:enable:no-bitwise
        return index;
    }
}

export namespace SubTiles {
    export class Iterator {
        private m_parent: SubTiles;
        private m_index: number;

        constructor(parent: SubTiles, index: number = 0) {
            this.m_parent = parent;
            this.m_index = parent.skip(index);
        }

        get value() {
            const parentKey = this.m_parent.tileKey;
            const subLevel = this.m_parent.level;

            return TileKey.fromRowColumnLevel(
                // tslint:disable:no-bitwise
                (parentKey.row << subLevel) | (this.m_index >> subLevel),
                (parentKey.column << subLevel) | (this.m_index & ((1 << subLevel) - 1)),
                parentKey.level + subLevel
                // tslint:enableno-bitwise
            );
        }

        next() {
            this.m_index = this.m_parent.skip(++this.m_index);
        }
    }
}
