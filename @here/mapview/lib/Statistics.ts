/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { LoggerManager, PerformanceTimer } from "@here/utils";

const logger = LoggerManager.instance.create("Statistics");

/**
 * A simple ring buffer to store the last n values of the timer. The buffer works as a
 * Last-In-First-Out (LIFO) buffer.
 */
export class RingBuffer<T> {
    buffer: T[];
    size: number;
    head: number;
    tail: number;

    /**
     * Sets up the ring buffer.
     *
     * @param capacity Capacity of the buffer.
     */
    constructor(readonly capacity: number) {
        this.buffer = new Array(capacity);
        this.capacity = capacity;
        this.head = this.tail = this.size = 0;
    }

    /**
     * Clear the contents, make it appear empty.
     */
    clear(): void {
        this.head = this.tail = this.size = 0;
    }

    /**
     * Add a single element to the ring buffer.
     *
     * @param data Data element.
     */
    enqOne(data: T): void {
        let next = this.head + 1;
        if (next >= this.capacity) {
            next = 0;
        }
        if (this.size < this.capacity) {
            this.size++;
        }

        this.buffer[this.head] = data;
        this.head = next;

        if (this.size === this.capacity) {
            this.tail = this.head;
        }
    }

    /**
     * Adds one or multiple elements.
     *
     * @param data One or multiple elements to add.
     */
    enq(...data: T[]): void {
        for (const v of data) {
            this.enqOne(v);
        }
    }

    /**
     * Obtains latest element (LIFO). May throw an exception if a buffer underrun occurs. Make sure
     * that `size > 0` before calling this method.
     */
    deq(): T {
        if (this.size === 0) {
            throw new Error("Ringbuffer underrun");
        }

        const data = this.buffer[this.tail];
        let next = this.tail + 1;
        if (next >= this.capacity) {
            next = 0;
        }
        if (this.size > 0) {
            this.size--;
        }

        this.tail = next;
        return data;
    }

    /**
     * Create an iterator for the buffer.
     */
    iterator(): RingBuffer.Iterator<T> {
        return new RingBuffer.Iterator<T>(this);
    }

    /**
     * Return a copy of the buffer, where the elements are properly sorted from oldest to newest.
     */
    asArray(): T[] {
        const array = new Array<T>();
        for (let i = 0; i < this.size; i++) {
            array.push(this.buffer[(this.tail + i) % this.capacity]);
        }
        return array;
    }
}

export namespace RingBuffer {
    /**
     * "Local" class for RingBuffer<T>
     */
    export class Iterator<T> {
        /**
         * Create an iterator for the ring buffer.
         *
         * @param m_buffer `Ringbuffer` to iterate over.
         * @param m_index Start index.
         */
        constructor(private m_buffer: RingBuffer<T>, private m_index: number = 0) {}

        /**
         * Get current value of the iterator. Will not fail if overrun occurs. Overruns can only be
         * detected by watching the result of [[next]].
         */
        get value(): T {
            return this.m_buffer.buffer[
                (this.m_buffer.tail + this.m_index) % this.m_buffer.capacity
            ];
        }

        /**
         * Advance iterator to next element.
         *
         * @returns `true` if iterator is still valid. `false` if overrun occurred.
         */
        next(): boolean {
            this.m_index++;
            return this.m_index < this.m_buffer.size;
        }
    }
}

/**
 * Missing Typedoc
 */
export interface Timer {
    readonly name: string;
    readonly value?: number;

    /**
     * Reset value to be able to start again.
     */
    reset(): void;

    /**
     * Start the timer. Returns current time as returned by `Performance.now()`.
     */
    start(): number;

    /**
     * Stop the timer. Requires that timer has been started.
     */
    stop(): number;

    /**
     * Sample timer. Requires that timer has been started. Does not modify the internal state of a
     * timer.
     *
     * @returns Current timer value. `-1` if statistics are disabled.
     */
    now(): number;

    /**
     * Set the measurement value.
     *
     * @param val Measurement value.
     */
    setValue(val: number | undefined): void;
}

/**
 * A simple timer that stores only the latest measurement.
 */
export class SimpleTimer implements Timer {
    /** `true` if timer has been started. */
    running = false;

    private m_currentValue?: number;

    constructor(public statistics: Statistics, readonly name: string) {}

    /**
     * Get latest measurement. May be `undefiend` if measurement was not done.
     */
    get value(): number | undefined {
        return this.m_currentValue;
    }

    /**
     * Set the measurement value.
     *
     * @param val Measurement value.
     */
    setValue(val: number | undefined) {
        this.m_currentValue = val;
    }

    /**
     * Reset the value to be able to start again.
     */
    reset() {
        this.m_currentValue = undefined;
    }

    /**
     * Start the timer. Returns current time as returned by `Performance.now()`.
     */
    start(): number {
        if (!this.statistics.enabled) {
            return -1;
        }
        if (this.running) {
            throw new Error("Timer '" + this.name + "' is already running");
        }
        this.running = true;
        return (this.m_currentValue = PerformanceTimer.now());
    }

