# @here/harp.gl

## Overview

This is convienience module that provides [`harp.gl`](http://harp.gl.s3-website-us-east-1.amazonaws.com/docs/master/doc/) as
JS-friendly bundle, with whole `harp.gl` API exposed in `harp` namespace.

Usage example with `unpkg.com` CDN:

```html
<script src="https://unpkg.com/three/build/three.min.js"></script>
<!-- harp.gl bundle requires specific threejs version to be already loaded in runtime -->
<script src="https://unpkg.com/@here/harp.gl/dist/harp.js"></script>
<!-- latest version of harp.gl bundle -->
<script>
    const canvas = document.getElementById("mapCanvas");

    const map = new harp.MapView({
        canvas,
        theme:
            "https://unpkg.com/@here/harp-map-theme@0.2.2/resources/berlin_tilezen_base.json"
    });
    ...
</script>
```

This snippets loads all required scripts and creates [MapView](http://harp.gl.s3-website-us-east-1.amazonaws.com/docs/master/doc/classes/harp_mapview.mapview.html)
with `theme` loaded from `unpkg.com` CDN.

# Architecture

`@here/harp.gl` provides following bundles:

-   [`harp.js`](https://unpkg.com/@here/harp.gl/dist/harp.js) and [`harp.min.js`](https://unpkg.com/@here/harp.gl/dist/harp.min.js) containing selected symbols from these
    bundles in `harp` namespace:
    -   Core `MapView` functionality - [`@here/harp-mapview`](http://harp.gl.s3-website-us-east-1.amazonaws.com/docs/master/doc/modules/harp_mapview.html)
    -   GeoUtils - [`@here/harp-geoutils`](http://harp.gl.s3-website-us-east-1.amazonaws.com/docs/master/doc/modules/harp_geoutils.html)
    -   Map Controls - [`@here/harp-controls`](http://harp.gl.s3-website-us-east-1.amazonaws.com/docs/master/doc/modules/harp_map_controls.html) (excluding [CameraAnimation] related functions)
    -   OMV/MVT Tile Provider [`@here/harp-vectortile-datasource`](http://harp.gl.s3-website-us-east-1.amazonaws.com/docs/master/doc/modules/harp_omv_datasource.html)
    -   Custom Features Provider [`@here/harp-features-datasource`](http://harp.gl.s3-website-us-east-1.amazonaws.com/docs/master/doc/classes/harp_features_datasource.featuresdatasource.html)
    -   Web Tile Provider [`@here/harp-webtile-datasource`](http://harp.gl.s3-website-us-east-1.amazonaws.com/docs/master/doc/modules/harp_webtile_datasource.html)
    -   GeoJSON Tile Provider [`@here/harp-geojson-datasource`](http://harp.gl.s3-website-us-east-1.amazonaws.com/docs/master/doc/modules/harp_geojson_datasource.html)
-   [`harp-decoders.js`](https://unpkg.com/@here/harp.gl/dist/harp-decoders.js)
    -   Web Worker script that contains code for services.
    -   Due to `same-origin` policy,
    -   This script depends on external `three.js` implementation, which usually is detected
        automatically (it re-uses same script URL that is used in main JS runtime).

# Technical notes

-   `harp.js` bundle depends on [Three.JS](https://threejs.org/) being already loaded in Javascript
    Runtime.
-   `harp.gl` uses Web Workers from `harp-decoders.js` to offload CPU intensive work from main thread
    (in particular for
    [OmvDataSource](http://harp.gl.s3-website-us-east-1.amazonaws.com/docs/master/doc/classes/_here_harp_omv_datasource.omvdatasource.html) and
    [GeoJsonDataProvider](http://harp.gl.s3-website-us-east-1.amazonaws.com/docs/master/doc/classes/_here_harp_geojson_datasource.geojsondataprovider.html).
    Web Workers.
-   For convienience `harp.gl` detects URL from which is loaded and by default detects location of
    `harp-decoders.js` which is distributed together. That may cause problems with `same-origin`
    policy that mandates that Web Workers can be loaded only from same origin that main page.
    To overcome this issue, we attempt to load `harp-decoders.js` by converting it to `Blob`. This
    requires, that CSP policy of your page allows loading workers from `blob:` URLs.

# Troubleshooting

-   `harp.js: Unable to determine location of three(.min).js`

    As noted above, `harp.gl` tries to find URL of `three.js` so URL can loaded in web-workers.
    If for some reason you don't have `three.js` script in your DOM, you can tell `harp.gl` where
    to find like this:

    ```javascript
    harp.WorkerLoader.dependencyUrlMapping.three = "https://unpkg.com/three/build/three.min.js";
    ```

-   `Refused to create a worker from 'blob:http://...' because it violates the following Content Security Policy ...`

    As noted above, if `harp.js` and `harp-decoders.js` is loaded from other domain (like CDN), we try
    to load script into `Blob` and then execute worker from blob-url. For this mechanism to work, your
    CSP policy for `worker-src` and/or `child-src` should allow `blob:` origin. `blob:` origin is
    enabled by default, but if for some reason it's not the case, you can re-enable it with
    following snippet:

    ```html
    <meta http-equiv="Content-Security-Policy" content="worker-src 'self' blob:" />
    ```

    If for some reason, you cannot change CSP policy of your app to allow `blob:` worker-source, you
    have to load `harp-decoders.js` (and possibly `harp.js`) from _same origin_ as your main page.

# More info

-   [Running example](http://harp.gl.s3-website-us-east-1.amazonaws.com/docs/master/examples/#getting-started_hello-world_js-bundle.html)
-   [Example source code](https://github.com/heremaps/harp.gl/blob/master/%40here/harp-examples/src/getting-started_hello-world_js-bundle.html)
-   [`harp.gl` Getting started guide](https://github.com/heremaps/harp.gl/blob/master/docs/GettingStartedGuide.md)
