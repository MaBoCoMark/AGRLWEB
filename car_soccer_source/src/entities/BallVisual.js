/**
 * BallVisual.js
 * Visual representation of the soccer ball in both Arcade and Realistic modes.
 * - Arcade: High-detail procedural geodesic truncated icosahedron with rounded panels, pentagons, and hexagons.
 * - Realistic: PBR GLTF model with normal maps, roughness/metalness maps, and custom emissive glow shaders.
 */

import { onThemeChange } from '../ui/ThemeManager.js';

export const CLASSIC_BALL_RADIUS = 95;

let ballVisualThreeContext = {
  Group: null,
  Mesh: null,
  BufferGeometry: null,
  BufferAttribute: null,
  IcosahedronGeometry: null,
  MeshStandardMaterial: null,
  Vector2: null,
  Vector3: null,
  Color: null,
  GLTFLoader: null,
  TextureLoader: null,
  SRGBColorSpace: 'srgb'
};

export function setBallVisualThreeContext(context) {
  ballVisualThreeContext = { ...ballVisualThreeContext, ...context };
}

function resolveContext() {
  const G = ballVisualThreeContext;
  return {
    Group: G.Group || (typeof THREE !== 'undefined' ? THREE.Group : class {
      constructor() { this.children = []; this.name = ''; this.scale = { setScalar() {} }; }
      add(...items) { this.children.push(...items); }
      traverse(fn) { fn(this); this.children.forEach(c => c.traverse?.(fn)); }
    }),
    Mesh: G.Mesh || (typeof THREE !== 'undefined' ? THREE.Mesh : class {
      constructor(geo, mat) {
        this.geometry = geo;
        this.material = mat;
        this.name = '';
        this.castShadow = true;
        this.receiveShadow = true;
        this.children = [];
      }
      add(...items) { this.children.push(...items); }
      traverse(fn) { fn(this); this.children.forEach(c => c.traverse?.(fn)); }
    }),
    BufferGeometry: G.BufferGeometry || (typeof THREE !== 'undefined' ? THREE.BufferGeometry : class {
      constructor() {
        this.attributes = {};
        this.userData = {};
      }
      setAttribute(k, v) { this.attributes[k] = v; }
      setIndex(idx) { this.index = idx; }
      computeBoundingSphere() {}
      computeBoundingBox() {}
      dispose() {}
    }),
    BufferAttribute: G.BufferAttribute || (typeof THREE !== 'undefined' ? THREE.BufferAttribute : class {
      constructor(arr, itemSize) { this.array = arr; this.itemSize = itemSize; this.count = arr ? arr.length / itemSize : 0; }
    }),
    IcosahedronGeometry: G.IcosahedronGeometry || (typeof THREE !== 'undefined' ? THREE.IcosahedronGeometry : class {
      constructor(radius = 1, detail = 0) {
        const phi = (1 + Math.sqrt(5)) / 2;
        const rawVerts = [
          [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
          [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
          [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1]
        ];
        const indices = [
          0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11,
          1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
          3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9,
          4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1
        ];
        const positions = [];
        for (const idx of indices) {
          const v = rawVerts[idx];
          const len = Math.hypot(v[0], v[1], v[2]);
          positions.push((v[0] / len) * radius, (v[1] / len) * radius, (v[2] / len) * radius);
        }
        this.attributes = {
          position: {
            array: positions,
            count: indices.length,
            fromBufferAttribute(attr, i) {
              const base = i * 3;
              return new (resolveContext().Vector3)(positions[base], positions[base + 1], positions[base + 2]);
            }
          }
        };
      }
      getAttribute(k) { return this.attributes[k]; }
      dispose() {}
    }),
    MeshStandardMaterial: G.MeshStandardMaterial || (typeof THREE !== 'undefined' ? THREE.MeshStandardMaterial : class {
      constructor(opt = {}) { Object.assign(this, opt); this.emissive = opt.emissive ? { copy() {} } : null; }
    }),
    Vector2: G.Vector2 || (typeof THREE !== 'undefined' ? THREE.Vector2 : class {
      constructor(x = 0, y = 0) { this.x = x; this.y = y; }
    }),
    Vector3: G.Vector3 || (typeof THREE !== 'undefined' ? THREE.Vector3 : class {
      constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
      copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
      clone() { return new this.constructor(this.x, this.y, this.z); }
      add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
      lerp(v, t) { this.x += (v.x - this.x) * t; this.y += (v.y - this.y) * t; this.z += (v.z - this.z) * t; return this; }
      normalize() {
        const l = Math.hypot(this.x, this.y, this.z);
        if (l > 1e-6) { this.x /= l; this.y /= l; this.z /= l; }
        return this;
      }
      cross(v) {
        const ax = this.x, ay = this.y, az = this.z, bx = v.x, by = v.y, bz = v.z;
        this.x = ay * bz - az * by;
        this.y = az * bx - ax * bz;
        this.z = ax * by - ay * bx;
        return this;
      }
      dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
      toArray() { return [this.x, this.y, this.z]; }
      fromBufferAttribute(attr, idx) {
        if (!attr || !attr.array) return this;
        const i = idx * 3;
        this.x = attr.array[i];
        this.y = attr.array[i + 1];
        this.z = attr.array[i + 2];
        return this;
      }
    }),
    Color: G.Color || (typeof THREE !== 'undefined' ? THREE.Color : class {
      constructor(hex = 0) {
        this.r = ((hex >> 16) & 255) / 255;
        this.g = ((hex >> 8) & 255) / 255;
        this.b = (hex & 255) / 255;
      }
    }),
    GLTFLoader: G.GLTFLoader || (typeof THREE !== 'undefined' && THREE.GLTFLoader ? THREE.GLTFLoader : class {}),
    TextureLoader: G.TextureLoader || (typeof THREE !== 'undefined' && THREE.TextureLoader ? THREE.TextureLoader : class {}),
    SRGBColorSpace: G.SRGBColorSpace ?? 'srgb'
  };
}

/**
 * Builds a procedurally generated truncated icosahedron (classic soccer ball geodesic mesh)
 * with rounded panel bevels, pentagon center points, and per-vertex colors.
 * @param {number|null} patternColor Hex color for black panel patches
 */
export function createGeodesicSoccerBallGeometry(patternColor = null) {
  const {
    BufferGeometry,
    BufferAttribute,
    IcosahedronGeometry,
    Vector3,
    Color
  } = resolveContext();

  const baseIco = new IcosahedronGeometry(1, 0);
  const posAttr = baseIco.getAttribute("position");
  const uniqueVertices = [];
  const vertexLookup = new Map();
  const faces = [];

  if (posAttr) {
    for (let i = 0; i < posAttr.count; i += 3) {
      const face = [];
      for (let c = 0; c < 3; c++) {
        const v = new Vector3().fromBufferAttribute(posAttr, i + c);
        const key = v.toArray().map(val => Number(val).toFixed(6)).join(",");
        if (!vertexLookup.has(key)) {
          vertexLookup.set(key, uniqueVertices.length);
          uniqueVertices.push(v);
        }
        face.push(vertexLookup.get(key));
      }
      faces.push(face);
    }
  }
  baseIco.dispose();

  const lerpNorm = (aIdx, bIdx) => uniqueVertices[aIdx].clone().lerp(uniqueVertices[bIdx], 1 / 3).normalize();
  const adjacent = uniqueVertices.map(() => new Set());
  const panels = [];

  for (const [a, b, c] of faces) {
    adjacent[a].add(b).add(c);
    adjacent[b].add(a).add(c);
    adjacent[c].add(a).add(b);
    panels.push({
      corners: [lerpNorm(a, b), lerpNorm(b, a), lerpNorm(b, c), lerpNorm(c, b), lerpNorm(c, a), lerpNorm(a, c)],
      black: false
    });
  }

  for (let i = 0; i < uniqueVertices.length; i++) {
    const v = uniqueVertices[i].clone().normalize();
    const up = (Math.abs(v.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0)).cross(v).normalize();
    const right = v.clone().cross(up);
    const sorted = [...adjacent[i]].map(adj => lerpNorm(i, adj));
    sorted.sort((p1, p2) => Math.atan2(p1.dot(right), p1.dot(up)) - Math.atan2(p2.dot(right), p2.dot(up)));
    panels.push({
      corners: sorted,
      black: true
    });
  }

  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];

  const whiteColor = new Color(16052713);
  const darkColor = patternColor != null ? new Color(patternColor) : new Color(1054498);
  const seamColor = new Color(3423560);

  const addVertex = (vNorm, radius, col) => {
    const idx = positions.length / 3;
    positions.push(vNorm.x * radius, vNorm.y * radius, vNorm.z * radius);
    normals.push(vNorm.x, vNorm.y, vNorm.z);
    colors.push(col.r, col.g, col.b);
    return idx;
  };

  for (const { corners, black } of panels) {
    const center = corners.reduce((acc, cur) => acc.add(cur), new Vector3()).normalize();
    const panelColor = black ? darkColor : whiteColor;
    const centerIdx = addVertex(center, CLASSIC_BALL_RADIUS, panelColor);
    const interpolated = [];

    for (let i = 0; i < corners.length; i++) {
      for (let step = 0; step < 3; step++) {
        interpolated.push(corners[i].clone().lerp(corners[(i + 1) % corners.length], step / 3).normalize());
      }
    }

    let previousRing = null;
    for (const radiusFraction of [0.3, 0.6, 0.85, 0.975, 1.0]) {
      const isRim = radiusFraction === 1.0;
      const currentRing = interpolated.map(pt =>
        addVertex(
          center.clone().lerp(pt, radiusFraction).normalize(),
          CLASSIC_BALL_RADIUS - (isRim ? 0.7 : 0),
          isRim ? seamColor : panelColor
        )
      );

      for (let i = 0; i < currentRing.length; i++) {
        const next = (i + 1) % currentRing.length;
        if (previousRing) {
          indices.push(previousRing[i], currentRing[i], currentRing[next], previousRing[i], currentRing[next], previousRing[next]);
        } else {
          indices.push(centerIdx, currentRing[i], currentRing[next]);
        }
      }
      previousRing = currentRing;
    }
  }

  const geometry = new BufferGeometry();
  geometry.name = "Classic soccer ball / rounded panels";
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("normal", new BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute("color", new BufferAttribute(new Float32Array(colors), 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  geometry.userData.panels = {
    pentagons: panels.filter(p => p.corners.length === 5).length,
    hexagons: panels.filter(p => p.corners.length === 6).length
  };

  return geometry;
}

/**
 * Creates the classic arcade soccer ball mesh.
 */
export function createClassicSoccerBall(patternColor = null) {
  const { Mesh, Group, MeshStandardMaterial } = resolveContext();
  const geometry = createGeodesicSoccerBallGeometry(patternColor);
  const material = new MeshStandardMaterial({
    name: "Classic soccer ball / matte leather",
    vertexColors: true
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = "Classic soccer ball";
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const group = new Group();
  group.name = "ball";
  group.add(mesh);
  return group;
}

let cachedRealisticBallPromise = null;

/**
 * Loads the realistic GLTF soccer ball with normal maps and dynamic emissive lamps.
 */
export function loadRealisticBallModel(gltfLoader = null, textureLoader = null) {
  if (cachedRealisticBallPromise) return cachedRealisticBallPromise;

  const {
    Group,
    Mesh,
    MeshStandardMaterial,
    Vector2,
    GLTFLoader,
    TextureLoader,
    SRGBColorSpace
  } = resolveContext();

  const gLoader = gltfLoader || new GLTFLoader();
  const tLoader = textureLoader || new TextureLoader();

  cachedRealisticBallPromise = Promise.all([
    gLoader.loadAsync("/assets/ball/ball.gltf"),
    tLoader.loadAsync("/assets/ball/albedo.png"),
    tLoader.loadAsync("/assets/ball/normal.png"),
    tLoader.loadAsync("/assets/ball/material-mask.png")
  ]).then(([gltf, albedo, normal, mask]) => {
    for (const tex of [albedo, normal, mask]) {
      tex.flipY = false;
      tex.anisotropy = 8;
    }
    albedo.colorSpace = SRGBColorSpace;

    const material = new MeshStandardMaterial({
      name: "Realistic ball / metal panels and inset lamps",
      map: albedo,
      normalMap: normal,
      normalScale: new Vector2(1, -1),
      roughness: 0.62,
      roughnessMap: mask,
      metalness: 0.55,
      metalnessMap: mask,
      emissive: 6473671,
      emissiveIntensity: 0.78
    });

    material.onBeforeCompile = shader => {
      shader.uniforms.ballMaterialMask = { value: mask };
      shader.fragmentShader = shader.fragmentShader
        .replace("uniform vec3 diffuse;", "uniform vec3 diffuse;\nuniform sampler2D ballMaterialMask;")
        .replace("#include <emissivemap_fragment>", "totalEmissiveRadiance *= texture2D(ballMaterialMask, vMapUv).rrr;");
    };
    material.customProgramCacheKey = () => "car-soccer-ball";

    const ballGroup = new Group();
    ballGroup.name = "Realistic ball";
    ballGroup.add(gltf.scene);
    if (ballGroup.scale?.setScalar) {
      ballGroup.scale.setScalar(100);
    }
    ballGroup.traverse(child => {
      if (child instanceof Mesh) {
        child.material = material;
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    return ballGroup;
  }).catch(err => {
    cachedRealisticBallPromise = null;
    throw err;
  });

  return cachedRealisticBallPromise;
}

/**
 * Creates the composite soccer ball entity containing both Arcade and Realistic representations,
 * switching between them dynamically on theme changes.
 */
export async function loadBallAsset(gltfLoader = null, textureLoader = null) {
  const compositeGroup = createClassicSoccerBall();
  try {
    const realisticBall = (await loadRealisticBallModel(gltfLoader, textureLoader)).clone(true);
    compositeGroup.add(realisticBall);
  } catch (e) {
    // Expected in test environment without WebGL / assets
  }

  const weakGroup = new WeakRef(compositeGroup);
  if (typeof onThemeChange === 'function') {
    onThemeChange(theme => {
      const g = weakGroup.deref();
      if (g && g.children.length >= 2) {
        g.children[0].visible = theme === "arcade";
        g.children[1].visible = theme === "realistic";
      }
    });
  }

  return compositeGroup;
}

// Backward-compatibility aliases
export {
  createGeodesicSoccerBallGeometry as rS,
  createClassicSoccerBall as iS,
  loadRealisticBallModel as sS,
  loadBallAsset as aS,
  CLASSIC_BALL_RADIUS as wp
};
