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
of these techniques are defined and placed in the _theme_ file.

The theme JSON file enables writing conditions which the data received from the datasource
must match for a style to be applied to it. When a condition is met a set of attributes are applied
to the map object is changed according to a set of predefined attributes. There is an example of a
minimal theme file below. It styles the names of continents and draws a line around islands,
archipelagos, cliffs and bridges.

The theme file enables to define multiple `styles` which are bound to the data format received from
a datasource (for example a tilezen based one, check [here for more information on tilezen vector tile datasource](https://github.com/tilezen/vector-datasource)).

```json
{
    "styles": [
        {
            "styleSet": "tilezen",
            "layer": "earth",
            "when": "kind in ['continent']",
            "technique": "text",
            "priority": ["step", ["zoom"], 0,
                2, 120,
                3, 100,
                4, 60
            ],
            "color": "#E48892",
            "fontVariant": "AllCaps",
            "opacity": 0.6
        },
        {
            "styleSet": "tilezen",
            "layer": "earth",
            "when": ["match", ["get", "kind"],
                ["archipelago", "cliff", "ridge", "island"], true,
                false
            ],
            "technique": "line",
            "color": "#C1BDB3"
        }
    ]
```

The conditions can be based on the datasource metadata
(for example data layer like water or buildings or a specific flag like `isBridge`).

An example theme file used in harp-examples could be found in the
[berlin_tilezen_base.json](../harp-map-theme/resources/berlin_tilezen_base.json).
Theme file is closely connected with the type of data received from the datasource.

`"technique"` - determines which technique should be applied to objects fulfilling the condition

```json
{
    "styleSet": "tilezen",
    "description": "Exemplary theme condition",
    "when": ["any",
        ["==", ["get", "kind_detail"], "pier"],
        ["==", ["get", "landuse_kind"], "pier"],
    ],
    "technique": "solid-line",
    "color": "#00f",
    "lineWidth": ["interpolate", ["linear"], ["zoom"],
        13, "1.5px",
        14, "1.2px",
        15, "0.9px"
    ]
}
```

### Feature Selection Expressions

In the above example there is a condition used within the theme which is applying a solid-line
technique to a map feature which has a `kind_detail` or `landuse_kind` property equal to _pier_. The
line is rendered with different line widths depending on the current map zoom level.

Note that the typical logical operators like:

-   `all` for computing the conjunction of sub-conditions
-   `any` for computing the alternative of sub-conditions

`"when"` - is a property that holds a description of the condition. This condition queries the
feature data which and uses one or many of the following operators:

-   `~=` (_tilde equal_), returns **true** when the value on the left _contains_ the value on the
    right, for example:

```json
    "when": ["~=", ["get", "kind_detail"], "park"]
```

this condition would match `kind_detail`s like _national_park_, _natural_park_, _theme_park_ but
also _parking_

-   `^=` (_caret equal_), returns **true** when the value on the left _starts with_ the value on the
    right, for example:

```json
    "when": ["^=", ["get", "kind_detail"], "water"]
```

the above condition would match `kind_detail`s like: _water_park_, _water_slide_ or
_water_works_ but **not** _drinking_water_

-   `$=` (_dollar equal_), returns **true** when the value on the left _ends with_ the value on the
    right, for example:

```json
    "when": ["$=", ["get", "kind_detail"], "water"]
```

the above condition would match `kind_detail`s like: _drinking_water_ but **not** _water_park_

-   `==` (_equal equal_), returns **true** when the value on the left _is equal to_ the value on the
    right, for example:

```json
    "layer": "roads",
    "when": ["==", ["get", "kind"], "rail"],
```

the above condition would match _roads_ `$layer` and the `kind` of **rail**

-   `!=` (_exclamation mark equal_), returns **true** when the value on the left _is not equal to_ the
    value on the right, for example:

```json
    "description": "All land roads except rail",
    "layer": "roads",
    "when": ["!=", ["get", "kind"], "rail"],
```

the above condition would match all `kind`s which are **not** _rail_ on the _roads_ `$layer`

For more in-depth details about the equality operators check the [@here/harp-datasource-protocol/lib/Theme.ts](https://github.com/heremaps/harp.gl/blob/master/%40here/harp-datasource-protocol/lib/Theme.ts).

Additionally there are two more operators available (`has` and `in`):

-   `has(`_variable name_`)` returns **true** when the feature contains the specified variable and it
    is not _undefined_, for example:

```json
    "description": "lakes (on high zoom level show only biggest lakes)",
    "when": ["any",
        ["==", ["get", "kind"] "lake"],
        ["has", "area"],
    ]
```

the above condition would match all `kind`s which have the value _lake_ **or** the _area_ property
defined.

-   `in[`_array of possible values_`]` returns **true** when the feature contains one of the values
    specified in the array, for example:

```json
{
    "description": "Earth layer",
    "layer": "earth",
    "styleset": "tilezen",
    "when": ["in", ["get", "kind"],
        ["literal", ["archipelago",
                     "cliff",
                     "island"]]
    ],
    (...)
}
```

the above conditions would match all features from `earth` layer which `kind` is equal either to
'archipelago', 'cliff' or 'island'.

## Where to put style changes for a certain feature or map object?

A style for a certain feature (map object) on the map is kept in the `attr` object. Here is an
example:

```json
    "color": "#E48892",
    "fontVariant": "AllCaps",
    "opacity": 0.6,
    "priority": ["step", ["zoom"], 0,
        2, 120,
        3, 100,
        4, 60
    ]
```

A list of possible style modifier for each techniques can be found in the [`Techniques` class' source code](https://github.com/heremaps/harp.gl/blob/master/%40here/harp-datasource-protocol/lib/Techniques.ts).

Most common properties include:

-   `priority`: Sets a `priority` of a map object, defaults to `0`. Objects with highest priority get
    placed first. Can be defined to vary depending on the zoom level with some default value. (see the
    example above).

-   `renderOrder`: which enables to define the render order of the objects created using a particular
    technique.

-   `color`: color in hexadecimal or CSS-style notation, for example: `"#e4e9ec"`, `"#fff"`,
    `"rgb(255, 0, 0)"`, `"rgba(127, 127, 127, 1.0)"`, or `"hsl(35, 11%, 88%)"`.
