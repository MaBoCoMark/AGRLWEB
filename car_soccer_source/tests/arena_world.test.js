import THREE from "../src/vendor/three.js";
import fs from "node:fs";
import test from 'node:test';
import assert from 'node:assert/strict';
import { BallTrajectoryPredictor, setBallTrajectoryPredictorThreeContext } from "../src/game/BallTrajectoryPredictor.js";
import {
  ArenaWorld,
  resolveContext,
  ow,
  ARENA_WIDTH,
  ARENA_LENGTH,
  ARENA_GOAL_DEPTH,
  TURF_TEXTURE_WIDTH,
  TURF_TEXTURE_HEIGHT,
  DEFAULT_TEAM_COLORS,
  xn,
  OCTANE_HITBOX_PRESET,
  createCarHitboxWireframe,
  RS,
  createStadiumTurfTexture,
  resolveAssetPath,
  createCompetitionTurfMesh,
  GS,
  updateTurfPadDecals,
  OS,
  createStadiumDomeSky,
  createOffroadWheelMesh,
  gg,
  createSuspensionUnit,
  mg,
  createSuspensionKnuckle,
  vg,
  createReactionControlJet,
  setupCarReactionJets,
  jg,
  BUFFER_OFFSETS,
  CAR_STATE_OFFSETS,
  CAR_STATE_STRIDE,
  OCTANE_BOOST_OUTLETS,
  FLAT_CAR_BOOST_OUTLETS,
  loadStadiumContinuousBoundary,
  loadStadiumArchitecture,
  WS,
  JS
} from '../src/entities/ArenaWorld.js';
import {
  splitBoundaryMeshAtHeight,
  createRoundedGoalPath,
  assembleBakedGeometries
} from '../src/entities/StadiumArena.js';

test('1. Arena constants match Rocket League & RocketSim physical specifications', () => {
  assert.equal(ARENA_WIDTH, 8192, 'Arena width must be 8192 Unreal Units');
  assert.equal(ARENA_LENGTH, 10240, 'Arena length must be 10240 Unreal Units');
  assert.equal(ARENA_GOAL_DEPTH, 5120, 'Goal depth must be 5120 Unreal Units');
  assert.equal(TURF_TEXTURE_WIDTH, 2048, 'Turf canvas width must be 2048');
  assert.equal(TURF_TEXTURE_HEIGHT, 2560, 'Turf canvas height must be 2560');
  assert.equal(DEFAULT_TEAM_COLORS.length, 2, 'Two default team colors');
  assert.equal(OCTANE_HITBOX_PRESET.length, 120.507, 'Octane length matches RocketSim');
  assert.equal(OCTANE_HITBOX_PRESET.width, 86.6994, 'Octane width matches RocketSim');
  assert.equal(OCTANE_HITBOX_PRESET.height, 38.6591, 'Octane height matches RocketSim');
});

test('2. Hitbox wireframe and procedural turf mesh generation', () => {
  const hitbox = createCarHitboxWireframe(OCTANE_HITBOX_PRESET);
  assert.ok(hitbox);
  assert.equal(hitbox.name, 'car-hitbox');
  assert.equal(hitbox.visible, false);
  assert.equal(hitbox.position.x, OCTANE_HITBOX_PRESET.forward);
  assert.equal(hitbox.position.y, OCTANE_HITBOX_PRESET.up);

  const turfMesh = createCompetitionTurfMesh();
  assert.ok(turfMesh);
  assert.equal(turfMesh.name, 'Stadium / competition turf');
  assert.ok(turfMesh.children.length >= 1);
  assert.equal(turfMesh.children[0].name, 'Stadium / painted playing surface');

  const sky = createStadiumDomeSky();
  assert.ok(sky);
  assert.equal(sky.name, 'Stadium / open blue sky');
});

