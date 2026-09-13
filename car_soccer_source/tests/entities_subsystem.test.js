import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BallLocatorArrow,
  bS,
  createBallLocatorArrowMesh,
  createBallLocatorMaterial,
  BALL_LOCATOR_MIN_DISTANCE,
  BALL_LOCATOR_MAX_DISTANCE,
  BALL_LOCATOR_MIN_OFFSET,
  BALL_LOCATOR_MAX_OFFSET,
  BALL_LOCATOR_HEIGHT_OFFSET,
  BALL_LOCATOR_HALO_SCALE
} from '../src/entities/BallLocatorArrow.js';
import {
  DemolitionEffect,
  nS,
  createDemolitionQuadGeometry,
  DEMOLITION_PARTICLES_COUNT,
  DEMOLITION_SMOKE_DURATION,
  DEMOLITION_FLASH_DURATION,
  DEMOLITION_TOTAL_DURATION
} from '../src/entities/DemolitionEffect.js';
import {
  BoostPadSystem,
  createFallbackPadMeshes,
  BOOST_PAD_BIG_HEIGHT,
  BOOST_PAD_SMALL_HEIGHT,
  BOOST_PAD_BIG_RADIUS,
  BOOST_PAD_SMALL_RADIUS
} from '../src/entities/BoostPadSystem.js';
import {
  SpeedTrail,
  pS,
  createSpeedTrailGlowTexture,
  SPEED_TRAIL_THRESHOLD_SPEED,
  SPEED_TRAIL_MAX_OPACITY,
  SPEED_TRAIL_MAX_POINTS,
  SPEED_TRAIL_RIBBON_WIDTH
} from '../src/entities/SpeedTrail.js';
import {
  createGeodesicSoccerBallGeometry,
  createClassicSoccerBall,
  loadBallAsset,
  rS,
  iS,
  CLASSIC_BALL_RADIUS
} from '../src/entities/BallVisual.js';

test('1. BallLocatorArrow constants, aliases, and geometry creation', () => {
  assert.equal(BALL_LOCATOR_MIN_DISTANCE, 100);
  assert.equal(BALL_LOCATOR_MAX_DISTANCE, 10000);
  assert.equal(BALL_LOCATOR_MIN_OFFSET, 75);
  assert.equal(BALL_LOCATOR_MAX_OFFSET, 120);
  assert.equal(BALL_LOCATOR_HEIGHT_OFFSET, 20);
  assert.equal(BALL_LOCATOR_HALO_SCALE, 48);
  assert.equal(bS, BallLocatorArrow);

  const mat = createBallLocatorMaterial();
  assert.equal(mat.color, 12764618);
  assert.equal(mat.transparent, true);

  const arrowMesh = createBallLocatorArrowMesh();
  assert.equal(arrowMesh.name, 'ball-locator-arrow');
  assert.equal(arrowMesh.renderOrder, 10);
});

test('2. BallLocatorArrow updates direction and visibility correctly', () => {
  const locator = new BallLocatorArrow();
  assert.equal(locator.object.name, 'ball-locator');
  assert.equal(locator.object.visible, false);

  const mockCar = {
    position: { x: 0, y: 17, z: 0 },
    visible: true
  };
  const mockBall = {
    position: { x: 1000, y: 93, z: 0 }
  };

  // Ball cam active -> arrow should stay hidden
  locator.update(mockCar, mockBall, true);
  assert.equal(locator.object.visible, false);

  // Car hidden -> arrow should stay hidden
  mockCar.visible = false;
  locator.update(mockCar, mockBall, false);
  assert.equal(locator.object.visible, false);

  // Normal play with ball cam disabled -> arrow becomes visible
  mockCar.visible = true;
  locator.update(mockCar, mockBall, false);
  assert.equal(locator.object.visible, true);
  assert.ok(locator.direction.x > 0.99, 'Direction vector should point towards ball');
});

test('3. DemolitionEffect constants, quad geometry, and lifecycle', () => {
  assert.equal(DEMOLITION_PARTICLES_COUNT, 12);
  assert.equal(DEMOLITION_SMOKE_DURATION, 1.05);
  assert.equal(DEMOLITION_FLASH_DURATION, 0.18);
  assert.equal(DEMOLITION_TOTAL_DURATION, 1.2);
  assert.equal(nS, DemolitionEffect);

  const quad = createDemolitionQuadGeometry();
  assert.ok(quad.attributes.position);
  assert.ok(quad.attributes.uv);
  assert.equal(quad.attributes.position.array.length, 12);

  const effect = new DemolitionEffect();
  assert.equal(effect.object.name, 'demolition-effect');
  assert.equal(effect.object.visible, false);

  const mockPos = { x: 50, y: 20, z: -100 };

  // 1. Car is initially active (not demolished)
  effect.update(0.016, false, mockPos, true);
  assert.equal(effect.object.visible, false);

  // 2. Transition to demolished state -> triggers explosion
  effect.update(0.016, true, mockPos, true);
  assert.equal(effect.object.visible, true);
  assert.equal(effect.elapsed, 0);

  // 3. Step forward halfway through effect
  effect.update(0.5, true, mockPos, true);
  assert.equal(effect.object.visible, true);
  assert.ok(effect.elapsed >= 0.5);

  // 4. Step past total duration -> effect stops
  effect.update(1.0, true, mockPos, true);
  assert.equal(effect.object.visible, false);
});

