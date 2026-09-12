/**
 * PhysicsManager.js
 * Unified physics orchestrator.
 * Dynamically boots RocketSim WebAssembly when collision manifests are available,
 * or effortlessly falls back to the pure JavaScript ProceduralPhysicsFallback engine.
 */

import jC from './RocketSimWasm.js';
import { ProceduralPhysicsFallback } from './ProceduralPhysicsFallback.js';
import { BALL, CONTROLS_STRIDE } from '../constants/GameConstants.js';

export class PhysicsManager {
  constructor() {
    this.mode = 'fallback'; // 'rocketsim' or 'fallback'
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
    console.log('[PhysicsManager] Initializing physics subsystem...');

    // Attempt to initialize RocketSim WASM + collision meshes
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

      this.mode = 'rocketsim';
      console.log('[PhysicsManager] RocketSim WebAssembly physics engine successfully online!');
      return;
    } catch (err) {
      console.warn('[PhysicsManager] Could not start RocketSim WASM engine:', err.message);
      console.log('[PhysicsManager] Engaging high-performance ProceduralPhysicsFallback engine.');
      this.mode = 'fallback';
      this.sim = new ProceduralPhysicsFallback();
    }
  }

  get state() {
    if (this.mode === 'rocketsim') {
      const buffer = this.module.HEAPF32.buffer;
      if (!this.stateView || this.stateView.buffer !== buffer) {
        this.stateView = new Float32Array(buffer, this.statePtr, this.stateLen);
      }
      return this.stateView;
    }
    return this.sim.state;
  }

  addCar(team, config = 'default') {
    if (this.mode === 'rocketsim') {
      return this.module._physics_addCar(team, config === 'flat' ? 1 : 0);
    }
    return team === 0 ? 0 : 1;
  }

  setControls(carIndex, controls) {
    if (this.mode === 'rocketsim') {
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
    } else {
      this.sim.setControls(carIndex, controls);
    }
  }

  step(ticks = 1) {
    if (this.mode === 'rocketsim') {
      this.module._physics_step(ticks);
    } else {
      this.sim.step(ticks);
    }
  }

  resetKickoff(type = 0) {
    if (this.mode === 'rocketsim') {
      this.module._physics_resetKickoff(type);
    } else {
      this.sim.resetKickoff(type);
    }
  }

  pollGoal() {
    if (this.mode === 'rocketsim') {
      const g = this.state[1];
      if (g !== 0) {
        this.module._physics_clearGoalFlag();
      }
      return g;
    }
    return this.sim.pollGoal();
  }

  getPads() {
    if (this.mode === 'fallback') {
      return this.sim.getPads();
    }
    return [];
  }
}
