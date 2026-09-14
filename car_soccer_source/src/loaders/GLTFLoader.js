/**
 * src/loaders/GLTFLoader.js
 * GLTF 2.0 3D Model Loader & Plugin Subsystem (Phase 7.8 Part 3 Deobfuscation)
 *
 * Fully modularized GLTF 2.0 loader supporting JSON and Binary (.glb) formats,
 * morph targets, skinning / skeletal animation, and an extensive suite of extensions:
 * - KHR_binary_glTF
 * - KHR_draco_mesh_compression
 * - KHR_lights_punctual
 * - KHR_materials_clearcoat
 * - KHR_materials_dispersion
 * - KHR_materials_ior
 * - KHR_materials_sheen
 * - KHR_materials_specular
 * - KHR_materials_transmission
 * - KHR_materials_iridescence
 * - KHR_materials_anisotropy
 * - KHR_materials_unlit
 * - KHR_materials_volume
 * - KHR_materials_emissive_strength
 * - KHR_texture_basisu
 * - KHR_texture_transform
 * - KHR_mesh_quantization
 * - EXT_materials_bump
 * - EXT_texture_webp
 * - EXT_texture_avif
 * - EXT_meshopt_compression / KHR_meshopt_compression
 * - EXT_mesh_gpu_instancing
 *
 * Upstream deobfuscated symbols:
 * - ho -> GLTFLoader
 * - $b -> GLTFParser
 * - Tb -> GLTFBinaryExtension
 * - fb -> GLTFLightsExtension
 * - gb -> GLTFMaterialsClearcoatExtension
 * - vb -> GLTFMaterialsSheenExtension
 * - wb -> GLTFMaterialsTransmissionExtension
 * - Mb -> GLTFMaterialsVolumeExtension
 * - Bb -> GLTFMaterialsIorExtension
 * - _b -> GLTFMaterialsEmissiveStrengthExtension
 * - Eb -> GLTFMaterialsSpecularExtension
 * - yb -> GLTFMaterialsIridescenceExtension
 * - xb -> GLTFMaterialsBumpExtension
 * - Cb -> GLTFMaterialsAnisotropyExtension
 * - mb -> GLTFMaterialsDispersionExtension
 * - jb -> GLTFTextureTransformExtension
 * - Sb -> GLTFTextureBasisUExtension
 * - bb -> GLTFDracoMeshCompressionExtension
 * - pb -> GLTFMaterialsUnlitExtension
 * - ub -> GLTFTextureWebPExtension
 * - ib -> GLTFTextureAVIFExtension
 * - Kf -> GLTFMeshoptCompressionExtension
 * - kb -> GLTFMeshGpuInstancing
 * - Nb -> GLTFMeshQuantizationExtension
 * - P0 -> GLTFCubicSplineInterpolant
 * - Fb -> GLTFCubicSplineQuaternionInterpolant
 * - St -> EXTENSIONS
 * - Nn -> WEBGL_CONSTANTS
 * - Ts -> WEBGL_COMPONENT_TYPES
 * - Zf -> WEBGL_FILTERS
 * - Qf -> WEBGL_WRAPPINGS
 * - hc -> WEBGL_TYPE_SIZES
 * - Dh -> ATTRIBUTES
 * - Qr -> PATH_PROPERTIES
 * - Db -> INTERPOLATION_MODES
 * - dc -> ALPHA_MODES
 * - hr -> assignExtras
 * - _i -> assignExtensions
 * - Ob -> createMorphTargets
 * - Gb -> buildMorphTargetAttributes
 * - zb -> computeBoundingBoxSphere
 * - ep -> initGeometryAttributes
 * - Jt -> getMaterialExtension
 * - Ub -> extractUrlMimeType
 * - Nh -> getTypedArrayConstructor
 */

import {
  toTrianglesDrawMode,
  cloneSkinnedMesh,
  TrianglesDrawMode,
  TriangleStripDrawMode,
  TriangleFanDrawMode
} from "../utils/BufferGeometryUtils.js";

// Standard Three.js constants matching engine definitions
export const RepeatWrapping = 1000;
export const ClampToEdgeWrapping = 1001;
export const MirroredRepeatWrapping = 1002;
export const NearestFilter = 1003;
export const NearestMipmapNearestFilter = 1004;
export const NearestMipmapLinearFilter = 1005;
export const LinearFilter = 1006;
export const LinearMipmapLinearFilter = 1007;
export const LinearMipmapNearestFilter = 1008;
export const InterpolateDiscrete = 2300;
export const InterpolateLinear = 2301;
export const FrontSide = 0;
export const BackSide = 1;
export const DoubleSide = 2;
export const SRGBColorSpace = "srgb";
export const LinearSRGBColorSpace = "srgb-linear";

// Three.js constants aliased for internal GLTF mapping tables
const ci = RepeatWrapping;
const fr = ClampToEdgeWrapping;
const BA = MirroredRepeatWrapping;
const Yt = NearestFilter;
const gm = NearestMipmapNearestFilter;
const ba = NearestMipmapLinearFilter;
const qt = LinearFilter;
const fA = LinearMipmapLinearFilter;
const pr = LinearMipmapNearestFilter;
const Ha = InterpolateDiscrete;
const Ua = InterpolateLinear;
const $n = FrontSide;
const pn = BackSide;
const Ut = DoubleSide;
const Ht = SRGBColorSpace;
const kn = LinearSRGBColorSpace;
const Cm = TriangleStripDrawMode;
const bh = TriangleFanDrawMode;

/**
 * Creates a default loading manager conforming to Three.js LoadingManager interface.
 */
export function createDefaultLoadingManager() {
  const abortCtrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
  return {
    isLoading: false,
    itemsLoaded: 0,
    itemsTotal: 0,
    itemStart() {},
    itemEnd() {},
    itemError() {},
    resolveURL(url) {
      return typeof url === "string" ? url.normalize("NFC") : url;
    },
    setURLModifier(fn) {
      this.resolveURL = (url) => {
        const norm = typeof url === "string" ? url.normalize("NFC") : url;
        return fn ? fn(norm) : norm;
      };
      return this;
    },
    get abortController() {
      return this._abortController || (this._abortController = (typeof AbortController !== "undefined" ? new AbortController() : null));
    },
    _abortController: abortCtrl
  };
}

// Minimal headless fallback classes for Node / test environments
class FallbackLoader {
  constructor(manager) {
    this.manager = manager || createDefaultLoadingManager();
    if (typeof this.manager.resolveURL !== "function") {
      this.manager.resolveURL = (url) => (typeof url === "string" ? url.normalize("NFC") : url);
    }
    this.crossOrigin = "anonymous";
    this.path = "";
    this.resourcePath = "";
    this.requestHeader = {};
    this.withCredentials = false;
  }
  setCrossOrigin(val) { this.crossOrigin = val; return this; }
  setPath(path) { this.path = path; return this; }
  setResourcePath(resourcePath) { this.resourcePath = resourcePath; return this; }
  setRequestHeader(header) { this.requestHeader = header; return this; }
  setWithCredentials(val) { this.withCredentials = val; return this; }
  setResponseType(val) { this.responseType = val; return this; }
  setMimeType(val) { this.mimeType = val; return this; }
  setOptions(val) { this.options = val; return this; }
  load(url, onLoad) { if (typeof onLoad === "function") setTimeout(() => onLoad({}), 0); }
  loadAsync(url, onProgress) {
    return new Promise((resolve, reject) => {
      this.load(url, resolve, onProgress, reject);
    });
  }
}

class FallbackFileLoader extends FallbackLoader {
  constructor(manager) {
    super(manager);
    this.responseType = "text";
    this.mimeType = undefined;
  }
  setResponseType(val) { this.responseType = val; return this; }
  setMimeType(val) { this.mimeType = val; return this; }
  load(url, onLoad, onProgress, onError) {
    const resolvedUrl = (this.manager && typeof this.manager.resolveURL === "function")
      ? this.manager.resolveURL(this.path + url)
      : (this.path + url);
    if (this.manager && typeof this.manager.itemStart === "function") {
      this.manager.itemStart(resolvedUrl);
    }
    setTimeout(() => {
      if (this.manager && typeof this.manager.itemEnd === "function") {
        this.manager.itemEnd(resolvedUrl);
      }
      if (typeof onLoad === "function") {
        if (typeof resolvedUrl === "string" && resolvedUrl.startsWith("data:")) {
          const commaIdx = resolvedUrl.indexOf(",");
          if (commaIdx !== -1) {
            const header = resolvedUrl.slice(0, commaIdx);
            const data = resolvedUrl.slice(commaIdx + 1);
            if (header.includes(";base64")) {
              const bin = typeof atob === "function" ? atob(data) : (typeof Buffer !== "undefined" ? Buffer.from(data, "base64").toString("binary") : data);
              const len = bin.length;
              const bytes = new Uint8Array(len);
              for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
              onLoad(this.responseType === "arraybuffer" ? bytes.buffer : bin);
              return;
            }
          }
        }
        if (this.responseType === "arraybuffer") onLoad(new ArrayBuffer(0));
        else onLoad("");
      }
    }, 0);
  }
}

class FallbackTextureLoader extends FallbackLoader {
  load(url, onLoad, onProgress, onError) {
    const tex = new FallbackTexture();
    if (typeof onLoad === "function") setTimeout(() => onLoad(tex), 0);
    return tex;
  }
}

class FallbackImageBitmapLoader extends FallbackLoader {
  load(url, onLoad, onProgress, onError) {
    if (typeof onLoad === "function") setTimeout(() => onLoad({}), 0);
  }
}

class FallbackPropertyBinding {
  static sanitizeNodeName(name) {
    return String(name).replace(/\s/g, "_").replace(/[:[\]]/g, "");
  }
}

class FallbackLoaderUtils {
  static extractUrlBase(url) {
    const idx = url.lastIndexOf("/");
    if (idx === -1) return "./";
    return url.slice(0, idx + 1);
  }
  static resolveURL(url, path) {
    if (typeof url !== "string") return "";
    if (/^[a-zA-Z]+:\/\//.test(url)) return url;
    if (/^\//.test(url)) return url;
    return path + url;
  }
}

class FallbackVector2 {
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  set(x, y) { this.x = x; this.y = y; return this; }
  copy(v) { this.x = v.x; this.y = v.y; return this; }
  clone() { return new FallbackVector2(this.x, this.y); }
  fromArray(arr, offset = 0) { this.x = arr[offset]; this.y = arr[offset + 1]; return this; }
  toArray(arr = [], offset = 0) { arr[offset] = this.x; arr[offset + 1] = this.y; return arr; }
}

class FallbackVector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new FallbackVector3(this.x, this.y, this.z); }
  fromArray(arr, offset = 0) { this.x = arr[offset]; this.y = arr[offset + 1]; this.z = arr[offset + 2]; return this; }
  toArray(arr = [], offset = 0) { arr[offset] = this.x; arr[offset + 1] = this.y; arr[offset + 2] = this.z; return arr; }
  subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
  cross(v) {
    const ax = this.x, ay = this.y, az = this.z;
    const bx = v.x, by = v.y, bz = v.z;
    this.x = ay * bz - az * by; this.y = az * bx - ax * bz; this.z = ax * by - ay * bx;
    return this;
  }
  normalize() {
    const len = Math.hypot(this.x, this.y, this.z) || 1;
    this.x /= len; this.y /= len; this.z /= len;
    return this;
  }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
  applyMatrix4(m) {
    const x = this.x, y = this.y, z = this.z;
    const e = m.elements;
    const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
    this.x = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
    this.y = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
    this.z = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
    return this;
  }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
}

class FallbackQuaternion {
  constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w; }
  set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; }
  copy(q) { this.x = q.x; this.y = q.y; this.z = q.z; this.w = q.w; return this; }
  clone() { return new FallbackQuaternion(this.x, this.y, this.z, this.w); }
  fromArray(arr, offset = 0) {
    this.x = arr[offset]; this.y = arr[offset + 1]; this.z = arr[offset + 2]; this.w = arr[offset + 3];
    return this;
  }
  toArray(arr = [], offset = 0) {
    arr[offset] = this.x; arr[offset + 1] = this.y; arr[offset + 2] = this.z; arr[offset + 3] = this.w;
    return arr;
  }
  normalize() {
    const len = Math.hypot(this.x, this.y, this.z, this.w) || 1;
    this.x /= len; this.y /= len; this.z /= len; this.w /= len;
    return this;
  }
}

