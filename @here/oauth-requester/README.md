# Introduction

This repository contains all required methods and classes to request access token for OAuth authentication. For more information, including defferent use-cases, consult `oauth-requester page`.

## UserAuth

## Description

UserAuth class instance is used to obtain client token by providing authentication data.

## Configuration

Creating an instance of UserAuth class requires configuration object to be passed to the constructor:

```js
const auth = new UserAuth(config);
```

A list of configuration properties:

```js
mode {UserAuthMode}
```

Possible values:
[[UserAuthMode.FROM_FILE]] - Access key id and secret will be taken from local config.json file.

[[UserAuthMode.LOGIN_FORM]] - In this case access key id and secret must be set via [[UserAuth.setCredentials]] method before [[UserAuth.getToken]] call.

```js
type {UserAuthType}
```

Currently only one authentication type is supported - [[UserAuthType.CLIENT_CREDENTIALS]]. This means client token can be obtained by providing access key id and access key secret.

```js
stagingApi {boolean}
```

Optional parameter. If set to true - all authentication requests will be sent to the staging API.

## Usage with local authorization

Pre-conditions: config.json file must exist in verity application root folder. Example of config.json contents:

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

Create an instance of [[UserAuth]] class before instantiating any data sources:

```js
const auth = new UserAuth({
    mode: UserAuthMode.FROM_FILE,
    type: UserAuthType.CLIENT_CREDENTIALS
});
```

Define 'getBearerToken' property for the data source as on the example below (sdii-datasource is shown as example):

```js
const sdiiDataSource = new SdiiDataSource({
    dataStore: {
        hrn: HRN.fromString("catalog-hrn-string"),
        layer: "catalog-layer",
        getBearerToken: auth.getToken
    }
});
```

## Usage with authorization form

UserAuth can be used with an external component, for example UI form where user can enter access key properties. In this case [[UserAuth.getToken]] method cannot be used as getBearerToken property for the data source configuration, so data sources must be created after the token is obtained. Also, to make sure obtained token can be used with your data source, custom check should be implemented.

1. Create UserAuth instance:

```js
const auth = new UserAuth({
    mode: UserAuthMode.LOGIN_FORM,
    type: UserAuthType.CLIENT_CREDENTIALS
});
```

2. Request token in form submit handler:

```js
form.submitHandler = (formData) => {
    auth.setCredentials({formData.accessKeyId, formData.accessKeySecret});
    auth.getToken().then(token => (
        const dataSource = new SdiiDataSource({
            dataStore: {
                hrn,
                layer,
                getBearerToken: () => Promise.resolve(token)
            }
        });
    )).catch(() => {
        // log or show error, reset authorization form, etc.
    });
}
```

3. Optional: make sure catalog and layer are accessible with obtained token before adding data source to the map view:

```js
auth.getToken().then(token => {
    const dataSource = new SdiiDataSource({
        dataStore: {
            hrn,
            layer,
            getBearerToken: () => Promise.resolve(token)
        }
    });

    dataSource
        .connect()
        .then(() => {
            mapView.addDataSource(dataSource);
        })
        .catch(() => {
            // log or show error, reset authorization form, etc.
        });
});
```
