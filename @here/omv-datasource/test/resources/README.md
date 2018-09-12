# Static tiles files

This folder `/test/resources` contains static files with map tiles data. They are used in
tests as a way to mock any type of external datasource data. In this particular case the data is
taken from OMV datasource.

## Getting Started

These instructions will show you how to get your own data as static binary files taken from external
map datasources.

### Prerequisites

Fetch tiles requires only running a single `npm` command with specific parameters set.

Here is a usage help:

```bash
Usage:
npm run fetch-tiles <locationIndicator> <targetDir>
npm run fetch-tiles <locationIndicator> <targetDir> -- [--min_zoom=<minZoomLevel>] [--max_zoom=<maxZoomLevel>] [--base_url=<ulr>] [--api_format=<formatName>]
        <locationIndicator>:
                                 371506849 (Monton code)
                                 53.43589,14.5414 (GeoCoordinates)
                                 53.43589,14.5414,16 (GeoCoordinates + ZoomLevel)
        --api_format:   : HereV1, MapboxV4, MapzenV1, TomtomV1
        --base_url:     : "https://vector.cit.data.here.com/1.0/base/mc"
```

### Script's parameters default values

```javascript
minZoomLevel = 13;
maxZoomLevel = 17;
baseUrl = "https://vector.cit.data.here.com/1.0/base/mc"
apiFormat = APIFormat.HereV1
```

### How to get my own data

A step by step series of examples that tell you have to get your own map tiles' files

* Simplest fetch of a tiles. Parent tile identified with its Morton code. And target directory added.
    ```bash
    npm run fetch-tiles 371506849 ./@omv-datasource/test/resources/tiles
    ```
    This invocation would download all tiles basing from parent tile up to child tiles with
    `maxZoomLevel`.

* Example with different API Format and changed base_url

    ```bash
    npm run fetch-tiles 371506849 ./@omv-datasource/test/resources/tiles -- --api_format=HereV1 --base_url="localhost:8080"

    ```

* Initial tile is identified using latitude, longitude and optionally zoom level

    ```bash
    npm run fetch-tiles 53.4298189,14.4845422,11 ./test
    ```

### Note about _locationIndicator_ parameter overloading

    when using the format of latitude,longitude,zoomLevel, e.g.
    ```bash
    npm run fetch-tiles 53.4298189,14.4845422,11 ./test
    ```

    The provided zoomlevel would overwrite the default max_zoomLevel value.
    When such behaviour is not the requested case one needs to specifiy requested zoom level with
    `--max_zoom=` parameter.

## How the stored tiles are named

Each downloaded tile is stored in a separate file named with its Morton code (with `.bin` extension
added), e.g. `371506849.bin`