class FallbackMatrix4 {
  constructor() {
    this.elements = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ]);
  }
  identity() {
    const te = this.elements;
    te[0] = 1; te[4] = 0; te[8] = 0; te[12] = 0;
    te[1] = 0; te[5] = 1; te[9] = 0; te[13] = 0;
    te[2] = 0; te[6] = 0; te[10] = 1; te[14] = 0;
    te[3] = 0; te[7] = 0; te[11] = 0; te[15] = 1;
    return this;
  }
  copy(m) {
    this.elements.set(m.elements);
    return this;
  }
  fromArray(arr, offset = 0) {
    for (let i = 0; i < 16; i++) this.elements[i] = arr[offset + i];
    return this;
  }
  toArray(arr = [], offset = 0) {
    for (let i = 0; i < 16; i++) arr[offset + i] = this.elements[i];
    return arr;
  }
  clone() {
    const m = new FallbackMatrix4();
    m.copy(this);
    return m;
  }
  multiplyMatrices(a, b) {
    const ae = a.elements, be = b.elements, te = this.elements;
    const a11 = ae[0], a12 = ae[4], a13 = ae[8], a14 = ae[12];
    const a21 = ae[1], a22 = ae[5], a23 = ae[9], a24 = ae[13];
    const a31 = ae[2], a32 = ae[6], a33 = ae[10], a34 = ae[14];
    const a41 = ae[3], a42 = ae[7], a43 = ae[11], a44 = ae[15];
    const b11 = be[0], b12 = be[4], b13 = be[8], b14 = be[12];
    const b21 = be[1], b22 = be[5], b23 = be[9], b24 = be[13];
    const b31 = be[2], b32 = be[6], b33 = be[10], b34 = be[14];
    const b41 = be[3], b42 = be[7], b43 = be[11], b44 = be[15];
    te[0] = a11 * b11 + a12 * b21 + a13 * b31 + a14 * b41;
    te[4] = a11 * b12 + a12 * b22 + a13 * b32 + a14 * b42;
    te[8] = a11 * b13 + a12 * b23 + a13 * b33 + a14 * b43;
    te[12] = a11 * b14 + a12 * b24 + a13 * b34 + a14 * b44;
    te[1] = a21 * b11 + a22 * b21 + a23 * b31 + a24 * b41;
    te[5] = a21 * b12 + a22 * b22 + a23 * b32 + a24 * b42;
    te[9] = a21 * b13 + a22 * b23 + a23 * b33 + a24 * b43;
    te[13] = a21 * b14 + a22 * b24 + a23 * b34 + a24 * b44;
    te[2] = a31 * b11 + a32 * b21 + a33 * b31 + a34 * b41;
    te[6] = a31 * b12 + a32 * b22 + a33 * b32 + a34 * b42;
    te[10] = a31 * b13 + a32 * b23 + a33 * b33 + a34 * b43;
    te[14] = a31 * b14 + a32 * b24 + a33 * b34 + a34 * b44;
    te[3] = a41 * b11 + a42 * b21 + a43 * b31 + a44 * b41;
    te[7] = a41 * b12 + a42 * b22 + a43 * b32 + a44 * b42;
    te[11] = a41 * b13 + a42 * b23 + a43 * b33 + a44 * b43;
    te[15] = a41 * b14 + a42 * b24 + a43 * b34 + a44 * b44;
    return this;
  }
  multiply(m) {
    return this.multiplyMatrices(this, m);
  }
  premultiply(m) {
    return this.multiplyMatrices(m, this);
  }
  compose(pos, quat, scale) {
    const te = this.elements;
    const x = quat.x, y = quat.y, z = quat.z, w = quat.w;
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    const sx = scale.x, sy = scale.y, sz = scale.z;
    te[0] = (1 - (yy + zz)) * sx;
    te[1] = (xy + wz) * sx;
    te[2] = (xz - wy) * sx;
    te[3] = 0;
    te[4] = (xy - wz) * sy;
    te[5] = (1 - (xx + zz)) * sy;
    te[6] = (yz + wx) * sy;
    te[7] = 0;
    te[8] = (xz + wy) * sz;
    te[9] = (yz - wx) * sz;
    te[10] = (1 - (xx + yy)) * sz;
    te[11] = 0;
    te[12] = pos.x;
    te[13] = pos.y;
    te[14] = pos.z;
    te[15] = 1;
    return this;
  }
  decompose(pos, quat, scale) {
    const te = this.elements;
    const sx = Math.hypot(te[0], te[1], te[2]);
    const sy = Math.hypot(te[4], te[5], te[6]);
    const sz = Math.hypot(te[8], te[9], te[10]);
    pos.x = te[12]; pos.y = te[13]; pos.z = te[14];
    scale.x = sx; scale.y = sy; scale.z = sz;
    return this;
  }
}

class FallbackColor {
  constructor(r = 1, g = 1, b = 1) { this.r = r; this.g = g; this.b = b; }
  setRGB(r, g, b, colorSpace) { this.r = r; this.g = g; this.b = b; return this; }
  copy(c) { this.r = c.r; this.g = c.g; this.b = c.b; return this; }
  fromArray(arr, offset = 0) { this.r = arr[offset]; this.g = arr[offset + 1]; this.b = arr[offset + 2]; return this; }
  toArray(arr = [], offset = 0) { arr[offset] = this.r; arr[offset + 1] = this.g; arr[offset + 2] = this.b; return arr; }
}

class FallbackSphere {
  constructor(center = new FallbackVector3(), radius = 0) {
    this.center = center;
    this.radius = radius;
  }
  set(c, r) { this.center.copy(c); this.radius = r; return this; }
  copy(s) { this.center.copy(s.center); this.radius = s.radius; return this; }
}

class FallbackBox3 {
  constructor(min = new FallbackVector3(Infinity, Infinity, Infinity), max = new FallbackVector3(-Infinity, -Infinity, -Infinity)) {
    this.min = min;
    this.max = max;
  }
  set(min, max) { this.min.copy(min); this.max.copy(max); return this; }
  makeEmpty() {
    this.min.set(Infinity, Infinity, Infinity);
    this.max.set(-Infinity, -Infinity, -Infinity);
    return this;
  }
  expandByPoint(p) {
    this.min.x = Math.min(this.min.x, p.x);
    this.min.y = Math.min(this.min.y, p.y);
    this.min.z = Math.min(this.min.z, p.z);
    this.max.x = Math.max(this.max.x, p.x);
    this.max.y = Math.max(this.max.y, p.y);
    this.max.z = Math.max(this.max.z, p.z);
    return this;
  }
  expandByVector(v) {
    this.min.subVectors(this.min, v);
    this.max.add(v);
    return this;
  }
  getCenter(target = new FallbackVector3()) {
    return target.set((this.min.x + this.max.x) * 0.5, (this.min.y + this.max.y) * 0.5, (this.min.z + this.max.z) * 0.5);
  }
}

const FallbackMathUtils = {
  radToDeg(rad) { return rad * 180 / Math.PI; },
  degToRad(deg) { return deg * Math.PI / 180; }
};

class FallbackBufferAttribute {
  constructor(array, itemSize, normalized = false) {
    this.isBufferAttribute = true;
    this.name = "";
    this.array = array instanceof Array ? new Float32Array(array) : array;
    this.itemSize = itemSize;
    this.count = this.array ? this.array.length / itemSize : 0;
    this.normalized = normalized;
  }
  getX(i) { return this.array[i * this.itemSize]; }
  setX(i, x) { this.array[i * this.itemSize] = x; return this; }
  getY(i) { return this.array[i * this.itemSize + 1]; }
  setY(i, y) { this.array[i * this.itemSize + 1] = y; return this; }
  getZ(i) { return this.array[i * this.itemSize + 2]; }
  setZ(i, z) { this.array[i * this.itemSize + 2] = z; return this; }
  getW(i) { return this.array[i * this.itemSize + 3]; }
  setW(i, w) { this.array[i * this.itemSize + 3] = w; return this; }
  copyAt(idx1, attr, idx2) {
    const s = idx2 * attr.itemSize, d = idx1 * this.itemSize;
    for (let i = 0; i < this.itemSize; i++) this.array[d + i] = attr.array[s + i];
    return this;
  }
}

class FallbackInterleavedBuffer {
  constructor(array, stride) {
    this.isInterleavedBuffer = true;
    this.array = array;
    this.stride = stride;
    this.count = array ? array.length / stride : 0;
  }
  clone() {
    return new FallbackInterleavedBuffer(this.array ? new this.array.constructor(this.array) : null, this.stride);
  }
}

class FallbackInterleavedBufferAttribute {
  constructor(interleavedBuffer, itemSize, offset, normalized = false) {
    this.isInterleavedBufferAttribute = true;
    this.data = interleavedBuffer;
    this.itemSize = itemSize;
    this.offset = offset;
    this.normalized = normalized;
  }
  get count() {
    return this.data ? this.data.count : 0;
  }
  get array() {
    return this.data ? this.data.array : null;
  }
  getComponent(index, component) {
    return this.data.array[index * this.data.stride + this.offset + component];
  }
  setComponent(index, component, value) {
    this.data.array[index * this.data.stride + this.offset + component] = value;
    return this;
  }
  getX(index) {
    return this.data.array[index * this.data.stride + this.offset];
  }
  getY(index) {
    return this.data.array[index * this.data.stride + this.offset + 1];
  }
  getZ(index) {
    return this.data.array[index * this.data.stride + this.offset + 2];
  }
  getW(index) {
    return this.data.array[index * this.data.stride + this.offset + 3];
  }
  setX(index, x) {
    this.data.array[index * this.data.stride + this.offset] = x;
    return this;
  }
  setY(index, y) {
    this.data.array[index * this.data.stride + this.offset + 1] = y;
    return this;
  }
  setZ(index, z) {
    this.data.array[index * this.data.stride + this.offset + 2] = z;
    return this;
  }
  setW(index, w) {
    this.data.array[index * this.data.stride + this.offset + 3] = w;
    return this;
  }
  setXYZ(index, x, y, z) {
    const idx = index * this.data.stride + this.offset;
    this.data.array[idx] = x;
    this.data.array[idx + 1] = y;
    this.data.array[idx + 2] = z;
    return this;
  }
  applyMatrix4(m) {
    const e = m.elements;
    for (let i = 0, n = this.count; i < n; i++) {
      const x = this.getX(i), y = this.getY(i), z = this.getZ(i);
      const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
      this.setXYZ(i,
        (e[0] * x + e[4] * y + e[8] * z + e[12]) * w,
        (e[1] * x + e[5] * y + e[9] * z + e[13]) * w,
        (e[2] * x + e[6] * y + e[10] * z + e[14]) * w
      );
    }
    return this;
  }
  clone() {
    return new FallbackInterleavedBufferAttribute(this.data, this.itemSize, this.offset, this.normalized);
  }
}

class FallbackBufferGeometry {
  constructor() {
    this.isBufferGeometry = true;
    this.name = "";
    this.attributes = {};
    this.morphAttributes = {};
    this.morphTargetsRelative = false;
    this.groups = [];
    this.index = null;
    this.userData = {};
  }
  setAttribute(name, attr) { this.attributes[name] = attr; return this; }
  getAttribute(name) { return this.attributes[name]; }
  hasAttribute(name) { return name in this.attributes; }
  setIndex(index) {
    this.index = (index instanceof FallbackBufferAttribute || (index && index.isBufferAttribute))
      ? index
      : new FallbackBufferAttribute(index, 1);
    return this;
  }
  getIndex() { return this.index; }
  addGroup(start, count, materialIndex = 0) { this.groups.push({ start, count, materialIndex }); }
  computeVertexNormals() {}
  computeBoundingBox() {}
  computeBoundingSphere() {}
}

class FallbackObject3D {
  constructor() {
    this.isObject3D = true;
    this.name = "";
    this.children = [];
    this.parent = null;
    this.matrix = new FallbackMatrix4();
    this.matrixWorld = new FallbackMatrix4();
    this.matrixAutoUpdate = true;
    this.position = new FallbackVector3();
    this.quaternion = new FallbackQuaternion();
    this.scale = new FallbackVector3(1, 1, 1);
    this.userData = {};
    this.visible = true;
  }
  add(...objs) {
    for (const obj of objs) {
      if (obj && obj !== this) {
        if (obj.parent) obj.parent.remove(obj);
        obj.parent = this;
        this.children.push(obj);
      }
    }
    return this;
  }
  remove(...objs) {
    for (const obj of objs) {
      const idx = this.children.indexOf(obj);
      if (idx !== -1) {
        obj.parent = null;
        this.children.splice(idx, 1);
      }
    }
    return this;
  }
  traverse(callback) {
    callback(this);
    for (const child of this.children) child.traverse(callback);
  }
  removeFromParent() {
    if (this.parent && typeof this.parent.remove === "function") {
      this.parent.remove(this);
    }
    return this;
  }
  updateMatrix() {
    this.matrix.compose(this.position, this.quaternion, this.scale);
  }
  updateMatrixWorld(force) {
    if (this.matrixAutoUpdate) this.updateMatrix();
    if (this.parent) {
      this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
    } else {
      this.matrixWorld.copy(this.matrix);
    }
    for (const child of this.children) {
      child.updateMatrixWorld?.(force);
    }
  }
  updateWorldMatrix(updateParents, updateChildren) {
    if (updateParents && this.parent) this.parent.updateWorldMatrix?.(true, false);
    if (this.matrixAutoUpdate) this.updateMatrix();
    if (this.parent) {
      this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
    } else {
      this.matrixWorld.copy(this.matrix);
    }
    if (updateChildren) {
      for (const child of this.children) {
        child.updateWorldMatrix?.(false, true);
      }
    }
  }
  applyMatrix4(m) {
    if (this.matrixAutoUpdate) this.updateMatrix();
    this.matrix.premultiply(m);
    this.matrix.decompose(this.position, this.quaternion, this.scale);
    return this;
  }
  clone(recursive = true) {
    const clone = new this.constructor();
    clone.name = this.name;
    clone.visible = this.visible;
    clone.position.copy(this.position);
    clone.quaternion.copy(this.quaternion);
    clone.scale.copy(this.scale);
    clone.matrix.copy(this.matrix);
    clone.matrixWorld.copy(this.matrixWorld);
    clone.userData = JSON.parse(JSON.stringify(this.userData || {}));
    if (recursive) {
      for (const child of this.children) {
        clone.add(child.clone ? child.clone(true) : child);
      }
    }
    return clone;
  }
}

class FallbackMesh extends FallbackObject3D {
  constructor(geometry, material) {
    super();
    this.isMesh = true;
    this.type = "Mesh";
    this.geometry = geometry || new FallbackBufferGeometry();
    this.material = material || new FallbackMaterial();
    this.morphTargetDictionary = undefined;
    this.morphTargetInfluences = undefined;
  }
  updateMorphTargets() {}
}

class FallbackSkinnedMesh extends FallbackMesh {
  constructor(geometry, material) {
    super(geometry, material);
    this.isSkinnedMesh = true;
    this.type = "SkinnedMesh";
    this.skeleton = null;
    this.bindMatrix = new FallbackMatrix4();
    this.bindMatrixInverse = new FallbackMatrix4();
  }
  bind(skeleton, bindMatrix) {
    this.skeleton = skeleton;
    if (bindMatrix) this.bindMatrix.copy(bindMatrix);
  }
  normalizeSkinWeights() {}
}

