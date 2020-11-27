# Style Expressions

Style expressions are used in __harp__ themes to filter and configure
`techniques`.

## all

Returns `true` if all the sub expressions evaluate to `true`.

```javascript
["all", expr...]
```

## any

Returns `true` if any sub expression evaluates to `true`.

```javascript
["any", expr...]
```

## none

Returns `true` if no sub expression evaluates to `true`.

```javascript
["none", expr...]
```

## id

Returns the id of the current feature.

```javascript
["id"]
```

## feature-state

Returns the value of the given property from the current feature's state.

```javascript
["feature-state", property]
```

## geometry-type

Returns a `string` representing the geometry type of the current feature.
The supported primitive types are: `Point`, `LineString`, and `Polygon`.

```javascript
["geometry-type"]
```

## ref

References a value definition.

```javascript
["ref", name]
```

## get

Gets the property value of the current `feature` or an `object`. Returns `null`
if the property is missing.

```javascript
["get", name]
["get", name, object]
```

## has

Returns a `boolean` indicating if the current `feature` or the given
`object` has the specified property.

```javascript
["has", name]
["!has", name]

["has", name, object]
["!has", name, object]
```

## dynamic-properties

Gets the properties that are evaluated at rendering time.

```javascript
// returns an object containing the dynamic properties.
["dynamic-properties"]

// gets the value of the dynamic property `animating`
["get", "animating", ["dynamic-properties"]]

// `true` if `animating` is a dynamic property.
["has", "animating", ["dynamic-properties"]]
```

## in

Returns a `boolean` indicating if the `value` is included in the given array or string.

```javascript
["in", value, array]
["in", value, string]

["!in", value, array]
["!in", value, string]
```

## match

Compares `value` with the labels and returns the `result` of the first match.
If the `value` doesn't match any label `fallback` will be returned. A `label`
must be a `number`, a `string`, or an `array` of those.

```javascript
["match",
  value,
  label1, result1,
  ...
  labelN, resultN,
  fallback
]
```

## case

Evaluates the conditions in order and return the result matching the condition.
The `fallback` will be returned if no conditions evaluates to true.

```javascript
["case",
  condition1, result1,
  ...
  conditionN, resultN,
  fallback
]
```

## to-boolean

Converts the value to `boolean`.

```javascript
["to-boolean", value]
```

## to-string

Converts the value to `string`.

```javascript
["to-string", value]
```

## to-number

Converts the value to `number`, if the value cannot be converted to a number
returns the value of the first `fallback` that is a number.

```javascript
["to-number", value, fallback...]
```

## to-vector2

Converts the value to "vector2", if the value cannot be converted to a vector2
returns the value of the first `fallback` that is a vector2.

```javascript
["to-vector2", value, fallback...]
```

## to-vector3

Converts the value to "vector3", if the value cannot be converted to a vector3
returns the value of the first `fallback` that is a vector3.

```javascript
["to-vector3", value, fallback...]
```

## to-vector4

Converts the value to "vector4", if the value cannot be converted to a vector4
returns the value of the first `fallback` that is a vector4.

```javascript
["to-vector4", value, fallback...]
```

## literal

Returns the given object or array.

```javascript
["literal", JSON]
["literal", [element...]]
```

## rgb

Creates a `color` from the RGB components. The components must be integers between 0 and 255.

```javascript
["rgb", number, number, number]
```

## rgba

Creates a `color` from the RGBA components. The color channels (R, G, B) must be defined as
integers between 0 and 255, while last component - alpha - holds floating point value between
0.0 and 1.0 inclusively.

```javascript
["rgba", number, number, number, number]
```

> NOTE:
>
> Currently alpha channel value is silently ignored, thus full support for defining opacity with
**rgba** expression needs to be implemented.

## hsl

Creates a `color` from the HSL components:

  — hue value in degrees
  — saturation value between 0 and 100
  — lightness value between 0 and 100

```javascript
["hsl", number, number, number]
```

## alpha

Extracts the alpha component from the given color.

```javascript
["alpha", color]
```

## !

Returns `false` if its value can be converted to `true`; otherwise, returns `true`.

```javascript
["!", value]
```

## ==

Returns `true` if the values are equal.

```javascript
["==", value, value]
```

## !=

Returns `true` if the values are not equal.

```javascript
["!=", value, value]
```

## <

Returns `true` if the first value is less than the second value.

```javascript
["<", value, value]
```

## >

Returns `true` if the first value is greater than the second value.

```javascript
[">", value, value]
```

## <=

Returns `true` if the first value is less than or equal to the second value.

```javascript
["<=", value, value]
```

## >=

