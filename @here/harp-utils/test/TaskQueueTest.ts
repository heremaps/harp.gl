/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";

import { Task, TaskQueue } from "../lib/TaskQueue";

describe("TaskQueue", function () {
    it("create TaskQueue", function () {
        const taskQueue = new TaskQueue({ groups: ["group1"] });
        assert.equal(taskQueue.numItemsLeft(), 0);
        assert.isFalse(taskQueue.processNext("group1"));
    });

    it("add task of not existent group", function () {
        const taskQueue = new TaskQueue({ groups: ["group2"] });
        assert.isFalse(
            taskQueue.add({
                execute: () => {
                    return 1;
                },
                group: "group1",
                getPriority: () => {
                    return 6;
                }
            })
        );
        assert.equal(taskQueue.numItemsLeft(), 0);
        assert.isFalse(taskQueue.processNext("group2"));
        assert.isFalse(taskQueue.processNext("group1"));
    });

    it("add already added task ", function () {
        const taskQueue = new TaskQueue({ groups: ["group1"] });
        const task = {
            execute: () => {
                return 1;
            },
            group: "group1",
            getPriority: () => {
                return 6;
            }
        };
        assert.isTrue(taskQueue.add(task));
        assert.equal(taskQueue.numItemsLeft(), 1);

        assert.isFalse(taskQueue.add(task), "false, as the task was already added");
        assert.equal(taskQueue.numItemsLeft(), 1);

        assert.isTrue(taskQueue.processNext("group1"));
        assert.equal(taskQueue.numItemsLeft(), 0);
    });

    it("add Task and process", function () {
        const taskQueue = new TaskQueue({ groups: ["group1", "group2"] });
        assert.isTrue(
            taskQueue.add({
                execute: () => {
                    return 1;
                },
                group: "group1",
                getPriority: () => {
                    return 6;
                }
            }),
            "the task was added"
        );
        assert.equal(taskQueue.numItemsLeft(), 1, " the TaskQueue contains now 1 item");

        assert.isFalse(taskQueue.processNext("group2"));
        assert.equal(taskQueue.numItemsLeft(), 1, " the task was not yet processed");

        assert.isTrue(taskQueue.processNext("group1"));
        assert.equal(taskQueue.numItemsLeft(), 0, " the task was processed and removed");

        assert.isFalse(taskQueue.processNext("group1"));
    });

    it("update and remove expired", function () {
        const taskQueue = new TaskQueue({ groups: ["group1"] });
        let testValue = 0;
        taskQueue.add({
            execute: () => {
                testValue = 6;
            },
            group: "group1",
            getPriority: () => {
                return 6;
            },
            isExpired: () => {
                return true;
            }
        });

        taskQueue.add({
            execute: () => {
                testValue = 7;
            },
            group: "group1",
            getPriority: () => {
                return 7;
            },
            isExpired: () => {
                return false;
            }
        });

        taskQueue.add({
            execute: () => {
                testValue = 8;
            },
            group: "group1",
            getPriority: () => {
                return 8;
            },
            isExpired: () => {
                return true;
            }
        });

        taskQueue.add({
            execute: () => {
                testValue = 9;
            },
            group: "group1",
            getPriority: () => {
                return 8;
            },
            isExpired: () => {
                return true;
            }
        });

        assert.equal(taskQueue.numItemsLeft(), 4);
        taskQueue.update();
        assert.equal(taskQueue.numItemsLeft(), 1);
        assert.equal(taskQueue.processNext("group1"), true);
        assert.equal(testValue, 7);
    });

    it("updates with default sort priority", function () {
        const taskQueue = new TaskQueue({ groups: ["group1"] });
        let testValue = 0;
        taskQueue.add({
            execute: () => {
                testValue = 6;
            },
            group: "group1",
            getPriority: () => {
                return 6;
            }
        });

        taskQueue.add({
            execute: () => {
                testValue = 8;
            },
            group: "group1",
            getPriority: () => {
                return 8;
            }
        });

        taskQueue.add({
            execute: () => {
                testValue = 3;
            },
            group: "group1",
            getPriority: () => {
                return 3;
            }
        });

        assert.equal(taskQueue.numItemsLeft(), 3);
        taskQueue.update();
        assert.equal(taskQueue.numItemsLeft(), 3);
        assert.equal(taskQueue.processNext("group1"), true);
        assert.equal(testValue, 3);
        assert.equal(taskQueue.processNext("group1"), true);
        assert.equal(testValue, 6);
        assert.equal(taskQueue.processNext("group1"), true);
        assert.equal(testValue, 8);
        assert.equal(taskQueue.processNext("group1"), false);
    });

    it("updates with custom sort priority", function () {
        const taskQueue = new TaskQueue({
            groups: ["group1"],
            prioSortFn: (a: Task, b: Task) => {
                return a.getPriority() - b.getPriority();
            }
        });

        let testValue = 0;
        taskQueue.add({
            execute: () => {
                testValue = 6;
            },
            group: "group1",
            getPriority: () => {
                return 6;
            }
        });

        taskQueue.add({
            execute: () => {
                testValue = 8;
            },
            group: "group1",
            getPriority: () => {
                return 8;
            }
        });

        taskQueue.add({
            execute: () => {
                testValue = 3;
            },
            group: "group1",
            getPriority: () => {
                return 3;
            }
        });

        assert.equal(taskQueue.numItemsLeft(), 3);
        taskQueue.update();
        assert.equal(taskQueue.numItemsLeft(), 3);
        assert.equal(taskQueue.processNext("group1"), true);
        assert.equal(testValue, 8);
        assert.equal(taskQueue.processNext("group1"), true);
        assert.equal(testValue, 6);
        assert.equal(taskQueue.processNext("group1"), true);
        assert.equal(testValue, 3);
        assert.equal(taskQueue.processNext("group1"), false);
    });

    it("updates with a Tasks updated priority", function () {
        const taskQueue = new TaskQueue({ groups: ["group1"] });
        let testValue = 0;
        let changingPriority = 8;
        taskQueue.add({
            execute: () => {
                testValue = 6;
            },
            group: "group1",
            getPriority: () => {
                return 6;
            }
        });

        taskQueue.add({
            execute: () => {
                testValue = 8;
            },
            group: "group1",
            getPriority: () => {
                return changingPriority;
            }
        });

        taskQueue.add({
            execute: () => {
                testValue = 3;
            },
            group: "group1",
            getPriority: () => {
                return 3;
            }
        });

        assert.equal(taskQueue.numItemsLeft(), 3);
        taskQueue.update();
        assert.equal(taskQueue.numItemsLeft(), 3);
        assert.equal(taskQueue.processNext("group1"), true);
        assert.equal(testValue, 3);

        //change priority of the task setting testValue to 8 and update
        changingPriority = 1;
        taskQueue.update();

        assert.equal(taskQueue.processNext("group1"), true);
        assert.equal(testValue, 8, "the task setting testValue to 8, should now be next");
        assert.equal(taskQueue.processNext("group1"), true);
        assert.equal(testValue, 6);
        assert.equal(taskQueue.processNext("group1"), false);
    });

    it("process a task", function () {
        const taskQueue = new TaskQueue({ groups: ["group1"] });
        let testValue = 0;
        taskQueue.add({
            execute: () => {
                testValue = 6;
            },
            group: "group1",
            getPriority: () => {
                return 6;
            }
        });
        taskQueue.processNext("group1");

        assert.equal(testValue, 6);
    });

    it("process multiple tasks", function () {
        const taskQueue = new TaskQueue({ groups: ["group1"] });
        let testValue = 0;
        taskQueue.add({
            execute: () => {
                testValue = 6;
            },
            group: "group1",
            getPriority: () => {
                return 6;
            }
        });

        taskQueue.add({
            execute: () => {
                testValue = 4;
            },
            group: "group1",
            getPriority: () => {
                return 4;
            }
        });

        taskQueue.processNext("group1", undefined, 2);

        assert.equal(testValue, 6);
    });

    it("process multiple tasks, with one expired", function () {
        const taskQueue = new TaskQueue({ groups: ["group1"] });
        let testValue = 0;
        taskQueue.add({
            execute: () => {
                testValue = 6;
            },
            group: "group1",
            getPriority: () => {
                return 6;
            },
            isExpired: () => {
                return true;
            }
        });

        taskQueue.add({
            execute: () => {
                testValue = 4;
            },
            group: "group1",
            getPriority: () => {
                return 4;
            }
        });

        taskQueue.processNext("group1", undefined, 2);

        assert.equal(testValue, 4);
    });

    it("process an task when the next is an expired task", function () {
        const taskQueue = new TaskQueue({ groups: ["group1"] });
        let testValue = 0;
        taskQueue.add({
            execute: () => {
                testValue = 6;
            },
            group: "group1",
            getPriority: () => {
                return 6;
            }
        });

        taskQueue.add({
            execute: () => {
                testValue = 4;
            },
            group: "group1",
            getPriority: () => {
                return 4;
            },
            isExpired: () => {
                return true;
            }
        });

        taskQueue.processNext("group1");

        assert.equal(testValue, 6);
    });

    it("process an task with unmet processing condition", function () {
        const taskQueue = new TaskQueue({ groups: ["group1"] });
        let testValue = 0;
        taskQueue.add({
            execute: () => {
                testValue = 6;
            },
            group: "group1",
            getPriority: () => {
                return 6;
            }
        });

        taskQueue.processNext("group1", task => {
            return task.getPriority() > 7;
        });

        assert.equal(testValue, 0);
    });

    it("process an task with unmet processing condition, when next is expired", function () {
        const taskQueue = new TaskQueue({ groups: ["group1"] });
        let testValue = 0;
        taskQueue.add({
            execute: () => {
                testValue = 6;
            },
            group: "group1",
            getPriority: () => {
                return 6;
            }
        });

        taskQueue.add({
            execute: () => {
                testValue = 4;
            },
            group: "group1",
            getPriority: () => {
                return 4;
            },
            isExpired: () => {
                return true;
            }
        });

        taskQueue.processNext("group1", task => {
            return task.getPriority() === 4;
        });

        assert.equal(testValue, 0);
    });

    it("request process of an empty list", function () {
        const taskQueue = new TaskQueue({ groups: ["group1"] });
        assert.isFalse(taskQueue.processNext("group1"));
    });

    it("adding task exceeds max length", function () {
        //TODO: implement
        assert.isTrue(true);
    });
});
