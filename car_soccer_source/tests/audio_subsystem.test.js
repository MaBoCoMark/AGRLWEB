/**
 * Test Suite: Deobfuscation Phase 3 - Audio Subsystem & 3D Spatial Audio
 * Validates audio formulas, gain calculations, serial event detection, and backward-compatibility aliases.
 */

import assert from 'node:assert/strict';
import {
  SPATIAL_AUDIO_CONFIG,
  calculateDistanceGain,
  updateAudioListener,
  listenerManager,
  SpatialAudioSource,
  cg,
  _1,
  j1
} from '../src/audio/SpatialAudioSource.js';

import {
  dbToLinear,
  clamp01,
  AudioMixer,
  getAudioSettings,
  setMasterVolume,
  setEngineVolume,
  setBoostVolume,
  VehicleActionAudio,
  VEHICLE_ACTION_SOUNDS,
  VEHICLE_ACTION_VOLUMES,
  BallImpactAudio,
  IMPACT_SOUND_LAYERS,
  IMPACT_CONFIG,
  SupersonicAudio,
  SUPERSONIC_CONFIG,
  BoostAudio,
  FlipResetAudio,
  VehicleEngineAudio,
  GameAudioManager,
  gameAudio,
  boostCollectAudio,
  Sw,
  kw,
  Lw,
  V1,
  jw,
  tm,
  u1
} from '../src/audio/GameAudioSubsystem.js';

console.log('[Test] Running Phase 3 Audio Subsystem validation suite...');

// --- 1. Math and Conversion Helpers ---
console.log('  Testing Math & Conversion Helpers...');
assert.equal(Math.round(dbToLinear(0) * 1000) / 1000, 1.0, '0 dB should be linear gain 1.0');
assert.equal(Math.round(dbToLinear(20) * 1000) / 1000, 10.0, '20 dB should be linear gain 10.0');
assert.equal(Math.round(dbToLinear(-20) * 1000) / 1000, 0.1, '-20 dB should be linear gain 0.1');
assert.equal(Math.round(dbToLinear(-6) * 100) / 100, 0.5, '-6 dB should be approx 0.5');

assert.equal(clamp01(-0.5), 0.0);
assert.equal(clamp01(1.5), 1.0);
assert.equal(clamp01(0.35), 0.35);
console.log('  ✓ Math & Conversion Helpers passed.');

// --- 2. 3D Spatial Audio & Distance Attenuation ---
console.log('  Testing SpatialAudioSource & Distance Math...');
assert.equal(cg, SpatialAudioSource, 'Alias cg must point to SpatialAudioSource');
assert.equal(_1, updateAudioListener, 'Alias _1 must point to updateAudioListener');
assert.equal(j1, calculateDistanceGain, 'Alias j1 must point to calculateDistanceGain');

// Distance attenuation boundary tests
const minGain = calculateDistanceGain(SPATIAL_AUDIO_CONFIG.MIN_DISTANCE);
assert.equal(minGain, SPATIAL_AUDIO_CONFIG.MAX_GAIN, `At min distance (250), gain must be max (${SPATIAL_AUDIO_CONFIG.MAX_GAIN})`);

const maxGain = calculateDistanceGain(SPATIAL_AUDIO_CONFIG.MAX_DISTANCE);
assert.equal(maxGain, 0.0, 'At max distance (4500), gain must be 0');

const beyondGain = calculateDistanceGain(SPATIAL_AUDIO_CONFIG.MAX_DISTANCE + 1000);
assert.equal(beyondGain, 0.0, 'Beyond max distance, gain must remain 0');

const closeGain = calculateDistanceGain(50);
assert.equal(closeGain, SPATIAL_AUDIO_CONFIG.MAX_GAIN, 'Closer than min distance, gain must clamp to max');

// Hermite smoothstep at midpoint (250 + (4500-250)/2 = 2375)
const midDist = (SPATIAL_AUDIO_CONFIG.MIN_DISTANCE + SPATIAL_AUDIO_CONFIG.MAX_DISTANCE) / 2;
const midGain = calculateDistanceGain(midDist);
// At x = 0.5: 1 - 0.25 * (3 - 1) = 0.5, so 0.4 * 0.5 = 0.2
assert.equal(Math.round(midGain * 100) / 100, 0.2, 'Midpoint gain must be exactly half max gain (0.2)');

