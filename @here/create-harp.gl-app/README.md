# Harp.gl application creator

Application creator for [harp.gl](https://github.com/heremaps/harp.gl) based projects.

## Pre-requirements

* [node.js](https://nodejs.org/)
* By default, generated app retrieves map data from HERE Vector Tiles Service. You need an `apikey` that you can generate yourself. Please see our [Getting Started Guide](../../docs/GettingStartedGuide.md).

## Usage

```sh
npm init @here/harp.gl-app
```
This command will generate a complete harp.gl project based on Node.js, Webpack, and Typescript.
You will be prompted to specify an example directory, package name, and access token.

To start:

```sh
cd harp.gl-example && npm start
```

Open `http://localhost:8080/` in your browser to see the running application.

## Generator Development & Testing

Testing locally:

```sh
yarn create-harpgl-app
```
or:
```sh
mkdir /tmp/clean && cd /tmp/clean
npm install /path/to/@here/create-harp.gl-app
npm init @here/harpgl-app
```
