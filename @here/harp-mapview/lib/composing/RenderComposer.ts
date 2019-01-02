import { MapViewOptions } from "../MapView";
import { MSAARenderPass, MSAASampling } from "./MSAARenderPass";

import * as THREE from "three";
// import "three/examples/js/shaders/CopyShader";
// import "three/examples/js/postprocessing/EffectComposer";
// import "three/examples/js/postprocessing/RenderPass";
// import "three/examples/js/postprocessing/ShaderPass";

const DEFAULT_CLEAR_COLOR = 0xefe9e1;

interface InitializationData {
    options: MapViewOptions;
}

const DEFAULT_DYNAMIC_MSAA_SAMPLING_LEVEL = MSAASampling.Level_1;
const DEFAULT_STATIC_MSAA_SAMPLING_LEVEL = MSAASampling.Level_4;

export class RenderComposer {
    renderer: THREE.WebGLRenderer;
    private m_running: boolean = false;
    private m_mapViews: Map<any, any> = new Map();
    private m_animationFrameHandle: number | undefined;
    // public composer: THREE.EffectComposer;

    constructor() {
        // ...
    }

    registerMapView(mapView: any, renderFunc: any) {
        this.m_mapViews.set(mapView, renderFunc);
    }

    requestUpdate(mapView: any) {
        if (!this.m_running) {
            return;
        }

        this.cancelUpdate();
        this.m_animationFrameHandle = requestAnimationFrame(this.update.bind(this, mapView));
    }

    cancelUpdate() {
        if (this.m_animationFrameHandle !== undefined) {
            cancelAnimationFrame(this.m_animationFrameHandle);
        }
    }

    before(data: InitializationData) {
        const { options } = data;

        this.renderer = new THREE.WebGLRenderer({
            canvas: options.canvas,
            antialias: options.enableNativeWebglAntialias !== false,
            alpha: options.alpha,
            preserveDrawingBuffer: options.preserveDrawingBuffer === true
        });

        this.renderer.autoClear = false;
        this.renderer.info.autoReset = false;

        // const msaaPass = new MSAARenderPass();

        // this.composer = new THREE.EffectComposer(this.renderer);
        // msaaPass.enabled = true;
        // msaaPass.renderToScreen = true;
        // this.composer.addPass(msaaPass);

        this.renderer.setClearColor(DEFAULT_CLEAR_COLOR);
    }

    resize(width: number, height: number) {
        this.renderer.setSize(width, height, false);
        this.renderer.setPixelRatio(window.devicePixelRatio);
    }

    render(
        scene: THREE.Scene,
        camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
        isStaticFrame: boolean
    ) {
        const renderer = this.renderer;

        const isHighDpiDevice = renderer.getPixelRatio() > 1.1; // On desktop IE11 is ~1.01.

        // 1. First pass (and only for the map part) : base scene render.
        if (isHighDpiDevice) {
            // On smartphones, discard AAs as the pixel ratio already stands for this and also makes
            // AA passes much more expensive.
            renderer.render(scene, camera);
        } else {
            // TODO: Render with custom MSAA effect applied.
            renderer.render(scene, camera);
        }
    }

    start() {
        this.m_running = true;

        for (const mapView of this.m_mapViews.keys()) {
            mapView.drawFrame();
        }
    }

    stop() {
        this.m_running = false;
    }

    private update(mapView: any, time: number) {
        this.m_mapViews.get(mapView)(time);
        // this.m_mapViews.forEach((renderFunc: any) => renderFunc(time));
    }
}
