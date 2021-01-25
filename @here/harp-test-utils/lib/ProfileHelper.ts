/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

import * as fs from "fs";

//
// `performance`, `PerformanceObserver`, ... are global in Browser environment, but only available
// from `perf_hooks` in node env.
//
if (typeof window === "undefined") {
    const perfHooks = require("perf_hooks");

    (global as any).performance = perfHooks.performance;
    (global as any).PerformanceObserver = perfHooks.PerformanceObserver;
    (global as any).PerformanceEntry = perfHooks.PerformanceEntry;
}

export interface PerformanceTestStats {
    min: number;
    sum: number;
    avg: number;
    med: number;
    med95: number;
    sd: number;
    repeats: number;
    gcTime?: number;
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
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
        return () => performance.now();
    }

    if (typeof process !== "undefined" && typeof process.hrtime === "function") {
        return () => {
            const t = process.hrtime();
            return t[0] * 1000 + t[1] / 1000000;
        };
    }

    // fall back to Date.getTime()
    return () => {
        return new Date().getTime();
    };
}

export function calculateStats(samples: number[], gcTime?: number): PerformanceTestStats {
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
    const sd = Math.sqrt(samples.reduce((r, sample) => r + (sample - avg) ** 2, 0) / (repeats - 1));

    return { min, sum, gcTime, avg, med, med95, sd, repeats };
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
 *     it('performance test', async () => {
 *         await measurePerformanceSync("Array/grow", 50, () => {
 *             // the code under test
 *             // will be executed 50 times ----^^
 *         });
 *     });
 *
 * Will print report like this after all tests:
 *
 *     #performance: Array/grow: min=1 med=2 avg=1.8 sum=72 (50 repeats)
 *
 * @param name - name of performance test
 * @param repeats - number of test repeats
 * @param test - tested code
 */

export async function measurePerformanceSync(name: string, repeats: number, test: () => void) {
    if (repeats < 1) {
        throw new Error("measurePerformanceSync: repeats must be positive number");
    }

    // warmup
    for (let i = 0; i < repeats / 2; i++) {
        test();
    }
    await sleepPromised(2);

    // actual test
    const samples = new Array(repeats);
    const testFun = () => {
        for (let i = 0; i < repeats; i++) {
            const sampleStart = getCurrentTime();
            test();
            const sampleEnd = getCurrentTime();
            const sample = sampleEnd - sampleStart;
            samples[i] = sample;
        }
    };

    const { gcTime } = await runAndMeasureGc(testFun);

    const entry = { name, stats: calculateStats(samples, gcTime) };
    measurePerformanceResults.push(entry);
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
 *     it('throughput test', async () => {
 *         await measureThroughputSync("Array/grow", 100, () => {
 *             // the code under test
 *             // will be executed for 100 milliseconds ----^^
 *         });
 *     });
 *
 * Will print report like this after all tests:
 *
 *     #performance: Array/grow: min=1 med=2 avg=1.8 sum=72 repeats=123 throughput=1242/s
 *
 * @param name - name of performance test
 * @param repeats - number of test repeats
 * @param test - tested code
 */
export async function measureThroughputSync(name: string, testDuration: number, test: () => void) {
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
    await sleepPromised(2);

    // actual test
    const samples: number[] = [];
    const testStart = getCurrentTime();
    const testTimeout = testStart + testDuration;
    const testFun = async () => {
        let samplesCount = 1;
        let lastSampleStart = (now = getCurrentTime());
        while (now < testTimeout) {
            test();
            const sampleEnd = (now = getCurrentTime());
            if (lastSampleStart === sampleEnd) {
                samplesCount++;
                continue;
            }
            if (samplesCount > 1) {
                const avgSampleDuration = (sampleEnd - lastSampleStart) / samplesCount;
                for (let i = 0; i < samplesCount; ++i) {
                    samples.push(avgSampleDuration);
                }
                samplesCount = 1;
            } else {
                const sampleDuration = sampleEnd - lastSampleStart;
                samples.push(sampleDuration);
            }
            lastSampleStart = sampleEnd;
        }
    };
    const { gcTime } = await runAndMeasureGc(testFun);

    const entry = { name, stats: calculateStats(samples, gcTime) };
    measurePerformanceResults.push(entry);
}

async function runAndMeasureGc(testFun: () => void): Promise<{ gcTime: number | undefined }> {
    if (typeof window !== "undefined") {
        return { gcTime: undefined };
    }
    let gcTime = 0;

    let perfStartEntry: PerformanceEntry | undefined;
    let perfEndEntry: PerformanceEntry | undefined;

    let perfCountersCollected = false;
    const obs = new PerformanceObserver((list, observer) => {
        if (perfStartEntry === undefined || perfEndEntry === undefined) {
            const markedEntries = list.getEntriesByType("mark");
            if (perfStartEntry === undefined) {
                perfStartEntry = markedEntries.find(e => e.name === "#test-start");
            }
            if (perfEndEntry === undefined) {
                perfEndEntry = markedEntries.find(e => e.name === "#test-end");
            }
            if (perfStartEntry === undefined || perfEndEntry === undefined) {
                return;
            }
        }
        const testStartMark = perfStartEntry.startTime;
        const testEndMark = perfEndEntry.startTime;

        const gcEntries = list.getEntriesByType("gc");
        for (const gcEntry of gcEntries) {
            if (gcEntry.startTime > testStartMark && gcEntry.startTime < testEndMark) {
                gcTime += gcEntry.duration;
            }
        }

        if (perfEndEntry) {
            perfCountersCollected = true;
        }
    });

    obs!.observe({ entryTypes: ["gc", "mark", "node"], buffered: true });

    performance.mark("#test-start");
    testFun();
    performance.mark("#test-end");

    // For some reason, in order to get `gc` entries, we need to force async flow before
    // disconnecting ...
    // ... and doesn't work with manually created promises, so we need to poll.
    await new Promise<void>(resolve => {
        const poll = () => {
            if (perfCountersCollected) {
                resolve();
            } else {
                setTimeout(poll, 1);
            }
        };
        poll();
    });
    obs!.disconnect();

    return { gcTime };
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

function readableNum(b: number | undefined, unit: string = "ms") {
    if (b === undefined) {
        return "n/a";
    }
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

function tagsToString(tags: { [name: string]: string | number }) {
    return Object.keys(tags)
        .map(key => `${key}=${tags[key]}`)
        .join(" ");
}

function calculateThroughPutPerSeconds(repeats: number, sum: number) {
    return repeats / (sum / 1000);
}
export function reportPerformanceEntry(entry: PerformanceTestResultEntry) {
    const name = entry.name;
    const stats = entry.stats;
    const mainTags: { [name: string]: string | number } = {
        min: readableNum(stats.min),
        sum: readableNum(stats.sum),
        throughput: readableNum(calculateThroughPutPerSeconds(stats.repeats, stats.sum), "/s"),
        repeats: stats.repeats
    };
    console.log(`#performance ${name}`);
    console.log(`  ${tagsToString(mainTags)}`);
    const averages = {
        avg: readableNum(stats.avg),
        sd: readableNum(stats.sd),
        med: readableNum(stats.med),
        med95: readableNum(stats.med95)
    };
    console.log(`  ${tagsToString(averages)}`);
    if (stats.gcTime !== undefined) {
        const gcAdjusted = {
            gcTime: readableNum(stats.gcTime),
            sumNoGc: readableNum(stats.sum - stats.gcTime),
            throughputNoGc: readableNum(
                calculateThroughPutPerSeconds(stats.repeats, stats.sum - stats.gcTime)
            )
        };
        console.log(`  ${tagsToString(gcAdjusted)}`);
    }
    console.log(``);
}

export function reportPerformanceEntryWithBaseline(
    entry: PerformanceTestResultEntry,
    baseLineEntry: PerformanceTestResultEntry
) {
    const currentStats = entry.stats;
    const baseseLineStats = baseLineEntry.stats;

    function compare(current: number, baseline: number, unit: string = "ms") {
        const ratio = Math.round((current / baseline) * 10000 - 10000) / 100;

        if (current === baseline) {
            return `${readableNum(current, unit)}`;
        }

        return (
            `${readableNum(current, unit)} ` +
            `(${readableNum(ratio, "%")} vs ${readableNum(baseline, unit)})`
        );
    }

    const name = entry.name;
    const mainTags: { [name: string]: string | number } = {
        min: compare(currentStats.min, baseseLineStats.min),
        sum: compare(currentStats.sum, baseseLineStats.sum),
        repeats: compare(currentStats.repeats, baseseLineStats.repeats, ""),
        throughput: compare(
            calculateThroughPutPerSeconds(currentStats.repeats, currentStats.sum),
            calculateThroughPutPerSeconds(baseseLineStats.repeats, baseseLineStats.sum),
            "/s"
        )
    };
    const averages = {
        avg: compare(currentStats.avg, baseseLineStats.avg),
        sd: compare(currentStats.sd, baseseLineStats.sd, ""),
        med: compare(currentStats.med, baseseLineStats.med),
        med95: compare(currentStats.med95, baseseLineStats.med95)
    };

    console.log(`#performance ${name}`);
    console.log(`  ${tagsToString(mainTags)}`);
    console.log(`  ${tagsToString(averages)}`);

    if (currentStats.gcTime !== undefined && baseseLineStats.gcTime !== undefined) {
        const gcAdjusted = {
            gcTime: compare(currentStats.gcTime, baseseLineStats.gcTime),
            sumNoGc: compare(
                currentStats.sum - currentStats.gcTime,
                baseseLineStats.sum - baseseLineStats.gcTime
            ),
            throughputNoGc: compare(
                calculateThroughPutPerSeconds(
                    currentStats.repeats,
                    currentStats.sum - currentStats.gcTime
                ),
                calculateThroughPutPerSeconds(
                    baseseLineStats.repeats,
                    baseseLineStats.sum - baseseLineStats.gcTime
                ),
                "/s"
            )
        };
        console.log(`  ${tagsToString(gcAdjusted)}`);
    }
    console.log("");
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
            process.env.PROFILEHELPER_OUTPUT ?? ".profile-helper-baseline.json";
        if (!baselineFileName) {
            return;
        }
        console.log(`#performance saving baseline to ${baselineFileName}`);
        fs.writeFileSync(baselineFileName, JSON.stringify(results, null, 2), "utf-8");
    }
}

function loadBaseLineIfAvailable() {
    if (typeof window === "undefined") {
        const baselineFileName =
            process.env.PROFILEHELPER_OUTPUT ?? ".profile-helper-baseline.json";
        if (!baselineFileName || !fs.existsSync(baselineFileName)) {
            return undefined;
        }
        console.log(`#performance loading baseline from ${baselineFileName}`);
        return JSON.parse(fs.readFileSync(baselineFileName, "utf-8"));
    }
}

function sleepPromised(time: number = 1): Promise<void> {
    return new Promise(resolve => {
        setTimeout(resolve, time);
    });
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
    let current = occurenceResults.get(name) ?? 0;
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
        return function (this: any, ...args: any[]) {
            countCall(name);
            return fun!.call(this, args);
        };
    }

    // typescript member function decorator
    return function (this: any, target: any, key: string, descriptor: PropertyDescriptor) {
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
    after(() => {
        reportPerformanceAndReset();
        reportCallCountsAndReset();
    });
}
