/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GroupedPriorityList } from "@here/harp-utils";
import { TextElement } from "./TextElement";

/**
 * List of [[TextElement]] groups sorted by priority.
 */
export class TextElementGroupPriorityList extends GroupedPriorityList<TextElement> {}
