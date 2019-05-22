/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This class is an alias for standard Map class that exists in Node and Browser environment.
 *
 * Required because as for now thre is no way to reliably alias name from global module from
 * scope that redefines this name (and Map.ts defines class Map).
 *
 * @see https://github.com/Microsoft/TypeScript/issues/983
 * @see https://stackoverflow.com/questions/51319046
 */
export const BuiltinMap = Map;
