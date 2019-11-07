# @here/harp-datasource-protocol

## Overview

The DataSource Protocol package contains components used for the decoding and styling of data that
is used by the Datasources. This code is shared between the ui-thread and the web-workers which are
used to parallelise the decoding of the data.

## Techniques

This module contains interfaces for choosing techniques form the techniques catalog that are applied
via the theme files to draw geometries on the map canvas.

The supported techniques that can be used to draw on the map are:

-   Points: [[PoiTechnique]], [[SquaresTechnique]], [[CirclesTechnique]]
-   Text: [[TextTechnique]]
-   Lines: [[LineMarkerTechnique]], [[LineTechnique]], [[SolidLineTechnique]]
-   Segments: [[SegmentsTechnique]]
-   Fill: [[FillTechnique]]
-   Extruded: [[BasicExtrudedLineTechnique]], [[StandardExtrudedLineTechnique]], [[ExtrudedPolygonTechnique]]
-   Standard: [[StandardTechnique]]
-   Terrain: [[TerrainTechnique]]
-   Shader: [[ShaderTechnique]]

All the techniques are documented in the [`Techniques` class' source code](https://github.com/heremaps/harp.gl/blob/master/%40here/harp-datasource-protocol/lib/Techniques.ts).

To set a technique in a theme file, you can use a `technique` property. See examples below.

## How to Style a Map? - Overview of [harp.gl](https://github.com/harp.gl)'s Map Styling

Techniques can be used to render map objects on the canvas in a certain way. The visual attributes
of these techniques are defined and placed in the *theme* file.

The theme JSON file enables writing conditions which the data received from the datasource
must match for a style to be applied to it. When a condition is met a set of attributes are applied
to the map object is changed according to a set of predefined attributes. There is an example of a
minimal theme file below. It styles the names of continents and draws a line around islands,
archipelagos, cliffs and bridges.

The theme file enables to define multiple `styles` which are bound to the data format received from
a datasource (for example a tilezen based one, check [here for more information on tilezen vector tile datasource](https://github.com/tilezen/vector-datasource)).

```JSON
{
    "styles": {
        "tilezen": [
            {
                "description": "Earth layer",
                "when": "$layer ^= 'earth'",
                "styles": [
                    {
                        "when": "kind in ['continent']",
                        "technique": "text",
                        "attr": {
                            "priority": {
                                "interpolation": "Discrete",
                                "zoomLevels": [2, 3, 4],
                                "values": [120, 100, 60]
                            },
                            "color": "#E48892",
                            "fontVariant": "AllCaps",
                            "opacity": 0.6
                        }
                    },
                    {
                        "when": "kind in ['archipelago', 'cliff', 'ridge', 'island']",
                        "technique": "line",
                        "attr": {
                            "color": "#C1BDB3"
                        }
                    }
                ]
            }
        ]
    }
}
```

The conditions can be based on the datasource metadata
(for example data layer like water or buildings or a specific flag like `isBridge`).

An example theme file used in harp-examples could be found in the
[berlin_tilezen_base.json](../harp-map-theme/resources/berlin_tilezen_base.json).
Theme file is closely connected with the type of data received from the datasource.

`"technique"` - determines which technique should be applied to objects fulfilling the condition

```JSON
{
    "description": "Exemplary theme condition",
    "when": "kind_detail == 'pier' || landuse_kind == 'pier'",
    "technique": "solid-line",
    "attr": {
        "color": "#00f",
        "lineWidth": {
            "interpolation": "Linear",
            "zoomLevels": [13, 14, 15],
            "values": [1.5, 1.2, 0.9]
        }
    }
}
```

### Feature Selection Expressions

In the above example there is a condition used within the theme which is applying a solid-line
technique to a map feature which has a `kind_detail` or `landuse_kind` property equal to _pier_. The
line is rendered with different line widths depending on the current map zoom level.

Note that the typical logical operators like:

- `&&` (and) for computing the conjunction of two sub-conditions
- `||` (or) for computing the alternative of two sub-conditions

`"when"` - is a property that holds a description of the condition. This condition queries the
feature data which and uses one or many of the following operators:

- `~=` (*tilde equal*), returns **true** when the value on the left *contains* the value on the
 right, for example:

```js
    "when": "kind_detail ~= 'park'"
```

this condition would match `kind_detail`s like *national_park*, *natural_park*, *theme_park* but
 also *parking*

- `^=` (*caret equal*), returns **true** when the value on the left *starts with* the value on the
 right, for example:

```js
    "when": "kind_detail ^= 'water'"
```

the above condition would match `kind_detail`s like: *water_park*, *water_slide* or
*water_works* but **not** *drinking_water*

- `$=` (*dollar equal*), returns **true** when the value on the left *ends with* the value on the
 right, for example:

```js
    "when": "kind_detail $= 'water'"
```

the above condition would match `kind_detail`s like: *drinking_water* but **not** *water_park*

- `==` (*equal equal*), returns **true** when the value on the left *is equal to* the value on the
 right, for example:

```js
    "when": $layer == 'roads' && kind == 'rail'"
```

the above condition would match *roads* `$layer` and the `kind` of **rail**

- `!=` (*exclamation mark equal*), returns **true** when the value on the left *is not equal to* the
 value on the right, for example:

```js
    "description": "All land roads except rail",
    "when": "$layer ^= 'roads' && kind != 'rail'",
```

the above condition would match all `kind`s which are **not** *rail* on the *roads* `$layer`

For more in-depth details about the equality operators check the [@here/harp-datasource-protocol/lib/Theme.ts](https://github.com/heremaps/harp.gl/blob/master/%40here/harp-datasource-protocol/lib/Theme.ts).

Additionally there are two more operators available (`has` and `in`):

- `has(`*variable name*`)` returns **true** when the feature contains the specified variable and it
 is not *undefined*, for example:

```js
    "description": "lakes (on high zoom level show only biggest lakes)",
    "when": "kind == 'lake' || has(area)",
```

the above condition would match all `kind`s which have the value *lake* **or** the *area* property
 defined.

- `in[`*array of possible values*`]` returns **true** when the feature contains one of the values
 specified in the array, for example:

```js
{
    "description": "Earth layer",
    "when": "$layer ^= 'earth'",
    "styles": [
        {
            "when": "kind in ['archipelago', 'cliff', 'island']",
            (...)
        }
    ]
}
```

the above conditions would match all features from `earth` layer which `kind` is  equal either to
 'archipelago', 'cliff' or 'island'.

## How to nest two or more conditions

`harp.gl`'s theming system enables nesting conditions. This comes in very handy when one wants to
apply some general level styling to for example a whole `layer` and they define a more fine grained
styling options for smaller subsets of feature (like `kind`s or `kind_detail`s).

The general structure of such nested conditions looks like this:

```json
{
    "when": "$layer ^= 'water'",
    "styles": [
        {
            "when": "$geometryType ^= 'polygon'",
            "technique": "fill",
            "styles": [
                {
                    "when": "kind in ['lake', 'ocean']",
                    "final": true,
                    "attr": {
                        "color": "#ffcdff"
                    }
                },
                {
                    "when": "$level <= 7",
                    "technique": "fill",
                    "attr": {
                        "color": "#a0cfff"
                    }
                },
                {
                    "when": "$level > 7",
                    "technique": "fill",
                    "attr": {
                        "color": "#a0cfff"
                    }
                }
            ]
        },
        {
            "when": "...another condition",
            "styles":[
                {
                    "when": "... more fine grained condition"
                }
            ]
        }
    ]
}
```

In the above example the first `when` condition matches all features from the `water` layer.
All those features are then matched against each of the sub-conditions from the `styles` array.

It is important to take into account that a certain map feature could be matched either none, one or
many times. In such cases an object would have the parameters from `attr` applied in the order of
the conditions. This behavior could be changed by adding a

```json
 "final": true
```

property to the style object. Setting `final` to true means essentially that when a map feature
reaches the current condition it will not be taken into account in subsequent conditions and no
additional styling would be made. In the above example if a feature has a `kind` equal to *lake* or
*ocean* it will have a color applied:

```json
 "color": "#ffcdff"
 ```

But such object would not have its color changed depending on the zoom level (`$level`), even if it
would match any of the subsequent conditions.

## Where to put style changes for a certain feature or map object?

A style for a certain feature (map object) on the map is kept in the `attr` object. Here is an
example:

```json
"attr": {
    "priority": {
        "interpolation": "Discrete",
        "zoomLevels": [2, 3, 4],
        "values": [120, 100, 60]
    },
    "color": "#E48892",
    "fontVariant": "AllCaps",
    "opacity": 0.6
}
```

A list of possible style modifier for each techniques can be found in the [`Techniques` class' source code](https://github.com/heremaps/harp.gl/blob/master/%40here/harp-datasource-protocol/lib/Techniques.ts).

Most common properties include:

- `priority`: Sets a `priority` of a map object, defaults to `0`. Objects with highest priority get
 placed first. Can be defined to vary depending on the zoom level with some default value. (see the
 example above).
- `renderOrder`: which enables to define the render order of the objects created using a particular
 technique.
- `color`: color in hexadecimal or CSS-style notation, for example: `"#e4e9ec"`, `"#fff"`,
 `"rgb(255, 0, 0)"`, `"rgba(127, 127, 127, 1.0)"`, or `"hsl(35, 11%, 88%)"`.
