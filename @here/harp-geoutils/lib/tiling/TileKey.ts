/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/** @hidden */
const powerOfTwo = [
    0x1,
    0x2,
    0x4,
    0x8,
    0x10,
    0x20,
    0x40,
    0x80,
    0x100,
    0x200,
    0x400,
    0x800,
    0x1000,
    0x2000,
    0x4000,
    0x8000,
    0x10000,
    0x20000,
    0x40000,
    0x80000,
    0x100000,
    0x200000,
    0x400000,
    0x800000,
    0x1000000,
    0x2000000,
    0x4000000,
    0x8000000,
    0x10000000,
    0x20000000,
    0x40000000,
    0x80000000,
    0x100000000,
    0x200000000,
    0x400000000,
    0x800000000,
    0x1000000000,
    0x2000000000,
    0x4000000000,
    0x8000000000,
    0x10000000000,
    0x20000000000,
    0x40000000000,
    0x80000000000,
    0x100000000000,
    0x200000000000,
    0x400000000000,
    0x800000000000,
    0x1000000000000,
    0x2000000000000,
    0x4000000000000,
    0x8000000000000,
    0x10000000000000 // Math.pow(2, 52), highest bit that can be set correctly.
];

/**
 * The `TileKey` instances are used to address a tile in a quadtree.
 *
 * A tile key is defined by a row, a column, and a level. The tree has a root at level 0, with one
 * single tile. On every level, each tile is divided into four children (therefore the name
 * quadtree).
 *
 * Within each [[level]], any particular tile is addressed with [[row]] and [[column]]. The number
 * of rows and columns in each level is 2 to the power of the level. This means: On level 0, only
 * one tile exists, [[columnsAtLevel]]() and [[rowsAtLevel]]() are both 1. On level 1, 4 tiles
 * exist, in 2 rows and 2 columns. On level 2 we have 16 tiles, in 4 rows and 4 columns. And so on.
 *
 * A tile key is usually created using [[fromRowColumnLevel]]() method.
 *
 * `TileKey` instances are immutable, all members return new instances of `TileKey` and do not
 * modify the original object.
 *
 * Utility functions like [[parent]](), [[changedLevelBy]](), and [[changedLevelTo]]() allow for
 * easy vertical navigation of the tree. The number of available rows and columns in the tile's
 * level is given with [[rowCount]]() and [[columnCount]]().
 *
 * Tile keys can be created from and converted into various alternative formats:
 *
 *  - [[toQuadKey]]() / [[fromQuadKey]]() - string representation 4-based
 *  - [[toHereTile]]() / [[fromHereTile]]() - string representation 10-based
 *  - [[mortonCode]]() / [[fromMortonCode]]() - number representation
 *
 * Note - as JavaScript's number type can hold 53 bits in its mantissa, only levels up to 26 can be
 * represented in the number representation returned by [[mortonCode]]().
 */
export class TileKey {
    /**
     * Creates a tile key.
     *
     * @param row - The requested row. Must be less than 2 to the power of level.
     * @param column - The requested column. Must be less than 2 to the power of level.
     * @param level - The requested level.
     */
    static fromRowColumnLevel(row: number, column: number, level: number): TileKey {
        return new TileKey(row, column, level);
    }

    /**
     * Creates a tile key from a quad string.
     *
     * The quad string can be created with [[toQuadKey]].
     *
     * @param quadkey - The quadkey to convert.
     * @returns A new instance of `TileKey`.
     */
    static fromQuadKey(quadkey: string): TileKey {
        const level = quadkey.length;
        let row = 0;
        let column = 0;
        for (let i = 0; i < quadkey.length; ++i) {
            const mask = 1 << i;
            const d = parseInt(quadkey.charAt(level - i - 1), 10);
            if (d & 0x1) {
                column |= mask;
            }
            if (d & 0x2) {
                row |= mask;
            }
        }
        return TileKey.fromRowColumnLevel(row, column, level);
    }

    /**
     * Creates a tile key from a numeric Morton code representation.
     *
     * You can convert a tile key into a numeric Morton code with [[mortonCode]].
     *
     * @param quadKey64 - The Morton code to be converted.
     * @returns A new instance of {@link TileKey}.
     */
    static fromMortonCode(quadKey64: number): TileKey {
        let level = 0;
        let row = 0;
        let column = 0;
        let quadKey = quadKey64;
        while (quadKey > 1) {
            const mask: number = 1 << level;

            if (quadKey & 0x1) {
                column |= mask;
            }
            if (quadKey & 0x2) {
                row |= mask;
            }

            level++;
            quadKey = (quadKey - (quadKey & 0x3)) / 4;
        }
        const result = TileKey.fromRowColumnLevel(row, column, level);
        result.m_mortonCode = quadKey64;
        return result;
    }

