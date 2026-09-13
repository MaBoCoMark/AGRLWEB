/**
 * RocketSimPhysicsEngine.js
 * Clean, deobfuscated wrapper for RocketSim WebAssembly simulation core (deobfuscates yC).
 * Interacts directly with Emscripten RocketSim C++ binding (16 collision mesh chunks,
 * suspension raycasting, 120Hz deterministic stepping, vehicle state memory buffer).
 *
 * Reference: https://github.com/zealanL/rocketsim
 */

import jC from './RocketSimWasm.js';
import { validateAssetResponse } from '../game/AssetDiagnostics.js';
import {
  SIM_OFFSETS,
  BALL_CONTROL_MODES,
  MAX_CARS,
  CONTROLS_STRIDE
} from './RocketSimConstants.js';

export const PLAYER_CAR_INDEX = 0;
export const BOT_CAR_INDEX = 1;

/**
 * Team assignment helper based on car visual type
 * @param {boolean} isFlatCar
 * @returns {{ playerTeam: number, botTeam: number }}
 */
export function getTeamAssignment(isFlatCar) {
  return isFlatCar
    ? { playerTeam: 0, botTeam: 1 }
    : { playerTeam: 1, botTeam: 0 };
}

export class RocketSimPhysicsEngine {
  /** Cached Uint8Array collision mesh data across instances */
  static cachedCollisionData = null;

  constructor() {
    this.module = null;
    this.statePtr = 0;
    this.stateLen = 0;
    this.controlsPtr = 0;
    this.viewPtr = 0;

    this.stateView = null;
    this.controlsView = null;
    this.viewView = null;
  }

  /**
   * Get shared Float32Array state buffer directly mapped to WASM heap
   * @returns {Float32Array}
   */
  get state() {
    const buffer = this.module.HEAPF32.buffer;
    if (!this.stateView || this.stateView.buffer !== buffer) {
      this.stateView = new Float32Array(buffer, this.statePtr, this.stateLen);
    }
    return this.stateView;
  }

  /**
   * Initialize RocketSim WASM module, load collision meshes and instantiate the standard arena
   */
  async init() {
    this.module = await jC();

    let collisionData = RocketSimPhysicsEngine.cachedCollisionData;
    if (!collisionData) {
      const manifestUrl = '/assets/arena/collision/manifest.json';
      const manifestRes = await fetch(manifestUrl);
      const manifestCheck = validateAssetResponse(manifestRes, manifestUrl, 'json');
      if (!manifestCheck.ok) throw manifestCheck.error;

      const chunkFilenames = await manifestRes.json();
      collisionData = await Promise.all(
        chunkFilenames.map(async (chunkFile) => {
          const chunkPath = `/assets/arena/collision/${chunkFile}`;
          const chunkRes = await fetch(chunkPath);
          const chunkCheck = validateAssetResponse(chunkRes, chunkPath, 'cmf');
          if (!chunkCheck.ok) throw chunkCheck.error;
          return new Uint8Array(await chunkRes.arrayBuffer());
        })
      );
      RocketSimPhysicsEngine.cachedCollisionData = collisionData;
    }

    // Allocate continuous block in WASM heap for all mesh chunks
    const totalBytes = collisionData.reduce((acc, chunk) => acc + chunk.length, 0);
    const dataPtr = this.module._malloc(totalBytes);
    const sizesPtr = this.module._malloc(collisionData.length * 4);

    let byteOffset = 0;
    collisionData.forEach((chunk, idx) => {
      this.module.HEAPU8.set(chunk, dataPtr + byteOffset);
      this.module.HEAP32[sizesPtr / 4 + idx] = chunk.length;
      byteOffset += chunk.length;
    });

    const initResult = this.module._physics_init(dataPtr, sizesPtr, collisionData.length);
    this.module._free(dataPtr);
    this.module._free(sizesPtr);

    if (initResult !== 1) {
      throw new Error('Physics initialization failed — check collision meshes');
    }

    if (this.module._physics_createArena() !== 1) {
      throw new Error('Arena creation failed');
    }

    this.statePtr = this.module._physics_getStatePtr();
    this.stateLen = this.module._physics_getStateSize();
    this.controlsPtr = this.module._physics_getControlsPtr();
    this.viewPtr = this.module._v0();
    this.stateView = null;
    this.controlsView = null;
    this.viewView = null;
    this.module._v2();
  }

  /**
   * Add a car with the given team and hitbox configuration
   * @param {number} team 0 for Blue, 1 for Orange
   * @param {string} hitboxType 'default' (Octane) or 'flat' (Dominus)
   * @returns {number} car index in arena
   */
  addCar(team, hitboxType = 'default') {
    return this.module._physics_addCar(team, hitboxType === 'flat' ? 1 : 0);
  }

