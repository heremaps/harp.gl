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

1. [The hello world example](src/hello.ts) that displays a map in an HTML element with our default map style and default data source.

### Camera

1. [Camera with free movement](src/camera_free.ts), that demonstrates how the camera works in `harp.gl`.

### Text Rendering

1. Showcase of the [dynamic text rendering](src/textcanvas_dynamic.ts) capabilities of our [text rendering library](../harp-text-canvas/README.md).

### Data sources

1. [Display an interactive map of Italy](src/datasource_geojson_styling_game.ts) on a reduced map style that showcases picking and using GeoJSON Data that relies on [geojson-datasource](../harp-geojson-datasource/README.md).
1. [Show OMV Data](src/hello.ts) with our default map style.
1. [Render raster map tiles](src/datasource_webtile.ts) using the [webtile-datasource](../harp-webtile-datasource/README.md).

### Styling

1. [Display three map views, side by side](src/multiview_triple-view.ts), in which we show the a map with three different styles at the same time, using OMV Data.
