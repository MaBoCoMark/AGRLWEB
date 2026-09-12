/**
 * PhysicsManager.js
 * Unified physics orchestrator for RocketSim WebAssembly.
 * Loads 16 collision mesh chunks and communicates with RocketSim C++ core.
 */

import jC from './RocketSimWasm.js';
import { BALL, CONTROLS_STRIDE } from '../constants/GameConstants.js';

export class PhysicsManager {
  constructor() {
    this.mode = 'rocketsim';
    this.sim = null;
    this.module = null;
    
    // RocketSim memory pointers
    this.statePtr = 0;
    this.stateLen = 0;
    this.controlsPtr = 0;
    
    this.stateView = null;
    this.controlsView = null;
    
    this.ballRadius = BALL.RADIUS;
  }

  async init() {
    console.log('[PhysicsManager] Initializing RocketSim physics subsystem...');

    try {
      const manifestResp = await fetch('/assets/arena/collision/manifest.json');
      if (!manifestResp.ok) {
        throw new Error(`Collision manifest not found (HTTP ${manifestResp.status})`);
      }

      const fileList = await manifestResp.json();
      console.log(`[PhysicsManager] Loading ${fileList.length} RocketSim collision mesh chunks...`);

      const meshBuffers = await Promise.all(
        fileList.map(async (filename) => {
          const r = await fetch(`/assets/arena/collision/${filename}`);
          if (!r.ok) throw new Error(`Mesh chunk ${filename} failed to load`);
          return new Uint8Array(await r.arrayBuffer());
        })
      );

      this.module = await jC();

      // Allocate memory for mesh data in WASM heap
      const totalBytes = meshBuffers.reduce((acc, b) => acc + b.length, 0);
      const dataPtr = this.module._malloc(totalBytes);
      const sizesPtr = this.module._malloc(meshBuffers.length * 4);

      let offset = 0;
      meshBuffers.forEach((buf, idx) => {
        this.module.HEAPU8.set(buf, dataPtr + offset);
        this.module.HEAP32[sizesPtr / 4 + idx] = buf.length;
        offset += buf.length;
      });

      const initResult = this.module._physics_init(dataPtr, sizesPtr, meshBuffers.length);
      this.module._free(dataPtr);
      this.module._free(sizesPtr);

      if (initResult !== 1) {
        throw new Error('RocketSim _physics_init returned non-1 status');
      }

      if (this.module._physics_createArena() !== 1) {
        throw new Error('RocketSim _physics_createArena failed');
      }

      this.statePtr = this.module._physics_getStatePtr();
      this.stateLen = this.module._physics_getStateSize();
      this.controlsPtr = this.module._physics_getControlsPtr();

      console.log('[PhysicsManager] RocketSim WebAssembly physics engine successfully online!');
      return;
    } catch (err) {
      console.error('[PhysicsManager] Could not start RocketSim WASM engine:', err.message);
      throw err;
    }
  }

  get state() {
    if (this.module) {
      const buffer = this.module.HEAPF32.buffer;
      if (!this.stateView || this.stateView.buffer !== buffer) {
        this.stateView = new Float32Array(buffer, this.statePtr, this.stateLen);
      }
      return this.stateView;
    }
    return new Float32Array(100);
  }

  addCar(team, config = 'default') {
    if (this.module) {
      return this.module._physics_addCar(team, config === 'flat' ? 1 : 0);
    }
    return 0;
  }

  setControls(carIndex, controls) {
    if (this.module) {
      const buffer = this.module.HEAPF32.buffer;
      if (!this.controlsView || this.controlsView.buffer !== buffer) {
        this.controlsView = new Float32Array(buffer, this.controlsPtr, 8 * CONTROLS_STRIDE);
      }
      const offset = carIndex * CONTROLS_STRIDE;
      this.controlsView[offset + 0] = controls.throttle || 0;
      this.controlsView[offset + 1] = controls.steer || 0;
      this.controlsView[offset + 2] = controls.pitch || 0;
      this.controlsView[offset + 3] = controls.yaw || 0;
      this.controlsView[offset + 4] = controls.roll || 0;
      this.controlsView[offset + 5] = controls.jump ? 1 : 0;
      this.controlsView[offset + 6] = controls.boost ? 1 : 0;
      this.controlsView[offset + 7] = controls.handbrake ? 1 : 0;
    }
  }

  step(ticks = 1) {
    if (this.module) {
      this.module._physics_step(ticks);
    }
  }

  resetKickoff(type = 0) {
    if (this.module) {
      this.module._physics_resetKickoff(type);
    }
  }

  pollGoal() {
    if (this.module) {
      const g = this.state[1];
      if (g !== 0) {
        this.module._physics_clearGoalFlag();
      }
      return g;
    }
    return 0;
  }

  getPads() {
    return [];
  }
}
