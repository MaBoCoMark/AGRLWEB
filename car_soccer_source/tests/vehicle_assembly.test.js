/**
 * VehicleAssembly Subsystem Unit Tests
 *
 * Verifies Octane, Dominus, and realistic buggy model builders,
 * procedural space-frame assembly, gimbal orientation solver,
 * paint material shaders, and backward-compatibility aliases.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OCTANE_SCALE,
  OCTANE_SCALE_X,
  OCTANE_OFFSET_X,
  OCTANE_OFFSET_Y,
  OCTANE_WHEEL_NAMES,
  OCTANE_WHEEL_COORDS,
  OCTANE_BOOST_OUTLETS,
  OCTANE_DEFAULT_COLORS,
  FLAT_CAR_DEFAULT_COLORS,
  FLAT_CAR_BOT_COLORS,
  FLAT_CAR_HITBOX_OFFSET,
  FLAT_CAR_WHEEL_COORDS,
  FLAT_CAR_SUSPENSION_HEIGHTS,
  FLAT_CAR_BOOST_OUTLETS,
  FLAT_CAR_WHEEL_NAMES,
  REALISTIC_WHEEL_COORDS,
  REALISTIC_SUSPENSION_Z,
  REALISTIC_TIRE_WIDTH,
  REALISTIC_DIMENSIONS,
  REALISTIC_DETAIL_NAMES,
  getOctaneTransformMatrix,
  detachOctaneWheelHardware,
  createCarPaintMaterial,
  mapVehicleMaterial,
  applyVehicleMaterials,
  loadGameCarAsset,
  loadFlatCarAsset,
  loadRealisticCarAsset,
  assembleRealisticCar,
  createGameCarModel,
  createGameCarWheel,
  createGameCarWheelHardware,
  createFlatCarModel,
  createFlatCarWheel,
  getCarVisualTheme,
  lerpPolyline,
  createRealisticCarGimbals,
  updateRealisticCockpitGimbal,
  createRealisticCarModel,
  alignCylinderBetweenPoints,
  updateSuspensionUnitSpring,
  loadRealisticCarShowcase,
  loadGameCarShowcase,
  loadFlatCarShowcase,
  // Aliases
  Uh, Y0, og, z0, Z0, V0, W0, Q0, Yb, Jb, Kb, np, ul, ip, fl, $0, r1,
  sg, rg, Ag, h1, dp, FM, DM, NM, GM, OM,
  Ir, G0, O0, H0, U0, Vb, q0, Wb, Zb, $d, n1, Qb, X0, J0, t1, K0,
  VA, zA, Wd, ag, Ni
} from '../src/entities/VehicleAssembly.js';

import { resolveContext } from '../src/entities/ArenaWorld.js';

test('1. Vehicle physical dimensions and coordinate constants match Rocket League / RocketSim specs', () => {
  assert.equal(OCTANE_SCALE, 105, 'Octane asset scale must be 105');
  assert.equal(OCTANE_SCALE_X, 0.951984748575128);
  assert.equal(OCTANE_OFFSET_X, 3.3438630034881425);
  assert.equal(OCTANE_OFFSET_Y, -15);
  assert.equal(OCTANE_WHEEL_NAMES.length, 4);
  assert.equal(OCTANE_WHEEL_COORDS.length, 4);

  // Twin rear boost exhaust outlets
  assert.equal(OCTANE_BOOST_OUTLETS.length, 2);
  assert.equal(OCTANE_BOOST_OUTLETS[0][0], -57);
  assert.equal(OCTANE_BOOST_OUTLETS[0][1], 10.25);
  assert.equal(OCTANE_BOOST_OUTLETS[0][2], 20.4278);
  assert.equal(OCTANE_BOOST_OUTLETS[1][2], -20.4278);

  // Dominus (Flat Car)
  assert.equal(FLAT_CAR_WHEEL_COORDS.length, 4);
  assert.equal(FLAT_CAR_SUSPENSION_HEIGHTS.length, 4);
  assert.equal(FLAT_CAR_BOOST_OUTLETS.length, 2);
  assert.ok(FLAT_CAR_BOOST_OUTLETS[0][0] < -57);

  // Realistic Buggy
  assert.equal(REALISTIC_WHEEL_COORDS.length, 4);
  assert.equal(REALISTIC_SUSPENSION_Z, 17);
  assert.equal(REALISTIC_TIRE_WIDTH, 16);
  assert.equal(REALISTIC_DIMENSIONS.length, 120.507);
  assert.equal(REALISTIC_DIMENSIONS.width, 86.6994);
  assert.equal(REALISTIC_DIMENSIONS.height, 38.6591);
  assert.equal(REALISTIC_DETAIL_NAMES.length, 5);
});

test('2. Procedural buggy frame generator (createRealisticCarModel / sg) builds complete tubular structure', () => {
  const model = createRealisticCarModel(3111891);
  assert.ok(model);
  assert.ok(model.group);
  assert.equal(model.group.name, 'procedural-buggy-frame');
  assert.ok(model.group.children.length > 20, 'Buggy frame should comprise numerous structural tube members');

  // Verify stations and suspension anchors
  assert.ok(model.stations);
  assert.ok(model.stations.nose > model.stations.tail);
  assert.equal(model.suspension.length, 4, 'Frame must provide suspension pickup geometry for all 4 wheels');
  for (const sus of model.suspension) {
    assert.ok(sus.top);
    assert.ok(sus.foreRoot);
    assert.ok(sus.aftRoot);
    assert.ok(typeof sus.innerZ === 'number');
  }

  // Verify boost outlet point
  assert.ok(model.boostOutlet);
  assert.ok(model.boostOutlet.x < model.stations.tail);
});

test('3. Cockpit 3-axis gimbal builder (createRealisticCarGimbals / rg) builds articulated cockpit hierarchy', () => {
  const gimbals = createRealisticCarGimbals();
  assert.ok(gimbals);
  assert.ok(gimbals.root);
  assert.ok(gimbals.visual);
  assert.equal(gimbals.visual.name, 'gimbal-cockpit');
  assert.ok(gimbals.hitbox);
  assert.ok(gimbals.rollRing);
  assert.ok(gimbals.cradle);
  assert.equal(gimbals.cradle.name, 'gimbal-pitch-cradle');
  assert.ok(gimbals.seat);
  assert.equal(gimbals.seat.name, 'gimbal-seat-swivel');
  assert.equal(gimbals.rollAngle, 0);
  assert.equal(gimbals.cradleAngle, 0);
  assert.ok(Number.isNaN(gimbals.seatHeading));

  // Check that the racing seat has the thin bucket shell and yoke
  const bucketMesh = gimbals.seat.children.find(c => c.name === 'thin-racing-bucket-shell');
  assert.ok(bucketMesh, 'Bucket seat shell must be present');
});

test('4. Gimbal orientation solver (updateRealisticCockpitGimbal / h1) tracks vehicle physics', () => {
  const { Quaternion } = resolveContext();
  const gimbals = createRealisticCarGimbals();
  const quat = new Quaternion(0, 0, 0, 1);

  // Update with zero velocity and identity quaternion
  updateRealisticCockpitGimbal(quat, 0, 0, 0.016, gimbals);
  assert.ok(typeof gimbals.rollAngle === 'number');
  assert.ok(typeof gimbals.cradleAngle === 'number');
  assert.ok(!Number.isNaN(gimbals.seatHeading), 'Seat heading should be initialized');

  // Update with strong forward velocity
  updateRealisticCockpitGimbal(quat, 500, 0, 0.016, gimbals);
  assert.ok(gimbals.seat.rotation);
  assert.ok(typeof gimbals.seat.rotation.y === 'number');
});

test('5. Procedural vehicle paint shader (createCarPaintMaterial / ul) configures dual-theme palette', () => {
  const palette = createCarPaintMaterial(3111891, OCTANE_DEFAULT_COLORS);
  assert.ok(palette);
  assert.ok(palette.body);
  assert.ok(palette.wheelMetal);
  assert.ok(palette.tire);
  assert.ok(palette.lowerDetail);
  assert.ok(palette.lamps);
  assert.ok(palette.tailLamps);

  // Check shader onBeforeCompile hook on realistic pearl paint
  const testShader = {
    uniforms: {},
    fragmentShader: '#include <normal_fragment_maps>\nuniform vec3 diffuse;'
  };
  const realisticPaint = palette.body.realistic || palette.body;
  if (typeof realisticPaint.onBeforeCompile === 'function') {
    realisticPaint.onBeforeCompile(testShader);
    assert.ok(testShader.uniforms.pearlColor, 'Shader must inject pearlColor uniform');
    assert.ok(testShader.fragmentShader.includes('pearlFresnel'), 'Shader must inject fresnel formula');
  }
});

test('6. Octane model and wheel separation (createGameCarModel, createGameCarWheel, createGameCarWheelHardware)', () => {
  const { Group, Mesh, BufferGeometry, BufferAttribute, MeshStandardMaterial } = resolveContext();

  const mockGeom = new BufferGeometry();
  mockGeom.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 1, 1, 2, 2, 2]), 3));
  const mockMat = new MeshStandardMaterial({ name: 'lower-detail' });
  const mockBodyMesh = new Mesh(mockGeom, mockMat);
  mockBodyMesh.name = 'game-car-body';

  const mockWheels = [0, 1, 2, 3].map(i => {
    const w = new Mesh(mockGeom, mockMat);
    w.name = OCTANE_WHEEL_NAMES[i];
    return w;
  });

  const mockAsset = {
    body: mockBodyMesh,
    wheels: mockWheels,
    wheelHardware: mockWheels.map(w => w.clone ? w.clone() : w)
  };

  const gameCar = createGameCarModel(mockAsset, 3111891);
  assert.ok(gameCar);
  assert.equal(gameCar.name, 'game-car');
  assert.ok(gameCar.children.find(c => c.name === 'game-car-shell'));

  const wheel0 = createGameCarWheel(mockAsset, 0);
  assert.ok(wheel0);
  assert.equal(wheel0.name, OCTANE_WHEEL_NAMES[0]);

  const hw0 = createGameCarWheelHardware(mockAsset, 0);
  assert.ok(hw0);
});

test('7. Dominus (Flat Car) assembly (createFlatCarModel, createFlatCarWheel, getCarVisualTheme)', () => {
  const { Mesh, BufferGeometry, BufferAttribute, MeshStandardMaterial } = resolveContext();

  const mockGeom = new BufferGeometry();
  mockGeom.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 1, 1, 2, 2, 2]), 3));
  const mockMat = new MeshStandardMaterial({ name: 'paint' });
  const mockBodyMesh = new Mesh(mockGeom, mockMat);
  mockBodyMesh.name = 'flat-car-body';

  const mockWheels = [0, 1, 2, 3].map(i => {
    const w = new Mesh(mockGeom, mockMat);
    w.name = FLAT_CAR_WHEEL_NAMES[i];
    return w;
  });

  const mockAsset = {
    body: mockBodyMesh,
    wheels: mockWheels
  };

  const flatCar = createFlatCarModel(mockAsset, 13857839);
  assert.ok(flatCar);
  assert.equal(flatCar.name, 'flat-car');

  const wheel1 = createFlatCarWheel(mockAsset, 1, 13857839);
  assert.ok(wheel1);
  assert.equal(wheel1.name, FLAT_CAR_WHEEL_NAMES[1]);

  const botTheme = getCarVisualTheme('flat-car');
  assert.equal(botTheme, FLAT_CAR_BOT_COLORS);
});

test('8. Geometry alignment and suspension spring helpers (alignCylinderBetweenPoints, updateSuspensionUnitSpring, lerpPolyline)', () => {
  const { Mesh, CylinderGeometry, MeshStandardMaterial, Vector3 } = resolveContext();
  const cylinder = new Mesh(new CylinderGeometry(1, 1, 10, 8), new MeshStandardMaterial());

  const p1 = new Vector3(0, 0, 0);
  const p2 = new Vector3(10, 0, 0);
  alignCylinderBetweenPoints(cylinder, p1, p2);
  assert.equal(cylinder.position.x, 5);
  assert.equal(cylinder.position.y, 0);
  assert.equal(cylinder.position.z, 0);
  assert.equal(cylinder.scale.y, 10);

  // Piecewise polyline lerp
  const poly = [
    new Vector3(0, 0, 0),
    new Vector3(10, 10, 10),
    new Vector3(20, 0, 0)
  ];
  const midPt = lerpPolyline(poly, 5);
  assert.equal(midPt.x, 5);
  assert.equal(midPt.y, 5);
  assert.equal(midPt.z, 5);

  const clampedEnd = lerpPolyline(poly, 30);
  assert.equal(clampedEnd.x, 20);
});

test('9. Full backward-compatibility aliases check', () => {
  assert.equal(Uh, loadGameCarAsset);
  assert.equal(Y0, loadFlatCarAsset);
  assert.equal(og, loadRealisticCarAsset);
  assert.equal(z0, createGameCarModel);
  assert.equal(Z0, createFlatCarModel);
  assert.equal(V0, createGameCarWheel);
  assert.equal(W0, createGameCarWheelHardware);
  assert.equal(Q0, createFlatCarWheel);
  assert.equal(Yb, detachOctaneWheelHardware);
  assert.equal(Jb, getOctaneTransformMatrix);
  assert.equal(ul, createCarPaintMaterial);
  assert.equal(ip, mapVehicleMaterial);
  assert.equal(fl, applyVehicleMaterials);
  assert.equal(r1, getCarVisualTheme);
  assert.equal(sg, createRealisticCarModel);
  assert.equal(rg, createRealisticCarGimbals);
  assert.equal(Ag, assembleRealisticCar);
  assert.equal(h1, updateRealisticCockpitGimbal);
  assert.equal(dp, lerpPolyline);
  assert.equal(FM, alignCylinderBetweenPoints);
  assert.equal(DM, updateSuspensionUnitSpring);
  assert.equal(NM, loadRealisticCarShowcase);
  assert.equal(GM, loadGameCarShowcase);
  assert.equal(OM, loadFlatCarShowcase);
  assert.equal(Ir, OCTANE_SCALE);
  assert.equal(Ni, 0);
});

test('10. Wheel assembly and paint material parameter robustness (regression for TypeError: resolveContextFn is not a function)', () => {
  const { Group, Mesh, BufferGeometry, BufferAttribute, MeshStandardMaterial } = resolveContext();

  const mockGeom = new BufferGeometry();
  mockGeom.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 1, 1, 2, 2, 2]), 3));
  const mockMat = new MeshStandardMaterial({ name: 'lower-detail' });
  const mockBodyMesh = new Mesh(mockGeom, mockMat);
  mockBodyMesh.name = 'game-car-body';

  const mockWheels = [0, 1, 2, 3].map(i => {
    const w = new Mesh(mockGeom, mockMat);
    w.name = OCTANE_WHEEL_NAMES[i];
    return w;
  });

  const mockAsset = {
    body: mockBodyMesh,
    wheels: mockWheels,
    wheelHardware: mockWheels.map(w => w.clone ? w.clone() : w)
  };

  // 1. Test createGameCarWheel with all argument permutations:
  // (asset, index)
  const w1 = createGameCarWheel(mockAsset, 0);
  assert.ok(w1);
  // (asset, index, teamColor) -> passing integer color
  const w2 = createGameCarWheel(mockAsset, 1, 3111891);
  assert.ok(w2);
  // (asset, index, resolveContextFn) -> passing function as 3rd arg
  const w3 = createGameCarWheel(mockAsset, 2, resolveContext);
  assert.ok(w3);
  // (asset, index, teamColor, resolveContextFn)
  const w4 = createGameCarWheel(mockAsset, 3, 13857839, resolveContext);
  assert.ok(w4);

  // 2. Test createGameCarWheelHardware with all argument permutations (Root cause regression):
  // (asset, index)
  const hw1 = createGameCarWheelHardware(mockAsset, 0);
  assert.ok(hw1);
  // (asset, index, teamColor) -> CRITICAL: This was the crash site where resolveContextFn was 3111891
  const hw2 = createGameCarWheelHardware(mockAsset, 1, 3111891);
  assert.ok(hw2);
  // (asset, index, resolveContextFn)
  const hw3 = createGameCarWheelHardware(mockAsset, 2, resolveContext);
  assert.ok(hw3);
  // (asset, index, teamColor, resolveContextFn)
  const hw4 = createGameCarWheelHardware(mockAsset, 3, 13857839, resolveContext);
  assert.ok(hw4);

  // 3. Test createFlatCarWheel with all argument permutations:
  const flatMockAsset = {
    body: mockBodyMesh,
    wheels: mockWheels
  };
  const fw1 = createFlatCarWheel(flatMockAsset, 0);
  assert.ok(fw1);
  const fw2 = createFlatCarWheel(flatMockAsset, 1, 3111891);
  assert.ok(fw2);
  const fw3 = createFlatCarWheel(flatMockAsset, 2, resolveContext);
  assert.ok(fw3);
  const fw4 = createFlatCarWheel(flatMockAsset, 3, 13857839, resolveContext);
  assert.ok(fw4);

  // 4. Test createCarPaintMaterial with all permutations without throwing:
  const p1 = createCarPaintMaterial(3111891);
  assert.ok(p1);
  const p2 = createCarPaintMaterial(3111891, resolveContext);
  assert.ok(p2);
  const p3 = createCarPaintMaterial(resolveContext);
  assert.ok(p3);
  const p4 = createCarPaintMaterial(undefined, undefined, 3111891); // safely falls back, never throws 3111891()
  assert.ok(p4);
});
