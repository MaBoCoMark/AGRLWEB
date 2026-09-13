import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VehicleBoostEmitter,
  RealisticBoostEmitter,
  ArcadeBoostParticleMesh,
  RealisticBoostParticleMesh,
  createArcadeBoostFlameConeGeometry,
  createArcadeBoostFlameConeMaterial,
  createRealisticBoostConeGeometry,
  createRealisticBoostConeMaterial,
  createNozzleFlash,
  createBoostFlare,
  loadGoldenBoostTextures,
  evalCurveLut,
  setVehicleBoostEmitterThreeContext,
  resolveContext,
  K1,
  O1,
  Sp,
  jp,
  W1,
  X1,
  J1,
  G1,
  D1,
  N1,
  _p,
  Dn
} from '../src/entities/VehicleBoostEmitter.js';

test('1. Curve LUT interpolation (evalCurveLut / Dn)', () => {
  const lut = new Float32Array([0, 10, 20, 30, 40]);
  assert.equal(evalCurveLut(lut, 0), 0);
  assert.equal(evalCurveLut(lut, 1), 40);
  assert.equal(evalCurveLut(lut, 0.5), 20);
  assert.equal(evalCurveLut(lut, 0.25), 10);
  assert.equal(evalCurveLut(lut, -1), 0, 'Clamps below 0');
  assert.equal(evalCurveLut(lut, 2), 40, 'Clamps above 1');

  // Alias
  assert.equal(Dn(lut, 0.5), 20);
});

test('2. Arcade Boost flame cone and glint generation (createArcadeBoostFlameConeGeometry / createNozzleFlash)', () => {
  const { Vector3 } = resolveContext();

  const geom = createArcadeBoostFlameConeGeometry(11);
  assert.ok(geom.attributes.position, 'Must generate position buffer attribute');
  assert.ok(geom.attributes.uv, 'Must generate uv buffer attribute');
  assert.ok(geom.index, 'Must generate index attribute');
  assert.ok(geom.attributes.position.count > 0);

  const mat = createArcadeBoostFlameConeMaterial();
  assert.equal(mat.name, 'Arcade / painted flame');
  assert.ok(mat.uniforms.time);
  assert.ok(mat.uniforms.opacity);

  const glint = createNozzleFlash(new Vector3(-2, 0, 0));
  assert.ok(glint);
  assert.equal(glint.renderOrder, 7);
  assert.ok(glint.geometry.attributes.position);
});

test('3. Realistic Boost cone geometry and lens flare generation', () => {
  const { Vector3 } = resolveContext();

  const geom = createRealisticBoostConeGeometry(3.4, 24);
  assert.ok(geom.attributes.position);
  assert.ok(geom.attributes.uv);
  assert.ok(geom.index);

  const flare = createBoostFlare(new Vector3(-2, 0, 0));
  assert.ok(flare);
  assert.equal(flare.renderOrder, 7);
  assert.ok(flare.geometry.attributes.position);
});

test('4. Instanced Particle Meshes (ArcadeBoostParticleMesh & RealisticBoostParticleMesh)', () => {
  // Arcade
  const arcadeMesh = new ArcadeBoostParticleMesh(16, true, 5);
  assert.ok(arcadeMesh.mesh);
  assert.equal(arcadeMesh.mesh.name, 'drive-puffs');
  assert.equal(arcadeMesh.offsets.length, 16 * 3);
  assert.equal(arcadeMesh.sizes.length, 16 * 2);
  assert.equal(arcadeMesh.opacity.length, 16);
  arcadeMesh.markDirty();

  // Realistic
  const { textures } = loadGoldenBoostTextures();
  const realMesh = new RealisticBoostParticleMesh(32, textures, 5);
  assert.ok(realMesh.mesh);
  assert.equal(realMesh.offsets.length, 32 * 3);
  assert.equal(realMesh.colorScale.length, 32);
  realMesh.setTime(1.23);
  realMesh.markDirty();
});

test('5. VehicleBoostEmitter lifecycle, updates, and bloomActive tracking', async () => {
  const { Group, Vector3 } = resolveContext();
  const scene = new Group();
  const carRoot = new Group();
  const nozzlePos = new Vector3(-40, 20, 0);

  const emitter = new VehicleBoostEmitter(scene, carRoot, nozzlePos, true, false);
  assert.ok(emitter);
  assert.equal(emitter.bloomActive, false, 'Inactive emitter should not request bloom');

  // Preload
  await emitter.preload();

  // Spatial audio update
  emitter.setSpatial(true);

  // Update tick - Idle driving
  emitter.update(false, true, true, 0.016, true);
  assert.ok(emitter.coneOpacity < 0.002, 'Driving should not trigger flame cone');

  // Update tick - Full boosting
  for (let i = 0; i < 10; i++) {
    emitter.update(true, false, true, 0.016, true);
  }
  assert.ok(emitter.coneOpacity > 0.1, 'Boosting should ramp up cone opacity');
  assert.equal(emitter.bloomActive, true, 'Active boosting should trigger bloomActive');

  // Reset visual
  emitter.resetVisual();
  assert.equal(emitter.coneOpacity, 0);
  assert.equal(emitter.bloomActive, false);

  // Audio cleanup
  emitter.disposeAudio();
});

test('6. RealisticBoostEmitter lifecycle and update loop', async () => {
  const { Group, Vector3, PointLight } = resolveContext();
  const scene = new Group();
  const carRoot = new Group();
  const nozzlePos = new Vector3(-40, 20, 0);
  const light = new PointLight(0xffaa22, 0, 300, 2);

  const realEmitter = new RealisticBoostEmitter(scene, carRoot, nozzlePos, light);
  assert.ok(realEmitter);
  assert.equal(realEmitter.bloomActive, false);

  await realEmitter.preload();

  // Update tick with boosting
  for (let i = 0; i < 10; i++) {
    realEmitter.update(true, false, true, 0.016);
  }
  assert.ok(realEmitter.coneOpacity > 0.1);
  assert.equal(realEmitter.bloomActive, true);

  realEmitter.reset();
  assert.equal(realEmitter.coneOpacity, 0);
  assert.equal(realEmitter.bloomActive, false);
});

test('7. Backward compatibility aliases match implementations', () => {
  assert.equal(K1, VehicleBoostEmitter);
  assert.equal(O1, RealisticBoostEmitter);
  assert.equal(Sp, ArcadeBoostParticleMesh);
  assert.equal(jp, RealisticBoostParticleMesh);
  assert.equal(W1, createArcadeBoostFlameConeGeometry);
  assert.equal(X1, createArcadeBoostFlameConeMaterial);
  assert.equal(J1, createNozzleFlash);
  assert.equal(G1, createBoostFlare);
  assert.equal(D1, createRealisticBoostConeGeometry);
  assert.equal(N1, createRealisticBoostConeMaterial);
  assert.equal(_p, loadGoldenBoostTextures);
  assert.equal(Dn, evalCurveLut);
});
