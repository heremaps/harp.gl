# Overview

The DataSource Protocol package contains components used for the decoding and styling of data that is used by the Datasources. This code is shared between the ui-thread and the web-workers which are used to parallelise the decoding of the data.


# Decoded Tile

The DecodedTile component contains:
  * Interfaces and utility function for the communication with the web-worker based decoders
  * The interfaces for the DecodedTile and its containing Geometries.

# Techniques
  * The interfaces for the Style Techniques that can be applied via the theme files.

# WorkerDecoderProtocol
  * The message-types used for the communication with the web-worker-based decoders.
