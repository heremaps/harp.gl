This getting started guide explains how to create an Angular application and add a map component that will use harp to render the map.
If you already have an existing Angular application you can skip the first step and directly go to (#add-harp)
The final application can be found [here](https://github.com/heremaps/harp.gl/tree/master/docs/angular-harp)

## Create Angular application

### Make sure Angular CLI tools are installed globaly

```bash
npm install -g @angular/cli
```

### Use `ng new` to initialize the app

```bash
ng new angular-harp
```

### Create `map` component

```bash
ng generate component map
```

Take the new map component int use by replacing everytinh in app.componnent.html with:

```html
<app-map></app-map>
```

## <a name="add-harp"></a> Add `harp` to your application

### Install necessary `harp` modules

```bash
npm install --save @here/harp-mapview @here/harp-omv-datasource @here/harp-map-theme @here/harp-map-controls

```

You have installed 4 key components needed to render basic map:

-   `@here/harp-mapview` - map renderer itself
-   `@here/harp-map-controls` - map interaction like panning and tilting
-   `@here/harp-omv-datasource` - tile provider based on OMV/MVT vector tile format
-   `@here/harp-map-theme` - default theme and font resources required to render map in OMV/tilezen
    scheme

### Install matching `three.js` version

Since Three.js is a peer dependency of harp.gl it has to be installed as well. To get the version
that you should install you can use npm view.

```shell
THREE=`npm view @here/harp-mapview peerDependencies.three`
npm install --save three@$THREE
```

### Import the harp mapview in the map component

```typescript
import { MapView } from "@here/harp-mapview";
```

Add the harp mapview to the map component

```typescript
mapView: MapView;
```

Replace the auto generated map component template with following html code

```html
<div>
    <canvas id="mapCanvas"> </canvas>
</div>
```

Initialize harp in the ngOnInit method

```typescript
  ngOnInit(): void {
    const canvas = document.getElementById('mapCanvas') as HTMLCanvasElement;
    this.mapView = new MapView({
      canvas,
      theme:
        'https://unpkg.com/@here/harp-map-theme/resources/berlin_tilezen_base.json',
    });
    this.mapView.resize(window.innerWidth, window.innerHeight);
    window.addEventListener('resize', () => {
      this.mapView.resize(window.innerWidth, window.innerHeight);
    });
  }
```

This will give you an empty map that will properly resize when the window is resized.

Of course we also want to display some map data. Therefore we have to add a data source just after the mapView initialization:

```typescript
const omvDataSource = new OmvDataSource({
    baseUrl: "https://vector.hereapi.com/v2/vectortiles/base/mc",
    authenticationCode: "Insert your API key here."
});

this.mapView.addDataSource(omvDataSource);
```

## Add custom webpack configuration

Since harp is utilizing web-workers for best performance an additional build target is needed.
Therefore we need to inject a custom webpack configuration into Angular

```bash
npm install --save-dev @angular-builders/custom-webpack
```

```bash
touch custom-webpack.config.js
```

```javascript
module.exports = {
    resolve: {
        extensions: [".webpack.js", ".web.ts", ".ts", ".tsx", ".web.js", ".js"]
    }
};
```

## Replace Angular's Webpack with custom config

Edit `build` and `serve` sections in your angular.json to replace the default builder with `@angular-builders/custom-webpack`

```diff
--- angular.json
+++ angular.json
@@ -14,8 +14,14 @@
       "prefix": "app",
       "architect": {
         "build": {
-          "builder": "@angular-devkit/build-angular:browser",
+          "builder": "@angular-builders/custom-webpack:browser",
           "options": {
+            "customWebpackConfig": {
+              "path": "./custom-webpack.config.js",
+              "mergeStrategies": {
+                "resolve.extensions": "replace"
+              }
+            },
             "outputPath": "dist/angular-tour-of-heroes",
             "index": "src/index.html",
             "main": "src/main.ts",
@@ -58,7 +64,7 @@
           }
         },
         "serve": {
-          "builder": "@angular-devkit/build-angular:dev-server",
+          "builder": "@angular-builders/custom-webpack:dev-server",
           "options": {
             "browserTarget": "angular-tour-of-heroes:build"
           },
```

## Generating decoder bundle

To be able to use the Harp's concurrency support to run non-DOM related code in a decoder bundle, the following steps are needed.

### Decoder WebPack bundle

Decoder bundle generation uses a decoder-specific webpack config added:

```bash
touch decoder-webpack.config.js
```

```javascript
const merge = require("webpack-merge");
const path = require("path");

const decoderConfig = {
    target: "webworker",
    entry: {
        decoder: "./src/app/map/decoder.ts" //this file is responsible for kickstarting the workers
    },

    context: __dirname,
    devtool: "source-map",

    resolve: {
        extensions: [".webpack.js", ".web.ts", ".ts", ".tsx", ".web.js", ".js"]
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                loader: "ts-loader",
                exclude: /node_modules/,
                options: {
                    configFile: path.join(process.cwd(), "tsconfig.json"),
                    onlyCompileBundledFiles: true,
                    transpileOnly: true,
                    compilerOptions: {
                        sourceMap: false,
                        declaration: false
                    }
                }
            }
        ]
    },
    output: {
        path: path.join(process.cwd(), "./"),
        filename: "[name].bundle.js"
    },
    performance: {
        hints: false
    },
    stats: {
        all: false,
        timings: true,
        exclude: "resources/",
        errors: true,
        entrypoints: true,
        warnings: true
    },
    mode: process.env.NODE_ENV || "development"
};

module.exports = decoderConfig;
```

### Implement decoder.ts

```bash
touch ./src/app/map/decoder.ts
```

```typescript
import { OmvTileDecoderService, OmvTilerService } from "@here/harp-omv-datasource/index-worker";

OmvTileDecoderService.start();
OmvTilerService.start(); // Only needed for untiled geojson
```

### Add build script to package.json

```javascript
"build:decoder": "./node_modules/.bin/webpack --config decoder-webpack.config.js",
```

```bash
npm install --save-dev webpack-cli ts-loader
```

Now we can finally build the `decoder.bundle.js`

```bash
npm run build:decoder
```

To make sure Angular can find the decoder bundle we have to add it to the assets

```diff
--- a/angular.json
+++ b/angular.json
@@ -28,7 +28,15 @@
             "polyfills": "src/polyfills.ts",
             "tsConfig": "tsconfig.app.json",
             "aot": true,
-            "assets": ["src/favicon.ico", "src/assets"],
+            "assets": [
+              "src/favicon.ico",
+              "src/assets",
+              {
+                "glob": "decoder.bundle.js",
+                "input": "./",
+                "output": "./"
+              }
+            ],
             "styles": ["src/styles.css"],
             "scripts": []
           },
```

Now we can finally use it in our map component:

```javascript
this.mapView = new MapView({
    canvas,
    theme: "https://unpkg.com/@here/harp-map-theme/resources/berlin_tilezen_base.json",
    decoderUrl: "./decoder.bundle.js"
});
```

```diff

--- a/src/app/map/map.component.ts
+++ b/src/app/map/map.component.ts
@@ -1,5 +1,6 @@
 import { Component, OnInit } from '@angular/core';
 import { MapView } from '@here/harp-mapview';
+import { OmvDataSource } from '@here/harp-omv-datasource';

 @Component({
   selector: 'app-map',
@@ -19,11 +20,17 @@ export class MapComponent implements OnInit {
         'https://unpkg.com/@here/harp-map-theme/resources/berlin_tilezen_base.json',
       decoderUrl: './decoder.bundle.js'
     });
+
+    const omvDataSource = new OmvDataSource({
+      baseUrl: 'https://vector.hereapi.com/v2/vectortiles/base/mc',
+      authenticationCode: 'J0IJdYzKDYS3nHVDDEWETIqK3nAcxqW42vz7xeSq61M',
+    });
+    this.mapView.addDataSource(omvDataSource);
   }

 }
```

## Adding resources

Until now the map theme (including resources like fonts and icons) was downloaded from unpkg.com
This is normally not what you want. Instead you want to host the resources together with your application.

### Install the map theme locally

The map theme is also a npm module so you can just install it.

```bash
npm install --save @here/harp-map-theme
```

### Add map theme to assets

To make sure Angular will copy the map theme to resources (or host it via webpack-dev-server) it needs to be added to `angular.json`.

```diff
--- a/angular.json
+++ b/angular.json
@@ -35,6 +35,11 @@
                 "glob": "decoder.bundle.js",
                 "input": "./",
                 "output": "./"
+              },
+              {
+                "glob": "**/*",
+                "input": "./node_modules/@here/harp-map-theme/resources",
+                "output": "./resources"
               }
             ],
             "styles": ["src/styles.css"],
```

Now we can replace the (unpkg.com) url with a local one

```diff
--- a/src/app/map/map.component.ts
+++ b/src/app/map/map.component.ts
@@ -17,7 +17,7 @@ export class MapComponent implements OnInit {
     this.mapView = new MapView({
       canvas,
       theme:
-        'https://unpkg.com/@here/harp-map-theme/resources/berlin_tilezen_base.json',
+        './resources/berlin_tilezen_base.json',
       decoderUrl: './decoder.bundle.js'
     });
```

### Adding map controls

Since a static map is quite boring you most likely also want to add some controls.

```bash
npm install --save @here/harp-map-controls
```

Extend the map component to make use of the controls

```diff
--- a/src/app/map/map.component.ts
+++ b/src/app/map/map.component.ts
@@ -1,5 +1,6 @@
 import { Component, OnInit } from '@angular/core';
 import { MapView } from '@here/harp-mapview';
+import { MapControls, MapControlsUI } from '@here/harp-map-controls';
 import { OmvDataSource } from '@here/harp-omv-datasource';

 const apikey = 'J0IJdYzKDYS3nHVDDEWETIqK3nAcxqW42vz7xeSq61M';
@@ -36,5 +37,10 @@ export class MapComponent implements OnInit {
     });
yarn add
     this.mapView.addDataSource(omvDataSource);
+
+    const mapControls = new MapControls(this.mapView);
+    const ui = new MapControlsUI(mapControls, { zoomLevel: 'input' });
+    canvas.parentElement?.appendChild(ui.domElement);
+
   }
 }
```