    /**
     * Stop the timer. Requires that timer has been started.
     */
    stop(): number {
        if (!this.statistics.enabled) {
            return -1;
        }
        if (!this.running) {
            throw new Error("Timer '" + this.name + "' has not been started");
        } else {
            // this.currentValue is a number now!
            const t = PerformanceTimer.now() - (this.m_currentValue || 0);
            this.m_currentValue = t;
            this.setValue(t);
            this.running = false;
            return t;
        }
    }

    /**
     * Sample timer. Requires that timer has been started.
     *
     * @returns Current timer value. `-1` if statistics are disabled.
     */
    now(): number {
        if (!this.statistics.enabled) {
            return -1;
        }
        if (!this.running) {
            throw new Error("Timer '" + this.name + "' has not been started");
        } else {
            const t = PerformanceTimer.now() - (this.m_currentValue || 0);
            return t;
        }
    }
}

/**
 * Timer that stores the latest `n` samples in a ring buffer.
 */
export class SampledTimer extends SimpleTimer {
    /**
     * Missing Typedoc
     */
    min?: number;

    /**
     * Missing Typedoc
     */
    max?: number;

    /**
     * Missing Typedoc
     */
    avg?: number;

    /**
     * Missing Typedoc
     */
    median?: number;

    /**
     * Missing Typedoc
     */
    median95?: number;

    /**
     * Missing Typedoc
     */
    numSamples = 0;

    /**
     * Missing Typedoc
     */
    numResets = 0;

    /**
     * Maximum samples until the reset and update of stats, which may destroy a median computation.
     */
    maxNumSamples = 1000;

    /**
     * Missing Typedoc
     */
    samples = new RingBuffer<number>(this.maxNumSamples);

    /**
     * Create a `SampledTimer`. Must still be added to statistics if it should be logged!
     *
     * @param statistics Statistics to use for management.
     * @param name Name of the timer. Use colons to build a hierarchy.
     */
    constructor(public statistics: Statistics, readonly name: string) {
        super(statistics, name);
    }

    /**
     * Reset and clear all historical values.
     */
    reset() {
        super.reset();
        this.updateStats();
        this.samples.clear();
        this.numResets++;
    }

    /**
     * Add a single measurement to the sample.
     *
     * @param val A measurement to add.
     */
    setValue(val: number | undefined) {
        super.setValue(val);

        if (val !== undefined) {
            this.samples.enqOne(val);
            this.numSamples++;
        }
    }

    /**
     * Update min/max/avg/median. This currently requires a copy of the sampled values, which is
     * expensive.
     */
    updateStats(): void {
        if (this.samples.size === 0) {
            return;
        }

        //Fixme: This could be done properly without copying the values. This is only done for quick
        // and dirty (aka. simple) computation of the median, min and max

        const samples = this.samples.asArray();

        samples.sort((a: number, b: number) => {
            return a - b;
        });

        const min = samples[0];
        const max = samples[samples.length - 1];
        let median: number;
        let median95: number;

        if (samples.length === 1) {
            median95 = median = samples[0];
        } else if (samples.length === 2) {
            median = samples[0] * 0.5 + samples[1] * 0.5;
            median95 = samples[1];
        } else {
            const mid = Math.floor(samples.length / 2);
            median =
                samples.length % 2 === 0
                    ? samples[mid] * 0.5 + samples[mid + 1] * 0.5
                    : samples[mid];

            const mid95 = Math.floor(samples.length * 0.95);
            median95 = samples[mid95];
        }

        let sum = 0;

        for (let i = 0, l = samples.length; i < l; i++) {
            sum += samples[i];
        }

        const avg = sum / samples.length;

        this.min = min;
        this.max = max;
        this.avg = avg;
        this.median = median;
        this.median95 = median95;
    }
}

/**
 * A `MultiStageTimer` measures a sequence of connected events, for example, multiple stages of
 * processing in a function. Every stage is identified with a name (must be a valid timer in the
 * statistics object and thus be unique within a `MultiStageTimer`).
 *
 * Internally, the `MultiStageTimer` manages a list of timers, where at the end of a stage one timer
 * stops and another timer starts.
 */
export class MultiStageTimer {
    private currentStage: string | undefined;

    /**
     * Define the `MultiStageTimer` with a list of timer names that represent its stages.
     *
     * @param statistics The statistics object that manages the timers.
     * @param name Name of this `MultiStageTimer`.
     * @param stages List of timer names.
     */
    constructor(private statistics: Statistics, readonly name: string, public stages: string[]) {
        if (stages.length < 1) {
            throw new Error("MultiStageTimer needs stages");
        }

        stages.forEach(stage => {
            if (!statistics.hasTimer(stage)) {
                throw new Error("Unknown timer: " + stage);
            }
        });
    }

