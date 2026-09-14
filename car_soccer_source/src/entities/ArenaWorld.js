/**
 * ArenaWorld.js
 * Comprehensive 3D Soccer Stadium and Vehicle Simulation World.
 * Encapsulates:
 * - Arena dimensions (8192 x 10240 uu) and goal mouth portals.
 * - Procedural turf generation with mowing stripes, field lines, and boost pad decals.
 * - Continuous enclosure boundary geometry, hexagonal bank materials, and glass grid shader.
 * - Stadium architectural GLTF mesh and dynamic dome sky.
 * - Offroad wheels, wishbone linkage, suspension springs, and reaction thruster jets.
 * - Per-frame 120Hz physics state interpolation, car lights, and shadow tracking.
 *
 * Backward-compatibility aliases:
 * - ArenaWorld -> ow
 * - createCarHitboxWireframe -> RS
 * - createCompetitionTurfMesh -> GS
 * - updateTurfPadDecals -> OS
 * - createSuspensionUnit -> mg
 * - createOffroadWheelMesh -> gg
 * - createSuspensionKnuckle -> vg
 * - setupCarReactionJets -> jg
 */

import {
  loadGameCarAsset,
  loadFlatCarAsset,
  loadRealisticCarAsset,
  createRealisticCarModel,
  createRealisticCarGimbals,
  assembleRealisticCar,
  createGameCarModel,
  createFlatCarModel,
  createGameCarWheel,
  createGameCarWheelHardware,
  createFlatCarWheel,
  updateRealisticCockpitGimbal,
  getCarVisualTheme,
  REALISTIC_WHEEL_COORDS,
  FLAT_CAR_WHEEL_COORDS,
  OCTANE_WHEEL_COORDS,
  REALISTIC_SUSPENSION_Z,
  FLAT_CAR_SUSPENSION_HEIGHTS,
  FLAT_CAR_HITBOX_OFFSET
} from './VehicleAssembly.js';
import { BoostPadSystem } from './BoostPadSystem.js';
import { loadStadiumContinuousBoundary, loadStadiumArchitecture } from './StadiumArena.js';
import { BallLocatorArrow, bS } from './BallLocatorArrow.js';
import { SpeedTrail, pS } from './SpeedTrail.js';
import { DemolitionEffect, nS } from './DemolitionEffect.js';
import { loadBallAsset, aS } from './BallVisual.js';
import { HITBOX_PRESETS, createWhiteboxCarModel } from '../ui/GarageDialog.js';
import { onThemeChange } from '../ui/ThemeManager.js';
import {
  SIM_OFFSETS,
  CAR_STATE_OFFSETS as ROCKETSIM_CAR_STATE_OFFSETS,
  CAR_STATE_STRIDE as ROCKETSIM_CAR_STATE_STRIDE,
  MAX_CARS
} from '../physics/RocketSimConstants.js';

// Arena Dimensions & Coordinate Constants (Unreal Units)
export const ARENA_WIDTH = 8192;           // Fi
export const ARENA_LENGTH = 10240;         // Di
export const ARENA_GOAL_DEPTH = 5120;      // US
export const TURF_TEXTURE_WIDTH = 2048;    // dr
export const TURF_TEXTURE_HEIGHT = 2560;

/**
 * Resolves an asset path against base URL or window configuration.
 */
export function resolveAssetPath(path) {
  if (!path) return "";
  if (/^(?:https?:|\/\/|blob:|data:)/.test(path)) return path;
  const base = (typeof window !== "undefined" && (window.__CAR_SOCCER_ASSET_BASE__ || window.__ASSET_BASE__)) || (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.BASE_URL) || "";
  const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const cleanPath = path.startsWith("/") ? path : "/" + path;
  return cleanBase + cleanPath;
}

export const ARENA_BOUNDARY_SPLIT_Y = 280; // ja

export const TEAM_BLUE_HEX = 2844350;      // hi
export const TEAM_ORANGE_HEX = 16750126;   // di
export const DEFAULT_TEAM_COLORS = [3111891, 13857839]; // xn

export const OCTANE_BOOST_OUTLETS = [
  [-57, 10.25, 20.4278],
  [-57, 10.25, -20.4278]
];

export const FLAT_CAR_BOOST_OUTLETS = [
  [-57.16878128051758, 9.5, 5.489756107330322],
  [-57.16878128051758, 9.5, -5.489756107330322]
];

export const OCTANE_HITBOX_PRESET = {
  length: 120.507,
  width: 86.6994,
  height: 38.6591,
  forward: 13.8757,
  up: 20.755
};

export const STADIUM_FLAT_PARTS = new Set(["Basalt", "Concrete", "Inner fascia", "Tier deck"]);

export const STADIUM_MATERIAL_COLORS = {
  Basalt: 2436921,
  Concrete: 7433570,
  "Inner fascia": 2702664,
  "Tier deck": 4937303,
  Titanium: 7831675,
  Canopy: 9602673,
  "Seat petrol": TEAM_BLUE_HEX,
  "Seat silver": TEAM_ORANGE_HEX,
  "Seat teal": TEAM_ORANGE_HEX,
  "Seat ochre": TEAM_BLUE_HEX
};

// Physics Buffer Offsets & Strides (RocketSim Memory Layout)
export const BUFFER_OFFSETS = SIM_OFFSETS;
export const CAR_STATE_OFFSETS = ROCKETSIM_CAR_STATE_OFFSETS;
export const CAR_STATE_STRIDE = ROCKETSIM_CAR_STATE_STRIDE; // 51
export const BOOST_PAD_OFFSET = SIM_OFFSETS.CARS + MAX_CARS * CAR_STATE_STRIDE; // 430
export const WHEEL_STATE_STRIDE = 3; // EC
export const BOT_CAR_INDEX = 1;      // no

const turfDecalCache = new WeakMap();

let arenaWorldThreeContext = {
  Group: null,
  Mesh: null,
  BoxGeometry: null,
  CylinderGeometry: null,
  SphereGeometry: null,
  PlaneGeometry: null,
  BufferGeometry: null,
  BufferAttribute: null,
  EdgesGeometry: null,
  LineSegments: null,
  LineBasicMaterial: null,
  TubeGeometry: null,
  CatmullRomCurve3: null,
  CurvePath: null,
  LineCurve3: null,
  LatheGeometry: null,
  TorusGeometry: null,
  RingGeometry: null,
  CanvasTexture: null,
  MeshStandardMaterial: null,
  MeshPhysicalMaterial: null,
  MeshBasicMaterial: null,
  ShaderMaterial: null,
  Vector2: null,
  Vector3: null,
  Color: null,
  Quaternion: null,
  Matrix4: null,
  Scene: null,
  DirectionalLight: null,
  HemisphereLight: null,
  DoubleSide: null,
  BackSide: null,
  FrontSide: null,
  AdditiveBlending: null,
  RepeatWrapping: null,
  LinearFilter: null,
  LinearMipmapLinearFilter: null,
  SRGBColorSpace: null,
  mergeVertices: null,
  mergeGeometries: null,
  GLTFLoader: null,
  TextureLoader: null,
  OBJLoader: null,
  VehicleBoostEmitter: null,
  multiThemeMaterial: (m1, m2) => m1,
  getThemeMaterial: (m, mode) => m,
  cloneMaterial: (m) => ({ ...m }),
  markMatrixDirty: () => {},
  setShadowFlags: () => {}
};

let arenaWorldCarLoaders = {
  loadGameCarAsset,
  loadFlatCarAsset,
  loadRealisticCarAsset,
  createRealisticCarModel,
  createRealisticCarGimbals,
  assembleRealisticCar,
  createGameCarModel,
  createFlatCarModel,
  createGameCarWheel,
  createGameCarWheelHardware,
  createFlatCarWheel,
  updateRealisticCockpitGimbal,
  getCarVisualTheme,
  wheelSpecs: {
    realistic: REALISTIC_WHEEL_COORDS,
    flat: FLAT_CAR_WHEEL_COORDS,
    game: OCTANE_WHEEL_COORDS
  },
  suspensionSpecs: {
    realisticZ: REALISTIC_SUSPENSION_Z,
    flatY: FLAT_CAR_SUSPENSION_HEIGHTS
  },
  hitboxOffsets: {
    realistic: OCTANE_BOOST_OUTLETS,
    flat: FLAT_CAR_HITBOX_OFFSET,
    flatJets: FLAT_CAR_BOOST_OUTLETS
  },
  teamColors: DEFAULT_TEAM_COLORS
};

export function setArenaWorldThreeContext(context) {
  if (!context) return;
  const descriptors = Object.getOwnPropertyDescriptors(context);
  Object.defineProperties(arenaWorldThreeContext, descriptors);
}

export function setArenaWorldCarLoaders(loaders) {
  if (!loaders) return;
  arenaWorldCarLoaders = { ...arenaWorldCarLoaders, ...loaders };
}

