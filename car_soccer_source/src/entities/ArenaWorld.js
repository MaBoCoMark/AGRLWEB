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

import { BoostPadSystem } from './BoostPadSystem.js';
import { BallLocatorArrow, bS } from './BallLocatorArrow.js';
import { SpeedTrail, pS } from './SpeedTrail.js';
import { DemolitionEffect, nS } from './DemolitionEffect.js';
import { loadBallAsset, aS } from './BallVisual.js';
import { HITBOX_PRESETS, createWhiteboxCarModel } from '../ui/GarageDialog.js';
import { onThemeChange } from '../ui/ThemeManager.js';

// Arena Dimensions & Coordinate Constants (Unreal Units)
export const ARENA_WIDTH = 8192;           // Fi
export const ARENA_LENGTH = 10240;         // Di
export const ARENA_GOAL_DEPTH = 5120;      // US
export const TURF_TEXTURE_WIDTH = 2048;    // dr
export const TURF_TEXTURE_HEIGHT = 2560;   // Ri
export const ARENA_BOUNDARY_SPLIT_Y = 280; // ja

export const TEAM_BLUE_HEX = 2844350;      // hi
export const TEAM_ORANGE_HEX = 16750126;   // di
export const DEFAULT_TEAM_COLORS = [3111891, 13857839]; // xn

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

// Physics Buffer Offsets (matching RocketSim C++ Memory Layout)
export const BUFFER_OFFSETS = {
  NUM_CARS: 0,
  BALL: 1,
  CARS: 19
};

export const CAR_STATE_OFFSETS = {
  VEL: 6,
  FWD: 9,
  ON_GROUND: 16,
  IS_FLIPPING: 17,
  IS_BOOSTING: 18,
  BOOST: 19,
  SUPERSONIC: 20,
  DEMOED: 21,
  BALL_HIT_SERIAL: 22,
  WHEELS: 23
};

export const CAR_STATE_STRIDE = 35; // ln
export const BOOST_PAD_OFFSET = 89; // ro
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
  TubeGeometry: null,
  CatmullRomCurve3: null,
  LatheGeometry: null,
  TorusGeometry: null,
  RingGeometry: null,
  CanvasTexture: null,
  MeshStandardMaterial: null,
  MeshBasicMaterial: null,
  ShaderMaterial: null,
  Vector2: null,
  Vector3: null,
  Color: null,
  Quaternion: null,
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
  SRGBColorSpace: 'srgb',
  mergeVertices: null,
  mergeGeometries: null,
  GLTFLoader: null,
  TextureLoader: null,
  OBJLoader: null,
  VehicleBoostEmitter: null,
  multiThemeMaterial: null,
  getThemeMaterial: null,
  cloneMaterial: null,
  markMatrixDirty: null,
  setShadowFlags: null
};

