/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { LoggerManager, PerformanceTimer } from "@here/harp-utils";

const logger = LoggerManager.instance.create("Statistics");

/**
 * A simple ring buffer to store the last `n` values of the timer. The buffer works on
 * a Last-In-First-Out (LIFO) basis.
 */
export class RingBuffer<T> {
    buffer: T[];
    size: number;
    head: number;
    tail: number;

    /**
     * Sets up the ring buffer.
     *
     * @param capacity The buffer's capacity.
     */
    constructor(readonly capacity: number) {
        this.buffer = new Array(capacity);
        this.capacity = capacity;
        this.head = this.tail = this.size = 0;
    }

    /**
     * Clears the contents, removes all elements.
     */
    clear(): void {
        this.head = this.tail = this.size = 0;
    }

    /**
     * Adds a single element to the ring buffer.
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
     * Adds one or more elements.
     *
     * @param data The elements to add.
     */
    enq(...data: T[]): void {
        for (const v of data) {
            this.enqOne(v);
        }
    }

    /**
     * Obtains the latest element (LIFO). May throw an exception if a buffer underrun occurs.
     * Before calling this method, make sure that `size > 0`.
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
     * Creates an iterator for the buffer.
     */
    iterator(): RingBuffer.Iterator<T> {
        return new RingBuffer.Iterator<T>(this);
    }

    /**
     * Returns a copy of the buffer, where the elements are properly sorted from oldest to newest.
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
     * A local class for RingBuffer<T>
     */
    export class Iterator<T> {
        /**
         * Creates an iterator for the ring buffer.
         *
         * @param m_buffer `Ringbuffer` to iterate over.
         * @param m_index Start index.
         */
        constructor(private m_buffer: RingBuffer<T>, private m_index: number = 0) {}

        /**
         * Gets the iterator's current value. This function does not fail even if an overrun occurs.
         * To detect an overrun, watch the result for [[next]].
         */
        get value(): T {
            return this.m_buffer.buffer[
                (this.m_buffer.tail + this.m_index) % this.m_buffer.capacity
            ];
        }

        /**
         * Advances the iterator to the next element.
         *
         * @returns `true` if the iterator is still valid; `false` if an overrun occurs.
         */
        next(): boolean {
            this.m_index++;
            return this.m_index < this.m_buffer.size;
        }
    }
}

/**
 * An interface for a Timer class, that abstracts the basic functions of a Timer. Implemented
 * by SimpleTimer, SampledTimer, and MultiStageTimer.
 */
export interface Timer {
    readonly name: string;
    readonly value?: number;

    /**
     * Resets value to be able to start again.
     */
    reset(): void;

    /**
     * Starts the timer. Returns the current time, based on `Performance.now()`.
     */
    start(): number;

    /**
     * Stops the timer. Requires that the timer has started.
     */
    stop(): number;

    /**
     * Samples the timer. Requires that the timer has started. This function does not modify
     * the timer's internal state.
     *
     * @returns Current timer value. `-1` if statistics are disabled.
     */
    now(): number;

    /**
     * Sets the measurement value for the amount of time that has elapsed from start() to stop().
     * Use this function to override the timer's duration.
     *
     * @param val The timer's duration.
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
     * Gets the latest measurement. This function may return `undefined` if no measurement
     * was done.
     */
    get value(): number | undefined {
        return this.m_currentValue;
    }

    /**
     * Sets the measurement value for the amount of time that has elapsed from start() to stop().
     * Use this function to override the timer's duration.
     *
     * @param val The timer's duration.
     */
    setValue(val: number | undefined) {
        this.m_currentValue = val;
    }

    /**
     * Resets the value to be able to start again.
     */
    reset() {
        this.m_currentValue = undefined;
    }

    /**
     * Starts the timer. Returns the current time, based on `Performance.now()`.
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
     * Stops the timer. Requires that the timer has started.
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
     * Samples the timer. Requires that the timer has started.
     *
     * @returns the current timer value; `-1` if statistics are disabled.
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
 * A timer that stores the last `n` samples in a ring buffer.
 */
export class SampledTimer extends SimpleTimer {
    /**
     * The lowest timer duration measured, or `undefined` if no timer was run.
     */
    min?: number;

    /**
     * The highest timer duration measured, or `undefined` if no timer was run.
     */
    max?: number;

    /**
     * The average duration of all timers.
     */
    avg?: number;

    /**
     * The median duration of all timers.
     */
    median?: number;

    /**
     * The 95th percentile median duration of all timers.
     */
    median95?: number;

    /**
     * The number of times the timer was started and subsequently stopped; cannot exceed
     * `maxNumSamples`.
     */
    numSamples = 0;

