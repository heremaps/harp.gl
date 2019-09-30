/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from "fs";

export interface PerformanceTestStats {
    min: number;
    sum: number;
    avg: number;
    med: number;
    med95: number;
    repeats: number;
}

export interface PerformanceTestResultEntry {
    name: string;
    stats: PerformanceTestStats;
}

export type PerformanceTestResults = PerformanceTestResultEntry[];

export interface PerformanceTestSample {
    name: string;
    time: number;
}

/**
 * More or less portable way to get best performance counter.
 *
 * Somehow, it appears that `process.hrtime()` has better real resolution
 * than `performance.now()`, or i can't into math ;)
 *
 * @returns function that gets current time in milliseconds
 */
function getNowFunc() {
    if (typeof process !== "undefined" && typeof process.hrtime === "function") {
        return () => {
            const t = process.hrtime();
            return t[0] * 1000 + t[1] / 1000000;
        };
    }
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
        return () => performance.now();
    }

    // fall back to Date.getTime()
    return () => {
        return new Date().getTime();
    };
}

export function calculateStats(samples: number[]): PerformanceTestStats {
    const repeats = samples.length;
    let sum = 0;
    let min = Number.MAX_VALUE;
    for (const sample of samples) {
        sum += sample;
        min = Math.min(sample, min);
    }
    const avg = sum / repeats;

    samples.sort();
    const middle = (repeats - 1) / 2;
    const med = (samples[Math.floor(middle)] + samples[Math.ceil(middle)]) / 2;

    const mid95 = Math.floor(samples.length * 0.95);
    const med95 = samples[mid95];

    return { min, sum, avg, med, med95, repeats };
}

/**
 * Get current time in milliseconds.
 */
export const getCurrentTime = getNowFunc();

/**
 * Measure time performance of code.
 *
 * Executes `test` code `repeats` times and measures: `min`, `med` (median), `sum` and `avg`
 * (average) execution times.
 *
 * [[performance.now]] is used as time provider, with fallback to `new Date().getTime()`.
 *
 * Measurement reports are saved for later and logged after all tests (if in Mocha environment). See
 * [[reportPerformanceAndReset]].
 *
 * Example:
 *
 *     it('performance test', () => {
 *         measurePerformanceSync("Array/grow", 50, () => {
 *             // the code under test
 *             // will be executed 50 times ----^^
 *         });
 *     });
 *
 * Will print report like this after all tests:
 *
 *     #performance: Array/grow: min=1 med=2 avg=1.8 sum=72 (50 repeats)
 *
 * @param name name of performance test
 * @param repeats number of test repeats
 * @param test tested code
 */

export function measurePerformanceSync(name: string, repeats: number, test: () => void) {
    if (repeats < 1) {
        throw new Error("measurePerformanceSync: repeats must be positive number");
    }

    // warmup
    for (let i = 0; i < repeats / 2; i++) {
        test();
    }

    // actual test
    const samples = new Array(repeats);
    for (let i = 0; i < repeats; i++) {
        const sampleStart = getCurrentTime();
        test();
        const sampleEnd = getCurrentTime();
        const sample = sampleEnd - sampleStart;
        samples[i] = sample;
    }

    const entry = { name, stats: calculateStats(samples) };
    measurePerformanceResults.push(entry);
    return entry;
}

/**
 * Measure throughput performance of code.
 *
 * Executes `test` code for `timeout` milliseconds and reports throughput and aggregated times:
 * `min`, `med` (median), `sum` and `avg` (average) execution times.
 *
 * [[performance.now]] is used as time provider, with fallback to `new Date().getTime()`.
 *
 * Measurement reports are saved for later and logged after all tests (if in Mocha environment). See
 * [[reportPerformanceAndReset]].
 *
 * Example:
 *
 *     it('throughput test', () => {
 *         measureThroughputSync("Array/grow", 100, () => {
 *             // the code under test
 *             // will be executed for 100 milliseconds ----^^
 *         });
 *     });
 *
 * Will print report like this after all tests:
 *
 *     #performance: Array/grow: min=1 med=2 avg=1.8 sum=72 repeats=123 throughput=1242/s
 *
 * @param name name of performance test
 * @param repeats number of test repeats
 * @param test tested code
 */
export function measureThroughputSync(name: string, testDuration: number, test: () => void) {
    if (testDuration < 10) {
        throw new Error("measureThroughputSync: invalid testDuration");
    }

    let now = getCurrentTime();

    // warmup
    const warmUpTimeout = now + testDuration / 2;
    while (now < warmUpTimeout) {
        test();
        now = getCurrentTime();
    }

    // actual test
    const samples: number[] = [];
    const testStart = getCurrentTime();
    const testTimeout = testStart + testDuration;
    while (now < testTimeout) {
        const sampleStart = getCurrentTime();
        test();
        const sampleEnd = (now = getCurrentTime());
        const sample = sampleEnd - sampleStart;
        samples.push(sample);
    }

    const entry = { name, stats: calculateStats(samples) };
    measurePerformanceResults.push(entry);
    return entry;
}