// Test listener camera update
const mockCamera = {
  position: { x: 100, y: 200, z: 300 },
  quaternion: { x: 0, y: 0, z: 0, w: 1 },
  updateWorldMatrix: () => {},
  getWorldPosition: (target) => { Object.assign(target, mockCamera.position); },
  getWorldQuaternion: (target) => { Object.assign(target, mockCamera.quaternion); }
};

updateAudioListener(mockCamera);
assert.equal(listenerManager.hasListener, true, 'Listener must be marked active after camera update');
assert.equal(listenerManager.position.x, 100);
assert.equal(listenerManager.position.y, 200);
assert.equal(listenerManager.position.z, 300);
assert.equal(listenerManager.forward.z, -1, 'Default unrotated forward vector must point down -Z');
console.log('  ✓ SpatialAudioSource passed.');

// --- 3. Vehicle Action Audio ---
console.log('  Testing VehicleActionAudio (Sw)...');
assert.equal(Sw, VehicleActionAudio, 'Alias Sw must point to VehicleActionAudio');
assert.equal(VEHICLE_ACTION_VOLUMES.jump, 0.3);
assert.equal(VEHICLE_ACTION_VOLUMES.dodge, 0.3);
assert.equal(VEHICLE_ACTION_VOLUMES.doubleJump, 0.3);
assert.ok(Array.isArray(VEHICLE_ACTION_SOUNDS.jump));
assert.ok(Array.isArray(VEHICLE_ACTION_SOUNDS.dodge));
assert.ok(Array.isArray(VEHICLE_ACTION_SOUNDS.doubleJump));
assert.ok(Array.isArray(VEHICLE_ACTION_SOUNDS.wheelImpact));
assert.equal(VEHICLE_ACTION_SOUNDS.jump.length, 4);

const vehicleAudio = new VehicleActionAudio();
let playedSounds = [];
vehicleAudio.play = (key, vol) => {
  playedSounds.push({ key, vol });
};

// Initial state snapshot should not trigger sound
vehicleAudio.update({
  jumpSerial: 0,
  dodgeSerial: 0,
  doubleJumpSerial: 0,
  wheelImpactSerial: 0,
  wheelImpactSpeed: 0,
  audible: true
});
assert.equal(playedSounds.length, 0, 'First state observation must not trigger sounds');

// Jump serial increments -> should trigger 'jump'
vehicleAudio.update({
  jumpSerial: 1,
  dodgeSerial: 0,
  doubleJumpSerial: 0,
  wheelImpactSerial: 0,
  wheelImpactSpeed: 0,
  audible: true
});
assert.equal(playedSounds.length, 1);
assert.equal(playedSounds[0].key, 'jump');
assert.equal(playedSounds[0].vol, 0.3);

// Wheel impact serial increments with speed >= 50
vehicleAudio.update({
  jumpSerial: 1,
  dodgeSerial: 0,
  doubleJumpSerial: 0,
  wheelImpactSerial: 1,
  wheelImpactSpeed: 1000,
  audible: true
});
assert.equal(playedSounds.length, 2);
assert.equal(playedSounds[1].key, 'wheelImpact');
assert.ok(playedSounds[1].vol > 0 && playedSounds[1].vol <= 0.15);
console.log('  ✓ VehicleActionAudio passed.');

// --- 4. Ball Impact Audio ---
console.log('  Testing BallImpactAudio (kw)...');
assert.equal(kw, BallImpactAudio, 'Alias kw must point to BallImpactAudio');
assert.ok(IMPACT_SOUND_LAYERS.carCore.length > 0);
assert.ok(IMPACT_SOUND_LAYERS.carHard.length > 0);
assert.ok(IMPACT_SOUND_LAYERS.surfaceBody.length > 0);
assert.ok(IMPACT_SOUND_LAYERS.grass.length > 0);
assert.ok(IMPACT_SOUND_LAYERS.arena.length > 0);

const ballAudio = new BallImpactAudio();
let impactEvents = [];
ballAudio.playCar = (speed, pan) => { impactEvents.push({ type: 'car', speed, pan }); };
ballAudio.playWorld = (speed, surface, pan) => { impactEvents.push({ type: 'world', speed, surface, pan }); };

// First call sets baseline
ballAudio.update({
  carSerial: 0,
  carSpeed: 0,
  carPan: 0,
  worldSerial: 0,
  worldSpeed: 0,
  worldSurface: 0,
  worldPan: 0,
  audible: true
});
assert.equal(impactEvents.length, 0);

