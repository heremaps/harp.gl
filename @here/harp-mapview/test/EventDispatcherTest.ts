/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { assert, expect } from "chai";
import * as sinon from "sinon";

import { EventDispatcher } from "../lib/EventDispatcher";
import { MapViewEventNames } from "../lib/MapView";

//    expect-type assertions are unused expressions and are perfectly valid

//    lots of stubs are needed which are just placeholders and are empty

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

describe("EventDispatcher", function () {
    let eventDispatcher: EventDispatcher | undefined;

    it("eventTypes", function () {
        eventDispatcher = new EventDispatcher();

        expect(eventDispatcher.eventTypes.length).to.be.equal(
            0,
            `Event listeners should be empty.`
        );
        const callStub = sinon.stub();

        eventDispatcher.addEventListener("X", callStub);
        expect(eventDispatcher.eventTypes.length).to.be.equal(
            1,
            `eventTypes not containing added event type.`
        );
    });

    it("hasEventListener", function () {
        eventDispatcher = new EventDispatcher();

        expect(eventDispatcher.hasEventListener("X")).to.be.equal(
            false,
            `hasEventListener not working.`
        );

        const callStub = sinon.stub();

        eventDispatcher.addEventListener("X", callStub);
        expect(eventDispatcher.hasEventListener("X")).to.be.equal(
            true,
            `unspecified listener not found.`
        );
        expect(eventDispatcher.hasEventListener("X", callStub)).to.be.equal(
            true,
            `specific listener not found.`
        );
        expect(eventDispatcher.hasEventListener("Y", callStub)).to.be.equal(
            false,
            `hasEventListener unregistered event.`
        );
    });

    it("listeners", function () {
        eventDispatcher = new EventDispatcher();

        expect(eventDispatcher.listeners("X")).to.be.equal(undefined, `listeners not empty.`);

        const callStub = sinon.stub();

        eventDispatcher.addEventListener("X", callStub);
        assert.isDefined(eventDispatcher.listeners("X"));
        expect(eventDispatcher.listeners("X")!.length).to.be.equal(1, `listeners array empty.`);
        expect(eventDispatcher.listeners("X")![0]).to.be.equal(
            callStub,
            `listeners array contains wrong listener.`
        );
    });

    it("Correctly sets and removes all event listeners by API", function () {
        const checkEvent = (eventName: string) => {
            eventDispatcher = new EventDispatcher();

            const callStub = sinon.stub();

            eventDispatcher.addEventListener(eventName, callStub);
            eventDispatcher.dispatchEvent({ type: eventName });

            expect(callStub.callCount).to.be.equal(
                1,
                `Event listener '${eventName}' not called properly.`
            );

            eventDispatcher.removeEventListener(eventName, callStub);
            eventDispatcher.dispatchEvent({ type: eventName });

            expect(callStub.callCount).to.be.equal(
                1,
                `Event listener '${eventName}' not removed properly.`
            );
        };

        const events = Object.keys(MapViewEventNames);
        for (const event of events) {
            checkEvent(event);
        }
    });

    it("#removeAllEventListeners", async function () {
        eventDispatcher = new EventDispatcher();

        const eventStubs: Map<string, sinon.SinonStub> = new Map();

        const addEvent = (eventName: string) => {
            const callStub = sinon.stub();
            eventDispatcher!.addEventListener(eventName, callStub);
            eventStubs.set(eventName, callStub);
        };

        const callEvent = (eventName: string) => {
            const callStub = eventStubs.get(eventName)!;

            eventDispatcher!.dispatchEvent({ type: eventName });

            expect(callStub.callCount).to.be.equal(
                1,
                `Event listener '${eventName}' not called correctly`
            );
        };

        const callEventAfterDispose = (eventName: string) => {
            const callStub = eventStubs.get(eventName)!;

            eventDispatcher!.dispatchEvent({ type: eventName });

            expect(callStub.callCount).to.be.equal(
                1,
                `Event listener '${eventName}' still active after dispose`
            );
        };

        const events = Object.keys(MapViewEventNames);
        for (const event of events) {
            addEvent(event);
        }
        for (const event of events) {
            callEvent(event);
        }

        eventDispatcher.removeAllEventListeners();

        for (const event of events) {
            callEventAfterDispose(event);
        }

        eventDispatcher = undefined!;
    });

    it("dispose", async function () {
        eventDispatcher = new EventDispatcher();

        const callStub = sinon.stub();

        eventDispatcher.addEventListener("X", callStub);
        expect(eventDispatcher.eventTypes.length).to.be.equal(1, `event not added.`);

        eventDispatcher.dispose();

        expect(eventDispatcher.eventTypes.length).to.be.equal(0, `event not removed.`);
    });
});
