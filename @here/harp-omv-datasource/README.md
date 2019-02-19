# @here/harp-omv-datasource

## Overview

This module provides the implementation of [HERE](https://www.here.com)'s
Optimized Map for Visualization (OMV) Datasource.

This format follows the [Vector Tile Specification](https://github.com/mapbox/vector-tile-spec/).
This JSON format contains geometries, such as points and lines that define polygons, labels,
such as road names or city names, and other kinds of data that are typically passed to a renderer to draw a map.

Each tile is encoded using [Protobuf](https://github.com/google/protobuf).

The HERE Vector Tile Service allows you to request tiles containing vector data
using content from the [HERE Open Location Platform](https://openlocation.here.com/).

HERE provides global coverage and updates the data continuously.
For more information about our map content, see the [HERE Map Content Guidelines](https://repo.platform.here.com/artifactory/open-location-platform-docs/Data_Specifications/HERE_Map_Content/).