    /**
     * Get timer value of last stage. Is `undefined` if the `MultiStageTimer` did not finish the
     * last stage.
     */
    get value(): number | undefined {
        return this.statistics.getTimer(this.stages[this.stages.length - 1]).value;
    }

    /**
     * Reset the timers of all stages.
     */
    reset(): void {
        if (!this.statistics.enabled) {
            return;
        }
        this.stages.forEach(stage => {
            this.statistics.getTimer(stage).reset();
        });
    }

    /**
     * Start the `MultiStageTimer` with the first stage.
     */
    start(): number {
        this.stage = this.stages[0];

        return this.statistics.getTimer(this.stages[0]).value || -1;
    }

    /**
     * Stop the `MultiStageTimer`. Returns the measurement of the last stage, which may be
     * `undefined` if not all stages started.
     */
    stop(): number {
        this.stage = undefined;
        return this.value !== undefined ? this.value : -1;
    }

    /**
     * Get the current stage.
     */
    get stage(): string | undefined {
        return this.currentStage;
    }

    /**
     * Set the current stage. If a new stage is provided, the current timer (if any) is stopped, and
     * the next timer (if stage is not `undefined`, which is equivalent to calling `stop` on the
     * `MultiStageTimer`) is started.
     *
     * @param stage New stage to start.
     */
    set stage(stage: string | undefined) {
        if (this.currentStage === stage) {
            return;
        }

        if (this.statistics.enabled && this.currentStage !== undefined) {
            this.statistics.getTimer(this.currentStage).stop();
        }

        this.currentStage = stage;

        if (this.statistics.enabled && this.currentStage !== undefined) {
            this.statistics.getTimer(this.currentStage).start();
        }
    }
}

/**
 * The `Statistics` class manages a set of timers. Its main objective is to log the timers. The
 * statistics may be disabled to minimize their performance impact.
 */
export class Statistics {
    private timers: Map<string, Timer>;

    private nullTimer: Timer;

    /**
     * Set up a group of timers.
     *
     * @param name Name of statistics fot logging purposes.
     * @param enabled If `false`, the timers will not measure the performance.
     */
    constructor(public name?: string, public enabled = false) {
        this.timers = new Map<string, Timer>();
        this.nullTimer = new SimpleTimer(this, "<null>");
    }

    /**
     * Adds a timer. Name must be unique.
     *
     * @param name Name of a timer. Must be unique.
     */
    createTimer(name: string, keepSamples = true): Timer {
        const timer = keepSamples ? new SampledTimer(this, name) : new SimpleTimer(this, name);

        return this.addTimer(timer);
    }

    /**
     * Adds a timer. Name must be unique within this statistics object.
     *
     * @param timer Timer. Must have a unique name.
     */
    addTimer(timer: Timer): Timer {
        if (this.timers.get(timer.name) !== undefined) {
            throw new Error("Duplicate timer name: '" + timer.name + "'");
        }

        this.timers.set(timer.name, timer);

        return timer;
    }

    /**
     * Get a timer by name.
     *
     * @param name Name of a timer.
     */
    getTimer(name: string): Timer {
        if (!this.enabled) {
            return this.nullTimer;
        }

        const t = this.timers.get(name);
        return t === undefined ? this.nullTimer : t;
    }

    /**
     * Check if a timer exists.
     *
     * @param name Name of a timer.
     * @returns `true` if timer with provided `name` exists, `false` otherwise.
     */
    hasTimer(name: string): boolean {
        const t = this.timers.get(name);
        return t !== undefined;
    }

    /**
     * Reset all timers.
     */
    reset() {
        this.timers.forEach((timer: Timer) => {
            timer.reset();
        });
    }

    /**
     * Print all values to the console.
     *
     * @param header Optional header line.
     * @param footer Optional footer line.
     */
    log(header?: string, footer?: string) {
        if (header !== undefined || this.name !== undefined) {
            logger.log(header !== undefined ? header : this.name);
        }

        let maxNameLength = 0;

        this.timers.forEach((timer: Timer) => {
            maxNameLength = Math.max(maxNameLength, timer.name.length);
        });

        // simple printing function for number limits the number of decimal points.
        const print = (v: number | undefined) => {
            return v !== undefined ? v.toFixed(5) : "?";
        };

        this.timers.forEach((timer: Timer) => {
            let s = timer.name + ": " + " ".repeat(maxNameLength - timer.name.length);
            s += print(timer.value);

            // sampled timers also update their stats and log them
            if (timer instanceof SampledTimer) {
                timer.updateStats();
                s +=
                    `  [ min=${print(timer.min)}, max=${print(timer.max)}, ` +
                    `avg=${print(timer.avg)}, med=${print(timer.median)}, ` +
                    `med95=${print(timer.median95)}, N=${print(timer.numSamples)} ]`;
            }
            logger.log(s);
        });

        if (footer !== undefined) {
            logger.log(footer);
        }
    }
}