export function resolveContext() {
  const G = arenaWorldThreeContext;
  return {
    Group: G.Group || (typeof THREE !== 'undefined' ? THREE.Group : class {
      constructor() { this.children = []; this.name = ''; this.visible = true; this.position = new (resolveContext().Vector3)(); this.quaternion = new (resolveContext().Quaternion)(); this.scale = new (resolveContext().Vector3)(1, 1, 1); this.rotation = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }; }
      add(...items) { this.children.push(...items); }
      remove(...items) { this.children = this.children.filter(c => !items.includes(c)); }
      removeFromParent() { if (this.parent) this.parent.remove(this); }
      traverse(fn) { fn(this); this.children.forEach(c => c.traverse?.(fn)); }
    }),
    Mesh: G.Mesh || (typeof THREE !== 'undefined' ? THREE.Mesh : class {
      constructor(geo, mat) {
        this.geometry = geo;
        this.material = mat;
        this.children = [];
        this.name = '';
        this.visible = true;
        this.position = new (resolveContext().Vector3)();
        this.quaternion = new (resolveContext().Quaternion)();
        this.scale = new (resolveContext().Vector3)(1, 1, 1);
        this.rotation = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
        this.userData = {};
        this.castShadow = false;
        this.receiveShadow = false;
      }
      clone() { return new (resolveContext().Mesh)(this.geometry, this.material); }
      add(...items) { this.children.push(...items); }
      traverse(fn) { fn(this); this.children.forEach(c => c.traverse?.(fn)); }
    }),
    BoxGeometry: G.BoxGeometry || (typeof THREE !== 'undefined' ? THREE.BoxGeometry : class {
      constructor(w = 1, h = 1, d = 1) { this.w = w; this.h = h; this.d = d; }
      dispose() {}
    }),
    CylinderGeometry: G.CylinderGeometry || (typeof THREE !== 'undefined' ? THREE.CylinderGeometry : class {
      constructor(rt = 1, rb = 1, h = 1, s = 8) { this.rt = rt; this.rb = rb; this.h = h; this.s = s; }
      rotateX() { return this; }
      dispose() {}
    }),
    SphereGeometry: G.SphereGeometry || (typeof THREE !== 'undefined' ? THREE.SphereGeometry : class {
      constructor(r = 1) { this.r = r; }
      dispose() {}
    }),
    PlaneGeometry: G.PlaneGeometry || (typeof THREE !== 'undefined' ? THREE.PlaneGeometry : class {
      constructor(w = 1, h = 1) { this.w = w; this.h = h; }
      dispose() {}
    }),
    BufferGeometry: G.BufferGeometry || (typeof THREE !== 'undefined' ? THREE.BufferGeometry : class {
      constructor() { this.attributes = {}; this.userData = {}; }
      setAttribute(k, v) { this.attributes[k] = v; }
      deleteAttribute(k) { delete this.attributes[k]; }
      setIndex(idx) { this.index = idx; }
      computeBoundingSphere() {}
      computeVertexNormals() {}
      dispose() {}
    }),
    BufferAttribute: G.BufferAttribute || (typeof THREE !== 'undefined' ? THREE.BufferAttribute : class {
      constructor(arr, itemSize) { this.array = arr; this.itemSize = itemSize; }
    }),
    EdgesGeometry: G.EdgesGeometry || (typeof THREE !== 'undefined' ? THREE.EdgesGeometry : class {
      constructor(geo) { this.geo = geo; }
      dispose() {}
    }),
    LineSegments: G.LineSegments || (typeof THREE !== 'undefined' ? THREE.LineSegments : class {
      constructor(geo, mat) {
        this.geometry = geo;
        this.material = mat;
        this.children = [];
        this.name = '';
        this.visible = true;
        this.position = new (resolveContext().Vector3)();
        this.quaternion = new (resolveContext().Quaternion)();
        this.scale = new (resolveContext().Vector3)(1, 1, 1);
        this.rotation = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
        this.renderOrder = 0;
      }
      traverse(fn) { fn(this); this.children.forEach(c => c.traverse?.(fn)); }
    }),
    LineBasicMaterial: G.LineBasicMaterial || (typeof THREE !== 'undefined' ? THREE.LineBasicMaterial : class {
      constructor(params = {}) { Object.assign(this, params); }
      dispose() {}
    }),
    TubeGeometry: G.TubeGeometry || (typeof THREE !== 'undefined' ? THREE.TubeGeometry : class {
      constructor() {}
      dispose() {}
    }),
    CatmullRomCurve3: G.CatmullRomCurve3 || (typeof THREE !== 'undefined' ? THREE.CatmullRomCurve3 : class {
      constructor(pts = []) { this.points = pts; }
    }),
    CurvePath: G.CurvePath || (typeof THREE !== 'undefined' ? THREE.CurvePath : class {
      constructor() { this.curves = []; }
      add(c) { this.curves.push(c); }
    }),
    LineCurve3: G.LineCurve3 || (typeof THREE !== 'undefined' ? THREE.LineCurve3 : class {
      constructor(v1, v2) { this.v1 = v1; this.v2 = v2; }
    }),
    LatheGeometry: G.LatheGeometry || (typeof THREE !== 'undefined' ? THREE.LatheGeometry : class {
      constructor() {}
      dispose() {}
    }),
    TorusGeometry: G.TorusGeometry || (typeof THREE !== 'undefined' ? THREE.TorusGeometry : class {
      constructor() {}
      dispose() {}
    }),
    RingGeometry: G.RingGeometry || (typeof THREE !== 'undefined' ? THREE.RingGeometry : class {
      constructor(inner = 0.5, outer = 1, thetaSegments = 8) {
        this.inner = inner; this.outer = outer; this.thetaSegments = thetaSegments;
      }
      dispose() {}
    }),
    CanvasTexture: G.CanvasTexture || (typeof THREE !== 'undefined' ? THREE.CanvasTexture : class {
      constructor(canvas) { this.image = canvas; this.needsUpdate = false; }
    }),
    Material: G.Material || (typeof THREE !== 'undefined' ? THREE.Material : class {
      constructor(params = {}) { Object.assign(this, params); this.userData = {}; }
      copy(m) { Object.assign(this, m); return this; }
      clone() { return new (resolveContext().Material)().copy(this); }
      dispose() {}
    }),
    MeshLambertMaterial: G.MeshLambertMaterial || (typeof THREE !== 'undefined' ? THREE.MeshLambertMaterial : class {
      constructor(params = {}) {
        Object.assign(this, params);
        this.userData = {};
        this.isMeshLambertMaterial = true;
        this.type = "MeshLambertMaterial";
      }
      copy(m) { Object.assign(this, m); return this; }
      clone() { return new (resolveContext().MeshLambertMaterial)(this); }
      dispose() {}
    }),
    MeshStandardMaterial: G.MeshStandardMaterial || (typeof THREE !== 'undefined' ? THREE.MeshStandardMaterial : class {
      constructor(params = {}) { Object.assign(this, params); this.userData = {}; }
      clone() { return new (resolveContext().MeshStandardMaterial)(this); }
      dispose() {}
    }),
    MeshPhysicalMaterial: G.MeshPhysicalMaterial || (typeof THREE !== 'undefined' ? THREE.MeshPhysicalMaterial : class {
      constructor(params = {}) { Object.assign(this, params); this.userData = {}; }
      clone() { return new (resolveContext().MeshPhysicalMaterial)(this); }
      dispose() {}
    }),
    MeshBasicMaterial: G.MeshBasicMaterial || (typeof THREE !== 'undefined' ? THREE.MeshBasicMaterial : class {
      constructor(params = {}) { Object.assign(this, params); this.userData = {}; }
      clone() { return new (resolveContext().MeshBasicMaterial)(this); }
      dispose() {}
    }),
    ShaderMaterial: G.ShaderMaterial || (typeof THREE !== 'undefined' ? THREE.ShaderMaterial : class {
      constructor(params = {}) {
        Object.assign(this, params);
        this.userData = {};
        this.uniforms = params.uniforms || {};
      }
      clone() { return new (resolveContext().ShaderMaterial)(this); }
      dispose() {}
    }),
    Vector2: G.Vector2 || (typeof THREE !== 'undefined' ? THREE.Vector2 : class {
      constructor(x = 0, y = 0) { this.x = x; this.y = y; }
      set(x, y) { this.x = x; this.y = y; return this; }
      copy(v) { this.x = v.x; this.y = v.y; return this; }
      clone() { return new (resolveContext().Vector2)(this.x, this.y); }
    }),
    Vector3: G.Vector3 || (typeof THREE !== 'undefined' ? THREE.Vector3 : class {
      constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; this.isVector3 = true; }
      set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
      copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
      clone() { return new (resolveContext().Vector3)(this.x, this.y, this.z); }
      add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
      sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
      multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
      divideScalar(s) { this.x /= s; this.y /= s; this.z /= s; return this; }
      addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
      dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
      cross(v) {
        const ax = this.x, ay = this.y, az = this.z;
        const bx = v.x, by = v.y, bz = v.z;
        this.x = ay * bz - az * by;
        this.y = az * bx - ax * bz;
        this.z = ax * by - ay * bx;
        return this;
      }
      crossVectors(a, b) {
        const ax = a.x, ay = a.y, az = a.z;
        const bx = b.x, by = b.y, bz = b.z;
        this.x = ay * bz - az * by;
        this.y = az * bx - ax * bz;
        this.z = ax * by - ay * bx;
        return this;
      }
      length() { return Math.hypot(this.x, this.y, this.z); }
      distanceTo(v) { return Math.hypot(this.x - (v.x || 0), this.y - (v.y || 0), this.z - (v.z || 0)); }
      distanceToSquared(v) { const dx = this.x - (v.x || 0), dy = this.y - (v.y || 0), dz = this.z - (v.z || 0); return dx*dx + dy*dy + dz*dz; }
      lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
      normalize() { const l = this.length(); return l > 0 ? this.divideScalar(l) : this; }
      lerp(v, alpha) { this.x += (v.x - this.x) * alpha; this.y += (v.y - this.y) * alpha; this.z += (v.z - this.z) * alpha; return this; }
      lerpVectors(v1, v2, alpha) {
        this.x = v1.x + (v2.x - v1.x) * alpha;
        this.y = v1.y + (v2.y - v1.y) * alpha;
        this.z = v1.z + (v2.z - v1.z) * alpha;
        return this;
      }
      applyAxisAngle(axis, angle) {
        // Simplified fallback axis rotation around Y
        if (axis.y === 1) {
          const cos = Math.cos(angle), sin = Math.sin(angle);
          const x = this.x * cos + this.z * sin;
          const z = -this.x * sin + this.z * cos;
          this.x = x; this.z = z;
        }
        return this;
      }
    }),
    Color: G.Color || (typeof THREE !== 'undefined' ? THREE.Color : class {
      constructor(val = 0) { this.val = val; }
      setHex(h) { this.val = h; return this; }
      getHexString() { return (this.val & 0xffffff).toString(16).padStart(6, '0'); }
      copy(c) { this.val = c.val; return this; }
      multiplyScalar() { return this; }
    }),
    Quaternion: G.Quaternion || (typeof THREE !== 'undefined' ? THREE.Quaternion : class {
      constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w; this.isQuaternion = true; }
      set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; }
      copy(q) { this.x = q.x; this.y = q.y; this.z = q.z; this.w = q.w; return this; }
      slerpQuaternions(qa, qb, t) {
        this.x = qa.x + (qb.x - qa.x) * t;
        this.y = qa.y + (qb.y - qa.y) * t;
        this.z = qa.z + (qb.z - qa.z) * t;
        this.w = qa.w + (qb.w - qa.w) * t;
        return this;
      }
      setFromUnitVectors() { return this; }
      setFromRotationMatrix(m) {
        if (!m || !m.elements) return this;
        const te = m.elements;
        const m11 = te[0], m12 = te[4], m13 = te[8];
        const m21 = te[1], m22 = te[5], m23 = te[9];
        const m31 = te[2], m32 = te[6], m33 = te[10];
        const trace = m11 + m22 + m33;
        if (trace > 0) {
          const s = 0.5 / Math.sqrt(trace + 1.0);
          this.w = 0.25 / s;
          this.x = (m32 - m23) * s;
          this.y = (m13 - m31) * s;
          this.z = (m21 - m12) * s;
        } else if (m11 > m22 && m11 > m33) {
          const s = 2.0 * Math.sqrt(1.0 + m11 - m22 - m33);
          this.w = (m32 - m23) / s;
          this.x = 0.25 * s;
          this.y = (m12 + m21) / s;
          this.z = (m13 + m31) / s;
        } else if (m22 > m33) {
          const s = 2.0 * Math.sqrt(1.0 + m22 - m11 - m33);
          this.w = (m13 - m31) / s;
          this.x = (m12 + m21) / s;
          this.y = 0.25 * s;
          this.z = (m23 + m32) / s;
        } else {
          const s = 2.0 * Math.sqrt(1.0 + m33 - m11 - m22);
          this.w = (m21 - m12) / s;
          this.x = (m13 + m31) / s;
          this.y = (m23 + m32) / s;
          this.z = 0.25 * s;
        }
        return this;
      }
    }),
    Matrix4: G.Matrix4 || (typeof THREE !== 'undefined' ? THREE.Matrix4 : class {
      constructor() { this.elements = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); this.isMatrix4 = true; }
      makeBasis(xAxis, yAxis, zAxis) {
        const te = this.elements;
        te[0] = xAxis.x; te[1] = xAxis.y; te[2] = xAxis.z; te[3] = 0;
        te[4] = yAxis.x; te[5] = yAxis.y; te[6] = yAxis.z; te[7] = 0;
        te[8] = zAxis.x; te[9] = zAxis.y; te[10] = zAxis.z; te[11] = 0;
        te[12] = 0; te[13] = 0; te[14] = 0; te[15] = 1;
        return this;
      }
      copy(m) { this.elements.set(m.elements); return this; }
      identity() { return this.makeBasis({x:1,y:0,z:0}, {x:0,y:1,z:0}, {x:0,y:0,z:1}); }
    }),
    Scene: G.Scene || (typeof THREE !== 'undefined' ? THREE.Scene : class {
      constructor() { this.children = []; this.background = null; }
      add(...items) { this.children.push(...items); }
      remove(...items) { this.children = this.children.filter(c => !items.includes(c)); }
    }),
    DirectionalLight: G.DirectionalLight || (typeof THREE !== 'undefined' ? THREE.DirectionalLight : class {
      constructor(color = 0xffffff, intensity = 1) {
        this.color = color;
        this.intensity = intensity;
        this.position = new (resolveContext().Vector3)();
        this.target = null;
        this.shadow = { camera: { left: 0, right: 0, top: 0, bottom: 0, near: 0, far: 0 } };
        this.castShadow = false;
      }
    }),
    HemisphereLight: G.HemisphereLight || (typeof THREE !== 'undefined' ? THREE.HemisphereLight : class {
      constructor(skyColor, groundColor, intensity) {
        this.skyColor = skyColor;
        this.groundColor = groundColor;
        this.intensity = intensity;
      }
    }),
    DoubleSide: G.DoubleSide ?? 2,
    BackSide: G.BackSide ?? 1,
    Fog: G.Fog || (typeof THREE !== "undefined" ? THREE.Fog : null),
    InterleavedBuffer: G.InterleavedBuffer || (typeof THREE !== "undefined" ? THREE.InterleavedBuffer : class InterleavedBuffer {
      constructor(array, stride) {
        this.isInterleavedBuffer = true;
        this.array = array;
        this.stride = stride;
        this.count = array ? array.length / stride : 0;
      }
      clone() { return new (resolveContext().InterleavedBuffer)(this.array ? new this.array.constructor(this.array) : null, this.stride); }
    }),
    InterleavedBufferAttribute: G.InterleavedBufferAttribute || (typeof THREE !== "undefined" ? THREE.InterleavedBufferAttribute : class InterleavedBufferAttribute {
      constructor(ib, itemSize, offset, normalized = false) {
        this.isInterleavedBufferAttribute = true;
        this.data = ib;
        this.itemSize = itemSize;
        this.offset = offset;
        this.normalized = normalized;
      }
      get count() { return this.data ? this.data.count : 0; }
      get array() { return this.data ? this.data.array : null; }
      getX(i) { return this.data.array[i * this.data.stride + this.offset]; }
      getY(i) { return this.data.array[i * this.data.stride + this.offset + 1]; }
      getZ(i) { return this.data.array[i * this.data.stride + this.offset + 2]; }
      setXYZ(i, x, y, z) {
        const idx = i * this.data.stride + this.offset;
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
      clone() { return new (resolveContext().InterleavedBufferAttribute)(this.data, this.itemSize, this.offset, this.normalized); }
    }),
    FrontSide: G.FrontSide ?? 0,
    AdditiveBlending: G.AdditiveBlending ?? 2,
    RepeatWrapping: G.RepeatWrapping ?? 1000,
    LinearFilter: G.LinearFilter ?? 1006,
    LinearMipmapLinearFilter: G.LinearMipmapLinearFilter ?? 1008,
    SRGBColorSpace: G.SRGBColorSpace || 'srgb',
    mergeVertices: G.mergeVertices || ((geo) => geo),
    mergeGeometries: G.mergeGeometries || ((geos) => geos[0]),
    GLTFLoader: G.GLTFLoader || class { loadAsync() { return Promise.resolve({ scene: new (resolveContext().Group)() }); } },
    TextureLoader: G.TextureLoader || class { loadAsync() { return Promise.resolve({}); } },
    OBJLoader: G.OBJLoader || class { loadAsync() { return Promise.resolve(new (resolveContext().Group)()); } },
    VehicleBoostEmitter: G.VehicleBoostEmitter || class {
      constructor() { this.bloomActive = false; }
      setSpatial() {}
      update() {}
      preload() { return Promise.resolve(); }
    },
    multiThemeMaterial: G.multiThemeMaterial || ((m1, m2) => m1),
    getThemeMaterial: G.getThemeMaterial || ((m, mode) => m),
    cloneMaterial: G.cloneMaterial || ((m) => ({ ...m })),
    markMatrixDirty: G.markMatrixDirty || (() => {}),
    setShadowFlags: G.setShadowFlags || (() => {})
  };
}

