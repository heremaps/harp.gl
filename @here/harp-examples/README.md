# @here/harp-examples

## Overview

This repository contains examples for `harp.gl`.
You can find all of these examples live on [the harp.gl site](https://www.harp.gl/). Just navigate to it and click on `examples`.

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

1. [The modular hello world example](https://www.harp.gl/docs/master/examples/#getting-started_hello-world_npm.html) that displays a map in an HTML element with our default map style and default data source, using NPM packages.
1. [The HTML hello world example](https://www.harp.gl/docs/master/examples/#getting-started_hello-world_js-bundle.html) similar to the former but showing how to use harp in an HTML page with inline JS scripts.
1. [Globe projection](https://www.harp.gl/docs/master/examples/#getting-started_globe-projection.html) shows the setup to use a globe projection.
1. [Camera with free movement](https://www.harp.gl/docs/master/examples/#getting-started_free-camera.html), that demonstrates how the camera works in `harp.gl`.
1. [Orbit camera](https://www.harp.gl/docs/master/examples/#getting-started_orbiting-view.html), showcases the `lookAt` method and how to use it to orbit around a point.
1. [Themes examples](https://www.harp.gl/docs/master/examples/#getting-started_open-sourced-themes.html) features the various themes open sourced with Harp.

### Data sources

1. [Vector Data](https://www.harp.gl/docs/master/examples/#getting-started_hello-world_npm.html) with our default map style.
1. [Webtiles with the mercator projection](https://www.harp.gl/docs/master/examples/#datasource_webtile.html) and [with globe](https://www.harp.gl/docs/master/examples/#datasource_webtile_globe.html).
1. [Satellite tiles](https://www.harp.gl/docs/master/examples/#datasource_satellite-tile.html) using the [webtile-datasource](https://github.com/heremaps/harp.gl/blob/master/%40here/harp-webtile-datasource/README.md), along with a [globe version](https://www.harp.gl/docs/master/examples/#datasource_satellite-tile_globe.html).
1. [OSM MVT Data](https://www.harp.gl/docs/master/examples/#datasource_xyzmvt.html) with our default map style.
1. [User based map features (lines and points)](https://www.harp.gl/docs/master/examples/#datasource_features_lines-and-points.html) using the [featuresDataSource](https://github.com/heremaps/harp.gl/blob/master/%40here/harp-features-datasource/README.md). Polygons are also demonstrated [here](https://www.harp.gl/docs/master/examples/#datasource_features_polygons.html)
1. [Advanced custom data source](https://www.harp.gl/docs/master/examples/#datasource_custom.html) demonstrating the implementation of a custom data source that uses the harp.gl styling engine, offloads CPU intense work to web-workers and uses three.js to create objects.

### Rendering

1. [Playground for the post effects](https://www.harp.gl/docs/master/examples/#rendering_post-effects_all.html).
1. [Additional themes and post effects configuration files](https://www.harp.gl/docs/master/examples/#rendering_post-effects_themes.html), showcasing available setups for fancier renderings.

### Styling

1. [Style interpolations depending on the zoom level](https://www.harp.gl/docs/master/examples/#styling_interpolation.html).
1. [Textured areas](https://www.harp.gl/docs/master/examples/#styling_textured-areas.html).

### [three.js](https://threejs.org/)

1. [Add a ThreeJS object](https://www.harp.gl/docs/master/examples/#threejs_add-object.html) shows how to add a custom object to the map.
1. [Integrate a ThreeJS animation](https://www.harp.gl/docs/master/examples/#threejs_animation.html).
1. [Raycast into map scene](https://www.harp.gl/docs/master/examples/#threejs_raycast.html) that shows how to raycast into the scene and add points at the intersected locations.

### Others

1. [A GeoJSON viewer](https://www.harp.gl/docs/master/examples/#geojson-viewer.html) allows to view and edit `GeoJSON` with the `FeaturesDataSource`.
1. [Elevation provider](https://www.harp.gl/docs/master/examples/#elevation-provider.html) shows how to handle scene height given a user input.
1. Showcase of the [dynamic text rendering](https://www.harp.gl/docs/master/examples/#textcanvas.html) capabilities of our [text rendering library](https://github.com/heremaps/harp.gl/blob/master/%40here/harp-text-canvas/README.md).
1. [Display three map views, side by side](https://www.harp.gl/docs/master/examples/#synchronized-views.html), in which we show the a map with three different styles at the same time, using vector Data.
