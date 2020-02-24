# Labeling

## Feature Overview

harp.gl supports labeling as part of the [[harp-mapview]] package, including features such as:

* Signed distance field text rendering provided by [[harp-text-canvas]].
* Text only, icon & text and icon only labels.
* Placement on anchor point or along a path.
* Rendering and layout styling using techniques provided by [[harp-datasource-protocol]].
* Label collision resolution based on priorities.
* Label overlapping with support for multiple layers.
* Fading animations.
* Label fading and scaling based on camera distance.
* Label picking.

## Architecture overview

<a href="media://label-rendering/component_diagram.svg">
    <img src="media://label-rendering/component_diagram.svg" title="Component Diagram" />
</a>
<p style='font-style:italic; text-align: center;'>Component Diagram</p>

There's 3 harp.gl packages involved in labeling:

* [[harp-datasource-protocol]]: Provides the [[ITileDecoder]] interface that has to be implemented
by any decoder to generate from any data source the geometry and techniques used to place and style labels, arranged in [[DecodedTile]]s.
    * Geometry can be either [[TextGeometry]] for point labels, or [[TextPathGeometry]] for labels placed along a path.
    * There's 3 available techniques to style labels:
        * [[TextTechnique]] to style text.
        * [[PoiTechnique]] to style an icon.
        * [[LineMarkerTechnique]] when the same icon needs to be placed multiple times along a path (e.g. route icons).

* [[harp-mapview]]: The main classes involved in labeling are:
    * [[TileGeometryCreator]] Creates [[Tile]]s from the [[DecodedTile]]s returned by the decoders, as well as the [[TextElement]]s in each of them that will represent the decoded text geometry.
    * [[PoiManager]] Stores the image textures used to render icons and creates [[PoiInfo]]s for text elements with icons, which hold the styling properties needed to render them.
    * [[TextElementsRenderer]] Coordinates the whole lifecycle of a [[TextElement]], from the moment
    it's added to a frame till is either rejected or rendered on screen. It also keeps the
    [[TextElementState]], which holds the current opacity of all parts (icons,text) of a [[TextElement]] being rendered.
    * [[PoiRenderer]] Renders icons according to the [[PoiInfo]]s properties.

* [[harp-text-canvas]]: Text rendering package that generates, places and renders glyphs:
    * [[TextCanvas]] Places [[GlyphData]] on screen and renders it with the specified [[TextRenderStyle]] and [[TextLayoutStyle]].
    * [[FontCatalog]] Creates the [[GlyphData]] that represents a [[TextElement]].
    * [[TextRenderStyle]] contains all style properties affecting how text is rendered on screen.
    * [[TextLayoutStyle]] contains all style properties affecting how text is placed on screen.

## TextElementsRenderer

The following class diagram shows the main classes used by [[TextElementsRenderer]] for label rendering:

<a href="media://label-rendering/text_renderer_class_diagram.svg">
    <img src="media://label-rendering/text_renderer_class_diagram.svg" title="TextElementsRenderer Class Diagram" />
</a>
<p style='font-style:italic; text-align: center;'>TextElementsRenderer Class Diagram</p>

* [[TextElementStateCache]] : Here [[TextElementGroupState]]s are cached, each one holding the state
of a [[TextElementGroup]] that's being rendered, including the [[TextElementState]]s with the fading state corresponding to all [[TextElement]]s within the group.
    * The class has an additional [[TextElementState]] map by text or feature id, used to **deduplicate labels** (same label may be sent to [[TextElementsRenderer]] more than once due to tile fallback logic or tile overlapping in the data source) and ensure **label persistence** across zoom levels (i.e. same label coming from different LODs should be handled as the same instance, without any fading transitions between the two).
* [[TextStyleCache]] : Here a [[TextRenderStyle]] and a [[TextLayoutStyle]] are cached for each rendered
[[TextElement]], containing the styling attributes extracted from the matching [[TextStyleDefinition]] from [[Theme]] and the corresponding label technique (e.g. [[TextTechnique]]).
* [[ScreenCollisions]] Checks whether labels that are being placed on screen collide with other labels
that are already placed. It uses a R-Tree to allocate axis-aligned bounding boxes delimiting the labels.
For path labels collision is checked glyph by glyph, for any other label only its coarse bounding box
is used.
* [[PoiRenderer]] Arranges [[PoiInfo]]s by image texture into PoiRenderBufferBatches. Each batch has a [[BoxBuffer]] where
the box geometry corresponding to all POIs in the batch is added to a [[BoxBufferMesh]] and rendered using [[IconMaterial]].
* [[TextCanvas]] Arranges [[GlyphData]] into different [[TextCanvasLayer]]s according to the renderOrder of the corresponding [[TextElement]]. Each layer has a [[TextGeometry]] containing
2 meshes: one for text and another for text background. These meshes use [[SdfTextMaterial]] to render text. Text can be place along a path using [[PathTypesetter]] or on straight lines using [[LineTypesetter]].

## Labeling Frame Sequence

The following sequence diagram gives an overview of the labeling workflow within a single frame:

<a href="media://label-rendering/frame_sequence_diagram.svg">
    <img src="media://label-rendering/frame_sequence_diagram.svg" title="Frame Sequence Diagram" />
</a>
<p style='font-style:italic; text-align: center;'>Frame Sequence Diagram</p>

