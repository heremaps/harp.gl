/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoCoordinates, GeoCoordinatesLike } from "@here/harp-geoutils";
import { MapView } from "@here/harp-mapview";
import { PerformanceTimer } from "@here/harp-utils";
import * as TWEEN from "@tweenjs/tween.js";
import * as THREE from "three";

import { EventNames, MapControls } from "./MapControls";

/**
 * Functions used for specifying animations' speed.
 */
export enum EasingFunction {
    Linear,
    QuadraticIn,
    QuadraticOut,
    QuadraticInOut,
    CubicIn,
    CubicOut,
    CubicInOut,
    QuarticIn,
    QuarticOut,
    QuarticInOut,
    QuinticIn,
    QuinticOut,
    QuinticInOut,
    SinusoidalIn,
    SinusoidalOut,
    SinusoidalInOut,
    ExponentialIn,
    ExponentialOut,
    ExponentialInOut,
    CircularIn,
    CircularOut,
    CircularInOut,
    ElasticIn,
    ElasticOut,
    ElasticInOut,
    BackIn,
    BackOut,
    BackInOut,
    BounceIn,
    BounceOut,
    BounceInOut
}

/**
 * Functions used to generate intermediate animation values.
 */
export enum InterpolationFunction {
    Linear,
    Bezier,
    CatmullRom
}

/**
 * Abstract class used as base to define camera animations.
 */
export abstract class CameraAnimation {
    /**
     * Tweening controller.
     */
    protected tween?: TWEEN.Tween<GeoCoordinates | Record<string, number>>;

    /**
     * `True` if animation is being played.
     */
    protected running: boolean = false;

    /**
     * Callback that gets triggered once the animation ends.
     */
    protected onFinished?: () => void;

    /**
     * `True` if the animation has been interrupted.
     */
    protected stopped = false;

    /**
     * Duration of a whole animation in milliseconds. Defaults to `10` seconds.
     */
    protected duration: number = 10000;

    /**
     * Number of times the animation should be repeated. Defaults to `0`.
     */
    protected repeat: number = 0;

    /**
     * Easing function that control acceleration. Defaults to [[EasingFunction.Linear]].
     */
    protected easing = TWEEN.Easing.Linear.None;

    /**
     * Creates a new `CameraAnimation` object.
     *
     * @param mapView - [[MapView]] which will be affected by the animation.
     * @param name - Animation's name.
     */
    constructor(protected mapView: MapView, public name?: string) {
        checkSetupTween();
    }

    /**
     * Start the animation.
     *
     * @param time - Duration of the animation in milliseconds.
     * @param onFinished - Callback that gets triggered once the animation ends.
     */
    abstract start(time?: number, onFinished?: () => void): void;

    /**
     * Update function is to be called before the next frame is rendered.
     */
    update(time?: number): boolean {
        if (this.tween) {
            return this.tween.update(time ?? PerformanceTimer.now());
        }
        return false;
    }

    abstract stop(): void;

    /**
     * Returns `true` if the animation is being played.
     */
    get isRunning(): boolean {
        return this.running;
    }
}

/**
 * Options for a camera animation.
 */
export interface CameraRotationAnimationOptions {
    /** Fixed rotation axis of camera. Defaults to `[0,0,1]` for z-axis. */
    axis?: THREE.Vector3;
    /** Start angle in degrees. Defaults to 0. */
    startAngle?: number;
    /** End angle. May be greater than 360 in case more than one rotation is required. */
    endAngle?: number;
    /** Duration of a whole animation in milliseconds. Defaults to `10` seconds. */
    duration?: number;
    /** Number of times the animation should be repeated. Defaults to `0`. */
    repeat?: number;
    /** Easing function that control acceleration. Defaults to [[EasingFunction.Linear]]. */
    easing?: EasingFunction | ((k: number) => number);
}

/**
 * Create an animation around the Z-axis of the camera.
 */
export class CameraRotationAnimation extends CameraAnimation {
    /**
     * Initial camera rotation (in the Z-axis).
     */
    readonly startAngle: number = 0;

    /**
     * Final camera rotation (in the Z-axis).
     */
    readonly endAngle: number = 360;

    private readonly m_axis = new THREE.Vector3(0, 0, 1);
    private m_userCamerRotation?: THREE.Quaternion;
    private m_lastRotationValue: number;