test('3. Vehicle suspension and wheel helpers build valid geometry', () => {
  const mockMats = {
    tire: { name: 'tire' },
    rim: { name: 'rim' }
  };
  const wheel = createOffroadWheelMesh(20.755, 13.5, mockMats);
  assert.ok(wheel);
  assert.equal(wheel.name, 'offroad-wheel');
  assert.equal(wheel.children.length, 2);

  const suspension = createSuspensionUnit(25, {}, {}, {});
  assert.ok(suspension);
  assert.ok(suspension.group);
  assert.ok(suspension.spring);
  assert.ok(suspension.shaft);
  assert.ok(suspension.body);
  assert.equal(suspension.built, 25);

  const knuckle = createSuspensionKnuckle(15, {});
  assert.ok(knuckle);
  assert.equal(knuckle.name, 'suspension-knuckle');

  const jet = createReactionControlJet({ x: 0, y: 10, z: 0 }, 0, 1, 0);
  assert.ok(jet);
  assert.ok(jet.group);
  assert.ok(jet.flame);
});

test('4. ArenaWorld instantiation, car hierarchy, pad setup, and physics stepping', () => {
  const world = new ArenaWorld(91.25, 'game-car');
  assert.ok(world);
  assert.ok(world.scene);
  assert.ok(world.turf);
  assert.ok(world.sky);
  assert.ok(world.ball);
  assert.ok(world.carSun);
  assert.ok(world.ballSun);

  // Add primary player car
  world.addCar(0, 'hitbox-octane');
  assert.equal(world.cars.length, 1);
  assert.equal(world.carHitboxes.length, 1);
  assert.equal(world.carVisuals[0], 'hitbox-octane');

  // Toggle hitboxes
  world.setCarHitboxesVisible(true);
  assert.equal(world.carHitboxes[0].visible, true);
  world.setCarHitboxesVisible(false);
  assert.equal(world.carHitboxes[0].visible, false);

  // Add boost pads
  const mockPads = [
    { pos: [0, 0], isBig: true },
    { pos: [1000, 2000], isBig: false }
  ];
  world.addPads(mockPads);
  assert.equal(world.pads.length, 2);

  // Mock physics buffers (NUM_CARS=1, BALL at offset 1..18, CAR 0 at offset 19..53)
  const prevState = new Float32Array(100);
  const currState = new Float32Array(100);

  currState[BUFFER_OFFSETS.NUM_CARS] = 1;
  // Ball at origin
  currState[BUFFER_OFFSETS.BALL] = 0;
  currState[BUFFER_OFFSETS.BALL + 1] = 0;
  currState[BUFFER_OFFSETS.BALL + 2] = 91.25;

  // Car at (100, 200, 30)
  currState[BUFFER_OFFSETS.CARS] = 100;
  currState[BUFFER_OFFSETS.CARS + 1] = 200;
  currState[BUFFER_OFFSETS.CARS + 2] = 30;
  currState[BUFFER_OFFSETS.CARS + CAR_STATE_OFFSETS.ON_GROUND] = 1;

  world.update(prevState, currState, 0.5, 0.8, 1 / 120, null, null, true);

  // Ball indicator follows ball position
  assert.equal(world.indicatorRing.position.x, world.ball.position.x);
  assert.equal(world.indicatorRing.position.z, world.ball.position.z);

  // Ball trail reset
  world.resetBallTrail();
  assert.ok(world.renderTreeVersion >= 1);
});

test('5. Backward compatibility aliases match implementations', () => {
  assert.equal(ow, ArenaWorld);
  assert.equal(RS, createCarHitboxWireframe);
  assert.equal(GS, createCompetitionTurfMesh);
  assert.equal(OS, updateTurfPadDecals);
  assert.equal(mg, createSuspensionUnit);
  assert.equal(gg, createOffroadWheelMesh);
  assert.equal(vg, createSuspensionKnuckle);
  assert.equal(jg, setupCarReactionJets);
  assert.equal(xn, DEFAULT_TEAM_COLORS);
});

test('6. ArenaWorld teamColors and CarSoccerEngine xn declaration integrity', () => {
  const enginePath = new URL('../src/game/CarSoccerEngine.js', import.meta.url);
  const engineSource = fs.readFileSync(enginePath, 'utf-8');
  const lines = engineSource.split(String.fromCharCode(10));

  let xnImportedOrDeclared = false;
  let firstXnUsageLine = -1;
  let xnDeclarationLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('DEFAULT_TEAM_COLORS as xn') || /\bconst\s+xn\s*=/.test(line)) {
      xnImportedOrDeclared = true;
      if (xnDeclarationLine === -1) xnDeclarationLine = i + 1;
    }
    if (line.includes('teamColors: xn') || line.includes('xn[Ni]')) {
      if (firstXnUsageLine === -1) firstXnUsageLine = i + 1;
    }
  }

  assert.ok(xnImportedOrDeclared, 'Identifier xn must be imported or declared in CarSoccerEngine.js');
  assert.ok(firstXnUsageLine > 0, 'First usage of xn should be found in CarSoccerEngine.js');
  assert.ok(
    xnDeclarationLine > 0 && xnDeclarationLine < firstXnUsageLine,
    "xn must be declared before first usage to avoid ReferenceError"
  );
});

