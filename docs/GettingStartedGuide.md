# Getting Started Guide

# Hello World!

To begin with, we suggest taking a look at our most basic example, the equivalent of a `hello_world` in
the [examples package](../@here/harp-examples/README.md)

# HERE Credentials

In order to use some of the HERE Services, such as XYZ or Map Tile API, you would need to register and generate credentials.

First, you need to become a [HERE Developer](https://www.here.xyz/getting-started/).

Afterwards, depending on which service do you want, you might need different credentials.

For Map Tile API, which is needed for the webtile examples, you need to generate a pair of `app_id` and `app_code`, that you can do directly from your Developer Dashboard, see a step-by-step guide [here](https://www.here.xyz/getting-started/).

For XYZ Vector Tiles, you need an `access_token` that you can generate yourself from the [Token Manager](https://xyz.api.here.com/token-ui/).

These credentials need to be passed to the Service in order to retrieve tiles, please see the examples to check how it is done.
