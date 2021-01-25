/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { Math2D } from "@here/harp-utils";
import { assert } from "chai";
import * as THREE from "three";

import {
    CollisionBox,
    DetailedCollisionBox,
    IBox,
    LineWithBound,
    ScreenCollisions
} from "../lib/ScreenCollisions";

const tempGlyphBox2D = new Math2D.Box();

function toBox2D(bounds: THREE.Box2): Math2D.Box {
    tempGlyphBox2D.x = bounds.min.x;
    tempGlyphBox2D.y = bounds.min.y;
    tempGlyphBox2D.w = bounds.max.x - bounds.min.x;
    tempGlyphBox2D.h = bounds.max.y - bounds.min.y;
    return tempGlyphBox2D;
}

describe("ScreenCollisions", function () {
    it("line intersection test box at center", function () {
        const sc = new ScreenCollisions();
        sc.update(100, 100);

        const line: LineWithBound = {
            minX: 0,
            minY: -10,
            maxX: 1,
            maxY: 11,
            line: new THREE.Line3(new THREE.Vector3(0, -10, 1), new THREE.Vector3(1, 11, 1))
        };
        // Box around the center
        const intersectsLineWithBoxAtCenter = sc["intersectsLine"](
            new CollisionBox({
                minX: -10,
                minY: -10,
                maxX: 10,
                maxY: 10
            }),
            line
        );
        assert.isTrue(intersectsLineWithBoxAtCenter);
    });
    it("line intersection test box shifted right", function () {
        const sc = new ScreenCollisions();
        sc.update(100, 100);
        const line: LineWithBound = {
            minX: 0,
            minY: -10,
            maxX: 1,
            maxY: 11,
            line: new THREE.Line3(new THREE.Vector3(0, -10, 1), new THREE.Vector3(1, 11, 1))
        };

        // Box around shifted right
        const intersectsLineWithShiftedBox = sc["intersectsLine"](
            new CollisionBox({
                minX: 10,
                minY: -10,
                maxX: 20,
                maxY: 10
            }),
            line
        );
        assert.isFalse(intersectsLineWithShiftedBox);
    });
    it("line intersection test line pure vertical", function () {
        const sc = new ScreenCollisions();
        sc.update(100, 100);
        const line: LineWithBound = {
            minX: 0,
            minY: -10,
            maxX: 0,
            maxY: 11,
            line: new THREE.Line3(new THREE.Vector3(0, -10, 1), new THREE.Vector3(0, 11, 1))
        };

        // Box around center
        const intersectsLineWithShiftedBox = sc["intersectsLine"](
            new CollisionBox({
                minX: -10,
                minY: -10,
                maxX: 10,
                maxY: 10
            }),
            line
        );
        assert.isTrue(intersectsLineWithShiftedBox);
    });
    it("line intersection test line pure horizontal", function () {
        const sc = new ScreenCollisions();
        sc.update(100, 100);
        const line: LineWithBound = {
            minX: 0,
            minY: 0,
            maxX: 10,
            maxY: 0,
            line: new THREE.Line3(new THREE.Vector3(0, 0, 1), new THREE.Vector3(10, 0, 1))
        };

        // Box around center
        const box = new CollisionBox({
            minX: -10,
            minY: -10,
            maxX: 10,
            maxY: 10
        });
        const intersectsLineWithShiftedBox = sc["intersectsLine"](box, line);
        assert.isTrue(intersectsLineWithShiftedBox);
    });
    it("line intersection test via isAllocated method", function () {
        const sc = new ScreenCollisions();
        sc.update(100, 100);
        const line: LineWithBound = {
            minX: 0,
            minY: -21,
            maxX: 21,
            maxY: 0,
            line: new THREE.Line3(new THREE.Vector3(0, -20, 1), new THREE.Vector3(20, 0, 1))
        };
        sc.allocateIBoxes([line]);

        const box = new CollisionBox({
            minX: -10,
            minY: -10,
            maxX: 10,
            maxY: 10
        });
        assert.isTrue(sc.isAllocated(box));
    });
    it("line intersection test fail via isAllocated method", function () {
        const sc = new ScreenCollisions();
        sc.update(100, 100);
        const line: LineWithBound = {
            minX: 0,
            minY: -21,
            maxX: 21,
            maxY: 0,
            line: new THREE.Line3(new THREE.Vector3(0, -21, 1), new THREE.Vector3(21, 0, 1))
        };
        sc.allocateIBoxes([line]);

        const box = new CollisionBox({
            minX: -10,
            minY: -10,
            maxX: 10,
            maxY: 10
        });
        // The boxes overlap, but the lines don't intersect, so check this returns false.
        assert.isFalse(sc.isAllocated(box));
    });
    it("test allocate multiple boxes", function () {
        const sc = new ScreenCollisions();
        sc.update(100, 100);
        const boxes: IBox[] = [];
        for (let i = 0; i < 100; i++) {
            boxes.push({
                minX: i,
                minY: i,
                maxX: i + 1,
                maxY: i + 1
            });
        }
        sc.allocateIBoxes(boxes);
        assert.isTrue(
            sc.isAllocated(
                new CollisionBox({
                    minX: 0,
                    minY: 0,
                    maxX: 10,
                    maxY: 10
                })
            )
        );
    });
    it("intersectsDetails returns false if there's no intersections with detail boxes", function () {
        const sc = new ScreenCollisions();
        sc.update(100, 100);

        const testBox = new CollisionBox({
            minX: 5,
            minY: 5,
            maxX: 10,
            maxY: 10
        });

        const dummyBox = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
        const detailBox = new CollisionBox({ minX: 0, minY: 0, maxX: 2, maxY: 2 });
        assert.isFalse(
            sc.intersectsDetails(testBox, [new DetailedCollisionBox(dummyBox, [detailBox])])
        );
    });
    it("intersectsDetails returns true when there's an intersection with a detail box", function () {
        const sc = new ScreenCollisions();
        sc.update(100, 100);

        const testBox = new CollisionBox({
            minX: 5,
            minY: 5,
            maxX: 10,
            maxY: 10
        });

        const dummyBox = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
        const detailBox = new CollisionBox({ minX: 0, minY: 0, maxX: 6, maxY: 6 });
        assert.isTrue(
            sc.intersectsDetails(testBox, [new DetailedCollisionBox(dummyBox, [detailBox])])
        );
    });
    it("intersectsDetails returns true when a candidate does not have detail boxes", function () {
        const sc = new ScreenCollisions();
        sc.update(100, 100);

        const testBox = new CollisionBox({
            minX: 5,
            minY: 5,
            maxX: 10,
            maxY: 10
        });
        assert.isTrue(
            sc.intersectsDetails(testBox, [
                new CollisionBox({ minX: 0, minY: 0, maxX: 0, maxY: 0 })
            ])
        );
    });
    it("properly handle collision in test space", function () {
        const sc = new ScreenCollisions();
        sc.update(1608, 822);

        /* Random trace from central Berlin */
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(78.48466907282827, -65.6344026815765),
                        new THREE.Vector2(90.67816955494223, -56.76158815092266)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(81.05025303597746, -59.449933705648064),
                        new THREE.Vector2(91.41190003871928, -52.408972654367574)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(79.45322974188322, -54.598643670639056),
                        new THREE.Vector2(91.93318309019891, -48.76006222524361)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(83.05202220742156, -51.84587604263076),
                        new THREE.Vector2(93.00132156926423, -42.56071387108035)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(81.11149997733982, -44.19244138180156),
                        new THREE.Vector2(94.095032424441, -35.193732076454175)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(84.68153044363386, -36.66244921550212),
                        new THREE.Vector2(95.04317744637585, -29.621488164221272)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(83.0845071495393, -31.81115918049291),
                        new THREE.Vector2(95.56446049785484, -25.972577735098398)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(86.68329961507787, -29.058391552484746),
                        new THREE.Vector2(96.63259897692055, -19.773229380934342)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(84.60704708102641, -22.256710103909185),
                        new THREE.Vector2(97.59057952812782, -13.258000798561362)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(91.19163957403282, -15.1366132983413),
                        new THREE.Vector2(95.35892563156187, -8.312778479643995)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(87.38975727676055, -9.751985408070654),
                        new THREE.Vector2(99.58325775887313, -0.8791708774193907)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(87.66983089669341, -3.0367137056659517),
                        new THREE.Vector2(100.77925811849195, 6.7520275646716925)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(91.89613012986106, 3.653869497832791),
                        new THREE.Vector2(101.84542949170543, 12.939031669385127)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(92.32570379474558, 11.307304158662303),
                        new THREE.Vector2(102.6873507974874, 18.3482652099428)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(91.39281769094335, 15.368562228682482),
                        new THREE.Vector2(103.46042339836055, 23.451344794347534)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(96.85493732952715, 20.402480876702253),
                        new THREE.Vector2(101.02222338705644, 27.226315695399645)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(93.05305503225486, 25.787108766972835),
                        new THREE.Vector2(105.372450289064, 35.44995526261292)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(93.42951683906524, 33.10724869257184),
                        new THREE.Vector2(106.0353649620777, 39.73586210295608)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(97.0499474690046, 35.99580306456261),
                        new THREE.Vector2(106.99924683084727, 45.28096523611302)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(95.76569400579668, 42.80982876259111),
                        new THREE.Vector2(107.8332997132127, 50.89261132825355)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(98.85771774941432, 47.340168311823696),
                        new THREE.Vector2(108.68112233656096, 55.83529851838599)
                    )
                )
            ),
            false
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(78.48466907282827, -65.6344026815765),
                    new THREE.Vector2(90.67816955494223, -56.76158815092266)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(81.05025303597746, -59.449933705648064),
                    new THREE.Vector2(91.41190003871928, -52.408972654367574)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(79.45322974188322, -54.598643670639056),
                    new THREE.Vector2(91.93318309019891, -48.76006222524361)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(83.05202220742156, -51.84587604263076),
                    new THREE.Vector2(93.00132156926423, -42.56071387108035)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(81.11149997733982, -44.19244138180156),
                    new THREE.Vector2(94.095032424441, -35.193732076454175)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(84.68153044363386, -36.66244921550212),
                    new THREE.Vector2(95.04317744637585, -29.621488164221272)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(83.0845071495393, -31.81115918049291),
                    new THREE.Vector2(95.56446049785484, -25.972577735098398)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(86.68329961507787, -29.058391552484746),
                    new THREE.Vector2(96.63259897692055, -19.773229380934342)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(84.60704708102641, -22.256710103909185),
                    new THREE.Vector2(97.59057952812782, -13.258000798561362)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(91.19163957403282, -15.1366132983413),
                    new THREE.Vector2(95.35892563156187, -8.312778479643995)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(87.38975727676055, -9.751985408070654),
                    new THREE.Vector2(99.58325775887313, -0.8791708774193907)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(87.66983089669341, -3.0367137056659517),
                    new THREE.Vector2(100.77925811849195, 6.7520275646716925)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(91.89613012986106, 3.653869497832791),
                    new THREE.Vector2(101.84542949170543, 12.939031669385127)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(92.32570379474558, 11.307304158662303),
                    new THREE.Vector2(102.6873507974874, 18.3482652099428)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(91.39281769094335, 15.368562228682482),
                    new THREE.Vector2(103.46042339836055, 23.451344794347534)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(96.85493732952715, 20.402480876702253),
                    new THREE.Vector2(101.02222338705644, 27.226315695399645)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(93.05305503225486, 25.787108766972835),
                    new THREE.Vector2(105.372450289064, 35.44995526261292)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(93.42951683906524, 33.10724869257184),
                    new THREE.Vector2(106.0353649620777, 39.73586210295608)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(97.0499474690046, 35.99580306456261),
                    new THREE.Vector2(106.99924683084727, 45.28096523611302)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(95.76569400579668, 42.80982876259111),
                    new THREE.Vector2(107.8332997132127, 50.89261132825355)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(98.85771774941432, 47.340168311823696),
                    new THREE.Vector2(108.68112233656096, 55.83529851838599)
                )
            )
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-124.63851394040654, -20.074454851752073),
                        new THREE.Vector2(-113.18009036343854, -11.708461523575336)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-125.57737801314022, -12.692463776374042),
                        new THREE.Vector2(-113.42521158724983, -7.4982654102650645)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-122.58167350865295, -9.66324389008631),
                        new THREE.Vector2(-113.52193733155318, -1.3766152751843528)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-125.15562465033472, -2.8463823287384904),
                        new THREE.Vector2(-113.75011088221741, 3.920486066191237)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-122.93509449745238, 1.8179734040759756),
                        new THREE.Vector2(-113.9018132247786, 9.305039552353882)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-115.7373788663211, 7.603032156094798),
                        new THREE.Vector2(-114.08534412422594, 9.255066898189952)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-126.13256061016278, 11.80728958378874),
                        new THREE.Vector2(-114.100106670598, 19.061510501748312)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-122.90171330200127, 18.632219724216515),
                        new THREE.Vector2(-114.06560696670059, 26.671953889249664)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-123.66663984051972, 26.38214039649712),
                        new THREE.Vector2(-114.04140061708081, 32.025518768598346)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-115.64811450984985, 30.494598301626677),
                        new THREE.Vector2(-114.04089160505615, 32.101821206420375)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-125.22895657335513, 34.70705518317276),
                        new THREE.Vector2(-113.98925516299322, 43.55764008273207)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-122.797761735176, 41.606984555912874),
                        new THREE.Vector2(-113.96165539987531, 49.646718720946026)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-122.76269646236224, 49.34242666393487),
                        new THREE.Vector2(-110.7266228817328, 57.39663939322665)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-122.7284229860314, 56.93182769174522),
                        new THREE.Vector2(-113.89593629179537, 64.17157004544617)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-125.89468232394566, 64.38175143477626),
                        new THREE.Vector2(-113.85860874331621, 72.43596416406803)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-125.8604088476148, 71.95667389832795),
                        new THREE.Vector2(-113.83881383124398, 76.81091938229093)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-125.84355489390755, 75.6816357698435),
                        new THREE.Vector2(-113.82557951860137, 79.7358894424743)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-125.82732306600828, 79.2690990487863),
                        new THREE.Vector2(-113.79124948537881, 87.32331177807806)
                    )
                )
            ),
            false
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-124.63851394040654, -20.074454851752073),
                    new THREE.Vector2(-113.18009036343854, -11.708461523575336)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-125.57737801314022, -12.692463776374042),
                    new THREE.Vector2(-113.42521158724983, -7.4982654102650645)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-122.58167350865295, -9.66324389008631),
                    new THREE.Vector2(-113.52193733155318, -1.3766152751843528)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-125.15562465033472, -2.8463823287384904),
                    new THREE.Vector2(-113.75011088221741, 3.920486066191237)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-122.93509449745238, 1.8179734040759756),
                    new THREE.Vector2(-113.9018132247786, 9.305039552353882)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-115.7373788663211, 7.603032156094798),
                    new THREE.Vector2(-114.08534412422594, 9.255066898189952)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-126.13256061016278, 11.80728958378874),
                    new THREE.Vector2(-114.100106670598, 19.061510501748312)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-122.90171330200127, 18.632219724216515),
                    new THREE.Vector2(-114.06560696670059, 26.671953889249664)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-123.66663984051972, 26.38214039649712),
                    new THREE.Vector2(-114.04140061708081, 32.025518768598346)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-115.64811450984985, 30.494598301626677),
                    new THREE.Vector2(-114.04089160505615, 32.101821206420375)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-125.22895657335513, 34.70705518317276),
                    new THREE.Vector2(-113.98925516299322, 43.55764008273207)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-122.797761735176, 41.606984555912874),
                    new THREE.Vector2(-113.96165539987531, 49.646718720946026)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-122.76269646236224, 49.34242666393487),
                    new THREE.Vector2(-110.7266228817328, 57.39663939322665)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-122.7284229860314, 56.93182769174522),
                    new THREE.Vector2(-113.89593629179537, 64.17157004544617)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-125.89468232394566, 64.38175143477626),
                    new THREE.Vector2(-113.85860874331621, 72.43596416406803)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-125.8604088476148, 71.95667389832795),
                    new THREE.Vector2(-113.83881383124398, 76.81091938229093)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-125.84355489390755, 75.6816357698435),
                    new THREE.Vector2(-113.82557951860137, 79.7358894424743)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-125.82732306600828, 79.2690990487863),
                    new THREE.Vector2(-113.79124948537881, 87.32331177807806)
                )
            )
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-74.919563601129, -136.75116637083116),
                        new THREE.Vector2(-66.119563601129, -125.55116637083117)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-67.957063601129, -136.75116637083116),
                        new THREE.Vector2(-59.95706360112899, -127.95116637083116)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-61.069563601129005, -136.75116637083116),
                        new THREE.Vector2(-53.869563601129, -124.75116637083116)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-54.369563601129, -136.75116637083116),
                        new THREE.Vector2(-46.369563601129, -127.95116637083116)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-46.61956360112901, -136.75116637083116),
                        new THREE.Vector2(-42.619563601129, -124.75116637083116)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-43.03206360112901, -136.75116637083116),
                        new THREE.Vector2(-35.83206360112901, -124.75116637083116)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-36.20706360112901, -136.75116637083116),
                        new THREE.Vector2(-28.207063601129008, -127.95116637083116)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-28.457063601129004, -136.75116637083116),
                        new THREE.Vector2(-17.257063601129005, -127.95116637083116)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-18.294563601129, -136.75116637083116),
                        new THREE.Vector2(-10.294563601129, -127.95116637083116)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-10.594563601128993, -136.75116637083116),
                        new THREE.Vector2(-3.3945636011289944, -127.95116637083116)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-3.0945636011289936, -136.75116637083116),
                        new THREE.Vector2(4.105436398871006, -127.95116637083116)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(3.6054363988710074, -136.75116637083116),
                        new THREE.Vector2(10.805436398871008, -127.95116637083116)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(9.567936398871026, -136.75116637083116),
                        new THREE.Vector2(15.967936398871027, -125.55116637083117)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(14.955436398871004, -136.75116637083116),
                        new THREE.Vector2(20.555436398871002, -127.15116637083116)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(19.067936398871023, -136.75116637083116),
                        new THREE.Vector2(27.067936398871023, -127.95116637083116)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(26.767936398871033, -136.75116637083116),
                        new THREE.Vector2(34.76793639887103, -124.75116637083116)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(33.53043639887103, -136.75116637083116),
                        new THREE.Vector2(41.53043639887103, -127.95116637083116)
                    )
                )
            ),
            false
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-74.919563601129, -136.75116637083116),
                    new THREE.Vector2(-66.119563601129, -125.55116637083117)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-67.957063601129, -136.75116637083116),
                    new THREE.Vector2(-59.95706360112899, -127.95116637083116)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-61.069563601129005, -136.75116637083116),
                    new THREE.Vector2(-53.869563601129, -124.75116637083116)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-54.369563601129, -136.75116637083116),
                    new THREE.Vector2(-46.369563601129, -127.95116637083116)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-46.61956360112901, -136.75116637083116),
                    new THREE.Vector2(-42.619563601129, -124.75116637083116)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-43.03206360112901, -136.75116637083116),
                    new THREE.Vector2(-35.83206360112901, -124.75116637083116)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-36.20706360112901, -136.75116637083116),
                    new THREE.Vector2(-28.207063601129008, -127.95116637083116)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-28.457063601129004, -136.75116637083116),
                    new THREE.Vector2(-17.257063601129005, -127.95116637083116)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-18.294563601129, -136.75116637083116),
                    new THREE.Vector2(-10.294563601129, -127.95116637083116)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-10.594563601128993, -136.75116637083116),
                    new THREE.Vector2(-3.3945636011289944, -127.95116637083116)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-3.0945636011289936, -136.75116637083116),
                    new THREE.Vector2(4.105436398871006, -127.95116637083116)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(3.6054363988710074, -136.75116637083116),
                    new THREE.Vector2(10.805436398871008, -127.95116637083116)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(9.567936398871026, -136.75116637083116),
                    new THREE.Vector2(15.967936398871027, -125.55116637083117)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(14.955436398871004, -136.75116637083116),
                    new THREE.Vector2(20.555436398871002, -127.15116637083116)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(19.067936398871023, -136.75116637083116),
                    new THREE.Vector2(27.067936398871023, -127.95116637083116)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(26.767936398871033, -136.75116637083116),
                    new THREE.Vector2(34.76793639887103, -124.75116637083116)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(33.53043639887103, -136.75116637083116),
                    new THREE.Vector2(41.53043639887103, -127.95116637083116)
                )
            )
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-376.0154369174794, 125.23392601075716),
                        new THREE.Vector2(-368.0154369174794, 136.43392601075715)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-369.4029369174794, 125.23392601075716),
                        new THREE.Vector2(-361.4029369174794, 134.03392601075714)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-361.70293691747935, 125.23392601075716),
                        new THREE.Vector2(-354.50293691747936, 134.03392601075714)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-354.25293691747936, 125.23392601075716),
                        new THREE.Vector2(-349.45293691747935, 137.23392601075716)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-351.3279369174794, 128.43392601075715),
                        new THREE.Vector2(-344.9279369174794, 131.63392601075716)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-345.36543691747937, 125.23392601075716),
                        new THREE.Vector2(-338.1654369174794, 136.43392601075715)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-339.8404369174794, 125.23392601075716),
                        new THREE.Vector2(-331.0404369174794, 137.23392601075716)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-331.5904369174794, 125.23392601075716),
                        new THREE.Vector2(-323.5904369174794, 137.23392601075716)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-324.81543691747936, 125.23392601075716),
                        new THREE.Vector2(-316.81543691747936, 134.03392601075714)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-317.86543691747937, 128.43392601075715),
                        new THREE.Vector2(-311.4654369174794, 131.63392601075716)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-312.7029369174794, 125.23392601075716),
                        new THREE.Vector2(-303.1029369174794, 136.43392601075715)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-304.5779369174794, 125.23392601075716),
                        new THREE.Vector2(-299.7779369174794, 137.23392601075716)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-300.8529369174794, 125.23392601075716),
                        new THREE.Vector2(-296.05293691747937, 137.23392601075716)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-297.9279369174794, 125.23392601075716),
                        new THREE.Vector2(-289.9279369174794, 134.03392601075714)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-290.9779369174794, 125.23392601075716),
                        new THREE.Vector2(-282.9779369174794, 134.03392601075714)
                    )
                )
            ),
            false
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-376.0154369174794, 125.23392601075716),
                    new THREE.Vector2(-368.0154369174794, 136.43392601075715)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-369.4029369174794, 125.23392601075716),
                    new THREE.Vector2(-361.4029369174794, 134.03392601075714)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-361.70293691747935, 125.23392601075716),
                    new THREE.Vector2(-354.50293691747936, 134.03392601075714)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-354.25293691747936, 125.23392601075716),
                    new THREE.Vector2(-349.45293691747935, 137.23392601075716)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-351.3279369174794, 128.43392601075715),
                    new THREE.Vector2(-344.9279369174794, 131.63392601075716)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-345.36543691747937, 125.23392601075716),
                    new THREE.Vector2(-338.1654369174794, 136.43392601075715)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-339.8404369174794, 125.23392601075716),
                    new THREE.Vector2(-331.0404369174794, 137.23392601075716)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-331.5904369174794, 125.23392601075716),
                    new THREE.Vector2(-323.5904369174794, 137.23392601075716)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-324.81543691747936, 125.23392601075716),
                    new THREE.Vector2(-316.81543691747936, 134.03392601075714)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-317.86543691747937, 128.43392601075715),
                    new THREE.Vector2(-311.4654369174794, 131.63392601075716)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-312.7029369174794, 125.23392601075716),
                    new THREE.Vector2(-303.1029369174794, 136.43392601075715)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-304.5779369174794, 125.23392601075716),
                    new THREE.Vector2(-299.7779369174794, 137.23392601075716)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-300.8529369174794, 125.23392601075716),
                    new THREE.Vector2(-296.05293691747937, 137.23392601075716)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-297.9279369174794, 125.23392601075716),
                    new THREE.Vector2(-289.9279369174794, 134.03392601075714)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-290.9779369174794, 125.23392601075716),
                    new THREE.Vector2(-282.9779369174794, 134.03392601075714)
                )
            )
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(104.3779382267356, -276.7690874657376),
                        new THREE.Vector2(116.06244714804635, -268.78943001658513)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(103.03850226307212, -270.04336448504654),
                        new THREE.Vector2(115.5779749396204, -261.20874328065656)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(104.09383821441921, -264.2001687380252),
                        new THREE.Vector2(114.41970583240794, -254.48170998891223)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(102.28276728793124, -256.63139173221674),
                        new THREE.Vector2(112.79457896480088, -249.25745539118984)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(99.75043412422421, -252.91253085235897),
                        new THREE.Vector2(111.98806607293442, -244.44034930665828)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(100.3688281538846, -248.58476674564793),
                        new THREE.Vector2(110.81960454350836, -239.22786339928118)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(96.63203642940161, -243.5210169862157),
                        new THREE.Vector2(109.16706984908188, -234.2676026963064)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(96.89790990878451, -237.9011231215722),
                        new THREE.Vector2(107.67389908745125, -229.85981655104794)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(95.8616004024195, -233.7280052696678),
                        new THREE.Vector2(106.53410052462877, -223.60244166908703)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(90.65286845942781, -227.21654525320005),
                        new THREE.Vector2(104.40000959849311, -216.20408672227722)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(91.85325104927182, -219.83206911145518),
                        new THREE.Vector2(102.52575117148109, -209.70650551087442)
                    )
                )
            ),
            false
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(104.3779382267356, -276.7690874657376),
                    new THREE.Vector2(116.06244714804635, -268.78943001658513)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(103.03850226307212, -270.04336448504654),
                    new THREE.Vector2(115.5779749396204, -261.20874328065656)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(104.09383821441921, -264.2001687380252),
                    new THREE.Vector2(114.41970583240794, -254.48170998891223)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(102.28276728793124, -256.63139173221674),
                    new THREE.Vector2(112.79457896480088, -249.25745539118984)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(99.75043412422421, -252.91253085235897),
                    new THREE.Vector2(111.98806607293442, -244.44034930665828)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(100.3688281538846, -248.58476674564793),
                    new THREE.Vector2(110.81960454350836, -239.22786339928118)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(96.63203642940161, -243.5210169862157),
                    new THREE.Vector2(109.16706984908188, -234.2676026963064)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(96.89790990878451, -237.9011231215722),
                    new THREE.Vector2(107.67389908745125, -229.85981655104794)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(95.8616004024195, -233.7280052696678),
                    new THREE.Vector2(106.53410052462877, -223.60244166908703)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(90.65286845942781, -227.21654525320005),
                    new THREE.Vector2(104.40000959849311, -216.20408672227722)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(91.85325104927182, -219.83206911145518),
                    new THREE.Vector2(102.52575117148109, -209.70650551087442)
                )
            )
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-454.8331790126008, -135.82362560876314),
                        new THREE.Vector2(-445.85744947677614, -124.48608657052941)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-447.87154681382106, -135.92091957792272),
                        new THREE.Vector2(-439.73360892977814, -126.99571185974408)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-440.98490526709037, -136.01702944196842),
                        new THREE.Vector2(-433.5963458539517, -123.90485102401152)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-434.285740350491, -136.13543995210037),
                        new THREE.Vector2(-426.14780246644784, -127.21023223392154)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-426.53670630516797, -136.1946452071584),
                        new THREE.Vector2(-422.3477480462267, -124.13298860685339)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-422.94965344870576, -136.30180671882658),
                        new THREE.Vector2(-415.5610940355578, -124.18962830086421)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-416.125504112018, -136.422190737448),
                        new THREE.Vector2(-407.98756622798186, -127.4969830192755)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-408.37647006669636, -136.5950700822295),
                        new THREE.Vector2(-397.0389310284626, -127.61934054640484)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-398.21523671371796, -136.70499450579766),
                        new THREE.Vector2(-390.07729882968204, -127.77978678762535)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-390.5161964364307, -136.81393217511334),
                        new THREE.Vector2(-383.17815884094387, -127.9013549113538)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-382.991335850038, -136.75116637083116),
                        new THREE.Vector2(-375.791335850038, -127.95116637083116)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-376.291335850038, -136.75116637083116),
                        new THREE.Vector2(-369.09133585003804, -127.95116637083116)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-370.32883585003805, -136.75116637083116),
                        new THREE.Vector2(-363.92883585003807, -125.55116637083117)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-364.941335850038, -136.75116637083116),
                        new THREE.Vector2(-359.34133585003804, -127.15116637083116)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-360.828835850038, -136.75116637083116),
                        new THREE.Vector2(-352.828835850038, -127.95116637083116)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-353.128835850038, -136.75116637083116),
                        new THREE.Vector2(-345.128835850038, -124.75116637083116)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-346.366335850038, -136.75116637083116),
                        new THREE.Vector2(-338.366335850038, -127.95116637083116)
                    )
                )
            ),
            false
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-454.8331790126008, -135.82362560876314),
                    new THREE.Vector2(-445.85744947677614, -124.48608657052941)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-447.87154681382106, -135.92091957792272),
                    new THREE.Vector2(-439.73360892977814, -126.99571185974408)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-440.98490526709037, -136.01702944196842),
                    new THREE.Vector2(-433.5963458539517, -123.90485102401152)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-434.285740350491, -136.13543995210037),
                    new THREE.Vector2(-426.14780246644784, -127.21023223392154)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-426.53670630516797, -136.1946452071584),
                    new THREE.Vector2(-422.3477480462267, -124.13298860685339)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-422.94965344870576, -136.30180671882658),
                    new THREE.Vector2(-415.5610940355578, -124.18962830086421)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-416.125504112018, -136.422190737448),
                    new THREE.Vector2(-407.98756622798186, -127.4969830192755)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-408.37647006669636, -136.5950700822295),
                    new THREE.Vector2(-397.0389310284626, -127.61934054640484)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-398.21523671371796, -136.70499450579766),
                    new THREE.Vector2(-390.07729882968204, -127.77978678762535)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-390.5161964364307, -136.81393217511334),
                    new THREE.Vector2(-383.17815884094387, -127.9013549113538)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-382.991335850038, -136.75116637083116),
                    new THREE.Vector2(-375.791335850038, -127.95116637083116)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-376.291335850038, -136.75116637083116),
                    new THREE.Vector2(-369.09133585003804, -127.95116637083116)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-370.32883585003805, -136.75116637083116),
                    new THREE.Vector2(-363.92883585003807, -125.55116637083117)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-364.941335850038, -136.75116637083116),
                    new THREE.Vector2(-359.34133585003804, -127.15116637083116)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-360.828835850038, -136.75116637083116),
                    new THREE.Vector2(-352.828835850038, -127.95116637083116)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-353.128835850038, -136.75116637083116),
                    new THREE.Vector2(-345.128835850038, -124.75116637083116)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-346.366335850038, -136.75116637083116),
                    new THREE.Vector2(-338.366335850038, -127.95116637083116)
                )
            )
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(581.4726019324089, 198.17205171735628),
                        new THREE.Vector2(594.2891800014967, 212.09497058797248)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(588.7829154154772, 201.22162502204108),
                        new THREE.Vector2(599.8291139965647, 212.63660387030484)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(593.5730071303176, 204.2383483449877),
                        new THREE.Vector2(605.3016248598472, 218.17964767757402)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(600.3153203088996, 207.5233465187954),
                        new THREE.Vector2(609.1672177489006, 220.06304663055764)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(602.8212133736058, 208.74427084006072),
                        new THREE.Vector2(614.5498311031354, 222.68557017264703)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(606.6530946967665, 210.61124480217475),
                        new THREE.Vector2(618.3817124262961, 224.55254413476106)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(611.2041560923094, 212.8286185694948),
                        new THREE.Vector2(623.6519538942212, 227.12031770728714)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(618.6963115511139, 215.7960669198351),
                        new THREE.Vector2(629.7425101322051, 227.2110457681015)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(625.6184197477967, 219.16866504494365),
                        new THREE.Vector2(635.9454382565023, 230.23324408800138)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(631.5966040994693, 222.0813634257203),
                        new THREE.Vector2(642.6428026805593, 233.49634227398582)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(638.213261245466, 225.47586153865475),
                        new THREE.Vector2(647.4523194146149, 236.55882104368283)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(641.5782769618161, 227.62753534249916),
                        new THREE.Vector2(653.3068946913496, 241.56883467508612)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(649.1153811751565, 230.61688368066336),
                        new THREE.Vector2(660.1615797562429, 242.03186252892624)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(656.0374893718323, 233.98948180577264),
                        new THREE.Vector2(669.9604082424486, 246.80605987486047)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(665.8925038011911, 238.79105413648855),
                        new THREE.Vector2(679.8154226718082, 251.60763220557808)
                    )
                )
            ),
            false
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(581.4726019324089, 198.17205171735628),
                    new THREE.Vector2(594.2891800014967, 212.09497058797248)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(588.7829154154772, 201.22162502204108),
                    new THREE.Vector2(599.8291139965647, 212.63660387030484)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(593.5730071303176, 204.2383483449877),
                    new THREE.Vector2(605.3016248598472, 218.17964767757402)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(600.3153203088996, 207.5233465187954),
                    new THREE.Vector2(609.1672177489006, 220.06304663055764)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(602.8212133736058, 208.74427084006072),
                    new THREE.Vector2(614.5498311031354, 222.68557017264703)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(606.6530946967665, 210.61124480217475),
                    new THREE.Vector2(618.3817124262961, 224.55254413476106)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(611.2041560923094, 212.8286185694948),
                    new THREE.Vector2(623.6519538942212, 227.12031770728714)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(618.6963115511139, 215.7960669198351),
                    new THREE.Vector2(629.7425101322051, 227.2110457681015)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(625.6184197477967, 219.16866504494365),
                    new THREE.Vector2(635.9454382565023, 230.23324408800138)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(631.5966040994693, 222.0813634257203),
                    new THREE.Vector2(642.6428026805593, 233.49634227398582)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(638.213261245466, 225.47586153865475),
                    new THREE.Vector2(647.4523194146149, 236.55882104368283)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(641.5782769618161, 227.62753534249916),
                    new THREE.Vector2(653.3068946913496, 241.56883467508612)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(649.1153811751565, 230.61688368066336),
                    new THREE.Vector2(660.1615797562429, 242.03186252892624)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(656.0374893718323, 233.98948180577264),
                    new THREE.Vector2(669.9604082424486, 246.80605987486047)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(665.8925038011911, 238.79105413648855),
                    new THREE.Vector2(679.8154226718082, 251.60763220557808)
                )
            )
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(593.5727403514207, 54.371971791480554),
                        new THREE.Vector2(605.4953333335512, 63.41975380043796)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(594.325037611644, 47.442246159194674),
                        new THREE.Vector2(603.7813966012243, 55.46119966218841)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(595.0470491528565, 40.02731532105767),
                        new THREE.Vector2(604.5034081424363, 48.04626882405083)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(595.6963749684433, 33.358854030384094),
                        new THREE.Vector2(605.1527339580226, 41.37780753337686)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(596.2742264871654, 26.628186944088533),
                        new THREE.Vector2(605.8081169174129, 35.44337463104286)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(597.0253123186288, 19.710902470927138),
                        new THREE.Vector2(606.4816713082087, 27.729855973920493)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(597.6746381342155, 13.04244118025353),
                        new THREE.Vector2(607.130997123795, 21.061394683246494)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(598.2524896529376, 7.904242461879855),
                        new THREE.Vector2(610.0200197537332, 15.359556102916335)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(598.774615448681, 3.3383370632284253),
                        new THREE.Vector2(608.8721457408864, 9.842353638967532)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(599.1731755108598, -3.143506840579162),
                        new THREE.Vector2(608.7070659411073, 5.671680846375162)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(599.9194156272814, -10.807260861203979),
                        new THREE.Vector2(612.6382427933729, -1.6819474115788817)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(600.5747985866702, -17.537927947499554),
                        new THREE.Vector2(610.1086890169178, -8.722740260545228)
                    )
                )
            ),
            false
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(593.5727403514207, 54.371971791480554),
                    new THREE.Vector2(605.4953333335512, 63.41975380043796)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(594.325037611644, 47.442246159194674),
                    new THREE.Vector2(603.7813966012243, 55.46119966218841)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(595.0470491528565, 40.02731532105767),
                    new THREE.Vector2(604.5034081424363, 48.04626882405083)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(595.6963749684433, 33.358854030384094),
                    new THREE.Vector2(605.1527339580226, 41.37780753337686)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(596.2742264871654, 26.628186944088533),
                    new THREE.Vector2(605.8081169174129, 35.44337463104286)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(597.0253123186288, 19.710902470927138),
                    new THREE.Vector2(606.4816713082087, 27.729855973920493)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(597.6746381342155, 13.04244118025353),
                    new THREE.Vector2(607.130997123795, 21.061394683246494)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(598.2524896529376, 7.904242461879855),
                    new THREE.Vector2(610.0200197537332, 15.359556102916335)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(598.774615448681, 3.3383370632284253),
                    new THREE.Vector2(608.8721457408864, 9.842353638967532)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(599.1731755108598, -3.143506840579162),
                    new THREE.Vector2(608.7070659411073, 5.671680846375162)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(599.9194156272814, -10.807260861203979),
                    new THREE.Vector2(612.6382427933729, -1.6819474115788817)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(600.5747985866702, -17.537927947499554),
                    new THREE.Vector2(610.1086890169178, -8.722740260545228)
                )
            )
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(539.656714487097, -56.299624194996994),
                        new THREE.Vector2(549.6397761732198, -44.19629070280874)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(547.2889213100893, -55.48101299736169),
                        new THREE.Vector2(557.0069351885462, -45.76299911890478)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(555.4001082130688, -54.56991115850962),
                        new THREE.Vector2(562.026045209106, -44.410187819030256)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(559.5758020287367, -54.115740696415145),
                        new THREE.Vector2(569.2938159071936, -44.39772681795824)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(566.7151838553617, -53.292988126785076),
                        new THREE.Vector2(574.3129259277533, -41.454702442262814)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(571.9813801773804, -52.69801101686805),
                        new THREE.Vector2(580.4625780569044, -39.97626952521335)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(578.9937945092684, -51.958085887133606),
                        new THREE.Vector2(587.9167018498148, -42.3284212778987)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(585.901282557364, -51.190551610767265),
                        new THREE.Vector2(594.8241898979119, -41.56088700153099)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(593.6038771433736, -50.3346680651791),
                        new THREE.Vector2(601.7316779460086, -40.79335272516687)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(600.2628943983722, -49.59474293544454),
                        new THREE.Vector2(608.390695201009, -40.0534275954311)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(605.9909622111842, -48.94517398932947),
                        new THREE.Vector2(613.5161581189013, -37.14274154401619)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(611.5151646410889, -48.38737983263802),
                        new THREE.Vector2(618.0790040846875, -38.25917660770949)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(615.6883912432818, -47.961592645743636),
                        new THREE.Vector2(624.5565047609125, -38.380606371846866)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(623.0156984745652, -47.16437408304772),
                        new THREE.Vector2(632.2151236026682, -34.400585173614886)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(630.0731672171628, -46.46421946873199),
                        new THREE.Vector2(638.9412807347943, -36.883233194834446)
                    )
                )
            ),
            false
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(539.656714487097, -56.299624194996994),
                    new THREE.Vector2(549.6397761732198, -44.19629070280874)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(547.2889213100893, -55.48101299736169),
                    new THREE.Vector2(557.0069351885462, -45.76299911890478)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(555.4001082130688, -54.56991115850962),
                    new THREE.Vector2(562.026045209106, -44.410187819030256)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(559.5758020287367, -54.115740696415145),
                    new THREE.Vector2(569.2938159071936, -44.39772681795824)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(566.7151838553617, -53.292988126785076),
                    new THREE.Vector2(574.3129259277533, -41.454702442262814)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(571.9813801773804, -52.69801101686805),
                    new THREE.Vector2(580.4625780569044, -39.97626952521335)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(578.9937945092684, -51.958085887133606),
                    new THREE.Vector2(587.9167018498148, -42.3284212778987)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(585.901282557364, -51.190551610767265),
                    new THREE.Vector2(594.8241898979119, -41.56088700153099)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(593.6038771433736, -50.3346680651791),
                    new THREE.Vector2(601.7316779460086, -40.79335272516687)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(600.2628943983722, -49.59474293544454),
                    new THREE.Vector2(608.390695201009, -40.0534275954311)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(605.9909622111842, -48.94517398932947),
                    new THREE.Vector2(613.5161581189013, -37.14274154401619)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(611.5151646410889, -48.38737983263802),
                    new THREE.Vector2(618.0790040846875, -38.25917660770949)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(615.6883912432818, -47.961592645743636),
                    new THREE.Vector2(624.5565047609125, -38.380606371846866)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(623.0156984745652, -47.16437408304772),
                    new THREE.Vector2(632.2151236026682, -34.400585173614886)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(630.0731672171628, -46.46421946873199),
                    new THREE.Vector2(638.9412807347943, -36.883233194834446)
                )
            )
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-74.15248497762822, -222.11546048968407),
                        new THREE.Vector2(-60.392444377889476, -207.87545696006583)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-67.94253636311106, -223.8929866372305),
                        new THREE.Vector2(-57.54245692783313, -211.89303076902246)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-65.0725601113132, -230.3655818496019),
                        new THREE.Vector2(-50.832556581694924, -216.60554124986268)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-56.942627384094735, -234.06313624090973),
                        new THREE.Vector2(-45.90259737564493, -222.70313094587374)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-52.17266685410315, -238.60070298886404),
                        new THREE.Vector2(-39.852647437185965, -226.28068357194684)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-45.57272146669331, -242.59076168293265),
                        new THREE.Vector2(-34.532691458243676, -231.2307563878967)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-40.212765818736365, -249.01085612301324),
                        new THREE.Vector2(-25.972762289118133, -235.2508155232745)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-32.9028263063174, -252.5734085284322),
                        new THREE.Vector2(-21.222801593634046, -240.73339617245568)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-28.62290585281704, -259.30344868728963),
                        new THREE.Vector2(-15.662847600603808, -245.38346457531918)
                    )
                )
            ),
            false
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-74.15248497762822, -222.11546048968407),
                    new THREE.Vector2(-60.392444377889476, -207.87545696006583)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-67.94253636311106, -223.8929866372305),
                    new THREE.Vector2(-57.54245692783313, -211.89303076902246)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-65.0725601113132, -230.3655818496019),
                    new THREE.Vector2(-50.832556581694924, -216.60554124986268)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-56.942627384094735, -234.06313624090973),
                    new THREE.Vector2(-45.90259737564493, -222.70313094587374)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-52.17266685410315, -238.60070298886404),
                    new THREE.Vector2(-39.852647437185965, -226.28068357194684)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-45.57272146669331, -242.59076168293265),
                    new THREE.Vector2(-34.532691458243676, -231.2307563878967)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-40.212765818736365, -249.01085612301324),
                    new THREE.Vector2(-25.972762289118133, -235.2508155232745)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-32.9028263063174, -252.5734085284322),
                    new THREE.Vector2(-21.222801593634046, -240.73339617245568)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-28.62290585281704, -259.30344868728963),
                    new THREE.Vector2(-15.662847600603808, -245.38346457531918)
                )
            )
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(203.3996522998221, -115.83714231277929),
                        new THREE.Vector2(213.50685289214587, -103.64241127179292)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(211.05054206485198, -114.92802799254551),
                        new THREE.Vector2(220.86339198350842, -105.11517807388906)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(219.14014153163853, -113.91619755181333),
                        new THREE.Vector2(225.87526684507753, -103.70185482393663)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(223.31971097101996, -113.41181540787245),
                        new THREE.Vector2(233.1325608896764, -103.598965489216)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(230.41911628125163, -112.4981018583627),
                        new THREE.Vector2(238.14443575124548, -100.59772149104363)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(235.66782628442394, -111.83734591903591),
                        new THREE.Vector2(244.28522301975235, -99.04488828638333)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(242.70971198248665, -111.01561695504739),
                        new THREE.Vector2(251.72860152703313, -101.30088392761337)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(249.60724273256693, -110.16322646255172),
                        new THREE.Vector2(258.6261322771134, -100.4484934351177)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(257.29873385675717, -109.21271907883362),
                        new THREE.Vector2(265.52366302719366, -99.59610294262203)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(263.94815198992734, -108.39099011484488),
                        new THREE.Vector2(272.1730811603646, -98.7743739786327)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(269.57128722954906, -107.65971265995202),
                        new THREE.Vector2(277.29660669954285, -95.75933229263295)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(275.1143479063907, -106.99895672062543),
                        new THREE.Vector2(281.8494732198297, -96.78461399274873)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(279.2939173457707, -106.49457457668451),
                        new THREE.Vector2(288.3128068903187, -96.77984154924914)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(286.5433183816887, -105.55019949866765),
                        new THREE.Vector2(295.95467549112703, -92.65962497479248)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(293.6472322339773, -104.72080515255233),
                        new THREE.Vector2(302.66612177852534, -95.00607212511696)
                    )
                )
            ),
            false
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(203.3996522998221, -115.83714231277929),
                    new THREE.Vector2(213.50685289214587, -103.64241127179292)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(211.05054206485198, -114.92802799254551),
                    new THREE.Vector2(220.86339198350842, -105.11517807388906)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(219.14014153163853, -113.91619755181333),
                    new THREE.Vector2(225.87526684507753, -103.70185482393663)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(223.31971097101996, -113.41181540787245),
                    new THREE.Vector2(233.1325608896764, -103.598965489216)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(230.41911628125163, -112.4981018583627),
                    new THREE.Vector2(238.14443575124548, -100.59772149104363)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(235.66782628442394, -111.83734591903591),
                    new THREE.Vector2(244.28522301975235, -99.04488828638333)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(242.70971198248665, -111.01561695504739),
                    new THREE.Vector2(251.72860152703313, -101.30088392761337)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(249.60724273256693, -110.16322646255172),
                    new THREE.Vector2(258.6261322771134, -100.4484934351177)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(257.29873385675717, -109.21271907883362),
                    new THREE.Vector2(265.52366302719366, -99.59610294262203)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(263.94815198992734, -108.39099011484488),
                    new THREE.Vector2(272.1730811603646, -98.7743739786327)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(269.57128722954906, -107.65971265995202),
                    new THREE.Vector2(277.29660669954285, -95.75933229263295)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(275.1143479063907, -106.99895672062543),
                    new THREE.Vector2(281.8494732198297, -96.78461399274873)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(279.2939173457707, -106.49457457668451),
                    new THREE.Vector2(288.3128068903187, -96.77984154924914)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(286.5433183816887, -105.55019949866765),
                    new THREE.Vector2(295.95467549112703, -92.65962497479248)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(293.6472322339773, -104.72080515255233),
                    new THREE.Vector2(302.66612177852534, -95.00607212511696)
                )
            )
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(163.30152398891528, 374.4740879190929),
                        new THREE.Vector2(172.90152398891527, 385.6740879190929)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(171.42652398891528, 374.4740879190929),
                        new THREE.Vector2(178.62652398891527, 386.4740879190929)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(178.25152398891527, 374.4740879190929),
                        new THREE.Vector2(186.25152398891527, 383.2740879190929)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(186.0015239889153, 374.4740879190929),
                        new THREE.Vector2(190.80152398891528, 386.4740879190929)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(188.92652398891528, 374.4740879190929),
                        new THREE.Vector2(196.92652398891528, 383.2740879190929)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(195.87652398891527, 377.6740879190929),
                        new THREE.Vector2(202.27652398891527, 380.8740879190929)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(201.0390239889153, 374.4740879190929),
                        new THREE.Vector2(209.8390239889153, 385.6740879190929)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(208.00152398891527, 374.4740879190929),
                        new THREE.Vector2(216.00152398891527, 383.2740879190929)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(214.8890239889153, 374.4740879190929),
                        new THREE.Vector2(222.0890239889153, 386.4740879190929)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(222.3037861814869, 374.5548901238782),
                        new THREE.Vector2(228.00524345461554, 384.2137176328672)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(226.4245360774094, 374.5984877490612),
                        new THREE.Vector2(234.51737748604629, 383.4828032048701)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(234.14017657980364, 374.6806474074605),
                        new THREE.Vector2(238.26716675558419, 386.7223780549618)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(237.7274749809949, 374.71867937836475),
                        new THREE.Vector2(245.8542403776158, 386.802815010846)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(244.53601824927733, 374.7905028216753),
                        new THREE.Vector2(252.62885965791423, 383.6748182774843)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(252.27710174265962, 374.87266248007467),
                        new THREE.Vector2(257.9785590157883, 384.5314899890637)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(256.42329462957014, 378.11608028192995),
                        new THREE.Vector2(262.8568589708988, 381.38374843457035)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(262.33457358615925, 374.9794700359939),
                        new THREE.Vector2(271.2528130299523, 386.2721316213032)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(269.8011169289666, 375.0584493205198),
                        new THREE.Vector2(275.5025742020952, 384.71727682950876)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(274.68789788107324, 375.1105279426988),
                        new THREE.Vector2(278.81488805685365, 387.1522585902)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(277.50916522608037, 375.140078916607),
                        new THREE.Vector2(285.60200663471716, 384.02439437241594)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(285.25872971645856, 372.0224183983341),
                        new THREE.Vector2(292.5855400689114, 384.09807303381933)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(292.0833461870174, 375.2945920806292),
                        new THREE.Vector2(300.17618759565437, 384.17890753643815)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(299.8244296803998, 375.3767517390285),
                        new THREE.Vector2(305.5258869535284, 385.0355792480175)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(303.9706225673047, 378.6201695408838),
                        new THREE.Vector2(310.40418690863703, 381.88783769353165)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(309.08194647973136, 375.47507829795177),
                        new THREE.Vector2(318.0001859235243, 386.767739883261)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(316.0440552235068, 375.5488894749332),
                        new THREE.Vector2(322.56242953479546, 386.81610806925437)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(321.44821446806816, 375.60600368907853),
                        new THREE.Vector2(327.14967174119676, 385.2648311980675)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(325.56896436399063, 375.64960131426153),
                        new THREE.Vector2(333.6618057726276, 384.5339167700705)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(333.2346076761245, 375.73123091034864),
                        new THREE.Vector2(341.36137307274527, 387.81536654282985)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(340.03065164684165, 375.8029218380811),
                        new THREE.Vector2(348.1234930554786, 384.68723729389006)
                    )
                )
            ),
            false
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(163.30152398891528, 374.4740879190929),
                    new THREE.Vector2(172.90152398891527, 385.6740879190929)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(171.42652398891528, 374.4740879190929),
                    new THREE.Vector2(178.62652398891527, 386.4740879190929)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(178.25152398891527, 374.4740879190929),
                    new THREE.Vector2(186.25152398891527, 383.2740879190929)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(186.0015239889153, 374.4740879190929),
                    new THREE.Vector2(190.80152398891528, 386.4740879190929)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(188.92652398891528, 374.4740879190929),
                    new THREE.Vector2(196.92652398891528, 383.2740879190929)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(195.87652398891527, 377.6740879190929),
                    new THREE.Vector2(202.27652398891527, 380.8740879190929)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(201.0390239889153, 374.4740879190929),
                    new THREE.Vector2(209.8390239889153, 385.6740879190929)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(208.00152398891527, 374.4740879190929),
                    new THREE.Vector2(216.00152398891527, 383.2740879190929)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(214.8890239889153, 374.4740879190929),
                    new THREE.Vector2(222.0890239889153, 386.4740879190929)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(222.3037861814869, 374.5548901238782),
                    new THREE.Vector2(228.00524345461554, 384.2137176328672)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(226.4245360774094, 374.5984877490612),
                    new THREE.Vector2(234.51737748604629, 383.4828032048701)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(234.14017657980364, 374.6806474074605),
                    new THREE.Vector2(238.26716675558419, 386.7223780549618)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(237.7274749809949, 374.71867937836475),
                    new THREE.Vector2(245.8542403776158, 386.802815010846)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(244.53601824927733, 374.7905028216753),
                    new THREE.Vector2(252.62885965791423, 383.6748182774843)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(252.27710174265962, 374.87266248007467),
                    new THREE.Vector2(257.9785590157883, 384.5314899890637)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(256.42329462957014, 378.11608028192995),
                    new THREE.Vector2(262.8568589708988, 381.38374843457035)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(262.33457358615925, 374.9794700359939),
                    new THREE.Vector2(271.2528130299523, 386.2721316213032)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(269.8011169289666, 375.0584493205198),
                    new THREE.Vector2(275.5025742020952, 384.71727682950876)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(274.68789788107324, 375.1105279426988),
                    new THREE.Vector2(278.81488805685365, 387.1522585902)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(277.50916522608037, 375.140078916607),
                    new THREE.Vector2(285.60200663471716, 384.02439437241594)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(285.25872971645856, 372.0224183983341),
                    new THREE.Vector2(292.5855400689114, 384.09807303381933)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(292.0833461870174, 375.2945920806292),
                    new THREE.Vector2(300.17618759565437, 384.17890753643815)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(299.8244296803998, 375.3767517390285),
                    new THREE.Vector2(305.5258869535284, 385.0355792480175)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(303.9706225673047, 378.6201695408838),
                    new THREE.Vector2(310.40418690863703, 381.88783769353165)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(309.08194647973136, 375.47507829795177),
                    new THREE.Vector2(318.0001859235243, 386.767739883261)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(316.0440552235068, 375.5488894749332),
                    new THREE.Vector2(322.56242953479546, 386.81610806925437)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(321.44821446806816, 375.60600368907853),
                    new THREE.Vector2(327.14967174119676, 385.2648311980675)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(325.56896436399063, 375.64960131426153),
                    new THREE.Vector2(333.6618057726276, 384.5339167700705)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(333.2346076761245, 375.73123091034864),
                    new THREE.Vector2(341.36137307274527, 387.81536654282985)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(340.03065164684165, 375.8029218380811),
                    new THREE.Vector2(348.1234930554786, 384.68723729389006)
                )
            )
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-216.46701292072567, 154.46206685051914),
                        new THREE.Vector2(-208.46701292072567, 165.66206685051912)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-209.85451292072565, 154.46206685051914),
                        new THREE.Vector2(-201.85451292072565, 163.26206685051912)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-202.15451292072567, 154.46206685051914),
                        new THREE.Vector2(-194.95451292072568, 163.26206685051912)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-194.70451292072568, 154.46206685051914),
                        new THREE.Vector2(-189.9045129207257, 166.46206685051914)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-191.77951292072567, 157.66206685051912),
                        new THREE.Vector2(-185.37951292072566, 160.86206685051914)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-185.81701292072563, 154.46206685051914),
                        new THREE.Vector2(-178.61701292072564, 165.66206685051912)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-180.29201292072565, 154.46206685051914),
                        new THREE.Vector2(-171.49201292072564, 166.46206685051914)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-172.04201292072565, 154.46206685051914),
                        new THREE.Vector2(-164.04201292072565, 166.46206685051914)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-165.26701292072568, 154.46206685051914),
                        new THREE.Vector2(-157.26701292072568, 163.26206685051912)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-158.3170129207257, 157.66206685051912),
                        new THREE.Vector2(-151.91701292072568, 160.86206685051914)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-153.15451292072567, 154.46206685051914),
                        new THREE.Vector2(-143.55451292072567, 165.66206685051912)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-145.02951292072567, 154.46206685051914),
                        new THREE.Vector2(-140.22951292072568, 166.46206685051914)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-141.30451292072564, 154.46206685051914),
                        new THREE.Vector2(-136.50451292072566, 166.46206685051914)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-138.37951292072563, 154.46206685051914),
                        new THREE.Vector2(-130.37951292072563, 163.26206685051912)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-131.42951292072564, 154.46206685051914),
                        new THREE.Vector2(-123.42951292072564, 163.26206685051912)
                    )
                )
            ),
            false
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-216.46701292072567, 154.46206685051914),
                    new THREE.Vector2(-208.46701292072567, 165.66206685051912)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-209.85451292072565, 154.46206685051914),
                    new THREE.Vector2(-201.85451292072565, 163.26206685051912)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-202.15451292072567, 154.46206685051914),
                    new THREE.Vector2(-194.95451292072568, 163.26206685051912)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-194.70451292072568, 154.46206685051914),
                    new THREE.Vector2(-189.9045129207257, 166.46206685051914)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-191.77951292072567, 157.66206685051912),
                    new THREE.Vector2(-185.37951292072566, 160.86206685051914)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-185.81701292072563, 154.46206685051914),
                    new THREE.Vector2(-178.61701292072564, 165.66206685051912)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-180.29201292072565, 154.46206685051914),
                    new THREE.Vector2(-171.49201292072564, 166.46206685051914)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-172.04201292072565, 154.46206685051914),
                    new THREE.Vector2(-164.04201292072565, 166.46206685051914)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-165.26701292072568, 154.46206685051914),
                    new THREE.Vector2(-157.26701292072568, 163.26206685051912)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-158.3170129207257, 157.66206685051912),
                    new THREE.Vector2(-151.91701292072568, 160.86206685051914)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-153.15451292072567, 154.46206685051914),
                    new THREE.Vector2(-143.55451292072567, 165.66206685051912)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-145.02951292072567, 154.46206685051914),
                    new THREE.Vector2(-140.22951292072568, 166.46206685051914)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-141.30451292072564, 154.46206685051914),
                    new THREE.Vector2(-136.50451292072566, 166.46206685051914)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-138.37951292072563, 154.46206685051914),
                    new THREE.Vector2(-130.37951292072563, 163.26206685051912)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-131.42951292072564, 154.46206685051914),
                    new THREE.Vector2(-123.42951292072564, 163.26206685051912)
                )
            )
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-609.3701269439083, -361.7390639555104),
                        new THREE.Vector2(-595.9155950408124, -349.77259311275157)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-607.6394414045286, -354.37052515806636),
                        new THREE.Vector2(-594.9904432487467, -346.73845051954504)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-605.9889389773874, -351.72981143860306),
                        new THREE.Vector2(-593.3292718853423, -342.0802984569144)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-602.2462841098164, -347.38388347876867),
                        new THREE.Vector2(-591.6040553609387, -337.7450394333431)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-603.2443422309815, -341.36826657524057),
                        new THREE.Vector2(-589.570621499216, -330.7046999538208)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-598.0673373546467, -335.02108023607923),
                        new THREE.Vector2(-587.1689279617732, -324.62436319493156)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-598.6330906390768, -327.72655265226985),
                        new THREE.Vector2(-584.7031892633212, -316.3051130351432)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-591.5026925805684, -321.30198498178316),
                        new THREE.Vector2(-586.4217554457294, -314.21427844004006)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-594.2072893049983, -316.651442379889),
                        new THREE.Vector2(-580.8219632702298, -304.7982559784874)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-589.7757160698735, -310.09534826168345),
                        new THREE.Vector2(-578.9201842411221, -299.75052964405467)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-590.4156171715779, -302.77912728919375),
                        new THREE.Vector2(-576.519577925688, -291.4366540989168)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-588.0539817378869, -295.5816761376865),
                        new THREE.Vector2(-575.4050107078074, -288.0398372188301)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-583.8950100146988, -292.1729822755011),
                        new THREE.Vector2(-573.2888918291146, -282.5882905121647)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-579.5057585120736, -284.80146933089054),
                        new THREE.Vector2(-574.4337267528191, -277.71550811319094)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-582.4111774826536, -280.9272757628689),
                        new THREE.Vector2(-568.9913779180774, -269.0179232921273)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-580.1932569337575, -274.3274852594677),
                        new THREE.Vector2(-567.5379829443825, -264.6931054577604)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-576.9604078475651, -269.2206455701212),
                        new THREE.Vector2(-566.076624162615, -260.8542737082275)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-574.8920371962109, -265.3223851112),
                        new THREE.Vector2(-564.0020521590706, -254.9358824386709)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-575.4724812011456, -258.02351446471147),
                        new THREE.Vector2(-561.5491992719523, -246.61764435856816)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-570.2849742248076, -251.61330501706067),
                        new THREE.Vector2(-559.3949891876679, -241.2268023445323)
                    )
                )
            ),
            false
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-609.3701269439083, -361.7390639555104),
                    new THREE.Vector2(-595.9155950408124, -349.77259311275157)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-607.6394414045286, -354.37052515806636),
                    new THREE.Vector2(-594.9904432487467, -346.73845051954504)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-605.9889389773874, -351.72981143860306),
                    new THREE.Vector2(-593.3292718853423, -342.0802984569144)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-602.2462841098164, -347.38388347876867),
                    new THREE.Vector2(-591.6040553609387, -337.7450394333431)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-603.2443422309815, -341.36826657524057),
                    new THREE.Vector2(-589.570621499216, -330.7046999538208)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-598.0673373546467, -335.02108023607923),
                    new THREE.Vector2(-587.1689279617732, -324.62436319493156)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-598.6330906390768, -327.72655265226985),
                    new THREE.Vector2(-584.7031892633212, -316.3051130351432)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-591.5026925805684, -321.30198498178316),
                    new THREE.Vector2(-586.4217554457294, -314.21427844004006)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-594.2072893049983, -316.651442379889),
                    new THREE.Vector2(-580.8219632702298, -304.7982559784874)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-589.7757160698735, -310.09534826168345),
                    new THREE.Vector2(-578.9201842411221, -299.75052964405467)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-590.4156171715779, -302.77912728919375),
                    new THREE.Vector2(-576.519577925688, -291.4366540989168)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-588.0539817378869, -295.5816761376865),
                    new THREE.Vector2(-575.4050107078074, -288.0398372188301)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-583.8950100146988, -292.1729822755011),
                    new THREE.Vector2(-573.2888918291146, -282.5882905121647)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-579.5057585120736, -284.80146933089054),
                    new THREE.Vector2(-574.4337267528191, -277.71550811319094)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-582.4111774826536, -280.9272757628689),
                    new THREE.Vector2(-568.9913779180774, -269.0179232921273)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-580.1932569337575, -274.3274852594677),
                    new THREE.Vector2(-567.5379829443825, -264.6931054577604)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-576.9604078475651, -269.2206455701212),
                    new THREE.Vector2(-566.076624162615, -260.8542737082275)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-574.8920371962109, -265.3223851112),
                    new THREE.Vector2(-564.0020521590706, -254.9358824386709)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-575.4724812011456, -258.02351446471147),
                    new THREE.Vector2(-561.5491992719523, -246.61764435856816)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-570.2849742248076, -251.61330501706067),
                    new THREE.Vector2(-559.3949891876679, -241.2268023445323)
                )
            )
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-339.676451335198, 374.4740879190929),
                        new THREE.Vector2(-329.27645133519803, 385.6740879190929)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-330.813951335198, 374.4740879190929),
                        new THREE.Vector2(-324.413951335198, 385.6740879190929)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-326.2264513351981, 374.4740879190929),
                        new THREE.Vector2(-319.8264513351981, 385.6740879190929)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-321.63895133519804, 374.4740879190929),
                        new THREE.Vector2(-312.83895133519803, 383.2740879190929)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-314.1889513351981, 377.6740879190929),
                        new THREE.Vector2(-307.78895133519813, 380.8740879190929)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-309.0264513351981, 374.4740879190929),
                        new THREE.Vector2(-301.0264513351981, 383.2740879190929)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-302.7764513351981, 374.4740879190929),
                        new THREE.Vector2(-293.9764513351981, 383.2740879190929)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-294.5264513351981, 374.4740879190929),
                        new THREE.Vector2(-287.3264513351981, 383.2740879190929)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-287.82645133519804, 377.6740879190929),
                        new THREE.Vector2(-281.42645133519807, 380.8740879190929)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-281.863951335198, 374.4740879190929),
                        new THREE.Vector2(-273.863951335198, 385.6740879190929)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-274.1014513351981, 374.4740879190929),
                        new THREE.Vector2(-270.1014513351981, 386.4740879190929)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-271.3139513351981, 374.4740879190929),
                        new THREE.Vector2(-264.1139513351981, 383.2740879190929)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-264.5514513351981, 374.4740879190929),
                        new THREE.Vector2(-253.35145133519813, 383.2740879190929)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-254.38895133519813, 374.4740879190929),
                        new THREE.Vector2(-246.38895133519813, 383.2740879190929)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-246.6889513351982, 374.4740879190929),
                        new THREE.Vector2(-241.0889513351982, 384.0740879190929)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-242.57645133519813, 374.4740879190929),
                        new THREE.Vector2(-234.57645133519813, 383.2740879190929)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-235.68895133519808, 374.4740879190929),
                        new THREE.Vector2(-227.68895133519808, 386.4740879190929)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-229.9889513351981, 377.6740879190929),
                        new THREE.Vector2(-223.5889513351981, 380.8740879190929)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-224.92385555017748, 374.4941970069062),
                        new THREE.Vector2(-215.21082883953167, 385.7909244096695)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-216.8073814712435, 374.5765495686014),
                        new THREE.Vector2(-211.88599963655426, 386.6245845178195)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-213.0825728152761, 374.61430505073247),
                        new THREE.Vector2(-208.16119098058684, 386.66233999995063)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-210.1252888256051, 374.6439519729427),
                        new THREE.Vector2(-202.03650560668083, 383.52458553792576)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-203.17564582990528, 374.7143950872543),
                        new THREE.Vector2(-195.08686261098396, 383.59502865223465)
                    )
                )
            ),
            false
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-339.676451335198, 374.4740879190929),
                    new THREE.Vector2(-329.27645133519803, 385.6740879190929)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-330.813951335198, 374.4740879190929),
                    new THREE.Vector2(-324.413951335198, 385.6740879190929)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-326.2264513351981, 374.4740879190929),
                    new THREE.Vector2(-319.8264513351981, 385.6740879190929)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-321.63895133519804, 374.4740879190929),
                    new THREE.Vector2(-312.83895133519803, 383.2740879190929)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-314.1889513351981, 377.6740879190929),
                    new THREE.Vector2(-307.78895133519813, 380.8740879190929)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-309.0264513351981, 374.4740879190929),
                    new THREE.Vector2(-301.0264513351981, 383.2740879190929)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-302.7764513351981, 374.4740879190929),
                    new THREE.Vector2(-293.9764513351981, 383.2740879190929)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-294.5264513351981, 374.4740879190929),
                    new THREE.Vector2(-287.3264513351981, 383.2740879190929)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-287.82645133519804, 377.6740879190929),
                    new THREE.Vector2(-281.42645133519807, 380.8740879190929)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-281.863951335198, 374.4740879190929),
                    new THREE.Vector2(-273.863951335198, 385.6740879190929)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-274.1014513351981, 374.4740879190929),
                    new THREE.Vector2(-270.1014513351981, 386.4740879190929)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-271.3139513351981, 374.4740879190929),
                    new THREE.Vector2(-264.1139513351981, 383.2740879190929)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-264.5514513351981, 374.4740879190929),
                    new THREE.Vector2(-253.35145133519813, 383.2740879190929)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-254.38895133519813, 374.4740879190929),
                    new THREE.Vector2(-246.38895133519813, 383.2740879190929)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-246.6889513351982, 374.4740879190929),
                    new THREE.Vector2(-241.0889513351982, 384.0740879190929)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-242.57645133519813, 374.4740879190929),
                    new THREE.Vector2(-234.57645133519813, 383.2740879190929)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-235.68895133519808, 374.4740879190929),
                    new THREE.Vector2(-227.68895133519808, 386.4740879190929)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-229.9889513351981, 377.6740879190929),
                    new THREE.Vector2(-223.5889513351981, 380.8740879190929)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-224.92385555017748, 374.4941970069062),
                    new THREE.Vector2(-215.21082883953167, 385.7909244096695)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-216.8073814712435, 374.5765495686014),
                    new THREE.Vector2(-211.88599963655426, 386.6245845178195)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-213.0825728152761, 374.61430505073247),
                    new THREE.Vector2(-208.16119098058684, 386.66233999995063)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-210.1252888256051, 374.6439519729427),
                    new THREE.Vector2(-202.03650560668083, 383.52458553792576)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-203.17564582990528, 374.7143950872543),
                    new THREE.Vector2(-195.08686261098396, 383.59502865223465)
                )
            )
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-522.1998787947389, 79.45797534294789),
                        new THREE.Vector2(-510.92005157572413, 87.57012123896806)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-522.2422105996562, 75.23764877190692),
                        new THREE.Vector2(-510.19458087345305, 80.15799552138225)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-522.3037612952112, 69.14511514215488),
                        new THREE.Vector2(-513.423812892009, 77.23314321460836)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-522.3570214889241, 63.821264933668566),
                        new THREE.Vector2(-511.09327281895384, 70.33349161914697)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-522.411160978287, 58.45815479048914),
                        new THREE.Vector2(-513.539251849607, 65.74622325767172)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-522.4106585236342, 58.58050573651873),
                        new THREE.Vector2(-520.7946607640457, 60.19650349610716)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-522.5092652501953, 48.663990634328904),
                        new THREE.Vector2(-510.43751770043184, 55.98421619960046)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-522.5858895854889, 41.07153274467975),
                        new THREE.Vector2(-513.7059411822868, 49.15956081713321)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-522.6396522338596, 35.71376360990847),
                        new THREE.Vector2(-512.9838620489533, 41.409952141071535)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-522.6407827568415, 35.681662035639654),
                        new THREE.Vector2(-521.0247849972553, 37.2976597952259)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-522.7554680324495, 24.173266997430304),
                        new THREE.Vector2(-511.46760153891245, 33.085372498721405)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-522.8167675006961, 18.097692830796763),
                        new THREE.Vector2(-513.9368190974831, 26.18572090326224)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-525.9875823473328, 10.419899249701391),
                        new THREE.Vector2(-513.9875823473328, 18.41989924970139)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-522.7875823473329, 3.6448992497014014),
                        new THREE.Vector2(-513.9875823473328, 10.8448992497014)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-522.7875823473329, -4.605100750298583),
                        new THREE.Vector2(-510.7875823473329, 3.3948992497014183)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-522.7875823473329, -8.980100750298579),
                        new THREE.Vector2(-510.7875823473329, -4.180100750298577)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-522.7875823473329, -11.905100750298569),
                        new THREE.Vector2(-510.7875823473329, -7.905100750298568)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-522.7875823473329, -19.492600750298575),
                        new THREE.Vector2(-510.7875823473329, -11.492600750298575)
                    )
                )
            ),
            false
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-522.1998787947389, 79.45797534294789),
                    new THREE.Vector2(-510.92005157572413, 87.57012123896806)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-522.2422105996562, 75.23764877190692),
                    new THREE.Vector2(-510.19458087345305, 80.15799552138225)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-522.3037612952112, 69.14511514215488),
                    new THREE.Vector2(-513.423812892009, 77.23314321460836)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-522.3570214889241, 63.821264933668566),
                    new THREE.Vector2(-511.09327281895384, 70.33349161914697)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-522.411160978287, 58.45815479048914),
                    new THREE.Vector2(-513.539251849607, 65.74622325767172)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-522.4106585236342, 58.58050573651873),
                    new THREE.Vector2(-520.7946607640457, 60.19650349610716)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-522.5092652501953, 48.663990634328904),
                    new THREE.Vector2(-510.43751770043184, 55.98421619960046)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-522.5858895854889, 41.07153274467975),
                    new THREE.Vector2(-513.7059411822868, 49.15956081713321)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-522.6396522338596, 35.71376360990847),
                    new THREE.Vector2(-512.9838620489533, 41.409952141071535)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-522.6407827568415, 35.681662035639654),
                    new THREE.Vector2(-521.0247849972553, 37.2976597952259)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-522.7554680324495, 24.173266997430304),
                    new THREE.Vector2(-511.46760153891245, 33.085372498721405)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-522.8167675006961, 18.097692830796763),
                    new THREE.Vector2(-513.9368190974831, 26.18572090326224)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-525.9875823473328, 10.419899249701391),
                    new THREE.Vector2(-513.9875823473328, 18.41989924970139)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-522.7875823473329, 3.6448992497014014),
                    new THREE.Vector2(-513.9875823473328, 10.8448992497014)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-522.7875823473329, -4.605100750298583),
                    new THREE.Vector2(-510.7875823473329, 3.3948992497014183)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-522.7875823473329, -8.980100750298579),
                    new THREE.Vector2(-510.7875823473329, -4.180100750298577)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-522.7875823473329, -11.905100750298569),
                    new THREE.Vector2(-510.7875823473329, -7.905100750298568)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-522.7875823473329, -19.492600750298575),
                    new THREE.Vector2(-510.7875823473329, -11.492600750298575)
                )
            )
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(256.2552772407392, 58.290372339418674),
                        new THREE.Vector2(267.0374195169145, 70.96843419200322)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(263.0275468440386, 57.12208900480329),
                        new THREE.Vector2(272.5648459820492, 67.29136133495032)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(270.63408154339646, 56.40388203680148),
                        new THREE.Vector2(276.85829723421836, 68.94782964898741)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(273.36998031429454, 55.10392742471854),
                        new THREE.Vector2(282.9072794523056, 65.273199754866)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(280.12998131324, 53.93803811332944),
                        new THREE.Vector2(289.49495971863576, 67.09485567154347)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(286.7059532468785, 52.654841663833636),
                        new THREE.Vector2(295.458061706246, 62.670896507473934)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(292.5580775236427, 51.66611007121848),
                        new THREE.Vector2(300.9846477638873, 63.884519464281816)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(297.0606553214883, 50.481068574015545),
                        new THREE.Vector2(306.59795445949936, 60.65034090416301)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(304.0052456574029, 46.01880503831919),
                        new THREE.Vector2(313.3702240627986, 59.17562259653322)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(312.10196425925085, 47.69921358462306),
                        new THREE.Vector2(320.8540727186185, 57.715268428263514)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(318.9069823343333, 47.90082004562929),
                        new THREE.Vector2(326.89788015022907, 60.35796353567879)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(323.1598277721176, 47.5602800922508),
                        new THREE.Vector2(331.7336587039558, 56.87848530311465)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(330.89227402263435, 47.20040083287796),
                        new THREE.Vector2(337.12535467534025, 57.15535288071202)
                    )
                )
            ),
            false
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(256.2552772407392, 58.290372339418674),
                    new THREE.Vector2(267.0374195169145, 70.96843419200322)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(263.0275468440386, 57.12208900480329),
                    new THREE.Vector2(272.5648459820492, 67.29136133495032)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(270.63408154339646, 56.40388203680148),
                    new THREE.Vector2(276.85829723421836, 68.94782964898741)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(273.36998031429454, 55.10392742471854),
                    new THREE.Vector2(282.9072794523056, 65.273199754866)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(280.12998131324, 53.93803811332944),
                    new THREE.Vector2(289.49495971863576, 67.09485567154347)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(286.7059532468785, 52.654841663833636),
                    new THREE.Vector2(295.458061706246, 62.670896507473934)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(292.5580775236427, 51.66611007121848),
                    new THREE.Vector2(300.9846477638873, 63.884519464281816)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(297.0606553214883, 50.481068574015545),
                    new THREE.Vector2(306.59795445949936, 60.65034090416301)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(304.0052456574029, 46.01880503831919),
                    new THREE.Vector2(313.3702240627986, 59.17562259653322)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(312.10196425925085, 47.69921358462306),
                    new THREE.Vector2(320.8540727186185, 57.715268428263514)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(318.9069823343333, 47.90082004562929),
                    new THREE.Vector2(326.89788015022907, 60.35796353567879)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(323.1598277721176, 47.5602800922508),
                    new THREE.Vector2(331.7336587039558, 56.87848530311465)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(330.89227402263435, 47.20040083287796),
                    new THREE.Vector2(337.12535467534025, 57.15535288071202)
                )
            )
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(328.3694571091351, -382.03040984798395),
                        new THREE.Vector2(340.3288578470945, -372.92698402209317)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(329.9170750931353, -375.3098997414064),
                        new THREE.Vector2(339.58218458008497, -366.3470357697705)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(328.5102763758622, -367.7538330346323),
                        new THREE.Vector2(338.69283053827075, -361.0825064487904)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(325.7437430813686, -363.1514115983215),
                        new THREE.Vector2(338.12543420964596, -357.7921756231781)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(328.23076742943283, -360.01296548799695),
                        new THREE.Vector2(337.80347649645694, -351.8447474515995)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(327.62131142237314, -353.96912341068736),
                        new THREE.Vector2(337.17366423412034, -345.1331978967557)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(326.2929398927081, -346.3371872295494),
                        new THREE.Vector2(336.4025149988635, -339.8097486124716)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(334.2420437860956, -341.44907152435997),
                        new THREE.Vector2(335.9933083885413, -339.6978069219143)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(323.63370925519837, -338.2127071317152),
                        new THREE.Vector2(335.57415146550625, -329.13797411266773)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(322.4674076462297, -330.85977803861476),
                        new THREE.Vector2(334.86662307885194, -324.9494116105102)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(325.0754734988285, -327.6460128366589),
                        new THREE.Vector2(334.59075604055397, -318.8517135176576)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(322.18630974693195, -321.00312171251295),
                        new THREE.Vector2(333.9399927707233, -313.57533802506674)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(324.0674977819711, -316.20971784210474),
                        new THREE.Vector2(333.50732950980324, -308.2118525597209)
                    )
                )
            ),
            false
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(328.3694571091351, -382.03040984798395),
                    new THREE.Vector2(340.3288578470945, -372.92698402209317)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(329.9170750931353, -375.3098997414064),
                    new THREE.Vector2(339.58218458008497, -366.3470357697705)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(328.5102763758622, -367.7538330346323),
                    new THREE.Vector2(338.69283053827075, -361.0825064487904)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(325.7437430813686, -363.1514115983215),
                    new THREE.Vector2(338.12543420964596, -357.7921756231781)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(328.23076742943283, -360.01296548799695),
                    new THREE.Vector2(337.80347649645694, -351.8447474515995)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(327.62131142237314, -353.96912341068736),
                    new THREE.Vector2(337.17366423412034, -345.1331978967557)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(326.2929398927081, -346.3371872295494),
                    new THREE.Vector2(336.4025149988635, -339.8097486124716)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(334.2420437860956, -341.44907152435997),
                    new THREE.Vector2(335.9933083885413, -339.6978069219143)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(323.63370925519837, -338.2127071317152),
                    new THREE.Vector2(335.57415146550625, -329.13797411266773)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(322.4674076462297, -330.85977803861476),
                    new THREE.Vector2(334.86662307885194, -324.9494116105102)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(325.0754734988285, -327.6460128366589),
                    new THREE.Vector2(334.59075604055397, -318.8517135176576)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(322.18630974693195, -321.00312171251295),
                    new THREE.Vector2(333.9399927707233, -313.57533802506674)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(324.0674977819711, -316.20971784210474),
                    new THREE.Vector2(333.50732950980324, -308.2118525597209)
                )
            )
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-661.5835562744268, -176.5257952870866),
                        new THREE.Vector2(-647.4286671014684, -162.39726624217838)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-654.9885245486681, -171.56447688864188),
                        new THREE.Vector2(-643.1050955424905, -159.689834591811)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-652.4365443883239, -166.6566017763491),
                        new THREE.Vector2(-638.8341435156977, -153.10692115982332)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-645.0223107517918, -161.9999564483566),
                        new THREE.Vector2(-633.2099649413702, -150.10978832969806)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-641.279998901918, -156.90981054701322),
                        new THREE.Vector2(-630.382199048293, -145.23378761103572)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-638.5747695308685, -154.55356558945667),
                        new THREE.Vector2(-625.2639427818127, -140.77580499098943)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-631.3264979429706, -150.0709532311777),
                        new THREE.Vector2(-619.5141521325461, -138.18078511251863)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-358.7931605007032, -421.66599656490365),
                        new THREE.Vector2(-349.1834154883592, -409.84167221224067)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-351.8499993316703, -421.1474223362548),
                        new THREE.Vector2(-344.6335881513689, -409.50185247532386)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-346.358293828748, -420.7461557428114),
                        new THREE.Vector2(-340.05883025362965, -410.75572660050176)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(478.3257040361889, -417.62304772217885),
                        new THREE.Vector2(492.1719424514668, -403.2024210052745)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(241.25160324857643, -398.55954304879066),
                        new THREE.Vector2(251.08951456032432, -386.56396982559784)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(234.6646337855522, -395.35676340290723),
                        new THREE.Vector2(242.67880696237805, -385.9041489517843)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(228.56089060078813, -397.10023118918326),
                        new THREE.Vector2(236.00996188471728, -385.3358360823644)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(222.63334052044345, -394.2695038243382),
                        new THREE.Vector2(231.44379370654204, -384.73983000109104)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(217.23115858630578, -394.31927116615515),
                        new THREE.Vector2(223.7298311167101, -384.2244954500082)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-265.09692018932583, 295.21664918784614),
                        new THREE.Vector2(-253.89692018932584, 304.01664918784616)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-262.69692018932585, 301.8666491878462),
                        new THREE.Vector2(-253.89692018932584, 310.6666491878462)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-262.69692018932585, 310.1166491878461),
                        new THREE.Vector2(-253.89692018932584, 317.3166491878461)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-263.4969201893258, 317.6166491878461),
                        new THREE.Vector2(-253.89692018932584, 323.2166491878461)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-262.69692018932585, 321.72914918784613),
                        new THREE.Vector2(-253.89692018932584, 329.72914918784613)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-265.89692018932584, 329.4291491878462),
                        new THREE.Vector2(-253.89692018932584, 336.62914918784617)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-260.2969201893258, 336.2541491878461),
                        new THREE.Vector2(-257.09692018932583, 342.6541491878461)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-265.09692018932583, 341.41664918784613),
                        new THREE.Vector2(-253.89692018932584, 351.01664918784616)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(236.99655181906607, -246.91067416362796),
                        new THREE.Vector2(362.59655181906606, -228.51067416362798)
                    )
                )
            ),
            false
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(236.99655181906607, -246.91067416362796),
                    new THREE.Vector2(362.59655181906606, -228.51067416362798)
                )
            )
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-50.23225513783258, -2.997306653430398),
                        new THREE.Vector2(12.167744862167424, 15.402693346569603)
                    )
                )
            ),
            false
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-50.23225513783258, -2.997306653430398),
                    new THREE.Vector2(12.167744862167424, 15.402693346569603)
                )
            )
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(432.71140714754716, -279.7255423215985),
                        new THREE.Vector2(539.9114071475473, -260.52554232159855)
                    )
                )
            ),
            false
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(432.71140714754716, -279.7255423215985),
                    new THREE.Vector2(539.9114071475473, -260.52554232159855)
                )
            )
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-189.25579979812142, 243.0500583015166),
                        new THREE.Vector2(-90.05579979812141, 261.45005830151655)
                    )
                )
            ),
            false
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-189.25579979812142, 243.0500583015166),
                    new THREE.Vector2(-90.05579979812141, 261.45005830151655)
                )
            )
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-539.0595066126598, 384.41156058194167),
                        new THREE.Vector2(-427.8595066126598, 402.81156058194165)
                    )
                )
            ),
            false
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-539.0595066126598, 384.41156058194167),
                    new THREE.Vector2(-427.8595066126598, 402.81156058194165)
                )
            )
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-745.772700866888, 244.6443750471596),
                        new THREE.Vector2(-631.372700866888, 263.0443750471596)
                    )
                )
            ),
            false
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-745.772700866888, 244.6443750471596),
                    new THREE.Vector2(-631.372700866888, 263.0443750471596)
                )
            )
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(504.5473879823859, -17.345397001947195),
                        new THREE.Vector2(557.347387982386, 1.0546029980528067)
                    )
                )
            ),
            false
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(504.5473879823859, -17.345397001947195),
                    new THREE.Vector2(557.347387982386, 1.0546029980528067)
                )
            )
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(202.13543010817403, -18.939632280204098),
                        new THREE.Vector2(358.13543010817403, -0.5396322802040983)
                    )
                )
            ),
            false
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(202.13543010817403, -18.939632280204098),
                    new THREE.Vector2(358.13543010817403, -0.5396322802040983)
                )
            )
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(105.49434688049764, -389.9910770193781),
                        new THREE.Vector2(223.09434688049762, -369.19107701937816)
                    )
                )
            ),
            false
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(105.49434688049764, -389.9910770193781),
                    new THREE.Vector2(223.09434688049762, -369.19107701937816)
                )
            )
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-222.399780480067, -144.35117815535904),
                        new THREE.Vector2(-159.99978048006702, -125.95117815535905)
                    )
                )
            ),
            false
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-222.399780480067, -144.35117815535904),
                    new THREE.Vector2(-159.99978048006702, -125.95117815535905)
                )
            )
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(354.1899075220546, -385.60278382415277),
                        new THREE.Vector2(394.1899075220546, -367.2027838241528)
                    )
                )
            ),
            false
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(354.1899075220546, -385.60278382415277),
                    new THREE.Vector2(394.1899075220546, -367.2027838241528)
                )
            )
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(473.48472739832016, -253.28737087449736),
                        new THREE.Vector2(586.2847273983202, -234.88737087449738)
                    )
                )
            ),
            false
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(473.48472739832016, -253.28737087449736),
                    new THREE.Vector2(586.2847273983202, -234.88737087449738)
                )
            )
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(398.12219582574187, -76.33161349313622),
                        new THREE.Vector2(459.7221958257419, -57.93161349313621)
                    )
                )
            ),
            false
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(398.12219582574187, -76.33161349313622),
                    new THREE.Vector2(459.7221958257419, -57.93161349313621)
                )
            )
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(109.77135966242203, 247.83289991526408),
                        new THREE.Vector2(285.77135966242207, 266.23289991526406)
                    )
                )
            ),
            false
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(109.77135966242203, 247.83289991526408),
                    new THREE.Vector2(285.77135966242207, 266.23289991526406)
                )
            )
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(377.6754263127085, -206.13053011509285),
                        new THREE.Vector2(505.6754263127085, -185.3305301150929)
                    )
                )
            ),
            false
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(377.6754263127085, -206.13053011509285),
                    new THREE.Vector2(505.6754263127085, -185.3305301150929)
                )
            )
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(422.10720845477323, -374.31236497536355),
                        new THREE.Vector2(516.5072084547733, -355.1123649753636)
                    )
                )
            ),
            false
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(422.10720845477323, -374.31236497536355),
                    new THREE.Vector2(516.5072084547733, -355.1123649753636)
                )
            )
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-572.7583007829131, 246.6328999152641),
                        new THREE.Vector2(-485.55830078291314, 267.43289991526404)
                    )
                )
            ),
            false
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-572.7583007829131, 246.6328999152641),
                    new THREE.Vector2(-485.55830078291314, 267.43289991526404)
                )
            )
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-208.53190887998215, -167.20713257200592),
                        new THREE.Vector2(-29.33190887998214, -145.60713257200595)
                    )
                )
            ),
            false
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-208.53190887998215, -167.20713257200592),
                    new THREE.Vector2(-29.33190887998214, -145.60713257200595)
                )
            )
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-466.8209338477092, -403.1383773039736),
                        new THREE.Vector2(-339.6209338477092, -384.7383773039736)
                    )
                )
            ),
            false
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-466.8209338477092, -403.1383773039736),
                    new THREE.Vector2(-339.6209338477092, -384.7383773039736)
                )
            )
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-408.10876246362363, 146.8620586693054),
                        new THREE.Vector2(-350.5087624636236, 165.2620586693054)
                    )
                )
            ),
            false
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(-408.10876246362363, 146.8620586693054),
                    new THREE.Vector2(-350.5087624636236, 165.2620586693054)
                )
            )
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(431.47367019317187, -339.90376052687594),
                        new THREE.Vector2(489.0736701931719, -321.50376052687596)
                    )
                )
            ),
            false
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(431.47367019317187, -339.90376052687594),
                    new THREE.Vector2(489.0736701931719, -321.50376052687596)
                )
            )
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(264.98741063722656, -388.7910770193781),
                        new THREE.Vector2(412.1874106372265, -370.39107701937814)
                    )
                )
            ),
            true
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-30.524255290725673, -4.5915419316873045),
                        new THREE.Vector2(6.275744709274327, 13.808458068312696)
                    )
                )
            ),
            true
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(314.98741063722656, -389.9910770193781),
                        new THREE.Vector2(362.1874106372265, -369.19107701937816)
                    )
                )
            ),
            true
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(250.19655181906606, -246.91067416362796),
                        new THREE.Vector2(349.396551819066, -228.51067416362798)
                    )
                )
            ),
            true
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(66.81983098340133, -388.3969308460747),
                        new THREE.Vector2(266.01983098340133, -367.59693084607477)
                    )
                )
            ),
            true
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-280.8491826569054, -144.35117815535904),
                        new THREE.Vector2(-147.2491826569054, -125.95117815535905)
                    )
                )
            ),
            true
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-172.14362841403587, -9.380012488201118),
                        new THREE.Vector2(-59.34362841403588, 12.219987511798884)
                    )
                )
            ),
            true
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(263.00494920461404, -344.6862321429117),
                        new THREE.Vector2(404.60494920461406, -326.28623214291173)
                    )
                )
            ),
            true
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(378.90720845477324, -375.5123649753636),
                        new THREE.Vector2(559.7072084547733, -353.9123649753636)
                    )
                )
            ),
            true
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(276.5874106372265, -389.9910770193781),
                        new THREE.Vector2(400.5874106372265, -369.19107701937816)
                    )
                )
            ),
            true
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-46.12425529072568, -4.5915419316873045),
                        new THREE.Vector2(21.875744709274326, 13.808458068312696)
                    )
                )
            ),
            true
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(355.7606765764088, -383.60863680223076),
                        new THREE.Vector2(408.56067657640875, -366.00863680223074)
                    )
                )
            ),
            true
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(325.60590721626846, -340.30960671600513),
                        new THREE.Vector2(450.4059072162684, -317.90960671600516)
                    )
                )
            ),
            true
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(360.8117534053976, -383.60863680223076),
                        new THREE.Vector2(412.01175340539754, -366.00863680223074)
                    )
                )
            ),
            true
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(408.9448367859671, -370.72406583980796),
                        new THREE.Vector2(581.7448367859671, -352.324065839808)
                    )
                )
            ),
            true
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(222.58741063722653, -391.1910770193781),
                        new THREE.Vector2(454.5874106372265, -367.99107701937817)
                    )
                )
            ),
            true
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(481.07547759329924, -365.9474624769852),
                        new THREE.Vector2(656.2754775932992, -344.3474624769852)
                    )
                )
            ),
            true
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-207.74362841403587, -15.35692644543338),
                        new THREE.Vector2(-23.74362841403587, 5.44307355456662)
                    )
                )
            ),
            true
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(-224.97113342694053, -209.7130865929891),
                        new THREE.Vector2(226.22886657305946, -191.31308659298912)
                    )
                )
            ),
            true
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(659.1638896877414, 124.46104361163329),
                        new THREE.Vector2(671.7502591969997, 138.26769305830186)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(666.4442790363184, 127.25968697150287),
                        new THREE.Vector2(677.3259670082382, 138.54813492255965)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(671.9446199198908, 130.52384626560584),
                        new THREE.Vector2(680.7005619082586, 143.080385314095)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(675.8344007834386, 131.71822789935842),
                        new THREE.Vector2(686.8334234747833, 143.0973102967151)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(680.6864888931675, 134.66936816930257),
                        new THREE.Vector2(692.3337983972468, 148.59703590945344)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(688.111418320848, 137.54016886746945),
                        new THREE.Vector2(698.3875991332644, 148.5764690919101)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(692.4705026809813, 140.0949672499802),
                        new THREE.Vector2(703.0521881332177, 152.95701093828814)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(697.6438955992023, 142.0606087727923),
                        new THREE.Vector2(708.6429182905471, 153.439691170149)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(704.6012486838802, 142.46851967139352),
                        new THREE.Vector2(716.248558187958, 156.3961874115441)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(711.4908353424073, 148.62702977270405),
                        new THREE.Vector2(721.7670161548236, 159.66332999714467)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(716.1283297693274, 151.4764065850642),
                        new THREE.Vector2(727.7756392734075, 165.40407432521522)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(721.350850347152, 153.30279285012924),
                        new THREE.Vector2(732.3498730384958, 164.68187524748524)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(728.0105988763448, 156.62349515024806),
                        new THREE.Vector2(737.1838781038227, 167.69707290778564)
                    )
                )
            ),
            false
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(659.1638896877414, 124.46104361163329),
                    new THREE.Vector2(671.7502591969997, 138.26769305830186)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(666.4442790363184, 127.25968697150287),
                    new THREE.Vector2(677.3259670082382, 138.54813492255965)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(671.9446199198908, 130.52384626560584),
                    new THREE.Vector2(680.7005619082586, 143.080385314095)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(675.8344007834386, 131.71822789935842),
                    new THREE.Vector2(686.8334234747833, 143.0973102967151)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(680.6864888931675, 134.66936816930257),
                    new THREE.Vector2(692.3337983972468, 148.59703590945344)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(688.111418320848, 137.54016886746945),
                    new THREE.Vector2(698.3875991332644, 148.5764690919101)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(692.4705026809813, 140.0949672499802),
                    new THREE.Vector2(703.0521881332177, 152.95701093828814)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(697.6438955992023, 142.0606087727923),
                    new THREE.Vector2(708.6429182905471, 153.439691170149)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(704.6012486838802, 142.46851967139352),
                    new THREE.Vector2(716.248558187958, 156.3961874115441)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(711.4908353424073, 148.62702977270405),
                    new THREE.Vector2(721.7670161548236, 159.66332999714467)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(716.1283297693274, 151.4764065850642),
                    new THREE.Vector2(727.7756392734075, 165.40407432521522)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(721.350850347152, 153.30279285012924),
                    new THREE.Vector2(732.3498730384958, 164.68187524748524)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(728.0105988763448, 156.62349515024806),
                    new THREE.Vector2(737.1838781038227, 167.69707290778564)
                )
            )
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(758.3719875633624, -148.95501871286203),
                        new THREE.Vector2(770.4204611791387, -139.04601084851006)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(759.089077989793, -155.08411885559528),
                        new THREE.Vector2(768.6620021410454, -146.22507145169376)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(759.7943415624419, -161.13962021069875),
                        new THREE.Vector2(772.4685269788682, -152.748695278377)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(760.4804055822945, -168.60019682889452),
                        new THREE.Vector2(770.0533297335336, -159.74114942500773)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(761.2688672170525, -175.4639273176374),
                        new THREE.Vector2(773.9430526334786, -167.0730023853162)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(761.9677309387682, -183.8446417187443),
                        new THREE.Vector2(771.6225731819294, -174.18979947558304)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(762.7305931697995, -193.64286567731025),
                        new THREE.Vector2(772.6311896887272, -181.6006389163253)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(763.6662513759807, -198.75336066077654),
                        new THREE.Vector2(773.1572574353095, -190.69010809614932)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(764.276797154843, -203.88872423296903),
                        new THREE.Vector2(776.0732696400713, -196.3755122318456)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(764.8284643051346, -208.4521102644312),
                        new THREE.Vector2(774.951429019882, -201.89852928644618)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(765.2495744964265, -214.93037762790084),
                        new THREE.Vector2(774.8224986476791, -206.07133022399893)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(766.0380361311844, -222.5899029559165),
                        new THREE.Vector2(778.7941396395336, -213.40318318432153)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(766.7305000019688, -229.3168562066578),
                        new THREE.Vector2(776.3034241532212, -220.4578088027563)
                    )
                )
            ),
            false
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(758.3719875633624, -148.95501871286203),
                    new THREE.Vector2(770.4204611791387, -139.04601084851006)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(759.089077989793, -155.08411885559528),
                    new THREE.Vector2(768.6620021410454, -146.22507145169376)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(759.7943415624419, -161.13962021069875),
                    new THREE.Vector2(772.4685269788682, -152.748695278377)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(760.4804055822945, -168.60019682889452),
                    new THREE.Vector2(770.0533297335336, -159.74114942500773)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(761.2688672170525, -175.4639273176374),
                    new THREE.Vector2(773.9430526334786, -167.0730023853162)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(761.9677309387682, -183.8446417187443),
                    new THREE.Vector2(771.6225731819294, -174.18979947558304)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(762.7305931697995, -193.64286567731025),
                    new THREE.Vector2(772.6311896887272, -181.6006389163253)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(763.6662513759807, -198.75336066077654),
                    new THREE.Vector2(773.1572574353095, -190.69010809614932)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(764.276797154843, -203.88872423296903),
                    new THREE.Vector2(776.0732696400713, -196.3755122318456)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(764.8284643051346, -208.4521102644312),
                    new THREE.Vector2(774.951429019882, -201.89852928644618)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(765.2495744964265, -214.93037762790084),
                    new THREE.Vector2(774.8224986476791, -206.07133022399893)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(766.0380361311844, -222.5899029559165),
                    new THREE.Vector2(778.7941396395336, -213.40318318432153)
                )
            )
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(766.7305000019688, -229.3168562066578),
                    new THREE.Vector2(776.3034241532212, -220.4578088027563)
                )
            )
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(593.5727403514207, 54.371971791480554),
                        new THREE.Vector2(605.4953333335512, 63.41975380043796)
                    )
                )
            ),
            true
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(203.3996522998221, -115.83714231277929),
                        new THREE.Vector2(213.50685289214587, -103.64241127179292)
                    )
                )
            ),
            true
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(749.5631994433808, -339.6787145440946),
                        new THREE.Vector2(759.2875489797716, -327.76809734625715)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(758.1872923683214, -338.9570698504924),
                        new THREE.Vector2(766.1125231748644, -329.57432726965186)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(764.6578504004099, -338.38487819994384),
                        new THREE.Vector2(771.9909681020243, -326.6792251754365)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(769.4335545912572, -337.99309772279594),
                        new THREE.Vector2(778.1558626760586, -328.54203375084563)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(777.0869193332805, -337.33123424641536),
                        new THREE.Vector2(783.4863169744157, -327.28805716953616)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(781.8639846900364, -336.93926463801),
                        new THREE.Vector2(783.6386162107881, -335.16463311725835)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(784.8429357617792, -336.4511130811935),
                        new THREE.Vector2(793.3850096461625, -323.6976087165582)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(791.9927772698533, -335.66022064789405),
                        new THREE.Vector2(800.9586402137785, -325.9924526239269)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(799.6905657156271, -334.7621376650268),
                        new THREE.Vector2(807.8618182393429, -325.187074981227)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(783.9719307836446, 297.4109670259294),
                        new THREE.Vector2(797.1605465045427, 311.49792559737466)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(791.2100134863667, 300.85555665599674),
                        new THREE.Vector2(802.5160308807265, 312.4610216672055)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(795.6124041382946, 304.2630411913056),
                        new THREE.Vector2(807.8063369480723, 318.2536597021776)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(802.1302350220827, 307.97355066714204),
                        new THREE.Vector2(811.5432266547798, 320.3810184683232)
                    )
                )
            ),
            false
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(728.9828221611615, -298.98694916834177),
                        new THREE.Vector2(821.7828221611617, -280.5869491683418)
                    )
                )
            ),
            false
        );
        sc.allocate(
            toBox2D(
                new THREE.Box2(
                    new THREE.Vector2(728.9828221611615, -298.98694916834177),
                    new THREE.Vector2(821.7828221611617, -280.5869491683418)
                )
            )
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(432.7114443840034, -279.7255423215985),
                        new THREE.Vector2(539.9114443840035, -260.52554232159855)
                    )
                )
            ),
            true
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(504.54742521884214, -17.345397001947195),
                        new THREE.Vector2(557.3474252188422, 1.0546029980528067)
                    )
                )
            ),
            true
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(473.4846560115949, -253.28737087449736),
                        new THREE.Vector2(586.284656011595, -234.88737087449738)
                    )
                )
            ),
            true
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(398.1222330621981, -76.33161349313622),
                        new THREE.Vector2(459.72223306219814, -57.93161349313621)
                    )
                )
            ),
            true
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(378.90724569122943, -375.5123649753636),
                        new THREE.Vector2(559.7072456912294, -353.9123649753636)
                    )
                )
            ),
            true
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(377.6753549259833, -206.13053011509285),
                        new THREE.Vector2(505.6753549259833, -185.3305301150929)
                    )
                )
            ),
            true
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(422.1072456912294, -374.31236497536355),
                        new THREE.Vector2(516.5072456912294, -355.1123649753636)
                    )
                )
            ),
            true
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(408.94487402242333, -370.72406583980796),
                        new THREE.Vector2(581.7448740224233, -352.324065839808)
                    )
                )
            ),
            true
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(481.0755148297555, -365.9474624769852),
                        new THREE.Vector2(656.2755148297555, -344.3474624769852)
                    )
                )
            ),
            true
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(431.47370742962806, -339.90376052687594),
                        new THREE.Vector2(489.0737074296281, -321.50376052687596)
                    )
                )
            ),
            true
        );
        assert.strictEqual(
            sc.isAllocated(
                toBox2D(
                    new THREE.Box2(
                        new THREE.Vector2(637.2723254292264, -186.06886528829364),
                        new THREE.Vector2(828.4723254292264, -166.06886528829364)
                    )
                )
            ),
            true
        );
    });
});