test('7. Exhaust outlets, twin emitters, and hitbox LineSegments verification (Bugs A & C)', () => {
  // Bug C: Hitbox uses LineSegments and EdgesGeometry, not diagonal-triangulated Mesh wireframe
  const hitbox = createCarHitboxWireframe(OCTANE_HITBOX_PRESET);
  assert.ok(hitbox);
  assert.equal(hitbox.name, 'car-hitbox');
  assert.equal(hitbox.material.wireframe, undefined, 'LineBasicMaterial must not rely on quad wireframe triangulation');
  assert.ok(hitbox.geometry.geo, 'Geometry should wrap EdgesGeometry');

  // Bug A: Boost outlets must be at rear (X ~ -57) and lateral offsets (Z != 0)
  assert.equal(OCTANE_BOOST_OUTLETS.length, 2, 'Octane has twin exhausts');
  assert.equal(OCTANE_BOOST_OUTLETS[0][0], -57, 'Left outlet is at car tail');
  assert.equal(OCTANE_BOOST_OUTLETS[0][1], 10.25, 'Left outlet height');
  assert.equal(OCTANE_BOOST_OUTLETS[0][2], 20.4278, 'Left outlet lateral offset');
  assert.equal(OCTANE_BOOST_OUTLETS[1][2], -20.4278, 'Right outlet symmetric lateral offset');

  assert.equal(FLAT_CAR_BOOST_OUTLETS.length, 2, 'Flat car has twin exhausts');
  assert.ok(FLAT_CAR_BOOST_OUTLETS[0][0] < -57, 'Flat car outlet at tail');

  // Verify ArenaWorld creates twin emitters on addCar
  const world = new ArenaWorld(91.25, 'game-car');
  world.addCar(0, 'hitbox-octane');
  assert.equal(world.carBoosts.length, 1);
  assert.equal(world.carBoosts[0].length, 2, 'Car must have exactly two boost emitters at twin outlets');
});

test('8. Stadium boundary mesh splitting and goal path construction (Bug D)', () => {
  assert.equal(typeof splitBoundaryMeshAtHeight, 'function');
  assert.equal(typeof createRoundedGoalPath, 'function');

  // Test triangle splitting across height 280
  const mockGoal = {
    positions: [
      0, 100, 0,
      100, 400, 0,
      -100, 400, 0
    ],
    normals: [0, 1, 0, 0, 1, 0, 0, 1, 0],
    uv: [0, 0, 1, 1, 0, 1],
    indices: [0, 1, 2]
  };
  const [lower, upper] = splitBoundaryMeshAtHeight(mockGoal, 280);
  assert.ok(lower.positions.length > 0, 'Lower bank vertices generated');
  assert.ok(upper.positions.length > 0, 'Upper wall vertices generated');

  // Test goal mouth rounded frame spline
  const goalPath = createRoundedGoalPath(1, 5145);
  assert.ok(goalPath);
  assert.ok(goalPath.curves.length >= 10, 'Goal path has rounded corners with multiple curve segments');
});

test('9. Stadium architecture and visibility toggle (Bug E)', () => {
  const world = new ArenaWorld(91.25, 'game-car');
  const mockStadium = {
    name: 'Stadium / stadium architecture',
    children: [],
    removeFromParent() { this.parent = null; }
  };
  world.stadium = mockStadium;
  world.scene.add(mockStadium);

  world.setStadiumVisible(false);
  assert.equal(world.stadiumVisible, false);

  world.setStadiumVisible(true);
  assert.equal(world.stadiumVisible, true);
  assert.ok(world.scene.children.includes(mockStadium));

  // Backward compatibility alias checks
  assert.equal(WS, loadStadiumContinuousBoundary);
  assert.equal(JS, loadStadiumArchitecture);
});

