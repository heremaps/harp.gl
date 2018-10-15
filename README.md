# harp.gl

`harp.gl` is an open-source 3D map rendering engine.

You can use this engine to:

  * Develop visually appealing 3D maps
  * Create highly animated and dynamic map visualization with WebGL, using the popular [THREE.js](https://threejs.org/) library.
  * Create themeable maps, with themes that can change on the fly.
  * Create a smooth map experience with highly performant map rendering and decoding. Web workers parallelize the CPU intensive tasks, for optimal responsiveness.
  * Design your maps modularly, where you can swap out modules and data providers as required.

## Installation

### In Node.js

All `harp.gl` modules are installable via npm (or yarn):

```sh
npm install @here/map
```

### In Browser

Since `harp.gl` consists of a set of modules, there are no ready-made bundles available. Take a look at the examples on information on how to use tools like `webpack` to create a bundle for the browser.

## About This Repository

This repository is a monorepo containing the core components of `harp.gl`,
organized in a `yarn workspace`.

All components can be used stand-alone and are in the [@here](@here) subdirectory.

## Development

### Prerequisites

* __Node.js__ - Please see [nodejs.org](https://nodejs.org/) for installation instructions
* __Yarn__ -  Please see [yarnpkg.com](https://yarnpkg.com/en/) for installation instructions.

### Download dependencies

Run:

```sh
yarn
```

to download and install all required packages and set up the yarn workspace.

### Launch development server

Run:

```
yarn start
```

To launch `webpack-dev-server`. Open `http://localhost:8080/` in your favorite browser.