Returns `true` if the first value is greater than or equal to the second value.

```javascript
[">=", value, value]
```

## boolean

Returns `value` if it is `boolean`; otherwise, returns the first
fallback that is a `boolean`.

```javascript
["boolean", value, fallback...]
```

## number

Returns `value` if it is `number`; otherwise, returns the first
fallback that is a `number`.

```javascript
["number", value, fallback...]
```

## string

Returns `value` if it is `string`; otherwise, returns the first
fallback that is a `string`.

```javascript
["string", value, fallback...]
```

## vector2

Returns `value` if it is `vector2`; otherwise, returns the first
fallback that is a `vector2`.

```javascript
["vector2", value, fallback...]
```

## vector3

Returns `value` if it is `vector3`; otherwise, returns the first
fallback that is a `vector3`.

```javascript
["vector3", value, fallback...]
```

## vector4

Returns `value` if it is `vector4`; otherwise, returns the first
fallback that is a `vector4`.

```javascript
["vector4", value, fallback...]
```

## array

Validates the type of the given array value. The `type`
must be `"boolean"`, `"number"` or `"string"`; length must be an integer.
An error is generated if `value` is not an `array` with the given type
and length.

```javascript
["array", value]
["array", type, value]
["array", type, length, value]
```

for example:

```javascript
// asserts that 'speeds' is an 'array'
["array", ["get", "speeds"]]

// asserts that 'speeds' is an 'array' of numbers
["array", "number", ["get", "speeds"]]

// asserts that 'speeds' is an 'array' of 3 numbers
["array", "number", 3, ["get", "speeds"]]
```

## make-array

Creates an array from the given elements.

```javascript
["make-array", elements...];
```

for example:

```javascript
// create the array [1,2,3]
["make-array", 1, 2, 3]

// create an array with the values of the feature properties
// 'kind' and 'kind_details'
["make-array", ["get", "kind"], ["get", "kind_details"]]
```

## make-vector

Creates a vector 2/3/4 from the given components.

```javascript
["make-vector", x, y];
["make-vector", x, y, z];
["make-vector", x, y, z, w];
```

for example:

```javascript
// create a vector2 containing 10 and the value of the feature "y".
["make-vector", 10, ["get", "y"]]
```

## coalesce

Returns the first `value` that does not evaluates to `null`.

```javascript
["coalesce", value...]
```

## ppi

Gets the `ppi` of the current device. If the `ppi` is not available
the default value `72` is returned.

```javascript
["ppi"]
```

## interpolate

Creates interpolation.

```javascript
["interpolate", ["linear"], ["zoom"],
   stop1, value1,
   ...
   stopN, valueN,
]

["interpolate", ["exponential", base], ["zoom"],
   stop1, value1,
   ...
   stopN, valueN,
]

["interpolate", ["discrete"], ["zoom"],
   stop1, value1,
   ...
   stop, valueN,
]
```

## step

Evaluates the given piecewise function. Returns `defaultValue` if
`input` is less than the first stop. Otherwise returns the value
associated with the `stop` that is greater than or equal to `input`.

```javascript
["step", input, defaultValue
   stop1, value1,
   ...
   stopN, valueN,
]
```

## length

Returns the length of an `array` or a `string` value.

```javascript
["length", string]
["length", value]
```

## at

Returns the element of the array at the given position.

```javascript
["at", number, array]
```

## slice

Extracts a section of the input `string` or `Array`.

```javascript
["slice", input, start, end]
["slice", input, start]
```

## concat

Concatenates the given string values.

```javascript
["concat", value, value...]
```

## downcase

Converts the value to a lowercase string.

```javascript
["downcase", value]
```

## upcase

Converts the value to a upcase string.

```javascript
["upcase", value]
```

## ~=

Returns `true` if the value contains the given `string`.

```javascript
["~=", value, string]
```

## ^=

Returns `true` if the value starts with the given `string`.

```javascript
["^=", value, string]
```

## $=

Returns `true` if the value ends with the given `string`.

```javascript
["$=", value, string]
```

## typeof

Returns a string representing the type of `value`.

```javascript
["typeof", value]
```

## Math operators

```javascript
["max", number, number]
["min", number, number]
["clamp", number, number, number]
["^", value, value]
["-", value, value]
["/", value, value]
["%", value, value]
["+", value, value...]
["*", value, value...]
["abs", value]
["acos", value]
["asin", value]
["ceil", value]
["cos", value]
["e"]
["floor", value]
["ln", value]
["ln2", value]
["log10", value]
["pi"]
["round", value]
["sin", value]
["sqrt", value]
["tan", value]
```