test('10. ArenaWorld.addCar builds game-car and flat-car wheels with teamColor without TypeError', () => {
  const { Group, Mesh, BufferGeometry, BufferAttribute, MeshStandardMaterial } = resolveContext();

  const mockGeom = new BufferGeometry();
  mockGeom.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 1, 1, 2, 2, 2]), 3));
  const mockMat = new MeshStandardMaterial({ name: 'lower-detail' });
  const mockBodyMesh = new Mesh(mockGeom, mockMat);
  mockBodyMesh.name = 'game-car-body';

  const mockWheels = [0, 1, 2, 3].map(i => {
    const w = new Mesh(mockGeom, mockMat);
    w.name = `wheel_${i}`;
    return w;
  });

  const mockAsset = {
    body: mockBodyMesh,
    wheels: mockWheels,
    wheelHardware: mockWheels.map(w => w.clone ? w.clone() : w)
  };

  // 1. Test game-car with populated gameCarAsset
  const world = new ArenaWorld(91.25, 'game-car');
  world.gameCarAsset = mockAsset;
  // This executes ArenaWorld.js:1387 -> createGameCarWheel and createGameCarWheelHardware with teamColor (3111891)
  world.addCar(0);
  assert.equal(world.cars.length, 1);
  assert.equal(world.carWheels.length, 1);
  assert.equal(world.carWheels[0].length, 4, 'Game car must have 4 steerable and spinning wheels');
  for (let i = 0; i < 4; i++) {
    const w = world.carWheels[0][i];
    assert.ok(w.steer, 'Wheel steer group must exist');
    assert.ok(w.spin, 'Wheel spin group must exist');
    assert.ok(w.steer.children.length >= 2, 'Steer group should contain spin group and hardware');
  }

  // 2. Test flat-car with populated flatCarAsset
  const worldFlat = new ArenaWorld(91.25, 'flat-car');
  worldFlat.flatCarAsset = {
    body: mockBodyMesh,
    wheels: mockWheels
  };
  worldFlat.addCar(1);
  assert.equal(worldFlat.cars.length, 1);
  assert.equal(worldFlat.carWheels.length, 1);
  assert.equal(worldFlat.carWheels[0].length, 4, 'Flat car must have 4 wheels');
});

test("11. Boost pad asset path resolution, turf decals, and padTemplates binding", async () => {
  // 1. resolveAssetPath tests
  assert.equal(resolveAssetPath("/assets/arena/pads/large-active.obj"), "/assets/arena/pads/large-active.obj");
  assert.equal(resolveAssetPath("assets/arena/pads/small-idle.obj"), "/assets/arena/pads/small-idle.obj");
  assert.equal(resolveAssetPath("https://cdn.example.com/pad.obj"), "https://cdn.example.com/pad.obj");

  // 2. ArenaWorld with mock pad templates
  const { Group, Mesh, CylinderGeometry, MeshStandardMaterial } = resolveContext();
  const world = new ArenaWorld(91.25);

  const mockTemplates = {
    bigFull: new Mesh(new CylinderGeometry(80, 80, 30), new MeshStandardMaterial({ name: "big-full" })),
    bigBase: new Mesh(new CylinderGeometry(80, 80, 4), new MeshStandardMaterial({ name: "big-base" })),
    smallFull: new Mesh(new CylinderGeometry(40, 40, 15), new MeshStandardMaterial({ name: "small-full" })),
    smallBase: new Mesh(new CylinderGeometry(40, 40, 4), new MeshStandardMaterial({ name: "small-base" }))
  };
  world.padTemplates = mockTemplates;

  const padDefs = [
    { pos: [0, -3000], isBig: true },
    { pos: [3000, -4000], isBig: true },
    { pos: [-3000, -4000], isBig: true },
    { pos: [1000, -1500], isBig: false }
  ];

  world.addPads(padDefs);
  assert.equal(world.pads.length, 4, "Must register all 4 pads");
  assert.equal(world.pads[0].isBig, true);
  assert.equal(world.pads[3].isBig, false);
  assert.equal(world.pads[0].full.material.name, "big-full");
  assert.equal(world.pads[3].full.material.name, "small-full");

  // Turf decals signature
  updateTurfPadDecals(world.turf, padDefs);
});

