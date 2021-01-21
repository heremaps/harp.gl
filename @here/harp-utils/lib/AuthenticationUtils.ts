/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Authentification token/code provider.
 */
export type AuthenticationProvider = () => Promise<string>;

/**
 * Options for authentication with [[apikey]].
 */
export interface ApiKeyAuthentication {
    /**
     * The `apikey` for the access of the Web Tile Data.
     * @note Will not be used if [[authenticationCode]] is defined as well.
     */
    apikey: string;
}

/**
 * Options for authentication with [[appId]] and [[appCode]].
 */
export interface AppIdAuthentication {
    /**
     * The `appId` for the access of the Web Tile Data.
     * @note Will not be used if [[apiKey]] or [[authenticationCode]] is defined as well.
     */
    appId: string;

    /**
     * The `appCode` for the access of the Web Tile Data.
     * @note Will not be used if [[apiKey]] or [[authenticationCode]] is defined as well.
     */
    appCode: string;
}

/**
 * Options for authentication with [[authenticationCode]].
 */
export interface TokenAuthentication {
    /**
     * Authentication code used for the different APIs.
     *
     * When [[AuthenticationProvider]] is is used as value, the provider is called before each
     * to get currently valid authentication code/token.
     */
    authenticationCode: string | AuthenticationProvider;
}