    /**
     * Creates a tile key from a heretile code string.
     *
     * The string can be created with [[toHereTile]].
     *
     * @param quadkey64 - The string representation of the HERE tile key.
     * @returns A new instance of `TileKey`.
     */
    static fromHereTile(quadkey64: string): TileKey {
        const result = TileKey.fromMortonCode(parseInt(quadkey64, 10));
        result.m_hereTile = quadkey64;
        return result;
    }

    /**
     * Returns the number of available columns at a given level.
     *
     * This is 2 to the power of the level.
     *
     * @param level - The level for which to return the number of columns.
     * @returns The available columns at the given level.
     */
    static columnsAtLevel(level: number): number {
        return Math.pow(2, level);
    }

    /**
     * Returns the number of available rows at a given level.
     *
     * This is 2 to the power of the level.
     *
     * @param level - The level for which to return the number of rows.
     * @returns The available rows at the given level.
     */
    static rowsAtLevel(level: number): number {
        return Math.pow(2, level);
    }

    /**
     * Returns the closest matching `TileKey` in a cartesian coordinate system.
     *
     * @param level - The level for the tile key.
     * @param coordX - The X coordinate.
     * @param coordY - The Y coordinate.
     * @param totalWidth - The maximum X coordinate.
     * @param totalHeight - The maximum Y coordinate.
     * @returns A new tile key at the given level that includes the given coordinates.
     */
    static atCoords(
        level: number,
        coordX: number,
        coordY: number,
        totalWidth: number,
        totalHeight: number
    ): TileKey {
        return TileKey.fromRowColumnLevel(
            Math.floor(coordY / (totalHeight / TileKey.rowsAtLevel(level))),
            Math.floor(coordX / (totalWidth / TileKey.columnsAtLevel(level))),
            level
        );
    }

    /**
     * Computes the Morton code of the parent tile key of the given Morton code.
     *
     * Note: The parent key of the root key is the root key itself.
     *
     * @param mortonCode - A Morton code, for example, obtained from [[mortonCode]].
     * @returns The Morton code of the parent tile.
     */
    static parentMortonCode(mortonCode: number): number {
        return Math.floor(mortonCode / 4);
    }

    private m_mortonCode?: number;
    private m_hereTile?: string;

    /**
     * Constructs a new immutable instance of a `TileKey`.
     *
     * For the better readability, {@link TileKey.fromRowColumnLevel} should be preferred.
     *
     * Note - row and column must not be greater than the maximum rows/columns for the given level.
     *
     * @param row - Represents the row in the quadtree.
     * @param column - Represents the column in the quadtree.
     * @param level - Represents the level in the quadtree.
     */
    constructor(readonly row: number, readonly column: number, readonly level: number) {}

    /**
     * Returns a tile key representing the parent of the tile addressed by this tile key.
     *
     * Throws an exception is this tile is already the root.
     */
    parent(): TileKey {
        if (this.level === 0) {
            throw new Error("Cannot get the parent of the root tile key");
        }
        return TileKey.fromRowColumnLevel(this.row >>> 1, this.column >>> 1, this.level - 1);
    }

    /**
     * Returns a new tile key at a level that differs from this tile's level by delta.
     *
     * Equivalent to `changedLevelTo(level() + delta)`.
     *
     * Note - root key is returned if `delta` is smaller than the level of this tile key.
     *
     * @param delta - The numeric difference between the current level and the requested level.
     */
    changedLevelBy(delta: number): TileKey {
        const level = Math.max(0, this.level + delta);
        let row = this.row;
        let column = this.column;

        if (delta >= 0) {
            row <<= delta;
            column <<= delta;
        } else {
            row >>>= -delta;
            column >>>= -delta;
        }
        return TileKey.fromRowColumnLevel(row, column, level);
    }

    /**
     * Returns a new tile key at the requested level.
     *
     * If the requested level is smaller than the tile's level, then the key of an ancestor of this
     * tile is returned. If the requested level is larger than the tile's level, then the key of
     * first child or grandchild of this tile is returned, for example, the child with the lowest
     * row and column number. If the requested level equals this tile's level, then the tile key
     * itself is returned. If the requested level is negative, the root tile key is returned.
     *
     * @param level - The requested level.
     */
    changedLevelTo(level: number): TileKey {
        return this.changedLevelBy(level - this.level);
    }