  /**
   * Recreate arena and spawn appropriate cars for Freeplay or Match mode
   * @param {string} hitboxType 'default' or 'flat'
   * @param {boolean} isMatch
   * @param {number} defaultPlayerTeam
   */
  configureCars(hitboxType, isMatch, defaultPlayerTeam = 0) {
    const { playerTeam, botTeam } = getTeamAssignment(hitboxType === 'flat');

    if (this.module._physics_createArena() !== 1) {
      throw new Error('Arena creation failed');
    }

    if (this.addCar(isMatch ? playerTeam : defaultPlayerTeam, hitboxType) !== PLAYER_CAR_INDEX) {
      throw new Error('Player creation failed');
    }

    if (isMatch && this.addCar(botTeam, 'default') !== BOT_CAR_INDEX) {
      throw new Error('Opponent creation failed');
    }

    this.resetKickoff();
    this.resetView();
  }

  /**
   * Push control inputs for a car into WASM shared memory
   * @param {number} carIndex
   * @param {{ throttle: number, steer: number, pitch: number, yaw: number, roll: number, jump: boolean, boost: boolean, handbrake: boolean }} controls
   */
  setControls(carIndex, controls) {
    const buffer = this.module.HEAPF32.buffer;
    if (!this.controlsView || this.controlsView.buffer !== buffer) {
      this.controlsView = new Float32Array(buffer, this.controlsPtr, MAX_CARS * CONTROLS_STRIDE);
    }
    const offset = carIndex * CONTROLS_STRIDE;
    const view = this.controlsView;

    view[offset + 0] = controls.throttle || 0;
    view[offset + 1] = controls.steer || 0;
    view[offset + 2] = controls.pitch || 0;
    view[offset + 3] = controls.yaw || 0;
    view[offset + 4] = controls.roll || 0;
    view[offset + 5] = controls.jump ? 1 : 0;
    view[offset + 6] = controls.boost ? 1 : 0;
    view[offset + 7] = controls.handbrake ? 1 : 0;
  }

  /**
   * Step view state
   * @param {ArrayLike<number>} view
   * @returns {Float64Array}
   */
  stepView(view) {
    const buffer = this.module.HEAPF64.buffer;
    if (!this.viewView || this.viewView.buffer !== buffer) {
      this.viewView = new Float64Array(buffer, this.viewPtr, 42);
    }
    this.viewView.set(view, 0);
    this.module._v1();
    return this.viewView;
  }

  /**
   * Reset view state
   */
  resetView() {
    this.module._v2();
    this.viewView = null;
  }

  /**
   * Step the physics simulation by a given number of 120Hz ticks
   * @param {number} ticks
   */
  step(ticks = 1) {
    this.module._physics_step(ticks);
  }

  /**
   * Reset ball and cars to a kickoff position
   * @param {number} seed -1 for random kickoff, or specific seed
   */
  resetKickoff(seed = -1) {
    this.module._physics_resetKickoff(seed);
  }

  /**
   * Execute scripted ball control maneuver
   * @param {number} carIndex
   * @param {'takePossession' | 'startDribble' | 'passBall' | 'launchBall'} mode
   * @returns {boolean}
   */
  controlBall(carIndex, mode) {
    const modeIndex = BALL_CONTROL_MODES.indexOf(mode);
    return this.module._physics_controlBall(carIndex, modeIndex) === 1;
  }

  /**
   * Enable/disable infinite boost
   * @param {boolean} unlimited
   */
  setUnlimitedBoost(unlimited) {
    this.module._physics_setUnlimitedBoost(unlimited ? 1 : 0);
  }

  /**
   * Check if a goal was scored and clear the internal flag
   * @returns {number} 0: none, 1: blue goal, 2: orange goal
   */
  pollGoal() {
    const goalFlag = this.state[SIM_OFFSETS.GOAL];
    if (goalFlag !== 0) {
      this.module._physics_clearGoalFlag();
    }
    return goalFlag;
  }

  /**
   * Ball collision sphere radius
   * @returns {number}
   */
  get ballRadius() {
    return this.module._physics_getBallRadius();
  }

  /**
   * Whether the ball is resting/rolling on the arena floor
   * @returns {boolean}
   */
  get ballOnGround() {
    return this.module._physics_getBallOnGround() === 1;
  }

  /**
   * Retrieve position and type for all 34 boost pads
   * @returns {Array<{ pos: [number, number, number], isBig: boolean }>}
   */
  getPads() {
    const numPads = this.state[SIM_OFFSETS.NUM_PADS];
    const padPtr = this.module._physics_getPadInfoPtr();
    const padView = new Float32Array(this.module.HEAPF32.buffer, padPtr, numPads * 4);

    return Array.from({ length: numPads }, (_, idx) => ({
      pos: [padView[idx * 4], padView[idx * 4 + 1], padView[idx * 4 + 2]],
      isBig: padView[idx * 4 + 3] === 1
    }));
  }
}

// Backward-compatibility alias with original obfuscated symbol yC
export const yC = RocketSimPhysicsEngine;
export default RocketSimPhysicsEngine;
