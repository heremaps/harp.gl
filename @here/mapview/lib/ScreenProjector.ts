import * as THREE from "three";

/**
 * @hidden
 */
export class ScreenProjector {
    private readonly m_projectionViewMatrix = new THREE.Matrix4();
    private readonly m_viewMatrix = new THREE.Matrix4();
    private readonly m_cameraPosition = new THREE.Vector3();
    private readonly m_center = new THREE.Vector3();
    private m_width: number = 0;
    private m_height: number = 0;
    // tslint:disable-next-line:no-unused-variable
    private m_nearClipPlane: number = 0;
    // tslint:disable-next-line:no-unused-variable
    private m_farClipPlane: number = 0;

    get width(): number {
        return this.m_width;
    }

    get height(): number {
        return this.m_height;
    }

    projectVector(source: THREE.Vector3 | THREE.Vector4): typeof source {
        source.x -= this.m_center.x + this.m_cameraPosition.x;
        source.y -= this.m_center.y + this.m_cameraPosition.y;
        source.z -= this.m_center.z + this.m_cameraPosition.z;
        source.applyMatrix4(this.m_projectionViewMatrix);
        return source;
    }

    project(
        source: THREE.Vector3,
        target: THREE.Vector2 = new THREE.Vector2()
    ): THREE.Vector2 | undefined {
        const p = this.projectVector(source.clone());
        if (p.z > 0 && p.z < 1) {
            target.set((p.x * this.m_width) / 2, (p.y * this.m_height) / 2);
            return target;
        }
        return undefined;
    }

    update(camera: THREE.Camera, center: THREE.Vector3, width: number, height: number) {
        this.m_width = width;
        this.m_height = height;
        if (camera instanceof THREE.PerspectiveCamera) {
            this.m_nearClipPlane = camera.near;
            this.m_farClipPlane = camera.far;
        }
        this.m_center.copy(center);
        this.m_viewMatrix.makeRotationFromQuaternion(camera.quaternion);
        this.m_viewMatrix.transpose();
        this.m_cameraPosition.copy(camera.position);
        this.m_projectionViewMatrix.multiplyMatrices(camera.projectionMatrix, this.m_viewMatrix);
    }
}
