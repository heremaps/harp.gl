/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Env, ValueMap } from "@here/harp-datasource-protocol/index-decoder";

/**
 * The [[IEnvironmentProcessor]] is used to create features environment (attributes set) encoded in
 * OMV tiles.
 *
 * [[OmvDecoder]] will pass to the factory methods of the concrete implementations
 * of this interface.
 *
 * The methods of concrete implementations of [[IEnvironmentProcessor]] are called to process point,
 * line and polygon geometries, see [[OmvDecoder]].
 */
export interface IEnvironmentProcessor {
    createFeatureEnvironment(attributes: ValueMap, parent?: Env): Env;
}
