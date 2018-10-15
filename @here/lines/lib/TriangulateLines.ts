import * as THREE from "three";

const UNIT_Z = new THREE.Vector3(0, 0, 1);
const POINTS = [0, 1, 2, 1, 3, 2];

const SECTORS_IN_CIRCLE = 16;
const STEP = (Math.PI * 2.0) / SECTORS_IN_CIRCLE;

function addCircle(x: number, y: number, radius: number, vertices: number[], indices: number[]) {
    const baseVertex = vertices.length / 3;
    vertices.push(x, y, 0);
    for (let i = 0; i < SECTORS_IN_CIRCLE; ++i) {
        vertices.push(x + radius * Math.cos(STEP * i), y + radius * Math.sin(STEP * i), 0);
        indices.push(
            baseVertex,
            baseVertex + i + 1,
            baseVertex + ((i + 1) % SECTORS_IN_CIRCLE) + 1
        );
    }
}

/**
 * Returns the number of points in circle used for caps.
 *
 * @param lineWidth Width of line.
 */
// tslint:disable-next-line:no-unused-variable
export function numCirclePoints(lineWidth: number): number {
    return SECTORS_IN_CIRCLE;
}

/**
 * Create a triangle mesh from the given polyline.
 *
 * @param points Sequence of (x,y) coordinates.
 * @param width The width of the extruded line.
 * @param vertices The output vertex buffer.
 * @param indices The output index buffer.
 * @param startWithCircle `true` if the line should start will a circle.
 * @param endWithCircle `true` if the line should end with a circle.
 */
export function triangulateLine(
    points: ArrayLike<number>,
    width: number,
    vertices: number[],
    indices: number[],
    startWithCircle = true,
    endWithCircle = startWithCircle
) {
    if (points.length === 0) {
        return;
    }

    if (startWithCircle) {
        addCircle(points[0], points[1], width, vertices, indices);
    }

    const baseVertex = vertices.length / 3;

    const prevDir = new THREE.Vector3();
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const aver = new THREE.Vector3();
    const p0 = new THREE.Vector3();
    const p1 = new THREE.Vector3();

    const N = points.length / 2;

    for (let i = 0; i < N; ++i) {
        p.set(points[i * 2], points[i * 2 + 1], 0);
        if (i + 1 < N) {
            n.set(points[(i + 1) * 2], points[(i + 1) * 2 + 1], 0);
            dir.copy(n)
                .sub(p)
                .normalize()
                .cross(UNIT_Z);
            aver.copy(dir);
            if (i > 0) {
                aver.add(prevDir).multiplyScalar(1.0 - 0.5 * dir.dot(prevDir));
            }
            p0.copy(aver)
                .multiplyScalar(-width)
                .add(p);
            p1.copy(aver)
                .multiplyScalar(width)
                .add(p);
            vertices.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
            prevDir.copy(dir);
        } else {
            p0.copy(prevDir)
                .multiplyScalar(-width)
                .add(p);
            p1.copy(prevDir)
                .multiplyScalar(width)
                .add(p);
            vertices.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
        }
    }

    for (let i = 0; i < N - 1; ++i) {
        POINTS.forEach(o => indices.push(baseVertex + i * 2 + o));
    }

    if (endWithCircle) {
        addCircle(points[(N - 1) * 2], points[(N - 1) * 2 + 1], width, vertices, indices);
    }
}

/**
 * Reconstruct the original points of a line from the vertices of the triangulated line.
 *
 * @param inBuffer Buffer with vertices.
 * @param startOffset Start index, will differ from `0` if the line has caps.
 * @returns Buffer containing the original points of the triangulated line.
 */
export function reconstructLine(inBuffer: Float32Array, startOffset: number): Float32Array {
    const outBuffer = new Float32Array(inBuffer.length / 2);

    for (let i = startOffset * 3, i2 = i * 2; i < outBuffer.length; i += 3, i2 += 6) {
        outBuffer[i] = inBuffer[i2] + (inBuffer[i2 + 3] - inBuffer[i2]) * 0.5;
        outBuffer[i + 1] = inBuffer[i2 + 1] + (inBuffer[i2 + 3 + 1] - inBuffer[i2 + 1]) * 0.5;
        outBuffer[i + 2] = inBuffer[i2 + 2] + (inBuffer[i2 + 3 + 2] - inBuffer[i2 + 2]) * 0.5;
    }
    return outBuffer;
}

/**
 * Extract the line width from a triangulated line.
 *
 * @param inBuffer Array of vertex elements of a triangulated line.
 * @param startIndex Start index, will differ from `0` if the line has caps.
 */
export function reconstructLineWidth(inBuffer: Float32Array, startIndex: number): number {
    const xd = inBuffer[startIndex * 2 + 3] - inBuffer[startIndex * 2];
    const yd = inBuffer[startIndex * 2 + 3 + 1] - inBuffer[startIndex * 2 + 1];
    const zd = inBuffer[startIndex * 2 + 3 + 2] - inBuffer[startIndex * 2 + 2];

    return Math.sqrt(xd * xd + yd * yd + zd * zd) * 0.5;
}
