/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { LoggerManager, PerformanceTimer } from "@here/harp-utils";
import * as THREE from "three";

const logger = LoggerManager.instance.create("Statistics");

/**
 * A simple ring buffer to store the last `n` values of the timer. The buffer works on
 * a First-In-First-Out (FIFO) basis.
 */
export class RingBuffer<T> {
    buffer: T[];
    size: number;
    head: number;
    tail: number;

    /**
     * Sets up the ring buffer.
     *
     * @param capacity - The buffer's capacity.
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
     * @param data - Data element.
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
     * @param data - The elements to add.
     */
    enq(...data: T[]): void {
        for (const v of data) {
            this.enqOne(v);
        }
    }

    /**
     * Obtains the oldest element (FIFO). May throw an exception if a buffer underrun occurs.
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
     * Obtains the oldest element (FIFO) without removing it. Throws an exception if a buffer is
     * empty. Before calling this method, make sure that `size > 0`.
     */
    get top(): T {
        if (this.size === 0) {
            throw new Error("Ringbuffer underrun");
        }

        return this.buffer[this.tail];
    }

    /**
     * Obtains the latest element (LIFO) without removing it. Throws an exception if a buffer is
     * empty. Before calling this method, make sure that `size > 0`.
     */
    get bottom(): T {
        if (this.size === 0) {
            throw new Error("Ringbuffer underrun");
        }

        let previous = this.head - 1;
        if (previous < 0) {
            previous = this.capacity - 1;
        }
        return this.buffer[previous];
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
         * @param m_buffer - `Ringbuffer` to iterate over.
         * @param m_index - Start index.
         */
        constructor(private readonly m_buffer: RingBuffer<T>, private m_index: number = 0) {}

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
 * An interface for a Timer class, that abstracts the basic functions of a Timer.
 *
 * @remarks
 * Implemented by SimpleTimer, SampledTimer, and MultiStageTimer.
 *
 * @internal
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
     * @param val - The timer's duration.
     */
    setValue(val: number | undefined): void;
}

/**
 * A simple timer that stores only the latest measurement.
 *
 * @internal
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
     * @param val - The timer's duration.
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
            const t = PerformanceTimer.now() - (this.m_currentValue ?? 0);
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
            const t = PerformanceTimer.now() - (this.m_currentValue ?? 0);
            return t;
        }
    }
}

/**
 * Simple statistics about the values in an array.
 *
 * @internal
 */
export interface Stats {
    /**
     * The lowest value in the array.
     */
    min: number;

    /**
     * The highest value in the array.
     */
    max: number;

    /**
     * The average duration of all values in the array.
     */
    avg: number;

    /**
     * The median duration of all values in the array.
     */
    median: number;

    /**
     * The 75th percentile median of all values in the array.
     */
    median75: number;

    /**
     * The 90th percentile median of all values in the array.
     */
    median90: number;

    /**
     * The 95th percentile median of all values in the array.
     */
    median95: number;

    /**
     * The 97th percentile median of all values in the array.
     */
    median97: number;

    /**
     * The 99th percentile median of all values in the array.
     */
    median99: number;

    /**
     * The 99.9th percentile median of all values in the array.
     */
    median999: number;

    /**
     * The number of values in the array.
     */
    numSamples: number;
}

/**
 * A timer that stores the last `n` samples in a ring buffer.
 *
 * @internal
 */
export class SampledTimer extends SimpleTimer {
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
     * The array of sampled values, its length cannot exceed `maxNumSamples`.
     */
    samples = new RingBuffer<number>(this.maxNumSamples);

    /**
     * Creates a `SampledTimer` instance. Must still be added to statistics if it should be logged!
     *
     * @param statistics - Statistics to use for management.
     * @param name - Name of the timer. Use colons to build a hierarchy.
     */
    constructor(public statistics: Statistics, readonly name: string) {
        super(statistics, name);
    }

    /**
     * Resets the timer and clears all of its historical values.
     * @override
     */
    reset() {
        super.reset();
        this.getStats();
        this.samples.clear();
        this.numResets++;
    }

    /**
     * Add a single measurement to the sample.
     *
     * @param val - A measurement to add.
     * @override
     */
    setValue(val: number | undefined) {
        super.setValue(val);

        if (val !== undefined) {
            this.samples.enqOne(val);
        }
    }