let arenaWorldCarLoaders = {
  loadGameCarAsset: null,
  loadFlatCarAsset: null,
  loadRealisticCarAsset: null,
  createRealisticCarModel: null,
  createRealisticCarGimbals: null,
  assembleRealisticCar: null,
  createGameCarModel: null,
  createFlatCarModel: null,
  getCarVisualTheme: null,
  wheelSpecs: null,
  suspensionSpecs: null,
  hitboxOffsets: null,
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

function resolveContext() {
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
    TubeGeometry: G.TubeGeometry || (typeof THREE !== 'undefined' ? THREE.TubeGeometry : class {
      constructor() {}
      dispose() {}
    }),
    CatmullRomCurve3: G.CatmullRomCurve3 || (typeof THREE !== 'undefined' ? THREE.CatmullRomCurve3 : class {
      constructor(pts = []) { this.points = pts; }
    }),
    LatheGeometry: G.LatheGeometry || (typeof THREE !== 'undefined' ? THREE.LatheGeometry : class {
      constructor(pts = []) { this.points = pts; }
      dispose() {}
    }),
    TorusGeometry: G.TorusGeometry || (typeof THREE !== 'undefined' ? THREE.TorusGeometry : class {
      constructor() {}
      dispose() {}
    }),
    RingGeometry: G.RingGeometry || (typeof THREE !== 'undefined' ? THREE.RingGeometry : class {
      constructor() {}
      dispose() {}
    }),
    CanvasTexture: G.CanvasTexture || (typeof THREE !== 'undefined' ? THREE.CanvasTexture : class {
      constructor(canvas) { this.image = canvas; }
    }),
    MeshStandardMaterial: G.MeshStandardMaterial || (typeof THREE !== 'undefined' ? THREE.MeshStandardMaterial : class {
      constructor(opt = {}) {
        Object.assign(this, opt);
        this.color = new (resolveContext().Color)(opt.color || 0xffffff);
        this.emissive = new (resolveContext().Color)(opt.emissive || 0x000000);
      }
      clone() { return new this.constructor(this); }
      dispose() {}
    }),
    MeshBasicMaterial: G.MeshBasicMaterial || (typeof THREE !== 'undefined' ? THREE.MeshBasicMaterial : class {
      constructor(opt = {}) {
        Object.assign(this, opt);
        this.color = new (resolveContext().Color)(opt.color || 0xffffff);
      }
      clone() { return new this.constructor(this); }
      dispose() {}
    }),
    ShaderMaterial: G.ShaderMaterial || (typeof THREE !== 'undefined' ? THREE.ShaderMaterial : class {
      constructor(opt = {}) {
        Object.assign(this, opt);
        this.uniforms = opt.uniforms || {};
      }
      clone() { return new this.constructor(this); }
      dispose() {}
    }),
    Vector2: G.Vector2 || (typeof THREE !== 'undefined' ? THREE.Vector2 : class {
      constructor(x = 0, y = 0) { this.x = x; this.y = y; }
      set(x, y) { this.x = x; this.y = y; return this; }
    }),
    Vector3: G.Vector3 || (typeof THREE !== 'undefined' ? THREE.Vector3 : class {
      constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
      set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
      copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
      clone() { return new this.constructor(this.x, this.y, this.z); }
      add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
      sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
      multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
      divideScalar(s) { if (s !== 0) { this.x /= s; this.y /= s; this.z /= s; } return this; }
      dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
      cross(v) {
        const ax = this.x, ay = this.y, az = this.z, bx = v.x, by = v.y, bz = v.z;
        this.x = ay * bz - az * by; this.y = az * bx - ax * bz; this.z = ax * by - ay * bx;
        return this;
      }
      crossVectors(a, b) {
        const ax = a.x, ay = a.y, az = a.z, bx = b.x, by = b.y, bz = b.z;
        this.x = ay * bz - az * by; this.y = az * bx - ax * bz; this.z = ax * by - ay * bx;
        return this;
      }
      normalize() {
        const l = Math.hypot(this.x, this.y, this.z);
        if (l > 1e-6) { this.x /= l; this.y /= l; this.z /= l; }
        return this;
      }
      length() { return Math.hypot(this.x, this.y, this.z); }
      distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
      lerpVectors(v1, v2, alpha) {
        this.x = v1.x + (v2.x - v1.x) * alpha;
        this.y = v1.y + (v2.y - v1.y) * alpha;
        this.z = v1.z + (v2.z - v1.z) * alpha;
        return this;
      }
      addScaledVector(v, s) {
        this.x += v.x * s; this.y += v.y * s; this.z += v.z * s;
        return this;
      }
      applyAxisAngle(axis, angle) {
        // Mock rotation around axis
        return this;
      }
    }),
    Color: G.Color || (typeof THREE !== 'undefined' ? THREE.Color : class {
      constructor(hex = 0xffffff) {
        if (typeof hex === 'number') this.setHex(hex);
        else this.r = this.g = this.b = 1;
      }
      setHex(hex) {
        this.r = ((hex >> 16) & 255) / 255;
        this.g = ((hex >> 8) & 255) / 255;
        this.b = (hex & 255) / 255;
        return this;
      }
      getHexString() {
        return Math.floor(this.r * 255).toString(16).padStart(2, '0') +
               Math.floor(this.g * 255).toString(16).padStart(2, '0') +
               Math.floor(this.b * 255).toString(16).padStart(2, '0');
      }
      copy(c) { this.r = c.r; this.g = c.g; this.b = c.b; return this; }
      multiplyScalar(s) { this.r *= s; this.g *= s; this.b *= s; return this; }
    }),
    Quaternion: G.Quaternion || (typeof THREE !== 'undefined' ? THREE.Quaternion : class {
      constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w; }
      set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; }
      copy(q) { this.x = q.x; this.y = q.y; this.z = q.z; this.w = q.w; return this; }
      setFromUnitVectors() { return this; }
      slerpQuaternions(q1, q2, alpha) { return this.copy(q1); }
      invert() { return this; }
    }),
    Scene: G.Scene || (typeof THREE !== 'undefined' ? THREE.Scene : class {
      constructor() {
        this.children = [];
        this.background = null;
        this.fog = null;
        this.environment = null;
      }
      add(...items) { this.children.push(...items); }
      traverse(fn) { fn(this); this.children.forEach(c => c.traverse?.(fn)); }
    }),
    DirectionalLight: G.DirectionalLight || (typeof THREE !== 'undefined' ? THREE.DirectionalLight : class {
      constructor(color, intensity) {
        this.color = new (resolveContext().Color)(color);
        this.intensity = intensity;
        this.position = new (resolveContext().Vector3)();
        this.target = null;
        this.shadow = {
          mapSize: new (resolveContext().Vector2)(1024, 1024),
          camera: {
            left: -100, right: 100, top: 100, bottom: -100,
            near: 10, far: 5000,
            updateProjectionMatrix() {}
          },
          bias: 0,
          normalBias: 0
        };
      }
    }),
    HemisphereLight: G.HemisphereLight || (typeof THREE !== 'undefined' ? THREE.HemisphereLight : class {
      constructor(sky, ground, intensity) {
        this.skyColor = new (resolveContext().Color)(sky);
        this.groundColor = new (resolveContext().Color)(ground);
        this.intensity = intensity;
      }
    }),
    DoubleSide: G.DoubleSide ?? 2,
    BackSide: G.BackSide ?? 1,
    FrontSide: G.FrontSide ?? 0,
    AdditiveBlending: G.AdditiveBlending ?? 2,
    RepeatWrapping: G.RepeatWrapping ?? 1000,
    LinearFilter: G.LinearFilter ?? 1006,
    LinearMipmapLinearFilter: G.LinearMipmapLinearFilter ?? 1008,
    SRGBColorSpace: G.SRGBColorSpace ?? 'srgb',
    mergeVertices: G.mergeVertices || (g => g),
    mergeGeometries: G.mergeGeometries || (arr => arr[0] || null),
    GLTFLoader: (() => {
      try { return G.GLTFLoader || (typeof THREE !== 'undefined' && THREE.GLTFLoader ? THREE.GLTFLoader : class {}); }
      catch { return class {}; }
    })(),
    TextureLoader: G.TextureLoader || (typeof THREE !== 'undefined' && THREE.TextureLoader ? THREE.TextureLoader : class {}),
    OBJLoader: G.OBJLoader || (typeof THREE !== 'undefined' && THREE.OBJLoader ? THREE.OBJLoader : class {}),
    VehicleBoostEmitter: G.VehicleBoostEmitter || class {
      constructor() { this.bloomActive = false; }
      setSpatial() {}
      update() {}
      preload() { return Promise.resolve(); }
    },
    multiThemeMaterial: G.multiThemeMaterial || ((a, b) => a),
    getThemeMaterial: G.getThemeMaterial || ((m) => m),
    cloneMaterial: G.cloneMaterial || ((m) => m),
    markMatrixDirty: G.markMatrixDirty || (() => {}),
    setShadowFlags: G.setShadowFlags || (() => {})
  };
}