/**
 * Coordinate mapping: Converts RocketSim / Unreal space (X forward, Y right, Z up)
 * to Three.js space (X forward, Y up, Z right).
 */
export function unrealToThreeCoords(target, x = 0, y = 0, z = 0) {
  return target.set(x || 0, z || 0, y || 0);
}

let basisFwd = null;
let basisRight = null;
let basisUp = null;
let basisMatrix = null;

/**
 * Reconstructs orientation quaternion from RocketSim state 3 basis vectors:
 * offset + 0: forward (3 floats)
 * offset + 3: right (3 floats)
 * offset + 6: up (3 floats)
 */
export function bufferBasisToQuaternion(targetQuat, buffer, offset) {
  const { Vector3, Matrix4 } = resolveContext();
  if (!basisFwd) basisFwd = new Vector3();
  if (!basisRight) basisRight = new Vector3();
  if (!basisUp) basisUp = new Vector3();
  if (!basisMatrix) basisMatrix = new Matrix4();

  unrealToThreeCoords(basisFwd, buffer[offset], buffer[offset + 1], buffer[offset + 2]);
  unrealToThreeCoords(basisRight, buffer[offset + 3], buffer[offset + 4], buffer[offset + 5]);
  unrealToThreeCoords(basisUp, buffer[offset + 6], buffer[offset + 7], buffer[offset + 8]);

  if (basisFwd.lengthSq() < 1e-6 || basisUp.lengthSq() < 1e-6 || basisRight.lengthSq() < 1e-6) {
    targetQuat.set(0, 0, 0, 1);
    return targetQuat;
  }

  basisMatrix.makeBasis(basisFwd, basisUp, basisRight);
  targetQuat.setFromRotationMatrix(basisMatrix);
  return targetQuat;
}

/**
 * Backward compatibility quaternion unpacker: supports either 9-float basis vector extraction
 * or fallback 4-float quaternion unpacking.
 */
export function unpackBufferQuaternion(targetQuat, buffer, offset) {
  if (!buffer || buffer.length < offset + 9) {
    if (buffer && buffer.length >= offset + 4 && (buffer[offset] || buffer[offset + 1] || buffer[offset + 2] || buffer[offset + 3])) {
      targetQuat.set(buffer[offset], buffer[offset + 2], buffer[offset + 1], buffer[offset + 3]);
      return targetQuat;
    }
    targetQuat.set(0, 0, 0, 1);
    return targetQuat;
  }
  return bufferBasisToQuaternion(targetQuat, buffer, offset);
}

/**
 * Updates suspension A-arm orientation and extension.
 */
export function updateSuspensionArm(armMesh, rootMesh, knucklePos) {
  if (!armMesh || !rootMesh || !knucklePos) return;
  const { Vector3 } = resolveContext();
  const rootPos = rootMesh.position || rootMesh;
  const mid = new Vector3().copy(rootPos).add(knucklePos).multiplyScalar(0.5);
  armMesh.position.copy(mid);
  const dir = new Vector3().copy(knucklePos).sub(rootPos);
  const len = dir.length();
  dir.divideScalar(len || 1);
  armMesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir);
  armMesh.scale.set(1, len, 1);
}

/**
 * Updates suspension coil spring scale and damper rod height.
 */
function updateSuspensionUnitSpring(susUnit, knucklePos) {
  if (!susUnit || !susUnit.group || !knucklePos) return;
  const { Vector3 } = resolveContext();
  const dir = new Vector3(knucklePos.x - susUnit.top.x, knucklePos.y - susUnit.top.y, knucklePos.z - susUnit.top.z);
  const len = dir.length();
  dir.divideScalar(len || 1);
  susUnit.group.quaternion.setFromUnitVectors(new Vector3(0, -1, 0), dir);
  if (susUnit.spring) susUnit.spring.scale.y = len / susUnit.built;
  const shaftLen = Math.max(1, len - susUnit.bodyLen * 0.5);
  if (susUnit.shaft) {
    susUnit.shaft.scale.y = shaftLen;
    susUnit.shaft.position.y = -shaftLen / 2;
  }
  if (susUnit.body) {
    susUnit.body.position.y = -(len - susUnit.bodyLen / 2);
  }
}

/**
 * Generates procedural wireframe box for visual hitbox debugging.
 */
export function createCarHitboxWireframe(preset = OCTANE_HITBOX_PRESET) {
  const { BoxGeometry, EdgesGeometry, LineSegments, LineBasicMaterial } = resolveContext();
  const boxGeom = new BoxGeometry(preset.length, preset.height, preset.width);
  const edgesGeom = new EdgesGeometry(boxGeom);
  const lineMat = new LineBasicMaterial({
    color: 16777215,
    transparent: true,
    opacity: 0.9,
    depthTest: true,
    depthWrite: false
  });
  const hitboxMesh = new LineSegments(edgesGeom, lineMat);
  hitboxMesh.name = "car-hitbox";
  hitboxMesh.position.set(preset.forward, preset.up, 0);
  hitboxMesh.renderOrder = 100;
  hitboxMesh.visible = false;
  return hitboxMesh;
}

