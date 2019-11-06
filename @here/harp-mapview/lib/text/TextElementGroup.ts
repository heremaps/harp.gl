/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { PriorityListGroup } from "@here/harp-utils";
import { TextElement } from "./TextElement";

/**
 * Group of [[TextElement]] sharing same priority.
 */
export class TextElementGroup extends PriorityListGroup<TextElement> {}
