# Harp.gl application creator

Application creator for [harp.gl](https://github.com/heremaps/harp.gl) based projects.

## Pre-requirements

* [node.js](https://nodejs.org/)
* By default, generated app retrieves map data from free XYZ Vector Tiles service. You need an `access_token` that you can generate yourself after registration from the
[Token Manager](https://xyz.api.here.com/token-ui/).

## Usage

```sh
npm init @here/harpgl-app
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
