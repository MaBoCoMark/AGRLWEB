/**
 * src/effects/ThemeMaterialPipeline.js
 * Dual-Theme Material & Cel-Shading Pipeline (Phase 7.6 Deobfuscation)
 *
 * Provides reactive multi-theme material pairing (Arcade cel-shading toon ramp vs Realistic PBR),
 * material conversion for arcade rendering, and automatic scene hierarchy tracking synchronized
 * with ThemeManager.
 *
 * Upstream deobfuscated symbols:
 * - vn -> createMultiThemeMaterial
 * - Vi -> getThemeMaterial
 * - F0 -> isMultiThemeMaterial
 * - D0 -> resolveThemeMaterial
 * - Ji -> registerThemeSubtree (formerly misnamed in context injections as markMatrixDirty)
 * - $s -> getArcadeLightRampTexture
 * - Nr -> createCelShadedToonMaterial (formerly misnamed in context injections as cloneMaterial)
 * - N0 -> applyArcadeCelShading (formerly misnamed in context injections as setShadowFlags)
 */

import { getTheme, onThemeChange } from '../ui/ThemeManager.js';

// Three.js Dependency Injection Context
let themeThreeContext = {
  Mesh: null,
  MeshStandardMaterial: null,
  MeshPhysicalMaterial: null,
  MeshToonMaterial: null,
  Material: null,
  DataTexture: null,
  RGBAFormat: 1028,
  NearestFilter: 1003
};

export function setThemeMaterialThreeContext(context) {
  if (!context) return;
  const descriptors = Object.getOwnPropertyDescriptors(context);
  Object.defineProperties(themeThreeContext, descriptors);
}

export function resolveThemeContext() {
  const C = themeThreeContext;

  class FallbackMaterial {
    constructor(params = {}) {
      this.name = params.name || '';
      this.color = { copy: (c) => { if (c) { this.color.r = c.r; this.color.g = c.g; this.color.b = c.b; } return this.color; }, r: 1, g: 1, b: 1 };
      this.emissive = { copy: (c) => { if (c) { this.emissive.r = c.r; this.emissive.g = c.g; this.emissive.b = c.b; } return this.emissive; }, r: 0, g: 0, b: 0 };
      this.normalScale = { copy: (s) => { if (s) { this.normalScale.x = s.x; this.normalScale.y = s.y; } return this.normalScale; }, multiplyScalar: (m) => { this.normalScale.x *= m; this.normalScale.y *= m; return this.normalScale; }, x: 1, y: 1 };
      this.transparent = Boolean(params.transparent);
      this.gradientMap = params.gradientMap || null;
      Object.assign(this, params);
    }
    copy(source) {
      Object.assign(this, source);
      return this;
    }
  }

  class FallbackMesh {
    constructor(geometry = null, material = null) {
      this.geometry = geometry;
      this.material = material;
      this.children = [];
      this.parent = null;
      this.isMesh = true;
    }
    traverse(callback) {
      callback(this);
      for (const child of this.children) {
        child.traverse?.(callback);
      }
    }
  }

  class FallbackDataTexture {
    constructor(data, width, height, format) {
      this.data = data;
      this.width = width;
      this.height = height;
      this.format = format;
      this.minFilter = 1003;
      this.magFilter = 1003;
      this.generateMipmaps = false;
      this.needsUpdate = false;
    }
  }

  return {
    Mesh: C.Mesh || FallbackMesh,
    MeshStandardMaterial: C.MeshStandardMaterial || FallbackMaterial,
    MeshPhysicalMaterial: C.MeshPhysicalMaterial || FallbackMaterial,
    MeshToonMaterial: C.MeshToonMaterial || FallbackMaterial,
    Material: C.Material || FallbackMaterial,
    DataTexture: C.DataTexture || FallbackDataTexture,
    RGBAFormat: C.RGBAFormat ?? 1028,
    NearestFilter: C.NearestFilter ?? 1003
  };
}

// Multi-theme material registry
// Maps material variant -> { arcade: Material, realistic: Material }
const multiThemeMaterialMap = new WeakMap();

// Tracked scene meshes with WeakRef to prevent memory leaks
const trackedThemeMeshes = new Set();
const visitedMeshes = new WeakSet();

/**
 * Pairs an arcade-styled material and a realistic material together.
 * Returns the material variant corresponding to the currently active theme.
 *
 * @param {object} arcadeMat
 * @param {object} realisticMat
 * @returns {object} The active theme's material variant
 */
