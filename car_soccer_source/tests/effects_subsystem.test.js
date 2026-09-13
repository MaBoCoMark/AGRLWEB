import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BoostBloom,
  createBloomRenderTarget,
  BLOOM_MIP_LEVELS,
  BLOOM_DOWNSCALE_FACTOR,
  BLOOM_THRESHOLD,
  BLOOM_SMOOTH_WIDTH,
  BLOOM_OUTPUT_STRENGTH,
  BLOOM_WEIGHTS,
  fw,
  Bc,
  Jn,
  Up,
  hw,
  dw,
  uw,
  qp,
  FlipResetVisual,
  createStarShapeGeometry,
  createSparksMaterial,
  createSoftGlowMaterial,
  enableLayerOne,
  RESET_INDICATOR_HEIGHT,
  RESET_PULSE_DURATION,
  RESET_SPARKS_DELAY,
  RESET_SPARKS_DURATION,
  RESET_SPARKS_COUNT,
  RESET_ARCADE_COLOR_HEX,
  xw,
  _w,
  Ew,
  yw,
  Jp,
  mw,
  Vp,
  gw,
  Wp,
  ys,
  SpeedLinesEffectPass,
  SupersonicSpeedLinesPass,
  SPEED_LINES_COUNT,
  Yw,
  Zw
} from '../src/effects/index.js';

test('1. BoostBloom constants and aliases match engine specifications', () => {
  assert.equal(BLOOM_MIP_LEVELS, 4);
  assert.equal(BLOOM_DOWNSCALE_FACTOR, 0.5);
  assert.equal(BLOOM_THRESHOLD, 1.2);
  assert.equal(BLOOM_SMOOTH_WIDTH, 0.01);
  assert.equal(BLOOM_OUTPUT_STRENGTH, 0.275 * 3);
  assert.deepEqual(BLOOM_WEIGHTS, [0.76, 0.68, 0.6, 0.52 + 0.44]);

  // Backward-compatibility aliases
  assert.equal(fw, BoostBloom);
  assert.equal(Bc, createBloomRenderTarget);
  assert.equal(Jn, BLOOM_MIP_LEVELS);
  assert.equal(Up, BLOOM_DOWNSCALE_FACTOR);
  assert.equal(hw, BLOOM_THRESHOLD);
  assert.equal(dw, BLOOM_SMOOTH_WIDTH);
  assert.equal(uw, BLOOM_OUTPUT_STRENGTH);
  assert.equal(qp, BLOOM_WEIGHTS);
});

test('2. BoostBloom lifecycle, resizing, and render submissions', () => {
  const mockRenderer = {
    getPixelRatio: () => 2,
    getRenderTarget: () => null,
    getClearAlpha: () => 1,
    getClearColor: (c) => c,
    setRenderTarget: () => {},
    setClearColor: () => {},
    clear: () => {},
    render: () => {}
  };

  const bloom = new BoostBloom(mockRenderer, 1920, 1080, 2);
  assert.equal(bloom.renderSubmissions, 1 + 4 + 3);
  assert.equal(bloom.downTargets.length, 4);
  assert.equal(bloom.upTargets.length, 3);

  // Resize test
  bloom.setSize(1280, 720, 1);
  assert.ok(bloom.sourceTarget.width <= 1280);
  assert.ok(bloom.sourceTarget.height <= 720);

  // Clear & render
  bloom.clear();
  bloom.render({}, {});

  // Disposal
  bloom.dispose();
});

test('3. FlipResetVisual constants and backward-compatibility aliases', () => {
  assert.equal(RESET_INDICATOR_HEIGHT, -12);
  assert.equal(RESET_PULSE_DURATION, 0.24);
  assert.equal(RESET_SPARKS_DELAY, 0.05);
  assert.equal(RESET_SPARKS_DURATION, 0.18);
  assert.equal(RESET_SPARKS_COUNT, 8);
  assert.equal(RESET_ARCADE_COLOR_HEX, 16773836);

  assert.equal(xw, FlipResetVisual);
  assert.equal(_w, createStarShapeGeometry);
  assert.equal(Ew, createSparksMaterial);
  assert.equal(yw, enableLayerOne);
  assert.equal(Jp, createSoftGlowMaterial);
  assert.equal(mw, RESET_INDICATOR_HEIGHT);
  assert.equal(Vp, RESET_PULSE_DURATION);
  assert.equal(gw, RESET_SPARKS_DELAY);
  assert.equal(Wp, RESET_SPARKS_DURATION);
  assert.equal(ys, RESET_SPARKS_COUNT);
});

test('4. FlipResetVisual lifecycle, spark seeding, and serial trigger', () => {
  const parentCar = {
    children: [],
    add(child) {
      this.children.push(child);
    }
  };

  const visual = new FlipResetVisual(parentCar);
  assert.ok(parentCar.children.includes(visual.root));
  assert.equal(visual.bloomActive, false);
  assert.equal(visual.sparkPositions.length, 24);

  // Play flip reset visual (without audio to avoid WebAudio mock requirement)
  visual.play(false);
  assert.equal(visual.bloomActive, true);
  assert.equal(visual.root.visible, true);

  // Update visual forward in time
  visual.update(0.1, 10, true);
  assert.equal(visual.bloomActive, true);

  // Complete pulse duration
  visual.update(0.3, 10, true);
  assert.equal(visual.bloomActive, false);
  assert.equal(visual.root.visible, false);

  // New reset serial triggers replay
  visual.update(0.016, 11, true);
  assert.equal(visual.bloomActive, true);
  assert.equal(visual.root.visible, true);

  // Stop visual explicitly
  visual.stopVisual();
  assert.equal(visual.bloomActive, false);
  assert.equal(visual.root.visible, false);
});

test('5. SupersonicSpeedLinesPass and SpeedLinesEffectPass behavior', () => {
  assert.equal(SPEED_LINES_COUNT, 80);
  assert.equal(Zw, SupersonicSpeedLinesPass);
  assert.equal(Yw, SpeedLinesEffectPass);

  const speedLines = new SupersonicSpeedLinesPass();
  assert.ok(speedLines.pass instanceof SpeedLinesEffectPass);
  assert.equal(speedLines.pass.enabled, false);

  const mockCamera = {
    aspect: 16 / 9,
    projectionMatrix: {},
    quaternion: { x: 0, y: 0, z: 0, w: 1, invert() {} }
  };
  const mockVelocity = {
    x: 0,
    y: 0,
    z: 2250,
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; },
    applyQuaternion() { return this; },
    lengthSq() { return this.z * this.z; }
  };

  // Subsonic update
  speedLines.update(0.016, false, mockVelocity, mockCamera);
  assert.equal(speedLines.pass.enabled, false);

  // Supersonic update over several frames
  for (let i = 0; i < 20; i++) {
    speedLines.update(0.016, true, mockVelocity, mockCamera);
  }
  assert.ok(speedLines.strength > 0.5, 'Supersonic strength should ramp up');
  assert.equal(speedLines.pass.enabled, true, 'Pass should become enabled when supersonic');

  // Fade back down when dropping supersonic
  for (let i = 0; i < 40; i++) {
    speedLines.update(0.016, false, mockVelocity, mockCamera);
  }
  assert.ok(speedLines.strength < 0.01, 'Strength should decay when subsonic');
  assert.equal(speedLines.pass.enabled, false);
});
