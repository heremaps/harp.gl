# harp.gl Examples

## Building and running

This repository contains examples for `harp.gl`.

Usage:

```shell
yarn install
yarn run build
yarn start
```

Open `http://localhost:8080` in a web browser to try the examples.

## Authentication

Some of the examples need an authentication token to access the data.
The examples therefore expect a `config.json` in the application root folder, if available the build process will look for a file located at `~/.sentry/` on your filesystem to symlink it into the application when built.

The `config.json` file needs to be in the format specified in the `@here/oauth-requester' module:

```js
{
    "access": {
        "key": {
            "id": "replace-with-your-access-key-id",
            "secret": "replace-with-your-access-key-secret"
        }
    }
}
```