class FallbackInstancedMesh extends FallbackMesh {
  constructor(geometry, material, count) {
    super(geometry, material);
    this.isInstancedMesh = true;
    this.type = "InstancedMesh";
    this.count = count;
    this.instanceMatrix = new FallbackBufferAttribute(new Float32Array(count * 16), 16);
    this.instanceColor = null;
  }
  setMatrixAt(index, matrix) {}
  setColorAt(index, color) {}
}

class FallbackGroup extends FallbackObject3D {
  constructor() {
    super();
    this.isGroup = true;
    this.type = "Group";
  }
}

class FallbackPoints extends FallbackObject3D {
  constructor(geometry, material) {
    super();
    this.isPoints = true;
    this.type = "Points";
    this.geometry = geometry || new FallbackBufferGeometry();
    this.material = material || new FallbackMaterial();
  }
  updateMorphTargets() {}
}

class FallbackLine extends FallbackObject3D {
  constructor(geometry, material) {
    super();
    this.isLine = true;
    this.type = "Line";
    this.geometry = geometry || new FallbackBufferGeometry();
    this.material = material || new FallbackMaterial();
  }
}

class FallbackLineSegments extends FallbackLine {
  constructor(geometry, material) {
    super(geometry, material);
    this.isLineSegments = true;
    this.type = "LineSegments";
  }
}

class FallbackLineLoop extends FallbackLine {
  constructor(geometry, material) {
    super(geometry, material);
    this.isLineLoop = true;
    this.type = "LineLoop";
  }
}

class FallbackBone extends FallbackObject3D {
  constructor() {
    super();
    this.isBone = true;
    this.type = "Bone";
  }
}

class FallbackSkeleton {
  constructor(bones = [], boneInverses = []) {
    this.bones = bones.slice(0);
    this.boneInverses = boneInverses;
    this.boneMatrices = new Float32Array(bones.length * 16);
  }
  calculateInverses() {}
  computeBoneTexture() {}
}

class FallbackMaterial {
  constructor(params = {}) {
    this.isMaterial = true;
    this.name = "";
    this.color = new FallbackColor(1, 1, 1);
    this.userData = {};
    Object.assign(this, params);
  }
  clone() {
    return new FallbackMaterial(this);
  }
}

class FallbackLight extends FallbackObject3D {
  constructor(color = 0xffffff, intensity = 1) {
    super();
    this.color = new FallbackColor(1, 1, 1);
    this.intensity = intensity;
  }
}

class FallbackCamera extends FallbackObject3D {
  constructor() {
    super();
    this.isCamera = true;
  }
}

class FallbackTexture {
  constructor() {
    this.isTexture = true;
    this.name = "";
    this.userData = {};
    this.offset = new FallbackVector2(0, 0);
    this.repeat = new FallbackVector2(1, 1);
    this.center = new FallbackVector2(0, 0);
    this.rotation = 0;
    this.wrapS = ClampToEdgeWrapping;
    this.wrapT = ClampToEdgeWrapping;
    this.magFilter = LinearFilter;
    this.minFilter = LinearMipmapLinearFilter;
    this.colorSpace = LinearSRGBColorSpace;
    this.flipY = true;
    this.needsUpdate = false;
  }
}

class FallbackAnimationClip {
  constructor(name = "", duration = -1, tracks = []) {
    this.name = name;
    this.duration = duration;
    this.tracks = tracks;
    this.userData = {};
  }
  resetDuration() {}
}

class FallbackKeyframeTrack {
  constructor(name, times, values, interpolation) {
    this.name = name;
    this.times = times;
    this.values = values;
  }
  setInterpolation(interpolation) { return this; }
}

class FallbackInterpolant {
  constructor(parameterPositions, sampleValues, sampleSize, resultBuffer) {
    this.parameterPositions = parameterPositions;
    this._cachedIndex = 0;
    this.resultBuffer = resultBuffer !== undefined ? resultBuffer : new sampleValues.constructor(sampleSize);
    this.sampleValues = sampleValues;
    this.valueSize = sampleSize;
  }
  evaluate(t) { return this.resultBuffer; }
}

// Module-scoped dependency injection bindings
let Xi = FallbackLoader;
let Ia = FallbackLoaderUtils;
let Pd = FallbackFileLoader;
let Ao = FallbackTextureLoader;
let e6 = FallbackImageBitmapLoader;
let un = FallbackBufferAttribute;
let Rt = FallbackPropertyBinding;
let Ae = FallbackVector2;
let F = FallbackVector3;
let jn = FallbackQuaternion;
let mt = FallbackMatrix4;
let Ne = FallbackColor;
let Cr = FallbackSphere;
let xr = FallbackBox3;
let Gt = FallbackMathUtils;
let Ct = FallbackBufferGeometry;
let zt = FallbackBufferAttribute;
let Tm = FallbackInterleavedBuffer;
let Va = FallbackInterleavedBufferAttribute;
let It = FallbackObject3D;
let dt = FallbackGroup;
let Ee = FallbackMesh;
let zv = FallbackSkinnedMesh;
let Lm = FallbackInstancedMesh;
let Ai = FallbackPoints;
let rl = FallbackLine;
let Wa = FallbackLineSegments;
let Yv = FallbackLineLoop;
let Im = FallbackBone;
let xd = FallbackSkeleton;
let Qt = FallbackMaterial;
let lt = FallbackMaterial;
let Cn = FallbackMaterial;
let cn = FallbackMaterial;
let ws = FallbackMaterial;
let Gi = FallbackMaterial;
let Fd = FallbackLight;
let Yj = FallbackLight;
let eo = FallbackLight;
let fn = FallbackCamera;
let lo = FallbackCamera;
let Zt = FallbackTexture;
let qj = FallbackAnimationClip;
let Za = FallbackKeyframeTrack;
let Qa = FallbackKeyframeTrack;
let DA = FallbackKeyframeTrack;
let zs = FallbackInterpolant;
let bt = { workingColorSpace: LinearSRGBColorSpace };
let Jf = toTrianglesDrawMode;
let db = cloneSkinnedMesh;

let gltfThreeContext = {
  Object3D: null,
  Loader: null,
  LoaderUtils: null,
  FileLoader: null,
  TextureLoader: null,
  ImageBitmapLoader: null,
  DefaultLoadingManager: null,
  Group: null,
  Mesh: null,
  SkinnedMesh: null,
  InstancedMesh: null,
  Points: null,
  Line: null,
  LineSegments: null,
  LineLoop: null,
  Bone: null,
  Skeleton: null,
  BufferGeometry: null,
  BufferAttribute: null,
  InstancedBufferAttribute: null,
  InterleavedBuffer: null,
  InterleavedBufferAttribute: null,
  Material: null,
  MeshStandardMaterial: null,
  MeshPhysicalMaterial: null,
  MeshBasicMaterial: null,
  PointsMaterial: null,
  LineBasicMaterial: null,
  PointLight: null,
  DirectionalLight: null,
  SpotLight: null,
  PerspectiveCamera: null,
  OrthographicCamera: null,
  Texture: null,
  Vector2: null,
  Vector3: null,
  Matrix4: null,
  Quaternion: null,
  Color: null,
  Sphere: null,
  Box3: null,
  MathUtils: null,
  AnimationClip: null,
  Interpolant: null,
  NumberKeyframeTrack: null,
  QuaternionKeyframeTrack: null,
  VectorKeyframeTrack: null,
  ColorManagement: null,
  toTrianglesDrawMode: null,
  cloneSkinnedMesh: null
};

export function setGLTFLoaderThreeContext(ctx) {
  if (!ctx) return;
  const descriptors = Object.getOwnPropertyDescriptors(ctx);
  Object.defineProperties(gltfThreeContext, descriptors);

  if (ctx.Loader) {
    Xi = ctx.Loader;
    try {
      Object.setPrototypeOf(ho.prototype, ctx.Loader.prototype);
      Object.setPrototypeOf(ho, ctx.Loader);
    } catch(e) {}
  }
  if (ctx.LoaderUtils) Ia = ctx.LoaderUtils;
  if (ctx.FileLoader) Pd = ctx.FileLoader;
  if (ctx.TextureLoader) Ao = ctx.TextureLoader;
  if (ctx.ImageBitmapLoader) e6 = ctx.ImageBitmapLoader;
  if (ctx.PropertyBinding) Rt = ctx.PropertyBinding;
  if (ctx.InstancedBufferAttribute) un = ctx.InstancedBufferAttribute;
  if (ctx.Vector2) Ae = ctx.Vector2;
  if (ctx.Vector3) F = ctx.Vector3;
  if (ctx.Quaternion) jn = ctx.Quaternion;
  if (ctx.Matrix4) mt = ctx.Matrix4;
  if (ctx.Color) Ne = ctx.Color;
  if (ctx.Sphere) Cr = ctx.Sphere;
  if (ctx.Box3) xr = ctx.Box3;
  if (ctx.MathUtils) Gt = ctx.MathUtils;
  if (ctx.BufferGeometry) Ct = ctx.BufferGeometry;
  if (ctx.BufferAttribute) zt = ctx.BufferAttribute;
  if (ctx.InterleavedBuffer) Tm = ctx.InterleavedBuffer;
  if (ctx.InterleavedBufferAttribute) Va = ctx.InterleavedBufferAttribute;
  if (ctx.Object3D) It = ctx.Object3D;
  if (ctx.Group) dt = ctx.Group;
  if (ctx.Mesh) Ee = ctx.Mesh;
  if (ctx.SkinnedMesh) zv = ctx.SkinnedMesh;
  if (ctx.InstancedMesh) Lm = ctx.InstancedMesh;
  if (ctx.Points) Ai = ctx.Points;
  if (ctx.Line) rl = ctx.Line;
  if (ctx.LineSegments) Wa = ctx.LineSegments;
  if (ctx.LineLoop) Yv = ctx.LineLoop;
  if (ctx.Bone) Im = ctx.Bone;
  if (ctx.Skeleton) xd = ctx.Skeleton;
  if (ctx.Material) Qt = ctx.Material;
  if (ctx.MeshStandardMaterial) lt = ctx.MeshStandardMaterial;
  if (ctx.MeshPhysicalMaterial) Cn = ctx.MeshPhysicalMaterial;
  if (ctx.MeshBasicMaterial) cn = ctx.MeshBasicMaterial;
  if (ctx.PointsMaterial) ws = ctx.PointsMaterial;
  if (ctx.LineBasicMaterial) Gi = ctx.LineBasicMaterial;
  if (ctx.PointLight) Fd = ctx.PointLight;
  if (ctx.DirectionalLight) Yj = ctx.DirectionalLight;
  if (ctx.SpotLight) eo = ctx.SpotLight;
  if (ctx.PerspectiveCamera) fn = ctx.PerspectiveCamera;
  if (ctx.OrthographicCamera) lo = ctx.OrthographicCamera;
  if (ctx.Texture) Zt = ctx.Texture;
  if (ctx.AnimationClip) qj = ctx.AnimationClip;
  if (ctx.Interpolant) {
    zs = ctx.Interpolant;
    try {
      Object.setPrototypeOf(P0.prototype, ctx.Interpolant.prototype);
      Object.setPrototypeOf(P0, ctx.Interpolant);
    } catch(e) {}
  }
  if (ctx.NumberKeyframeTrack) Za = ctx.NumberKeyframeTrack;
  if (ctx.QuaternionKeyframeTrack) Qa = ctx.QuaternionKeyframeTrack;
  if (ctx.VectorKeyframeTrack) DA = ctx.VectorKeyframeTrack;
  if (ctx.ColorManagement) bt = ctx.ColorManagement;
  if (ctx.toTrianglesDrawMode) Jf = ctx.toTrianglesDrawMode;
  if (ctx.cloneSkinnedMesh) db = ctx.cloneSkinnedMesh;
}

export function resolveGLTFContext() {
  return {
    Loader: Xi,
    LoaderUtils: Ia,
    FileLoader: Pd,
    TextureLoader: Ao,
    ImageBitmapLoader: Rt,
    DefaultLoadingManager: gltfThreeContext.DefaultLoadingManager || createDefaultLoadingManager(),
    Vector2: Ae,
    Vector3: F,
    Quaternion: jn,
    Matrix4: mt,
    Color: Ne,
    Sphere: Cr,
    Box3: xr,
    MathUtils: Gt,
    BufferGeometry: Ct,
    BufferAttribute: zt,
    InstancedBufferAttribute: un,
    InterleavedBuffer: Tm,
    InterleavedBufferAttribute: Va,
    Object3D: It,
    Group: dt,
    Mesh: Ee,
    SkinnedMesh: zv,
    InstancedMesh: Lm,
    Points: Ai,
    Line: rl,
    LineSegments: Wa,
    LineLoop: Yv,
    Bone: Im,
    Skeleton: xd,
    Material: Qt,
    MeshStandardMaterial: lt,
    MeshPhysicalMaterial: Cn,
    MeshBasicMaterial: cn,
    PointsMaterial: ws,
    LineBasicMaterial: Gi,
    PointLight: Fd,
    DirectionalLight: Yj,
    SpotLight: eo,
    PerspectiveCamera: fn,
    OrthographicCamera: lo,
    Texture: Zt,
    AnimationClip: qj,
    Interpolant: zs,
    NumberKeyframeTrack: Za,
    QuaternionKeyframeTrack: Qa,
    VectorKeyframeTrack: DA,
    ColorManagement: bt,
    toTrianglesDrawMode: Jf,
    cloneSkinnedMesh: db,
    RepeatWrapping,
    ClampToEdgeWrapping,
    MirroredRepeatWrapping,
    NearestFilter,
    NearestMipmapNearestFilter,
    NearestMipmapLinearFilter,
    LinearFilter,
    LinearMipmapNearestFilter,
    LinearMipmapLinearFilter,
    InterpolateDiscrete,
    InterpolateLinear,
    DoubleSide,
    SRGBColorSpace,
    LinearSRGBColorSpace,
    TrianglesDrawMode,
    TriangleStripDrawMode,
    TriangleFanDrawMode
  };
}