/**
 * Generates procedural striped turf canvas texture with soccer pitch markings.
 */
export function createStadiumTurfTexture(wornFineStripes = false) {
  const { CanvasTexture, SRGBColorSpace, LinearFilter, LinearMipmapLinearFilter } = resolveContext();
  if (typeof document === 'undefined') {
    return new CanvasTexture({});
  }

  const canvas = document.createElement("canvas");
  canvas.width = TURF_TEXTURE_WIDTH;
  canvas.height = TURF_TEXTURE_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new CanvasTexture(canvas);

  let seed = 1296388681;
  const prng = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const imgData = ctx.createImageData(TURF_TEXTURE_WIDTH, TURF_TEXTURE_HEIGHT);
  const data = imgData.data;
  const xFreq = new Float32Array(TURF_TEXTURE_WIDTH);
  for (let x = 0; x < TURF_TEXTURE_WIDTH; x++) {
    xFreq[x] = Math.sin(x * 0.026) * 0.009 + Math.sin(x * 0.0073 + 1.1) * 0.018 + (Math.floor(x / 160) % 2) * 0.015;
  }

  for (let y = 0; y < TURF_TEXTURE_HEIGHT; y++) {
    const worldY = (y * ARENA_LENGTH) / TURF_TEXTURE_HEIGHT - ARENA_LENGTH / 2;
    const stripePattern = Math.floor(y / (wornFineStripes ? 160 : 320)) % 2;
    const ySine = Math.sin(y * 0.021) * 0.014 + Math.sin(y * 0.0051) * 0.022;
    const goalDecay = Math.exp(-Math.pow((Math.abs(worldY) - 4510) / 390, 2));

    for (let x = 0; x < TURF_TEXTURE_WIDTH; x++) {
      const worldX = (x * ARENA_WIDTH) / TURF_TEXTURE_WIDTH - ARENA_WIDTH / 2;
      const cornerDim = Math.abs(worldX) > 3650 || Math.abs(worldY) > 4800 ? (wornFineStripes ? 0.81 : 0.88) : 1;
      const goalMouthShade = wornFineStripes ? goalDecay * Math.exp(-Math.pow(worldX / 880, 2)) : 0;
      const bladeNoise = wornFineStripes ? 0.955 + prng() * 0.09 + xFreq[x] + ySine : 0.995 + prng() * 0.01;
      const idx = (y * TURF_TEXTURE_WIDTH + x) * 4;

      data[idx] = ((wornFineStripes ? (stripePattern ? 32 : 26) + goalMouthShade * 9 : stripePattern ? 35 : 30)) * bladeNoise * cornerDim;
      data[idx + 1] = ((wornFineStripes ? (stripePattern ? 84 : 76) - goalMouthShade * 6 : stripePattern ? 105 : 94)) * bladeNoise * cornerDim;
      data[idx + 2] = ((wornFineStripes ? (stripePattern ? 36 : 30) - goalMouthShade * 5 : stripePattern ? 39 : 34)) * bladeNoise * cornerDim;
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  ctx.scale(TURF_TEXTURE_WIDTH / ARENA_WIDTH, TURF_TEXTURE_HEIGHT / ARENA_LENGTH);
  ctx.translate(ARENA_WIDTH / 2, ARENA_LENGTH / 2);
  ctx.lineWidth = 22;
  ctx.strokeStyle = "rgba(235, 245, 225, 0.96)";
  ctx.fillStyle = "rgba(235, 245, 225, 0.96)";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const drawLine = (x1, y1, x2, y2) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };

  const drawArc = (x, y, r, fill = false) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fill) ctx.fill(); else ctx.stroke();
  };

  const halfPitchX = 3500, halfPitchY = 4700;
  ctx.strokeRect(-halfPitchX, -halfPitchY, halfPitchX * 2, halfPitchY * 2);
  drawLine(-halfPitchX, 0, halfPitchX, 0);
  drawArc(0, 0, 915);
  drawArc(0, 0, 23, true);

  for (const sign of [-1, 1]) {
    const goalY = sign * halfPitchY;
    const penY = sign * 3350;
    const teamHex = sign < 0 ? TEAM_BLUE_HEX : TEAM_ORANGE_HEX;
    const teamColorStr = `#${(teamHex & 0xffffff).toString(16).padStart(6, '0')}`;

    ctx.fillStyle = teamColorStr;
    ctx.globalAlpha = 0.13;
    ctx.fillRect(-2000, Math.min(goalY, penY), 4000, Math.abs(goalY - penY));
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = teamColorStr;
    ctx.lineWidth = 30;

    drawLine(-halfPitchX, 0, -halfPitchX, goalY);
    drawLine(halfPitchX, 0, halfPitchX, goalY);
    drawLine(-halfPitchX, goalY, halfPitchX, goalY);

    ctx.beginPath();
    ctx.moveTo(-2000, goalY); ctx.lineTo(-2000, penY); ctx.lineTo(2000, penY); ctx.lineTo(2000, goalY); ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-1150, goalY); ctx.lineTo(-1150, sign * 4190); ctx.lineTo(1150, sign * 4190); ctx.lineTo(1150, goalY); ctx.stroke();
    drawArc(0, sign * 3760, 20, true);

    ctx.save();
    ctx.beginPath();
    ctx.rect(-1600, sign > 0 ? 2000 : -3350, 3200, 1350);
    ctx.clip();
    drawArc(0, sign * 3760, 850);
    ctx.restore();
  }

  const texture = new CanvasTexture(canvas);
  texture.name = wornFineStripes ? "Stadium / worn grass and fine mowing stripes" : "Stadium / striped grass and painted pitch";
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.anisotropy = 8;
  return texture;
}

/**
 * Builds the competition pitch mesh with emerald/natural dual-theme turf.
 */
export function createCompetitionTurfMesh() {
  const { Group, PlaneGeometry, MeshStandardMaterial, Mesh, multiThemeMaterial, markMatrixDirty } = resolveContext();
  const turfGroup = new Group();
  turfGroup.name = "Stadium / competition turf";

  const emeraldTex = createStadiumTurfTexture(false);
  const naturalTex = createStadiumTurfTexture(true);

  const emeraldMat = new MeshStandardMaterial({
    name: "Stadium / emerald mown turf",
    map: emeraldTex,
    roughness: 1,
    metalness: 0,
    envMapIntensity: 0.35
  });
  const naturalMat = new MeshStandardMaterial({
    name: "Stadium / natural mown turf",
    map: naturalTex,
    roughness: 0.96,
    metalness: 0,
    envMapIntensity: 1
  });

  const turfMesh = new Mesh(new PlaneGeometry(ARENA_WIDTH, ARENA_LENGTH), multiThemeMaterial(emeraldMat, naturalMat));
  turfMesh.name = "Stadium / painted playing surface";
  turfMesh.rotation.x = -Math.PI / 2;
  turfMesh.receiveShadow = true;
  turfGroup.add(turfMesh);

  turfDecalCache.set(turfGroup, [emeraldTex, naturalTex].map(tex => ({
    texture: tex,
    base: tex.image
  })));

  markMatrixDirty(turfGroup);
  return turfGroup;
}

/**
 * Stamps boost pad boundary rings, chevrons, backing plates, and speed lanes directly onto the pitch texture.
 */
export function updateTurfPadDecals(turfGroup, padDefs) {
  const cached = turfDecalCache.get(turfGroup);
  if (!cached || !padDefs || !padDefs.length) return;

  const signature = padDefs.map(d => `${d.pos[0]},${d.pos[1]},${d.isBig}`).join(";");
  for (const item of cached) {
    if (item.padSignature === signature) continue;
    if (typeof document === "undefined") return;

    const canvas = document.createElement("canvas");
    canvas.width = TURF_TEXTURE_WIDTH;
    canvas.height = TURF_TEXTURE_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx || !item.base) continue;

    ctx.drawImage(item.base, 0, 0);
    ctx.scale(TURF_TEXTURE_WIDTH / ARENA_WIDTH, TURF_TEXTURE_HEIGHT / ARENA_LENGTH);
    ctx.translate(ARENA_WIDTH / 2, ARENA_LENGTH / 2);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const toRgb = hex => `${(hex >> 16) & 255}, ${(hex >> 8) & 255}, ${hex & 255}`;
    const blueStr = toRgb(TEAM_BLUE_HEX);
    const orangeStr = toRgb(TEAM_ORANGE_HEX);
    const midStr = "201, 221, 195";
    const getPadColor = y => y < -50 ? blueStr : y > 50 ? orangeStr : midStr;
    const bigPads = padDefs.filter(d => d.isBig);
    const drawArc = (x, y, r, start, end) => {
      ctx.beginPath();
      ctx.arc(x, y, r, start, end);
      ctx.stroke();
    };

    // 1. S-curve boost lanes connecting corner pads to midfield
    for (const d of [-1, 1]) {
      const colorStr = d < 0 ? blueStr : orangeStr;
      for (const p of [-1, 1]) {
        const cornerPad = bigPads
          .filter(s => s.pos[0] * p > 1000 && s.pos[1] * d > 1000)
          .sort((a, b) => Math.abs(b.pos[1]) - Math.abs(a.pos[1]))[0];
        if (!cornerPad) continue;

        const midPad = bigPads.find(s => s.pos[0] * p > 1000 && Math.abs(s.pos[1]) < 800);
        const mx = midPad?.pos[0] ?? p * 3550;
        const my = midPad?.pos[1] ?? 0;
        const [cx, cy] = cornerPad.pos;

        const tracePath = () => {
          ctx.beginPath();
          ctx.moveTo(mx, my + d * 245);
          ctx.bezierCurveTo(mx - p * 110, d * 1780, cx - p * 260, cy - d * 760, cx, cy);
          ctx.quadraticCurveTo(cx - p * 360, cy + d * 370, p * 1470, d * 4560);
        };

        ctx.lineWidth = 160;
        ctx.strokeStyle = `rgba(${colorStr}, 0.10)`;
        tracePath();
        ctx.stroke();

        ctx.lineWidth = 10;
        ctx.strokeStyle = `rgba(${colorStr}, 0.49)`;
        tracePath();
        ctx.stroke();

        ctx.fillStyle = `rgba(${colorStr}, 0.075)`;
        ctx.beginPath();
        ctx.moveTo(p * 1020, d * 4780);
        ctx.lineTo(p * 2220, d * 4780);
        ctx.lineTo(p * 1900, d * 4060);
        ctx.lineTo(p * 1510, d * 4240);
        ctx.closePath();
        ctx.fill();
      }
    }

    // 2. Pad ground markings
    for (const pad of padDefs) {
      const [u, p] = pad.pos;
      const v = getPadColor(p);
      const g = pad.isBig ? 163 : 69;
      const m = Math.atan2(-p, -u);

      if (pad.isBig) {
        ctx.fillStyle = `rgba(${v}, 0.12)`;
        ctx.beginPath();
        ctx.arc(u, p, 338, m - Math.PI / 2, m + Math.PI / 2);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = `rgba(${v}, 0.62)`;
        ctx.lineWidth = 13;
        drawArc(u, p, 338, m - 1.27, m + 1.27);

        ctx.lineWidth = 5;
        ctx.strokeStyle = `rgba(${v}, 0.34)`;
        drawArc(u, p, 363, m - 1.12, m + 1.12);
      }

      ctx.strokeStyle = `rgba(${midStr}, ${pad.isBig ? 0.68 : 0.56})`;
      ctx.lineWidth = pad.isBig ? 11 : 8;
      drawArc(u, p, g, 0, Math.PI * 2);

      ctx.strokeStyle = `rgba(${v}, ${pad.isBig ? 0.82 : 0.64})`;
      ctx.lineWidth = pad.isBig ? 18 : 8;

      const y = g + (pad.isBig ? 43 : 28);
      for (const offset of [0, Math.PI]) {
        drawArc(u, p, y, m + offset - 0.74, m + offset + 0.74);
      }

      ctx.save();
      ctx.translate(u, p);
      ctx.rotate(m);
      ctx.lineWidth = pad.isBig ? 9 : 6;
      ctx.strokeStyle = `rgba(${v}, 0.45)`;

      const cDist = y + (pad.isBig ? 160 : 28);
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cDist, side * (pad.isBig ? 38 : 22));
        ctx.lineTo(cDist + (pad.isBig ? 155 : 70), side * (pad.isBig ? 38 : 22));
        ctx.stroke();
      }
      ctx.restore();
    }

    item.texture.image = canvas;
    item.texture.needsUpdate = true;
    item.padSignature = signature;
  }
}

