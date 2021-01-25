/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Task that can be added to the [[TaskQueue]]
 */
export interface Task {
    /**
     * The Function that will be executed when the [[Task]] is processed
     */
    execute: () => void;

    /**
     * The group by which similar tasks in the TaskQueue are combined
     */
    group: string;

    /**
     * A function to retrieve the priority of the [[Task]], with 0 being
     * the highest priority, and the first to be executed
     */
    getPriority: () => number;

    /**
     * An optional function that defines if a [[Task]] is alread expired
     * and therefore can be removed from the [[TaskQueue]]
     */
    isExpired?: () => boolean;

    /**
     * An optional function that returns an estimated process time,
     * this is not directly used by the [[TaskQueue]] but can be used
     * by an Task Scheduler to schedule the processing
     */
    estimatedProcessTime?: () => number;
}

export interface TaskQueueOptions {
    //TODO: Use the max length
    //maxLength?: number;
    /**
     * Groups to combine specific [[Task]]s in the [[TaskQueue]],
     * [[Task]]s can only be added to the [[TaskQueue]] if their group is available
     */
    groups: string[];

    /**
     * Optional function to sort the priority, if set, i will override the internal TaskQueue.sort
     * function.
     *
     * @remarks
     * Caution, the {@link TaskQueue} uses the last element in the Arrays first, so the
     * highest priorities should be ordered to the end
     */
    prioSortFn?: (a: Task, b: Task) => number;
}

/**
 * A Pull-TaskQueue sorted by priority and group-able {@link Task}s by {@link Task.group}.
 *
 * @remarks
 *
 * @example
 * Sample Usage
 * ```
 *  const taskQueue = new TaskQueue({
 *      group: ["group1"]
 *  })
 *  taskQueue.add({
 *     group: "group1",
 *     execute: () => {
 *         console.log("task of group1 executed");
 *     },
 *     getPrio: () => {
 *         return 0;
 *     }
 *   });
 *
 * taskQueue.update();
 * taskQueue.processNext("group1");
 *
 *  ```
 */
export class TaskQueue {
    private readonly m_taskLists: Map<string, Task[]> = new Map();

    constructor(private readonly m_options: TaskQueueOptions) {
        this.m_options.groups?.forEach(group => {
            this.m_taskLists.set(group, []);
        });
        if (this.m_options.prioSortFn) {
            this.sort = this.m_options.prioSortFn;
        }
    }

    /**
     * Updates the lists in the queue depending on their priority functions and removes
     * expired Tasks, based on their isExpired functions result.
     *
     * @param group The Group to update, if not set all groups will be updated.
     */
    update(group?: string) {
        if (group === undefined) {
            this.m_taskLists.forEach(taskList => {
                this.updateTaskList(taskList);
            });
        } else {
            const taskList = this.getTaskList(group);
            if (taskList) {
                this.updateTaskList(taskList);
            }
        }
    }

    /**
     * Adds a Task to the Queue
     *
     * @param task
     * @returns true if succesfully added, otherwise false
     */
    add(task: Task): boolean {
        if (this.m_taskLists.has(task.group)) {
            const taskList = this.m_taskLists.get(task.group);
            if (!taskList?.includes(task)) {
                this.m_taskLists.get(task.group)?.push(task);
                return true;
            }
        }
        return false;
    }

    /**
     * Removes a Task from the Queue
     *
     * @param task
     * @returns true if succesfully removed, otherwise false
     */
    remove(task: Task): boolean {
        if (this.m_taskLists.has(task.group)) {
            const index = this.m_taskLists.get(task.group)?.indexOf(task);
            if (index !== -1) {
                this.m_taskLists.get(task.group)?.splice(index as number, 1);
                return true;
            }
        }
        return false;
    }

    /**
     * Returns the number of remaining tasks.
     *
     * @param group if group is set, it will return only the remaining tasks for this group,
     * otherwise it will return the complete amount of tasks left.
     */
    numItemsLeft(group?: string): number {
        let numLeft: number = 0;
        if (group === undefined) {
            this.m_taskLists.forEach(tasklist => {
                numLeft += tasklist.length;
            });
        } else {
            numLeft += this.getTaskList(group)?.length ?? 0;
        }
        return numLeft;
    }

    /**
     * Processes the next Tasks for a group
     *
     * @param group The group the Tasks are pulled from.
     * @param shouldProcess A condition that, if set will be executed before the task is processed,
     * if returns true, the task will run
     * @param n The amount of tasks that should be pulled, @defaults to 1
     * @returns false if thte list was empty
     */
    processNext(group: string, shouldProcess?: (task: Task) => boolean, n: number = 1): boolean {
        if (!this.getTaskList(group) || this.numItemsLeft(group) <= 0) {
            return false;
        }
        for (let i = 0; i < n && this.numItemsLeft(group) > 0; i++) {
            const nextTask = this.pull(group, true);
            if (nextTask !== undefined) {
                //if a condition is set, execute it
                if (!shouldProcess || shouldProcess?.(nextTask)) {
                    nextTask.execute();
                } else {
                    //as the task was not executed but already pulled, add it back
                    //TODO: dont even pull it if it will not execute, this currently
                    // interferes with the skipping and removal of expired tasks on this.pull
                    this.add(nextTask);
                }
            }
        }
        return true;
    }

    clear() {
        this.m_taskLists.clear();
    }

    private pull(group: string, checkIfExpired: boolean = false): Task | undefined {
        const taskList = this.getTaskList(group);
        let nextTask;
        if (taskList) {
            nextTask = this.getTaskList(group)?.pop();
            if (checkIfExpired && nextTask && nextTask.isExpired?.()) {
                return this.pull(group, checkIfExpired);
            }
        }
        return nextTask;
    }

    private sort(a: Task, b: Task): number {
        // the highest number in the beginning as the last in the array with
        // highest priority which equals 0 will start to be processed
        return b.getPriority() - a.getPriority();
    }

    private getTaskList(group: string): Task[] | undefined {
        return this.m_taskLists.get(group);
    }

    private updateTaskList(taskList: Task[]) {
        for (let i = 0; i < taskList.length; i++) {
            const task = taskList[i];
            if (task?.isExpired?.()) {
                taskList.splice(i, 1);
                i--;
            }
        }
        taskList.sort(this.sort);
    }
}
