/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
// This file is a simple work for webpack reordering the dependencies, i.e. imports are put
// before importScripts.
self.importScripts("three.min.js");