export function addPerformanceResultsSample(name: string, time: number) {
    measurePerformanceSamples.push({ name, time });
}

/**
 *
 */
export function reportPerformanceResults(
    results: PerformanceTestResults,
    baseline?: PerformanceTestResults
) {
    for (const entry of results) {
        const name = entry.name;

        const baseLineEntry =
            baseline !== undefined ? baseline.find(e => e.name === name) : undefined;
        if (baseLineEntry) {
            reportPerformanceEntryWithBaseline(entry, baseLineEntry);
        } else {
            reportPerformanceEntry(entry);
        }
    }
}

function readableNum(b: number, unit: string = "ms") {
    if (Math.abs(b) > 100) {
        return b.toFixed(2) + unit;
    } else {
        return (
            Number(b)
                .toFixed(4)
                .replace(/(\.?)0+$/, "") + unit
        );
    }
}

function reportStatsEntry(name: string, obj: { [name: string]: string | number }) {
    const tags = Object.keys(obj)
        .map(key => `${key}=${obj[key]}`)
        .join(" ");
    // tslint:disable-next-line:no-console
    console.log(`#performance ${name}\n  ${tags}`);
}

function calculateThroughPutPerSeconds(entry: PerformanceTestStats) {
    return entry.repeats / (entry.sum / 1000);
}
export function reportPerformanceEntry(entry: PerformanceTestResultEntry) {
    const name = entry.name;
    const tags: { [name: string]: string | number } = {
        min: readableNum(entry.stats.min),
        sum: readableNum(entry.stats.med),
        avg: readableNum(entry.stats.avg),
        med: readableNum(entry.stats.med),
        med95: readableNum(entry.stats.med95),
        repeats: entry.stats.repeats,
        throughput: readableNum(calculateThroughPutPerSeconds(entry.stats), "/s")
    };
    reportStatsEntry(name, tags);
}

export function reportPerformanceEntryWithBaseline(
    entry: PerformanceTestResultEntry,
    baseLineEntry: PerformanceTestResultEntry
) {
    const currentStats = entry.stats;
    const baseseLineStats = baseLineEntry.stats;

    function compare(current: number, baseline: number, unit: string = "ms") {
        const ratio = Math.round((current / baseline) * 10000 - 10000) / 100;
        const marker = Math.abs(ratio) < 0.1 ? "±" : ratio < 0 ? "-" : "+";
        if (current === baseline) {
            return `${readableNum(current, unit)}`;
        }

        return (
            `${readableNum(current, unit)} ` +
            `(${marker}${readableNum(Math.abs(ratio), "%")} vs ${readableNum(baseline, unit)})`
        );
    }

    const name = entry.name;
    const tags: { [name: string]: string | number } = {
        min: compare(currentStats.min, baseseLineStats.min),
        sum: compare(currentStats.sum, baseseLineStats.sum),
        avg: compare(currentStats.avg, baseseLineStats.avg),
        med: compare(currentStats.med, baseseLineStats.med),
        med95: compare(currentStats.med95, baseseLineStats.med95),
        repeats: compare(currentStats.repeats, baseseLineStats.repeats, ""),
        throughput: compare(
            calculateThroughPutPerSeconds(currentStats),
            calculateThroughPutPerSeconds(baseseLineStats),
            "/s"
        )
    };
    reportStatsEntry(name, tags);
}

export function getPerformanceTestResults(): PerformanceTestResults {
    const mergedSamplesMap = measurePerformanceSamples.reduce((results, sample) => {
        let sampleArray = results.get(sample.name);
        if (sampleArray === undefined) {
            sampleArray = [];
            results.set(sample.name, sampleArray);
        }
        sampleArray.push(sample.time);
        return results;
    }, new Map<string, number[]>());

    const mergedSamplesResults = Array.from(mergedSamplesMap.entries()).map(entry => {
        const [name, samples] = entry;
        return { name, stats: calculateStats(samples) };
    });

    return [...measurePerformanceResults, ...mergedSamplesResults];
}

/**
 * Report and reset performance measurement results.
 *
 * Designed to be called after round of tests. Shows results of all performance tests executed by
 * [[measurePerformanceSync]] and [[measureThroughputSync]].
 *
 * It resets results afterwards.
 *
 * If baseline is available (`.profile-helper-baseline.json`, customized by `PROFILEHELPER_OUTPUT`_)
 * then this run results are compared to baseline
 *
 * If `PROFILEHELPER_COMMAND=baseline` resutls are saved as baseline.
 *
 * In `Mocha` runtime it is called automatically in global `after` callback.
 */
