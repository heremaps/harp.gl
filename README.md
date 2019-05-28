# harp.gl [![Build Status](https://travis-ci.com/heremaps/harp.gl.svg?branch=master)](https://travis-ci.com/heremaps/harp.gl)

`harp.gl` is an _experimental and work in progress_ open-source 3D map rendering engine.

### [harp.gl site](https://heremaps.github.io/harp.gl/)

## Overview

You can use this engine to:

-   Develop visually appealing 3D maps
-   Create highly animated and dynamic map visualization with WebGL, using the popular [three.js](https://threejs.org/) library.
-   Create themeable maps, with themes that can change on the fly.
-   Create a smooth map experience with highly performant map rendering and decoding. Web workers parallelize the CPU intensive tasks, for optimal responsiveness.
-   Design your maps modularly, where you can swap out modules and data providers as required.

With that in mind, we have included some modules that let's you get started with some simple web applications
that can display a map using our default style. You can get results like the one shown below:

![New York City rendered with our default style](docs/nyc.jpg)

## Getting started with harp.gl

You can consume the harp.gl api with two different methods:

* linking a simple bundle as a `<script>` tag in your html
* installing a set of node modules from npm

If you want to learn more about the applications you can create, please check the [Getting Started Guide](docs/GettingStartedGuide.md).

### Simple bundle

Add `three.js` and `harp.gl` to your html and create a canvas with an id `map`:
```html
<html>
   <head>
      <style>
         body, html { border: 0; margin: 0; padding: 0 }
         #map { height: 100vh; width: 100vw; }
      </style>
      <script src="https://unpkg.com/three/build/three.min.js"></script>
      <script src="https://unpkg.com/@here/harp.gl/dist/harp.js"></script>
   </head>
   <body>
      <canvas id="map"></canvas>
      <script src="index.js"></script>
   </body>
</html>
```
Initialize the map:
```javascript
const map = new harp.MapView({
   canvas: document.getElementById('map'),
   theme: "https://unpkg.com/@here/harp-map-theme@latest/resources/berlin_tilezen_night_reduced.json",
});
const mapControls = new harp.MapControls(map);
const omvDataSource = new harp.OmvDataSource({
   baseUrl: "https://xyz.api.here.com/tiles/herebase.02",
   apiFormat: harp.APIFormat.XYZOMV,
   styleSetName: "tilezen",
   authenticationCode: 'YOUR-XYZ-TOKEN',
});
map.addDataSource(omvDataSource);
```

### Node modules

Generate a simple app using the package generator:

```shell
mkdir 3dmap-example
cd 3dmap-example
npx -p yo -p @here/generator-harp.gl yo @here/harp.gl
```

## About This Repository

This repository is a monorepo containing the core components of `harp.gl`,
organized in a `yarn workspace`.

All components can be used stand-alone and are in the `@here` subdirectory.

## Installation

### In Node.js

All `harp.gl` modules are installable via yarn (or npm):

```sh
yarn add @here/harp-mapview
```

```sh
npm install @here/harp-mapview
```

### In Browser

Since `harp.gl` consists of a set of modules, there are no ready-made bundles available. Take a look at the examples on information on how to use tools like `webpack` to create a bundle for the browser.

## Development

### Prerequisites

-   **Node.js** - Please see [nodejs.org](https://nodejs.org/) for installation instructions
-   **Yarn** - Please see [yarnpkg.com](https://yarnpkg.com/en/) for installation instructions.

### Download dependencies

Run:

```sh
yarn install
```

to download and install all required packages and set up the yarn workspace.

### Launch development server for harp.gl examples

Run:

```sh
yarn start
```

To launch `webpack-dev-server`. Open `http://localhost:8080/` in your favorite browser.

### Launch development server for unit tests

Run:

```sh
yarn start-tests
```

Open `http://localhost:8080/` in your favorite browser to run the tests.

### Run unit tests in Node.js environment

Run:

```sh
yarn test
```

### Run unit & integration tests in Browser environment

Run:

```sh
yarn run start-tests
>: Project is running at http://localhost:8080/
```

Note the URL and invoke tests using `mocha-webdriver-runner`. Example:

```sh
npx mocha-webdriver-runner http://localhost:8081/ --chrome
npx mocha-webdriver-runner http://localhost:8081/ --headless-firefox
```

### Generate documentation

Run:

```sh
yarn run typedoc
```

It will output all documentation under `/dist/doc`.

## License

Copyright (C) 2018-2019 HERE Europe B.V.

See the [LICENSE](./LICENSE) file in the root of this project for license details about using `harp.gl`.

In addition, please note that the [fonts](https://github.com/heremaps/harp-fontcatalog) are under a different set of licenses.

For other use cases not listed in the license terms, please [contact us](https://developer.here.com/contact-us).
