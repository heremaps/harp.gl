/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";

import { GroupedPriorityList } from "../lib/GroupedPriorityList";

interface Item {
    priority: number;
}

describe("GroupedPriorityList", function () {
    it("#add", function () {
        const priorityList = new GroupedPriorityList<Item>();

        for (let i = 0; i < 100; i++) {
            priorityList.add({ priority: i / 10 });
        }

        assert.equal(priorityList.groups.size, 10);

        for (let i = 0; i < 100; i++) {
            const group = priorityList.groups.get(Math.floor(i / 10));

            assert.isDefined(group);
            if (group !== undefined) {
                for (const e of group.elements) {
                    assert.isTrue(e.priority >= group.priority);
                    assert.isTrue(e.priority < group.priority + 1);
                }

                assert.equal(group.priority, Math.floor(i / 10));
                assert.equal(group.elements.length, 10);
            }
        }
    });

    it("#clear", function () {
        const priorityList = new GroupedPriorityList<Item>();

        for (let i = 0; i < 100; i++) {
            priorityList.add({ priority: i / 10 });
        }

        assert.equal(priorityList.groups.size, 10);

        priorityList.clear();

        assert.equal(priorityList.groups.size, 0);
    });

    it("#remove", function () {
        const priorityList = new GroupedPriorityList<Item>();

        const element1 = { priority: 1 };
        const element2 = { priority: 2 };
        const element3 = { priority: 3 };
        priorityList.add(element1);
        priorityList.add(element2);
        priorityList.add(element3);

        assert.equal(priorityList.groups.size, 3);

        const result2 = priorityList.remove(element2);
        const result1 = priorityList.remove(element1);
        const result3 = priorityList.remove(element3);

        assert.isTrue(result1);
        assert.isTrue(result2);
        assert.isTrue(result3);

        assert.equal(priorityList.groups.size, 0);

        const result1b = priorityList.remove(element1);
        assert.isFalse(result1b);
    });

    it("#merge", function () {
        const priorityList1 = new GroupedPriorityList<Item>();
        const priorityList2 = new GroupedPriorityList<Item>();

        for (let i = 0; i < 100; i++) {
            priorityList1.add({ priority: i / 10 });
            priorityList2.add({ priority: i / 10 });
        }

        assert.equal(priorityList1.groups.size, 10);
        assert.equal(priorityList2.groups.size, 10);

        priorityList1.merge(priorityList2);

        assert.equal(priorityList1.groups.size, 10);
        assert.equal(priorityList2.groups.size, 10);

        for (let i = 0; i < 100; i++) {
            const group = priorityList1.groups.get(Math.floor(i / 10));

            assert.isDefined(group);
            if (group !== undefined) {
                for (const e of group.elements) {
                    assert.isTrue(e.priority >= group.priority);
                    assert.isTrue(e.priority < group.priority + 1);
                }
                assert.equal(group.priority, Math.floor(i / 10));
                assert.equal(group.elements.length, 20);
            }
        }
    });
    it("#count", function () {
        const priorityList = new GroupedPriorityList<Item>();

        for (let i = 99; i >= 0; i--) {
            priorityList.add({ priority: i / 10 });
        }

        assert.equal(priorityList.groups.size, 10);

        assert.equal(priorityList.count(), 100);
    });
});