// ----------------------------------------------------------------------------
// Core GLTFLoader Implementation (extracted from CarSoccerEngine lines 18255-19726)
// ----------------------------------------------------------------------------
class ho extends Xi{
  constructor(e){
    super(e),this.dracoLoader = null,this.ktx2Loader = null,this.meshoptDecoder = null,this.pluginCallbacks = [],this.register(function(t){
      return new gb(t)
    }
    ),this.register(function(t){
      return new vb(t)
    }
    ),this.register(function(t){
      return new wb(t)
    }
    ),this.register(function(t){
      return new Mb(t)
    }
    ),this.register(function(t){
      return new Bb(t)
    }
    ),this.register(function(t){
      return new _b(t)
    }
    ),this.register(function(t){
      return new Eb(t)
    }
    ),this.register(function(t){
      return new yb(t)
    }
    ),this.register(function(t){
      return new xb(t)
    }
    ),this.register(function(t){
      return new mb(t)
    }
    ),this.register(function(t){
      return new Cb(t)
    }
    ),this.register(function(t){
      return new jb(t)
    }
    ),this.register(function(t){
      return new Sb(t)
    }
    ),this.register(function(t){
      return new bb(t)
    }
    ),this.register(function(t){
      return new fb(t)
    }
    ),this.register(function(t){
      return new Kf(t,St.EXT_MESHOPT_COMPRESSION)
    }
    ),this.register(function(t){
      return new Kf(t,St.KHR_MESHOPT_COMPRESSION)
    }
    ),this.register(function(t){
      return new kb(t)
    }
    )
  }
  load(e,t,n,r){
    const s = this;
    let a;
    if(this.resourcePath !== "")a = this.resourcePath;
    else if(this.path !== ""){
      const l = Ia.extractUrlBase(e);
      a = Ia.resolveURL(l,this.path)
    }
    else a = Ia.extractUrlBase(e);
    this.manager.itemStart(e);
    const o = function(l){
      r?r(l):console.error(l),s.manager.itemError(e),s.manager.itemEnd(e)
    }
    ,A = new Pd(this.manager);
    A.setPath(this.path),A.setResponseType("arraybuffer"),A.setRequestHeader(this.requestHeader),A.setWithCredentials(this.withCredentials),A.load(e,function(l){
      try{
        s.parse(l,a,function(c){
          t(c),s.manager.itemEnd(e)
        }
        ,o)
      }
      catch(c){
        o(c)
      }

    }
    ,n,o)
  }
  setDRACOLoader(e){
    return this.dracoLoader = e,this
  }
  setKTX2Loader(e){
    return this.ktx2Loader = e,this
  }
  setMeshoptDecoder(e){
    return this.meshoptDecoder = e,this
  }
  register(e){
    return this.pluginCallbacks.indexOf(e) === - 1 && this.pluginCallbacks.push(e),this
  }
  unregister(e){
    return this.pluginCallbacks.indexOf(e) !== - 1 && this.pluginCallbacks.splice(this.pluginCallbacks.indexOf(e),1),this
  }
  parse(e,t,n,r){
    let s;
    const a = {

    }
    ,o = {

    }
    ,A = new TextDecoder;
    if(typeof e == "string")s = JSON.parse(e);
    else if(e instanceof ArrayBuffer)if(A.decode(new Uint8Array(e,0,4)) === R0){
      try{
        a[St.KHR_BINARY_GLTF] = new Tb(e)
      }
      catch(h){
        r && r(h);
        return
      }
      s = JSON.parse(a[St.KHR_BINARY_GLTF].content)
    }
    else s = JSON.parse(A.decode(e));
    else s = e;
    if(s.asset === void 0 || s.asset.version[0] < 2){
      r && r(new Error("THREE.GLTFLoader: Unsupported asset. glTF versions >=2.0 are supported."));
      return
    }
    const l = new $b(s,{
      path:t || this.resourcePath || "",crossOrigin:this.crossOrigin,requestHeader:this.requestHeader,manager:this.manager,ktx2Loader:this.ktx2Loader,meshoptDecoder:this.meshoptDecoder
    }
    );
    l.fileLoader.setRequestHeader(this.requestHeader);
    for(let c = 0;c < this.pluginCallbacks.length;c++){
      const h = this.pluginCallbacks[c](l);
      h.name || console.error("THREE.GLTFLoader: Invalid plugin found: missing name"),o[h.name] = h,a[h.name] = !0
    }
    if(s.extensionsUsed)for(let c = 0;c < s.extensionsUsed.length;++c){
      const h = s.extensionsUsed[c],d = s.extensionsRequired || [];
      switch(h){
        case St.KHR_MATERIALS_UNLIT:a[h] = new pb;
        break;
        case St.KHR_DRACO_MESH_COMPRESSION:a[h] = new Rb(s,this.dracoLoader);
        break;
        case St.KHR_TEXTURE_TRANSFORM:a[h] = new Pb;
        break;
        case St.KHR_MESH_QUANTIZATION:a[h] = new Ib;
        break;
        default:d.indexOf(h) >= 0 && o[h] === void 0 && console.warn('THREE.GLTFLoader: Unknown extension "' + h + '".')
      }

    }
    l.setExtensions(a),l.setPlugins(o),l.parse(n,r)
  }
  parseAsync(e,t){
    const n = this;
    return new Promise(function(r,s){
      n.parse(e,t,r,s)
    }
    )
  }

}
function ub(){
  let i = {

  }
  ;
  return{
    get:function(e){
      return i[e]
    }
    ,add:function(e,t){
      i[e] = t
    }
    ,remove:function(e){
      delete i[e]
    }
    ,removeAll:function(){
      i = {

      }

    }

  }

}
function Jt(i,e,t){
  const n = i.json.materials[e];
  return n.extensions && n.extensions[t]?n.extensions[t]:null
}
const St = {
  KHR_BINARY_GLTF:"KHR_binary_glTF",KHR_DRACO_MESH_COMPRESSION:"KHR_draco_mesh_compression",KHR_LIGHTS_PUNCTUAL:"KHR_lights_punctual",KHR_MATERIALS_CLEARCOAT:"KHR_materials_clearcoat",KHR_MATERIALS_DISPERSION:"KHR_materials_dispersion",KHR_MATERIALS_IOR:"KHR_materials_ior",KHR_MATERIALS_SHEEN:"KHR_materials_sheen",KHR_MATERIALS_SPECULAR:"KHR_materials_specular",KHR_MATERIALS_TRANSMISSION:"KHR_materials_transmission",KHR_MATERIALS_IRIDESCENCE:"KHR_materials_iridescence",KHR_MATERIALS_ANISOTROPY:"KHR_materials_anisotropy",KHR_MATERIALS_UNLIT:"KHR_materials_unlit",KHR_MATERIALS_VOLUME:"KHR_materials_volume",KHR_TEXTURE_BASISU:"KHR_texture_basisu",KHR_TEXTURE_TRANSFORM:"KHR_texture_transform",KHR_MESH_QUANTIZATION:"KHR_mesh_quantization",KHR_MATERIALS_EMISSIVE_STRENGTH:"KHR_materials_emissive_strength",EXT_MATERIALS_BUMP:"EXT_materials_bump",EXT_TEXTURE_WEBP:"EXT_texture_webp",EXT_TEXTURE_AVIF:"EXT_texture_avif",EXT_MESHOPT_COMPRESSION:"EXT_meshopt_compression",KHR_MESHOPT_COMPRESSION:"KHR_meshopt_compression",EXT_MESH_GPU_INSTANCING:"EXT_mesh_gpu_instancing"
}
;
class fb{
  constructor(e){
    this.parser = e,this.name = St.KHR_LIGHTS_PUNCTUAL,this.cache = {
      refs:{

      }
      ,uses:{

      }

    }

  }
  _markDefs(){
    const e = this.parser,t = this.parser.json.nodes || [];
    for(let n = 0,r = t.length;n < r;n++){
      const s = t[n];
      s.extensions && s.extensions[this.name] && s.extensions[this.name].light !== void 0 && e._addNodeRef(this.cache,s.extensions[this.name].light)
    }

  }
  _loadLight(e){
    const t = this.parser,n = "light:" + e;
    let r = t.cache.get(n);
    if(r)return r;
    const s = t.json,A = ((s.extensions && s.extensions[this.name] || {

    }
    ).lights || [])[e];
    let l;
    const c = new Ne(16777215);
    A.color !== void 0 && c.setRGB(A.color[0],A.color[1],A.color[2],kn);
    const h = A.range !== void 0?A.range:0;
    switch(A.type){
      case"directional":l = new eo(c),l.target.position.set(0,0, - 1),l.add(l.target);
      break;
      case"point":l = new Fd(c),l.distance = h;
      break;
      case"spot":l = new Yj(c),l.distance = h,A.spot = A.spot || {

      }
      ,A.spot.innerConeAngle = A.spot.innerConeAngle !== void 0?A.spot.innerConeAngle:0,A.spot.outerConeAngle = A.spot.outerConeAngle !== void 0?A.spot.outerConeAngle:Math.PI / 4,l.angle = A.spot.outerConeAngle,l.penumbra = 1 - A.spot.innerConeAngle / A.spot.outerConeAngle,l.target.position.set(0,0, - 1),l.add(l.target);
      break;
      default:throw new Error("THREE.GLTFLoader: Unexpected light type: " + A.type)
    }
    return l.position.set(0,0,0),hr(l,A),A.intensity !== void 0 && (l.intensity = A.intensity),l.name = t.createUniqueName(A.name || "light_" + e),r = Promise.resolve(l),t.cache.add(n,r),r
  }
  getDependency(e,t){
    if(e === "light")return this._loadLight(t)
  }
  createNodeAttachment(e){
    const t = this,n = this.parser,s = n.json.nodes[e],o = (s.extensions && s.extensions[this.name] || {

    }
    ).light;
    return o === void 0?null:this._loadLight(o).then(function(A){
      return n._getNodeRef(t.cache,o,A)
    }
    )
  }

}
class pb{
  constructor(){
    this.name = St.KHR_MATERIALS_UNLIT
  }
  getMaterialType(){
    return cn
  }
  extendParams(e,t,n){
    const r = [];
    e.color = new Ne(1,1,1),e.opacity = 1;
    const s = t.pbrMetallicRoughness;
    if(s){
      if(Array.isArray(s.baseColorFactor)){
        const a = s.baseColorFactor;
        e.color.setRGB(a[0],a[1],a[2],kn),e.opacity = a[3]
      }
      s.baseColorTexture !== void 0 && r.push(n.assignTexture(e,"map",s.baseColorTexture,Ht))
    }
    return Promise.all(r)
  }

}
class mb{
  constructor(e){
    this.parser = e,this.name = St.KHR_MATERIALS_EMISSIVE_STRENGTH
  }
  extendMaterialParams(e,t){
    const n = Jt(this.parser,e,this.name);
    return n === null || n.emissiveStrength !== void 0 && (t.emissiveIntensity = n.emissiveStrength),Promise.resolve()
  }

}
class gb{
  constructor(e){
    this.parser = e,this.name = St.KHR_MATERIALS_CLEARCOAT
  }
  getMaterialType(e){
    return Jt(this.parser,e,this.name) !== null?Cn:null
  }
  extendMaterialParams(e,t){
    const n = Jt(this.parser,e,this.name);
    if(n === null)return Promise.resolve();
    const r = [];
    if(n.clearcoatFactor !== void 0 && (t.clearcoat = n.clearcoatFactor),n.clearcoatTexture !== void 0 && r.push(this.parser.assignTexture(t,"clearcoatMap",n.clearcoatTexture)),n.clearcoatRoughnessFactor !== void 0 && (t.clearcoatRoughness = n.clearcoatRoughnessFactor),n.clearcoatRoughnessTexture !== void 0 && r.push(this.parser.assignTexture(t,"clearcoatRoughnessMap",n.clearcoatRoughnessTexture)),n.clearcoatNormalTexture !== void 0 && (r.push(this.parser.assignTexture(t,"clearcoatNormalMap",n.clearcoatNormalTexture)),n.clearcoatNormalTexture.scale !== void 0)){
      const s = n.clearcoatNormalTexture.scale;
      t.clearcoatNormalScale = new Ae(s,s)
    }
    return Promise.all(r)
  }

}
class vb{
  constructor(e){
    this.parser = e,this.name = St.KHR_MATERIALS_DISPERSION
  }
  getMaterialType(e){
    return Jt(this.parser,e,this.name) !== null?Cn:null
  }
  extendMaterialParams(e,t){
    const n = Jt(this.parser,e,this.name);
    return n === null || (t.dispersion = n.dispersion !== void 0?n.dispersion:0),Promise.resolve()
  }

}
class jb{
  constructor(e){
    this.parser = e,this.name = St.KHR_MATERIALS_IRIDESCENCE
  }
  getMaterialType(e){
    return Jt(this.parser,e,this.name) !== null?Cn:null
  }
  extendMaterialParams(e,t){
    const n = Jt(this.parser,e,this.name);
    if(n === null)return Promise.resolve();
    const r = [];
    return n.iridescenceFactor !== void 0 && (t.iridescence = n.iridescenceFactor),n.iridescenceTexture !== void 0 && r.push(this.parser.assignTexture(t,"iridescenceMap",n.iridescenceTexture)),n.iridescenceIor !== void 0 && (t.iridescenceIOR = n.iridescenceIor),t.iridescenceThicknessRange === void 0 && (t.iridescenceThicknessRange = [100,400]),n.iridescenceThicknessMinimum !== void 0 && (t.iridescenceThicknessRange[0] = n.iridescenceThicknessMinimum),n.iridescenceThicknessMaximum !== void 0 && (t.iridescenceThicknessRange[1] = n.iridescenceThicknessMaximum),n.iridescenceThicknessTexture !== void 0 && r.push(this.parser.assignTexture(t,"iridescenceThicknessMap",n.iridescenceThicknessTexture)),Promise.all(r)
  }

}
class _b{
  constructor(e){
    this.parser = e,this.name = St.KHR_MATERIALS_SHEEN
  }
  getMaterialType(e){
    return Jt(this.parser,e,this.name) !== null?Cn:null
  }
  extendMaterialParams(e,t){
    const n = Jt(this.parser,e,this.name);
    if(n === null)return Promise.resolve();
    const r = [];
    if(t.sheenColor = new Ne(0,0,0),t.sheenRoughness = 0,t.sheen = 1,n.sheenColorFactor !== void 0){
      const s = n.sheenColorFactor;
      t.sheenColor.setRGB(s[0],s[1],s[2],kn)
    }
    return n.sheenRoughnessFactor !== void 0 && (t.sheenRoughness = n.sheenRoughnessFactor),n.sheenColorTexture !== void 0 && r.push(this.parser.assignTexture(t,"sheenColorMap",n.sheenColorTexture,Ht)),n.sheenRoughnessTexture !== void 0 && r.push(this.parser.assignTexture(t,"sheenRoughnessMap",n.sheenRoughnessTexture)),Promise.all(r)
  }

}
class Eb{
  constructor(e){
    this.parser = e,this.name = St.KHR_MATERIALS_TRANSMISSION
  }
  getMaterialType(e){
    return Jt(this.parser,e,this.name) !== null?Cn:null
  }
  extendMaterialParams(e,t){
    const n = Jt(this.parser,e,this.name);
    if(n === null)return Promise.resolve();
    const r = [];
    return n.transmissionFactor !== void 0 && (t.transmission = n.transmissionFactor),n.transmissionTexture !== void 0 && r.push(this.parser.assignTexture(t,"transmissionMap",n.transmissionTexture)),Promise.all(r)
  }

}
class yb{
  constructor(e){
    this.parser = e,this.name = St.KHR_MATERIALS_VOLUME
  }
  getMaterialType(e){
    return Jt(this.parser,e,this.name) !== null?Cn:null
  }
  extendMaterialParams(e,t){
    const n = Jt(this.parser,e,this.name);
    if(n === null)return Promise.resolve();
    const r = [];
    t.thickness = n.thicknessFactor !== void 0?n.thicknessFactor:0,n.thicknessTexture !== void 0 && r.push(this.parser.assignTexture(t,"thicknessMap",n.thicknessTexture)),t.attenuationDistance = n.attenuationDistance || 1 / 0;
    const s = n.attenuationColor || [1,1,1];
    return t.attenuationColor = new Ne().setRGB(s[0],s[1],s[2],kn),Promise.all(r)
  }

}
class xb{
  constructor(e){
    this.parser = e,this.name = St.KHR_MATERIALS_IOR
  }
  getMaterialType(e){
    return Jt(this.parser,e,this.name) !== null?Cn:null
  }
  extendMaterialParams(e,t){
    const n = Jt(this.parser,e,this.name);
    return n === null || (t.ior = n.ior !== void 0?n.ior:1.5,t.ior === 0 && (t.ior = 1e3)),Promise.resolve()
  }

}
class Cb{
  constructor(e){
    this.parser = e,this.name = St.KHR_MATERIALS_SPECULAR
  }
  getMaterialType(e){
    return Jt(this.parser,e,this.name) !== null?Cn:null
  }
  extendMaterialParams(e,t){
    const n = Jt(this.parser,e,this.name);
    if(n === null)return Promise.resolve();
    const r = [];
    t.specularIntensity = n.specularFactor !== void 0?n.specularFactor:1,n.specularTexture !== void 0 && r.push(this.parser.assignTexture(t,"specularIntensityMap",n.specularTexture));
    const s = n.specularColorFactor || [1,1,1];
    return t.specularColor = new Ne().setRGB(s[0],s[1],s[2],kn),n.specularColorTexture !== void 0 && r.push(this.parser.assignTexture(t,"specularColorMap",n.specularColorTexture,Ht)),Promise.all(r)
  }

}
class bb{
  constructor(e){
    this.parser = e,this.name = St.EXT_MATERIALS_BUMP
  }
  getMaterialType(e){
    return Jt(this.parser,e,this.name) !== null?Cn:null
  }
  extendMaterialParams(e,t){
    const n = Jt(this.parser,e,this.name);
    if(n === null)return Promise.resolve();
    const r = [];
    return t.bumpScale = n.bumpFactor !== void 0?n.bumpFactor:1,n.bumpTexture !== void 0 && r.push(this.parser.assignTexture(t,"bumpMap",n.bumpTexture)),Promise.all(r)
  }

}
class Sb{
  constructor(e){
    this.parser = e,this.name = St.KHR_MATERIALS_ANISOTROPY
  }
  getMaterialType(e){
    return Jt(this.parser,e,this.name) !== null?Cn:null
  }
  extendMaterialParams(e,t){
    const n = Jt(this.parser,e,this.name);
    if(n === null)return Promise.resolve();
    const r = [];
    return n.anisotropyStrength !== void 0 && (t.anisotropy = n.anisotropyStrength),n.anisotropyRotation !== void 0 && (t.anisotropyRotation = n.anisotropyRotation),n.anisotropyTexture !== void 0 && r.push(this.parser.assignTexture(t,"anisotropyMap",n.anisotropyTexture)),Promise.all(r)
  }

}
class wb{
  constructor(e){
    this.parser = e,this.name = St.KHR_TEXTURE_BASISU
  }
  loadTexture(e){
    const t = this.parser,n = t.json,r = n.textures[e];
    if(!r.extensions || !r.extensions[this.name])return null;
    const s = r.extensions[this.name],a = t.options.ktx2Loader;
    if(!a){
      if(n.extensionsRequired && n.extensionsRequired.indexOf(this.name) >= 0)throw new Error("THREE.GLTFLoader: setKTX2Loader must be called before loading KTX2 textures");
      return null
    }
    return t.loadTextureImage(e,s.source,a)
  }

}
class Mb{
  constructor(e){
    this.parser = e,this.name = St.EXT_TEXTURE_WEBP
  }
  loadTexture(e){
    const t = this.name,n = this.parser,r = n.json,s = r.textures[e];
    if(!s.extensions || !s.extensions[t])return null;
    const a = s.extensions[t],o = r.images[a.source];
    let A = n.textureLoader;
    if(o.uri){
      const l = n.options.manager.getHandler(o.uri);
      l !== null && (A = l)
    }
    return n.loadTextureImage(e,a.source,A)
  }

}
class Bb{
  constructor(e){
    this.parser = e,this.name = St.EXT_TEXTURE_AVIF
  }
  loadTexture(e){
    const t = this.name,n = this.parser,r = n.json,s = r.textures[e];
    if(!s.extensions || !s.extensions[t])return null;
    const a = s.extensions[t],o = r.images[a.source];
    let A = n.textureLoader;
    if(o.uri){
      const l = n.options.manager.getHandler(o.uri);
      l !== null && (A = l)
    }
    return n.loadTextureImage(e,a.source,A)
  }

}
class Kf{
  constructor(e,t){
    this.name = t,this.parser = e
  }
  loadBufferView(e){
    const t = this.parser.json,n = t.bufferViews[e];
    if(n.extensions && n.extensions[this.name]){
      const r = n.extensions[this.name],s = this.parser.getDependency("buffer",r.buffer),a = this.parser.options.meshoptDecoder;
      if(!a || !a.supported){
        if(t.extensionsRequired && t.extensionsRequired.indexOf(this.name) >= 0)throw new Error("THREE.GLTFLoader: setMeshoptDecoder must be called before loading compressed files");
        return null
      }
      return s.then(function(o){
        const A = r.byteOffset || 0,l = r.byteLength || 0,c = r.count,h = r.byteStride,d = new Uint8Array(o,A,l);return a.decodeGltfBufferAsync?a.decodeGltfBufferAsync(c,h,d,r.mode,r.filter).then(function(u){
          return u.buffer
        }
        ):a.ready.then(function(){
          const u = new ArrayBuffer(c * h);return a.decodeGltfBuffer(new Uint8Array(u),c,h,d,r.mode,r.filter),u
        }
        )
      }
      )
    }
    else return null
  }

}
class kb{
  constructor(e){
    this.name = St.EXT_MESH_GPU_INSTANCING,this.parser = e
  }
  createNodeMesh(e){
    const t = this.parser.json,n = t.nodes[e];
    if(!n.extensions || !n.extensions[this.name] || n.mesh === void 0)return null;
    const r = t.meshes[n.mesh];
    for(const l of r.primitives)if(l.mode !== Nn.TRIANGLES && l.mode !== Nn.TRIANGLE_STRIP && l.mode !== Nn.TRIANGLE_FAN && l.mode !== void 0)return null;
    const a = n.extensions[this.name].attributes,o = [],A = {

    }
    ;
    for(const l in a)o.push(this.parser.getDependency("accessor",a[l]).then(c=>(A[l] = c,A[l])));
    return o.length < 1?null:(o.push(this.parser.createNodeMesh(e)),Promise.all(o).then(l=>{
      const c = l.pop(),h = c.isGroup?c.children:[c],d = l[0].count,u = [];for(const p of h){
        const v = new mt,g = new F,m = new jn,y = new F(1,1,1),C = new Lm(p.geometry,p.material,d);for(let E = 0;E < d;E++)A.TRANSLATION && g.fromBufferAttribute(A.TRANSLATION,E),A.ROTATION && m.fromBufferAttribute(A.ROTATION,E),A.SCALE && y.fromBufferAttribute(A.SCALE,E),C.setMatrixAt(E,v.compose(g,m,y));for(const E in A)if(E === "_COLOR_0"){
          const w = A[E];C.instanceColor = new un(w.array,w.itemSize,w.normalized)
        }
        else E !== "TRANSLATION" && E !== "ROTATION" && E !== "SCALE" && p.geometry.setAttribute(E,A[E]);It.prototype.copy.call(C,p),this.parser.assignFinalMaterial(C),u.push(C)
      }
      return c.isGroup?(c.clear(),c.add(...u),c):u[0]
    }
    ))
  }

}
const R0 = "glTF",fa = 12,Yf = {
  JSON:1313821514,BIN:5130562
}
;
class Tb{
  constructor(e){
    this.name = St.KHR_BINARY_GLTF,this.content = null,this.body = null;
    const t = new DataView(e,0,fa),n = new TextDecoder;
    if(this.header = {
      magic:n.decode(new Uint8Array(e.slice(0,4))),version:t.getUint32(4,!0),length:t.getUint32(8,!0)
    }
    ,this.header.magic !== R0)throw new Error("THREE.GLTFLoader: Unsupported glTF-Binary header.");
    if(this.header.version < 2)throw new Error("THREE.GLTFLoader: Legacy binary file detected.");
    const r = this.header.length - fa,s = new DataView(e,fa);
    let a = 0;
    for(;a < r;){
      const o = s.getUint32(a,!0);
      a+=4;
      const A = s.getUint32(a,!0);
      if(a+=4,A === Yf.JSON){
        const l = new Uint8Array(e,fa + a,o);
        this.content = n.decode(l)
      }
      else if(A === Yf.BIN){
        const l = fa + a;
        this.body = e.slice(l,l + o)
      }
      a+=o
    }
    if(this.content === null)throw new Error("THREE.GLTFLoader: JSON content not found.")
  }

}
class Rb{
  constructor(e,t){
    if(!t)throw new Error("THREE.GLTFLoader: No DRACOLoader instance provided.");
    this.name = St.KHR_DRACO_MESH_COMPRESSION,this.json = e,this.dracoLoader = t,this.dracoLoader.preload()
  }
  decodePrimitive(e,t){
    const n = this.json,r = this.dracoLoader,s = e.extensions[this.name].bufferView,a = e.extensions[this.name].attributes,o = {

    }
    ,A = {

    }
    ,l = {

    }
    ;
    for(const c in a){
      const h = Dh[c] || c.toLowerCase();
      o[h] = a[c]
    }
    for(const c in e.attributes){
      const h = Dh[c] || c.toLowerCase();
      if(a[c] !== void 0){
        const d = n.accessors[e.attributes[c]],u = Ts[d.componentType];
        l[h] = u.name,A[h] = d.normalized === !0
      }

    }
    return t.getDependency("bufferView",s).then(function(c){
      return new Promise(function(h,d){
        r.decodeDracoFile(c,function(u){
          for(const p in u.attributes){
            const v = u.attributes[p],g = A[p];g !== void 0 && (v.normalized = g)
          }
          h(u)
        }
        ,o,l,kn,d)
      }
      )
    }
    )
  }

}
class Pb{
  constructor(){
    this.name = St.KHR_TEXTURE_TRANSFORM
  }
  extendTexture(e,t){
    return(t.texCoord === void 0 || t.texCoord === e.channel) && t.offset === void 0 && t.rotation === void 0 && t.scale === void 0 || (e = e.clone(),t.texCoord !== void 0 && (e.channel = t.texCoord),t.offset !== void 0 && e.offset.fromArray(t.offset),t.rotation !== void 0 && (e.rotation = t.rotation),t.scale !== void 0 && e.repeat.fromArray(t.scale),e.needsUpdate = !0),e
  }

}
class Ib{
  constructor(){
    this.name = St.KHR_MESH_QUANTIZATION
  }

}
class P0 extends zs{
  constructor(e,t,n,r){
    super(e,t,n,r)
  }
  copySampleValue_(e){
    const t = this.resultBuffer,n = this.sampleValues,r = this.valueSize,s = e * r * 3 + r;
    for(let a = 0;a !== r;a++)t[a] = n[s + a];
    return t
  }
  interpolate_(e,t,n,r){
    const s = this.resultBuffer,a = this.sampleValues,o = this.valueSize,A = o * 2,l = o * 3,c = r - t,h = (n - t) / c,d = h * h,u = d * h,p = e * l,v = p - l,g = - 2 * u + 3 * d,m = u - d,y = 1 - g,C = m - d + h;
    for(let E = 0;E !== o;E++){
      const w = a[v + E + o],S = a[v + E + A] * c,k = a[p + E + o],x = a[p + E] * c;
      s[E] = y * w + C * S + g * k + m * x
    }
    return s
  }

}
const Lb = new jn;
class Fb extends P0{
  interpolate_(e,t,n,r){
    const s = super.interpolate_(e,t,n,r);
    return Lb.fromArray(s).normalize().toArray(s),s
  }

}
const Nn = {
  POINTS:0,LINES:1,LINE_LOOP:2,LINE_STRIP:3,TRIANGLES:4,TRIANGLE_STRIP:5,TRIANGLE_FAN:6
}
,Ts = {
  5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array
}
,Zf = {
  9728:Yt,9729:qt,9984:gm,9985:fA,9986:ba,9987:pr
}
,Qf = {
  33071:fr,33648:BA,10497:ci
}
,hc = {
  SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16
}
,Dh = {
  POSITION:"position",NORMAL:"normal",TANGENT:"tangent",TEXCOORD_0:"uv",TEXCOORD_1:"uv1",TEXCOORD_2:"uv2",TEXCOORD_3:"uv3",COLOR_0:"color",WEIGHTS_0:"skinWeight",JOINTS_0:"skinIndex"
}
,Qr = {
  scale:"scale",translation:"position",rotation:"quaternion",weights:"morphTargetInfluences"
}
,Db = {
  CUBICSPLINE:void 0,LINEAR:Ua,STEP:Ha
}
,dc = {
  OPAQUE:"OPAQUE",MASK:"MASK",BLEND:"BLEND"
}
;
function Nb(i){
  return i.DefaultMaterial === void 0 && (i.DefaultMaterial = new lt({
    color:16777215,emissive:0,metalness:1,roughness:1,transparent:!1,depthTest:!0,side:$n
  }
  )),i.DefaultMaterial
}
function _i(i,e,t){
  for(const n in t.extensions)i[n] === void 0 && (e.userData.gltfExtensions = e.userData.gltfExtensions || {

  }
  ,e.userData.gltfExtensions[n] = t.extensions[n])
}
function hr(i,e){
  e.extras !== void 0 && (typeof e.extras == "object"?Object.assign(i.userData,e.extras):console.warn("THREE.GLTFLoader: Ignoring primitive type .extras, " + e.extras))
}
function Gb(i,e,t){
  let n = !1,r = !1,s = !1;
  for(let l = 0,c = e.length;l < c;l++){
    const h = e[l];
    if(h.POSITION !== void 0 && (n = !0),h.NORMAL !== void 0 && (r = !0),h.COLOR_0 !== void 0 && (s = !0),n && r && s)break
  }
  if(!n && !r && !s)return Promise.resolve(i);
  const a = [],o = [],A = [];
  for(let l = 0,c = e.length;l < c;l++){
    const h = e[l];
    if(n){
      const d = h.POSITION !== void 0?t.getDependency("accessor",h.POSITION):i.attributes.position;
      a.push(d)
    }
    if(r){
      const d = h.NORMAL !== void 0?t.getDependency("accessor",h.NORMAL):i.attributes.normal;
      o.push(d)
    }
    if(s){
      const d = h.COLOR_0 !== void 0?t.getDependency("accessor",h.COLOR_0):i.attributes.color;
      A.push(d)
    }

  }
  return Promise.all([Promise.all(a),Promise.all(o),Promise.all(A)]).then(function(l){
    const c = l[0],h = l[1],d = l[2];return n && (i.morphAttributes.position = c),r && (i.morphAttributes.normal = h),s && (i.morphAttributes.color = d),i.morphTargetsRelative = !0,i
  }
  )
}
function Ob(i,e){
  if(i.updateMorphTargets(),e.weights !== void 0)for(let t = 0,n = e.weights.length;t < n;t++)i.morphTargetInfluences[t] = e.weights[t];
  if(e.extras && Array.isArray(e.extras.targetNames)){
    const t = e.extras.targetNames;
    if(i.morphTargetInfluences.length === t.length){
      i.morphTargetDictionary = {

      }
      ;
      for(let n = 0,r = t.length;n < r;n++)i.morphTargetDictionary[t[n]] = n
    }
    else console.warn("THREE.GLTFLoader: Invalid extras.targetNames length. Ignoring names.")
  }

}
function Hb(i){
  let e;
  const t = i.extensions && i.extensions[St.KHR_DRACO_MESH_COMPRESSION];
  if(t?e = "draco:" + t.bufferView + ":" + t.indices + ":" + uc(t.attributes):e = i.indices + ":" + uc(i.attributes) + ":" + i.mode,i.targets !== void 0)for(let n = 0,r = i.targets.length;n < r;n++)e+=":" + uc(i.targets[n]);
  return e
}
function uc(i){
  let e = "";
  const t = Object.keys(i).sort();
  for(let n = 0,r = t.length;n < r;n++)e+=t[n] + ":" + i[t[n]] + ";";
  return e
}
function Nh(i){
  switch(i){
    case Int8Array:return 1 / 127;
    case Uint8Array:return 1 / 255;
    case Int16Array:return 1 / 32767;
    case Uint16Array:return 1 / 65535;
    default:throw new Error("THREE.GLTFLoader: Unsupported normalized accessor component type.")
  }

}
function Ub(i){
  return i.search(/\.jpe?g($|\?)/i) > 0 || i.search(/^data\:image\/jpeg/) === 0?"image/jpeg":i.search(/\.webp($|\?)/i) > 0 || i.search(/^data\:image\/webp/) === 0?"image/webp":i.search(/\.ktx2($|\?)/i) > 0 || i.search(/^data\:image\/ktx2/) === 0?"image/ktx2":"image/png"
}
const qb = new mt;
class $b{
  constructor(e = {

  }
  ,t = {

  }
  ){
    this.json = e,this.extensions = {

    }
    ,this.plugins = {

    }
    ,this.options = t,this.cache = new ub,this.associations = new Map,this.primitiveCache = {

    }
    ,this.nodeCache = {

    }
    ,this.meshCache = {
      refs:{

      }
      ,uses:{

      }

    }
    ,this.cameraCache = {
      refs:{

      }
      ,uses:{

      }

    }
    ,this.lightCache = {
      refs:{

      }
      ,uses:{

      }

    }
    ,this.sourceCache = {

    }
    ,this.textureCache = {

    }
    ,this.nodeNamesUsed = {

    }
    ;
    let n = !1,r = - 1,s = !1,a = - 1;
    if(typeof navigator < "u" && typeof navigator.userAgent < "u"){
      const o = navigator.userAgent;
      n = /^((?!chrome|android).)*safari/i.test(o) === !0;
      const A = o.match(/Version\/(\d+)/);
      r = n && A?parseInt(A[1],10): - 1,s = o.indexOf("Firefox") > - 1,a = s?o.match(/Firefox\/([0-9]+)\./)[1]: - 1
    }
    typeof createImageBitmap > "u" || n && r < 17 || s && a < 98?this.textureLoader = new Ao(this.options.manager):this.textureLoader = new e6(this.options.manager),this.textureLoader.setCrossOrigin(this.options.crossOrigin),this.textureLoader.setRequestHeader(this.options.requestHeader),this.fileLoader = new Pd(this.options.manager),this.fileLoader.setResponseType("arraybuffer"),this.options.crossOrigin === "use-credentials" && this.fileLoader.setWithCredentials(!0)
  }
  setExtensions(e){
    this.extensions = e
  }
  setPlugins(e){
    this.plugins = e
  }
  parse(e,t){
    const n = this,r = this.json,s = this.extensions;
    this.cache.removeAll(),this.nodeCache = {

    }
    ,this._invokeAll(function(a){
      return a._markDefs && a._markDefs()
    }
    ),Promise.all(this._invokeAll(function(a){
      return a.beforeRoot && a.beforeRoot()
    }
    )).then(function(){
      return Promise.all([n.getDependencies("scene"),n.getDependencies("animation"),n.getDependencies("camera")])
    }
    ).then(function(a){
      const o = {
        scene:a[0][r.scene || 0],scenes:a[0],animations:a[1],cameras:a[2],asset:r.asset,parser:n,userData:{

        }

      }
      ;return _i(s,o,r),hr(o,r),Promise.all(n._invokeAll(function(A){
        return A.afterRoot && A.afterRoot(o)
      }
      )).then(function(){
        for(const A of o.scenes)A.updateMatrixWorld();e(o)
      }
      )
    }
    ).catch(t)
  }
  _markDefs(){
    const e = this.json.nodes || [],t = this.json.skins || [],n = this.json.meshes || [];
    for(let r = 0,s = t.length;r < s;r++){
      const a = t[r].joints;
      for(let o = 0,A = a.length;o < A;o++)e[a[o]].isBone = !0
    }
    for(let r = 0,s = e.length;r < s;r++){
      const a = e[r];
      a.mesh !== void 0 && (this._addNodeRef(this.meshCache,a.mesh),a.skin !== void 0 && (n[a.mesh].isSkinnedMesh = !0)),a.camera !== void 0 && this._addNodeRef(this.cameraCache,a.camera)
    }

  }
  _addNodeRef(e,t){
    t !== void 0 && (e.refs[t] === void 0 && (e.refs[t] = e.uses[t] = 0),e.refs[t]++)
  }
  _getNodeRef(e,t,n){
    if(e.refs[t] <= 1)return n;
    const r = n.clone(),s = (a,o)=>{
      const A = this.associations.get(a);
      A != null && this.associations.set(o,A);
      for(const[l,c]of a.children.entries())s(c,o.children[l])
    }
    ;
    return s(n,r),r.name+="_instance_" + e.uses[t]++,r
  }
  _invokeOne(e){
    const t = Object.values(this.plugins);
    t.push(this);
    for(let n = 0;n < t.length;n++){
      const r = e(t[n]);
      if(r)return r
    }
    return null
  }
  _invokeAll(e){
    const t = Object.values(this.plugins);
    t.unshift(this);
    const n = [];
    for(let r = 0;r < t.length;r++){
      const s = e(t[r]);
      s && n.push(s)
    }
    return n
  }
  getDependency(e,t){
    const n = e + ":" + t;
    let r = this.cache.get(n);
    if(!r){
      switch(e){
        case"scene":r = this.loadScene(t);
        break;
        case"node":r = this._invokeOne(function(s){
          return s.loadNode && s.loadNode(t)
        }
        );
        break;
        case"mesh":r = this._invokeOne(function(s){
          return s.loadMesh && s.loadMesh(t)
        }
        );
        break;
        case"accessor":r = this.loadAccessor(t);
        break;
        case"bufferView":r = this._invokeOne(function(s){
          return s.loadBufferView && s.loadBufferView(t)
        }
        );
        break;
        case"buffer":r = this.loadBuffer(t);
        break;
        case"material":r = this._invokeOne(function(s){
          return s.loadMaterial && s.loadMaterial(t)
        }
        );
        break;
        case"texture":r = this._invokeOne(function(s){
          return s.loadTexture && s.loadTexture(t)
        }
        );
        break;
        case"skin":r = this.loadSkin(t);
        break;
        case"animation":r = this._invokeOne(function(s){
          return s.loadAnimation && s.loadAnimation(t)
        }
        );
        break;
        case"camera":r = this.loadCamera(t);
        break;
        default:if(r = this._invokeOne(function(s){
          return s != this && s.getDependency && s.getDependency(e,t)
        }
        ),!r)throw new Error("Unknown type: " + e);
        break
      }
      this.cache.add(n,r)
    }
    return r
  }
  getDependencies(e){
    let t = this.cache.get(e);
    if(!t){
      const n = this,r = this.json[e + (e === "mesh"?"es":"s")] || [];
      t = Promise.all(r.map(function(s,a){
        return n.getDependency(e,a)
      }
      )),this.cache.add(e,t)
    }
    return t
  }
  loadBuffer(e){
    const t = this.json.buffers[e],n = this.fileLoader;
    if(t.type && t.type !== "arraybuffer")throw new Error("THREE.GLTFLoader: " + t.type + " buffer type is not supported.");
    if(t.uri === void 0 && e === 0)return Promise.resolve(this.extensions[St.KHR_BINARY_GLTF].body);
    const r = this.options;
    return new Promise(function(s,a){
      n.load(Ia.resolveURL(t.uri,r.path),s,void 0,function(){
        a(new Error('THREE.GLTFLoader: Failed to load buffer "' + t.uri + '".'))
      }
      )
    }
    )
  }
  loadBufferView(e){
    const t = this.json.bufferViews[e];
    return this.getDependency("buffer",t.buffer).then(function(n){
      const r = t.byteLength || 0,s = t.byteOffset || 0;return n.slice(s,s + r)
    }
    )
  }
  loadAccessor(e){
    const t = this,n = this.json,r = this.json.accessors[e];
    if(r.bufferView === void 0 && r.sparse === void 0){
      const a = hc[r.type],o = Ts[r.componentType],A = r.normalized === !0,l = new o(r.count * a);
      return Promise.resolve(new zt(l,a,A))
    }
    const s = [];
    return r.bufferView !== void 0?s.push(this.getDependency("bufferView",r.bufferView)):s.push(null),r.sparse !== void 0 && (s.push(this.getDependency("bufferView",r.sparse.indices.bufferView)),s.push(this.getDependency("bufferView",r.sparse.values.bufferView))),Promise.all(s).then(function(a){
      const o = a[0],A = hc[r.type],l = Ts[r.componentType],c = l.BYTES_PER_ELEMENT,h = c * A,d = r.byteOffset || 0,u = r.bufferView !== void 0?n.bufferViews[r.bufferView].byteStride:void 0,p = r.normalized === !0;let v,g;if(u && u !== h){
        const m = Math.floor(d / u),y = "InterleavedBuffer:" + r.bufferView + ":" + r.componentType + ":" + m + ":" + r.count;let C = t.cache.get(y);C || (v = new l(o,m * u,r.count * u / c),C = new Tm(v,u / c),t.cache.add(y,C)),g = new Va(C,A,d % u / c,p)
      }
      else {
        try {
          o === null ? v = new l(r.count * A) : v = new l(o, d, r.count * A);
        } catch (bufErr) {
          const reqBytes = r.count * A * c;
          const actualBytes = o ? o.byteLength : 0;
          const errMsg = `[GLTFLoader] Buffer length out of range in accessor ${e}: requested ${reqBytes} bytes at offset ${d}, but buffer only has ${actualBytes} bytes (${l.name}). File may be truncated or corrupted.`;
          console.error(errMsg);
          const err = new Error(errMsg);
          err.isAssetError = true;
          throw err;
        }
        g = new zt(v, A, p);
      }if(r.sparse !== void 0){
        const m = hc.SCALAR,y = Ts[r.sparse.indices.componentType],C = r.sparse.indices.byteOffset || 0,E = r.sparse.values.byteOffset || 0,w = new y(a[1],C,r.sparse.count * m),S = new l(a[2],E,r.sparse.count * A);o !== null && (g = new zt(g.array.slice(),g.itemSize,g.normalized)),g.normalized = !1;for(let k = 0,x = w.length;k < x;k++){
          const T = w[k];if(g.setX(T,S[k * A]),A >= 2 && g.setY(T,S[k * A + 1]),A >= 3 && g.setZ(T,S[k * A + 2]),A >= 4 && g.setW(T,S[k * A + 3]),A >= 5)throw new Error("THREE.GLTFLoader: Unsupported itemSize in sparse BufferAttribute.")
        }
        g.normalized = p
      }
      return g
    }
    )
  }
  loadTexture(e){
    const t = this.json,n = this.options,s = t.textures[e].source,a = t.images[s];
    let o = this.textureLoader;
    if(a.uri){
      const A = n.manager.getHandler(a.uri);
      A !== null && (o = A)
    }
    return this.loadTextureImage(e,s,o)
  }
  loadTextureImage(e,t,n){
    const r = this,s = this.json,a = s.textures[e],o = s.images[t],A = (o.uri || o.bufferView) + ":" + a.sampler;
    if(this.textureCache[A])return this.textureCache[A];
    const l = this.loadImageSource(t,n).then(function(c){
      c.flipY = !1,c.name = a.name || o.name || "",c.name === "" && typeof o.uri == "string" && o.uri.startsWith("data:image/") === !1 && (c.name = o.uri);const d = (s.samplers || {

      }
      )[a.sampler] || {

      }
      ;return c.magFilter = Zf[d.magFilter] || qt,c.minFilter = Zf[d.minFilter] || pr,c.wrapS = Qf[d.wrapS] || ci,c.wrapT = Qf[d.wrapT] || ci,c.generateMipmaps = !c.isCompressedTexture && c.minFilter !== Yt && c.minFilter !== qt,r.associations.set(c,{
        textures:e
      }
      ),c
    }
    ).catch(function(){
      return null
    }
    );
    return this.textureCache[A] = l,l
  }
  loadImageSource(e,t){
    const n = this,r = this.json,s = this.options;
    if(this.sourceCache[e] !== void 0)return this.sourceCache[e].then(h=>h.clone());
    const a = r.images[e],o = self.URL || self.webkitURL;
    let A = a.uri || "",l = !1;
    if(a.bufferView !== void 0)A = n.getDependency("bufferView",a.bufferView).then(function(h){
      l = !0;const d = new Blob([h],{
        type:a.mimeType
      }
      );return A = o.createObjectURL(d),A
    }
    );
    else if(a.uri === void 0)throw new Error("THREE.GLTFLoader: Image " + e + " is missing URI and bufferView");
    const c = Promise.resolve(A).then(function(h){
      return new Promise(function(d,u){
        let p = d;t.isImageBitmapLoader === !0 && (p = function(v){
          const g = new Zt(v);g.needsUpdate = !0,d(g)
        }
        ),t.load(Ia.resolveURL(h,s.path),p,void 0,u)
      }
      )
    }
    ).then(function(h){
      return l === !0 && o.revokeObjectURL(A),hr(h,a),h.userData.mimeType = a.mimeType || Ub(a.uri),h
    }
    ).catch(function(h){
      throw console.error("THREE.GLTFLoader: Couldn't load texture",A),h
    }
    );
    return this.sourceCache[e] = c,c
  }
  assignTexture(e,t,n,r){
    const s = this;
    return this.getDependency("texture",n.index).then(function(a){
      if(!a)return null;if(n.texCoord !== void 0 && n.texCoord > 0 && (a = a.clone(),a.channel = n.texCoord),s.extensions[St.KHR_TEXTURE_TRANSFORM]){
        const o = n.extensions !== void 0?n.extensions[St.KHR_TEXTURE_TRANSFORM]:void 0;if(o){
          const A = s.associations.get(a);a = s.extensions[St.KHR_TEXTURE_TRANSFORM].extendTexture(a,o),s.associations.set(a,A)
        }

      }
      return r !== void 0 && (a.colorSpace = r),e[t] = a,a
    }
    )
  }
  assignFinalMaterial(e){
    const t = e.geometry;
    let n = e.material;
    const r = t.attributes.tangent === void 0,s = t.attributes.color !== void 0,a = t.attributes.normal === void 0;
    if(e.isPoints){
      const o = "PointsMaterial:" + n.uuid;
      let A = this.cache.get(o);
      A || (A = new ws,Qt.prototype.copy.call(A,n),A.color.copy(n.color),A.map = n.map,A.sizeAttenuation = !1,this.cache.add(o,A)),n = A
    }
    else if(e.isLine){
      const o = "LineBasicMaterial:" + n.uuid;
      let A = this.cache.get(o);
      A || (A = new Gi,Qt.prototype.copy.call(A,n),A.color.copy(n.color),A.map = n.map,this.cache.add(o,A)),n = A
    }
    if(r || s || a){
      let o = "ClonedMaterial:" + n.uuid + ":";
      r && (o+="derivative-tangents:"),s && (o+="vertex-colors:"),a && (o+="flat-shading:");
      let A = this.cache.get(o);
      A || (A = n.clone(),s && (A.vertexColors = !0),a && (A.flatShading = !0),r && (A.normalScale && (A.normalScale.y*= - 1),A.clearcoatNormalScale && (A.clearcoatNormalScale.y*= - 1)),this.cache.add(o,A),this.associations.set(A,this.associations.get(n))),n = A
    }
    e.material = n
  }
  getMaterialType(){
    return lt
  }
  loadMaterial(e){
    const t = this,n = this.json,r = this.extensions,s = n.materials[e];
    let a;
    const o = {

    }
    ,A = s.extensions || {

    }
    ,l = [];
    if(A[St.KHR_MATERIALS_UNLIT]){
      const h = r[St.KHR_MATERIALS_UNLIT];
      a = h.getMaterialType(),l.push(h.extendParams(o,s,t))
    }
    else{
      const h = s.pbrMetallicRoughness || {

      }
      ;
      if(o.color = new Ne(1,1,1),o.opacity = 1,Array.isArray(h.baseColorFactor)){
        const d = h.baseColorFactor;
        o.color.setRGB(d[0],d[1],d[2],kn),o.opacity = d[3]
      }
      h.baseColorTexture !== void 0 && l.push(t.assignTexture(o,"map",h.baseColorTexture,Ht)),o.metalness = h.metallicFactor !== void 0?h.metallicFactor:1,o.roughness = h.roughnessFactor !== void 0?h.roughnessFactor:1,h.metallicRoughnessTexture !== void 0 && (l.push(t.assignTexture(o,"metalnessMap",h.metallicRoughnessTexture)),l.push(t.assignTexture(o,"roughnessMap",h.metallicRoughnessTexture))),a = this._invokeOne(function(d){
        return d.getMaterialType && d.getMaterialType(e)
      }
      ),l.push(Promise.all(this._invokeAll(function(d){
        return d.extendMaterialParams && d.extendMaterialParams(e,o)
      }
      )))
    }
    s.doubleSided === !0 && (o.side = Ut);
    const c = s.alphaMode || dc.OPAQUE;
    if(c === dc.BLEND?(o.transparent = !0,o.depthWrite = !1):(o.transparent = !1,c === dc.MASK && (o.alphaTest = s.alphaCutoff !== void 0?s.alphaCutoff:.5)),s.normalTexture !== void 0 && a !== cn && (l.push(t.assignTexture(o,"normalMap",s.normalTexture)),o.normalScale = new Ae(1,1),s.normalTexture.scale !== void 0)){
      const h = s.normalTexture.scale;
      o.normalScale.set(h,h)
    }
    if(s.occlusionTexture !== void 0 && a !== cn && (l.push(t.assignTexture(o,"aoMap",s.occlusionTexture)),s.occlusionTexture.strength !== void 0 && (o.aoMapIntensity = s.occlusionTexture.strength)),s.emissiveFactor !== void 0 && a !== cn){
      const h = s.emissiveFactor;
      o.emissive = new Ne().setRGB(h[0],h[1],h[2],kn)
    }
    return s.emissiveTexture !== void 0 && a !== cn && l.push(t.assignTexture(o,"emissiveMap",s.emissiveTexture,Ht)),Promise.all(l).then(function(){
      const h = new a(o);return s.name && (h.name = s.name),hr(h,s),t.associations.set(h,{
        materials:e
      }
      ),s.extensions && _i(r,h,s),h
    }
    )
  }
  createUniqueName(e){
    const t = Rt.sanitizeNodeName(e || "");
    return t in this.nodeNamesUsed?t + "_" + ++this.nodeNamesUsed[t]:(this.nodeNamesUsed[t] = 0,t)
  }
  loadGeometries(e){
    const t = this,n = this.extensions,r = this.primitiveCache;
    function s(o){
      return n[St.KHR_DRACO_MESH_COMPRESSION].decodePrimitive(o,t).then(function(A){
        return ep(A,o,t)
      }
      )
    }
    const a = [];
    for(let o = 0,A = e.length;o < A;o++){
      const l = e[o],c = Hb(l),h = r[c];
      if(h)a.push(h.promise);
      else{
        let d;
        l.extensions && l.extensions[St.KHR_DRACO_MESH_COMPRESSION]?d = s(l):d = ep(new Ct,l,t),r[c] = {
          primitive:l,promise:d
        }
        ,a.push(d)
      }

    }
    return Promise.all(a)
  }
  loadMesh(e){
    const t = this,n = this.json,r = this.extensions,s = n.meshes[e],a = s.primitives,o = [];
    for(let A = 0,l = a.length;A < l;A++){
      const c = a[A].material === void 0?Nb(this.cache):this.getDependency("material",a[A].material);
      o.push(c)
    }
    return o.push(t.loadGeometries(a)),Promise.all(o).then(function(A){
      const l = A.slice(0,A.length - 1),c = A[A.length - 1],h = [];for(let u = 0,p = c.length;u < p;u++){
        const v = c[u],g = a[u];let m;const y = l[u];if(g.mode === Nn.TRIANGLES || g.mode === Nn.TRIANGLE_STRIP || g.mode === Nn.TRIANGLE_FAN || g.mode === void 0)m = s.isSkinnedMesh === !0?new zv(v,y):new Ee(v,y),m.isSkinnedMesh === !0 && m.normalizeSkinWeights(),g.mode === Nn.TRIANGLE_STRIP?m.geometry = Jf(m.geometry,Cm):g.mode === Nn.TRIANGLE_FAN && (m.geometry = Jf(m.geometry,bh));else if(g.mode === Nn.LINES)m = new Wa(v,y);else if(g.mode === Nn.LINE_STRIP)m = new rl(v,y);else if(g.mode === Nn.LINE_LOOP)m = new Yv(v,y);else if(g.mode === Nn.POINTS)m = new Ai(v,y);else throw new Error("THREE.GLTFLoader: Primitive mode unsupported: " + g.mode);Object.keys(m.geometry.morphAttributes).length > 0 && Ob(m,s),m.name = t.createUniqueName(s.name || "mesh_" + e),hr(m,s),g.extensions && _i(r,m,g),t.assignFinalMaterial(m),h.push(m)
      }
      for(let u = 0,p = h.length;u < p;u++)t.associations.set(h[u],{
        meshes:e,primitives:u
      }
      );if(h.length === 1)return s.extensions && _i(r,h[0],s),h[0];const d = new dt;s.extensions && _i(r,d,s),t.associations.set(d,{
        meshes:e
      }
      );for(let u = 0,p = h.length;u < p;u++)d.add(h[u]);return d
    }
    )
  }
  loadCamera(e){
    let t;
    const n = this.json.cameras[e],r = n[n.type];
    if(!r){
      console.warn("THREE.GLTFLoader: Missing camera parameters.");
      return
    }
    return n.type === "perspective"?t = new fn(Gt.radToDeg(r.yfov),r.aspectRatio || 1,r.znear || 1,r.zfar || 2e6):n.type === "orthographic" && (t = new lo(- r.xmag,r.xmag,r.ymag, - r.ymag,r.znear,r.zfar)),n.name && (t.name = this.createUniqueName(n.name)),hr(t,n),Promise.resolve(t)
  }
  loadSkin(e){
    const t = this.json.skins[e],n = [];
    for(let r = 0,s = t.joints.length;r < s;r++)n.push(this._loadNodeShallow(t.joints[r]));
    return t.inverseBindMatrices !== void 0?n.push(this.getDependency("accessor",t.inverseBindMatrices)):n.push(null),Promise.all(n).then(function(r){
      const s = r.pop(),a = r,o = [],A = [];for(let l = 0,c = a.length;l < c;l++){
        const h = a[l];if(h){
          o.push(h);const d = new mt;s !== null && d.fromArray(s.array,l * 16),A.push(d)
        }
        else console.warn('THREE.GLTFLoader: Joint "%s" could not be found.',t.joints[l])
      }
      return new xd(o,A)
    }
    )
  }
  loadAnimation(e){
    const t = this.json,n = this,r = t.animations[e],s = r.name?r.name:"animation_" + e,a = [],o = [],A = [],l = [],c = [];
    for(let h = 0,d = r.channels.length;h < d;h++){
      const u = r.channels[h],p = r.samplers[u.sampler],v = u.target,g = v.node,m = r.parameters !== void 0?r.parameters[p.input]:p.input,y = r.parameters !== void 0?r.parameters[p.output]:p.output;
      v.node !== void 0 && (a.push(this.getDependency("node",g)),o.push(this.getDependency("accessor",m)),A.push(this.getDependency("accessor",y)),l.push(p),c.push(v))
    }
    return Promise.all([Promise.all(a),Promise.all(o),Promise.all(A),Promise.all(l),Promise.all(c)]).then(function(h){
      const d = h[0],u = h[1],p = h[2],v = h[3],g = h[4],m = [];for(let C = 0,E = d.length;C < E;C++){
        const w = d[C],S = u[C],k = p[C],x = v[C],T = g[C];if(w === void 0)continue;w.updateMatrix && w.updateMatrix();const R = n._createAnimationTracks(w,S,k,x,T);if(R)for(let D = 0;D < R.length;D++)m.push(R[D])
      }
      const y = new qj(s,void 0,m);return hr(y,r),y
    }
    )
  }
  createNodeMesh(e){
    const t = this.json,n = this,r = t.nodes[e];
    return r.mesh === void 0?null:n.getDependency("mesh",r.mesh).then(function(s){
      const a = n._getNodeRef(n.meshCache,r.mesh,s);return r.weights !== void 0 && a.traverse(function(o){
        if(o.isMesh)for(let A = 0,l = r.weights.length;A < l;A++)o.morphTargetInfluences[A] = r.weights[A]
      }
      ),a
    }
    )
  }
  loadNode(e){
    const t = this.json,n = this,r = t.nodes[e],s = n._loadNodeShallow(e),a = [],o = r.children || [];
    for(let l = 0,c = o.length;l < c;l++)a.push(n.getDependency("node",o[l]));
    const A = r.skin === void 0?Promise.resolve(null):n.getDependency("skin",r.skin);
    return Promise.all([s,Promise.all(a),A]).then(function(l){
      const c = l[0],h = l[1],d = l[2];d !== null && c.traverse(function(u){
        u.isSkinnedMesh && u.bind(d,qb)
      }
      );for(let u = 0,p = h.length;u < p;u++)c.add(h[u]);if(c.userData.pivot !== void 0 && h.length > 0){
        const u = c.userData.pivot,p = h[0];c.pivot = new F().fromArray(u),c.position.x-=u[0],c.position.y-=u[1],c.position.z-=u[2],p.position.set(0,0,0),delete c.userData.pivot
      }
      return c
    }
    )
  }
  _loadNodeShallow(e){
    const t = this.json,n = this.extensions,r = this;
    if(this.nodeCache[e] !== void 0)return this.nodeCache[e];
    const s = t.nodes[e],a = s.name?r.createUniqueName(s.name):"",o = [],A = r._invokeOne(function(l){
      return l.createNodeMesh && l.createNodeMesh(e)
    }
    );
    return A && o.push(A),s.camera !== void 0 && o.push(r.getDependency("camera",s.camera).then(function(l){
      return r._getNodeRef(r.cameraCache,s.camera,l)
    }
    )),r._invokeAll(function(l){
      return l.createNodeAttachment && l.createNodeAttachment(e)
    }
    ).forEach(function(l){
      o.push(l)
    }
    ),this.nodeCache[e] = Promise.all(o).then(function(l){
      let c;if(s.isBone === !0?c = new Im:l.length > 1?c = new dt:l.length === 1?c = l[0]:c = new It,c !== l[0])for(let h = 0,d = l.length;h < d;h++)c.add(l[h]);if(s.name && (c.userData.name = s.name,c.name = a),hr(c,s),s.extensions && _i(n,c,s),s.matrix !== void 0){
        const h = new mt;h.fromArray(s.matrix),c.applyMatrix4(h)
      }
      else s.translation !== void 0 && c.position.fromArray(s.translation),s.rotation !== void 0 && c.quaternion.fromArray(s.rotation),s.scale !== void 0 && c.scale.fromArray(s.scale);if(!r.associations.has(c))r.associations.set(c,{

      }
      );else if(s.mesh !== void 0 && r.meshCache.refs[s.mesh] > 1){
        const h = r.associations.get(c);r.associations.set(c,{
          ...h
        }
        )
      }
      return r.associations.get(c).nodes = e,c
    }
    ),this.nodeCache[e]
  }
  loadScene(e){
    const t = this.extensions,n = this.json.scenes[e],r = this,s = new dt;
    n.name && (s.name = r.createUniqueName(n.name)),hr(s,n),n.extensions && _i(t,s,n);
    const a = n.nodes || [],o = [];
    for(let A = 0,l = a.length;A < l;A++)o.push(r.getDependency("node",a[A]));
    return Promise.all(o).then(function(A){
      for(let c = 0,h = A.length;c < h;c++){
        const d = A[c];d.parent !== null?s.add(db(d)):s.add(d)
      }
      const l = c=>{
        const h = new Map;for(const[d,u]of r.associations)(d instanceof Qt || d instanceof Zt) && h.set(d,u);return c.traverse(d=>{
          const u = r.associations.get(d);u != null && h.set(d,u)
        }
        ),h
      }
      ;return r.associations = l(s),s
    }
    )
  }
  _createAnimationTracks(e,t,n,r,s){
    const a = [],o = e.name?e.name:e.uuid,A = [];
    function l(u){
      u.morphTargetInfluences && A.push(u.name?u.name:u.uuid)
    }
    Qr[s.path] === Qr.weights?(l(e),e.isGroup && e.children.forEach(l)):A.push(o);
    let c;
    switch(Qr[s.path]){
      case Qr.weights:c = Za;
      break;
      case Qr.rotation:c = Qa;
      break;
      case Qr.translation:case Qr.scale:c = DA;
      break;
      default:switch(n.itemSize){
        case 1:c = Za;
        break;
        case 2:case 3:default:c = DA;
        break
      }
      break
    }
    const h = r.interpolation !== void 0?Db[r.interpolation]:Ua,d = this._getArrayFromAccessor(n);
    for(let u = 0,p = A.length;u < p;u++){
      const v = new c(A[u] + "." + Qr[s.path],t.array,d,h);
      r.interpolation === "CUBICSPLINE" && this._createCubicSplineTrackInterpolant(v),a.push(v)
    }
    return a
  }
  _getArrayFromAccessor(e){
    let t = e.array;
    if(e.normalized){
      const n = Nh(t.constructor),r = new Float32Array(t.length);
      for(let s = 0,a = t.length;s < a;s++)r[s] = t[s] * n;
      t = r
    }
    return t
  }
  _createCubicSplineTrackInterpolant(e){
    e.createInterpolant = function(n){
      const r = this instanceof Qa?Fb:P0;
      return new r(this.times,this.values,this.getValueSize() / 3,n)
    }
    ,e.createInterpolant.isInterpolantFactoryMethodGLTFCubicSpline = !0
  }

}
function zb(i,e,t){
  const n = e.attributes,r = new xr;
  if(n.POSITION !== void 0){
    const o = t.json.accessors[n.POSITION],A = o.min,l = o.max;
    if(A !== void 0 && l !== void 0){
      if(r.set(new F(A[0],A[1],A[2]),new F(l[0],l[1],l[2])),o.normalized){
        const c = Nh(Ts[o.componentType]);
        r.min.multiplyScalar(c),r.max.multiplyScalar(c)
      }

    }
    else{
      console.warn("THREE.GLTFLoader: Missing min/max properties for accessor POSITION.");
      return
    }

  }
  else return;
  const s = e.targets;
  if(s !== void 0){
    const o = new F,A = new F;
    for(let l = 0,c = s.length;l < c;l++){
      const h = s[l];
      if(h.POSITION !== void 0){
        const d = t.json.accessors[h.POSITION],u = d.min,p = d.max;
        if(u !== void 0 && p !== void 0){
          if(A.setX(Math.max(Math.abs(u[0]),Math.abs(p[0]))),A.setY(Math.max(Math.abs(u[1]),Math.abs(p[1]))),A.setZ(Math.max(Math.abs(u[2]),Math.abs(p[2]))),d.normalized){
            const v = Nh(Ts[d.componentType]);
            A.multiplyScalar(v)
          }
          o.max(A)
        }
        else console.warn("THREE.GLTFLoader: Missing min/max properties for accessor POSITION.")
      }

    }
    r.expandByVector(o)
  }
  i.boundingBox = r;
  const a = new Cr;
  r.getCenter(a.center),a.radius = r.min.distanceTo(r.max) / 2,i.boundingSphere = a
}
function ep(i,e,t){
  const n = e.attributes,r = [];
  function s(a,o){
    return t.getDependency("accessor",a).then(function(A){
      i.setAttribute(o,A)
    }
    )
  }
  for(const a in n){
    const o = Dh[a] || a.toLowerCase();
    o in i.attributes || r.push(s(n[a],o))
  }
  if(e.indices !== void 0 && !i.index){
    const a = t.getDependency("accessor",e.indices).then(function(o){
      i.setIndex(o)
    }
    );
    r.push(a)
  }
  return bt.workingColorSpace !== kn && "COLOR_0" in n && console.warn(`THREE.GLTFLoader: Converting vertex colors from "srgb-linear" to "${bt.workingColorSpace}" not supported.`),hr(i,e),zb(i,e,t),Promise.all(r).then(function(){
  return e.targets !== void 0?Gb(i,e.targets,t):i
}
)
}