    /**
     * Creates a new `CameraRotationAnimation` object.
     *
     * @param mapView - [[MapView]] which will be affected by the animation.
     * @param m_mapControls - [[MapControls]] this animation will be taking control of.
     * @param options - Animation's options.
     * @param name - Animation's name.
     */
    constructor(
        mapView: MapView,
        private readonly m_mapControls: MapControls | undefined,
        options: CameraRotationAnimationOptions,
        name?: string
    ) {
        super(mapView, name);

        if (options.axis !== undefined) {
            this.m_axis = options.axis;
        }
        if (options.startAngle !== undefined) {
            this.startAngle = options.startAngle;
        }
        if (options.endAngle !== undefined) {
            this.endAngle = options.endAngle;
        }
        if (options.duration !== undefined) {
            this.duration = options.duration;
        }
        if (options.repeat !== undefined) {
            this.repeat = options.repeat;
        }

        if (options.easing !== undefined) {
            this.easing =
                typeof options.easing === "function"
                    ? options.easing
                    : easingMap.get(options.easing) ?? TWEEN.Easing.Linear.None;
        }

        this.m_lastRotationValue = this.startAngle;
    }

    /**
     * Start the animation.
     *
     * @param time - Duration of the animation in milliseconds.
     * @param onFinished - Callback that gets triggered once the animation ends.
     * @override
     */
    start(time?: number, onFinished?: () => void): void {
        if (this.running) {
            throw new Error("Animation already running" + this.name !== undefined ? this.name : "");
        }

        this.running = true;

        this.onFinished = onFinished;

        this.stopped = false;

        if (this.m_mapControls) {
            this.m_mapControls.addEventListener(
                EventNames.BeginInteraction,
                this.beginInteractionListener
            );

            this.m_mapControls.addEventListener(
                EventNames.EndInteraction,
                this.endInteractionListener
            );
        }
        this.startTween(time);

        this.mapView.beginAnimation();
    }

    /**
     * Stop the animation. Can be started again (with original values only, though).
     * @override
     */
    stop(): void {
        if (!this.running) {
            throw new Error("Animation not running" + this.name !== undefined ? this.name : "");
        }

        this.running = false;

        this.stopped = true;

        this.mapView.endAnimation();

        if (this.tween) {
            this.tween.stop();
        }

        if (this.m_mapControls) {
            this.m_mapControls.removeEventListener(
                EventNames.BeginInteraction,
                this.beginInteractionListener
            );
            this.m_mapControls.removeEventListener(
                EventNames.EndInteraction,
                this.endInteractionListener
            );
        }
    }

    private readonly beginInteractionListener = (): void => {
        if (!this.stopped) {
            this.stopTween();
        }
    };

    private readonly endInteractionListener = (): void => {
        if (!this.stopped) {
            this.startTween();
        }
    };

    /**
     * Internal start of tween. Required because the tween may be interrupted by the
     * [[MapControls]].
     */
    private startTween(time?: number): void {
        const rotZ = new THREE.Quaternion();

        this.m_userCamerRotation = new THREE.Quaternion();
        this.mapView.camera.getWorldQuaternion(this.m_userCamerRotation);

        // Create a tween to animate the camera rotation around the Z axis.
        //
        // make this a relative rotation, always starting from 0. Take into account the
        // lastRotationValue which may be a leftover from the previous run of "this" tween.
        this.tween = new TWEEN.Tween({ rotation: 0 })
            .to({ rotation: this.endAngle - this.m_lastRotationValue }, this.duration)
            .onComplete(() => {
                this.stop();
                if (this.onFinished) {
                    this.onFinished();
                }
            })
            .onUpdate(({ rotation }) => {
                this.m_lastRotationValue = rotation;

                rotZ.setFromEuler(new THREE.Euler(0, 0, THREE.MathUtils.degToRad(rotation)));

                if (this.m_userCamerRotation !== undefined) {
                    rotZ.multiply(this.m_userCamerRotation);
                }

                this.mapView.camera.quaternion.copy(rotZ);
            });

        this.tween.repeat(this.repeat);
        this.tween.easing(this.easing);
        this.tween.start(time);
    }