    /**
     * The number of times the timer has reset.
     */
    numResets = 0;

    /**
     * Maximum samples until the statistics are reset and updated, which may destroy a median
     * computation.
     */
    maxNumSamples = 1000;

    /**
     * The number of times the timer was started and subsequently stopped; cannot exceed
     * `maxNumSamples`.
     */
    samples = new RingBuffer<number>(this.maxNumSamples);

    /**
     * Creates a `SampledTimer` instance. Must still be added to statistics if it should be logged!
     *
     * @param statistics Statistics to use for management.
     * @param name Name of the timer. Use colons to build a hierarchy.
     */
    constructor(public statistics: Statistics, readonly name: string) {
        super(statistics, name);
    }

    /**
     * Resets the timer and clears all of its historical values.
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
     * Updates the `min`, `max`, `avg`, and `median` values. Currently, this function is expensive,
     * as it requires a copy of the sampled values.
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
 * Measures a sequence of connected events, such as multiple processing stages in a function.
 * Each stage is identified with a timer name, that must be a valid timer in the statistics
 * object. Additionally, all timers within a `MultiStageTimer` must be unique.
 *
 * Internally, the `MultiStageTimer` manages a list of timers where at the end of each stage,
 * one timer stops and the next timer starts.
 */
export class MultiStageTimer {
    private currentStage: string | undefined;

    /**
     * Defines the `MultiStageTimer` with a list of timer names that represent its stages.
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
     * Gets the timer value for the last stage. If the `MultiStageTimer` did not finish its
     * last stage, the value is `undefined`.
     */
    get value(): number | undefined {
        return this.statistics.getTimer(this.stages[this.stages.length - 1]).value;
    }

    /**
     * Resets the timers across all stages.
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
     * Starts the `MultiStageTimer` at its first stage.
     */
    start(): number {
        this.stage = this.stages[0];

        return this.statistics.getTimer(this.stages[0]).value || -1;
    }

    /**
     * Stops the `MultiStageTimer`. Returns the measurement of the last stage, which may be
     * `undefined` if not all stages started.
     */
    stop(): number {
        this.stage = undefined;
        return this.value !== undefined ? this.value : -1;
    }

    /**
     * Gets the current stage.
     */
    get stage(): string | undefined {
        return this.currentStage;
    }

    /**
     * Sets the current stage. If a new stage is provided, the current timer (if available) is
     * stopped, and the next timer is started. If the timer in the next stage is `undefined`,
     * this is equivalent to calling `stop` on the `MultiStageTimer`.
     *
     * @param stage The next stage to start.
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
 * Manages a set of timers. The main objective of `Statistics` is to log these timers. You can
 * disable statistics to minimize their impact on performance.
 */
export class Statistics {
    private timers: Map<string, Timer>;

    private nullTimer: Timer;

    /**
     * Sets up a group of timers.
     *
     * @param name The statistics name, for logging purposes.
     * @param enabled If `false`, the timers do not measure the performance.
     */
    constructor(public name?: string, public enabled = false) {
        this.timers = new Map<string, Timer>();
        this.nullTimer = new SimpleTimer(this, "<null>");
    }

    /**
     * Adds a timer, based on the name specified.
     *
     * @param name The timer's name; must be unique.
     */
    createTimer(name: string, keepSamples = true): Timer {
        const timer = keepSamples ? new SampledTimer(this, name) : new SimpleTimer(this, name);

        return this.addTimer(timer);
    }

    /**
     * Adds the timer specified.
     *
     * @param timer The timer's name, which must be unique within this statistics object.
     */
    addTimer(timer: Timer): Timer {
        if (this.timers.get(timer.name) !== undefined) {
            throw new Error("Duplicate timer name: '" + timer.name + "'");
        }

        this.timers.set(timer.name, timer);

        return timer;
    }

    /**
     * Gets a timer by name.
     *
     * @param name The timer's name.
     */
    getTimer(name: string): Timer {
        if (!this.enabled) {
            return this.nullTimer;
        }

        const t = this.timers.get(name);
        return t === undefined ? this.nullTimer : t;
    }

    /**
     * Checks if a timer with the specified name already exists.
     *
     * @param name The timer's name.
     * @returns `true` if a timer with `name` already exists; `false` otherwise.
     */
    hasTimer(name: string): boolean {
        const t = this.timers.get(name);
        return t !== undefined;
    }

    /**
     * Resets all timers.
     */
    reset() {
        this.timers.forEach((timer: Timer) => {
            timer.reset();
        });
    }

    /**
     * Prints all values to the console.
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
