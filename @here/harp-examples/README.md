# @here/harp-examples

## Overview

This repository contains examples for `harp.gl`.

## Building and running

You can build and run the examples running the following commands from the root path of the project:

```shell
yarn install
yarn run build
yarn start
```

Open `http://localhost:8080` in a web browser to try the examples.

## Examples

We can group the examples by several categories, looking at what kind of features and capabilities they showcase.

### Getting Started

1. [The modular hello world example](src/getting-started_hello-world_npm.ts) that displays a map in an HTML element with our default map style and default data source, using NPM packages.
1. [The HTML hello world example](src/getting-started_hello-world_js-bundle.ts) similar to the former but showing how to use harp in an HTML page with inline JS scripts.
1. [Globe projection](src/getting-started_globe-projection.ts) shows the setup to use a globe projection.
1. [Camera with free movement](src/getting-started_free-camera.ts), that demonstrates how the camera works in `harp.gl`.
1. [Orbit camera](src/getting-started_orbiting-view.ts), showcases the `lookAt` method and how to use it to orbit around a point.
1. [Themes examples](src/getting-started_open-sourced-themes.ts) features the various themes open sourced with Harp.

### Data sources

1. [OMV Data](src/getting-started_hello-world_npm.ts) with our default map style.
1. [Raster map tiles](src/datasource_webtile.ts) using the [webtile-datasource](../harp-webtile-datasource/README.md).
1. [Satellite tiles](src/datasource_satellite-tile.ts) using the [webtile-datasource](../harp-webtile-datasource/README.md), along with a [globe version](src/datasource_satellite-tile_globe.ts).
1. [OSM MVT Data](src/datasource_xyzmvt.ts) with our default map style.
1. [Webtiles with the mercator projection](src/datasource_webtile.ts) and [with globe](datasource_webtile_globe.ts).
1. [User based map features (lines and points)](src/datasource_features_lines+points.ts) using the [featuresDataSource](../harp-features-datasource/README.md). Polygons are also demonstrated [here](src/datasource_features_polygons.ts)

### Rendering

1. [Playground for the post effects](src/effects_all.ts).
1. [Additional themes and post effects configuration files](src/effects_themes.ts), showcasing available setups for fancier renderings.

### Styling

1. [Style interpolations depending on the zoom level](src/styling_interpolations.ts).
1. [Textured areas](src/styling_textured-areas.ts).

### [three.js](https://threejs.org/)

1. [Add a ThreeJS object](src/threejs_add-object.ts) shows how to add a custom object to the map.
1. [Integrate a ThreeJS animation](src/threejs_animation.ts).
1. [Raycast into map scene](src/threejs_raycast.ts) that shows how to raycast into the scene and add points at the intersected locations.

### Others

1. [A GeoJSON viewer](src/geojson.ts) allows to view and edit GeoJSON with the FeaturesDataSource.
1. [Elevation provider](src/elevation-provider.ts) shows how to handle scene height given a user input.
1. Showcase of the [dynamic text rendering](src/textcanvas.ts) capabilities of our [text rendering library](../harp-text-canvas/README.md).
1. [Display three map views, side by side](src/triple-view.ts), in which we show the a map with three different styles at the same time, using OMV Data.
