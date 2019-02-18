# @here/harp-fetch

##Overview

This module adds a subset of the [fetch](https://harp-fetch.spec.whatwg.org/) API for [Node.js](https://nodejs.org/). This allows code written for the browser to also execute in `Node.js`.

The main goal of this module is to provide enough compatibility to allow running unit tests in `Node.js`. It is not 100% feature and behavior compatible with `fetch`.

The feature set is that of [node-fetch](https://www.npmjs.com/package/node-fetch) with the addition of a dummy `AbortController`.

## Usage

Import the module for its side-effects:

```JavaScript
import "@here/harp-fetch"
```

This adds `fetch` to the global `Node.js` namespace.

## Behavior in Browser Context

When this module is used in a browser context, it does nothing and adds no code.