/**
 * Creates stadium dome sky shader mesh.
 */
export function createStadiumDomeSky() {
  const { ShaderMaterial, SphereGeometry, Mesh, Color, FrontSide, multiThemeMaterial, markMatrixDirty } = resolveContext();
  const arcadeMat = new ShaderMaterial({
    name: "Stadium / arcade sky",
    side: FrontSide,
    depthWrite: false,
    uniforms: {
      zenith: { value: new Color(1389936) },
      middle: { value: new Color(3766190) },
      horizon: { value: new Color(8894931) }
    },
    vertexShader: `
      varying vec3 vSkyDirection;
      void main() {
        vSkyDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position.z = gl_Position.w;
      }
    `,
    fragmentShader: `
      varying vec3 vSkyDirection;
      uniform vec3 zenith;
      uniform vec3 middle;
      uniform vec3 horizon;
      void main() {
        vec3 direction = normalize(vSkyDirection);
        float h = max(0.0, direction.y);
        vec3 color = mix(horizon, middle, smoothstep(0.0, 0.22, h));
        color = mix(color, zenith, pow(smoothstep(0.10, 0.88, h), 0.65));
        gl_FragColor = vec4(color, 1.0);
      }
    `
  });

  const realisticMat = arcadeMat.clone();
  realisticMat.name = "Stadium / blue-hour sky";
  realisticMat.uniforms.zenith.value.setHex(794685);
  realisticMat.uniforms.middle.value.setHex(4679561);
  realisticMat.uniforms.horizon.value.setHex(10784133);

  const skyMesh = new Mesh(new SphereGeometry(28000, 48, 24), multiThemeMaterial(arcadeMat, realisticMat));
  skyMesh.name = "Stadium / open blue sky";
  skyMesh.userData.bloomOccluder = false;
  skyMesh.renderOrder = 10000;
  markMatrixDirty(skyMesh);
  return skyMesh;
}

/**
 * Creates vehicle offroad wheel procedural mesh with rims and tire tread.
 */
export function createOffroadWheelMesh(radius, width, mats) {
  const { Group, LatheGeometry, CylinderGeometry, Vector2, Mesh } = resolveContext();
  const wheelGroup = new Group();
  wheelGroup.name = "offroad-wheel";

  const halfWidth = width / 2;
  const innerRadius = radius * 0.58;
  const profile = [
    new Vector2(innerRadius, -halfWidth),
    new Vector2(radius * 0.94, -halfWidth),
    new Vector2(radius, -halfWidth * 0.55),
    new Vector2(radius, halfWidth * 0.55),
    new Vector2(radius * 0.94, halfWidth),
    new Vector2(innerRadius, halfWidth)
  ];

  const tireMesh = new Mesh(new LatheGeometry(profile, 36), mats.tire);
  tireMesh.castShadow = true;
  wheelGroup.add(tireMesh);

  const rimMesh = new Mesh(new CylinderGeometry(innerRadius * 0.92, innerRadius * 0.92, width * 0.48, 32), mats.rim);
  rimMesh.castShadow = true;
  wheelGroup.add(rimMesh);

  return wheelGroup;
}

/**
 * Creates vehicle suspension unit (spring coil, shock shaft, and damper body).
 */
export function createSuspensionUnit(length, matSpring, matShaft, matBody) {
  const { Group, CylinderGeometry, Mesh } = resolveContext();
  const group = new Group();
  const spring = new Mesh(new CylinderGeometry(2.5, 2.5, length, 12), matSpring);
  const shaft = new Mesh(new CylinderGeometry(0.8, 0.8, 1, 10), matShaft);
  const bodyLen = length * 0.5;
  const body = new Mesh(new CylinderGeometry(1.7, 1.7, bodyLen, 14), matBody);

  spring.castShadow = true;
  shaft.castShadow = true;
  body.castShadow = true;
  group.add(spring, shaft, body);

  return { group, spring, shaft, body, built: length, bodyLen };
}

/**
 * Creates suspension knuckle hub.
 */
export function createSuspensionKnuckle(innerZ, mat) {
  const { Group, CylinderGeometry, SphereGeometry, Mesh } = resolveContext();
  const group = new Group();
  group.name = "suspension-knuckle";
  const shaft = new Mesh(new CylinderGeometry(1.3, 1.3, Math.abs(innerZ), 12), mat);
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = innerZ / 2;
  const knuckle = new Mesh(new SphereGeometry(1.8, 12, 8), mat);
  knuckle.position.z = innerZ;
  shaft.castShadow = true;
  knuckle.castShadow = true;
  group.add(shaft, knuckle);
  return group;
}

/**
 * Creates reaction control thruster jet nozzle and animated flame cone.
 */
export function createReactionControlJet(pos, dirX, dirY, dirZ) {
  const { Group } = resolveContext();
  const jetGroup = new Group();
  jetGroup.position.copy(pos);
  const flameGroup = new Group();
  flameGroup.position.y = 3.3;
  flameGroup.scale.set(0, 0, 0);
  jetGroup.add(flameGroup);
  return { group: jetGroup, flame: flameGroup };
}

/**
 * Connects vehicle reaction jets to vehicle gimbal state.
 */
export function setupCarReactionJets(vehicleGimbals) {
  if (!vehicleGimbals || !vehicleGimbals.jets) return null;
  const jets = vehicleGimbals.jets;
  const makeJet = (pos, dx, dy, dz) => {
    const jet = createReactionControlJet(pos, dx, dy, dz);
    vehicleGimbals.group?.add(jet.group);
    return jet.flame;
  };
  const makeAxisJets = (axis) => ({
    fP: makeJet(axis.fP, 0, 0, 1),
    fN: makeJet(axis.fN, 0, 0, -1),
    bP: makeJet(axis.bP, 0, 0, 1),
    bN: makeJet(axis.bN, 0, 0, -1)
  });
  return {
    roll: makeAxisJets(jets.roll),
    yaw: makeAxisJets(jets.yaw),
    pitchFront: (jets.pitchFront || []).map(p => makeJet(p, 0, 1, 0)),
    pitchBack: (jets.pitchBack || []).map(p => makeJet(p, 0, 1, 0)),
    jump: makeJet(jets.jump, 0, -1, 0)
  };
}

const DEFAULT_WHEEL_SPECS = {
  game: [[45.5, 30.5, 13.5], [45.5, -30.5, 13.5], [-35.5, 30.5, 13.5], [-35.5, -30.5, 13.5]],
  flat: [[50.3, 31.1, 12], [50.3, -31.1, 12], [-34.75, 33, 13.5], [-34.75, -33, 13.5]],
  realistic: [[63.88, 34, 13], [63.88, -34, 13], [-36.12, 34, 16], [-36.12, -34, 16]]
};

/**
 * ArenaWorld (aliased as ow)
 * Central manager for the 3D soccer pitch, ball, vehicles, lights, shadows, and camera targets.
 */
