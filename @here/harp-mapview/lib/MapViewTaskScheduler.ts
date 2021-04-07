/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { PerformanceTimer, Task, TaskQueue } from "@here/harp-utils";
import THREE = require("three");

import { TileTaskGroups } from "./MapView";
import { PerformanceStatistics } from "./Statistics";

const DEFAULT_MAX_FPS = 60;
const DEFAULT_PROCESSING_ESTIMATE_TIME = 2;
const UPDATE_EVENT = { type: "update" };

export class MapViewTaskScheduler extends THREE.EventDispatcher {
    private readonly m_taskQueue: TaskQueue;
    private m_throttlingEnabled: boolean = false;

    constructor(private m_maxFps: number = DEFAULT_MAX_FPS) {
        super();
        this.m_taskQueue = new TaskQueue({
            groups: [TileTaskGroups.FETCH_AND_DECODE, TileTaskGroups.CREATE],
            prioSortFn: (a: Task, b: Task) => {
                return a.getPriority() - b.getPriority();
            }
        });
        this.maxFps = m_maxFps;
    }

    set maxFps(fps: number) {
        this.m_maxFps = fps <= 0 ? DEFAULT_MAX_FPS : fps;
    }

    get maxFps(): number {
        return this.m_maxFps;
    }

    get taskQueue() {
        return this.m_taskQueue;
    }

    get throttlingEnabled(): boolean {
        return this.m_throttlingEnabled === true;
    }

    set throttlingEnabled(enabled: boolean) {
        this.m_throttlingEnabled = enabled;
    }

    /**
     * Sends a request to the [[MapView]] to redraw the scene.
     */
    requestUpdate() {
        this.dispatchEvent(UPDATE_EVENT);
    }

    /**
     * Processes the pending Tasks of the underlying [[TaskQueue]]
     * !! This should run at the end of the renderLoop, so the calculations of the available
     * frame time are better estimated
     *
     * @param frameStartTime the start time of the current frame, is used to calculate the
     * still available time in the frame to process Tasks
     *
     */
    processPending(frameStartTime: number) {
        const stats = PerformanceStatistics.instance;
        const currentFrameEvent = stats.enabled ? stats.currentFrame : undefined;
        let startTime: number | undefined;
        if (stats.enabled) {
            startTime = PerformanceTimer.now();
        }

        //update the task queue, to remove expired and sort with priority
        this.m_taskQueue.update();
        let numItemsLeft = this.taskQueue.numItemsLeft();
        currentFrameEvent?.setValue("TaskScheduler.numPendingTasks", numItemsLeft);

        if (this.throttlingEnabled) {
            // get the available time in this frame to achieve a max fps rate
            let availableTime = this.spaceInFrame(frameStartTime);
            // get some buffer to balance the inaccurate estimates
            availableTime = availableTime > 2 ? availableTime - 2 : availableTime;
            currentFrameEvent?.setValue("TaskScheduler.estimatedAvailableTime", availableTime);

            let counter = 0;
            // check if ther is still time available and tasks left
            while (availableTime > 0 && numItemsLeft > 0) {
                counter++;
                // create a processing condition for the tasks
                function shouldProcess(task: Task) {
                    // if there is a time estimate use it, otherwise default to 1 ms
                    // TODO: check whats a sane default, 1 seems to do it for now
                    availableTime -=
                        task.estimatedProcessTime?.() ?? DEFAULT_PROCESSING_ESTIMATE_TIME;
                    // always process at least 1 Task, so in the worst case the fps over tiles
                    // paradigma is sacrificed to not have an empty screen
                    if (availableTime > 0 || counter === 1) {
                        return true;
                    }
                    return false;
                }

                // process the CREATE tasks first, as they will have a faster result on the
                // visual outcome and have already spend time in the application during
                // fetching and decoding
                // fetching has lower priority as it wont make to much of a difference if not
                // called at the exact frame, and the tile might expire in the next anyway
                [TileTaskGroups.CREATE, TileTaskGroups.FETCH_AND_DECODE].forEach(tag => {
                    if (this.m_taskQueue.numItemsLeft(tag)) {
                        //TODO:
                        // * if one tag task does not fit another might, how to handle this?
                        // *    ** what if a task of another group could fit instead
                        // * whats the average of time we have here at this point in the programm?
                        this.m_taskQueue.processNext(tag, shouldProcess);
                    }
                });
                numItemsLeft = this.m_taskQueue.numItemsLeft();
            }
            // if there is tasks left in the TaskQueue, request an update to be able to process them
            // in a next frame
            numItemsLeft = this.m_taskQueue.numItemsLeft();
            if (numItemsLeft > 0) {
                currentFrameEvent?.setValue(
                    "TaskScheduler.pendingTasksNotYetProcessed",
                    numItemsLeft
                );
                this.requestUpdate();
            }
        } else {
            //if throttling is disabled, process all pending tasks
            this.m_taskQueue.processNext(
                TileTaskGroups.CREATE,
                undefined,
                this.m_taskQueue.numItemsLeft(TileTaskGroups.CREATE)
            );
            this.m_taskQueue.processNext(
                TileTaskGroups.FETCH_AND_DECODE,
                undefined,
                this.m_taskQueue.numItemsLeft(TileTaskGroups.FETCH_AND_DECODE)
            );
        }

        if (stats.enabled) {
            currentFrameEvent?.setValue(
                "TaskScheduler.pendingTasksTime",
                PerformanceTimer.now() - startTime!
            );
        }
    }

    /**
     * Removes all tasks that have been queued.
     */
    clearQueuedTasks() {
        this.m_taskQueue.clear();
    }

    private spaceInFrame(frameStartTime: number): number {
        const passedTime = (performance || Date).now() - frameStartTime;
        return Math.max(1000 / this.m_maxFps - passedTime, 0);
    }
}