// Car hit serial increments
ballAudio.update({
  carSerial: 1,
  carSpeed: 1200,
  carPan: 0.25,
  worldSerial: 0,
  worldSpeed: 0,
  worldSurface: 0,
  worldPan: 0,
  audible: true
});
assert.equal(impactEvents.length, 1);
assert.equal(impactEvents[0].type, 'car');
assert.equal(impactEvents[0].speed, 1200);
assert.equal(impactEvents[0].pan, 0.25);

// World hit serial increments
ballAudio.update({
  carSerial: 1,
  carSpeed: 0,
  carPan: 0,
  worldSerial: 1,
  worldSpeed: 800,
  worldSurface: 0,
  worldPan: -0.5,
  audible: true
});
assert.equal(impactEvents.length, 2);
assert.equal(impactEvents[1].type, 'world');
assert.equal(impactEvents[1].speed, 800);
assert.equal(impactEvents[1].surface, 0);
assert.equal(impactEvents[1].pan, -0.5);
console.log('  ✓ BallImpactAudio passed.');

// --- 5. Supersonic Audio ---
console.log('  Testing SupersonicAudio (Lw)...');
assert.equal(Lw, SupersonicAudio, 'Alias Lw must point to SupersonicAudio');
assert.equal(SUPERSONIC_CONFIG.ENTRY_TRACKS.length, 3);
assert.ok(SUPERSONIC_CONFIG.LOOP_START > 0);
assert.ok(SUPERSONIC_CONFIG.LOOP_END > SUPERSONIC_CONFIG.LOOP_START);

const supersonicAudio = new SupersonicAudio();
assert.equal(supersonicAudio.wanted, false);
assert.equal(supersonicAudio.previousSupersonic, false);
supersonicAudio.update(true, false, true);
assert.equal(supersonicAudio.wanted, true);
assert.equal(supersonicAudio.previousSupersonic, true);
assert.ok(supersonicAudio.entryDeadline > performance.now());
supersonicAudio.silence();
assert.equal(supersonicAudio.wanted, false);
assert.equal(supersonicAudio.entryDeadline, 0);
console.log('  ✓ SupersonicAudio passed.');

// --- 6. Boost Audio & Flip Reset Audio ---
console.log('  Testing BoostAudio (V1) and FlipResetAudio (jw)...');
assert.equal(V1, BoostAudio, 'Alias V1 must point to BoostAudio');
assert.equal(jw, FlipResetAudio, 'Alias jw must point to FlipResetAudio');

const boostAudio = new BoostAudio(false);
assert.equal(boostAudio.boosting, false);
assert.equal(boostAudio.spatial, false);
boostAudio.setSpatial(true);
assert.equal(boostAudio.spatial, true);

const flipReset = new FlipResetAudio();
assert.equal(flipReset.playSerial, 0);
console.log('  ✓ BoostAudio and FlipResetAudio passed.');

// --- 7. VehicleEngineAudio & AudioMixer ---
console.log('  Testing VehicleEngineAudio (tm) & AudioMixer (u1)...');
assert.equal(tm, VehicleEngineAudio, 'Alias tm must point to VehicleEngineAudio');
assert.equal(u1, AudioMixer, 'Alias u1 must point to AudioMixer');

const engineAudio = new VehicleEngineAudio(false);
assert.equal(engineAudio.alive, true);
assert.equal(engineAudio.audible, true);
engineAudio.silence();

// Test volume controls
setMasterVolume(0.75);
setEngineVolume(0.85);
setBoostVolume(0.95);
const settings = getAudioSettings();
assert.equal(settings.masterVolume, 0.75);
assert.equal(settings.engineVolume, 0.85);
assert.equal(settings.boostVolume, 0.95);
console.log('  ✓ VehicleEngineAudio & AudioMixer passed.');

// --- 8. GameAudioManager Singleton ---
console.log('  Testing GameAudioManager & boostCollectAudio...');
assert.ok(gameAudio instanceof GameAudioManager);
assert.ok(gameAudio.soundDefs.boost_collect);
assert.ok(gameAudio.soundDefs.sfx_ball_hit);
assert.ok(gameAudio.soundDefs.sfx_state_supersonic);
assert.ok(typeof boostCollectAudio.play === 'function');
console.log('  ✓ GameAudioManager passed.');

console.log('[Test] All Phase 3 Audio Subsystem tests successfully passed!');
