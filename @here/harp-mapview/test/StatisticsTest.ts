/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { silenceLoggingAroundFunction } from "@here/harp-test-utils";
import { assert } from "chai";

import {
    computeArrayStats,
    MultiStageTimer,
    PerformanceStatistics,
    RingBuffer,
    SampledTimer,
    Statistics
} from "../lib/Statistics";

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

declare const global: any;

const isNode = typeof window === "undefined";

describe("mapview-statistics", function () {
    it("Ringbuffer", function () {
        const rb = new RingBuffer<number>(10);

        assert.equal(rb.size, 0);

        rb.enq(5);
        assert.equal(rb.size, 1);
        assert.equal(rb.asArray()[0], 5);
        assert.equal(rb.asArray().length, 1);

        const x = rb.deq();
        assert.equal(rb.size, 0);
        assert.equal(x, 5);

        rb.enq(5);
        rb.enq(6);
        rb.enq(7);
        assert.equal(rb.size, 3);
        assert.equal(rb.top, 5);
        assert.equal(rb.bottom, 7);
        assert.equal(rb.deq(), 5);
        assert.equal(rb.deq(), 6);
        assert.equal(rb.deq(), 7);

        rb.enq(5);
        assert.equal(rb.size, 1);
        rb.clear();
        assert.equal(rb.size, 0);

        rb.enq(0, 1, 2, 3, 4, 5);
        assert.equal(rb.size, 6);

        rb.enq(10, 11, 12, 13, 14, 15, 16, 17, 18, 19);
        assert.equal(rb.size, 10);
        rb.enq(10);
        assert.equal(rb.size, 10);

        const arr = rb.asArray();
        assert.equal(arr[0], 11);
        assert.equal(arr[9], 10);

        rb.clear();
        rb.enq(90, 91, 92, 93, 94, 95, 96, 97, 98, 99);
        assert.equal(rb.deq(), 90);
        rb.enq(99, 100);

        assert.equal(rb.top, 92);
        assert.equal(rb.bottom, 100);
        assert.equal(rb.deq(), 92);
        assert.equal(rb.deq(), 93);
        assert.equal(rb.deq(), 94);
        assert.equal(rb.deq(), 95);
        assert.equal(rb.deq(), 96);
        assert.equal(rb.deq(), 97);
        assert.equal(rb.deq(), 98);
        assert.equal(rb.deq(), 99);
        assert.equal(rb.deq(), 99);
        assert.equal(rb.deq(), 100);
        assert.equal(rb.size, 0);
        assert.throws(() => {
            rb.deq();
        });
        assert.throws(() => {
            rb.top;
        });
        assert.throws(() => {
            rb.bottom;
        });

        rb.clear();
        rb.enq(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11);
        assert.equal(rb.deq(), 2);
        assert.equal(rb.deq(), 3);
        assert.equal(rb.size, 8);
        assert.equal(rb.top, 4);
        assert.equal(rb.bottom, 11);
        rb.enq(12);
        assert.equal(rb.size, 9);
        assert.equal(rb.top, 4);
        assert.equal(rb.bottom, 12);
        rb.enq(13);
        assert.equal(rb.size, 10);
        assert.equal(rb.top, 4);
        assert.equal(rb.bottom, 13);
        rb.enq(14);
        assert.equal(rb.size, 10);
        assert.equal(rb.top, 5);
        assert.equal(rb.bottom, 14);
        assert.equal(rb.deq(), 5);
        assert.equal(rb.deq(), 6);
        assert.equal(rb.deq(), 7);
        assert.equal(rb.deq(), 8);
        assert.equal(rb.deq(), 9);
        assert.equal(rb.deq(), 10);
        assert.equal(rb.deq(), 11);
        assert.equal(rb.deq(), 12);
        assert.equal(rb.deq(), 13);
        assert.equal(rb.deq(), 14);
        assert.equal(rb.size, 0);
    });

    it("init", function () {
        const stats = new Statistics();
        assert.isFalse(stats.enabled);

        stats.enabled = true;
        assert.isTrue(stats.enabled);
    });

    it("createTimer", function () {
        const stats = new Statistics();

        const startTimer = stats.createTimer("run");
        assert.isObject(startTimer);

        assert.throws(() => {
            stats.createTimer("run");
        });

        assert.isTrue(stats.hasTimer("run"));
        assert.isFalse(stats.hasTimer("blah"));
    });

    it("simple timer", done => {
        const stats = new Statistics();
        assert.isFalse(stats.enabled);

        const startTimer = stats.createTimer("run", false);
        stats.createTimer("long name thingie", false);

        const t1 = startTimer.start();
        assert.isNumber(t1);
        assert.equal(t1, -1);

        const t2 = startTimer.stop();
        assert.isNumber(t2);
        assert.equal(t2, -1);

        stats.enabled = true;

        assert.throw(() => {
            startTimer.stop();
        }, "Timer 'run' has not been started");

        startTimer.start();

        assert.throw(() => {
            startTimer.start();
        }, "Timer 'run' is already running");

        setTimeout(() => {
            const t = startTimer.now();
            assert.isNumber(t);
            assert.isAbove(t, 0);

            setTimeout(() => {
                const tx = startTimer.stop();
                assert.isNumber(tx);
                assert.isAbove(tx, t);

                silenceLoggingAroundFunction("Statistics", () => {
                    stats.log();
                });
                done();
            }, 2);
        }, 2);
    });

    it("sampled timer", done => {
        const stats = new Statistics();
        assert.isFalse(stats.enabled);

        const startTimer = stats.createTimer("run", true) as SampledTimer;

        const t1 = startTimer.start();
        assert.isNumber(t1);
        assert.equal(t1, -1);

        const t2 = startTimer.stop();
        assert.isNumber(t2);
        assert.equal(t2, -1);

        stats.enabled = true;

        assert.throw(() => {
            startTimer.stop();
        }, "Timer 'run' has not been started");

        startTimer.start();

        assert.throw(() => {
            startTimer.start();
        }, "Timer 'run' is already running");

        setTimeout(() => {
            const t = startTimer.now();
            assert.isNumber(t);
            assert.isAbove(t, 0);

            setTimeout(() => {
                const tx = startTimer.stop();
                assert.isNumber(tx);
                assert.isAbove(tx, t);

                silenceLoggingAroundFunction("Statistics", () => {
                    stats.log();
                });
                done();
            }, 2);
        }, 2);
    });

    it("rendering multi stage", done => {
        const stats = new Statistics("rendering multi stage", true);

        stats.createTimer("init", true);
        stats.createTimer("draw", true);
        stats.createTimer("post", true);

        const stagedTimer = new MultiStageTimer(stats, "render", ["init", "draw", "post"]);

        assert.equal(stagedTimer.stage, undefined);

        stagedTimer.stage = "init";

        assert.equal(stagedTimer.stage, "init");

        setTimeout(() => {
            stagedTimer.stage = "draw";

            assert.equal(stagedTimer.stage, "draw");

            setTimeout(() => {
                stagedTimer.stage = "post";

                setTimeout(() => {
                    assert.equal(stagedTimer.stage, "post");

                    stagedTimer.stop();

                    assert.equal(stagedTimer.stage, undefined);

                    assert.isNumber(stats.getTimer("init").value);
                    assert.isAbove(stats.getTimer("init").value ?? 0, 0);
                    assert.isNumber(stats.getTimer("draw").value);
                    assert.isAbove(stats.getTimer("draw").value ?? 0, 0);
                    assert.isNumber(stats.getTimer("post").value);
                    assert.isAbove(stats.getTimer("post").value ?? 0, 0);

                    silenceLoggingAroundFunction("Statistics", () => {
                        stats.log();
                    });

                    done();
                }, 2);
            }, 2);
        }, 2);
    });

    it("computeArrayStats", function () {
        assert.isUndefined(computeArrayStats([]));
        assert.isDefined(computeArrayStats([0]));

        const array0 = [0, 1, 2, 3, 4];
        const stats0 = computeArrayStats(array0)!;
        assert.equal(stats0.min, 0);
        assert.equal(stats0.max, 4);
        assert.equal(stats0.avg, 2);
        assert.equal(stats0.numSamples, 5);
        assert.equal(stats0.median, 2);
        assert.equal(stats0.median90, 4);
        assert.equal(stats0.median95, 4);
        assert.equal(stats0.median97, 4);
        assert.equal(stats0.median99, 4);
        assert.equal(stats0.median999, 4);
    });

    it("computeArrayStats 2", function () {
        const array0 = [4, 3, 2, 1, 0];
        const stats0 = computeArrayStats(array0)!;
        assert.equal(stats0.min, 0);
        assert.equal(stats0.max, 4);
        assert.equal(stats0.avg, 2);
        assert.equal(stats0.numSamples, 5);
        assert.equal(stats0.median, 2);
        assert.equal(stats0.median90, 4);
        assert.equal(stats0.median95, 4);
        assert.equal(stats0.median97, 4);
        assert.equal(stats0.median99, 4);
        assert.equal(stats0.median999, 4);
    });

    it("computeArrayStats median", function () {
        const array0 = [0, 1, 2, 3];
        const stats0 = computeArrayStats(array0)!;
        assert.equal(stats0.min, 0);
        assert.equal(stats0.max, 3);
        assert.equal(stats0.avg, 6 / 4);
        assert.equal(stats0.numSamples, 4);
        assert.equal(stats0.median, 1.5);
        assert.equal(stats0.median90, 3);
        assert.equal(stats0.median95, 3);
        assert.equal(stats0.median97, 3);
        assert.equal(stats0.median99, 3);
        assert.equal(stats0.median999, 3);
    });

    it("computeArrayStats 1000", function () {
        const array0: number[] = [];

        let sum = 0;
        const n = 1000;
        for (let i = 0; i < n; i++) {
            array0.push(i);
            sum += i;
        }

        const stats0 = computeArrayStats(array0)!;
        assert.equal(stats0.min, 0);
        assert.equal(stats0.max, 999);
        assert.equal(stats0.avg, sum / n);
        assert.equal(stats0.numSamples, n);
        assert.equal(stats0.median, (499 + 500) * 0.5);
        assert.equal(stats0.median90, 899);
        assert.equal(stats0.median95, 949);
        assert.equal(stats0.median97, 969);
        assert.equal(stats0.median99, 989);
        assert.equal(stats0.median999, 998);
    });

    beforeEach(() => {
        const unused = new PerformanceStatistics();
        const stats = PerformanceStatistics.instance;
        assert.strictEqual(unused, stats);
        assert.equal(stats.currentFrame.entries.size, 0);

        if (isNode) {
            const theGlobal: any = global;
            theGlobal.window = {
                window: {}
            };
        }
    });

    afterEach(() => {
        if (isNode) {
            const theGlobal: any = global;
            delete theGlobal.window;
        }
    });

    it("create PerformanceStatistics", function () {
        assert.isDefined(PerformanceStatistics.instance);

        assert.instanceOf(PerformanceStatistics.instance, PerformanceStatistics);
    });

    function addFrameValues(frameInfo: any) {
        const stats = PerformanceStatistics.instance;

        for (const property in frameInfo) {
            if (frameInfo[property]) {
                stats.currentFrame.addValue(property, frameInfo[property]);
            }
        }
    }

    it("add PerformanceStatistics values", function () {
        const stats = PerformanceStatistics.instance;

        stats.clear();
        assert.equal(stats.currentFrame.entries.size, 0);

        const curFrame = stats.currentFrame;
        assert.isUndefined(curFrame.messages);
        assert.equal(curFrame.entries.size, 0);

        curFrame.setValue("test0", 99);
        assert.equal(curFrame.entries.size, 1);
        assert.equal(curFrame.getValue("test0"), 99);

        curFrame.setValue("test1", 1);
        curFrame.setValue("test2", 2);
        assert.equal(curFrame.entries.size, 3);
        assert.equal(curFrame.getValue("test1"), 1);
        assert.equal(curFrame.getValue("test2"), 2);

        curFrame.setValue("test100", 100);
        assert.equal(curFrame.entries.size, 4);
        assert.equal(curFrame.getValue("test100"), 100);
        curFrame.addValue("test100", 100);
        assert.equal(curFrame.entries.size, 4);
        assert.equal(curFrame.getValue("test100"), 200);

        curFrame.reset();
        assert.equal(curFrame.getValue("test100"), 0);
    });

    it("add PerformanceStatistics values 2", function () {
        const stats = PerformanceStatistics.instance;
        const curFrame = stats.currentFrame;

        addFrameValues({
            a: 100,
            b: 200
        });

        assert.equal(curFrame.getValue("a"), 100);
        assert.equal(curFrame.getValue("b"), 200);
    });

    it("add PerformanceStatistics storeFrameInfo", function () {
        const stats = PerformanceStatistics.instance;

        addFrameValues({
            a: 100
        });

        stats.storeAndClearFrameInfo();

        addFrameValues({
            a: 150,
            b: 200
        });

        stats.storeAndClearFrameInfo();

        const frameEvents = stats.frameEvents;
        assert.equal(frameEvents.length, 2);

        const arrayA = frameEvents.frameEntries.get("a")!.asArray();
        const arrayB = frameEvents.frameEntries.get("b")!.asArray();

        assert.equal(arrayA[0], 100);
        assert.equal(arrayA[1], 150);
        assert.equal(arrayB[0], 0);
        assert.equal(arrayB[1], 200);

        const frameStats = stats.getLastFrameStatistics();
        assert.equal(frameStats.frames.a, 150);
        assert.equal(frameStats.frames.b, 200);
    });

    it("add PerformanceStatistics appResults", function () {
        const stats = PerformanceStatistics.instance;

        stats.appResults.set("numberSetting", 99);
        stats.appResults.set("numberSetting2", 99);
        stats.appResults.set("numberSetting3", 99);

        assert.equal(stats.appResults.size, 3);
    });

    it("add PerformanceStatistics configs", function () {
        const stats = PerformanceStatistics.instance;

        stats.configs.set("string config", "X");
        stats.configs.set("number config", "99");
        stats.configs.set("boolean config", "true");

        assert.equal(stats.configs.size, 3);
    });

    it("add PerformanceStatistics messages", function () {
        const stats = PerformanceStatistics.instance;
        const curFrame = stats.currentFrame;
        assert.isUndefined(curFrame.messages);
        assert.equal(curFrame.entries.size, 0);

        curFrame.addMessage("testMessage");
        assert.isDefined(curFrame.messages);
        assert.equal(curFrame.messages!.length, 1);

        curFrame.reset();
        assert.isUndefined(curFrame.messages);
    });
});
