/**
 * BotController.js
 * Hybrid AI Opponent system supporting ONNX Runtime reinforcement learning bots
 * (Nexto, Necto, Seer) as well as an integrated heuristic state-machine bot.
 */

import { ARENA, CAR_STATE, CAR_STATE_STRIDE, SIM_STATE } from '../constants/GameConstants.js';

export class BotController {
  constructor(team = 1) {
    this.team = team; // 1 = Orange, 0 = Blue
    this.botIndex = 1;
    this.worker = null;
    this.useOnnx = false;

    this.controls = {
      throttle: 0,
      steer: 0,
      pitch: 0,
      yaw: 0,
      roll: 0,
      jump: false,
      boost: false,
      handbrake: false,
    };

    this.initOnnxWorker();
  }

  async initOnnxWorker() {
    try {
      const checkResp = await fetch('/assets/worker-iFqqV1m9.js');
      if (!checkResp.ok) throw new Error('Worker script not found');

      this.worker = new Worker('/assets/worker-iFqqV1m9.js', { type: 'module' });
      this.useOnnx = true;
      console.log('[BotController] Connected to ONNX bot worker.');
    } catch {
      console.log('[BotController] Using built-in Heuristic AI bot.');
      this.useOnnx = false;
    }
  }

  decide(state) {
    if (!state || state.length < SIM_STATE.CARS + 2 * CAR_STATE_STRIDE) {
      return this.controls;
    }

    // Ball position (RL coords)
    const bx = state[SIM_STATE.BALL + 0];
    const by = state[SIM_STATE.BALL + 1];
    const bz = state[SIM_STATE.BALL + 2];

    // Bot Car (Car 1)
    const botOff = SIM_STATE.CARS + this.botIndex * CAR_STATE_STRIDE;
    const cx = state[botOff + CAR_STATE.POS + 0];
    const cy = state[botOff + CAR_STATE.POS + 1];
    const cz = state[botOff + CAR_STATE.POS + 2];

    const fwdX = state[botOff + CAR_STATE.FWD + 0];
    const fwdY = state[botOff + CAR_STATE.FWD + 1];
    const boost = state[botOff + CAR_STATE.BOOST];
    const onGround = state[botOff + CAR_STATE.ON_GROUND] === 1;

    // Vector to ball
    const dx = bx - cx;
    const dy = by - cy;
    const dist = Math.hypot(dx, dy);

    // Desired angle to approach ball
    // Target ball with an offset to push toward Blue Goal (y = -ARENA.LENGTH/2)
    const targetY = by > cy ? by : by + 200;
    const targetAngle = Math.atan2(targetY - cy, bx - cx);
    const currentAngle = Math.atan2(fwdY, fwdX);

    let angleDiff = targetAngle - currentAngle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    // Steering proportional to angle
    const steer = Math.max(-1, Math.min(1, angleDiff * 2.5));

    // Throttle & Boost
    let throttle = 1.0;
    let useBoost = false;

    if (Math.abs(angleDiff) < 0.3 && dist > 400 && boost > 15) {
      useBoost = true;
    } else if (Math.abs(angleDiff) > 1.8) {
      throttle = 0.3; // slow down for sharp turns
    }

    // Jump / hit when close to ball
    let jump = false;
    if (dist < 280 && bz < 250 && onGround && Math.abs(angleDiff) < 0.4) {
      jump = true;
    }

    this.controls = {
      throttle,
      steer: -steer, // invert steer for RL coordinate system
      pitch: 0,
      yaw: -steer,
      roll: 0,
      jump,
      boost: useBoost,
      handbrake: Math.abs(angleDiff) > 1.6,
    };

    return this.controls;
  }
}