// Deobfuscated Exports and Legacy Aliases
export {
  ho as GLTFLoader,
  $b as GLTFParser,
  Tb as GLTFBinaryExtension,
  fb as GLTFLightsExtension,
  pb as GLTFMaterialsUnlitExtension,
  mb as GLTFMaterialsEmissiveStrengthExtension,
  gb as GLTFMaterialsClearcoatExtension,
  vb as GLTFMaterialsDispersionExtension,
  jb as GLTFMaterialsIridescenceExtension,
  _b as GLTFMaterialsSheenExtension,
  Eb as GLTFMaterialsTransmissionExtension,
  yb as GLTFMaterialsVolumeExtension,
  xb as GLTFMaterialsIorExtension,
  Cb as GLTFMaterialsSpecularExtension,
  bb as GLTFMaterialsBumpExtension,
  Sb as GLTFMaterialsAnisotropyExtension,
  wb as GLTFTextureBasisUExtension,
  Mb as GLTFTextureWebPExtension,
  Bb as GLTFTextureAVIFExtension,
  Kf as GLTFMeshoptCompressionExtension,
  kb as GLTFMeshGpuInstancing,
  Rb as GLTFDracoMeshCompressionExtension,
  Pb as GLTFTextureTransformExtension,
  Ib as GLTFMeshQuantizationExtension,
  P0 as GLTFCubicSplineInterpolant,
  Fb as GLTFCubicSplineQuaternionInterpolant,
  St as GLTF_EXTENSIONS,
  St as EXTENSIONS,
  Nn as WEBGL_CONSTANTS,
  Ts as WEBGL_COMPONENT_TYPES,
  Zf as WEBGL_FILTERS,
  Qf as WEBGL_WRAPPINGS,
  hc as WEBGL_TYPE_SIZES,
  Dh as ATTRIBUTES,
  Qr as PATH_PROPERTIES,
  Db as INTERPOLATION_MODES,
  dc as ALPHA_MODES,
  hr as assignExtras,
  _i as assignExtensions,
  Ob as createMorphTargets,
  Gb as buildMorphTargetAttributes,
  zb as computeBoundingBoxSphere,
  ep as initGeometryAttributes,
  Jt as getMaterialExtension,
  Ub as extractUrlMimeType,
  Nh as getNormalizedComponentScale,
  Hb as createPrimitiveKey,
  uc as hashAttributes,
  ub as createCache,

  // Direct backwards-compatibility aliases
  ho,
  $b,
  Tb,
  fb,
  pb,
  mb,
  gb,
  vb,
  jb,
  _b,
  Eb,
  yb,
  xb,
  Cb,
  bb,
  Sb,
  wb,
  Mb,
  Bb,
  Kf,
  kb,
  Rb,
  Pb,
  Ib,
  P0,
  Fb,
  St,
  Nn,
  Ts,
  Zf,
  Qf,
  hc,
  Dh,
  Qr,
  Db,
  dc,
  hr,
  _i,
  Ob,
  Gb,
  zb,
  ep,
  Jt,
  Ub,
  Nh,
  Hb,
  uc,
  ub
};