    /**
     * Internal stop of tween. Required because the tween may be interrupted by the [[MapControls]].
     */
    private stopTween(): void {
        if (this.tween) {
            this.tween.stop();
        }
    }
}

export interface CameraPanAnimationOptions {
    /** List of positions. May be added later. */
    geoCoordinates?: GeoCoordinatesLike[];

    /** Duration of a whole animation in milliseconds. Defaults to `10` seconds. */
    duration?: number;

    /** Number of times the animation should be repeated. Defaults to `0`. */
    repeat?: number;

    /** Easing function that control acceleration. Defaults to [[EasingFunction.Linear]]. */
    easing?: EasingFunction | ((k: number) => number);

    /** Specifies interpolation. Defaults to [[InterpolationFunction.Linear]] */
    interpolation?: InterpolationFunction | ((v: number[], k: number) => number);
}

/**
 * Class to pan between the specified geo coordinates. Height can be specified to move the camera in
 * and out.
 */
export class CameraPanAnimation extends CameraAnimation {
    /**
     * Specifies interpolation. Defaults to [[InterpolationFunction.CatmullRom]]
     */
    readonly interpolation = TWEEN.Interpolation.CatmullRom;

    private readonly m_geoCoordinates: GeoCoordinatesLike[];

    /**
     * Creates a new `CameraPanAnimation` object.
     *
     * @param mapView - [[MapView]] which will be affected by the animation.
     * @param options - Animation's options.
     * @param name - Animation's name.
     */
    constructor(mapView: MapView, options: CameraPanAnimationOptions, public name?: string) {
        super(mapView, name);

        if (options.duration !== undefined) {
            this.duration = options.duration;
        }
        if (options.repeat !== undefined) {
            this.repeat = options.repeat;
        }
        if (options.easing !== undefined) {
            this.easing =
                typeof options.easing === "function"
                    ? options.easing
                    : easingMap.get(options.easing) ?? TWEEN.Easing.Linear.None;
        }
        if (options.interpolation !== undefined) {
            this.interpolation =
                typeof options.interpolation === "function"
                    ? options.interpolation
                    : interpolationMap.get(options.interpolation) ?? TWEEN.Interpolation.Linear;
        }
        this.m_geoCoordinates = options.geoCoordinates !== undefined ? options.geoCoordinates : [];
    }

    /**
     * Add a geo coordinate that should be visited.
     *
     * @param geoPos - Geographical coordinate to animate to.
     */
    addPosition(geoPos: GeoCoordinatesLike): void {
        this.m_geoCoordinates.push(geoPos);
    }

    /**
     * Start the animation.
     *
     * @param time - Duration of the animation in milliseconds.
     * @param onFinished - Callback that gets triggered once the animation ends.
     * @override
     */
    start(time?: number, onFinished?: () => void): void {
        if (this.running) {
            throw new Error("Animation already running" + this.name !== undefined ? this.name : "");
        }

        this.onFinished = onFinished;

        this.running = true;

        const from = new GeoCoordinates(
            this.mapView.geoCenter.latitude,
            this.mapView.geoCenter.longitude,
            this.mapView.camera.position.z
        );

        const to = {
            latitude: new Array<number>(),
            longitude: new Array<number>(),
            altitude: new Array<number>()
        };

        for (const pos of this.m_geoCoordinates) {
            to.latitude.push(pos.latitude);
            to.longitude.push(pos.longitude);
            to.altitude.push(pos.altitude ?? this.mapView.camera.position.z);
        }

        this.tween = new TWEEN.Tween(from)
            .to(to, this.duration)
            .onComplete(() => {
                this.stop();
                if (this.onFinished) {
                    this.onFinished();
                }
            })
            .onUpdate(({ latitude, longitude, altitude }) => {
                this.mapView.geoCenter = new GeoCoordinates(latitude, longitude, altitude);
                this.mapView.camera.position.z = altitude ?? 0;
            });

        this.tween.repeat(this.repeat);
        this.tween.easing(this.easing);
        this.tween.interpolation(this.interpolation);
        this.tween.start(time);

        this.mapView.beginAnimation();
    }

    /**
     * Stop the animation. Can be started again (with original values only, though).
     * @override
     */
    stop(): void {
        if (!this.running) {
            throw new Error("Animation not running" + this.name !== undefined ? this.name : "");
        }

        this.running = false;

        this.mapView.endAnimation();

        if (this.tween) {
            this.tween.stop();
        }
    }