/**
 * Coordinate mapping: Converts RocketSim / Unreal Units (X right, Y forward, Z up)
 * to Three.js coordinates (X right, Y up, Z forward).
 */
export function unrealToThreeCoords(target, x, y, z) {
  return target.set(x, z, y);
}

/**
 * Unpacks 4-float quaternion from physics state buffer at offset.
 */
export function unpackBufferQuaternion(target, buffer, offset) {
  return target.set(buffer[offset], buffer[offset + 2], buffer[offset + 1], buffer[offset + 3]);
}

/**
 * Generates procedural wireframe box for visual hitbox debugging.
 */
export function createCarHitboxWireframe(preset = OCTANE_HITBOX_PRESET) {
  const { Group, BoxGeometry, MeshBasicMaterial, Mesh } = resolveContext();
  const boxGeom = new BoxGeometry(preset.length, preset.height, preset.width);
  const boxMat = new MeshBasicMaterial({
    color: 16777215,
    transparent: true,
    opacity: 0.9,
    depthTest: true,
    depthWrite: false,
    wireframe: true
  });
  const hitboxMesh = new Mesh(boxGeom, boxMat);
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

  // Seeded PRNG for turf blade variation
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

  // Outer pitch boundaries & center line
  const halfPitchX = 3500, halfPitchY = 4700;
  ctx.strokeRect(-halfPitchX, -halfPitchY, halfPitchX * 2, halfPitchY * 2);
  drawLine(-halfPitchX, 0, halfPitchX, 0);
  drawArc(0, 0, 915);
  drawArc(0, 0, 23, true);

  // Goal areas and penalty circles
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
 * Stamps boost pad boundary rings and trails directly onto the procedural pitch texture.
 */
export function updateTurfPadDecals(turfGroup, padDefs) {
  const cached = turfDecalCache.get(turfGroup);
  if (!cached || !padDefs || !padDefs.length) return;

  const signature = padDefs.map(d => `${d.pos[0]},${d.pos[1]},${d.isBig}`).join(";");
  for (const item of cached) {
    if (item.padSignature === signature) continue;
    if (typeof document === 'undefined') return;

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

    for (const pad of padDefs) {
      const [px, py] = pad.pos;
      const radius = pad.isBig ? 163 : 69;
      const angle = Math.atan2(-py, -px);
      const teamColor = py < -50 ? "43, 85, 235" : py > 50 ? "255, 120, 30" : "201, 221, 195";

      ctx.strokeStyle = `rgba(${teamColor}, ${pad.isBig ? 0.82 : 0.64})`;
      ctx.lineWidth = pad.isBig ? 18 : 8;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.stroke();
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
 * Creates vehicle offroad wheel procedural mesh with rims, lugs, and tire tread.
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
  const { Group, CylinderGeometry, SphereGeometry, Mesh } = resolveContext();
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
  const { Group, LatheGeometry, MeshStandardMaterial, MeshBasicMaterial, Mesh, Vector2, Vector3 } = resolveContext();
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

/**
 * ArenaWorld (aliased as ow)
 * Central manager for the 3D soccer pitch, ball, vehicles, lights, shadows, and camera targets.
 */
export class ArenaWorld {
  constructor(ballRadius, defaultCarVisual = "game-car") {
    const { Scene, Group, Color, HemisphereLight, DirectionalLight, Vector3, Quaternion, RingGeometry, MeshBasicMaterial, Mesh } = resolveContext();

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
    this.stadiumVisible = false;

    this.scene.background = new Color(4679561);
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
    const ballAsset = await loadBallAsset();
    this.ball.add(ballAsset);
    this.markRenderTreeChanged();
  }

  updateBallLocatorArrow(ballCamActive, carIndex = 0, targetBall = this.ball, targetCar = null) {
    this.ballLocatorArrow.update(targetCar || this.cars[carIndex] || this.cars[0], targetBall || this.ball, ballCamActive);
  }

  async loadCarAndPadAssets() {
    if (arenaWorldCarLoaders.loadGameCarAsset) {
      this.gameCarAsset = await arenaWorldCarLoaders.loadGameCarAsset();
    }
    if (arenaWorldCarLoaders.loadFlatCarAsset) {
      this.flatCarAsset = await arenaWorldCarLoaders.loadFlatCarAsset();
    }
  }

  async loadArena() {
    this.markRenderTreeChanged();
  }

  setStadiumVisible(visible) {
    if (this.stadiumVisible !== visible) {
      this.stadiumVisible = visible;
      if (this.stadium) {
        visible ? this.scene.add(this.stadium) : this.stadium.removeFromParent();
      }
      if (this.sky && !this.sky.parent) {
        this.scene.add(this.sky);
      }
      this.markRenderTreeChanged();
    }
  }

  async ensureOpponent() {
    if (this.cars.length <= 1) {
      if (!this.gameCarAsset && arenaWorldCarLoaders.loadGameCarAsset) {
        this.gameCarAsset = await arenaWorldCarLoaders.loadGameCarAsset();
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
    const { Group, Vector3, Mesh } = resolveContext();
    const carRoot = new Group();
    const isBot = this.cars.length === BOT_CAR_INDEX;
    const isHitbox = visual.startsWith("hitbox-");
    const teamColor = arenaWorldCarLoaders.teamColors?.[teamIndex] ?? DEFAULT_TEAM_COLORS[teamIndex % 2];

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
    } else {
      let carModel;
      if (visual === "flat-car" && arenaWorldCarLoaders.createFlatCarModel && this.flatCarAsset) {
        carModel = arenaWorldCarLoaders.createFlatCarModel(this.flatCarAsset, teamColor);
      } else if (arenaWorldCarLoaders.createGameCarModel && this.gameCarAsset) {
        carModel = arenaWorldCarLoaders.createGameCarModel(this.gameCarAsset, teamColor);
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
    }

    const wheels = [];
    this.carWheels.push(wheels);
    this.carWheelSpecs.push([]);
    this.wheelSpin.push([0, 0, 0, 0]);
    this.carSuspension.push([]);
    this.carJets.push(null);
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
    this.carBoosts.push([new BoostEmitterClass(this.scene, carRoot, new Vector3(0, 10, -50), true, isBot)]);

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
    this.boostPadSystem.addPads(padDefs, this.padTemplates, this.scene);
    this.pads = this.boostPadSystem.pads;
    this.markRenderTreeChanged();
  }

  update(prevState, currState, alpha, throttle = 0, delta = 0, opponentControls, controls, activeVisuals = true) {
    this.applyPhys(this.ball, prevState, currState, BUFFER_OFFSETS.BALL, alpha);
    unrealToThreeCoords(this.ballVelocity, currState[BUFFER_OFFSETS.BALL + 12], currState[BUFFER_OFFSETS.BALL + 13], currState[BUFFER_OFFSETS.BALL + 14]);
    this.ballSpeedTrail?.update(this.ball.position, this.ballVelocity, delta);

    const ballPos = this.ball.position;
    this.indicatorRing.position.set(ballPos.x, 2, ballPos.z);
    this.indicatorHeightRing.position.set(ballPos.x, 2, ballPos.z);
    const height = Math.max(0, ballPos.y - this.ballRadius);
    const scale = 0.86 - 0.68 * Math.min(1, height / 1600);
    this.indicatorHeightRing.scale.set(scale, scale, 1);

    for (let u = 0; u < this.cars.length; u++) {
      const p = BUFFER_OFFSETS.CARS + u * CAR_STATE_STRIDE;
      if (u >= currState[BUFFER_OFFSETS.NUM_CARS]) {
        this.cars[u].visible = false;
        this.carDemolitions[u]?.update(delta, false, this.cars[u].position, false);
        continue;
      }
      const isAlive = currState[p + CAR_STATE_OFFSETS.DEMOED] !== 1;
      this.applyPhys(this.cars[u], prevState, currState, p, alpha);
      this.carDemolitions[u]?.update(delta, !isAlive, this.cars[u].position, activeVisuals);
      this.cars[u].visible = isAlive;
    }

    if (this.opponentSun) {
      this.opponentSun.visible = currState[BUFFER_OFFSETS.NUM_CARS] > 1;
      this.carSun.intensity = this.ballSun.intensity = this.opponentSun.visible ? 2 / 3 : 1;
      this.opponentSun.intensity = 2 / 3;
    }
    this.updateSubjectShadows();
    this.boostPadSystem.update(currState, BOOST_PAD_OFFSET);
    this.updateBoostVisuals(currState, throttle, delta, opponentControls?.throttle ?? 0, activeVisuals);
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
    const { DirectionalLight, Vector3 } = resolveContext();
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

  updateSubjectShadow(sun, targetGroup, worldPos) {
    targetGroup.position.copy(worldPos);
    sun.position.set(worldPos.x + 2500, worldPos.y + 4000, worldPos.z + 1500);
  }

  updateBoostVisuals(currState, throttle, delta, opponentThrottle = 0, isAudibleActive = true) {
    for (let a = 0; a < this.cars.length; a++) {
      const isBoosting = currState[BUFFER_OFFSETS.CARS + a * CAR_STATE_STRIDE + CAR_STATE_OFFSETS.IS_BOOSTING] === 1;
      const isActiveCar = a === 0;
      for (const emitter of this.carBoosts[a]) {
        emitter.setSpatial?.(!isActiveCar);
        emitter.update?.(isBoosting, (isActiveCar ? throttle : opponentThrottle) > 0.01, this.cars[a].visible, delta, isAudibleActive);
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
  ArenaWorld as ow,
  createCarHitboxWireframe as RS,
  createCompetitionTurfMesh as GS,
  updateTurfPadDecals as OS,
  createSuspensionUnit as mg,
  createOffroadWheelMesh as gg,
  createSuspensionKnuckle as vg,
  setupCarReactionJets as jg
};
