import fs from "node:fs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ArenaWorld,
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
  CAR_STATE_STRIDE
} from '../src/entities/ArenaWorld.js';

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
