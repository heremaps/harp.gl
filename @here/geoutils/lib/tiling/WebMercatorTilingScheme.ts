import { webMercatorProjection } from "../projection/WebMercatorProjection";
import { quadTreeSubdivisionScheme } from "./QuadTreeSubdivisionScheme";
import { TilingScheme } from "./TilingScheme";

/**
 * A [[TilingScheme]] featuring quadtree subdivision scheme and web Mercator projection.
 */
export const webMercatorTilingScheme = new TilingScheme(
    quadTreeSubdivisionScheme,
    webMercatorProjection
);
