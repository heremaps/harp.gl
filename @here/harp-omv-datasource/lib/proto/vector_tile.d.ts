/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as $protobuf from "protobufjs";

/** Namespace com. */
export namespace com {
    /** Namespace mapbox. */
    namespace mapbox {
        /** Namespace pb. */
        namespace pb {
            /** Properties of a Tile. */
            interface ITile {
                /** Tile layers */
                layers?: com.mapbox.pb.Tile.ILayer[];
            }

            /** Represents a Tile. */
            class Tile {
                /**
                 * Constructs a new Tile.
                 * @param [properties] Properties to set
                 */
                constructor(properties?: com.mapbox.pb.ITile);

                /** Tile layers. */
                public layers: com.mapbox.pb.Tile.ILayer[];

                /**
                 * Decodes a Tile message from the specified reader or buffer.
                 * @param reader Reader or buffer to decode from
                 * @param [length] Message length if known beforehand
                 * @returns Tile
                 * @throws {Error} If the payload is not a reader or valid buffer
                 * @throws {$protobuf.util.ProtocolError} If required fields are missing
                 */
                public static decode(
                    reader: $protobuf.Reader | Uint8Array,
                    length?: number
                ): com.mapbox.pb.Tile;

                /**
                 * Decodes a Tile message from the specified reader or buffer, length delimited.
                 * @param reader Reader or buffer to decode from
                 * @returns Tile
                 * @throws {Error} If the payload is not a reader or valid buffer
                 * @throws {$protobuf.util.ProtocolError} If required fields are missing
                 */
                public static decodeDelimited(
                    reader: $protobuf.Reader | Uint8Array
                ): com.mapbox.pb.Tile;

                /**
                 * Creates a Tile message from a plain object. Also converts values to their respective internal types.
                 * @param object Plain object
                 * @returns Tile
                 */
                public static fromObject(object: { [k: string]: any }): com.mapbox.pb.Tile;

                /**
                 * Creates a plain object from a Tile message. Also converts values to other types if specified.
                 * @param message Tile
                 * @param [options] Conversion options
                 * @returns Plain object
                 */
                public static toObject(
                    message: com.mapbox.pb.Tile,
                    options?: $protobuf.IConversionOptions
                ): { [k: string]: any };

                /**
                 * Converts this Tile to JSON.
                 * @returns JSON object
                 */
                public toJSON(): { [k: string]: any };
            }

            namespace Tile {
                /** GeomType enum. */
                enum GeomType {
                    UNKNOWN = 0,
                    POINT = 1,
                    LINESTRING = 2,
                    POLYGON = 3
                }

                /** Properties of a Value. */
                interface IValue {
                    /** Value stringValue */
                    stringValue?: string;

                    /** Value floatValue */
                    floatValue?: number;

                    /** Value doubleValue */
                    doubleValue?: number;

                    /** Value intValue */
                    intValue?: number | Long;

                    /** Value uintValue */
                    uintValue?: number | Long;

                    /** Value sintValue */
                    sintValue?: number | Long;

                    /** Value boolValue */
                    boolValue?: boolean;
                }

                /** Represents a Value. */
                class Value {
                    /**
                     * Constructs a new Value.
                     * @param [properties] Properties to set
                     */
                    constructor(properties?: com.mapbox.pb.Tile.IValue);

                    /** Value stringValue. */
                    public stringValue: string;

                    /** Value floatValue. */
                    public floatValue: number;

                    /** Value doubleValue. */
                    public doubleValue: number;

                    /** Value intValue. */
                    public intValue: number | Long;

                    /** Value uintValue. */
                    public uintValue: number | Long;

                    /** Value sintValue. */
                    public sintValue: number | Long;

                    /** Value boolValue. */
                    public boolValue: boolean;

                    /**
                     * Decodes a Value message from the specified reader or buffer.
                     * @param reader Reader or buffer to decode from
                     * @param [length] Message length if known beforehand
                     * @returns Value
                     * @throws {Error} If the payload is not a reader or valid buffer
                     * @throws {$protobuf.util.ProtocolError} If required fields are missing
                     */
                    public static decode(
                        reader: $protobuf.Reader | Uint8Array,
                        length?: number
                    ): com.mapbox.pb.Tile.Value;

                    /**
                     * Decodes a Value message from the specified reader or buffer, length delimited.
                     * @param reader Reader or buffer to decode from
                     * @returns Value
                     * @throws {Error} If the payload is not a reader or valid buffer
                     * @throws {$protobuf.util.ProtocolError} If required fields are missing
                     */
                    public static decodeDelimited(
                        reader: $protobuf.Reader | Uint8Array
                    ): com.mapbox.pb.Tile.Value;

                    /**
                     * Creates a Value message from a plain object. Also converts values to their respective internal types.
                     * @param object Plain object
                     * @returns Value
                     */
                    public static fromObject(object: {
                        [k: string]: any;
                    }): com.mapbox.pb.Tile.Value;

                    /**
                     * Creates a plain object from a Value message. Also converts values to other types if specified.
                     * @param message Value
                     * @param [options] Conversion options
                     * @returns Plain object
                     */
                    public static toObject(
                        message: com.mapbox.pb.Tile.Value,
                        options?: $protobuf.IConversionOptions
                    ): { [k: string]: any };

                    /**
                     * Converts this Value to JSON.
                     * @returns JSON object
                     */
                    public toJSON(): { [k: string]: any };
                }