export class ArenaWorld {
  constructor(ballRadius, defaultCarVisual = "game-car") {
    const { Scene, Group, Color, Fog, HemisphereLight, DirectionalLight, Vector3, Quaternion, RingGeometry, MeshBasicMaterial, Mesh } = resolveContext();

    this.scene = new Scene();
    this.ball = new Group();
    this.cars = [];
    this.carVisuals = [];
    this.pads = [];
    this.boostPadSystem = new BoostPadSystem();
    this.carHitboxes = [];
    this.carHitboxesVisible = false;
    this.padTemplates = null;
    this.gameCarAsset = null;
    this.flatCarAsset = null;
    this.realisticCarAsset = null;
    this.carGimbals = [];
    this.carSuspension = [];
    this.carWheels = [];
    this.carWheelSpecs = [];
    this.wheelSpin = [];
    this.carBoosts = [];
    this.carDemolitions = [];
    this.carJets = [];
    this.jumpPrev = [];
    this.jumpTimer = [];
    this.flipPrev = [];
    this.dodgeBurst = [];
    this.dodgeRoll = [];
    this.dodgeYaw = [];
    this.dodgePitch = [];
    this.ballRadius = ballRadius;
    this.ballSpeedTrail = new SpeedTrail();
    this.ballLocatorArrow = new BallLocatorArrow();
    this.ballVelocity = new Vector3();
    this._renderTreeVersion = 0;
    this.pA = new Vector3();
    this.pB = new Vector3();
    this.qA = new Quaternion();
    this.qB = new Quaternion();
    this.shadowFocus = new Vector3();
    this.carVisual = defaultCarVisual;
    this.stadium = null;
    this.stadiumVisible = true;

    this.scene.background = new Color(4679561);
    if (Fog) {
      this.scene.fog = new Fog(6586005, 15000, 34000);
    }
    this.scene.add(new HemisphereLight(13164543, 2569000, 1.15));

    this.carSunTarget = new Group();
    this.ballSunTarget = new Group();
    this.opponentSunTarget = new Group();
    this.opponentSun = null;

    this.carSun = this.makeSubjectSun(this.carSunTarget, 260);
    this.ballSun = this.makeSubjectSun(this.ballSunTarget, 190);
    this.scene.add(this.carSunTarget, this.ballSunTarget, this.carSun, this.ballSun);

    const keyLight = new DirectionalLight(8956671, 0.35);
    keyLight.position.set(-2000, 2000, -2000);
    this.scene.add(keyLight);

    this.turf = createCompetitionTurfMesh();
    this.sky = createStadiumDomeSky();
    this.scene.add(this.turf, this.sky);

    this.scene.add(this.ball);
    if (this.ballLocatorArrow?.object) this.scene.add(this.ballLocatorArrow.object);
    if (this.ballSpeedTrail?.object) this.scene.add(this.ballSpeedTrail.object);

    const ringRadius = ballRadius * 1.15;
    const ringGeom = new RingGeometry(ringRadius * 0.92, ringRadius, 48);
    const ringMat = new MeshBasicMaterial({ color: 16777215, transparent: true, opacity: 0.55, depthWrite: false });
    this.indicatorRing = new Mesh(ringGeom, ringMat);
    this.indicatorHeightRing = new Mesh(ringGeom, ringMat);
    for (const r of [this.indicatorRing, this.indicatorHeightRing]) {
      r.rotation.x = -Math.PI / 2;
      r.renderOrder = 2;
      this.scene.add(r);
    }

    this.markRenderTreeChanged();

    if (typeof onThemeChange === 'function') {
      const weakThis = new WeakRef(this);
      onThemeChange(() => weakThis.deref()?.markRenderTreeChanged());
    }
  }

  resetBallTrail() {
    this.ballSpeedTrail?.reset();
  }

  get renderTreeVersion() {
    return this._renderTreeVersion;
  }

  get boostBloomActive() {
    for (const carGroup of this.carBoosts) {
      for (const emitter of carGroup) {
        if (emitter?.bloomActive) return true;
      }
    }
    return false;
  }

  markRenderTreeChanged() {
    this._renderTreeVersion++;
  }

  async loadBall() {
    try {
      const ballAsset = await loadBallAsset();
      this.ball.add(ballAsset);
    } catch (err) {
      console.warn("Ball asset failed to load, keeping default procedural mesh:", err);
    }
    this.markRenderTreeChanged();
  }

  updateBallLocatorArrow(ballCamActive, carIndex = 0, targetBall = this.ball, targetCar = null) {
    this.ballLocatorArrow?.update(targetCar || this.cars[carIndex] || this.cars[0], targetBall || this.ball, ballCamActive);
  }

  async loadCarAndPadAssets() {
    if (arenaWorldCarLoaders.loadGameCarAsset) {
      try {
        this.gameCarAsset = await arenaWorldCarLoaders.loadGameCarAsset();
      } catch (err) {
        console.warn("Game car asset failed to load:", err);
      }
    }
    if (arenaWorldCarLoaders.loadFlatCarAsset) {
      try {
        this.flatCarAsset = await arenaWorldCarLoaders.loadFlatCarAsset();
      } catch (err) {
        console.warn("Flat car asset failed to load:", err);
      }
    }
    if (arenaWorldCarLoaders.loadRealisticCarAsset) {
      try {
        this.realisticCarAsset = await arenaWorldCarLoaders.loadRealisticCarAsset();
      } catch (err) {
        console.warn("Realistic car asset failed to load:", err);
      }
    }

    const {
      OBJLoader,
      TextureLoader,
      SRGBColorSpace,
      MeshStandardMaterial,
      multiThemeMaterial,
      cloneMaterial,
      Mesh
    } = resolveContext();

    if (OBJLoader && TextureLoader) {
      try {
        const objLoader = new OBJLoader();
        const texLoader = new TextureLoader();

        const loadObj = async (primaryPath, fallbackPath) => {
          try {
            return await objLoader.loadAsync(primaryPath);
          } catch (e) {
            if (fallbackPath && fallbackPath !== primaryPath) {
              return await objLoader.loadAsync(fallbackPath);
            }
            throw e;
          }
        };

        const loadTex = async (primaryPath, fallbackPath) => {
          let tex;
          try {
            tex = await texLoader.loadAsync(primaryPath);
          } catch (e) {
            if (fallbackPath && fallbackPath !== primaryPath) {
              tex = await texLoader.loadAsync(fallbackPath);
            } else {
              throw e;
            }
          }
          if (tex && SRGBColorSpace) tex.colorSpace = SRGBColorSpace;
          return tex;
        };

        const [bigActive, bigIdle, smallActive, smallIdle, albedo] = await Promise.all([
          loadObj(resolveAssetPath("/assets/arena/pads/large-active.obj"), "./assets/arena/pads/large-active.obj"),
          loadObj(resolveAssetPath("/assets/arena/pads/large-idle.obj"), "./assets/arena/pads/large-idle.obj"),
          loadObj(resolveAssetPath("/assets/arena/pads/small-active.obj"), "./assets/arena/pads/small-active.obj"),
          loadObj(resolveAssetPath("/assets/arena/pads/small-idle.obj"), "./assets/arena/pads/small-idle.obj"),
          loadTex(resolveAssetPath("/assets/arena/pads/albedo.png"), "./assets/arena/pads/albedo.png")
        ]);

        const padMat = (typeof multiThemeMaterial === "function") ? multiThemeMaterial(
          cloneMaterial ? cloneMaterial({ map: albedo }) : new MeshStandardMaterial({ map: albedo }),
          new MeshStandardMaterial({ map: albedo, roughness: 0.6, metalness: 0.2 })
        ) : new MeshStandardMaterial({ map: albedo, roughness: 0.6, metalness: 0.2 });

        for (const obj of [bigActive, bigIdle, smallActive, smallIdle]) {
          if (obj) {
            if (obj.rotation && typeof obj.rotation.x === "number") {
              obj.rotation.x = -Math.PI / 2;
            }
            obj.traverse?.(child => {
              if (child instanceof Mesh || child.isMesh) {
                child.material = padMat;
              }
            });
          }
        }
        this.padTemplates = {
          bigFull: bigActive,
          bigBase: bigIdle,
          smallFull: smallActive,
          smallBase: smallIdle
        };
      } catch (err) {
        console.warn("Pad models failed to load, keeping primitive fallbacks", err);
      }
    }

    this.markRenderTreeChanged();
  }

  async loadArena() {
    try {
      const [boundary, stadium] = await Promise.all([
        loadStadiumContinuousBoundary(resolveContext).catch(err => {
          console.warn("Continuous stadium boundary failed to load:", err);
          return null;
        }),
        loadStadiumArchitecture(resolveContext).catch(err => {
          console.warn("Stadium architecture failed to load:", err);
          return null;
        })
      ]);
      if (boundary) {
        this.boundary = boundary;
        this.scene.add(boundary);
      }
      if (stadium) {
        this.stadium = stadium;
        if (this.stadiumVisible) {
          this.scene.add(stadium);
        }
      }
    } catch (err) {
      console.warn("loadArena skipped:", err);
    }
    this.markRenderTreeChanged();
  }

  setStadiumVisible(visible) {
    if (this.stadiumVisible !== visible) {
      this.stadiumVisible = visible;
      for (const t of [this.stadium, this.sky]) {
        if (t) {
          visible ? this.scene.add(t) : t.removeFromParent?.();
        }
      }
      const { Color } = resolveContext();
      this.scene.background = new Color(visible ? 4679561 : 0);
      this.markRenderTreeChanged();
    }
  }

  async ensureOpponent() {
    if (this.cars.length <= 1) {
      if (!this.gameCarAsset && arenaWorldCarLoaders.loadGameCarAsset) {
        try {
          this.gameCarAsset = await arenaWorldCarLoaders.loadGameCarAsset();
        } catch (err) {
          console.warn("Opponent game car asset load skipped:", err);
        }
      }
      this.opponentSun = this.makeSubjectSun(this.opponentSunTarget, 260);
      this.opponentSun.visible = false;
      this.scene.add(this.opponentSun, this.opponentSunTarget);
      this.addCar(1, "game-car");
    }
  }

  async prepareAssets() {
    await this.ensureOpponent();
    if (this.cars[BOT_CAR_INDEX]) this.cars[BOT_CAR_INDEX].visible = false;
    await Promise.all(this.carBoosts.flatMap(e => e.map(t => t.preload?.())));
  }

