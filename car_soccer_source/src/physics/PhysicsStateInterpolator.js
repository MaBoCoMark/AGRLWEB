/**
 * PhysicsStateInterpolator.js
 * 120Hz deterministic physics state accumulator and linear interpolator (deobfuscates CC).
 *
 * Provides smooth rendering at any monitor refresh rate (60Hz, 120Hz, 144Hz, 240Hz, etc.)
 * by interpolating between prevState and currState using alpha = accumulator / timestep.
 * Prevents spiral-of-death by capping max simulated substeps to 12 ticks (100ms) per frame.
 */

import {
  SIM_OFFSETS,
  BALL_STATE_STRIDE,
  FIXED_TIMESTEP,
  MAX_PHYSICS_SUBSTEPS
} from './RocketSimConstants.js';

export class PhysicsStateInterpolator {
  /**
   * @param {import('./RocketSimPhysicsEngine.js').RocketSimPhysicsEngine} sim
   */
  constructor(sim) {
    this.sim = sim;
    this.prevState = sim.state.slice();
    this.currState = sim.state.slice();

    this.alpha = 0;
    this.lastTicks = 0;
    this.lastDropped = 0;
    this.lastStalled = false;
    this.accumulator = 0;
    this.lastTime = -1;
  }

  /**
   * Synchronize ball state immediately without resetting car states
   */
  syncBall() {
    const ballSlice = this.sim.state.subarray(
      SIM_OFFSETS.BALL,
      SIM_OFFSETS.BALL + BALL_STATE_STRIDE
    );
    this.prevState.set(ballSlice, SIM_OFFSETS.BALL);
    this.currState.set(ballSlice, SIM_OFFSETS.BALL);
  }

  /**
   * Synchronize both previous and current states to the simulation state and reset accumulator
   * @param {number} time timestamp (ms)
   */
  sync(time = performance.now()) {
    this.prevState.set(this.sim.state);
    this.currState.set(this.sim.state);
    this.accumulator = 0;
    this.alpha = 0;
    this.lastTime = time;
    this.lastTicks = 0;
  }

  /**
   * Advance the physics accumulator and execute 120Hz physics ticks
   * @param {number} currentTime performance.now() timestamp (ms)
   * @param {() => void} beforeStepCallback Callback to read & apply player controls before stepping
   * @param {(() => boolean) | undefined} stepCallback Optional tick callback (used in Match mode to evaluate AI bot)
   */
  update(currentTime, beforeStepCallback, stepCallback) {
    if (this.lastTime < 0) {
      this.lastTime = currentTime;
    }

    const deltaSec = (currentTime - this.lastTime) / 1000;
    this.lastStalled = deltaSec > 0.25;
    this.accumulator += Math.min(deltaSec, 0.25);
    this.lastTime = currentTime;

    let ticksToRun = Math.floor(this.accumulator / FIXED_TIMESTEP);
    this.accumulator = Math.max(0, this.accumulator - ticksToRun * FIXED_TIMESTEP);
    this.lastDropped = Math.max(0, ticksToRun - MAX_PHYSICS_SUBSTEPS);

    if (ticksToRun > MAX_PHYSICS_SUBSTEPS) {
      ticksToRun = MAX_PHYSICS_SUBSTEPS;
    }
    this.lastTicks = ticksToRun;

    if (ticksToRun > 0) {
      beforeStepCallback();

      if (stepCallback) {
        // Step-by-step evaluation (e.g. for RL bots in Match mode)
        this.lastTicks = 0;
        for (let i = 0; i < ticksToRun; i++) {
          this.prevState.set(this.currState);
          if (!stepCallback()) {
            this.accumulator = 0;
            break;
          }
          this.currState.set(this.sim.state);
          this.lastTicks++;
        }
        this.alpha = this.accumulator / FIXED_TIMESTEP;
        return;
      }

      // Fast path for multi-tick stepping
      if (ticksToRun > 1) {
        this.sim.step(ticksToRun - 1);
        this.prevState.set(this.sim.state);
        this.sim.step(1);
      } else {
        const tmp = this.prevState;
        this.prevState = this.currState;
        this.currState = tmp;
        this.sim.step(1);
      }

      this.currState.set(this.sim.state);
      this.alpha = this.accumulator / FIXED_TIMESTEP;
    } else {
      this.alpha = Math.min(this.accumulator / FIXED_TIMESTEP, 1);
    }
  }
}

// Backward-compatibility alias with original obfuscated symbol CC
export const CC = PhysicsStateInterpolator;
export default PhysicsStateInterpolator;
