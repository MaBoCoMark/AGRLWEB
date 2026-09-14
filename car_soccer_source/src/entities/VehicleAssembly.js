/**
 * Car Soccer Vehicle Assembly Subsystem
 *
 * Implements model loading, geometry separation, procedural paint shaders,
 * procedural space-frame buggy generation, dynamic cockpit gimbal orientation,
 * and 3D turntable showcase assembly for Octane, Dominus (flat car), and realistic vehicles.
 *
 * Ground truth mappings from dist_game:
 * - Uh -> loadGameCarAsset
 * - Y0 -> loadFlatCarAsset
 * - og -> loadRealisticCarAsset
 * - z0 -> createGameCarModel
 * - Z0 -> createFlatCarModel
 * - V0 -> createGameCarWheel
 * - W0 -> createGameCarWheelHardware
 * - Q0 -> createFlatCarWheel
 * - Yb -> detachOctaneWheelHardware
 * - Jb -> getOctaneTransformMatrix
 * - Kb -> findMeshByMaterialName
 * - np -> findMeshObjectByName
 * - ul -> createCarPaintMaterial
 * - ip -> mapVehicleMaterial
 * - fl -> applyVehicleMaterials
 * - $0 -> cloneVehicleMeshWithPaint
 * - r1 -> getCarVisualTheme
 * - sg -> createRealisticCarModel
 * - rg -> createRealisticCarGimbals
 * - Ag -> assembleRealisticCar
 * - h1 -> updateRealisticCockpitGimbal
 * - dp -> lerpPolyline
 * - FM -> alignCylinderBetweenPoints
 * - DM -> updateSuspensionUnitSpring
 * - NM -> loadRealisticCarShowcase
 * - GM -> loadGameCarShowcase
 * - OM -> loadFlatCarShowcase
 */

const DEFAULT_TEAM_COLORS = [3111891, 13857839]; // xn

// --- Octane (Game Car) Constants ---
export const OCTANE_SCALE = 105; // Ir
export const OCTANE_SCALE_X = 0.951984748575128; // G0
export const OCTANE_OFFSET_X = 3.3438630034881425; // O0
export const OCTANE_OFFSET_Y = -15; // H0

export const OCTANE_WHEEL_NAMES = [
  "wheel-front-right",
  "wheel-front-left",
  "wheel-rear-right",
  "wheel-rear-left"
]; // U0

export const OCTANE_ASSET_WHEEL_NAMES = [
  "wheel-front-left",
  "wheel-front-right",
  "wheel-rear-left",
  "wheel-rear-right"
]; // Vb

export const OCTANE_WHEEL_COORDS = [
  [48.8139, 26.9291, 12.5],
  [48.8139, -26.9291, 12.5],
  [-36.5145, 28.6221, 15],
  [-36.5145, -28.622, 15]
]; // q0

export const OCTANE_BOOST_OUTLETS = [
  [-57, 10.25, 20.4278],
  [-57, 10.25, -20.4278]
]; // Wb

export const OCTANE_DEFAULT_COLORS = {
  primary: 16743716,
  realisticPrimary: 16555020,
  pearl: 16724660
}; // Zb

// --- Flat Car (Dominus) Constants ---
export const FLAT_CAR_DEFAULT_COLORS = {
  primary: 821500,
  pearl: 9306290
}; // $d

export const FLAT_CAR_BOT_COLORS = {
  primary: 16743716,
  realisticPrimary: 13857839,
  pearl: 16760939
}; // n1

export const FLAT_CAR_HITBOX_OFFSET = {
  length: 130.427,
  width: 85.7799,
  height: 33.8,
  forward: 9,
  up: 15.75
}; // Qb

export const FLAT_CAR_WHEEL_COORDS = [
  [50.3, 31.1, 12],
  [50.3, -31.1, 12],
  [-34.75, 33, 13.5],
  [-34.75, -33, 13.5]
]; // X0

export const FLAT_CAR_SUSPENSION_HEIGHTS = [-6.2, -6.2, -6.1, -6.1]; // J0

export const FLAT_CAR_BOOST_OUTLETS = [
  [-57.16878128051758, 9.5, 5.489756107330322],
  [-57.16878128051758, 9.5, -5.489756107330322]
]; // t1

export const FLAT_CAR_WHEEL_NAMES = [
  "wheel-front-right",
  "wheel-front-left",
  "wheel-rear-right",
  "wheel-rear-left"
]; // K0

// --- Realistic Car Constants ---
export const REALISTIC_WHEEL_COORDS = [
  [63.88, 34, 13],
  [63.88, -34, 13],
  [-36.12, 34, 16],
  [-36.12, -34, 16]
]; // VA

export const REALISTIC_SUSPENSION_Z = 17; // zA
export const REALISTIC_TIRE_WIDTH = 16;   // Wd

export const REALISTIC_DIMENSIONS = {
  length: 120.507, // eg
  width: 86.6994,  // tg
  height: 38.6591, // ng
  centerForward: 13.8757, // zd
  centerUp: 20.755,       // Vd
  gimbalOuterRadius: 22,  // fc
  gimbalInnerRadius: 20,  // i1
  gimbalCenterX: 8.8757,  // xA = zd - 5
  gimbalCenterY: 15.755,  // CA = Vd - 5
  minSteerVelocity: 100,  // s1
  seatYawRate: 5.5        // a1
};

export const REALISTIC_DETAIL_NAMES = [
  "frame-details",
  "fixed-details",
  "roll-details",
  "cradle-details",
  "seat-details"
]; // ag

export const DEFAULT_PLAYER_TEAM_INDEX = 0; // Ni

// --- Context & Dependency Injection ---
let vehicleAssemblyThreeContext = {};

export function setVehicleAssemblyThreeContext(context) {
  if (!context) return;
  const descriptors = Object.getOwnPropertyDescriptors(context);
  Object.defineProperties(vehicleAssemblyThreeContext, descriptors);
}