  addCar(teamIndex, visual = this.carVisual) {
    const { Group, Vector3, Mesh, CylinderGeometry, MeshStandardMaterial } = resolveContext();
    const carRoot = new Group();
    const isBot = this.cars.length === BOT_CAR_INDEX;
    const isHitbox = visual.startsWith("hitbox-");
    const isRealistic = visual === "realistic";
    const isFlat = visual === "flat-car";
    const teamColor = arenaWorldCarLoaders.teamColors?.[teamIndex] ?? DEFAULT_TEAM_COLORS[teamIndex % 2];

    let gimbals = null;
    let boostOutlets = null;

    if (isHitbox) {
      const preset = HITBOX_PRESETS[visual] || HITBOX_PRESETS["hitbox-octane"];
      let carModel;
      try {
        carModel = createWhiteboxCarModel(visual, teamColor);
      } catch (err) {
        carModel = new Group();
      }
      carRoot.add(carModel);
      const hitboxBox = createCarHitboxWireframe(preset);
      hitboxBox.visible = this.carHitboxesVisible;
      this.carHitboxes.push(hitboxBox);
      this.carGimbals.push(null);
      carRoot.add(hitboxBox);
      boostOutlets = OCTANE_BOOST_OUTLETS.map(([x, y, z]) => new Vector3(x, y, z));
    } else if (isRealistic && arenaWorldCarLoaders.createRealisticCarModel) {
      const realisticGroup = new Group();
      realisticGroup.name = "realistic-car";
      const model = arenaWorldCarLoaders.createRealisticCarModel(teamColor);
      realisticGroup.add(model.group);
      gimbals = arenaWorldCarLoaders.createRealisticCarGimbals ? arenaWorldCarLoaders.createRealisticCarGimbals() : null;
      if (this.realisticCarAsset && arenaWorldCarLoaders.assembleRealisticCar) {
        arenaWorldCarLoaders.assembleRealisticCar(this.realisticCarAsset, model, gimbals, teamColor);
      }
      if (gimbals?.hitbox) {
        gimbals.hitbox.visible = this.carHitboxesVisible;
        this.carHitboxes.push(gimbals.hitbox);
        this.carGimbals.push(gimbals);
        carRoot.add(realisticGroup, gimbals.root);
      } else {
        const hitboxBox = createCarHitboxWireframe(OCTANE_HITBOX_PRESET);
        hitboxBox.visible = this.carHitboxesVisible;
        this.carHitboxes.push(hitboxBox);
        this.carGimbals.push(null);
        carRoot.add(realisticGroup, hitboxBox);
      }
      boostOutlets = [model.boostOutlet || new Vector3(-57, 10.25, 0)];
    } else {
      let carModel;
      if (isFlat && arenaWorldCarLoaders.createFlatCarModel && this.flatCarAsset) {
        carModel = arenaWorldCarLoaders.createFlatCarModel(this.flatCarAsset, teamColor);
      } else if (arenaWorldCarLoaders.createGameCarModel && this.gameCarAsset) {
        const theme = arenaWorldCarLoaders.getCarVisualTheme ? arenaWorldCarLoaders.getCarVisualTheme(this.carVisual) : undefined;
        carModel = arenaWorldCarLoaders.createGameCarModel(this.gameCarAsset, teamColor, isBot ? theme : undefined);
      } else {
        try {
          carModel = createWhiteboxCarModel("hitbox-octane", teamColor);
        } catch (err) {
          carModel = new Group();
        }
      }
      carRoot.add(carModel);
      const hitboxBox = createCarHitboxWireframe(OCTANE_HITBOX_PRESET);
      hitboxBox.visible = this.carHitboxesVisible;
      this.carHitboxes.push(hitboxBox);
      this.carGimbals.push(null);
      carRoot.add(hitboxBox);
      if (isFlat) {
        boostOutlets = FLAT_CAR_BOOST_OUTLETS.map(([x, y, z]) => new Vector3(x, y, z));
      } else {
        boostOutlets = OCTANE_BOOST_OUTLETS.map(([x, y, z]) => new Vector3(x, y, z));
      }
    }

    let wheelSpecs;
    if (isHitbox) {
      const cfg = HITBOX_PRESETS[visual] || HITBOX_PRESETS["hitbox-octane"];
      const xF = cfg.forward + cfg.length * 0.35, xR = cfg.forward - cfg.length * 0.35, zS = (cfg.width * 0.5) + 5;
      wheelSpecs = [[xF, zS, 12.5], [xF, -zS, 12.5], [xR, zS, 15], [xR, -zS, 15]];
    } else {
      const specs = arenaWorldCarLoaders.wheelSpecs;
      wheelSpecs = isRealistic ? (specs?.realistic || DEFAULT_WHEEL_SPECS.realistic) :
                   isFlat ? (specs?.flat || DEFAULT_WHEEL_SPECS.flat) :
                   (specs?.game || DEFAULT_WHEEL_SPECS.game);
    }

    const wheels = [];
    if (isHitbox || !this.gameCarAsset) {
      const wheelGeom = new CylinderGeometry(13.5, 13.5, 9, 16);
      wheelGeom.rotateX?.(Math.PI / 2);
      const wheelMat = new MeshStandardMaterial({ color: 2171169, roughness: 0.9, metalness: 0.1 });
      for (let u = 0; u < 4; u++) {
        const steerGroup = new Group();
        const spinGroup = new Group();
        const wm = new Mesh(wheelGeom, wheelMat);
        wm.castShadow = true;
        spinGroup.add(wm);
        steerGroup.add(spinGroup);
        carRoot.add(steerGroup);
        wheels.push({ steer: steerGroup, spin: spinGroup });
      }
    } else {
      for (let u = 0; u < wheelSpecs.length; u++) {
        const [px, pz, pradius] = wheelSpecs[u];
        const steerGroup = new Group();
        steerGroup.position.set(px, isFlat ? (arenaWorldCarLoaders.suspensionSpecs?.flatY?.[u] ?? -6.2) : (pradius - 17), pz);
        const spinGroup = new Group();
        let wheelMesh;
        if (isRealistic) {
          wheelMesh = createOffroadWheelMesh(pradius, 16, {
            tire: new MeshStandardMaterial({ color: 1447965, roughness: 0.96 }),
            rim: new MeshStandardMaterial({ color: 1909033, roughness: 0.3, metalness: 0.9 })
          });
        } else if (isFlat && arenaWorldCarLoaders.createFlatCarWheel && this.flatCarAsset) {
          wheelMesh = arenaWorldCarLoaders.createFlatCarWheel(this.flatCarAsset, u, teamColor);
        } else if (arenaWorldCarLoaders.createGameCarWheel && this.gameCarAsset) {
          wheelMesh = arenaWorldCarLoaders.createGameCarWheel(this.gameCarAsset, u, teamColor);
          if (arenaWorldCarLoaders.createGameCarWheelHardware) {
            steerGroup.add(arenaWorldCarLoaders.createGameCarWheelHardware(this.gameCarAsset, u, teamColor));
          }
        } else {
          wheelMesh = new Group();
        }
        spinGroup.add(wheelMesh);
        steerGroup.add(spinGroup);
        carRoot.add(steerGroup);
        wheels.push({ steer: steerGroup, spin: spinGroup });
      }
    }

    this.carWheels.push(wheels);
    this.carWheelSpecs.push(wheelSpecs);
    this.wheelSpin.push([0, 0, 0, 0]);
    this.carSuspension.push([]);
    this.carJets.push(gimbals ? setupCarReactionJets(gimbals) : null);
    this.jumpPrev.push(false);
    this.jumpTimer.push(-1);
    this.flipPrev.push(false);
    this.dodgeBurst.push(0);
    this.dodgeRoll.push(0);
    this.dodgeYaw.push(0);
    this.dodgePitch.push(0);

    const BoostEmitterClass = arenaWorldThreeContext.VehicleBoostEmitter || class {
      setSpatial() {}
      update() {}
      preload() { return Promise.resolve(); }
    };
    const defaultOutlets = OCTANE_BOOST_OUTLETS.map(([x, y, z]) => new Vector3(x, y, z));
    this.carBoosts.push((boostOutlets || defaultOutlets).map((pos, p) => new BoostEmitterClass(this.scene, carRoot, pos, p === 0, isBot)));

    const demoEffect = new DemolitionEffect();
    this.carDemolitions.push(demoEffect);
    if (demoEffect.object) this.scene.add(demoEffect.object);

    this.cars.push(carRoot);
    this.carVisuals.push(visual);
    this.scene.add(carRoot);
    this.markRenderTreeChanged();
  }

  setCarHitboxesVisible(visible) {
    this.carHitboxesVisible = visible;
    for (const h of this.carHitboxes) h.visible = visible;
  }

  prepareBallSpeedTrail(camera) {
    this.ballSpeedTrail?.prepare(camera);
  }

  addPads(padDefs) {
    updateTurfPadDecals(this.turf, padDefs);
    const { markMatrixDirty } = resolveContext();
    this.boostPadSystem.addPads(padDefs, this.padTemplates, this.scene, markMatrixDirty);
    this.pads = this.boostPadSystem.pads;
    this.markRenderTreeChanged();
  }