    /**
     * Updates the `min`, `max`, `avg`, and `median` values. Currently, this function is expensive,
     * as it requires a copy of the sampled values.
     */
    getStats(): Stats | undefined {
        return computeArrayStats(this.samples.asArray());
    }
}

/**
 * Only exported for testing
 * @ignore
 *
 * @remarks
 * Compute the [[ArrayStats]] for the passed in array of numbers.
 *
 * @param {number[]} samples Array containing sampled values. Will be modified (!) by sorting the
 *      entries.
 * @returns {(Stats | undefined)}
 *
 * @internal
 */
export function computeArrayStats(samples: number[]): Stats | undefined {
    if (samples.length === 0) {
        return undefined;
    }

    samples.sort((a: number, b: number) => {
        return a - b;
    });

    const min: number = samples[0];
    const max: number = samples[samples.length - 1];
    let median: number;
    let median75: number;
    let median90: number;
    let median95: number;
    let median97: number;
    let median99: number;
    let median999: number;

    if (samples.length === 1) {
        median75 = median90 = median95 = median97 = median99 = median999 = median = samples[0];
    } else if (samples.length === 2) {
        median = samples[0] * 0.5 + samples[1] * 0.5;
        median75 = median90 = median95 = median97 = median99 = median999 = samples[1];
    } else {
        const mid = Math.floor(samples.length / 2);
        median =
            samples.length % 2 === 0 ? samples[mid - 1] * 0.5 + samples[mid] * 0.5 : samples[mid];

        const mid75 = Math.round(samples.length * 0.75) - 1;
        median75 = samples[mid75];
        const mid90 = Math.round(samples.length * 0.9) - 1;
        median90 = samples[mid90];
        const mid95 = Math.round(samples.length * 0.95) - 1;
        median95 = samples[mid95];
        const mid97 = Math.round(samples.length * 0.97) - 1;
        median97 = samples[mid97];
        const mid99 = Math.round(samples.length * 0.99) - 1;
        median99 = samples[mid99];
        const mid999 = Math.round(samples.length * 0.999) - 1;
        median999 = samples[mid999];
    }

    let sum = 0;

    for (let i = 0, l = samples.length; i < l; i++) {
        sum += samples[i];
    }

    const avg = sum / samples.length;

    return {
        min,
        max,
        avg,
        median,
        median75,
        median90,
        median95,
        median97,
        median99,
        median999,
        numSamples: samples.length
    };
}

/**
 * Only exported for testing
 * @ignore
 *
 * @remarks
 * Compute the averages for the passed in array of numbers.
 *
 * @param {number[]} samples Array containing sampled values.
 * @returns {(Stats | undefined)}
 *
 * @internal
 */
export function computeArrayAverage(samples: number[]): number | undefined {
    if (samples.length === 0) {
        return undefined;
    }

    let sum = 0;

    for (let i = 0, l = samples.length; i < l; i++) {
        sum += samples[i];
    }

    const avg = sum / samples.length;

    return avg;
}

/**
 * Measures a sequence of connected events, such as multiple processing stages in a function.
 *
 * @remarks
 * Each stage is identified with a timer name, that must be a valid timer in the statistics
 * object. Additionally, all timers within a `MultiStageTimer` must be unique.
 *
 * Internally, the `MultiStageTimer` manages a list of timers where at the end of each stage,
 * one timer stops and the next timer starts.
 *
 * @internal
 */
export class MultiStageTimer {
    private currentStage: string | undefined;

