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

import { assert } from "chai";
import { HRN } from "../lib/HRN";

describe("HRN", () => {
    it("resolver", () => {
        HRN.addResolver(data => (data.partition === "test" ? "test2" + data.resource : undefined));
        const testHrn = HRN.fromString("hrn:test:something:::Worked");
        assert.strictEqual(testHrn.resolve(), "test2Worked");
    });

    it("no resolver found", () => {
        const testHrn = HRN.fromString("hrn:testtest:something:::Worked");
        assert.throws(() => testHrn.resolve(), /No resolver found for HRN/);
    });

    it("schemaHRN", () => {
        const testHrn = HRN.fromString(
            "hrn:here-dev:schema:::com.here.rib.schema:rib-topology_v1:1.17.0:ds"
        );
        assert.strictEqual(
            testHrn.resolve(),
            "https://artifactory.in.here.com" +
                "/artifactory/here-olp-sit/com/here/rib/schema/rib-topology_v1_ds/1.17.0" +
                "/rib-topology_v1_ds-1.17.0.zip"
        );
    });

    it("schemaHRN proto", () => {
        const testHrn = HRN.fromString(
            "hrn:here-dev:schema:::com.here.rib.schema:rib-topology_v1:1.17.0:proto"
        );
        assert.strictEqual(
            testHrn.resolve(),
            "https://artifactory.in.here.com" +
                "/artifactory/here-olp-sit/com/here/rib/schema/rib-topology_v1_proto" +
                "/1.17.0/rib-topology_v1_proto-1.17.0.jar"
        );
    });

    it("fromString", () => {
        const hrnString = "hrn:here:datastore:::testcatalog";
        assert.strictEqual(HRN.fromString(hrnString).toString(), hrnString);
    });

    it("localURL", () => {
        const hrn = HRN.fromString("http://localhost:5000");

        assert.strictEqual(hrn.data.partition, "catalog-url");
        assert.strictEqual(hrn.data.service, "datastore");
        assert.strictEqual(hrn.data.region, "");
        assert.strictEqual(hrn.data.account, "");

        assert.strictEqual(hrn.resolve(), "http://localhost:5000");
    });

    it("additionalFields", () => {
        const hrn = HRN.fromString("hrn:here:datastore:::testcatalog:some:additional:fields");
        assert.sameOrderedMembers(hrn.data.resource.split(":"), [
            "testcatalog",
            "some",
            "additional",
            "fields"
        ]);
    });

    it("resolving using built in defaults", () => {
        HRN.addResolver(data => (data.partition === "test" ? "test2" + data.resource : undefined));

        const testHrnHere = HRN.fromString("hrn:here:datastore:::worked");
        assert.strictEqual(testHrnHere.resolve(), "https://worked.catalogs.datastore.api.here.com");

        const testHrnHereDev = HRN.fromString("hrn:here-dev:datastore:::worked");
        assert.strictEqual(
            testHrnHereDev.resolve(),
            "https://worked.catalogs.datastore.sit.api.here.com"
        );

        const testHrnCatalogUrl = HRN.fromString(
            "hrn:catalog-url:datastore:::https://worked.here.com"
        );
        assert.strictEqual(testHrnCatalogUrl.resolve(), "https://worked.here.com");

        const testHrnSchemaService = HRN.fromString(
            "hrn:catalog-url:schema:::https://worked.here.com"
        );
        assert.strictEqual(testHrnSchemaService.resolve(), "https://worked.here.com");

        const testHrnSchemaHere = HRN.fromString("hrn:here:schema:::rib-topology_v1:1.17.0:ds");
        assert.strictEqual(
            testHrnSchemaHere.resolve(),
            "https://repo.platform.here.com/artifactory/open-location-platform" +
                "/rib-topology_v1/1.17.0/ds/1.17.0-ds"
        );

        const testHrnSchemaHereDev = HRN.fromString(
            "hrn:here-dev:schema:::rib-topology_v1:1.17.0:ds"
        );
        assert.strictEqual(
            testHrnSchemaHereDev.resolve(),
            "https://artifactory.in.here.com/artifactory/here-olp-sit" +
                "/rib-topology_v1/1.17.0/ds/1.17.0-ds"
        );

        const noresolveHrn = HRN.fromString("hrn:nothing::::");
        assert.throws(() => noresolveHrn.resolve());
    });

    it("HRN throw Error on malformed input data", () => {
        const noresolveHrn = HRN.fromString("hrn:nothing::::");
        assert.throws(() => noresolveHrn.resolve());

        const testHrnSchemaHere = HRN.fromString("hrn:here:schema:::ds");
        assert.throw(() => testHrnSchemaHere.resolve());

        const testHrnSchemaHereDev = HRN.fromString("hrn:here-dev:schema::::");
        assert.throw(() => testHrnSchemaHereDev.resolve());

        let caught = false;
        try {
            // tslint:disable-next-line:no-unused-variable
            const invalidHRN = HRN.fromString("hrn:nothing:");
        } catch (err) {
            assert.isTrue(err instanceof Error);
            assert.strictEqual((err as Error).message, "Invalid HRN");
            caught = true;
        }
        assert.isTrue(caught);

        let caught2 = false;
        try {
            // tslint:disable-next-line:no-unused-variable
            const invalidHRNpartition = HRN.fromString("hrzz:nothing:");
        } catch (err) {
            assert.isTrue(err instanceof Error);
            assert.strictEqual((err as Error).message, "Invalid HRN");
            caught2 = true;
        }
        assert.isTrue(caught2);
    });
});