export function createMultiThemeMaterial(arcadeMat, realisticMat) {
  const pair = {
    arcade: arcadeMat,
    realistic: realisticMat
  };
  if (arcadeMat && typeof arcadeMat === 'object') multiThemeMaterialMap.set(arcadeMat, pair);
  if (realisticMat && typeof realisticMat === 'object') multiThemeMaterialMap.set(realisticMat, pair);

  const activeTheme = getTheme();
  return pair[activeTheme] || realisticMat || arcadeMat;
}

/**
 * Returns the requested theme's material variant from a multi-theme material pair.
 * If material is not registered as a multi-theme material, returns the original material.
 *
 * @param {object} material
 * @param {string} themeName 'arcade' | 'realistic'
 * @returns {object}
 */
export function getThemeMaterial(material, themeName) {
  if (!material || typeof material !== 'object') return material;
  const pair = multiThemeMaterialMap.get(material);
  return (pair && pair[themeName]) ? pair[themeName] : material;
}

/**
 * Checks whether the given material is registered as a multi-theme material.
 *
 * @param {object} material
 * @returns {boolean}
 */
export function isMultiThemeMaterial(material) {
  return material && typeof material === 'object' ? multiThemeMaterialMap.has(material) : false;
}

/**
 * Resolves a material or an array of materials to the specified theme variant.
 *
 * @param {object|object[]} materialOrArray
 * @param {string} themeName 'arcade' | 'realistic'
 * @returns {object|object[]}
 */
export function resolveThemeMaterial(materialOrArray, themeName) {
  if (!Array.isArray(materialOrArray)) {
    return getThemeMaterial(materialOrArray, themeName);
  }
  const resolved = [];
  for (let i = 0; i < materialOrArray.length; i++) {
    resolved.push(getThemeMaterial(materialOrArray[i], themeName));
  }
  return resolved;
}

/**
 * Traverses an Object3D hierarchy and registers all meshes that have multi-theme materials.
 * Ignores UI indicators and hitboxes.
 * Updates material on initial registration and tracks mesh via WeakRef for subsequent theme changes.
 *
 * @param {object} rootObject
 */
export function registerThemeSubtree(rootObject) {
  if (!rootObject || typeof rootObject.traverse !== 'function') return;

  const { Mesh } = resolveThemeContext();
  const currentTheme = getTheme();

  rootObject.traverse((node) => {
    // Skip special non-theme visual meshes
    let p = node;
    while (p) {
      if (p.name === 'flip-reset-indicator' || p.name === 'realistic-reset-pulse' || p.name === 'car-hitbox') {
        return;
      }
      p = p.parent;
    }

    const isMeshNode = (node instanceof Mesh) || node.isMesh;
    if (!isMeshNode || visitedMeshes.has(node)) return;

    const materials = Array.isArray(node.material) ? node.material : [node.material];
    const hasMultiTheme = materials.some(isMultiThemeMaterial);

    if (hasMultiTheme) {
      visitedMeshes.add(node);
      trackedThemeMeshes.add(new WeakRef(node));
      node.material = resolveThemeMaterial(node.material, currentTheme);
    }
  });
}

// Subscribe to global theme change events to hot-swap materials on all live meshes
onThemeChange((newTheme) => {
  for (const weakRef of trackedThemeMeshes) {
    const mesh = weakRef.deref();
    if (mesh) {
      mesh.material = resolveThemeMaterial(mesh.material, newTheme);
    } else {
      trackedThemeMeshes.delete(weakRef);
    }
  }
});

// Cached 4-pixel cel-shading light ramp gradient texture
let cachedLightRamp = null;

/**
 * Returns the singleton 4-pixel arcade cel-shading ramp DataTexture.
 * RGBA values: [28, 90, 170, 255]
 */
export function getArcadeLightRampTexture() {
  if (!cachedLightRamp) {
    const { DataTexture, RGBAFormat, NearestFilter } = resolveThemeContext();
    const data = new Uint8Array([28, 90, 170, 255]);
    cachedLightRamp = new DataTexture(data, 4, 1, RGBAFormat);
    cachedLightRamp.name = 'Arcade / painted light ramp';
    cachedLightRamp.minFilter = NearestFilter;
    cachedLightRamp.magFilter = NearestFilter;
    cachedLightRamp.generateMipmaps = false;
    cachedLightRamp.needsUpdate = true;
  }
  return cachedLightRamp;
}

