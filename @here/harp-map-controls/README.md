# @here/harp-map-controls

## Overview

This module provides MapControls and MapAnimations which implement a common default set of camera functionality in a map context.

### Using the MapAnimations

The MapAnimations can simply be added to the existing MapView. The animations should not start from
the beginning, but after a few seconds, so the MapView has time to load the data for the first tiles.
A timeOut of 2000ms should be fine for most situations.

### CameraRotationAnimation

For the CameraRotationAnimation, the
MapControls that may be employed to manipulate the view should also be passed in, so the camera
animation can pause during the manipulation.

```typescript
const camRot = new CameraRotationAnimation(this.mapView, this.mapControls,
    {
        axis: new THREE.Vector3(0, 0, 1),
        duration: (20. * 1000),
        endAngle: 720
    });

this.mapView.addEventListener("render", (event: RenderEvent) => {
    camRot.update();
})

camRot.start();
```

### CameraPanAnimation

The CameraPanAnimation is not connected to the MapControls. If moves along the specified path, while
the camera orientation is not changed, it may be animated independently.

```typescript
this.mapView.geoCenter = new GeoCoordinates(52.515276, 13.377689000000002, 8000);

const camPan = new CameraPanAnimation(this.mapView,
    {
        // low level flight above Berlin
        // duration: (40. * 1000),
        // geoCoordinates: [
        //     new GeoCoordinates(52.52006626, 13.40764352, 800),
        //     new GeoCoordinates(52.48094817, 13.3909456, 800),
        //     new GeoCoordinates(52.518611, 13.376111, 800)
        // ],

        // Longer lasting higher level flight above Germany and France.
        duration: (400. * 1000),
        geoCoordinates: [
            new GeoCoordinates(48.138137, 11.575682, 15000),
            new GeoCoordinates(50.93873, 6.95236, 10000),
            new GeoCoordinates(48.853190, 2.348585, 8000)
        ],

        repeat: Infinity,
        interpolation: InterpolationFunction.CatmullRom
    });

this.mapView.addEventListener("render", (event: RenderEvent) => {
    camPan.update();
})

camPan.start();
```