function resolveContext() {
  const G = vehicleAssemblyThreeContext;
  return {
    Object3D: G.Object3D || (typeof THREE !== "undefined" ? THREE.Object3D : (G.Group || class FallbackObject3D {
      constructor() {
        this.children = [];
        this.name = "";
        this.visible = true;
        this.parent = null;
      }
      remove(c) {
        const idx = this.children.indexOf(c);
        if (idx !== -1) { c.parent = null; this.children.splice(idx, 1); }
      }
      removeFromParent() {
        if (this.parent && typeof this.parent.remove === "function") this.parent.remove(this);
        return this;
      }
    })),
    Group: G.Group || (typeof THREE !== 'undefined' ? THREE.Group : class {
      constructor() {
        this.children = [];
        this.name = '';
        this.visible = true;
        this.position = new (resolveContext().Vector3)();
        this.quaternion = new (resolveContext().Quaternion)();
        this.scale = new (resolveContext().Vector3)(1, 1, 1);
        this.rotation = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
      }
      add(...items) {
        for (const item of items) {
          if (item && item !== this) {
            if (item.parent && typeof item.parent.remove === "function") {
              item.parent.remove(item);
            }
            item.parent = this;
            this.children.push(item);
          }
        }
      }
      remove(...items) {
        for (const item of items) {
          const idx = this.children.indexOf(item);
          if (idx !== -1) {
            item.parent = null;
            this.children.splice(idx, 1);
          }
        }
      }
      removeFromParent() {
        if (this.parent && typeof this.parent.remove === "function") {
          this.parent.remove(this);
        }
        return this;
      }
      traverse(fn) { fn(this); this.children.forEach(c => c.traverse?.(fn)); }
      getObjectByName(name) {
        if (this.name === name) return this;
        for (const child of this.children) {
          const res = child.getObjectByName ? child.getObjectByName(name) : (child.name === name ? child : null);
          if (res) return res;
        }
        return null;
      }
      clone(deep = true) {
        const c = new (resolveContext().Group)();
        c.name = this.name;
        if (deep) c.children = this.children.map(ch => ch.clone ? ch.clone(true) : ch);
        return c;
      }
      updateMatrixWorld() {}
    }),
    Mesh: G.Mesh || (typeof THREE !== 'undefined' ? THREE.Mesh : class {
      constructor(geo, mat) {
        this.isMesh = true;
        this.geometry = geo;
        this.material = mat;
        this.children = [];
        this.name = '';
        this.visible = true;
        this.userData = {};
        this.position = new (resolveContext().Vector3)();
        this.quaternion = new (resolveContext().Quaternion)();
        this.scale = new (resolveContext().Vector3)(1, 1, 1);
        this.rotation = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
        this.castShadow = false;
        this.receiveShadow = false;
      }
      add(...items) { this.children.push(...items); }
      traverse(fn) { fn(this); this.children.forEach(c => c.traverse?.(fn)); }
      getObjectByName(name) {
        if (this.name === name) return this;
        for (const child of this.children) {
          const res = child.getObjectByName ? child.getObjectByName(name) : (child.name === name ? child : null);
          if (res) return res;
        }
        return null;
      }
      clone(deep = true) {
        const c = new (resolveContext().Mesh)(this.geometry, this.material);
        c.name = this.name;
        c.userData = { ...this.userData };
        if (deep) c.children = this.children.map(ch => ch.clone ? ch.clone(true) : ch);
        return c;
      }
      getWorldPosition(target) { return target.copy(this.position); }
      updateMatrixWorld() {}
    }),
    BoxGeometry: G.BoxGeometry || (typeof THREE !== 'undefined' ? THREE.BoxGeometry : class {
      constructor(w = 1, h = 1, d = 1) { this.w = w; this.h = h; this.d = d; }
      dispose() {}
    }),
    CylinderGeometry: G.CylinderGeometry || (typeof THREE !== 'undefined' ? THREE.CylinderGeometry : class {
      constructor(rt = 1, rb = 1, h = 1, s = 8) { this.rt = rt; this.rb = rb; this.h = h; this.s = s; }
      dispose() {}
    }),
    SphereGeometry: G.SphereGeometry || (typeof THREE !== 'undefined' ? THREE.SphereGeometry : class {
      constructor(r = 1) { this.r = r; }
      dispose() {}
    }),
    TorusGeometry: G.TorusGeometry || (typeof THREE !== 'undefined' ? THREE.TorusGeometry : class {
      constructor(r = 1, t = 0.4) { this.r = r; this.t = t; }
      dispose() {}
    }),
    LatheGeometry: G.LatheGeometry || (typeof THREE !== 'undefined' ? THREE.LatheGeometry : class {
      constructor(points = [], segments = 12) { this.points = points; this.segments = segments; }
      dispose() {}
    }),
    TubeGeometry: G.TubeGeometry || (typeof THREE !== 'undefined' ? THREE.TubeGeometry : class {
      constructor(path, segments = 64, radius = 1) { this.path = path; this.segments = segments; this.radius = radius; }
      dispose() {}
    }),
    CatmullRomCurve3: G.CatmullRomCurve3 || (typeof THREE !== 'undefined' ? THREE.CatmullRomCurve3 : class {
      constructor(points = [], closed = false, curveType = 'centripetal') {
        this.points = points;
        this.closed = closed;
        this.curveType = curveType;
      }
    }),
    BufferGeometry: G.BufferGeometry || (typeof THREE !== 'undefined' ? THREE.BufferGeometry : class {
      constructor() { this.attributes = {}; this.userData = {}; }
      setAttribute(k, v) { this.attributes[k] = v; }
      getAttribute(k) { return this.attributes[k]; }
      deleteAttribute(k) { delete this.attributes[k]; }
      setIndex(idx) {
        this.index = Array.isArray(idx) ? { count: idx.length, array: idx, getX: i => idx[i] } : idx;
      }
      setFromPoints(pts) { return this; }
      computeBoundingBox() {}
      computeBoundingSphere() {}
      computeVertexNormals() {}
      clone() {
        const c = new (resolveContext().BufferGeometry)();
        c.attributes = { ...this.attributes };
        c.index = this.index;
        return c;
      }
      dispose() {}
    }),
    BufferAttribute: G.BufferAttribute || (typeof THREE !== 'undefined' ? THREE.BufferAttribute : class {
      constructor(arr, itemSize) {
        this.array = arr;
        this.itemSize = itemSize;
        this.count = arr ? arr.length / itemSize : 0;
      }
      getX(i) { return this.array[i * this.itemSize]; }
      getY(i) { return this.array[i * this.itemSize + 1]; }
      getZ(i) { return this.array[i * this.itemSize + 2]; }
    }),
    EdgesGeometry: G.EdgesGeometry || (typeof THREE !== 'undefined' ? THREE.EdgesGeometry : class {
      constructor(geo) { this.geo = geo; }
      dispose() {}
    }),
    LineSegments: G.LineSegments || (typeof THREE !== 'undefined' ? THREE.LineSegments : class {
      constructor(geo, mat) {
        this.geometry = geo;
        this.material = mat;
        this.position = new (resolveContext().Vector3)();
        this.visible = true;
      }
    }),
    LineBasicMaterial: G.LineBasicMaterial || (typeof THREE !== 'undefined' ? THREE.LineBasicMaterial : class {
      constructor(params = {}) { Object.assign(this, params); }
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
      length() { return Math.hypot(this.x, this.y, this.z); }
      lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
      normalize() { const l = this.length(); return l ? this.divideScalar(l) : this; }
      min(v) { this.x = Math.min(this.x, v.x); this.y = Math.min(this.y, v.y); this.z = Math.min(this.z, v.z); return this; }
      max(v) { this.x = Math.max(this.x, v.x); this.y = Math.max(this.y, v.y); this.z = Math.max(this.z, v.z); return this; }
      lerp(v, t) { this.x += (v.x - this.x) * t; this.y += (v.y - this.y) * t; this.z += (v.z - this.z) * t; return this; }
      applyMatrix4(m) { if (m && m.elements) { const e = m.elements; const x = this.x, y = this.y, z = this.z; const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]); this.x = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w; this.y = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w; this.z = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w; } return this; }
      applyNormalMatrix(m) { return this; }
      applyQuaternion(q) { return this; }
      fromBufferAttribute(attr, idx) {
        if (!attr) return this;
        this.x = attr.getX ? attr.getX(idx) : attr.array[idx * 3];
        this.y = attr.getY ? attr.getY(idx) : attr.array[idx * 3 + 1];
        this.z = attr.getZ ? attr.getZ(idx) : attr.array[idx * 3 + 2];
        return this;
      }
      toArray(arr = [], offset = 0) { arr[offset] = this.x; arr[offset + 1] = this.y; arr[offset + 2] = this.z; return arr; }
    }),
    Quaternion: G.Quaternion || (typeof THREE !== 'undefined' ? THREE.Quaternion : class {
      constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w; }
      set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; }
      copy(q) { this.x = q.x; this.y = q.y; this.z = q.z; this.w = q.w; return this; }
      clone() { return new (resolveContext().Quaternion)(this.x, this.y, this.z, this.w); }
      invert() { this.x = -this.x; this.y = -this.y; this.z = -this.z; return this; }
      setFromUnitVectors(u, v) { return this; }
      setFromRotationMatrix(m) { return this; }
    }),
    Matrix3: G.Matrix3 || (typeof THREE !== 'undefined' ? THREE.Matrix3 : class {
      constructor() { this.elements = [1, 0, 0, 0, 1, 0, 0, 0, 1]; }
      getNormalMatrix(m4) { return this; }
    }),
    Matrix4: G.Matrix4 || (typeof THREE !== 'undefined' ? THREE.Matrix4 : class {
      constructor() { this.elements = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
      compose(pos, quat, scale) {
        this.elements[12] = pos.x; this.elements[13] = pos.y; this.elements[14] = pos.z;
        this.elements[0] = scale.x; this.elements[5] = scale.y; this.elements[10] = scale.z;
        return this;
      }
      makeScale(x, y, z) {
        this.elements = [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];
        return this;
      }
      multiply(m) { return this; }
      clone() { const c = new (resolveContext().Matrix4)(); c.elements = [...this.elements]; return c; }
    }),
    Color: G.Color || (typeof THREE !== 'undefined' ? THREE.Color : class {
      constructor(val = 0) { this.value = val; }
      setHex(val) { this.value = val; return this; }
    }),
    DoubleSide: G.DoubleSide ?? 2,
    GLTFLoader: G.GLTFLoader || class {
      loadAsync() { return Promise.resolve({ scene: new (resolveContext().Group)() }); }
    },
    multiThemeMaterial: G.multiThemeMaterial || ((m1, m2) => m1),
    getThemeMaterial: G.getThemeMaterial || ((m, mode) => m),
    cloneMaterial: G.cloneMaterial || ((m) => ({ ...m })),
    markMatrixDirty: G.markMatrixDirty || (() => {}),
    setShadowFlags: G.setShadowFlags || (() => {}),
    MathUtils: G.MathUtils || (typeof THREE !== 'undefined' ? THREE.MathUtils : {
      clamp: (x, min, max) => Math.max(min, Math.min(max, x)),
      lerp: (x, y, t) => x + (y - x) * t
    })
  };
}

// --- Asset Cache Singletons ---
let cachedGameCarAsset = null; // rA
let cachedFlatCarAsset = null; // pa
let cachedRealisticCarAsset = null; // ma
const carPaintCache = new Map(); // rp

/**
 * Finds a child Object3D by name, throwing if absent.
 */
export function findMeshObjectByName(root, name) {
  const obj = root.getObjectByName?.(name);
  if (!obj) throw new Error(`Game car asset is missing "${name}"`);
  return obj;
}

/**
 * Traverses root to locate the first Mesh matching material name.
 */
export function findMeshByMaterialName(root, matName) {
  let result = null;
  root.traverse?.(node => {
    if (result || !(node.isMesh || node.material)) return;
    const mats = Array.isArray(node.material) ? node.material : [node.material];
    if (mats.some(m => m && m.name === matName)) result = node;
  });
  if (!result) throw new Error(`Game car asset is missing material "${matName}"`);
  return result;
}

/**
 * Computes root transform matrix for the Octane GLTF chassis.
 */
export function getOctaneTransformMatrix(resolveContextFn = resolveContext) {
  const { Matrix4, Vector3, Quaternion } = resolveContextFn();
  const m = new Matrix4().compose(
    new Vector3(OCTANE_OFFSET_X / OCTANE_SCALE, OCTANE_OFFSET_Y / OCTANE_SCALE, 0),
    new Quaternion(),
    new Vector3(OCTANE_SCALE_X, 1, 1)
  );
  return new Matrix4().makeScale(OCTANE_SCALE, OCTANE_SCALE, OCTANE_SCALE).multiply(m);
}

/**
 * Disjoint Set Union (DSU) algorithm that partitions the Octane "lower-detail" geometry
 * into body chassis details and 4 detachable wheel hardware assemblies.
 */