                /** Properties of a Feature. */
                interface IFeature {
                    /** Feature id */
                    id?: number | Long;

                    /** Feature tags */
                    tags?: number[];

                    /** Feature type */
                    type?: com.mapbox.pb.Tile.GeomType;

                    /** Feature geometry */
                    geometry?: number[];
                }

                /** Represents a Feature. */
                class Feature {
                    /**
                     * Constructs a new Feature.
                     * @param [properties] Properties to set
                     */
                    constructor(properties?: com.mapbox.pb.Tile.IFeature);

                    /** Feature id. */
                    public id: number | Long;

                    /** Feature tags. */
                    public tags: number[];

                    /** Feature type. */
                    public type: com.mapbox.pb.Tile.GeomType;

                    /** Feature geometry. */
                    public geometry: number[];

                    /**
                     * Decodes a Feature message from the specified reader or buffer.
                     * @param reader Reader or buffer to decode from
                     * @param [length] Message length if known beforehand
                     * @returns Feature
                     * @throws {Error} If the payload is not a reader or valid buffer
                     * @throws {$protobuf.util.ProtocolError} If required fields are missing
                     */
                    public static decode(
                        reader: $protobuf.Reader | Uint8Array,
                        length?: number
                    ): com.mapbox.pb.Tile.Feature;

                    /**
                     * Decodes a Feature message from the specified reader or buffer, length delimited.
                     * @param reader Reader or buffer to decode from
                     * @returns Feature
                     * @throws {Error} If the payload is not a reader or valid buffer
                     * @throws {$protobuf.util.ProtocolError} If required fields are missing
                     */
                    public static decodeDelimited(
                        reader: $protobuf.Reader | Uint8Array
                    ): com.mapbox.pb.Tile.Feature;

                    /**
                     * Creates a Feature message from a plain object. Also converts values to their respective internal types.
                     * @param object Plain object
                     * @returns Feature
                     */
                    public static fromObject(object: {
                        [k: string]: any;
                    }): com.mapbox.pb.Tile.Feature;

                    /**
                     * Creates a plain object from a Feature message. Also converts values to other types if specified.
                     * @param message Feature
                     * @param [options] Conversion options
                     * @returns Plain object
                     */
                    public static toObject(
                        message: com.mapbox.pb.Tile.Feature,
                        options?: $protobuf.IConversionOptions
                    ): { [k: string]: any };

                    /**
                     * Converts this Feature to JSON.
                     * @returns JSON object
                     */
                    public toJSON(): { [k: string]: any };
                }

                /** Properties of a Layer. */
                interface ILayer {
                    /** Layer version */
                    version: number;

                    /** Layer name */
                    name: string;

                    /** Layer features */
                    features?: com.mapbox.pb.Tile.IFeature[];

                    /** Layer keys */
                    keys?: string[];

                    /** Layer values */
                    values?: com.mapbox.pb.Tile.IValue[];

                    /** Layer extent */
                    extent?: number;
                }

                /** Represents a Layer. */
                class Layer {
                    /**
                     * Constructs a new Layer.
                     * @param [properties] Properties to set
                     */
                    constructor(properties?: com.mapbox.pb.Tile.ILayer);

                    /** Layer version. */
                    public version: number;

                    /** Layer name. */
                    public name: string;

                    /** Layer features. */
                    public features: com.mapbox.pb.Tile.IFeature[];

                    /** Layer keys. */
                    public keys: string[];

                    /** Layer values. */
                    public values: com.mapbox.pb.Tile.IValue[];

                    /** Layer extent. */
                    public extent: number;

                    /**
                     * Decodes a Layer message from the specified reader or buffer.
                     * @param reader Reader or buffer to decode from
                     * @param [length] Message length if known beforehand
                     * @returns Layer
                     * @throws {Error} If the payload is not a reader or valid buffer
                     * @throws {$protobuf.util.ProtocolError} If required fields are missing
                     */
                    public static decode(
                        reader: $protobuf.Reader | Uint8Array,
                        length?: number
                    ): com.mapbox.pb.Tile.Layer;

                    /**
                     * Decodes a Layer message from the specified reader or buffer, length delimited.
                     * @param reader Reader or buffer to decode from
                     * @returns Layer
                     * @throws {Error} If the payload is not a reader or valid buffer
                     * @throws {$protobuf.util.ProtocolError} If required fields are missing
                     */
                    public static decodeDelimited(
                        reader: $protobuf.Reader | Uint8Array
                    ): com.mapbox.pb.Tile.Layer;

                    /**
                     * Creates a Layer message from a plain object. Also converts values to their respective internal types.
                     * @param object Plain object
                     * @returns Layer
                     */
                    public static fromObject(object: {
                        [k: string]: any;
                    }): com.mapbox.pb.Tile.Layer;

                    /**
                     * Creates a plain object from a Layer message. Also converts values to other types if specified.
                     * @param message Layer
                     * @param [options] Conversion options
                     * @returns Plain object
                     */
                    public static toObject(
                        message: com.mapbox.pb.Tile.Layer,
                        options?: $protobuf.IConversionOptions
                    ): { [k: string]: any };

                    /**
                     * Converts this Layer to JSON.
                     * @returns JSON object
                     */
                    public toJSON(): { [k: string]: any };
                }
            }
        }
    }
}