  /**
   * Performs per-frame 120Hz physics interpolation and visual component updates.
   */
  update(prevState, currState, alpha, delta = 0, throttle = 0, controls, opponentControls, activeVisuals = true) {
    let actualDelta = delta;
    let actualThrottle = throttle;
    let actualControls = controls;
    let actualOpponentControls = opponentControls;

    // Gracefully handle inverted delta/throttle parameter callers
    if (actualDelta > 0.1 && actualThrottle > 0 && actualThrottle < 0.05) {
      actualDelta = throttle;
      actualThrottle = delta;
    }

    this.applyPhys(this.ball, prevState, currState, BUFFER_OFFSETS.BALL, alpha);
    unrealToThreeCoords(this.ballVelocity, currState[BUFFER_OFFSETS.BALL + 12], currState[BUFFER_OFFSETS.BALL + 13], currState[BUFFER_OFFSETS.BALL + 14]);
    this.ballSpeedTrail?.update(this.ball.position, this.ballVelocity, actualDelta);

    const ballPos = this.ball.position;
    this.indicatorRing.position.set(ballPos.x, 2, ballPos.z);
    this.indicatorHeightRing.position.set(ballPos.x, 2, ballPos.z);
    const height = Math.max(0, ballPos.y - this.ballRadius);
    const scale = 0.86 - 0.68 * Math.min(1, height / 1600);
    this.indicatorHeightRing.scale.set(scale, scale, 1);

    const { Vector3 } = resolveContext();
    const axisY = new Vector3(0, 1, 0);

    for (let u = 0; u < this.cars.length; u++) {
      const p = BUFFER_OFFSETS.CARS + u * CAR_STATE_STRIDE;
      if (u >= currState[BUFFER_OFFSETS.NUM_CARS]) {
        this.cars[u].visible = false;
        this.carDemolitions[u]?.update(actualDelta, false, this.cars[u].position, false);
        continue;
      }
      const v = u === 0 ? actualControls : actualOpponentControls;
      const g = u === 0 ? actualThrottle : (actualOpponentControls?.throttle ?? 0);
      const isRespawning = prevState[p + CAR_STATE_OFFSETS.DEMOED] === 1 && currState[p + CAR_STATE_OFFSETS.DEMOED] !== 1;
      this.applyPhys(this.cars[u], isRespawning ? currState : prevState, currState, p, alpha);

      const isAlive = currState[p + CAR_STATE_OFFSETS.DEMOED] !== 1;
      this.carDemolitions[u]?.update(actualDelta, !isAlive, this.cars[u].position, activeVisuals);
      this.cars[u].visible = isAlive;

      const gimbal = this.carGimbals[u];
      if (gimbal && arenaWorldCarLoaders.updateRealisticCockpitGimbal) {
        arenaWorldCarLoaders.updateRealisticCockpitGimbal(
          this.cars[u].quaternion,
          currState[p + CAR_STATE_OFFSETS.VEL],
          currState[p + CAR_STATE_OFFSETS.VEL + 1],
          actualDelta,
          gimbal
        );
      }

      const forwardSpeed = currState[p + CAR_STATE_OFFSETS.VEL] * currState[p + CAR_STATE_OFFSETS.FWD] +
                           currState[p + CAR_STATE_OFFSETS.VEL + 1] * currState[p + CAR_STATE_OFFSETS.FWD + 1] +
                           currState[p + CAR_STATE_OFFSETS.VEL + 2] * currState[p + CAR_STATE_OFFSETS.FWD + 2];

      const wheels = this.carWheels[u];
      const wheelSpecs = this.carWheelSpecs[u];
      const suspension = this.carSuspension[u];
      const spin = this.wheelSpin[u];

      if (wheels && wheelSpecs && spin) {
        for (let R = 0; R < 4; R++) {
          if (!wheelSpecs[R] || !wheels[R]) continue;
          const D = p + CAR_STATE_OFFSETS.WHEELS + R * WHEEL_STATE_STRIDE;
          const susLength = currState[D];
          const steerAngle = currState[D + 1];
          const hasContact = currState[D + 2] === 1;
          const [specX, specZ, wheelRadius] = wheelSpecs[R];
          const restHeight = this.carVisuals[u] === "flat-car" ? 15.75 : 20.755;
          const mountY = restHeight - susLength;

          wheels[R].steer.position.set(specX, mountY, specZ);
          wheels[R].steer.rotation.y = -steerAngle;

          const sus = suspension?.[R];
          if (sus) {
            const pe = new Vector3(0, 0, sus.innerZ - specZ).applyAxisAngle(axisY, -steerAngle).add(new Vector3(specX, mountY, specZ));
            updateSuspensionUnitSpring(sus, pe);
            updateSuspensionArm(sus.armFore, sus.foreRoot, pe);
            updateSuspensionArm(sus.armAft, sus.aftRoot, pe);
          }

          const spinDelta = hasContact ? (forwardSpeed / wheelRadius) : (g * 1410 / wheelRadius);
          spin[R] += spinDelta * actualDelta;
          wheels[R].spin.rotation.z = -spin[R];
        }
      }

      const jets = this.carJets[u];
      if (jets) {
        const inAir = currState[p + CAR_STATE_OFFSETS.ON_GROUND] !== 1 ? 1 : 0;
        const roll = v?.roll ?? 0;
        const yaw = v?.yaw ?? 0;
        const pitch = v?.pitch ?? 0;
        const rollPos = inAir * Math.max(0, roll);
        const rollNeg = inAir * Math.max(0, -roll);
        const yawPos = inAir * Math.max(0, yaw);
        const yawNeg = inAir * Math.max(0, -yaw);
        const isFlipping = currState[p + CAR_STATE_OFFSETS.IS_FLIPPING] === 1;

        if (isFlipping && !this.flipPrev[u]) {
          this.dodgeBurst[u] = 0.22;
          this.dodgeRoll[u] = roll;
          this.dodgeYaw[u] = yaw;
          this.dodgePitch[u] = pitch;
        }
        this.flipPrev[u] = isFlipping;

        let burstFactor = 0;
        if (this.dodgeBurst[u] > 0) {
          this.dodgeBurst[u] -= actualDelta;
          burstFactor = 2 * Math.max(0, this.dodgeBurst[u] / 0.22);
        }

        const bRollPos = burstFactor * Math.max(0, this.dodgeRoll[u]);
        const bRollNeg = burstFactor * Math.max(0, -this.dodgeRoll[u]);
        const bYawPos = burstFactor * Math.max(0, this.dodgeYaw[u]);
        const bYawNeg = burstFactor * Math.max(0, -this.dodgeYaw[u]);
        const bPitchPos = burstFactor * Math.max(0, this.dodgePitch[u]);
        const bPitchNeg = burstFactor * Math.max(0, -this.dodgePitch[u]);

        const rollNet = Math.max(rollNeg, bRollNeg) - Math.max(rollPos, bRollPos);
        this.setJet(jets.roll.fP, Math.max(0, rollNet));
        this.setJet(jets.roll.bP, Math.max(0, rollNet));
        this.setJet(jets.roll.fN, Math.max(0, -rollNet));
        this.setJet(jets.roll.bN, Math.max(0, -rollNet));

        const yawNet = Math.max(yawNeg, bYawNeg) - Math.max(yawPos, bYawPos);
        this.setJet(jets.yaw.fP, Math.max(0, -yawNet));
        this.setJet(jets.yaw.fN, Math.max(0, yawNet));
        this.setJet(jets.yaw.bP, Math.max(0, -yawNet));
        this.setJet(jets.yaw.bN, Math.max(0, yawNet));

        const pitchBackNet = Math.max(inAir * Math.max(0, pitch), bPitchPos) - Math.max(inAir * Math.max(0, -pitch), bPitchNeg);
        this.setJet(jets.pitchBack, Math.max(0, pitchBackNet));
        this.setJet(jets.pitchFront, Math.max(0, -pitchBackNet));

        const isJumping = v?.jump ?? false;
        const isAirInput = inAir === 1 && (roll !== 0 || yaw !== 0 || pitch !== 0);
        if (isJumping && !this.jumpPrev[u] && !isAirInput) {
          this.jumpTimer[u] = 0;
        }
        this.jumpPrev[u] = isJumping;
        if (isFlipping) this.jumpTimer[u] = -1;

        let jumpActive = 0;
        if (this.jumpTimer[u] >= 0) {
          this.jumpTimer[u] += actualDelta;
          const jt = this.jumpTimer[u];
          const upwardVel = currState[p + CAR_STATE_OFFSETS.VEL + 2] > 0 || jt < 0.05;
          if (jt <= 0.2 && upwardVel && (isJumping || jt < 0.07)) {
            jumpActive = 1;
          } else {
            this.jumpTimer[u] = -1;
          }
        }
        this.setJet(jets.jump, jumpActive, 2);
      }
    }

    if (this.opponentSun) {
      this.opponentSun.visible = currState[BUFFER_OFFSETS.NUM_CARS] > 1;
      this.carSun.intensity = this.ballSun.intensity = this.opponentSun.visible ? 2 / 3 : 1;
      this.opponentSun.intensity = 2 / 3;
    }
    this.updateSubjectShadows();
    this.boostPadSystem?.update(currState, BOOST_PAD_OFFSET);
    this.updateBoostVisuals(currState, actualThrottle, actualDelta, actualOpponentControls?.throttle ?? 0, activeVisuals);
  }

  setJet(jet, active, intensity = 1) {
    if (!jet) return;
    if (Array.isArray(jet)) {
      for (const j of jet) this.setJetFlame(j, active, intensity);
      return;
    }
    this.setJetFlame(jet, active, intensity);
  }

  setJetFlame(flame, active, intensity) {
    if (!flame) return;
    flame.visible = active;
    if (active) {
      const s = Math.min(2, intensity);
      flame.scale.set(1 + 0.4 * Math.min(s, 1), (6 + 13 * s), 1 + 0.4 * Math.min(s, 1));
    }
  }

  makeSubjectSun(targetGroup, frustumSize) {
    const { DirectionalLight } = resolveContext();
    const sun = new DirectionalLight(16777215, 1);
    sun.position.set(2500, 4000, 1500);
    sun.castShadow = true;
    sun.target = targetGroup;
    sun.shadow.camera.left = -frustumSize;
    sun.shadow.camera.right = frustumSize;
    sun.shadow.camera.top = frustumSize;
    sun.shadow.camera.bottom = -frustumSize;
    sun.shadow.camera.near = 100;
    sun.shadow.camera.far = 8500;
    return sun;
  }

  updateSubjectShadows() {
    if (this.cars[0]) {
      this.updateSubjectShadow(this.carSun, this.carSunTarget, this.cars[0].position, 260);
    }
    if (this.opponentSun && this.opponentSun.visible && this.cars[1]?.visible) {
      this.updateSubjectShadow(this.opponentSun, this.opponentSunTarget, this.cars[1].position, 260);
    }
    this.updateSubjectShadow(this.ballSun, this.ballSunTarget, this.ball.position, 190);
  }

  updateSubjectShadow(sun, targetGroup, worldPos, frustumSize = 260) {
    const { Vector3 } = resolveContext();
    const shadowDir = new Vector3(2500, 4000, 1500).normalize();
    const shadowX = new Vector3(0, 1, 0).cross(shadowDir).normalize();
    const shadowY = new Vector3().crossVectors(shadowDir, shadowX).normalize();

    const s = frustumSize * 2 / 1024;
    const a = Math.round(worldPos.dot(shadowX) / s) * s;
    const o = Math.round(worldPos.dot(shadowY) / s) * s;
    const A = worldPos.dot(shadowDir);
    this.shadowFocus.copy(shadowX).multiplyScalar(a).addScaledVector(shadowY, o).addScaledVector(shadowDir, A);
    targetGroup.position.copy(this.shadowFocus);
    sun.position.copy(this.shadowFocus).add(new Vector3(2500, 4000, 1500));
    targetGroup.updateMatrixWorld?.();
  }

  updateBoostVisuals(currState, throttle, delta, opponentThrottle = 0, activeVisuals = true) {
    for (let a = 0; a < this.cars.length; a++) {
      const isBoosting = activeVisuals && currState[BUFFER_OFFSETS.CARS + a * CAR_STATE_STRIDE + CAR_STATE_OFFSETS.IS_BOOSTING] === 1;
      const isAudibleActive = a === 0;
      const thr = isAudibleActive ? throttle : opponentThrottle;
      for (const emitter of this.carBoosts[a] ?? []) {
        emitter.setSpatial?.(!isAudibleActive);
        emitter.update?.(isBoosting, activeVisuals && thr > 0.01, this.cars[a].visible, delta, activeVisuals);
      }
    }
  }

  applyPhys(targetMesh, prevState, currState, offset, alpha) {
    unrealToThreeCoords(this.pA, prevState[offset], prevState[offset + 1], prevState[offset + 2]);
    unrealToThreeCoords(this.pB, currState[offset], currState[offset + 1], currState[offset + 2]);
    targetMesh.position.lerpVectors(this.pA, this.pB, alpha);

    unpackBufferQuaternion(this.qA, prevState, offset + 3);
    unpackBufferQuaternion(this.qB, currState, offset + 3);
    targetMesh.quaternion.slerpQuaternions(this.qA, this.qB, alpha);
  }
}

// Backward-compatibility aliases
export {
  loadStadiumContinuousBoundary,
  loadStadiumArchitecture,
  loadStadiumContinuousBoundary as WS,
  loadStadiumArchitecture as JS,
  ArenaWorld as ow,
  createCarHitboxWireframe as RS,
  createCompetitionTurfMesh as GS,
  updateTurfPadDecals as OS,
  createSuspensionUnit as mg,
  createOffroadWheelMesh as gg,
  createSuspensionKnuckle as vg,
  setupCarReactionJets as jg,
  DEFAULT_TEAM_COLORS as xn,
  BUFFER_OFFSETS as ht,
  CAR_STATE_OFFSETS as ye,
  CAR_STATE_STRIDE as ln,
  BOOST_PAD_OFFSET as ro,
  WHEEL_STATE_STRIDE as EC,
  BOT_CAR_INDEX as no
};