export function detachOctaneWheelHardware(bodyMesh, wheelMeshes, resolveContextFn = resolveContext) {
  const { Matrix4, Matrix3, Vector3, BufferGeometry, BufferAttribute, Mesh } = resolveContextFn();
  const lowerDetailMesh = findMeshByMaterialName(bodyMesh, "lower-detail");
  const geom = lowerDetailMesh.geometry;
  const posAttr = geom.getAttribute("position");
  const normAttr = geom.getAttribute("normal");
  const indexAttr = geom.index;
  if (!indexAttr) throw new Error("Game car lower detail must be indexed");

  const parentDSU = new Int32Array(posAttr.count);
  for (let i = 0; i < parentDSU.length; i++) parentDSU[i] = i;

  const findRoot = (x) => {
    let curr = x;
    while (parentDSU[curr] !== curr) curr = parentDSU[curr];
    let trace = x;
    while (trace !== curr) {
      const next = parentDSU[trace];
      parentDSU[trace] = curr;
      trace = next;
    }
    return curr;
  };

  const unionRoots = (a, b) => {
    const rootA = findRoot(a);
    const rootB = findRoot(b);
    if (rootA !== rootB) parentDSU[rootB] = rootA;
  };

  for (let i = 0; i < indexAttr.count; i += 3) {
    const a = indexAttr.getX ? indexAttr.getX(i) : indexAttr.array[i];
    const b = indexAttr.getX ? indexAttr.getX(i + 1) : indexAttr.array[i + 1];
    const c = indexAttr.getX ? indexAttr.getX(i + 2) : indexAttr.array[i + 2];
    unionRoots(a, b);
    unionRoots(b, c);
  }

  const transformMat = getOctaneTransformMatrix(resolveContextFn);
  bodyMesh.updateWorldMatrix?.(true, true);
  const worldMat = transformMat.clone().multiply(lowerDetailMesh.matrixWorld || new Matrix4());
  const normalMat = new Matrix3().getNormalMatrix(worldMat);

  const tmpVec = new Vector3();
  const tmpNorm = new Vector3();
  const wheelWorldPositions = wheelMeshes.map(w => {
    const pos = w.getWorldPosition ? w.getWorldPosition(new Vector3()) : (w.position?.clone() || new Vector3());
    return pos.applyMatrix4(transformMat);
  });

  const clusters = new Map();
  for (let i = 0; i < indexAttr.count; i += 3) {
    const a = indexAttr.getX ? indexAttr.getX(i) : indexAttr.array[i];
    const root = findRoot(a);
    let cluster = clusters.get(root);
    if (!cluster) {
      cluster = {
        indices: [],
        min: new Vector3(Infinity, Infinity, Infinity),
        max: new Vector3(-Infinity, -Infinity, -Infinity)
      };
      clusters.set(root, cluster);
    }
    for (let s = 0; s < 3; s++) {
      const idx = indexAttr.getX ? indexAttr.getX(i + s) : indexAttr.array[i + s];
      cluster.indices.push(idx);
      if (tmpVec.fromBufferAttribute) {
        tmpVec.fromBufferAttribute(posAttr, idx).applyMatrix4(worldMat);
      } else {
        tmpVec.set(posAttr.array[idx * 3], posAttr.array[idx * 3 + 1], posAttr.array[idx * 3 + 2]).applyMatrix4(worldMat);
      }
      cluster.min.min(tmpVec);
      cluster.max.max(tmpVec);
    }
  }

  const wheelClusterIndices = wheelWorldPositions.map(() => []);
  const bodyRemainingIndices = [];

  for (const cluster of clusters.values()) {
    const center = cluster.min.clone().add(cluster.max).multiplyScalar(0.5);
    const size = cluster.max.clone().sub(cluster.min);
    const matchedWheel = wheelWorldPositions.findIndex(wheelPos =>
      Math.abs(center.x - wheelPos.x) < 9 &&
      Math.sign(center.z) === Math.sign(wheelPos.z) &&
      Math.abs(center.z - wheelPos.z) < 14 &&
      cluster.max.y < wheelPos.y + 9.5 &&
      cluster.min.y > wheelPos.y - 9 &&
      size.x < 16 &&
      size.z < 18
    );
    if (matchedWheel >= 0) {
      wheelClusterIndices[matchedWheel].push(...cluster.indices);
    } else {
      bodyRemainingIndices.push(...cluster.indices);
    }
  }

  const prunedGeom = geom.clone ? geom.clone() : geom;
  if (prunedGeom.setIndex) {
    prunedGeom.setIndex(bodyRemainingIndices);
  }
  lowerDetailMesh.geometry = prunedGeom;

  return wheelWorldPositions.map((wheelPos, wheelIdx) => {
    const indices = wheelClusterIndices[wheelIdx];
    if (indices.length === 0) {
      throw new Error(`Game car wheel ${wheelIdx} has no detachable hardware`);
    }
    const positions = new Float32Array(indices.length * 3);
    const normals = new Float32Array(indices.length * 3);

    for (let t = 0; t < indices.length; t++) {
      const vertIdx = indices[t];
      if (tmpVec.fromBufferAttribute) {
        tmpVec.fromBufferAttribute(posAttr, vertIdx).applyMatrix4(worldMat).sub(wheelPos);
      } else {
        tmpVec.set(posAttr.array[vertIdx * 3], posAttr.array[vertIdx * 3 + 1], posAttr.array[vertIdx * 3 + 2]).applyMatrix4(worldMat).sub(wheelPos);
      }
      tmpVec.toArray(positions, t * 3);

      if (normAttr) {
        if (tmpNorm.fromBufferAttribute) {
          tmpNorm.fromBufferAttribute(normAttr, vertIdx).applyNormalMatrix(normalMat).normalize();
        } else {
          tmpNorm.set(normAttr.array[vertIdx * 3], normAttr.array[vertIdx * 3 + 1], normAttr.array[vertIdx * 3 + 2]).applyNormalMatrix(normalMat).normalize();
        }
        tmpNorm.toArray(normals, t * 3);
      }
    }

    const hardwareGeom = new BufferGeometry();
    hardwareGeom.setAttribute("position", new BufferAttribute(positions, 3));
    if (normAttr) {
      hardwareGeom.setAttribute("normal", new BufferAttribute(normals, 3));
    } else {
      hardwareGeom.computeVertexNormals?.();
    }
    hardwareGeom.computeBoundingBox?.();
    hardwareGeom.computeBoundingSphere?.();

    const hardwareMesh = new Mesh(hardwareGeom, lowerDetailMesh.material);
    hardwareMesh.name = `${OCTANE_WHEEL_NAMES[wheelIdx]}-hardware`;
    return hardwareMesh;
  });
}

/**
 * Loads Octane model from /assets/game-car/model.gltf
 */
export async function loadGameCarAsset(resolveContextFn = resolveContext) {
  if (cachedGameCarAsset) return cachedGameCarAsset;
  const { GLTFLoader } = resolveContextFn();
  if (!GLTFLoader) return null;
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync("/assets/game-car/model.gltf");
  gltf.scene.updateMatrixWorld?.(true);

  const body = findMeshObjectByName(gltf.scene, "game-car-body");
  const wheels = OCTANE_ASSET_WHEEL_NAMES.map(name => findMeshObjectByName(gltf.scene, name));
  const wheelHardware = detachOctaneWheelHardware(body, wheels, resolveContextFn);

  cachedGameCarAsset = {
    body,
    wheels,
    wheelHardware
  };
  return cachedGameCarAsset;
}

/**
 * Creates dual-theme vehicle paint and hardware materials.
 * Includes realistic anodized pearl clearcoat shader and arcade toon material.
 */
