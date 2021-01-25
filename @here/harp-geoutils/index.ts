/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Utility classes for working with geospatial data.
 *
 * @remarks
 *
 * @packageDocumentation
 */

export * from "./lib/coordinates/GeoBox";
export * from "./lib/coordinates/GeoBoxExtentLike";
export * from "./lib/coordinates/GeoCoordinatesLike";
export * from "./lib/coordinates/GeoCoordinates";
export * from "./lib/coordinates/GeoPointLike";
export * from "./lib/coordinates/GeoPolygonLike";
export * from "./lib/coordinates/GeoPolygon";
export * from "./lib/coordinates/LatLngLike";
export * from "./lib/projection/EarthConstants";
export * from "./lib/projection/EquirectangularProjection";
export * from "./lib/projection/IdentityProjection";
export * from "./lib/projection/Projection";
export * from "./lib/projection/MercatorProjection";
export * from "./lib/projection/TransverseMercatorProjection";
export * from "./lib/projection/SphereProjection";
export * from "./lib/tiling/FlatTileBoundingBoxGenerator";
export * from "./lib/tiling/HalfQuadTreeSubdivisionScheme";
export * from "./lib/tiling/QuadTreeSubdivisionScheme";
export * from "./lib/tiling/QuadTree";
export * from "./lib/tiling/SubTiles";
export * from "./lib/tiling/SubdivisionScheme";
export * from "./lib/tiling/TileKey";
export * from "./lib/tiling/TileKeyUtils";
export * from "./lib/tiling/TileTreeTraverse";
export * from "./lib/tiling/TilingScheme";
export * from "./lib/tiling/HereTilingScheme";
export * from "./lib/tiling/WebMercatorTilingScheme";
export * from "./lib/tiling/MercatorTilingScheme";
export * from "./lib/tiling/PolarTilingScheme";
export * from "./lib/math/Vector2Like";
export * from "./lib/math/Vector3Like";
export * from "./lib/math/Box3Like";
export * from "./lib/math/OrientedBox3Like";
export * from "./lib/math/MathUtils";
export * from "./lib/math/TransformLike";
export * from "./lib/math/OrientedBox3";