    /**
     * Returns `true` if the animation is being played.
     * @override
     */
    get isRunning(): boolean {
        return this.running;
    }
}

// Cannot use enum as map index in a typesave manner, otherwise I would love to make it more
// elegant...
let easingMap: Map<EasingFunction, (k: number) => number>;
let interpolationMap: Map<InterpolationFunction, (v: number[], k: number) => number>;

function checkSetupTween() {
    if (easingMap !== undefined) {
        return;
    }

    easingMap = new Map<EasingFunction, (k: number) => number>();
    interpolationMap = new Map<InterpolationFunction, (v: number[], k: number) => number>();

    easingMap.set(EasingFunction.Linear, TWEEN.Easing.Linear.None);
    easingMap.set(EasingFunction.QuadraticIn, TWEEN.Easing.Quadratic.In);
    easingMap.set(EasingFunction.QuadraticOut, TWEEN.Easing.Quadratic.Out);
    easingMap.set(EasingFunction.QuadraticInOut, TWEEN.Easing.Quadratic.InOut);

    easingMap.set(EasingFunction.CubicIn, TWEEN.Easing.Cubic.In);
    easingMap.set(EasingFunction.CubicOut, TWEEN.Easing.Cubic.Out);
    easingMap.set(EasingFunction.CubicInOut, TWEEN.Easing.Cubic.InOut);

    easingMap.set(EasingFunction.QuarticIn, TWEEN.Easing.Quartic.In);
    easingMap.set(EasingFunction.QuarticOut, TWEEN.Easing.Quartic.Out);
    easingMap.set(EasingFunction.QuarticInOut, TWEEN.Easing.Quartic.InOut);

    easingMap.set(EasingFunction.QuinticIn, TWEEN.Easing.Quintic.In);
    easingMap.set(EasingFunction.QuinticOut, TWEEN.Easing.Quintic.Out);
    easingMap.set(EasingFunction.QuinticInOut, TWEEN.Easing.Quintic.InOut);

    easingMap.set(EasingFunction.SinusoidalIn, TWEEN.Easing.Sinusoidal.In);
    easingMap.set(EasingFunction.SinusoidalOut, TWEEN.Easing.Sinusoidal.Out);
    easingMap.set(EasingFunction.SinusoidalInOut, TWEEN.Easing.Sinusoidal.InOut);

    easingMap.set(EasingFunction.ExponentialIn, TWEEN.Easing.Exponential.In);
    easingMap.set(EasingFunction.ExponentialOut, TWEEN.Easing.Exponential.Out);
    easingMap.set(EasingFunction.ExponentialInOut, TWEEN.Easing.Exponential.InOut);

    easingMap.set(EasingFunction.CircularIn, TWEEN.Easing.Circular.In);
    easingMap.set(EasingFunction.CircularOut, TWEEN.Easing.Circular.Out);
    easingMap.set(EasingFunction.CircularOut, TWEEN.Easing.Circular.InOut);

    easingMap.set(EasingFunction.ElasticIn, TWEEN.Easing.Elastic.In);
    easingMap.set(EasingFunction.ElasticOut, TWEEN.Easing.Elastic.Out);
    easingMap.set(EasingFunction.ElasticInOut, TWEEN.Easing.Elastic.InOut);

    easingMap.set(EasingFunction.BackIn, TWEEN.Easing.Back.In);
    easingMap.set(EasingFunction.BackOut, TWEEN.Easing.Back.Out);
    easingMap.set(EasingFunction.BackInOut, TWEEN.Easing.Back.InOut);

    easingMap.set(EasingFunction.BounceIn, TWEEN.Easing.Bounce.In);
    easingMap.set(EasingFunction.BounceOut, TWEEN.Easing.Bounce.Out);
    easingMap.set(EasingFunction.BounceInOut, TWEEN.Easing.Bounce.InOut);

    interpolationMap.set(InterpolationFunction.Linear, TWEEN.Interpolation.Linear);
    interpolationMap.set(InterpolationFunction.Bezier, TWEEN.Interpolation.Bezier);
    interpolationMap.set(InterpolationFunction.CatmullRom, TWEEN.Interpolation.CatmullRom);
}
