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

/**
 * Helper class that builds URLs from a baseUrl and given query parameters
 */
export class UrlBuilder {
    /**
     * Static method that creates an URL query string from a key,value paris provided as param
     *
     * @param param either a string or a number to be converted.
     */
    static stringifyQuery(values: {
        [key: string]: string | number | string[] | undefined;
    }): string {
        let result = "";
        for (const key in values) {
            if (values.hasOwnProperty(key)) {
                const value = values[key];
                if (value !== undefined) {
                    result = UrlBuilder.appendQueryString(result, "", key, value);
                }
            }
        }
        return result;
    }

    /**
     * Static method that converts the parameter to a string
     *
     * @param param either a string or a number to be converted.
     */
    static toString(param: string | number): string {
        return typeof param === "string" ? param : param.toString();
    }

    private static appendQueryString(
        url: string,
        separator: string,
        key: string,
        value: string | number | string[]
    ): string {
        url += separator;
        url += encodeURIComponent(key) + "=";
        if (typeof value === "number") {
            url += value.toString();
        } else if (typeof value === "string") {
            url += encodeURIComponent(value);
        } else {
            url += value.map(val => encodeURIComponent(val)).join(",");
        }
        return url;
    }

    /**
     * Default constructor.
     *
     * @param url The base URL.
     * @param hasQuery Whether the base URL already contains query parameters.
     */
    constructor(public url: string, public hasQuery: boolean = false) {}

    /**
     * Appends a query parameter to the URL, either using '&key=value' or '?key=value'
     * depending on the [[hasQuery]] parameter.
     *
     * Escapes all strings using `encodeURIComponent`.
     *
     * String arrays are concatenated using commas.
     *
     * @param key The key of the query parameter.
     * @param value The value of the query parameter.
     */
    appendQuery(key: string, value?: string | number | string[]) {
        if (value === undefined) {
            return;
        }
        this.url = UrlBuilder.appendQueryString(this.url, this.hasQuery ? "&" : "?", key, value);
        this.hasQuery = true;
    }
}

export interface RequestOptions {
    method?: string;
    body?: string;
    headers?: { [header: string]: string };
}

/**
 * Abstract class used for building requests to a REST API.
 */
export abstract class RequestBuilder {
    /**
     * Constructs a new RequestBuilder.
     *
     * @param baseUrl The base URL of the service.
     */
    constructor(readonly baseUrl: string) {}

    /**
     * Helper method to download the resource.
     *
     * @param urlObj the URL to fetch.
     */
    request<T>(urlObj: UrlBuilder, init?: RequestOptions): Promise<T> {
        return this.download<T>(urlObj.url, init);
    }

    /**
     * Implement this function to download the given url as JSON object.
     *
     * @param url The URL to download.
     */
    abstract download<T>(url: string, init?: RequestOptions): Promise<T>;
}
