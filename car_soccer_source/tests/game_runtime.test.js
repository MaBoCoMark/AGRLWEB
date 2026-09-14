/**
 * tests/game_runtime.test.js
 * Comprehensive unit and regression test suite for GameRuntime.js (Phase 8.1 deobfuscation).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GameRuntime,
  CarSoccerGameSession,
  GameSession,
  GameOrchestration,
  setGameRuntimeThreeContext
} from '../src/game/GameRuntime.js';
import { SIM_OFFSETS, CAR_STATE_OFFSETS, CAR_STATE_STRIDE } from '../src/physics/RocketSimConstants.js';

class MockVector3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
  set(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
  subVectors(a, b) {
    this.x = a.x - b.x;
    this.y = a.y - b.y;
    this.z = a.z - b.z;
    return this;
  }
  normalize() {
    const l = Math.hypot(this.x, this.y, this.z) || 1;
    this.x /= l;
    this.y /= l;
    this.z /= l;
    return this;
  }
  dot(v) {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }
  length() {
    return Math.hypot(this.x, this.y, this.z);
  }
  setFromMatrixColumn() {
    return this;
  }
}

class MockMeshBasicMaterial {
  constructor(opts = {}) {
    Object.assign(this, opts);
  }
}

class MockMesh {
  constructor(name = '', material = null) {
    this.name = name;
    this.material = material || new MockMeshBasicMaterial();
    this.userData = {};
    this.visible = true;
    this.layers = { isEnabled: () => false };
  }
}

class MockScene {
  constructor() {
    this.children = [];
  }
  traverse(cb) {
    for (const child of this.children) cb(child);
  }
}

class MockRenderer {
  constructor() {
    this.width = 1280;
    this.height = 720;
    this.pixelRatio = 1;
    this.shadowMap = { enabled: true, type: 2, autoUpdate: false, needsUpdate: false };
    this.domElement = { addEventListener: () => {} };
  }
  setSize(w, h) {
    this.width = w;
    this.height = h;
  }
  setPixelRatio(r) {
    this.pixelRatio = r;
  }
  getPixelRatio() {
    return this.pixelRatio;
  }
  getContext() {
    return { getParameter: () => 0 };
  }
  render() {}
  dispose() {}
}

setGameRuntimeThreeContext({
  WebGLRenderer: MockRenderer,
  PMREMGenerator: class {
    fromScene() {
      return { texture: {} };
    }
    dispose() {}
  },
  Vector3: MockVector3,
  ShaderMaterial: class {},
  MeshBasicMaterial: MockMeshBasicMaterial,
  Mesh: MockMesh,
  PCFSoftShadowMap: 2,
  ACESFilmicToneMapping: 4,
  DoubleSide: 2,
  RoomEnvironment: class {}
});

function createMockContainer() {
  const dataset = {};
  const classList = new Set();
  return {
    dataset,
    classList: {
      toggle: (name, val) => {
        if (val) classList.add(name);
        else classList.delete(name);
        return val;
      },
      contains: name => classList.has(name)
    },
    querySelector: () => null,
    appendChild: () => {},
    addEventListener: () => {}
  };
}

test('1. Backward-compatibility aliases match GameRuntime class', () => {
  assert.equal(CarSoccerGameSession, GameRuntime);
  assert.equal(GameSession, GameRuntime);
  assert.equal(GameOrchestration, GameRuntime);
});

test('2. GameRuntime instantiation sets up valid neutral controls and state', () => {
  const container = createMockContainer();
  const runtime = new GameRuntime(container);

  assert.deepEqual(runtime.neutralControls, {
    throttle: 0,
    steer: 0,
    pitch: 0,
    yaw: 0,
    roll: 0,
    jump: false,
    boost: false,
    handbrake: false
  });

  assert.equal(runtime.playerCarIndex, 0);
  assert.equal(runtime.isCursorBrowsing, false);
  assert.equal(runtime.openOverlays.size, 0);
  assert.equal(runtime.cameraDynamics.onGround, false);
  assert.equal(runtime.cameraDynamics.supersonic, false);
  assert.equal(runtime.audioLastRemainingSec, 300);
});

test('3. Overlay mutual exclusivity & input synchronization', () => {
  const container = createMockContainer();
  const runtime = new GameRuntime(container);

  let keyboardEnabled = true;
  runtime.keyboard = {
    set enabled(val) {
      keyboardEnabled = val;
    },
    get enabled() {
      return keyboardEnabled;
    }
  };
  runtime.match = { state: { mode: 'match', paused: false } };

  // Open settings overlay
  runtime.handleOverlayChange('settings', true);
  assert.ok(runtime.openOverlays.has('settings'));
  assert.equal(runtime.keyboard.enabled, false);
  assert.equal(runtime.match.state.paused, true);

  // Open car garage overlay (settings should be dismissed)
  let settingsHidden = false;
  runtime.settingsSheet = {
    hide: () => {
      settingsHidden = true;
    }
  };
  runtime.handleOverlayChange('car', true);
  assert.ok(runtime.openOverlays.has('car'));
  assert.equal(settingsHidden, true);

  // Close overlays
  runtime.handleOverlayChange('settings', false);
  runtime.handleOverlayChange('car', false);
  assert.equal(runtime.openOverlays.size, 0);
  assert.equal(runtime.keyboard.enabled, true);
  assert.equal(runtime.match.state.paused, false);
});

test('4. Game audio trigger logic (edge detection & deduplication)', () => {
  const container = createMockContainer();
  const runtime = new GameRuntime(container);

  const playedEvents = [];
  const mockGameAudio = {
    play: (evt, vol, duration) => playedEvents.push({ type: 'play', evt, vol, duration }),
    playSpatial: (evt, pos, vol) => playedEvents.push({ type: 'spatial', evt, pos, vol })
  };

  globalThis.gameAudio = mockGameAudio;
  runtime.match = {
    state: { mode: 'match', phase: 'kickoff', countdown: 3.0, remainingSeconds: 300, overtime: false }
  };
  runtime.playerControls = { boost: false };
  runtime.arena = { ball: { position: { x: 0, y: 0, z: 0 } } };
  runtime.camera = { camera: {} };

  const dummyCurr = new Float32Array(200);
  dummyCurr[SIM_OFFSETS.NUM_CARS] = 1;
  const carOffset = SIM_OFFSETS.CARS;

  // 1. Kickoff countdown 3
  runtime.triggerGameAudioEvents(false, 100, false, dummyCurr, carOffset);
  assert.equal(playedEvents.filter(e => e.evt === 'match_countdown_321').length, 1);

  // Same frame again -> should NOT re-trigger countdown 3
  runtime.triggerGameAudioEvents(false, 100, false, dummyCurr, carOffset);
  assert.equal(playedEvents.filter(e => e.evt === 'match_countdown_321').length, 1);

  // Countdown decreases to 2
  runtime.match.state.countdown = 2.0;
  runtime.triggerGameAudioEvents(false, 100, false, dummyCurr, carOffset);
  assert.equal(playedEvents.filter(e => e.evt === 'match_countdown_321').length, 2);

  // 2. Match start / kickoff Go
  runtime.match.state.phase = 'playing';
  runtime.triggerGameAudioEvents(false, 100, false, dummyCurr, carOffset);
  assert.ok(playedEvents.some(e => e.evt === 'match_start_go'));

  // 3. Supersonic enter SFX (rising edge)
  runtime.triggerGameAudioEvents(false, 100, true, dummyCurr, carOffset);
  assert.ok(playedEvents.some(e => e.evt === 'sfx_state_supersonic'));
  const supersonicCount = playedEvents.filter(e => e.evt === 'sfx_state_supersonic').length;
  // Next frame still supersonic -> no re-trigger
  runtime.triggerGameAudioEvents(false, 100, true, dummyCurr, carOffset);
  assert.equal(playedEvents.filter(e => e.evt === 'sfx_state_supersonic').length, supersonicCount);

  // 4. Goal scored poof SFX
  runtime.triggerGameAudioEvents(true, 100, false, dummyCurr, carOffset);
  assert.ok(playedEvents.some(e => e.evt === 'sfx_goal_poof'));

  // 5. Out of boost SFX
  runtime.playerControls.boost = true;
  runtime.triggerGameAudioEvents(false, 0, false, dummyCurr, carOffset);
  assert.ok(playedEvents.some(e => e.evt === 'sfx_error_no_boost'));

  // 6. Match 30s remaining
  runtime.match.state.remainingSeconds = 29;
  runtime.triggerGameAudioEvents(false, 50, false, dummyCurr, carOffset);
  assert.ok(playedEvents.some(e => e.evt === 'match_30_seconds_left'));

  // 7. Entering overtime
  runtime.match.state.overtime = true;
  runtime.triggerGameAudioEvents(false, 50, false, dummyCurr, carOffset);
  assert.ok(playedEvents.some(e => e.evt === 'match_entering_overtime'));

  delete globalThis.gameAudio;
});

test('5. Bloom occluder traversal and material swap/restore', () => {
  const container = createMockContainer();
  const runtime = new GameRuntime(container);

  const matOriginal = new MockMeshBasicMaterial({ color: 0xffffff });
  const meshA = new MockMesh('car-body', matOriginal);
  const meshB = new MockMesh('field-wall', new MockMeshBasicMaterial({ color: 0x222222 }));

  runtime.arena = {
    scene: new MockScene(),
    renderTreeVersion: 1
  };
  runtime.arena.scene.children = [meshA, meshB];
  runtime.bloomDarkMaterial = new MockMeshBasicMaterial({ color: 0x000000 });

  // Apply bloom occluders
  runtime.applyBloomOccluders();
  assert.equal(meshA.material, runtime.bloomDarkMaterial);
  assert.equal(meshB.material, runtime.bloomDarkMaterial);

  // Restore bloom materials
  runtime.restoreBloomMaterials();
  assert.equal(meshA.material, matOriginal);
});

test('6. Viewport scaling calculation handles renderScale correctly', () => {
  const container = createMockContainer();
  const runtime = new GameRuntime(container);

  let setSizeCalls = [];
  let setPixelRatioCalls = [];

  runtime.renderer = {
    setSize: (w, h) => setSizeCalls.push({ w, h }),
    setPixelRatio: r => setPixelRatioCalls.push(r),
    getPixelRatio: () => 1.0
  };
  runtime.boostBloom = { setSize: () => {} };
  runtime.composer = { setPixelRatio: () => {}, setSize: () => {} };

  // Set 50% render scale
  runtime.updateViewport({ renderScale: 50 });
  assert.ok(setPixelRatioCalls.length > 0);
  assert.ok(setSizeCalls.length > 0);
});

test('7. Reset audio and reset bot state clean all serials and epochs', () => {
  const container = createMockContainer();
  const runtime = new GameRuntime(container);

  runtime.lastBallHitSerials = [4, 7];
  runtime.audioCollidingPairs.add('0_1');
  runtime.audioLastGoalScored = true;

  runtime.resetAudio();
  assert.deepEqual(runtime.lastBallHitSerials, [0, 0]);
  assert.equal(runtime.audioCollidingPairs.size, 0);
  assert.equal(runtime.audioLastGoalScored, false);

  const prevEpoch = runtime.botDecisionEpoch;
  runtime.resetBotState();
  assert.equal(runtime.botDecisionEpoch, prevEpoch + 1);
  assert.equal(runtime.botTickSkip, 0);
  assert.equal(runtime.isBotDeciding, false);
});
