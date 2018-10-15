import { assert } from "chai";
import { MultiStageTimer, RingBuffer, SampledTimer, Statistics } from "../lib/Statistics";

describe("mapview-statistics", () => {
    it("Ringbuffer", () => {
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
    });

    it("init", () => {
        const stats = new Statistics();
        assert.isFalse(stats.enabled);

        stats.enabled = true;
        assert.isTrue(stats.enabled);
    });

    it("createTimer", () => {
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

                stats.log();
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

                stats.log();
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
                    assert.isAbove(stats.getTimer("init").value || 0, 0);
                    assert.isNumber(stats.getTimer("draw").value);
                    assert.isAbove(stats.getTimer("draw").value || 0, 0);
                    assert.isNumber(stats.getTimer("post").value);
                    assert.isAbove(stats.getTimer("post").value || 0, 0);

                    stats.log();

                    done();
                }, 2);
            }, 2);
        }, 2);
    });
});
