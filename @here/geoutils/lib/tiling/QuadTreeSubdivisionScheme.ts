import { SubdivisionScheme } from "./SubdivisionScheme";

class QuadTreeSubdivisionScheme implements SubdivisionScheme {
    getSubdivisionX(): number {
        return 2;
    }
    getSubdivisionY(): number {
        return 2;
    }
    getLevelDimensionX(level: number): number {
        // tslint:disable-next-line:no-bitwise
        return 1 << level;
    }
    getLevelDimensionY(level: number): number {
        // tslint:disable-next-line:no-bitwise
        return 1 << level;
    }
}

/**
 * [[SubdivisionScheme]] representing a quadtree.
 */
export const quadTreeSubdivisionScheme: SubdivisionScheme = new QuadTreeSubdivisionScheme();
