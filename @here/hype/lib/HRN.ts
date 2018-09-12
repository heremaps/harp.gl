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

/** @module
 *
 * This module provides classes for accessing catalogs on HERE Data Service. `DataStoreClient`
 * contains all functions connecting to Data Service. `DataStoreClient` is used to obtain instances
 * of `CatalogClient`, which encapsulates all methods to access data from a Data Service catalog.
 *
 */

/**
 * The `HRNData` interface contains all the fields that make up a HERE Resource Name (HRN).
 */
export interface HRNData {
    /**
     * The partition of the string, for example, `"here"` or `"here-dev"`.
     */
    partition: string;
    /**
     * The service, for example, `"datastore"`.
     */
    service: string;
    /**
     * The region of this HRN.
     */
    region?: string;
    /**
     * The account of this HRN.
     */
    account?: string;
    /**
     * The resource of this HRN, for example, the catalog name for `datastore` HRNs.
     */
    resource: string;
}

/***
 * Type definition for a resolver function that converts an HRN to a URL string.
 * If the resolver cannot handle this type of HRN, it must return `undefined`.
 *
 * @param data The HRN data this resolver must convert.
 * @returns The URL this HRN refers to, or `undefined` it this resolver cannot handle the HRN.
 */
export type Resolver = (data: HRNData) => string | undefined;

/**
 * The HRN class encapsulates a HERE Resource Name.
 */
export class HRN {
    /**
     * Registers a custom resolver for a given HRN. Every time [[resolve]] is called on an HRN, the
     * given resolver is called to resolve the HRN to a URL.
     *
     * @example
     * ```TypeScript
     * // resolve all datastore HRN whose partition is 'myorg-dev' to https://dev.myorg.com/xxx
     * HRN.addResolver(data => {
     *     if (data.service === "datastore" && data.partition === "myorg-dev")
     *         return `https://dev.myorg.com/${data.resource}`;
     *     return undefined;
     * });
     * ```
     * @param resolver The resolver that will be called if an HRN is resolved for the given
     * partition.
     */
    static addResolver(resolver: Resolver): void {
        HRN.resolvers.add(resolver);
    }

    /**
     * Removes an HRN resolver. Returns false if the resolver was not
     * added with addResolver().
     *
     * @param resolver The resolver to remove.
     * @returns `true` if the resolver was removed, `false` otherwise.
     */
    static removeResolver(resolver: Resolver): boolean {
        return this.resolvers.delete(resolver);
    }

    /**
     * Returns a new HRN from a string representation of an HRN, for example,
     * `hrn:here:datastore:::example-catalog`. As a special exception, HRNs that start with `http`
     * or `https` are also parsed and resolved.
     */
    static fromString(hrn: string): HRN {
        // special case - also allow http and https as 'catalog-url' local URLs
        if (hrn.startsWith("http:") || hrn.startsWith("https:")) {
            return new HRN({
                partition: "catalog-url",
                service: "datastore",
                region: "",
                account: "",
                resource: encodeURIComponent(hrn)
            });
        }

        const entries = hrn.split(":");
        if (entries.length < 6 || entries[0] !== "hrn") {
            throw new Error("Invalid HRN");
        }

        return new HRN({
            partition: entries[1],
            service: entries[2],
            region: entries[3],
            account: entries[4],
            resource: entries.slice(5).join(":")
        });
    }

    private static resolvers = new Set<Resolver>();
    // resolves an HRN using the built in defaults
    private static resolveBuiltin(data: HRNData): string | undefined {
        if (data.service === "datastore") {
            switch (data.partition) {
                case "here":
                    return "https://" + data.resource + ".catalogs.datastore.api.here.com";
                case "here-dev":
                    return "https://" + data.resource + ".catalogs.datastore.sit.api.here.com";
                case "catalog-url":
                    return decodeURIComponent(data.resource);
            }
        } else if (data.service === "schema") {
            if (data.partition === "catalog-url") {
                return decodeURIComponent(data.resource);
            }
            if (data.partition === "here" || data.partition === "here-dev") {
                const resourceParams = data.resource.split(":");
                if (resourceParams.length < 3) {
                    throw new Error("HRN resource must consist of three parameters");
                }
                const baseUrl =
                    data.partition === "here"
                        ? "https://repo.platform.here.com/artifactory/open-location-platform"
                        : "https://artifactory.in.here.com/artifactory/here-olp-sit";
                const groupId = resourceParams[0].replace(/\./g, "/");
                let suffix = "";
                switch (resourceParams[3]) {
                    case "proto":
                    case "java":
                        suffix = ".jar";
                        break;
                    case "ds":
                        suffix = ".zip";
                        break;
                }
                const artifactId =
                    resourceParams[1] +
                    (resourceParams[3] === undefined ? "" : "_" + resourceParams[3]);
                const version = resourceParams[2];
                // tslint:disable-next-line:max-line-length
                return `${baseUrl}/${groupId}/${artifactId}/${version}/${artifactId}-${version}${suffix}`;
            }
        }
        return undefined;
    }

    /**
     * Creates a new HRN based on the fields of the given HRNData.
     *
     * @example
     * ```TypeScript
     * const myHrn = new HRN({
     *     partition: 'here-dev',
     *     service: 'datastore',
     *     resource: 'example-catalog'
     * });
     * ```
     *
     * Use [[fromString]] to create an HRN from a string representation.
     *
     * @param data The data for this HRN.
     */
    constructor(readonly data: HRNData) {}

    /**
     * Converts this HRN to its string representation, for example,
     * `hrn:partition:service:region:account:resource`.
     *
     * @returns The string representation of this HRN.
     */
    toString(): string {
        return (
            "hrn:" +
            this.data.partition +
            ":" +
            this.data.service +
            ":" +
            (this.data.region === undefined ? "" : this.data.region) +
            ":" +
            (this.data.account === undefined ? "" : this.data.account) +
            ":" +
            this.data.resource
        );
    }

    /**
     * Resolves this HRN and returns the base URL for the service this HRN points to.
     */
    resolve(): string {
        let resolvedUrl: string | undefined;

        HRN.resolvers.forEach(resolver => {
            if (resolvedUrl === undefined) {
                resolvedUrl = resolver(this.data);
            }
        });

        if (resolvedUrl === undefined) {
            resolvedUrl = HRN.resolveBuiltin(this.data);
        }

        if (resolvedUrl === undefined) {
            throw new Error("No resolver found for HRN, cannot resolve");
        }

        return resolvedUrl;
    }
}