/**
 * Creates a MeshToonMaterial with the arcade cel light ramp assigned as its gradientMap.
 *
 * @param {object} params
 * @returns {object} MeshToonMaterial instance
 */
export function createCelShadedToonMaterial(params = {}) {
  const { MeshToonMaterial } = resolveThemeContext();
  return new MeshToonMaterial({
    ...params,
    gradientMap: getArcadeLightRampTexture()
  });
}

/**
 * Traverses a 3D hierarchy and automatically converts standard PBR materials into
 * paired dual-theme (Arcade cel-shading Toon / Realistic Standard) materials.
 *
 * @param {object} rootObject
 */
export function applyArcadeCelShading(rootObject) {
  if (!rootObject || typeof rootObject.traverse !== 'function') return;

  const { Mesh, MeshStandardMaterial, MeshPhysicalMaterial, Material } = resolveThemeContext();

  const convertMaterial = (mat) => {
    if (!mat) return mat;
    if (isMultiThemeMaterial(mat)) {
      return getThemeMaterial(mat, getTheme());
    }

    const isStandard = (mat instanceof MeshStandardMaterial) || mat.isMeshStandardMaterial;
    const isPhysical = (mat instanceof MeshPhysicalMaterial) || mat.isMeshPhysicalMaterial;

    // Do not convert transparent, transmission glass, or custom shader materials
    if (!isStandard || mat.transparent) return mat;
    if (isPhysical && mat.transmission > 0) return mat;
    if (Material.prototype && mat.onBeforeCompile !== Material.prototype.onBeforeCompile) return mat;

    const toonMat = createCelShadedToonMaterial({});

    // Copy core standard material properties
    if (Material.prototype && typeof Material.prototype.copy === 'function') {
      Material.prototype.copy.call(toonMat, mat);
    } else if (typeof toonMat.copy === 'function') {
      toonMat.copy(mat);
    }

    if (mat.color && toonMat.color && typeof toonMat.color.copy === 'function') toonMat.color.copy(mat.color);
    if (mat.emissive && toonMat.emissive && typeof toonMat.emissive.copy === 'function') toonMat.emissive.copy(mat.emissive);
    toonMat.emissiveIntensity = mat.emissiveIntensity;
    toonMat.map = mat.map;
    toonMat.alphaMap = mat.alphaMap;
    toonMat.aoMap = mat.aoMap;
    toonMat.aoMapIntensity = mat.aoMapIntensity;
    toonMat.lightMap = mat.lightMap;
    toonMat.lightMapIntensity = mat.lightMapIntensity;
    toonMat.emissiveMap = mat.emissiveMap;
    toonMat.normalMap = mat.normalMap;
    toonMat.normalMapType = mat.normalMapType;
    if (mat.normalScale && toonMat.normalScale && typeof toonMat.normalScale.copy === 'function') {
      toonMat.normalScale.copy(mat.normalScale);
      if (typeof toonMat.normalScale.multiplyScalar === 'function') {
        toonMat.normalScale.multiplyScalar(0.2);
      }
    }
    toonMat.flatShading = mat.flatShading;
    toonMat.fog = mat.fog;
    toonMat.wireframe = mat.wireframe;
    toonMat.wireframeLinewidth = mat.wireframeLinewidth;

    return createMultiThemeMaterial(toonMat, mat);
  };

  rootObject.traverse((node) => {
    // Skip special non-theme subtrees (indicators, hitboxes)
    let p = node;
    while (p) {
      if (p.name === 'flip-reset-indicator' || p.name === 'realistic-reset-pulse' || p.name === 'car-hitbox') {
        return;
      }
      p = p.parent;
    }

    const isMeshNode = (node instanceof Mesh) || node.isMesh;
    if (isMeshNode && node.material) {
      node.material = Array.isArray(node.material)
        ? node.material.map(convertMaterial)
        : convertMaterial(node.material);
    }
  });

  registerThemeSubtree(rootObject);
}

// Backward-Compatibility Aliases matching legacy obfuscated engine & context bindings:
export {
  createMultiThemeMaterial as vn,
  getThemeMaterial as Vi,
  isMultiThemeMaterial as F0,
  resolveThemeMaterial as D0,
  registerThemeSubtree as Ji,
  registerThemeSubtree as markMatrixDirty,
  getArcadeLightRampTexture as getLightRamp,
  createCelShadedToonMaterial as Nr,
  createCelShadedToonMaterial as cloneMaterial,
  applyArcadeCelShading as N0,
  applyArcadeCelShading as setShadowFlags
};
