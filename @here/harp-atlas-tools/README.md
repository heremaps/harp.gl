# Package content - the tools

HARP atlas tools are build in Node.js environment (see: https://nodejs.org) so you will
need to install some prerequisities to use them:

-   **Node.js**
-   java script package manager, for example **npm** which is distributed with Node.js or **yarn**.
-   **npx**, the npm package runner, that simplifies usage of CLI tools (in the newest versions of npm it is installed automatically).

There are two complementary applications in the package and they are distributed as command line tools (CLI), thus after installing:

```
npm install harp-atlas-tools
```

in directory of your choice you will have two applications available:

-   harp-atlas-generator
-   harp-sprites-generator

You may simply launch them from you command line shell, using **npx**, adding **--help** option allows to see their short version of usage manual:

```
npx harp-atlas-generator --help
npx harp-sprites-generator --help
```

# **harp-atlas-generator**

The main usage of this **tool** is to create single image file containing all assets for specific
use case. Such file is ussually refered as **Texture Atlas** or **Sprites Atlas** because it
actually contains multiple sprites (images) that occupy atlas regions. There there are several
advantages of such approach:

-   single header only, that stores image format meta-data (less storage consumption),
-   shorter loading times (single file instead of many),
-   sometimes better assets organization (single file instead of folders structure),
-   performance optimization - when rendering features are grouped in the pipeline you may expect
    less cache misses and most importantly decrease texture switches which are crucial in GPU
    oriented rendering engines. Simply said if all features in the render batch share the same
    texture (**texture atlas**) there is not need to change render states and most importantly
    reload textures to VRAM.

As with any other CLI tools, you may simply launch it from you command line shell, launch it with **--help** option to see the short user manual:

```
npx harp-atlas-generator --help
```

## Simple configuration options

Although most of the tool options are self explanatory, it is good to explain few of them in details.

| Option                       | Description                                                                                                                                                                                                                                                                                                           |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-i, --in [path]`            | Input path, gives a path to directory or expression (using wildcards) for filtering input files.                                                                                                                                                                                                                      |
| `-o, --out [file]`           | This will be a path to newly created sprite atlas files, saved in PNG image format, so please do not add extension here, two files will be created: image with _.png_ extension and JSON descriptor file with _.json_ extension.                                                                                      |
| `-p, --padding [number]`     | Spacing between icons in the output atlas image.                                                                                                                                                                                                                                                                      |
| `-w, --width [number]`       | Predefined width for every sprite in atlas, if you set this parameter to zero, (or leave default) and set `-h --height` parameter to some other value sprites will get their width based on height set and to preserve original image aspect ratio. If both -w and -h are set to zero original image size is applied. |
| `-h, --height [number]`      | Simillar to width but defines height of sprite in atlas, zero leaves original size or constraints height to width (if is set) while preserving aspect ratio.                                                                                                                                                          |
| `-m, --minify`               | Parameter switch that enables output JSON optimization, less storage space used, but hard to read for human.                                                                                                                                                                                                          |
| `-v, --verbose`              | Turn on **Verbose mode** giving extended logging output.                                                                                                                                                                                                                                                              |
| `-j, --jobs [number]`        | Number of processing threads (virtually).                                                                                                                                                                                                                                                                             |
| `-c, --processConfig [path]` | Sets the path to special JSON configuration file with pre-processing steps to be performed.                                                                                                                                                                                                                           |

> **Important note**
>
> If you are not sure to install entire package via **npm**, but have cloned repository you may still run in from root package directory `@here/harp-atlas-tools`. Just install
> dependencies localy and use **yarn run** command instead of **npx**:
>
> ```
> yarn
> yarn run harp-atlas-generator --help
> ```
>
> So basically in this setup you may replace all **npx** commands with **yarn run**.

## Advanced configuration

The most of _magic_ during atlas creation or sprites pre-processing may be done via processing configuration
file, passed with **-c, --processConfig** parameter.

Sample configuration which converts icons to grayscale, add backgrounds and inverts colors while giving them
night mode look & feel is presented below:

```JSON
{
    "processingSteps": [
        { "name": "Grayscale", "method": "Average" },
        { "name": "AddBackground", "image": "resources-dev/backgrounds/icon-bg-17x17.png", "offset": { "x": 3, "y": 3 } },
        { "name": "InvertColor"}
    ]
}
```

The same effect may be achieved with slightly more advanced config, even with fully colored background image :

```JSON
{
    "processingSteps": [
        { "name": "CombineImages", "image": "resources-dev/backgrounds/icon-bg-17x17.png", "blendMode" : "BlendAlpha", "sizeRef": "Dst", "offset": { "x": 3, "y": 3 } },
        { "name": "Grayscale", "method": "Average" },
        { "name": "InvertColor"}
    ]
}
```

Basically configuration starts with **processingSteps** node which defines array of objects (steps). Processing
may be performed parallely (see '-jobs' param) for different images, but for single image, the processing order is
always preserved. So simply said you may achieve totally different effects by changing the order of processing
steps defined here.

Each step is again defined as JSON object, with one common attribute - **name** being the most significant, such
as it decides what kind of operation you wish to perform on images. Each operation usually have its' own
attributes set that may define different behaviour (i.e. blending modes), additional input image (for adding backgrounds, foregrounds or blending other layers).

For full set of operations available and their parameters please refer to:
[ImageProcessing.ts](https://github.com/heremaps/harp.gl/tree/master/%40here/harp-atlas-tools/src/ImageProcessing.ts)

# **harp-sprites-generator** - complementary tool

Although the **harp-atlas-generator** tool is flexible enough for most use cases, it may be neccessary to
perform different images processing for some sub-sets of input images. As example, you may need to resize
only few images of input set while leaving original size, but adding foreground to few others.
For this purpose you may use **harp-sprites-generator**. The tool which performs images post-processing with
same configuration rules as **harp-atlas-generator** (see: [Simple configuration options](#simple-configuration-options)), but instead of merging all images into atlas, it outputs
**sprite** files speparatelly to specified directory output directory. This way you may spread your work into few steps:

1. Sub-set A (img0.png, img1.png) preprocessing:

```
npx harp-sprites-generator -i *.png -o 'intermediate' -c 'resizeConf.json'
```

2. Sub-set B (ico0.svg, ico2.svg ...) preprocessing:

```
npx harp-sprites-generator -i *.svg -o 'intermediate' -c 'resizeConf.json'
```

3. Merging outputs from 1 and 2 into single sprite atlas:

```
npx harp-atlas-generator -i 'intermediate/*' -o 'atlas'
```

---

# Creating _generic_ icons set

Since the icons that come with **harp.gl** (https://github.com/heremaps/harp.gl) have a license that
limits its usage depending on what map data is being displayed, another set of icons may be
required.
To create another set of icons, the popular and freely available maki icons can be used
(https://labs.mapbox.com/maki-icons/).

The process of generating them is not difficult, and harp-atlas-tools will help in doing so.
It utilizes Node.js environment to run a CLI script that converts the vector format (SVG) maki icons,
into single PNG sprite sheet which will contain all icons in form of single atlas, both with appropriate
JSON file describing the particular icon's position and region within it. In order to use
**harp-atlas-tools** firstly download package using manager of your choice, for example:

```
npm install harp-atlas-tools
```

The process of creating complete icons set (sprites-sheet) is simple, but it's good to know some insights in
order to understand the output.
Firstly download the 'maki-icons' set and extract them into some local folder of you choice, for convinience
let's call it:
`resources-tmp`.

```
mkdir resources-tmp && cd resources-tmp
curl -L https://github.com/mapbox/maki/tarball/master | tar -xz --strip=1 --wildcards */icons
cd ..
```

You should now have a lot of SVG (vector) graphics in the folder `resources-tmp/icons`. Some of them have `-11`
suffix some ends with `-15`. This are to sizes (11x11 px and 15x15 px) of maki icons available.
It's a good time to choose which version is more convinient for your purposes, or maybe you will need both.
Let's see that steps to achieve this.

Maybe you have already noticed that 'maki-icons' set constains clip arts that do not have a background,
which allow easy styling, but the such icons do not have any border, and may easily be overlooked on the map.
To make them look like _real_ icons, a background should be added, and atlas creation tool actually allows for it.
Firstly you will need some background graphics (frame) that improves their usability and visibility.
Some simple backgrounds are already prepared in the **harp-atlas-tools** package directory
under `resources-dev/backgrounds` for your convinience. It should reside at `node_modules/@here/harp-atlas-tools/` sub-folder of your installation directory.

In order to simplify paths you may copy it to you current folder or create sym-link to it (you do not need to do it if your work in the root package directory: `@here/harp-atlas-tools`):

```
cp -R node_modules/@here/harp-atlas-tools/resources-dev resources-dev
```

or

```
ln -s node_modules/@here/harp-atlas-tools/resources-dev resources-dev
```

Before proceeding make sure there is a folder in your current workspace `resources-dev/backgrounds` containing these two images named:

```
icon-bg-17x17.png
icon-bg-22x22.png
```

These backgrounds are perfectly matching 'maki-icons' set, for _11px_ and _15px_ icons respectively. You just need
proper **tool** configuration that will merge each SVG graphics with background. Such configs should be already
there in the node package installed under `resources-dev/configs` folder (the folder you already coppied above):

```
maki-day-11.json,
maki-day-15.json,
```

Feel free to modify and adjust those configs or even use them as reference for your own icons set. They differ
only with background image size used. Configuration files inform generator that each single icon will get composed
with a background image that we provide. Because we need background bigger then maki clip-art itself, the post-processing step takes background image size as reference for output, thus our script will generate the icons
in the sizes of **17x17** and **22x22** respectivelly.

---

You may probably noticed that there is slight problem if we want to pack all icons into singe atlas, because some
`maki-icons` will require bigger background and some of them smaller (depending on the suffix).

To solve this problem you may create atlas in three steps. Firstly prepare bigger version of maki icons, processing them with **harp-sprites-generator**, next do the same with smaller icons sizes and then merge them all together
with **harp-atlas-generator** yet without any special configuration, thought you have already post-processed icons
to final shape.

Let's follow this process in details.

1. Firstly launch the texture generator tool for 15 pixels size maki icons running CLI command:

```
npx harp-sprites-generator -i "resources-tmp/icons/*-15.svg" -o "resources-tmp/sprites_day" -c "resources-dev/configs/maki-day-15.json" -v
```

Sprites generator should export all SVG files as PNGs to `resources-tmp/sprites_day` folder, if you would like
to know what happens behind the scene please take a look configuration file being used:
`resources-dev/configs/maki-day-15.json`

> Note
>
> **-v** parameter at the end of CLI call is optional and simply says >log everything on console (_Verbose mode_).

2. Secondly launch the same process, but for smaller icons size and with different process config:

```
npx harp-sprites-generator -i "resources-tmp/icons/*-11.svg" -o "resources-tmp/sprites_day" -c "resources-dev/configs/maki-day-11.json" -v
```

Now you should have all sprites (with suffixes `-11.png` and `-15.png`) exported in `resources-tmp/sprites_day`
folder, so it's only one step away to create final atlas from them.

3. Run atlas generator on pre-processed icons set:

```
npx harp-atlas-generator -i "resources-tmp/sprites_day/*" -o "resources/maki_icons_day" -v
```

The resulting file `maki_icons_day.png` and `maki_icons_day.json` will be written to the folder `resources`. These are
sprite sheet image (or so called texture atlas) and its JSON descriptor file.

There are also few other configurations that allows to get somehow fancier results such us night-mode icons:

```
maki-night-11.json,
maki-night-15.json.
```

or colored ones:

```
maki-red-on-white-11.json,
maki-red-on-white-15.json.
```

Spend some time to play with them to see how different effects you may achive by using tool post-processing
features.

If you are curious, just check out how simple is to create night version of `maki` icons set:

```
yarn run harp-sprites-generator -i "resources-tmp/icons/*-11.svg" -o "resources-tmp/sprites_night" -c "resources-dev/configs/maki-night-11.json" -v

yarn run harp-sprites-generator -i "resources-tmp/icons/*-15.svg" -o "resources-tmp/sprites_night" -c "resources-dev/configs/maki-night-15.json" -v

npx harp-atlas-generator -i "resources-tmp/sprites_night/*" -o "resources/maki_icons_night" -v
```

---

# The Sprites Atlas

The sprite atlas generated by **harp-atlas-generator** uses SpriteSmith notation, that looks like this:

```JSON
{
    "aerialway-11": { "x": 335, "y": 198, "width": 17, "height": 17 },
    "aerialway-15": { "x": 0, "y": 0, "width": 22, "height": 22 },
    "airfield-11": { "x": 299, "y": 270, "width": 17, "height": 17 },
    "airfield-15": { "x": 23, "y": 184, "width": 22, "height": 22 },
    ...
}
```

JSON file presented above contains the specification for:

-   **aerialway-11**,
-   **aerialway-15**,
-   **airfield-11**,
-   **airfield-15**

icons.

The area defined by **x/y/width/height** specifies the part of atlas to be used for the specific icon,
in one case **aerialway-11**. **aerialway** is the maki code, and **-11** shows that it
is the smaller of the two. To select the icon for a map data item, few things are involved, cause we need to supply the _link_ in theme style definition between layer data and icon name. This can be done in several ways:

-   the theme defines which layer data field is used as base for texture name (`imageTextureField`) and which prefix/suffix is applied (`imageTexturePrefix`, `imageTexturePosix`) for the final texture name,
-   the `poiName` is used as a selector for the sprite atlas icon directly or indirectly by using **POI table**,
-   the resulting `iconName` from **POI Table** is extended via style to choose one of the desired icon sizes via `imageTexturePosix` name suffix ( "-11" or "-15"),

For example, if there is a feature in the layer **pois** which contains "aerialway" in the
field `kind`, the **icon name** "aerialway-11" should be computed by the theme.

# Using the atlas

In order to explain the process, let's see sample theme configuration for Tilezen data source.

## Declaring the usage in the Theme File

To actually use the sprite atlas as a source of POI icons, some modifications need to be done in the **theme file**.

First of all sprite atlas need to be loaded, to make that happen, declare its use in the **images** json object just at the root node:

```JSON
{
    ...
    "images": {
        "icons_day_maki": {
            "url": "maki_icons_day.png",
            "preload": true,
            "atlas": "maki_icons_day.json"
        }
    },
    ...
}
```

Next thing you need to do is to define styling for `pois` or any other layer that exposes POIs info via decoder of your choice. Let's present example how it would look for Tilezen tile format which encapsulates POIs information in `pois` layer with `kind` property that allows for distinguishing between POI object types.

> Note
>
> Full list of POIs types in Tilezen specification may be found here:
> [Tilezen POI layer](https://tilezen.readthedocs.io/en/latest/layers/#points-of-interest)

It is clear that you need to map `kind` property value to the name of your exported icon in atlas sheet.

You could do it manually for every POI type (`kind`) by defining style for each of POIs, but you may also utilize so called **PoiTable** which defines this mapping in separate file
so styling will be simple as it:

```JSON
{
    ...
    "poiTables": [
        {
            "name": "tilezenMakiPoiTable",
            "url": "poi_table_maki.json",
            "useAltNamesForKey": true
        }
    ],
    "styles": {
        "tilezen": [
            {
                "description": "POIs in tilezen format using Maki icons",
                "when": "$layer == 'pois' && has(kind)",
                "technique": "labeled-icon",
                "attr": {
                    "poiTable": "tilezenMakiPoiTable",
                    "poiNameField": "kind",
                    "imageTexturePosix": "-15",
                    "size": 16,
                    "vAlignment": "Center",
                    "hAlignment": "Center",
                    ...
                },
                "final": true
            },
            ...
        ]
    }
}
```

Some things may require explanation. Firstly we declare **PoiTable** which defines mapping from `poiNameField` to custom icons names. Because one icon may serve for several POIs `kind` we declare usage of
alternative names (`useAltNamesForKey`). This way we have defined N:1 mapping from Tilezen POI names (`kind`s) to icon defined in atlas.

Sample **PoiTabe** table may look like this:

```JSON
"poiList": [
    {
      "name": "Restaurant",
      "altNames": [
        "bbq",
        "ice_cream",
        "restaurant"
      ],
      "visible": true,
      "stackMode": "yes",
      "iconName": "restaurant",
      "priority": 88,
      "iconMinLevel": 18,
      "iconMaxLevel": 20,
      "textMinLevel": 18,
      "textMaxLevel": 20
    },
    ...
]
```

You may probably noted that we do not define exact image name in **POI Table** field **iconName** (it could be **restaurant-11** or **restaurant-15**), this is because our **maki** icons set contains two icons sizes . We define only the base name in table field (**"iconName": "restaurant"**) and the rest (posix) is added via styling mechanism (**"imageTexturePosix": "-15"**). This allows for better flexibility cause you may
decide to use different icons sizes depending on zoom level or any other styling conditionals.

Different styles (sizes, colors, etc.) may be implemented by using **when** or **in** -statements to select for which icons a specific style should be used, but still utilizing the same **POI Table** definition.

### The POI Table

The **POI Table** (file **poi_table_maki.json**) presented here is used in conjunction
with the sprite atlas and the map data in Tilezen format. It is used to specify in more detail how a specific
icon should be displayed, without having to specify it in the theme file(s) for every single POI
type.

### Style in Theme

The property **poiTable** is used to selected which one of the POI tables declared at the
beginning of the them file.

The property **poiNameField** specifies which field should be used as the name of the POI in the
POI Table.

The property **imageTexturePosix** defines the posix that should be added to **iconName** attribute defined in
**POI Table** to construct the final texture name.

```JSON
...
 "poiTables": [
        {
            "name": "tilezenMakiPoiTable",
            "url": "poi_table_maki.json",
            "useAltNamesForKey": true
        }
    ],
    "styles": {
        "tilezen": [
            {
                ...
                "when": "$layer == 'pois' && has(kind)",
                "technique": "labeled-icon",
                "attr": {
                    "poiTable": "tilezenMakiPoiTable",
                    "poiNameField": "kind",
                    "imageTexturePosix": "-15",
                    ...
                }
            }
        ]
    }
...
```

Similarly you may use **imageTexturePrefix**, so final texture is created from both of them with following pattern:

```
<imageTexturePrefix>poiTable[poiNameField].iconName<imageTexturePosix>
```

where <code>poiTable[poiNameField]</code> means a lookup into Poi Table object, <code>iconName</code> is object property and <code>imageTexturePrefix</code> and <code>imageTexturePosix</code> are optional fields of style <code>att</code> object.

#### POI Table Content

Without going into all details here, the field **name** is used to identify a table entry. The
strings in **altNames** are optional, alternative names, all identifying the same table entry. The
values in **name** and **altNames** have to be unique.

The field **iconName** is being used to identify the actual icon in the sprite atlas. Please note that it is possible to add prefix and posix to this name via style attributes: **imageTexturePrefix** and **imageTexturePosix**.

```JSON
...
    {
      "name": "Restaurant",
      "altNames": [
        "bbq",
        "ice_cream",
        "restaurant"
      ],
      "visible": true,
      "stackMode": "yes",
      "iconName": "eatdrink_main",
      "priority": 88,
      "iconMinLevel": 18,
      "iconMaxLevel": 20,
      "textMinLevel": 18,
      "textMaxLevel": 20
    },
...
```

---