export function createCarPaintMaterial(teamColor, options = OCTANE_DEFAULT_COLORS, resolveContextFn = resolveContext) {
  let realResolveContext = (typeof resolveContextFn === "function") ? resolveContextFn : resolveContext;
  let opts = options;
  let color = teamColor;

  if (typeof options === "function") {
    realResolveContext = options;
    opts = OCTANE_DEFAULT_COLORS;
  } else if (typeof teamColor === "function") {
    realResolveContext = teamColor;
    color = undefined;
    opts = OCTANE_DEFAULT_COLORS;
  }

  if (typeof color === "number" && (!opts || opts === OCTANE_DEFAULT_COLORS)) {
    opts = { primary: color, realisticPrimary: color, pearl: color };
  } else if (typeof color === "object" && color !== null && (!opts || opts === OCTANE_DEFAULT_COLORS)) {
    opts = color;
  }
  if (!opts) opts = OCTANE_DEFAULT_COLORS;

  const primary = opts.primary;
  const realisticPrimary = opts.realisticPrimary ?? primary;
  const pearl = opts.pearl ?? primary;
  const cacheKey = `${primary}/${realisticPrimary}/${pearl}`;

  const cached = carPaintCache.get(cacheKey);
  if (cached) return cached;

  const ctx = realResolveContext();
  const {
    Color,
    MeshPhysicalMaterial,
    MeshStandardMaterial,
    MeshBasicMaterial,
    multiThemeMaterial,
    cloneMaterial
  } = ctx;

  const pearlColor = new Color(pearl);
  const realisticPearlPaint = new MeshPhysicalMaterial({
    name: "Realistic / anodized pearl paint",
    color: realisticPrimary,
    roughness: 0.17,
    metalness: 0.76,
    clearcoat: 1,
    clearcoatRoughness: 0.11,
    sheen: 0.7,
    sheenColor: pearlColor,
    sheenRoughness: 0.24,
    envMapIntensity: 1.4
  });

  realisticPearlPaint.onBeforeCompile = (shader) => {
    shader.uniforms.pearlColor = { value: pearlColor };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        float pearlFresnel = pow(
          1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 1.35
        );
        float pearlBlend = 0.82 * smoothstep(0.12, 0.72, pearlFresnel);
        diffuseColor.rgb = mix(diffuseColor.rgb, pearlColor, pearlBlend);`
      )
      .replace(
        "uniform vec3 diffuse;",
        `uniform vec3 diffuse;\nuniform vec3 pearlColor;`
      );
  };
  realisticPearlPaint.customProgramCacheKey = () => "game-car-anodized-pearl";

  const arcadePaint = cloneMaterial ? cloneMaterial({
    name: "Arcade / body paint",
    color: primary
  }) : new MeshStandardMaterial({
    name: "Arcade / body paint",
    color: primary
  });

  const bodyMaterial = (typeof multiThemeMaterial === "function")
    ? multiThemeMaterial(arcadePaint, realisticPearlPaint)
    : realisticPearlPaint;

  const arcadeWheelMetal = cloneMaterial ? cloneMaterial({ color: 3754339 }) : new MeshStandardMaterial({ color: 3754339 });
  const realisticWheelMetal = new MeshPhysicalMaterial({
    color: 2435633,
    roughness: 0.24,
    metalness: 0.94,
    clearcoat: 0.32,
    clearcoatRoughness: 0.18
  });

  const arcadeTire = cloneMaterial ? cloneMaterial({ color: 1119000 }) : new MeshStandardMaterial({ color: 1119000 });
  const realisticTire = new MeshStandardMaterial({
    color: 1119000,
    roughness: 0.92,
    metalness: 0.02
  });

  const arcadeLowerDetail = cloneMaterial ? cloneMaterial({ color: 1514274 }) : new MeshStandardMaterial({ color: 1514274 });
  const realisticLowerDetail = new MeshStandardMaterial({
    color: 1514274,
    roughness: 0.4,
    metalness: 0.78
  });

  const palette = {
    wheelMetal: (typeof multiThemeMaterial === "function") ? multiThemeMaterial(arcadeWheelMetal, realisticWheelMetal) : realisticWheelMetal,
    tire: (typeof multiThemeMaterial === "function") ? multiThemeMaterial(arcadeTire, realisticTire) : realisticTire,
    lowerDetail: (typeof multiThemeMaterial === "function") ? multiThemeMaterial(arcadeLowerDetail, realisticLowerDetail) : realisticLowerDetail,
    lamps: new MeshBasicMaterial({ color: 14153727, toneMapped: false }),
    tailLamps: new MeshBasicMaterial({ color: 13970226, toneMapped: false }),
    body: bodyMaterial
  };

  carPaintCache.set(cacheKey, palette);
  return palette;
}

/**
 * Maps original submesh material name to the themed vehicle palette.
 */
export function mapVehicleMaterial(mat, palette, mesh) {
  const name = (mesh?.userData?.originalMaterialName) || (mat?.name) || "";
  switch (name) {
    case "wheel-metal":
    case "Arcade / wheel metal":
    case "Realistic / wheel metal":
      return palette.wheelMetal;
    case "tire":
    case "Arcade / tire":
    case "Realistic / tire":
      return palette.tire;
    case "lower-detail":
    case "Arcade / lower detail":
    case "Realistic / lower detail":
    case "glass":
      return palette.lowerDetail;
    case "lamps":
      return palette.lamps;
    case "tail-lamps":
      return palette.tailLamps;
    case "body-shell":
    case "body-fill":
    case "paint":
    case "Arcade / body paint":
    case "Realistic / anodized pearl paint":
      return palette.body;
    default:
      if (mesh?.name && (mesh.name.includes("body") || mesh.name.includes("shell") || mesh.name.includes("paint"))) {
        return palette.body;
      }
      if (name.startsWith("Arcade / reset") || name.startsWith("Realistic / reset") || mat?.uniforms) {
        return mat;
      }
      return palette.lowerDetail;
  }
}

/**
 * Recursively applies vehicle paint & hardware materials across a submesh hierarchy.
 */
export function applyVehicleMaterials(root, palette, resolveContextFn = resolveContext) {
  const { Mesh, markMatrixDirty } = resolveContextFn();
  root.traverse?.(node => {
    let parent = node;
    while (parent) {
      if (parent.name === "flip-reset-indicator" || parent.name === "realistic-reset-pulse" || parent.name === "car-hitbox") {
        return;
      }
      parent = parent.parent;
    }
    if (node instanceof Mesh || node.isMesh) {
      if (!node.userData.originalMaterialName && node.material) {
        node.userData.originalMaterialName = Array.isArray(node.material)
          ? (node.material[0]?.name || "")
          : (node.material.name || "");
      }
      node.material = Array.isArray(node.material)
        ? node.material.map(m => mapVehicleMaterial(m, palette, node))
        : mapVehicleMaterial(node.material, palette, node);
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
  if (typeof markMatrixDirty === "function") {
    markMatrixDirty(root);
  }
}

/**
 * Deep clones a vehicle mesh hierarchy and applies custom paint.
 */
export function cloneVehicleMeshWithPaint(mesh, teamColor, colorOptions, resolveContextFn = resolveContext) {
  const cloned = mesh.clone ? mesh.clone(true) : mesh;
  const palette = createCarPaintMaterial(teamColor, colorOptions, resolveContextFn);
  applyVehicleMaterials(cloned, palette, resolveContextFn);
  return cloned;
}

/**
 * Creates Octane (game-car) root hierarchy.
 */
export function createGameCarModel(asset, teamColor, colorOptions, resolveContextFn = resolveContext) {
  const { Group } = resolveContextFn();
  const root = new Group();
  root.name = "game-car";
  root.scale.setScalar?.(OCTANE_SCALE);

  const shell = new Group();
  shell.name = "game-car-shell";
  if (shell.scale) shell.scale.x = OCTANE_SCALE_X;
  if (shell.position) shell.position.set(OCTANE_OFFSET_X / OCTANE_SCALE, OCTANE_OFFSET_Y / OCTANE_SCALE, 0);

  const bodyClone = asset.body.clone ? asset.body.clone(true) : asset.body;
  const palette = createCarPaintMaterial(teamColor, colorOptions, resolveContextFn);
  applyVehicleMaterials(bodyClone, palette, resolveContextFn);

  shell.add(bodyClone);
  root.add(shell);
  return root;
}

/**
 * Creates Octane wheel group.
 */
export function createGameCarWheel(asset, wheelIndex, teamColor, resolveContextFn = resolveContext) {
  // 容错处理：以防万一别人只传了 3 个参数，且第 3 个参数传的是 resolveContext 函数
  const realResolveContext = (typeof teamColor === 'function') ? teamColor : (typeof resolveContextFn === 'function' ? resolveContextFn : resolveContext);
  const colorVal = (typeof teamColor === 'number') ? teamColor : undefined;

  const { Group } = realResolveContext();
  const wheelGroup = new Group();
  wheelGroup.name = OCTANE_WHEEL_NAMES[wheelIndex];
  wheelGroup.scale.setScalar?.(OCTANE_SCALE);

  const wheelClone = asset.wheels[wheelIndex].clone ? asset.wheels[wheelIndex].clone(true) : asset.wheels[wheelIndex];
  wheelClone.position?.set(0, 0, 0);
  
  // 这里可以把 teamColor 顺便塞给车漆材质，完美支持车轮配色
  applyVehicleMaterials(wheelClone, createCarPaintMaterial(colorVal, undefined, realResolveContext), realResolveContext);
  wheelGroup.add(wheelClone);
  return wheelGroup;
}

/**
 * Creates Octane wheel suspension hardware.
 */
export function createGameCarWheelHardware(asset, wheelIndex, teamColor, resolveContextFn = resolveContext) {
  // 容错处理：区分 teamColor 和 resolveContextFn
  const realResolveContext = (typeof teamColor === "function") 
    ? teamColor 
    : (typeof resolveContextFn === "function" ? resolveContextFn : resolveContext);
    
  const colorVal = (typeof teamColor === "number") ? teamColor : undefined;

  const hw = asset.wheelHardware[wheelIndex];
  const hwClone = hw.clone ? hw.clone(true) : hw;
  
  // 传参时把 teamColor/colorVal 传给 createCarPaintMaterial 的第 1 个参数
  applyVehicleMaterials(
    hwClone, 
    createCarPaintMaterial(colorVal, undefined, realResolveContext), 
    realResolveContext
  );
  return hwClone;
}

/**
 * Loads Dominus (flat-car) model from /assets/flat-car/model.glb
 */
export async function loadFlatCarAsset(resolveContextFn = resolveContext) {
  if (cachedFlatCarAsset) return cachedFlatCarAsset;
  const { GLTFLoader } = resolveContextFn();
  if (!GLTFLoader) return null;
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync("/assets/flat-car/model.glb");

  const getPart = (name) => {
    const obj = gltf.scene.getObjectByName?.(name);
    if (!obj) throw new Error(`Flat Car asset is missing ${name}`);
    return obj;
  };

  cachedFlatCarAsset = {
    body: getPart("flat-car-body"),
    wheels: FLAT_CAR_WHEEL_NAMES.map(getPart)
  };
  return cachedFlatCarAsset;
}

/**
 * Creates Dominus (flat-car) root hierarchy.
 */
export function createFlatCarModel(asset, teamColor, resolveContextFn = resolveContext) {
  const { Group } = resolveContextFn();
  const root = new Group();
  root.name = "flat-car";
  root.scale.setScalar?.(100);
  root.add(cloneVehicleMeshWithPaint(asset.body, teamColor, FLAT_CAR_DEFAULT_COLORS, resolveContextFn));
  return root;
}

/**
 * Creates Dominus wheel group.
 */
export function createFlatCarWheel(asset, wheelIndex, teamColor, resolveContextFn = resolveContext) {
  const realResolveContext = (typeof teamColor === "function")
    ? teamColor
    : (typeof resolveContextFn === "function" ? resolveContextFn : resolveContext);
  const colorVal = (typeof teamColor === "number") ? teamColor : undefined;

  const { Group } = realResolveContext();
  const wheelGroup = new Group();
  wheelGroup.name = FLAT_CAR_WHEEL_NAMES[wheelIndex];
  wheelGroup.scale.setScalar?.(100);

  const wheelMesh = cloneVehicleMeshWithPaint(asset.wheels[wheelIndex], colorVal, FLAT_CAR_DEFAULT_COLORS, realResolveContext);
  wheelMesh.position?.set(0, 0, 0);
  wheelGroup.add(wheelMesh);
  return wheelGroup;
}

/**
 * Returns color settings for car visual modes.
 */
export function getCarVisualTheme(visualId) {
  return visualId === "flat-car" ? FLAT_CAR_BOT_COLORS : FLAT_CAR_DEFAULT_COLORS;
}

/**
 * Multi-point piecewise linear curve interpolator.
 */
export function lerpPolyline(points, x) {
  if (x <= points[0].x) return points[0].clone ? points[0].clone() : { ...points[0] };
  for (let i = 1; i < points.length; i++) {
    if (x <= points[i].x) {
      const t = (x - points[i - 1].x) / (points[i].x - points[i - 1].x);
      if (points[i - 1].clone) {
        const cloned = points[i - 1].clone();
        if (typeof cloned.lerp === 'function') return cloned.lerp(points[i], t);
      }
      return {
        x: points[i - 1].x + (points[i].x - points[i - 1].x) * t,
        y: points[i - 1].y + (points[i].y - points[i - 1].y) * t,
        z: points[i - 1].z + (points[i].z - points[i - 1].z) * t
      };
    }
  }
  return points[points.length - 1].clone ? points[points.length - 1].clone() : { ...points[points.length - 1] };
}

/**
 * Builds realistic cockpit 3-axis gimbal ring, cradle, and racing bucket seat.
 */
export function createRealisticCarGimbals(resolveContextFn = resolveContext) {
  const ctx = resolveContextFn();
  const {
    Group,
    Mesh,
    MeshStandardMaterial,
    BoxGeometry,
    CylinderGeometry,
    SphereGeometry,
    TorusGeometry,
    TubeGeometry,
    CatmullRomCurve3,
    BufferGeometry,
    BufferAttribute,
    EdgesGeometry,
    LineSegments,
    LineBasicMaterial,
    Vector3,
    DoubleSide
  } = ctx;

  const root = new Group();
  const visual = new Group();
  visual.name = "gimbal-cockpit";
  root.add(visual);

  const matDarkMetal = new MeshStandardMaterial({ color: 6055024, roughness: 0.24, metalness: 0.95 });
  const matBrightChrome = new MeshStandardMaterial({ color: 14870252, roughness: 0.12, metalness: 1 });
  const matTrim = new MeshStandardMaterial({ color: 987670, roughness: 0.6, metalness: 0.15 });
  const matSeatPadding = new MeshStandardMaterial({ color: 2501428, roughness: 0.8 });

  const dim = REALISTIC_DIMENSIONS;
  const hitboxMesh = new LineSegments(
    new EdgesGeometry(new BoxGeometry(dim.length, dim.height, dim.width)),
    new LineBasicMaterial({ color: 16777215, transparent: true, opacity: 0.9, depthTest: true, depthWrite: false })
  );
  hitboxMesh.position.set(dim.centerForward, dim.centerUp, 0);
  hitboxMesh.renderOrder = 100;
  hitboxMesh.visible = false;
  root.add(hitboxMesh);

  // Outer Roll Ring
  const rollRingMesh = new Mesh(new TorusGeometry(dim.gimbalOuterRadius, 1.15, 12, 72), matDarkMetal);
  rollRingMesh.castShadow = true;
  rollRingMesh.position.set(dim.gimbalCenterX, dim.gimbalCenterY, 0);
  visual.add(rollRingMesh);

  for (const side of [-1, 1]) {
    const pivot = new Mesh(new CylinderGeometry(1.4, 1.4, 3, 12), matDarkMetal);
    pivot.rotation.z = Math.PI / 2;
    pivot.position.set(dim.gimbalCenterX + side * dim.gimbalOuterRadius, dim.gimbalCenterY, 0);
    visual.add(pivot);
  }

  // Inner Pitch Ring
  const innerRingGroup = new Group();
  innerRingGroup.position.set(dim.gimbalCenterX, dim.gimbalCenterY, 0);
  const innerRingMesh = new Mesh(new TorusGeometry(dim.gimbalInnerRadius, 0.95, 12, 64), matDarkMetal);
  innerRingMesh.rotation.x = Math.PI / 2;
  innerRingMesh.castShadow = true;
  innerRingGroup.add(innerRingMesh);

  for (const side of [-1, 1]) {
    const pivot = new Mesh(new CylinderGeometry(0.85, 0.85, 6, 12), matBrightChrome);
    pivot.rotation.z = Math.PI / 2;
    pivot.position.set(side * (dim.gimbalOuterRadius - 3), 0, 0);
    innerRingGroup.add(pivot);
  }
  visual.add(innerRingGroup);

  // Pitch Cradle
  const cradleGroup = new Group();
  cradleGroup.name = "gimbal-pitch-cradle";

  const addTube = (pts, radius, mat, name, parentGroup, closed = false) => {
    const curve = new CatmullRomCurve3(pts, closed, "centripetal");
    const geom = new TubeGeometry(curve, pts.length * 7, radius, 8, closed);
    const mesh = new Mesh(geom, mat);
    mesh.name = name;
    mesh.castShadow = true;
    parentGroup.add(mesh);
    mesh.userData.path = pts.map(p => p.toArray?.() || [p.x, p.y, p.z]);
    return mesh;
  };

  for (const side of [-1, 1]) {
    const axle = new Mesh(new CylinderGeometry(0.85, 0.85, 5.5, 16), matBrightChrome);
    axle.rotation.x = Math.PI / 2;
    axle.position.set(0, 0, side * 17.75);
    axle.name = "pitch-bearing-axle";
    cradleGroup.add(axle);

    for (const n of [-1, 1]) {
      addTube([
        new Vector3(0, 0, side * 15.75),
        new Vector3(n * 2.1, -3.5, side * 14.1),
        new Vector3(n * 3.2, -10.1, side * 12.5),
        new Vector3(n * 3.2, -13.8, side * 11.8),
        new Vector3(n * 3.2, -14.2, side * 11.4),
        new Vector3(n * 3.8, -15.7, side * 7)
      ], 0.42, matDarkMetal, "continuous-cradle-fork", cradleGroup);
    }
  }

  for (const side of [-1, 1]) {
    addTube([
      new Vector3(side * 3.8, -15.7, -7),
      new Vector3(side * 3.8, -15.7, 0),
      new Vector3(side * 3.8, -15.7, 7)
    ], 0.45, matDarkMetal, "cradle-lower-crossmember", cradleGroup);
    addTube([
      new Vector3(side * 3.8, -15.7, 0),
      new Vector3(0, -15.7, 0)
    ], 0.52, matDarkMetal, "swivel-support", cradleGroup);
  }

  const spindle = new Mesh(new CylinderGeometry(1.1, 1.25, 5.7, 20), matBrightChrome);
  spindle.position.set(0, -11.65, 0);
  spindle.name = "seat-swivel-spindle";
  spindle.castShadow = true;
  cradleGroup.add(spindle);
  innerRingGroup.add(cradleGroup);

  // Seat Swivel & Cockpit Controls
  const seatGroup = new Group();
  seatGroup.name = "gimbal-seat-swivel";

  const spineProfile = [
    [3.8, -8.5, 5.1],
    [0, -9, 5.55],
    [-4.8, -8.95, 5.7],
    [-6.6, -6.4, 5.35],
    [-7, -0.5, 5],
    [-7.3, 4.2, 4.25],
    [-7.4, 7, 3]
  ];
  const lateralSpans = [-1, -0.8, 0, 0.8, 1];
  const seatPositions = [];
  const seatIndices = [];

  for (let layer = 0; layer < 2; layer++) {
    spineProfile.forEach(([px, py, pz], pIdx) => {
      lateralSpans.forEach(span => {
        const spanPow = Math.pow(Math.abs(span), 4);
        seatPositions.push(
          px + (pIdx > 2 ? spanPow * 1.1 : 0) - layer * 0.22,
          py + (pIdx <= 2 ? spanPow * 0.85 : 0) - layer * 0.16,
          span * pz
        );
      });
    });
  }

  const numRing = spineProfile.length * lateralSpans.length;
  for (let layer = 0; layer < 2; layer++) {
    for (let p = 0; p < spineProfile.length - 1; p++) {
      for (let s = 0; s < lateralSpans.length - 1; s++) {
        const a = layer * numRing + p * lateralSpans.length + s;
        const b = a + 1;
        const c = b + lateralSpans.length;
        const d = a + lateralSpans.length;
        seatIndices.push(...(layer ? [a, c, b, a, d, c] : [a, b, c, a, c, d]));
      }
    }
  }

  const edgeLoops = [0, 1, 2, 3, 4, 9, 14, 19, 24, 29, 34, 33, 32, 31, 30, 25, 20, 15, 10, 5];
  for (let i = 0; i < edgeLoops.length; i++) {
    const a = edgeLoops[i];
    const b = edgeLoops[(i + 1) % edgeLoops.length];
    seatIndices.push(a, b, b + numRing, a, b + numRing, a + numRing);
  }

  const seatGeom = new BufferGeometry();
  seatGeom.setAttribute("position", new BufferAttribute(new Float32Array(seatPositions), 3));
  seatGeom.setIndex(seatIndices);
  seatGeom.computeVertexNormals?.();

  const seatShellMat = new MeshStandardMaterial({ color: 1318180, roughness: 0.36, metalness: 0.32, side: DoubleSide ?? 2 });
  const seatShellMesh = new Mesh(seatGeom, seatShellMat);
  seatShellMesh.name = "thin-racing-bucket-shell";
  seatShellMesh.castShadow = true;
  seatGroup.add(seatShellMesh);

  for (const side of [-1, 1]) {
    addTube(spineProfile.map(([px, py, pz], pIdx) =>
      new Vector3(px + (pIdx > 2 ? 1.1 : 0), py + (pIdx <= 2 ? 0.85 : 0), side * pz)
    ), 0.19, matTrim, "bucket-edge-bead", seatGroup);
  }

  const addPadding = (name, x, y, z, sx, sy, sz) => {
    const pad = new Mesh(new SphereGeometry(1, 20, 12), matSeatPadding);
    pad.position.set(x, y, z);
    pad.scale.set(sx, sy, sz);
    pad.name = name;
    pad.castShadow = true;
    seatGroup.add(pad);
  };

  addPadding("seat-pan-padding", -1.2, -8.62, 0, 4.8, 0.42, 4.5);
  addPadding("seat-back-padding", -6.55, -1.8, 0, 0.4, 5.8, 3.75);
  addPadding("seat-head-padding", -6.98, 5.3, 0, 0.34, 1.5, 2.55);

  addTube([
    new Vector3(0, -8.75, 0),
    new Vector3(0.75, -6.3, 0),
    new Vector3(1.5, -4, 0)
  ], 0.35, matDarkMetal, "control-column", seatGroup);

  addTube([
    new Vector3(1.5, -4.95, -3.65),
    new Vector3(1.5, -4.5, -4.1),
    new Vector3(1.5, -2.95, -3.5),
    new Vector3(1.5, -2.75, 0),
    new Vector3(1.5, -2.95, 3.5),
    new Vector3(1.5, -4.5, 4.1),
    new Vector3(1.5, -4.95, 3.65),
    new Vector3(1.5, -5.1, 0)
  ], 0.31, matTrim, "race-control-yoke", seatGroup, true);

  const hubBox = new Mesh(new BoxGeometry(0.7, 1.3, 2.4), matTrim);
  hubBox.position.set(1.5, -4, 0);
  hubBox.name = "yoke-hub";
  hubBox.castShadow = true;
  seatGroup.add(hubBox);

  cradleGroup.add(seatGroup);

  return {
    root,
    visual,
    hitbox: hitboxMesh,
    rollRing: innerRingGroup,
    cradle: cradleGroup,
    seat: seatGroup,
    rollAngle: 0,
    cradleAngle: 0,
    seatHeading: NaN
  };
}

/**
 * Normalizes an angle into [-PI, PI].
 */
function normalizeAngle(angle) {
  let a = angle % (2 * Math.PI);
  if (a > Math.PI) a -= 2 * Math.PI;
  else if (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/**
 * Steps an angle toward a target angle by at most maxStep.
 */
function approachAngle(current, target, maxStep) {
  let diff = normalizeAngle(target - current);
  if (diff > maxStep) diff = maxStep;
  else if (diff < -maxStep) diff = -maxStep;
  return current + diff;
}

/**
 * Newton-Raphson gimbal orientation solver & velocity heading alignment.
 */
export function updateRealisticCockpitGimbal(quat, vx, vy, dt, gimbals, resolveContextFn = resolveContext) {
  if (!gimbals || !gimbals.rollRing || !gimbals.cradle || !gimbals.seat) return;
  const { Quaternion, Vector3 } = resolveContextFn();
  const invQuat = new Quaternion().copy(quat).invert();
  const upVec = new Vector3(0, 1, 0).applyQuaternion(invQuat);

  const s = upVec.x, a = upVec.y, o = upVec.z;
  let roll = gimbals.rollAngle;
  let cradle = gimbals.cradleAngle;

  const hp = 0.01, l1 = 0.4, c1 = 8;
  for (let m = 0; m < 4; m++) {
    const y = Math.cos(roll), C = Math.sin(roll), E = Math.cos(cradle), S = -Math.sin(cradle);
    const k = E * y, x = E * C, T = s - S, R = a - k, D = o - x;
    const N = -x, X = k, Y = -C * x - y * k, H = y * S, V = C * S;
    const J = N * N + X * X;
    const ne = J + hp + l1 * (1 - J);
    const le = Y * Y + H * H + V * V + hp;
    const je = N * H + X * V;
    const de = N * R + X * D;
    const pe = Y * T + H * R + V * D;
    const Se = ne * le - je * je || 1e-9;
    roll += (le * de - je * pe) / Se;
    cradle += (ne * pe - je * de) / Se;
  }

  const maxStep = c1 * dt;
  const clampedRollDelta = Math.max(-maxStep, Math.min(maxStep, roll - gimbals.rollAngle));
  gimbals.rollAngle += clampedRollDelta;
  gimbals.cradleAngle = cradle;
  gimbals.rollRing.rotation.x = gimbals.rollAngle;
  gimbals.cradle.rotation.z = cradle;

  const d = Math.cos(gimbals.cradleAngle), u = Math.sin(gimbals.cradleAngle);
  const forwardDir = new Vector3(d, Math.cos(gimbals.rollAngle) * u, Math.sin(gimbals.rollAngle) * u).applyQuaternion(quat);
  const yawAngle = Math.atan2(forwardDir.z, forwardDir.x);

  if (Number.isNaN(gimbals.seatHeading)) {
    gimbals.seatHeading = yawAngle;
  }
  const speed = Math.hypot(vx, vy);
  const targetHeading = speed > REALISTIC_DIMENSIONS.minSteerVelocity ? Math.atan2(vy, vx) : gimbals.seatHeading;
  gimbals.seatHeading = approachAngle(gimbals.seatHeading, targetHeading, REALISTIC_DIMENSIONS.seatYawRate * dt);
  gimbals.seat.rotation.y = normalizeAngle(yawAngle - gimbals.seatHeading);
}

/**
 * Builds realistic rear jet nozzle cluster.
 */
function createRearJetCluster(parentGroup, tailX, teamColor, heightY, resolveContextFn = resolveContext) {
  const { Group, Mesh, CylinderGeometry, TorusGeometry, LatheGeometry, Vector2, MeshStandardMaterial, DoubleSide } = resolveContextFn();
  const matBody = new MeshStandardMaterial({ color: 2567220, roughness: 0.28, metalness: 0.95 });
  const matChrome = new MeshStandardMaterial({ color: 3159615, roughness: 0.22, metalness: 1, side: DoubleSide ?? 2 });
  const matAccent = new MeshStandardMaterial({ color: teamColor, roughness: 0.3, metalness: 0.7 });

  const mountBar = new Mesh(new CylinderGeometry(1, 1, 26.6, 12), matBody);
  mountBar.position.set(tailX, heightY - 0.3, 0);
  mountBar.castShadow = true;

  const baseCylinder = new Mesh(new CylinderGeometry(3.4, 3.9, 8, 18), matBody);
  baseCylinder.rotation.z = Math.PI / 2;
  baseCylinder.position.set(tailX - 2, heightY, 0);
  baseCylinder.castShadow = true;

  const accentRing = new Mesh(new TorusGeometry(3.7, 0.55, 10, 24), matAccent);
  accentRing.rotation.y = Math.PI / 2;
  accentRing.position.set(tailX - 5.8, heightY, 0);

  const nozzleBell = new Mesh(new LatheGeometry([
    new Vector2(1.7, 0),
    new Vector2(2, 0.9),
    new Vector2(2.9, 2.7),
    new Vector2(3.9, 4.5),
    new Vector2(4.7, 5.6)
  ], 22), matChrome);
  nozzleBell.rotation.z = Math.PI / 2;
  nozzleBell.position.set(tailX - 6, heightY, 0);
  nozzleBell.castShadow = true;

  parentGroup.add(mountBar, baseCylinder, accentRing, nozzleBell);
}

/**
 * Procedural tubular space-frame buggy chassis generator.
 */
export function createRealisticCarModel(teamColor, options = {}, resolveContextFn = resolveContext) {
  const ctx = resolveContextFn();
  const {
    Group,
    Mesh,
    CylinderGeometry,
    SphereGeometry,
    BoxGeometry,
    TorusGeometry,
    BufferGeometry,
    MeshStandardMaterial,
    MeshPhysicalMaterial,
    Vector3,
    DoubleSide,
    MathUtils
  } = ctx;

  const dim = REALISTIC_DIMENSIONS;
  const cfg = {
    length: dim.length,
    width: dim.width,
    height: dim.height,
    centerForward: dim.centerForward,
    centerUp: dim.centerUp,
    gimbalCenter: new Vector3(dim.gimbalCenterX, dim.gimbalCenterY, 0),
    wheels: REALISTIC_WHEEL_COORDS,
    tireWidth: REALISTIC_TIRE_WIDTH,
    roofWidth: 0.82,
    roofLength: 0.43,
    ...options
  };

  const { length: L, width: W, height: H, centerForward: fwd, centerUp: up } = cfg;
  const gX = cfg.gimbalCenter.x;
  const cY = up - H / 2;
  const hY = up + H / 2;
  const tubeRadius = Math.min(W, H) * 0.029;

  const chassisRoot = new Group();
  chassisRoot.name = "procedural-buggy-frame";

  const matTube = new MeshStandardMaterial({ color: 7634824, roughness: 0.36, metalness: 0.82 });
  const matTeam = new MeshPhysicalMaterial({ color: teamColor, roughness: 0.31, metalness: 0.55, clearcoat: 0.7 });
  const matGusset = new MeshStandardMaterial({ color: 1121060, roughness: 0.46, metalness: 0.5, side: DoubleSide ?? 2 });
  const matFastener = new MeshStandardMaterial({ color: 11648453, roughness: 0.28, metalness: 0.9 });
  const matLine = new MeshStandardMaterial({ color: 9789486, roughness: 0.4, metalness: 0.7 });
  const matLight = new MeshStandardMaterial({ color: 13625075, emissive: 14282239, emissiveIntensity: 2.3, roughness: 0.22 });

  const upAxis = new Vector3(0, 1, 0);

  const addTube = (p1, p2, mat = matTube, radius = tubeRadius, name = "chassis-tube") => {
    const delta = p2.clone().sub(p1);
    const len = delta.length();
    if (len < 1e-5) return;
    const mesh = new Mesh(new CylinderGeometry(radius, radius, len, 12), mat);
    mesh.name = name;
    mesh.position.copy(p1).add(p2).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(upAxis, delta.normalize());
    mesh.castShadow = true;
    chassisRoot.add(mesh);
    mesh.userData.endpoints = [p1.toArray?.() || [p1.x, p1.y, p1.z], p2.toArray?.() || [p2.x, p2.y, p2.z]];
  };

  const addGusset = (name, pts, mat) => {
    const geom = new BufferGeometry().setFromPoints?.(pts) || new BufferGeometry();
    const indices = [];
    for (let i = 1; i < pts.length - 1; i++) indices.push(0, i, i + 1);
    geom.setIndex?.(indices);
    geom.computeVertexNormals?.();
    const mesh = new Mesh(geom, mat);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    chassisRoot.add(mesh);
  };

  const addFastener = (pos, dir) => {
    const mesh = new Mesh(new CylinderGeometry(tubeRadius * 0.32, tubeRadius * 0.32, tubeRadius * 0.4, 6), matFastener);
    mesh.name = "chassis-fastener";
    mesh.position.copy(pos);
    mesh.quaternion.setFromUnitVectors(upAxis, dir);
    chassisRoot.add(mesh);
  };

  const noseX = fwd + L * 0.5;
  const tailX = fwd - L * 0.608;
  const frontX = gX + L * 0.27;
  const rearX = gX - L * 0.3;
  const bayRearX = gX - L * 0.27;
  const bayFrontX = bayRearX + L * cfg.roofLength;
  const sideW = Math.max(W * 0.274, 22 + tubeRadius * 1.4);
  const roofW = W * 0.5 * cfg.roofWidth;
  const canopyW = roofW * 0.94;

  const maxWheelX = Math.max(...cfg.wheels.map(w => w[0]));
  const minWheelX = Math.min(...cfg.wheels.map(w => w[0]));
  const getWheelInnerZ = (wx) => Math.min(...cfg.wheels.filter(w => Math.abs(w[0] - wx) < 0.001).map(w => Math.abs(w[1]))) - cfg.tireWidth * 0.99;

  const roofY = hY - H * 0.025;
  const beltY = cY + H * 0.5;
  const noseW = W * 0.16;

  const getTopY = (x) => MathUtils.lerp(roofY, beltY, (x - bayFrontX) / (noseX - bayFrontX));
  const getTopZ = (x) => MathUtils.lerp(canopyW, noseW, (x - bayFrontX) / (noseX - bayFrontX));
  const getAftProfile = (sign, x) => new Vector3(tailX, cY + H * 0.54, sign * W * 0.29).lerp(new Vector3(bayRearX, hY, sign * roofW), (x - tailX) / (bayRearX - tailX));

  const railMap = new Map();
  const addLongeronChain = (pts, name, mat = matTeam, radius = tubeRadius) => {
    for (let i = 1; i < pts.length; i++) addTube(pts[i - 1], pts[i], mat, radius, name);
    for (const pt of pts.slice(1, -1)) {
      const bend = new Mesh(new SphereGeometry(radius, 12, 8), mat);
      bend.position.copy(pt);
      bend.name = `${name}-bend`;
      bend.castShadow = true;
      chassisRoot.add(bend);
    }
  };

  for (const side of [-1, 1]) {
    const bottomLongeron = [
      new Vector3(tailX, cY + H * 0.06, side * W * 0.18),
      new Vector3(minWheelX, cY, side * getWheelInnerZ(minWheelX)),
      new Vector3(rearX, cY, side * sideW),
      new Vector3(frontX, cY, side * sideW),
      new Vector3(maxWheelX, cY, side * getWheelInnerZ(maxWheelX)),
      new Vector3(noseX, cY + H * 0.12, side * noseW)
    ];
    const topLongeron = [
      getAftProfile(side, tailX),
      getAftProfile(side, minWheelX),
      new Vector3(bayRearX, hY, side * roofW),
      new Vector3(bayFrontX, roofY, side * canopyW),
      new Vector3(frontX, getTopY(frontX), side * getTopZ(frontX)),
      new Vector3(maxWheelX, getTopY(maxWheelX), side * getTopZ(maxWheelX)),
      new Vector3(noseX, beltY, side * noseW)
    ];

    railMap.set(side, { bottom: bottomLongeron, top: topLongeron });
    addLongeronChain(bottomLongeron, "lower-longeron");
    addLongeronChain(topLongeron, "swept-upper-longeron");

    const midPillarPt = new Vector3(rearX, cY + H * 0.7, side * sideW);
    addLongeronChain([bottomLongeron[2], midPillarPt, topLongeron[2]], "rear-cage-pillar", matTube, tubeRadius * 0.92);
    addTube(bottomLongeron[3], topLongeron[4], matTube, tubeRadius * 0.92, "front-cage-pillar");
    addTube(bottomLongeron[0], topLongeron[0], matTube, tubeRadius * 0.92, "tail-upright");
    addTube(bottomLongeron[5], topLongeron[6], matTube, tubeRadius * 0.92, "nose-upright");
    addTube(bottomLongeron[2], topLongeron[4], matTube, tubeRadius * 0.72, "door-diagonal");
    addTube(bottomLongeron[0], midPillarPt, matTube, tubeRadius * 0.75, "rear-bay-diagonal");
    addTube(bottomLongeron[3], topLongeron[6], matTube, tubeRadius * 0.75, "front-bay-diagonal");

    const pressureLine = bottomLongeron.map(p => p.clone().add(new Vector3(0, tubeRadius * 1.5, -side * tubeRadius * 0.65)));
    for (let i = 1; i < pressureLine.length; i++) {
      addTube(pressureLine[i - 1], pressureLine[i], matLine, tubeRadius * 0.19, "frame-pressure-line");
    }
  }

  const leftRails = railMap.get(-1);
  const rightRails = railMap.get(1);
  const evalBottomRail = (side, x) => lerpPolyline(railMap.get(Math.sign(side)).bottom, x);
  const evalTopRail = (side, x) => lerpPolyline(railMap.get(Math.sign(side)).top, x);

  for (let i = 0; i < leftRails.bottom.length; i++) {
    addTube(leftRails.bottom[i], rightRails.bottom[i]);
  }
  for (const idx of [0, 1, 2, 3, 5, 6]) {
    addTube(
      leftRails.top[idx],
      rightRails.top[idx],
      (idx === 2 || idx === 3) ? matTeam : matTube,
      tubeRadius,
      (idx === 1 || idx === 5) ? "shock-tower-crossmember" : "cage-crossmember"
    );
  }

  const suspensionData = cfg.wheels.map(([wx, wz]) => {
    const sign = Math.sign(wz);
    const topPt = evalTopRail(sign, wx);
    const topCoord = new Vector3(wx, topPt.y, sign * Math.min(getWheelInnerZ(wx), Math.abs(topPt.z) - tubeRadius * 1.2));
    const offset = Math.min(L * 0.075, (maxWheelX - minWheelX) * 0.11);
    const foreRoot = evalBottomRail(sign, wx + offset);
    const aftRoot = evalBottomRail(sign, wx - offset);

    addTube(foreRoot, topCoord, matTube, tubeRadius * 0.9, "shock-tower-forward-leg");
    addTube(aftRoot, topCoord, matTube, tubeRadius * 0.9, "shock-tower-rear-leg");
    addGusset("shock-tower-gusset", [
      topCoord.clone().add(new Vector3(0, -tubeRadius, 0)),
      topCoord.clone().lerp(foreRoot, 0.2),
      topCoord.clone().lerp(aftRoot, 0.2)
    ], matGusset);

    const eyeMesh = new Mesh(new TorusGeometry(tubeRadius * 1.2, tubeRadius * 0.38, 8, 20), matFastener);
    eyeMesh.name = "shock-mount-eye";
    eyeMesh.position.copy(topCoord);
    chassisRoot.add(eyeMesh);
    addFastener(topCoord, new Vector3(0, 0, sign));

    return {
      top: topCoord,
      foreRoot,
      aftRoot,
      innerZ: sign * (Math.abs(wz) - cfg.tireWidth * 0.8)
    };
  });

  // Nose Light Pods
  for (const side of [-1, 1]) {
    const nosePt = evalTopRail(side, noseX);
    const pod = new Mesh(new BoxGeometry(L * 0.024, H * 0.12, W * 0.052), matGusset);
    pod.position.copy(nosePt).add(new Vector3(-tubeRadius, -tubeRadius, -side * tubeRadius));
    pod.name = "nose-light-pod";
    chassisRoot.add(pod);

    for (const py of [-0.9, 0.9]) {
      for (const pz of [-1, 1]) {
        const emitter = new Mesh(new BoxGeometry(0.7, 1.35, 1.4), matLight);
        emitter.position.copy(pod.position).add(new Vector3(L * 0.013, py, pz));
        chassisRoot.add(emitter);
      }
    }
  }

  const powertrainPos = new Vector3(tailX + L * 0.145, cY + H * 0.35, 0);
  const boostOutletPos = new Vector3(tailX - 11, powertrainPos.y, 0);
  createRearJetCluster(chassisRoot, tailX, teamColor, powertrainPos.y, resolveContextFn);

  return {
    group: chassisRoot,
    railBottom: evalBottomRail,
    railTop: evalTopRail,
    suspension: suspensionData,
    powertrainMount: powertrainPos,
    boostOutlet: boostOutletPos,
    stations: {
      nose: noseX,
      front: frontX,
      rear: rearX,
      tail: tailX
    }
  };
}

/**
 * Loads realistic car details from /assets/realistic-car/details.glb
 */
export async function loadRealisticCarAsset(resolveContextFn = resolveContext) {
  if (cachedRealisticCarAsset) return cachedRealisticCarAsset;
  const { GLTFLoader } = resolveContextFn();
  if (!GLTFLoader) return null;
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync("/assets/realistic-car/details.glb");

  const details = {};
  for (const name of REALISTIC_DETAIL_NAMES) {
    const obj = gltf.scene.getObjectByName?.(name);
    if (!obj) throw new Error(`Realistic car asset is missing ${name}`);
    details[name] = obj;
  }
  cachedRealisticCarAsset = details;
  return cachedRealisticCarAsset;
}

/**
 * Attaches external GLB realistic car details onto procedural frame and gimbal models.
 */
export function assembleRealisticCar(asset, frameModel, gimbalModel, teamColor, resolveContextFn = resolveContext) {
  const { Mesh } = resolveContextFn();
  const targets = {
    "frame-details": frameModel.group,
    "fixed-details": gimbalModel.visual,
    "roll-details": gimbalModel.rollRing,
    "cradle-details": gimbalModel.cradle,
    "seat-details": gimbalModel.seat
  };

  const matCache = new Map();
  const updateMat = (mat) => {
    if (mat.name !== "realistic-team") return mat;
    let cloned = matCache.get(mat);
    if (!cloned) {
      cloned = mat.clone ? mat.clone() : { ...mat };
      cloned.color?.setHex?.(teamColor);
      matCache.set(mat, cloned);
    }
    return cloned;
  };

  for (const name of REALISTIC_DETAIL_NAMES) {
    const detailClone = asset[name].clone ? asset[name].clone(true) : asset[name];
    if (name === "frame-details") {
      detailClone.position.copy(frameModel.powertrainMount);
    } else if (name === "roll-details" || name === "cradle-details" || name === "seat-details") {
      detailClone.position.set(0, 0, 0);
    }

    detailClone.traverse?.(child => {
      if (child instanceof Mesh || child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        child.material = Array.isArray(child.material)
          ? child.material.map(updateMat)
          : updateMat(child.material);
      }
    });

    targets[name]?.add(detailClone);
  }
}

/**
 * Aligns a cylinder mesh between two 3D spatial points.
 */
export function alignCylinderBetweenPoints(mesh, p1, p2, resolveContextFn = resolveContext) {
  const { Vector3 } = resolveContextFn();
  mesh.position.set((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, (p1.z + p2.z) / 2);
  const dir = new Vector3(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z);
  const len = dir.length();
  dir.divideScalar(len || 1);
  mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir);
  mesh.scale.set(1, len, 1);
}

/**
 * Updates suspension coil spring and shock absorber alignment.
 */
export function updateSuspensionUnitSpring(susUnit, knuckleY, resolveContextFn = resolveContext) {
  const { Vector3 } = resolveContextFn();
  const dir = new Vector3(0, knuckleY - susUnit.top.y, susUnit.botZ - susUnit.top.z);
  const len = dir.length();
  dir.divideScalar(len || 1);
  susUnit.group.quaternion.setFromUnitVectors(new Vector3(0, -1, 0), dir);
  susUnit.spring.scale.y = len / susUnit.built;
  const shaftLen = Math.max(1, len - susUnit.bodyLen * 0.5);
  susUnit.shaft.scale.y = shaftLen;
  susUnit.shaft.position.y = -shaftLen / 2;
  susUnit.body.position.y = -(len - susUnit.bodyLen / 2);
}

/**
 * Full static showcase loader for realistic buggy vehicle (used by Garage Turntable).
 */

/**
 * Creates vehicle offroad wheel procedural mesh with rims and tire tread.
 */
function createOffroadWheelMesh(radius, width, mats, resolveContextFn = resolveContext) {
  const { Group, LatheGeometry, CylinderGeometry, Vector2, Mesh } = resolveContextFn();
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
function createSuspensionUnit(length, matSpring, matShaft, matBody, resolveContextFn = resolveContext) {
  const { Group, CylinderGeometry, Mesh } = resolveContextFn();
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
function createSuspensionKnuckle(innerZ, mat, resolveContextFn = resolveContext) {
  const { Group, CylinderGeometry, SphereGeometry, Mesh } = resolveContextFn();
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
function createReactionControlJet(pos, dirX, dirY, dirZ, resolveContextFn = resolveContext) {
  const { Group } = resolveContextFn();
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
function setupCarReactionJets(vehicleGimbals, resolveContextFn = resolveContext) {
  if (!vehicleGimbals || !vehicleGimbals.jets) return null;
  const jets = vehicleGimbals.jets;
  const makeJet = (pos, dx, dy, dz) => {
    const jet = createReactionControlJet(pos, dx, dy, dz, resolveContextFn);
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

export async function loadRealisticCarShowcase(teamColor = DEFAULT_TEAM_COLORS[DEFAULT_PLAYER_TEAM_INDEX], resolveContextFn = resolveContext) {
  const ctx = resolveContextFn();
  const { Group, Mesh, CylinderGeometry, MeshStandardMaterial, Vector3, setShadowFlags } = ctx;

  const detailsAsset = await loadRealisticCarAsset(resolveContextFn);
  const root = new Group();
  const frame = createRealisticCarModel(teamColor, {}, resolveContextFn);
  root.add(frame.group);

  const gimbals = createRealisticCarGimbals(resolveContextFn);
  assembleRealisticCar(detailsAsset, frame, gimbals, teamColor, resolveContextFn);
  root.add(gimbals.root);

  const wheelMats = {
    tire: new MeshStandardMaterial({ color: 1447965, roughness: 0.96 }),
    lug: new MeshStandardMaterial({ color: 987412, roughness: 0.98 }),
    rim: new MeshStandardMaterial({ color: 1909033, roughness: 0.3, metalness: 0.9 }),
    accent: new MeshStandardMaterial({ color: teamColor, roughness: 0.3, metalness: 0.7 })
  };
  const matSpring = new MeshStandardMaterial({ color: teamColor, roughness: 0.28, metalness: 0.7 });
  const matShaft = new MeshStandardMaterial({ color: 15133423, roughness: 0.1, metalness: 1 });
  const matBody = new MeshStandardMaterial({ color: 1711652, roughness: 0.3, metalness: 0.9 });
  const matArm = new MeshStandardMaterial({ color: 2830134, roughness: 0.45, metalness: 0.8 });

  for (let i = 0; i < REALISTIC_WHEEL_COORDS.length; i++) {
    const [wx, wy, wz] = REALISTIC_WHEEL_COORDS[i];
    const dropY = wz - REALISTIC_SUSPENSION_Z;
    const wheelAnchor = new Group();
    wheelAnchor.position.set(wx, dropY, wy);

    const wheelRotGroup = new Group();
    const wheelMesh = createOffroadWheelMesh(wz, REALISTIC_TIRE_WIDTH, wheelMats);
    wheelMesh.rotation.x = Math.PI / 2;
    wheelRotGroup.add(wheelMesh);
    wheelAnchor.add(wheelRotGroup, createSuspensionKnuckle(frame.suspension[i].innerZ - wy));
    root.add(wheelAnchor);

    const { top, innerZ, foreRoot, aftRoot } = frame.suspension[i];
    const spanDist = Math.hypot(dropY - top.y, innerZ - top.z);
    const susUnit = createSuspensionUnit(spanDist, matSpring, matShaft, matBody);
    susUnit.group.position.copy(top);
    root.add(susUnit.group);
    updateSuspensionUnitSpring({ ...susUnit, top, botZ: innerZ }, dropY, resolveContextFn);

    const knucklePt = new Vector3(wx, dropY, innerZ);
    for (const rootPt of [foreRoot, aftRoot]) {
      const armMesh = new Mesh(new CylinderGeometry(1.5, 1.5, 1, 10), matArm);
      alignCylinderBetweenPoints(armMesh, rootPt, knucklePt, resolveContextFn);
      root.add(armMesh);
    }
  }

  if (typeof setShadowFlags === "function") setShadowFlags(root);
  setupCarReactionJets(frame);
  return root;
}

/**
 * Full static showcase loader for Octane vehicle (used by Garage Turntable).
 */
export async function loadGameCarShowcase(teamColor = DEFAULT_TEAM_COLORS[DEFAULT_PLAYER_TEAM_INDEX], resolveContextFn = resolveContext) {
  const { Group } = resolveContextFn();
  const root = new Group();
  const asset = await loadGameCarAsset(resolveContextFn);
  root.add(createGameCarModel(asset, teamColor, undefined, resolveContextFn));

  OCTANE_WHEEL_COORDS.forEach(([wx, wz, wy], idx) => {
    const dropY = wy - REALISTIC_SUSPENSION_Z;
    const anchor = new Group();
    anchor.position.set(wx, dropY, wz);
    const rotGroup = new Group();
    rotGroup.add(createGameCarWheel(asset, idx, resolveContextFn));
    anchor.add(createGameCarWheelHardware(asset, idx, resolveContextFn), rotGroup);
    root.add(anchor);
  });

  return root;
}

/**
 * Full static showcase loader for Dominus flat car (used by Garage Turntable).
 */
export async function loadFlatCarShowcase(teamColor = DEFAULT_TEAM_COLORS[DEFAULT_PLAYER_TEAM_INDEX], resolveContextFn = resolveContext) {
  const { Group } = resolveContextFn();
  const root = new Group();
  const asset = await loadFlatCarAsset(resolveContextFn);
  root.add(createFlatCarModel(asset, teamColor, resolveContextFn));

  FLAT_CAR_WHEEL_COORDS.forEach(([wx, wz], idx) => {
    const wheelGroup = createFlatCarWheel(asset, idx, teamColor, resolveContextFn);
    wheelGroup.position.set(wx, FLAT_CAR_SUSPENSION_HEIGHTS[idx], wz);
    root.add(wheelGroup);
  });

  return root;
}

// Backward-compatibility aliases
export {
  loadGameCarAsset as Uh,
  loadFlatCarAsset as Y0,
  loadRealisticCarAsset as og,
  createGameCarModel as z0,
  createFlatCarModel as Z0,
  createGameCarWheel as V0,
  createGameCarWheelHardware as W0,
  createFlatCarWheel as Q0,
  detachOctaneWheelHardware as Yb,
  getOctaneTransformMatrix as Jb,
  findMeshByMaterialName as Kb,
  findMeshObjectByName as np,
  createCarPaintMaterial as ul,
  mapVehicleMaterial as ip,
  applyVehicleMaterials as fl,
  cloneVehicleMeshWithPaint as $0,
  getCarVisualTheme as r1,
  createRealisticCarModel as sg,
  createRealisticCarGimbals as rg,
  assembleRealisticCar as Ag,
  updateRealisticCockpitGimbal as h1,
  lerpPolyline as dp,
  alignCylinderBetweenPoints as FM,
  updateSuspensionUnitSpring as DM,
  loadRealisticCarShowcase as NM,
  loadGameCarShowcase as GM,
  loadFlatCarShowcase as OM,
  OCTANE_SCALE as Ir,
  OCTANE_SCALE_X as G0,
  OCTANE_OFFSET_X as O0,
  OCTANE_OFFSET_Y as H0,
  OCTANE_WHEEL_NAMES as U0,
  OCTANE_ASSET_WHEEL_NAMES as Vb,
  OCTANE_WHEEL_COORDS as q0,
  OCTANE_BOOST_OUTLETS as Wb,
  OCTANE_DEFAULT_COLORS as Zb,
  FLAT_CAR_DEFAULT_COLORS as $d,
  FLAT_CAR_BOT_COLORS as n1,
  FLAT_CAR_HITBOX_OFFSET as Qb,
  FLAT_CAR_WHEEL_COORDS as X0,
  FLAT_CAR_SUSPENSION_HEIGHTS as J0,
  FLAT_CAR_BOOST_OUTLETS as t1,
  FLAT_CAR_WHEEL_NAMES as K0,
  REALISTIC_WHEEL_COORDS as VA,
  REALISTIC_SUSPENSION_Z as zA,
  REALISTIC_TIRE_WIDTH as Wd,
  REALISTIC_DETAIL_NAMES as ag,
  DEFAULT_PLAYER_TEAM_INDEX as Ni
};
