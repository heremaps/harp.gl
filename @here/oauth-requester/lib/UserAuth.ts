/*
 * Copyright (C) 2017-2018 HERE Global B.V. and its affiliate(s).
 * All rights reserved.
 *
 * This software and other materials contain proprietary information
 * controlled by HERE and are protected by applicable copyright legislation.
 * Any use and utilization of this software and other materials and
 * disclosure to any third parties is conditional upon having a separate
 * agreement with HERE for the access, use, utilization or disclosure of this
 * software. In the absence of such agreement, the use of the software is not
 * allowed.
 */

import { DownloadManager } from "@here/download-manager";
import { fetch, Headers } from "@here/fetch";
import { requestToken } from "./requestToken";

interface AuthCredentials {
    accessKeyId: string;
    accessKeySecret: string;
}

export enum UserAuthMode {
    FROM_FILE = "fromFile",
    LOGIN_FORM = "loginForm"
}

export enum UserAuthType {
    CLIENT_CREDENTIALS = "clientCreadentials"
}

export interface UserAuthConfig {
    mode: UserAuthMode;
    type: UserAuthType;
    stagingApi?: boolean;
}

export interface UserAuthUserInfo {
    userId: string;
    realm: string;
    firstname: string;
    lastname: string;
    email: string;
    dob: string;
    language: string;
    countryCode: string;
    emailVerified: boolean;
    marketingEnabled: boolean;
    createdTime: number;
    updatedTime: number;
    state: string;
}

/**
 * `UserAuth` class instance is used to work with accounts API: obtain an access token, user info,
 * etc.
 */
export class UserAuth {
    private m_accessToken: string | null = null;
    private m_expirationDate?: Date;
    private m_credentials: AuthCredentials | undefined;

    private readonly m_apiUrl = "https://account.api.here.com/";
    private readonly m_stgApiUrl = "https://stg.account.api.here.com/";

    constructor(readonly config: UserAuthConfig) {}

    /**
     * Returns access token.
     */
    async getToken(): Promise<string | null> {
        if (this.tokenIsValid()) {
            return this.m_accessToken;
        }

        const credentials = await this.getCredentials();

        const response = await requestToken({
            url: (this.config.stagingApi ? this.m_stgApiUrl : this.m_apiUrl) + "oauth2/token",
            consumerKey: credentials.accessKeyId,
            secretKey: credentials.accessKeySecret
        });

        if (response.accessToken) {
            this.m_accessToken = response.accessToken;
        }

        this.m_expirationDate = new Date();
        if (response.expiresIn !== undefined) {
            this.m_expirationDate.setSeconds(
                this.m_expirationDate.getSeconds() + response.expiresIn
            );
        }

        return this.m_accessToken;
    }

    /**
     * Validates the access token.
     * @param token string containing the token
     */
    async validateAccessToken(token: string): Promise<string | boolean> {
        const body = {
            token
        };

        const headers = new Headers({
            Authorization: "Bearer " + token,
            "Content-Type": "application/json"
        });

        const request = await fetch(
            (this.config.stagingApi ? this.m_stgApiUrl : this.m_apiUrl) + "verify/accessToken",
            {
                method: "POST",
                body: JSON.stringify(body),
                headers
            }
        );

        if (!request.ok) {
            return request.statusText;
        }

        return true;
    }

    /**
     * Retrieve user's info
     * @param userToken string containing the user's token
     */
    async getUserInfo(userToken: string): Promise<UserAuthUserInfo> {
        const body = {
            userToken
        };

        const headers = new Headers({
            Authorization: "Bearer " + userToken,
            "Content-Type": "application/json"
        });

        const request = await fetch(
            (this.config.stagingApi ? this.m_stgApiUrl : this.m_apiUrl) + "user/me",
            {
                method: "GET",
                body: JSON.stringify(body),
                headers
            }
        );

        if (!request.ok) {
            throw new Error("Error fetching user info: " + request.statusText);
        }

        return request.json<UserAuthUserInfo>();
    }

    /**
     * Set credentials for the `client_credentials` authentication type.
     *
     * @param accessKeyId
     * @param accessKeySecret
     */
    setCredentials(accessKeyId: string, accessKeySecret: string): void {
        if (this.m_credentials === undefined) {
            this.m_credentials = {
                accessKeyId: "",
                accessKeySecret: ""
            };
        }

        this.m_credentials.accessKeyId = accessKeyId;
        this.m_credentials.accessKeySecret = accessKeySecret;
    }

    private async getCredentials(): Promise<AuthCredentials> {
        if (this.m_credentials !== undefined && this.credentialsAreValid()) {
            return this.m_credentials;
        }

        this.m_credentials = {
            accessKeyId: "",
            accessKeySecret: ""
        };

        switch (this.config.mode) {
            case UserAuthMode.FROM_FILE:
                await this.loadCredentialsFromFile();
                break;
            case UserAuthMode.LOGIN_FORM:
                // TODO: add some verification?
                break;
        }

        return this.m_credentials;
    }

    private credentialsAreValid(): boolean {
        return (
            this.m_credentials !== undefined &&
            !!this.m_credentials.accessKeyId &&
            !!this.m_credentials.accessKeySecret
        );
    }

    private async loadCredentialsFromFile(): Promise<void> {
        const downloadManager = new DownloadManager();
        const file = (await downloadManager.downloadJson("/config.json")) as any;

        this.m_credentials = {
            accessKeyId: file.access.key.id,
            accessKeySecret: file.access.key.secret
        };
    }

    private tokenIsValid(): boolean {
        if (!this.m_accessToken || !this.m_expirationDate) {
            return false;
        }

        if (new Date() >= this.m_expirationDate) {
            return false;
        }

        return true;
    }
}
