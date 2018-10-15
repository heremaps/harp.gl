import { equirectangularProjection } from "../projection/EquirectangularProjection";
import { halfQuadTreeSubdivisionScheme } from "./HalfQuadTreeSubdivisionScheme";
import { TilingScheme } from "./TilingScheme";

/**
 * [[TilingScheme]] used by most of the data published by HERE.
 *
 * The `hereTilingScheme` features a half quadtree subdivision scheme and an equirectangular
 * projection.
 */
export const hereTilingScheme = new TilingScheme(
    halfQuadTreeSubdivisionScheme,
    equirectangularProjection
);