test('4. BoostPadSystem fallback meshes, template cloning, and state polling', () => {
  assert.equal(BOOST_PAD_BIG_HEIGHT, 30);
  assert.equal(BOOST_PAD_SMALL_HEIGHT, 15);
  assert.equal(BOOST_PAD_BIG_RADIUS, 80);
  assert.equal(BOOST_PAD_SMALL_RADIUS, 40);

  const bigFallback = createFallbackPadMeshes(true);
  assert.equal(bigFallback.full.position.y, 15);
  assert.equal(bigFallback.base.position.y, 2);

  const smallFallback = createFallbackPadMeshes(false);
  assert.equal(smallFallback.full.position.y, 7.5);

  const padSystem = new BoostPadSystem();
  const mockPadsData = [
    { pos: [0, -3000], isBig: true },
    { pos: [1000, -1500], isBig: false },
    { pos: [-1000, -1500], isBig: false }
  ];

  const mockScene = {
    children: [],
    add(child) { this.children.push(child); }
  };

  padSystem.addPads(mockPadsData, null, mockScene);
  assert.equal(padSystem.pads.length, 3);
  assert.equal(mockScene.children.length, 3);

  // Initial state: full is visible, base is idle
  assert.equal(padSystem.pads[0].full.visible, true);
  assert.equal(padSystem.pads[0].base.visible, false);

  // State buffer: pad 0 is active (1), pad 1 is depleted (0), pad 2 is active (1)
  const boostPadStatesOffset = 10;
  const mockStateBuffer = new Float32Array(50);
  mockStateBuffer[boostPadStatesOffset + 0 * 2] = 1; // Pad 0 Active
  mockStateBuffer[boostPadStatesOffset + 1 * 2] = 0; // Pad 1 Cooldown
  mockStateBuffer[boostPadStatesOffset + 2 * 2] = 1; // Pad 2 Active

  padSystem.update(mockStateBuffer, boostPadStatesOffset);

  assert.equal(padSystem.pads[0].full.visible, true);
  assert.equal(padSystem.pads[0].base.visible, false);

  assert.equal(padSystem.pads[1].full.visible, false);
  assert.equal(padSystem.pads[1].base.visible, true);

  assert.equal(padSystem.pads[2].full.visible, true);
  assert.equal(padSystem.pads[2].base.visible, false);
});

test('5. SpeedTrail ribbon dynamics, supersonic emission, and camera orientation rebuild', () => {
  assert.equal(SPEED_TRAIL_THRESHOLD_SPEED, 2000);
  assert.equal(SPEED_TRAIL_MAX_OPACITY, 0.2);
  assert.equal(SPEED_TRAIL_MAX_POINTS, 60);
  assert.equal(SPEED_TRAIL_RIBBON_WIDTH, 64);
  assert.equal(pS, SpeedTrail);

  const trail = new SpeedTrail();
  assert.equal(trail.object.name, 'ball-speed-trail');
  assert.equal(trail.ribbon.visible, false);

  const sourcePos = {
    x: 0, y: 100, z: 0,
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; },
    distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
  };
  const lowVelocity = { length: () => 500 };
  const supersonicVelocity = { length: () => 2300 };

  // Subsonic update: should not emit trail points
  trail.update(sourcePos, lowVelocity, 0.016);
  assert.equal(trail.points.length, 0);
  assert.equal(trail.ribbon.visible, false);

  // Supersonic updates: should emit trail points
  for (let i = 0; i < 10; i++) {
    sourcePos.x += 40;
    trail.update(sourcePos, supersonicVelocity, 0.02);
  }
  assert.ok(trail.points.length > 0, 'Should have emitted trail points');
  assert.equal(trail.ribbon.visible, true);

  // Prepare camera facing geometry
  const mockCamera = {
    getWorldPosition(target) {
      target.x = 0; target.y = 200; target.z = 500;
    }
  };
  trail.prepare(mockCamera);
  assert.ok(trail.geometry.drawRange.count > 0, 'Draw range should be non-zero after rebuild');

  // Reset clears all active points
  trail.reset();
  assert.equal(trail.points.length, 0);
  assert.equal(trail.geometry.drawRange.count, 0);
});

test('6. BallVisual classic procedural ball and composite asset creation', async () => {
  assert.equal(CLASSIC_BALL_RADIUS, 95);
  assert.equal(rS, createGeodesicSoccerBallGeometry);
  assert.equal(iS, createClassicSoccerBall);

  const geo = createGeodesicSoccerBallGeometry();
  assert.equal(geo.name, 'Classic soccer ball / rounded panels');
  assert.ok(geo.attributes.position);
  assert.ok(geo.attributes.normal);
  assert.ok(geo.attributes.color);
  assert.ok(geo.userData.panels);
  assert.equal(geo.userData.panels.pentagons, 12, 'Geodesic soccer ball has 12 pentagons');
  assert.equal(geo.userData.panels.hexagons, 20, 'Geodesic soccer ball has 20 hexagons');

  const ballMeshGroup = createClassicSoccerBall();
  assert.equal(ballMeshGroup.name, 'ball');
  assert.equal(ballMeshGroup.children.length, 1);
  assert.equal(ballMeshGroup.children[0].name, 'Classic soccer ball');

  // Test composite ball asset loader
  const compositeBall = await loadBallAsset();
  assert.ok(compositeBall);
  assert.equal(compositeBall.children[0].name, 'Classic soccer ball');
});
