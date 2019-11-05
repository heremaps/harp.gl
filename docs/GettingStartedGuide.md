# Getting Started Guide

To begin with `harp.gl`, we provide a few starting points:

-   [Import harp.gl with simple bundle](#simple)
-   [Create simple app](#yeoman) using Yeoman
-   [Integrate `harp.gl` into your existing Webpack based project](#integrate)
-   [Look at examples](#examples)
-   [Don't forget the credentials](#credentials)

## <a name="simple"></a> Import harp.gl with simple bundle

Add `three.js` and `harp.gl` to your html and create a canvas with an id `map`:

```html
<html>
    <head>
        <style>
            body,
            html {
                border: 0;
                margin: 0;
                padding: 0;
            }
            #map {
                height: 100vh;
                width: 100vw;
            }
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
    canvas: document.getElementById("map"),
    theme:
        "https://unpkg.com/@here/harp-map-theme@latest/resources/berlin_tilezen_night_reduced.json"
});
const controls = new harp.MapControls(map);

window.onresize = () => map.resize(window.innerWidth, window.innerHeight);

map.setCameraGeolocationAndZoom(
    new harp.GeoCoordinates(37.773972, -122.431297), //San Francisco
    13
);

const mapData = new harp.VectorTileDataSource({
    baseUrl: "https://xyz.api.here.com/tiles/herebase.02",
    apiFormat: harp.APIFormat.XYZOMV,
    styleSetName: "tilezen",
    authenticationCode: "YOUR-XYZ-TOKEN"
});
map.addDataSource(mapData);
```

You need to [obtain authentication code](#credentials) to replace 'YOUR-XYZ-TOKEN'.

For more information on the simple bundle, please visit the [@here/harp.gl module](../@here/harp.gl) directory.

For an in depth tutorial on getting started with harp.gl, please visit the [HERE Developer portal](https://developer.here.com/tutorials/harpgl/).

## <a name="yeoman"></a> Create Typescript app using Yeoman

You can create simple `harp.gl` app using Yeomans generator [`@here/generator-harp.gl`](https://github.com/heremaps/harp.gl/tree/master/%40here/generator-harp.gl):

```shell
mkdir 3dmap-example
cd 3dmap-example
npx -p yo -p @here/generator-harp.gl yo @here/harp.gl
```

## <a name="integrate"></a> Integrate `harp.gl` into your existing Webpack based project

### Introduction

`harp.gl` is distributed as `CommonJS` modules concatenated in `npm` packages. Modules in `CommonJS`
format require us to use some javascript code bundler - this example will facilitate `webpack`.

### Installation

Install them into your project:

```shell
npm install --save @here/harp-mapview @here/harp-vectortile-datasource @here/harp-map-theme
```

You have installed 3 key components needed to render basic map:

-   `@here/harp-mapview` - map renderer itself
-   `@here/harp-vectortile-datasource` - tile provider based on MVT/GeoJSON vector tile format
-   `@here/harp-map-theme` - default theme and font resources required to render map in OMV/tilezen
    scheme

Since Three.js is a peer dependency of harp.gl it has to be installed as well. To get the version
that you should install you can use npm view.

```shell
THREE=`npm view @here/harp-mapview peerDependencies.three`
npm install --save three@$THREE
```

### Decoder bundle

Our example will decode OMV/MVT tiles in Web Workers, so we can achieve high performance because creating geometry from vector tiles is CPU intensive. For this, we need to create separate bundle with code that will run in Web Workers dedicated to
decoding.

You need to add this config to your Webpack config:

```javascript
const appConfig = {
    // your app config
};
const harpGlDecodersConfig = {
    target: "webworker",
    entry: {
        decoder: "./harp-gl-decoders.js"
    },
    output: {
        filename: "harp-gl-decoders.bundle.js"
    },
    mode: process.env.NODE_ENV || "development"
};
return [appConfig, harpGlDecodersConfig];
```

The `./harp-gl-decoders.js` needs to initialize decoding service:

```javascript
import { VectorTileDecoderService } from "@here/harp-vectortile-datasource/index-worker";

VectorTileDecoderService.start();
```

### Create DOM container

`harp.gl` renders map on `HTML` `canvas` element. Add it to your HTML document:

```html
<!-- index.html -->
<canvas id="mapCanvas"></canvas>
<style>
    #mapCanvas {
        width: 500px;
        height: 300px;
        padding: 0;
        border: 0;
    }
</style>
```

### MapView

Then, you have to create [`MapView`](https://heremaps.github.io/harp.gl/doc/classes/_here_harp_mapview.mapview.html) that is will render map on `mapCanvas`:

```javascript
// index.js
import { MapView } from "@here/harp-mapview";

const mapCanvas = document.getElementById("mapCanvas");
const mapView = new MapView({
    canvas: mapCanvas,
    theme: "node_modules/@here/harp-map-theme/resources/berlin_tilezen_base.json",
    // note, this URL may vary depending on configuration of webpack
    // for this example, it is assumed that app is server from project root
    decoderUrl: "harp-gl-decoders.bundle.js"
    // note, this URL may vary depending on configuration of webpack
    // for this example, it is assumed that webpack emits bundles to project root
});
```

Next, you have to initialize default view settings like camera height over ground and location of
map center:

```javascript
// index.js
import { GeoCoordinates } from "@here/harp-geoutils";

// ...
mapView.camera.position.set(0, 0, 800);
mapView.geoCenter = new GeoCoordinates(40.70398928, -74.01319808, 0);
mapView.resize(mapCanvas.clientWidth, mapCanvas.clientHeight);
```

### Attach data source

Last step is adding some
[`VectorTileDataSource`](https://heremaps.github.io/harp.gl/doc/classes/_here_harp_vectortile_datasource.vectortiledatasource.html)
to our `MapView` instance:

```javascript
import {
    APIFormat,
    AuthenticationTypeMapboxV4,
    VectorTileDataSource
} from "@here/harp-vectortile-datasource";

const dataSource = new VectorTileDataSource({
    baseUrl: "https://xyz.api.here.com/tiles/herebase.02",
    apiFormat: APIFormat.XYZOMV,
    styleSetName: "tilezen",
    maxZoomLevel: 17,
    authenticationCode: "your access token for xyz service",
    authenticationMethod: AuthenticationTypeMapboxV4
});
mapView.addDataSource(dataSource);
```

Note, that this example uses vector tiles downloaded from HERE XYZ service and access to these
files is protected by access token. You should replace `your access token for xyz service` with real
one, see [HERE Credentials](#credentials) section below.

### Enable user interaction with map

What we've achieved so far is basic, static non-interactive. If you want to enable control of map
like panning, rotating use
[`MapControls`](https://heremaps.github.io/harp.gl/doc/classes/_here_harp_map_controls.mapcontrols.html)

Note, this requires additional module: `npm install --save @here/harp-map-controls`.

```javascript
import { MapControls } from "@here/harp-map-controls";
MapControls.create(mapView);
```

## <a name="examples"></a> Examine examples

To begin with, we suggest taking a look at our most basic example, the equivalent of a `hello_world` in
the [examples package](../@here/harp-examples/README.md)

## <a name="credentials"></a> HERE Credentials

In order to use some of the HERE Services, such as XYZ or Map Tile API, you would need to register
and generate credentials.

First, you need to become a [HERE Developer](https://www.here.xyz/getting-started/).

Afterwards, depending on which service do you want, you might need different credentials.

For Map Tile API, which is needed for the webtile examples, you need to generate a pair of `app_id`
and `app_code`, that you can do directly from your Developer Dashboard, see a step-by-step guide
[here](https://www.here.xyz/getting-started/).

For XYZ Vector Tiles, you need an `access_token` that you can generate yourself from the
[Token Manager](https://xyz.api.here.com/token-ui/). You can see a step-by-step guide [here](https://www.here.xyz/api/getting-token/).

These credentials need to be passed to the Service in order to retrieve tiles, please see the
examples to check how it is done.