export function reportPerformanceAndReset() {
    const results = getPerformanceTestResults();
    const baseLine = loadBaseLineIfAvailable();
    reportPerformanceResults(results, baseLine);

    measurePerformanceSamples = [];
    measurePerformanceResults = [];

    saveBaselineIfRequested(results);
}

function saveBaselineIfRequested(results: PerformanceTestResults) {
    if (typeof window === "undefined" && process.env.PROFILEHELPER_COMMAND === "baseline") {
        const baselineFileName =
            process.env.PROFILEHELPER_OUTPUT || ".profile-helper-baseline.json";
        if (!baselineFileName) {
            return;
        }
        // tslint:disable-next-line:no-console
        console.log(`#performance saving baseline to ${baselineFileName}`);
        fs.writeFileSync(baselineFileName, JSON.stringify(results, null, 2), "utf-8");
    }
}

function loadBaseLineIfAvailable() {
    if (typeof window === "undefined") {
        const baselineFileName =
            process.env.PROFILEHELPER_OUTPUT || ".profile-helper-baseline.json";
        if (!baselineFileName || !fs.existsSync(baselineFileName)) {
            return undefined;
        }
        // tslint:disable-next-line:no-console
        console.log(`#performance loading baseline from ${baselineFileName}`);
        return JSON.parse(fs.readFileSync(baselineFileName, "utf-8"));
    }
}

/**
 * Report call.
 *
 * Convenience utility to be used temporarily in development to confirm expectations about number
 * of calls when measuring performance.
 *
 * Call counts are logged after all tests (if in Mocha environment). See
 * [[reportCallCountsAndReset]].
 *
 * Usage:
 *
 *     class Foo {
 *         push() {
 *             countCall("Foo#bar")
 *         }
 *     }
 *
 * It reports following after all tests:
 *
 *     #countCall: Foo#push called=123
 */
export function countCall(name: string, delta = 1) {
    let current = occurenceResults.get(name) || 0;
    current += delta;
    occurenceResults.set(name, current);
}

/**
 * Count function/method calls decorator.
 *
 * Convenience utility to be used temporarily in development to confirm expectations about number
 * of calls when measuring performance.
 *
 * Call counts are logged after all tests (if in Mocha environment). See
 * [[reportCallCountsAndReset]].
 *
 * Usage - basic functional composition:
 *
 *     const bar = countCalls("bar",  () => { ... })
 *
 * Usage - experimental TypeScript decorators:
 *
 *     class Foo {
 *         @countCalls()
 *         push() {}
 *     }
 *
 * It reports following after execution of all tests:
 *
 *     ProfileHelper: Foo#push called=123
 *     ProfileHelper: bar called=1111
 */
export function countCalls<T extends (...args: any[]) => any>(name: string, fun?: T): T;
export function countCalls<T extends (...args: any[]) => any>(fun?: T): T;
export function countCalls(): MethodDecorator;

export function countCalls(): any {
    let fun: ((...args: any[]) => any) | undefined;
    let name: string;
    if (arguments.length === 1 && typeof arguments[0] === "function") {
        fun = arguments[0] as () => any;
        name = fun.name;
    } else if (
        arguments.length === 2 &&
        typeof arguments[0] === "string" &&
        typeof arguments[1] === "function"
    ) {
        name = arguments[0];
        fun = arguments[1] as (...args: any[]) => any;
    }

    if (fun !== undefined) {
        // classic functional composition
        // const foo = countCalls(function foo() { })
        return function(this: any, ...args: any[]) {
            countCall(name);
            return fun!.call(this, args);
        };
    }

    // typescript member function decorator
    return function(this: any, target: any, key: string, descriptor: PropertyDescriptor) {
        if (descriptor === undefined) {
            descriptor = Object.getOwnPropertyDescriptor(target, key)!;
        }
        const originalMethod = descriptor.value;
        const methodName = target.constructor.name + "#" + originalMethod.name;

        descriptor.value = countCalls(methodName, originalMethod);
        return descriptor;
    };
}

/**
 * Report and reset [[countCall]] results.
 *
 * Designed to be called after round of tests. Shows counters from all [[countCall]] calls.
 *
 * It resets results afterwards.
 *
 * In `Mocha` runtime it is called automatically in global `after` callback.
 */
export function reportCallCountsAndReset() {
    occurenceResults.forEach((value, name) => {
        // tslint:disable-next-line:no-console
        console.log(`#countCall ${name}: called=${value}`);
    });
    occurenceResults.clear();
}

const occurenceResults = new Map<string, number>();

let measurePerformanceResults: PerformanceTestResultEntry[] = [];
let measurePerformanceSamples: PerformanceTestSample[] = [];

//
// in Mocha environment log all profile results after each test
//
if (typeof after === "function") {
    afterEach(() => {
        reportPerformanceAndReset();
        reportCallCountsAndReset();
    });
}