test("12. ArenaWorld.loadCarAndPadAssets loads pad models with OBJLoader without resolveURL TypeError", async () => {
  const { setArenaWorldThreeContext, resolveContext } = await import("../src/entities/ArenaWorld.js");
  const { OBJLoader, setOBJLoaderThreeContext } = await import("../src/loaders/OBJLoader.js");

  // Track if resolveURL was called
  let resolveUrlCalled = 0;
  class ThreeStyleFileLoader {
    constructor(manager) {
      this.manager = manager;
      this.path = "";
    }
    setPath(p) { this.path = p; return this; }
    setRequestHeader() { return this; }
    setWithCredentials() { return this; }
    load(url, onLoad, onProgress, onError) {
      assert.equal(typeof this.manager.resolveURL, "function", "manager.resolveURL must exist");
      resolveUrlCalled++;
      const resolved = this.manager.resolveURL(url);
      assert.ok(resolved);
      // Return valid OBJ string
      onLoad("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n");
    }
  }

  class MockTextureLoader {
    loadAsync(url) {
      return Promise.resolve({ isTexture: true, colorSpace: "" });
    }
  }

  setOBJLoaderThreeContext({
    FileLoader: ThreeStyleFileLoader
  });

  setArenaWorldThreeContext({
    OBJLoader: OBJLoader,
    TextureLoader: MockTextureLoader
  });

  const world = new ArenaWorld(91.25);
  await world.loadCarAndPadAssets();

  assert.ok(resolveUrlCalled >= 4, "resolveURL should have been called for all 4 pad OBJ models");
  assert.ok(world.padTemplates, "world.padTemplates must be populated");
  assert.ok(world.padTemplates.bigFull, "bigFull template must exist");
  assert.ok(world.padTemplates.bigBase, "bigBase template must exist");
  assert.ok(world.padTemplates.smallFull, "smallFull template must exist");
  assert.ok(world.padTemplates.smallBase, "smallBase template must exist");
});

test("13. BallTrajectoryPredictor initializes using injected Three.js context", () => {
  class MockGroup {
    constructor() { this.name = ""; this.children = []; }
    add(child) { this.children.push(child); }
  }
  class MockBufferGeometry {
    constructor() { this.attributes = {}; }
    setAttribute(name, attr) { this.attributes[name] = attr; }
    setIndex(idx) { this.index = idx; }
    setDrawRange() {}
  }
  class MockBufferAttribute {
    constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; }
    setUsage() { return this; }
  }
  class MockShaderMaterial {
    constructor(params) { this.uniforms = params.uniforms; }
  }
  class MockMesh {
    constructor(geo, mat) { this.geo = geo; this.mat = mat; this.visible = true; }
  }
  class MockColor {
    constructor(c) { this.color = c; }
    set(c) { this.color = c; }
  }
  class MockVector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    subVectors() { return this; }
    crossVectors() { return this; }
    normalize() { return this; }
    lengthSq() { return 1; }
    multiplyScalar() { return this; }
    copy() { return this; }
  }
  const MockThree = {
    Group: MockGroup,
    BufferGeometry: MockBufferGeometry,
    BufferAttribute: MockBufferAttribute,
    ShaderMaterial: MockShaderMaterial,
    Mesh: MockMesh,
    Color: MockColor,
    Vector3: MockVector3,
    DynamicDrawUsage: 35048,
    NormalBlending: 1,
    DoubleSide: 2
  };

  setBallTrajectoryPredictorThreeContext(MockThree);
  const container = {
    appendChild() {},
    querySelector() { return null; }
  };
  const predictor = new BallTrajectoryPredictor(container, null);
  assert.ok(predictor.object, "predictor group object must exist");
  assert.equal(predictor.object.name, "BallTrajectoryPrediction");
  assert.ok(predictor.mesh, "ribbon mesh must exist");
  assert.equal(predictor.positions.length, 2400 * 3);
});