    /**
     * Defines the `MultiStageTimer` with a list of timer names that represent its stages.
     *
     * @param statistics - The statistics object that manages the timers.
     * @param name - Name of this `MultiStageTimer`.
     * @param stages - List of timer names.
     */
    constructor(
        private readonly statistics: Statistics,
        readonly name: string,
        public stages: string[]
    ) {
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

        return this.statistics.getTimer(this.stages[0]).value ?? -1;
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
     * @param stage - The next stage to start.
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
 * Manages a set of timers.
 *
 * @remarks
 * The main objective of `Statistics` is to log these timers. You can
 * disable statistics to minimize their impact on performance.
 *
 * @internal
 */
export class Statistics {
    private readonly timers: Map<string, Timer>;

    private readonly nullTimer: Timer;

    /**
     * Sets up a group of timers.
     *
     * @param name - The statistics name, for logging purposes.
     * @param enabled - If `false`, the timers do not measure the performance.
     */
    constructor(public name?: string, public enabled = false) {
        this.timers = new Map<string, Timer>();
        this.nullTimer = new SimpleTimer(this, "<null>");
    }

    /**
     * Adds a timer, based on the name specified.
     *
     * @param name - The timer's name; must be unique.
     */
    createTimer(name: string, keepSamples = true): Timer {
        const timer = keepSamples ? new SampledTimer(this, name) : new SimpleTimer(this, name);

        return this.addTimer(timer);
    }

    /**
     * Adds the timer specified.
     *
     * @param timer - The timer's name, which must be unique within this statistics object.
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
     * @param name - The timer's name.
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
     * @param name - The timer's name.
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
     * @param header - Optional header line.
     * @param footer - Optional footer line.
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
                const simpleStats = timer.getStats();
                if (simpleStats !== undefined) {
                    s +=
                        `  [ min=${print(simpleStats.min)}, max=${print(simpleStats.max)}, ` +
                        `avg=${print(simpleStats.avg)}, med=${print(simpleStats.median)}, ` +
                        `med95=${print(simpleStats.median95)}, med99=${print(
                            simpleStats.median99
                        )}, ` +
                        `N=${print(simpleStats.numSamples)} ]`;
                }
            }
            logger.log(s);
        });

        if (footer !== undefined) {
            logger.log(footer);
        }
    }
}

/**
 * Class containing all counters, timers and events of the current frame.
 *
 * @internal
 */
export class FrameStats {
    readonly entries: Map<string, number> = new Map();
    messages?: string[] = undefined;

    /**
     * Retrieve the value of the performance number.
     *
     * @param name - Name of the performance number.
     * @returns The value of the performance number or `undefined` if it has not been declared by
     *      `setValue` before.
     */
    getValue(name: string): number | undefined {
        return this.entries.get(name);
    }

    /**
     * Set the value of the performance number.
     *
     * @param name - Name of the performance number.
     * @param name - New value of the performance number.
     */
    setValue(name: string, value: number) {
        this.entries.set(name, value);
    }

    /**
     * Add a value to the current value of the performance number. If the performance is not known,
     * it will be initialized with `value`.
     *
     * @param name - Name of the performance number.
     * @param name - Value to be added to the performance number.
     */
    addValue(name: string, value: number) {
        const oldValue = this.entries.get(name);
        this.entries.set(name, value + (oldValue === undefined ? 0 : oldValue));
    }

    /**
     * Add a text message to the frame, like "Font XYZ has been loaded"
     *
     * @param message - The message to add.
     */
    addMessage(message: string) {
        if (this.messages === undefined) {
            this.messages = [];
        }
        this.messages.push(message);
    }

    /**
     * Reset all known performance values to `0` and the messages to `undefined`.
     */
    reset() {
        this.entries.forEach((value: number, name: string) => {
            this.entries.set(name, 0);
        });

        this.messages = undefined;
    }
}

/**
 * @ignore
 * Only exported for testing.
 *
 * @remarks
 * Instead of passing around an array of objects, we store the frame statistics as an object of
 * arrays. This allows convenient computations from {@link RingBuffer},
 */
export class FrameStatsArray {
    readonly frameEntries: Map<string, RingBuffer<number>> = new Map();
    readonly messages: RingBuffer<string[] | undefined>;

    constructor(readonly capacity: number = 0) {
        this.messages = new RingBuffer<string[] | undefined>(capacity);
    }

    get length(): number {
        return this.messages.size;
    }

    reset() {
        this.frameEntries.forEach((buffer: RingBuffer<number>, name: string) => {
            buffer.clear();
        });
        this.messages.clear();
    }

    addFrame(frameStats: FrameStats) {
        const currentSize = this.length;
        const frameEntries = this.frameEntries;

        frameStats.entries.forEach((value: number, name: string) => {
            let buffer = frameEntries.get(name);

            if (buffer === undefined) {
                // If there is a buffer that has not been known before, add it to the known buffers,
                // fill it up with with 0 to the size of all the other buffers to make them of equal
                // size to make PerfViz happy.
                buffer = new RingBuffer<number>(this.capacity);
                for (let i = 0; i < currentSize; i++) {
                    buffer.enqOne(0);
                }
                this.frameEntries.set(name, buffer);
            }
            buffer.enqOne(value);
        });

        this.messages.enq(frameStats.messages);
    }

    /**
     * Prints all values to the console.
     */
    log() {
        let maxNameLength = 0;
        this.frameEntries.forEach((buffer: RingBuffer<number>, name: string) => {
            maxNameLength = Math.max(maxNameLength, name.length);
        });

        // simple printing function for number limits the number of decimal points.
        const print = (v: number | undefined) => {
            return v !== undefined ? v.toFixed(5) : "?";
        };

        this.frameEntries.forEach((buffer: RingBuffer<number>, name: string) => {
            let s = name + ": " + " ".repeat(maxNameLength - name.length);

            const simpleStats = computeArrayStats(buffer.asArray());
            if (simpleStats !== undefined) {
                s +=
                    `  [ min=${print(simpleStats.min)}, max=${print(simpleStats.max)}, ` +
                    `avg=${print(simpleStats.avg)}, med=${print(simpleStats.median)}, ` +
                    `med95=${print(simpleStats.median95)}, med99=${print(simpleStats.median99)}, ` +
                    `N=${print(simpleStats.numSamples)} ]`;
            }
            logger.log(s);
        });
    }
}

/**
 * Chrome's MemoryInfo interface.
 */
interface ChromeMemoryInfo {
    totalJSHeapSize: number;
    usedJSHeapSize: number;
    jsHeapSizeLimit: number;
}

/**
 * @internal
 */
export interface SimpleFrameStatistics {
    configs: Map<string, string>;
    appResults: Map<string, number>;
    frames: Map<string, number | number[]>;
    messages: Array<string[] | undefined>;
    frameStats?: Map<string, Stats | undefined>;
    zoomLevelLabels?: string[];
    zoomLevelData?: Map<string, number | number[]>;
}

/**
 * Performance measurement central.
 *
 * @remarks
 * Maintains the current. Implemented as an instance for easy access.
 *
 * {@link FrameStats}, which holds all individual performance numbers.
 *
 * @internal
 */
export class PerformanceStatistics {
    /**
     * Returns `true` when the maximum number of storable frames is reached.
     *
     * @readonly
     * @type {boolean}
     * @memberof PerformanceStatistics
     */
    get isFull(): boolean {
        return this.m_frameEvents.length >= this.maxNumFrames;
    }

    /**
     * Global instance to the instance. The current instance can be overridden by creating a new
     * `PerformanceStatistics`.
     */
    static get instance(): PerformanceStatistics {
        if (PerformanceStatistics.m_instance === undefined) {
            PerformanceStatistics.m_instance = new PerformanceStatistics(false, 0);
        }
        return PerformanceStatistics.m_instance;
    }

    private static m_instance?: PerformanceStatistics = undefined;

    /**
     * Current frame statistics. Contains all values for the current frame. Will be cleared when
     * [[PerformanceStatistics#storeFrameInfo]] is called.
     *
     * @type {FrameStats}
     * @memberof PerformanceStatistics
     */
    readonly currentFrame: FrameStats = new FrameStats();

    /**
     * @ignore
     * Only exported for testing.
     *
     * Return the array of frame events.
     */
    get frameEvents(): FrameStatsArray {
        return this.m_frameEvents;
    }

    /**
     * Additional results stored for the current application run, not per frame. Only the last value
     * is stored.
     *
     * @type {(Map<string, number>)}
     */
    readonly appResults: Map<string, number> = new Map();

    /**
     * Additional configuration values stored for the current application run, not per frame. Only
     * the last value is stored.
     *
     * @type {(Map<string, string>)}
     * @memberof PerformanceStatistics
     */
    readonly configs: Map<string, string> = new Map();

    // Current array of frame events.
    private readonly m_frameEvents: FrameStatsArray;

    /**
     * Creates an instance of PerformanceStatistics. Overrides the current `instance`.
     *
     * @param {boolean} [enabled=true] If `false` the performance values will not be stored.
     * @param {number} [maxNumFrames=1000] The maximum number of frames that are to be stored.
     * @memberof PerformanceStatistics
     */
    constructor(public enabled = true, public maxNumFrames = 1000) {
        PerformanceStatistics.m_instance = this;
        this.m_frameEvents = new FrameStatsArray(maxNumFrames);
    }

    /**
     * Clears all settings, all stored frame events as well as the current frame values.
     *
     * @memberof PerformanceStatistics
     */
    clear() {
        this.clearFrames();
        this.configs.clear();
        this.appResults.clear();
    }

    /**
     * Clears only all stored frame events as well as the current frame values.
     *
     * @memberof PerformanceStatistics
     */
    clearFrames() {
        this.m_frameEvents.reset();
        this.currentFrame.reset();
    }

    /**
     * Add the render state information from [[THREE.WebGLInfo]] to the current frame.
     * @param {THREE.WebGLInfo} webGlInfo
     */
    addWebGLInfo(webGlInfo: THREE.WebGLInfo) {
        if (webGlInfo.render !== undefined) {
            this.currentFrame.setValue(
                "gl.numCalls",
                webGlInfo.render.calls === null ? 0 : webGlInfo.render.calls
            );
            this.currentFrame.setValue(
                "gl.numPoints",
                webGlInfo.render.points === null ? 0 : webGlInfo.render.points
            );
            this.currentFrame.setValue(
                "gl.numLines",
                webGlInfo.render.lines === null ? 0 : webGlInfo.render.lines
            );
            this.currentFrame.setValue(
                "gl.numTriangles",
                webGlInfo.render.triangles === null ? 0 : webGlInfo.render.triangles
            );
        }
        if (webGlInfo.memory !== undefined) {
            this.currentFrame.setValue(
                "gl.numGeometries",
                webGlInfo.memory.geometries === null ? 0 : webGlInfo.memory.geometries
            );
            this.currentFrame.setValue(
                "gl.numTextures",
                webGlInfo.memory.textures === null ? 0 : webGlInfo.memory.textures
            );
        }
        if (webGlInfo.programs !== undefined) {
            this.currentFrame.setValue(
                "gl.numPrograms",
                webGlInfo.programs === null ? 0 : webGlInfo.programs.length
            );
        }
    }

    /**
     * Add memory statistics to the current frame if available.
     * @note Currently only supported on Chrome
     */
    addMemoryInfo() {
        if (window !== undefined && window.performance !== undefined) {
            const memory = (window.performance as any).memory as ChromeMemoryInfo;
            if (memory !== undefined) {
                this.currentFrame.setValue("memory.totalJSHeapSize", memory.totalJSHeapSize);
                this.currentFrame.setValue("memory.usedJSHeapSize", memory.usedJSHeapSize);
                this.currentFrame.setValue("memory.jsHeapSizeLimit", memory.jsHeapSizeLimit);
            }
        }
    }

    /**
     * Stores the current frame events into the array of events and clears all values.
     *
     * @returns {boolean} Returns `false` if the maximum number of storable frames has been reached.
     * @memberof PerformanceStatistics
     */
    storeAndClearFrameInfo(): boolean {
        if (this.m_frameEvents.length >= this.maxNumFrames) {
            return false;
        }

        this.m_frameEvents.addFrame(this.currentFrame);

        this.currentFrame.reset();
        return true;
    }

    /**
     * Logs all values to the logger.
     *
     * @param header - Optional header line.
     * @param footer - Optional footer line.
     */
    log(header?: string, footer?: string) {
        logger.log(header !== undefined ? header : "PerformanceStatistics");

        const appResults = this.appResults;
        appResults.forEach((value: number, name: string) => {
            logger.log(name, value);
        });
        const configs = this.configs;
        configs.forEach((value: string, name: string) => {
            logger.log(name, value);
        });
        this.m_frameEvents.log();

        if (footer !== undefined) {
            logger.log(footer);
        }
    }

    /**
     * Convert to a plain object that can be serialized. Required to copy the test results over to
     * nightwatch.
     */
    getAsPlainObject(onlyLastFrame: boolean = false): any {
        const appResults: any = {};
        const configs: any = {};
        const frames: any = {};
        const plainObject: any = {
            configs,
            appResults,
            frames
        };

        const appResultValues = this.appResults;
        appResultValues.forEach((value: number, name: string) => {
            appResults[name] = value;
        });

        const configValues = this.configs;
        configValues.forEach((value: string, name: string) => {
            configs[name] = value;
        });

        if (onlyLastFrame) {
            for (const [name, buffer] of this.m_frameEvents.frameEntries) {
                frames[name] = buffer.bottom;
            }
        } else {
            for (const [name, buffer] of this.m_frameEvents.frameEntries) {
                frames[name] = buffer.asArray();
            }
        }
        plainObject.messages = this.m_frameEvents.messages.asArray();
        return plainObject;
    }

    /**
     * Convert the last frame values to a plain object that can be serialized. Required to copy the
     * test results over to nightwatch.
     */
    getLastFrameStatistics(): any {
        return this.getAsPlainObject(true);
    }

    /**
     * Convert to a plain object that can be serialized. Required to copy the test results over to
     * nightwatch.
     */
    getAsSimpleFrameStatistics(onlyLastFrame: boolean = false): SimpleFrameStatistics {
        const configs: Map<string, string> = new Map();
        const appResults: Map<string, number> = new Map();
        const frames: Map<string, number | number[]> = new Map();

        const simpleStatistics: SimpleFrameStatistics = {
            configs,
            appResults,
            frames,
            messages: this.m_frameEvents.messages.asArray()
        };

        const appResultValues = this.appResults;
        appResultValues.forEach((value: number, name: string) => {
            appResults.set(name, value);
        });

        const configValues = this.configs;
        configValues.forEach((value: string, name: string) => {
            configs.set(name, value);
        });

        if (onlyLastFrame) {
            for (const [name, buffer] of this.m_frameEvents.frameEntries) {
                frames.set(name, buffer.bottom);
            }
        } else {
            for (const [name, buffer] of this.m_frameEvents.frameEntries) {
                frames.set(name, buffer.asArray());
            }
        }
        return simpleStatistics;
    }
}
