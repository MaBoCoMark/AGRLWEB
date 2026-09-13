/**
 * tests/theme_materials_and_prewarmer.test.js
 * Comprehensive unit tests for Dual-Theme Material Pipeline, Shader Prewarmer, and SW Manager.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createMultiThemeMaterial,
  getThemeMaterial,
  isMultiThemeMaterial,
  resolveThemeMaterial,
  registerThemeSubtree,
  getArcadeLightRampTexture,
  createCelShadedToonMaterial,
  applyArcadeCelShading,
  setThemeMaterialThreeContext,
  vn,
  Vi,
  F0,
  D0,
  Ji,
  markMatrixDirty,
  Nr,
  cloneMaterial,
  N0,
  setShadowFlags
} from '../src/effects/ThemeMaterialPipeline.js';

import {
  prewarmSceneShaders,
  hB,
  setShaderPrewarmerThreeContext
} from '../src/game/ShaderPrewarmer.js';

import {
  waitForServiceWorkerActivation,
  registerGameServiceWorker,
  DEFAULT_SW_SCOPE,
  DEFAULT_SW_SCRIPT,
  lB,
  cB,
  td,
  pm
} from '../src/utils/ServiceWorkerManager.js';

import { setTheme, getTheme } from '../src/ui/ThemeManager.js';

// Setup Mock Three.js environment for tests
class MockVector2 {
  constructor(x = 1, y = 1) { this.x = x; this.y = y; }
  copy(v) { this.x = v.x; this.y = v.y; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; return this; }
}

class MockColor {
  constructor(r = 1, g = 1, b = 1) { this.r = r; this.g = g; this.b = b; }
  copy(c) { this.r = c.r; this.g = c.g; this.b = c.b; return this; }
}

class MockMaterial {
  constructor(params = {}) {
    this.name = params.name || '';
    this.color = new MockColor();
    this.emissive = new MockColor(0, 0, 0);
    this.emissiveIntensity = 0;
    this.normalScale = new MockVector2(1, 1);
    this.transparent = Boolean(params.transparent);
    this.transmission = params.transmission || 0;
    this.flatShading = Boolean(params.flatShading);
    this.fog = true;
    this.wireframe = false;
    this.wireframeLinewidth = 1;
    this.gradientMap = params.gradientMap || null;
    this.isMaterial = true;
    this.onBeforeCompile = MockMaterial.prototype.onBeforeCompile;
    Object.assign(this, params);
  }
  copy(source) {
    Object.assign(this, source);
    return this;
  }
}
MockMaterial.prototype.onBeforeCompile = function() {};

class MockMeshStandardMaterial extends MockMaterial {
  constructor(params) {
    super(params);
    this.isMeshStandardMaterial = true;
  }
}

class MockMeshPhysicalMaterial extends MockMeshStandardMaterial {
  constructor(params) {
    super(params);
    this.isMeshPhysicalMaterial = true;
  }
}

class MockMeshToonMaterial extends MockMaterial {
  constructor(params) {
    super(params);
    this.isMeshToonMaterial = true;
  }
}

class MockMesh {
  constructor(geometry = null, material = null) {
    this.id = Math.random().toString(36).slice(2);
    this.geometry = geometry;
    this.material = material;
    this.children = [];
    this.parent = null;
    this.visible = true;
    this.frustumCulled = true;
    this.isMesh = true;
  }
  add(child) {
    child.parent = this;
    this.children.push(child);
  }
  traverse(cb) {
    cb(this);
    for (const c of this.children) {
      c.traverse(cb);
    }
  }
}

class MockLight {
  constructor() {
    this.id = 'light_' + Math.random().toString(36).slice(2);
    this.isLight = true;
    this.visible = true;
    this.children = [];
    this.parent = null;
  }
  traverse(cb) {
    cb(this);
    for (const c of this.children) c.traverse(cb);
  }
}

setThemeMaterialThreeContext({
  Mesh: MockMesh,
  MeshStandardMaterial: MockMeshStandardMaterial,
  MeshPhysicalMaterial: MockMeshPhysicalMaterial,
  MeshToonMaterial: MockMeshToonMaterial,
  Material: MockMaterial
});

setShaderPrewarmerThreeContext({
  Light: MockLight,
  Mesh: MockMesh
});

test('1. Multi-theme material registration and reactive switching', () => {
  const arcadeMat = new MockMaterial({ name: 'arcade-emerald' });
  const realMat = new MockMaterial({ name: 'realistic-emerald' });

  setTheme('realistic', { persist: false });
  const activeMat = createMultiThemeMaterial(arcadeMat, realMat);

  assert.equal(activeMat, realMat, 'Should return realistic variant when theme is realistic');
  assert.equal(isMultiThemeMaterial(arcadeMat), true);
  assert.equal(isMultiThemeMaterial(realMat), true);
  assert.equal(isMultiThemeMaterial(new MockMaterial()), false);

  assert.equal(getThemeMaterial(arcadeMat, 'arcade'), arcadeMat);
  assert.equal(getThemeMaterial(arcadeMat, 'realistic'), realMat);
  assert.equal(getThemeMaterial(realMat, 'arcade'), arcadeMat);

  // Array resolution
  const resolved = resolveThemeMaterial([arcadeMat, realMat], 'arcade');
  assert.deepEqual(resolved, [arcadeMat, arcadeMat]);

  // Reactive theme switch
  setTheme('arcade', { persist: false });
  assert.equal(createMultiThemeMaterial(arcadeMat, realMat), arcadeMat);
});

test('2. Arcade cel-shading light ramp and toon material generator', () => {
  const ramp = getArcadeLightRampTexture();
  assert.ok(ramp, 'Ramp texture must be created');
  assert.equal(ramp.width, 4);
  assert.equal(ramp.height, 1);
  assert.deepEqual(Array.from(ramp.data), [28, 90, 170, 255]);

  const toon = createCelShadedToonMaterial({ name: 'test-toon' });
  assert.ok(toon.isMeshToonMaterial, 'Should create a MeshToonMaterial');
  assert.equal(toon.gradientMap, ramp, 'Should link the arcade gradient light ramp');
});

test('3. applyArcadeCelShading converts hierarchy and tracks theme changes', () => {
  const root = new MockMesh();
  const standardMat = new MockMeshStandardMaterial({ name: 'car-body' });
  standardMat.color.r = 0.5;
  standardMat.normalScale.x = 2;
  standardMat.normalScale.y = 2;

  const childMesh = new MockMesh(null, standardMat);
  root.add(childMesh);

  // Excluded child mesh
  const hitboxMesh = new MockMesh(null, new MockMeshStandardMaterial({ name: 'hitbox-mat' }));
  hitboxMesh.name = 'car-hitbox';
  root.add(hitboxMesh);

  setTheme('realistic', { persist: false });
  applyArcadeCelShading(root);

  // Body mesh should now have a multi-theme material
  assert.ok(isMultiThemeMaterial(childMesh.material), 'childMesh material should be converted to multi-theme');
  assert.equal(childMesh.material, standardMat, 'Current theme is realistic, so material is standardMat');

  // Switch to arcade theme: childMesh material should automatically update to toon
  setTheme('arcade', { persist: false });
  assert.ok(childMesh.material.isMeshToonMaterial, 'childMesh material should automatically become toon material');
  assert.equal(childMesh.material.normalScale.x, 0.4, 'NormalScale should be softened by 0.2 factor');

  // Hitbox should not have been converted
  assert.ok(!isMultiThemeMaterial(hitboxMesh.material), 'Hitbox mesh must not be converted');
});

test('4. Backward-compatibility aliases for ThemeMaterialPipeline', () => {
  assert.equal(vn, createMultiThemeMaterial);
  assert.equal(Vi, getThemeMaterial);
  assert.equal(F0, isMultiThemeMaterial);
  assert.equal(D0, resolveThemeMaterial);
  assert.equal(Ji, registerThemeSubtree);
  assert.equal(markMatrixDirty, registerThemeSubtree);
  assert.equal(Nr, createCelShadedToonMaterial);
  assert.equal(cloneMaterial, createCelShadedToonMaterial);
  assert.equal(N0, applyArcadeCelShading);
  assert.equal(setShadowFlags, applyArcadeCelShading);
});

test('5. ShaderPrewarmer (hB) executes scene compileAsync, bloom, and restores state safely', async () => {
  const scene = new MockMesh();
  const light = new MockLight();
  const mesh = new MockMesh();
  scene.add(light);
  scene.add(mesh);

  const mockCamera = {};
  let compileCalls = 0;
  let bloomCalls = 0;
  let finalCalls = 0;

  const mockRenderer = {
    shadowMap: { enabled: true, needsUpdate: false },
    getRenderTarget: () => null,
    setRenderTarget: () => {},
    compileAsync: async (s, c) => {
      compileCalls++;
    }
  };

  const mockPipeline = {
    passes: [{ enabled: false }],
    disappearingLightRoots: [light],
    renderBloom: async () => { bloomCalls++; },
    renderFinal: () => { finalCalls++; }
  };

  await prewarmSceneShaders(mockRenderer, scene, mockCamera, mockPipeline);

  assert.ok(compileCalls > 0, 'compileAsync must be called');
  assert.ok(bloomCalls > 0, 'renderBloom must be called');
  assert.ok(finalCalls > 0, 'renderFinal must be called');
  assert.equal(mesh.visible, true, 'Original visibility restored');
  assert.equal(hB, prewarmSceneShaders, 'Backward compatibility alias hB matches');
});

test('6. ServiceWorkerManager lifecycle and aliases', async () => {
  assert.equal(td, DEFAULT_SW_SCOPE);
  assert.equal(pm, DEFAULT_SW_SCRIPT);
  assert.equal(lB, waitForServiceWorkerActivation);
  assert.equal(cB, registerGameServiceWorker);

  // Already active worker
  const activeWorker = { state: 'activated', addEventListener: () => {} };
  await assert.doesNotReject(() => waitForServiceWorkerActivation(activeWorker));

  // Transitioning worker
  let stateListener = null;
  const pendingWorker = {
    state: 'installing',
    addEventListener: (event, fn) => { if (event === 'statechange') stateListener = fn; },
    removeEventListener: () => {}
  };

  const waitPromise = waitForServiceWorkerActivation(pendingWorker);
  pendingWorker.state = 'installed';
  if (stateListener) stateListener();
  await assert.doesNotReject(() => waitPromise);
});