test("14. loadStadiumArchitecture batching handles interleaved geometries without NaN bounding box / sphere errors", async () => {
  const {
    Group,
    Mesh,
    BufferGeometry,
    InterleavedBuffer,
    InterleavedBufferAttribute,
    MeshStandardMaterial,
    Matrix4
  } = THREE;

  const data = new Float32Array([
    10, 20, 30, 0, 1, 0,
    40, 50, 60, 0, 1, 0
  ]);
  const ib = new InterleavedBuffer(data, 6);
  const posAttr = new InterleavedBufferAttribute(ib, 3, 0);
  const normAttr = new InterleavedBufferAttribute(ib, 3, 3);

  const geo = new BufferGeometry();
  geo.setAttribute("position", posAttr);
  geo.setAttribute("normal", normAttr);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();

  const mat = new MeshStandardMaterial({ name: "Seating bowl" });
  const mesh = new Mesh(geo, mat);
  mesh.matrixWorld = new Matrix4().makeTranslation(100, 0, -200);

  const mockRoot = new Group();
  mockRoot.add(mesh);

  class MockGLTFLoader {
    loadAsync() {
      return Promise.resolve({ scene: mockRoot });
    }
  }

  const customContext = () => ({
    ...resolveContext(),
    GLTFLoader: MockGLTFLoader
  });

  const stadiumContainer = await loadStadiumArchitecture(customContext);
  assert.ok(stadiumContainer, "stadiumContainer must be created");
  assert.equal(stadiumContainer.children.length, 1, "Should have 1 merged batch mesh");

  const batchMesh = stadiumContainer.children[0];
  const batchGeo = batchMesh.geometry;
  assert.ok(batchGeo, "Batch mesh must have geometry");
  assert.ok(batchGeo.boundingBox, "Batch geometry must have boundingBox");
  assert.ok(batchGeo.boundingSphere, "Batch geometry must have boundingSphere");

  assert.ok(Number.isFinite(batchGeo.boundingBox.min.x), "boundingBox min.x must be finite");
  assert.ok(Number.isFinite(batchGeo.boundingBox.max.x), "boundingBox max.x must be finite");
  assert.ok(Number.isFinite(batchGeo.boundingSphere.radius), "boundingSphere radius must be finite");
  assert.ok(batchGeo.boundingSphere.radius > 0, "boundingSphere radius must be > 0");
});

test("15. loadStadiumArchitecture converts seating bowl flat structures into MeshLambertMaterial", async () => {
  const {
    Group,
    Mesh,
    BufferGeometry,
    Float32BufferAttribute,
    MeshStandardMaterial,
    MeshLambertMaterial
  } = THREE;

  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));

  // Create mock seating bowl flat meshes: Basalt and Concrete
  const basaltMat = new MeshStandardMaterial({ name: "Basalt", color: 0x222222 });
  const basaltMesh = new Mesh(geo.clone(), basaltMat);
  basaltMesh.name = "Seating bowl / Basalt slab";

  const concreteMat = new MeshStandardMaterial({ name: "Concrete", color: 0x555555 });
  const concreteMesh = new Mesh(geo.clone(), concreteMat);
  concreteMesh.name = "Seating bowl / Concrete tier";

  const mockRoot = new Group();
  mockRoot.add(basaltMesh);
  mockRoot.add(concreteMesh);

  class MockGLTFLoader {
    loadAsync() {
      return Promise.resolve({ scene: mockRoot });
    }
  }

  const customContext = () => ({
    ...resolveContext(),
    GLTFLoader: MockGLTFLoader,
    MeshLambertMaterial
  });

  const stadiumContainer = await loadStadiumArchitecture(customContext);
  assert.ok(stadiumContainer, "stadiumContainer must be created");

  for (const child of stadiumContainer.children) {
    assert.ok(child.material, "child mesh must have material");
    const mat = child.material;
    // In arcade / flat structures, it should have stadiumFlatStructure set and program cache key prefixed
    if (mat.userData?.stadiumFlatStructure) {
      assert.equal(mat.isMeshLambertMaterial || mat.type === "MeshLambertMaterial", true, "Flat structure material must be MeshLambertMaterial");
      assert.ok(mat.customProgramCacheKey().startsWith("stadium-flat-structure-v1/"), "customProgramCacheKey must have stadium-flat-structure-v1 prefix");
    }
  }
});