    /**
     * Converts the tile key to a numeric code representation.
     *
     * You can create a tile key from a numeric Morton code with [[fromMortonCode]].
     *
     * Note - only levels <= 26 are supported.
     */
    mortonCode(): number {
        if (this.m_mortonCode === undefined) {
            let column = this.column;
            let row = this.row;

            let result = powerOfTwo[this.level << 1];
            for (let i = 0; i < this.level; ++i) {
                if (column & 0x1) {
                    result += powerOfTwo[2 * i];
                }
                if (row & 0x1) {
                    result += powerOfTwo[2 * i + 1];
                }
                column >>>= 1;
                row >>>= 1;
            }

            this.m_mortonCode = result;
        }
        return this.m_mortonCode;
    }

    /**
     * Converts the tile key into a string for using in REST API calls.
     *
     * The string is a quadkey Morton code representation as a string.
     *
     * You can convert back from a quadkey string with [[fromHereTile]].
     */
    toHereTile(): string {
        if (this.m_hereTile === undefined) {
            this.m_hereTile = this.mortonCode().toString();
        }
        return this.m_hereTile;
    }

    /**
     * Converts the tile key into a string for using in REST API calls.
     *
     * If the tile is the root tile, the quadkey is '-'. Otherwise the string is a number to the
     * base of 4, but without the leading 1, with the following properties:
     *  1. the number of digits equals the level.
     *  2. removing the last digit gives the parent tile's quadkey string, i.e. appending 0,1,2,3
     *     to a quadkey string gives the tiles's children.
     *
     * You can convert back from a quadkey string with [[fromQuadKey]].
     */
    toQuadKey(): string {
        let result: string = "";

        for (let i = this.level; i > 0; --i) {
            const mask = 1 << (i - 1);

            const col = (this.column & mask) !== 0;
            const row = (this.row & mask) !== 0;

            if (col && row) {
                result += "3";
            } else if (row) {
                result += "2";
            } else if (col) {
                result += "1";
            } else {
                result += "0";
            }
        }

        return result;
    }

    /**
     * Equality operator.
     *
     * @param qnr - The tile key to compare to.
     * @returns `true` if this tile key has identical row, column and level, `false` otherwise.
     */
    equals(qnr: TileKey): boolean {
        return this.row === qnr.row && this.column === qnr.column && this.level === qnr.level;
    }

    /**
     * Returns the absolute quadkey that is constructed from its sub quadkey.
     *
     * @param sub - The sub key.
     * @returns The absolute tile key in the quadtree.
     */
    addedSubKey(sub: string): TileKey {
        const subQuad = TileKey.fromQuadKey(sub.length === 0 ? "-" : sub);
        const child = this.changedLevelBy(subQuad.level);
        return TileKey.fromRowColumnLevel(
            child.row + subQuad.row,
            child.column + subQuad.column,
            child.level
        );
    }

    /**
     * Returns the absolute quadkey that is constructed from its sub HERE tile key.
     *
     * @param sub - The sub HERE key.
     * @returns The absolute tile key in the quadtree.
     */
    addedSubHereTile(sub: string): TileKey {
        const subQuad = TileKey.fromHereTile(sub);
        const child = this.changedLevelBy(subQuad.level);
        return TileKey.fromRowColumnLevel(
            child.row + subQuad.row,
            child.column + subQuad.column,
            child.level
        );
    }

    /**
     * Returns a sub quadkey that is relative to its parent.
     *
     * This function can be used to generate sub keys that are relative to a parent that is delta
     * levels up in the quadtree.
     *
     * This function can be used to create shortened keys for quads on lower levels if the parent is
     * known.
     *
     * Note - the sub quadkeys fit in a 16-bit unsigned integer if the `delta` is smaller than 8. If
     * `delta` is smaller than 16, the sub quadkey fits into an unsigned 32-bit integer.
     *
     * Deltas larger than 16 are not supported.
     *
     * @param delta - The number of levels relative to its parent quadkey. Must be greater or equal
     * to 0 and smaller than 16.
     * @returns The quadkey relative to its parent that is `delta` levels up the tree.
     */
    getSubHereTile(delta: number): string {
        const key = this.mortonCode();
        const msb = 1 << (delta * 2);
        const mask = msb - 1;
        const result = (key & mask) | msb;
        return result.toString();
    }

    /**
     * Returns the number of available rows in the tile's [[level]].
     *
     * This is 2 to the power of the level.
     */
    rowCount(): number {
        return TileKey.rowsAtLevel(this.level);
    }

    /**
     * Returns the number of available columns in the tile's [[level]].
     *
     * This is 2 to the power of the level.
     */
    columnCount(): number {
        return TileKey.columnsAtLevel(this.level);
    }
}
