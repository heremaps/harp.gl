# Harp.gl yeoman Generator

Yeoman generator for [harp.gl](https://github.com/heremaps/harp.gl) based projects.

## Pre-requirements

-   [node.js](https://nodejs.org/)
-   [yeoman](https://yeoman.io/) - Install globally with `npm install -g yo` or use without
    installation with `npx` like this `npx yo`.
-   By default, generated app retrieves map data from HERE Vector Tiles Service. You need an `apikey` that you can generate yourself. Please see our [Getting Started Guide](../../docs/GettingStartedGuide.md).

## Usage

```sh
mkdir 3dmap-example
cd 3dmap-example
npx -p yo -p @here/generator-harp.gl yo @here/harp.gl
> package name 3dmap-example name:
```

This command will generate complete, clean project based on Node.js, Webpack, Typescript.
Set you access token in `View.ts`:

```typescript
const dataSource = new VectorTileDataSource({
    baseUrl: "https://vector.hereapi.com/v2/vectortiles/base/mc",
    authenticationCode: "YOUR-APIKEY"
});
```

Then start it using `webpack-dev-server`:

```sh
npm start
(...)
> 3dmap-example@1.0.0 start /home/user/generator-test
> webpack-dev-server

Project is running at http://localhost:8080/
```

Open `http://localhost:8080/` in your browser to see the running application.

## Generator Development & Testing

Automatic tests.

```sh
yarn test
```

Manual tests:

```sh
mkdir ~/generator-harp.gl-test #  create folder for test app
cd ~/generator-harp.gl-test
```

Now you can check how your working copy of generator works, by running this after each change:

```sh
yo ~/src/harp.gl/@here/generator-harp.gl/generators/app/ # generate app
npm install && npm run start
```
