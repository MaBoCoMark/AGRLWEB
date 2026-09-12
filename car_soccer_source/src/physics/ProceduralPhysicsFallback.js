/**
 * ProceduralPhysicsFallback.js
 * A high-performance pure JavaScript arcade physics simulation for Car Soccer.
 * Acts as a complete standalone engine or fallback when RocketSim collision meshes are missing.
 * Supports:
 * - 120Hz deterministic stepping
 * - Car driving, steering, suspension & drifting
 * - Single jump, double jump, dodge flips (front/back/diagonal)
 * - Aerial control (pitch, yaw, roll)
 * - Rocket boosting with supersonic speed
 * - Sphere-box car-ball elastic collision & impulse
 * - Arena wall, ceiling, goal posts and net collisions
 * - Goal scoring detection and kickoff resets
 */

import { ARENA, BALL, OCTANE, BOOST_PADS, SIM_STATE, CAR_STATE, CAR_STATE_STRIDE } from '../constants/GameConstants.js';

export class ProceduralPhysicsFallback {
  constructor() {
    this.tick = 0;
    this.goalScored = 0; // 0 = none, 1 = Blue goal (Orange scored), 2 = Orange goal (Blue scored)
    
    // Ball state
    this.ballPos = [0, 0, 100]; // RL coordinates: X right, Y forward, Z up
    this.ballVel = [0, 0, 0];
    this.ballAngVel = [0, 0, 0];
    this.ballRadius = BALL.RADIUS;
    this.ballOnGround = false;

    // Cars state (up to 2 cars: [0] = Player, [1] = Bot)
    this.cars = [
      this.createDefaultCar(0, 0),
      this.createDefaultCar(1, 1),
    ];

    // Boost pads state
    this.pads = BOOST_PADS.map(p => ({
      pos: [...p.pos],
      isBig: p.isBig,
      isActive: true,
      cooldown: 0,
    }));

    // Output state buffer formatted identically to RocketSim's state view
    this.totalStateFloats = SIM_STATE.CARS + 2 * CAR_STATE_STRIDE;
    this.stateBuffer = new Float32Array(this.totalStateFloats);
    this.controlsBuffer = new Float32Array(16); // 8 floats per car

    this.resetKickoff(0);
  }

  createDefaultCar(id, team) {
    return {
      id,
      team,
      pos: [0, team === 0 ? -3000 : 3000, 17],
      rot: [0, team === 0 ? 0 : Math.PI, 0], // Yaw, Pitch, Roll
      vel: [0, 0, 0],
      angVel: [0, 0, 0],
      boost: 33.33,
      onGround: true,
      supersonic: false,
      demoed: false,
      isBoosting: false,
      isFlipping: false,
      hasFlipOrJump: true,
      jumpTimer: 0,
      jumpCount: 0,
      dodgeTimer: 0,
      dodgeDir: [0, 0],
      flipResetSerial: 0,
      jumpSerial: 0,
      dodgeSerial: 0,
      doubleJumpSerial: 0,
      wheelImpactSerial: 0,
      wheelImpactSpeed: 0,
      ballHitSerial: 0,
      ballHitSpeed: 0,
      ballWorldImpactSerial: 0,
      ballWorldImpactSpeed: 0,
      ballWorldSurface: 0,
    };
  }

  resetKickoff(type = 0) {
    this.goalScored = 0;
    this.ballPos = [0, 0, BALL.RADIUS];
    this.ballVel = [0, 0, 0];
    this.ballAngVel = [0, 0, 0];

    // Kickoff positions: Blue facing +Y, Orange facing -Y
    const p = this.cars[0];
    p.pos = [0, -3500, 17];
    p.rot = [0, 0, 0]; // facing forward (+Y)
    p.vel = [0, 0, 0];
    p.angVel = [0, 0, 0];
    p.boost = 33.33;
    p.onGround = true;
    p.hasFlipOrJump = true;
    p.jumpCount = 0;

    const b = this.cars[1];
    b.pos = [0, 3500, 17];
    b.rot = [Math.PI, 0, 0]; // facing forward (-Y)
    b.vel = [0, 0, 0];
    b.angVel = [0, 0, 0];
    b.boost = 33.33;
    b.onGround = true;
    b.hasFlipOrJump = true;
    b.jumpCount = 0;

    this.pads.forEach(pad => {
      pad.isActive = true;
      pad.cooldown = 0;
    });

    this.updateStateBuffer();
  }

  setControls(carIndex, controls) {
    const offset = carIndex * 8;
    this.controlsBuffer[offset + 0] = controls.throttle || 0;
    this.controlsBuffer[offset + 1] = controls.steer || 0;
    this.controlsBuffer[offset + 2] = controls.pitch || 0;
    this.controlsBuffer[offset + 3] = controls.yaw || 0;
    this.controlsBuffer[offset + 4] = controls.roll || 0;
    this.controlsBuffer[offset + 5] = controls.jump ? 1 : 0;
    this.controlsBuffer[offset + 6] = controls.boost ? 1 : 0;
    this.controlsBuffer[offset + 7] = controls.handbrake ? 1 : 0;
  }

  step(numTicks = 1) {
    const dt = 1 / 120; // 120Hz physics step

    for (let t = 0; t < numTicks; t++) {
      this.tick++;

      // Step each car
      for (let i = 0; i < this.cars.length; i++) {
        this.stepCar(this.cars[i], i, dt);
      }

      // Step ball
      this.stepBall(dt);

      // Car-Ball collisions
      for (let i = 0; i < this.cars.length; i++) {
        this.checkCarBallCollision(this.cars[i]);
      }

      // Update Boost Pads
      this.updatePads(dt);

      // Check Goal triggers
      this.checkGoal();
    }

    this.updateStateBuffer();
  }

  stepCar(car, index, dt) {
    if (car.demoed) return;

    const off = index * 8;
    const throttle = this.controlsBuffer[off + 0];
    const steer = this.controlsBuffer[off + 1];
    const pitch = this.controlsBuffer[off + 2];
    const yaw = this.controlsBuffer[off + 3];
    const roll = this.controlsBuffer[off + 4];
    const jump = this.controlsBuffer[off + 5] > 0.5;
    const boost = this.controlsBuffer[off + 6] > 0.5;
    const handbrake = this.controlsBuffer[off + 7] > 0.5;

    const forwardX = -Math.sin(car.rot[0]);
    const forwardY = Math.cos(car.rot[0]);

    // Ground physics
    if (car.onGround) {
      // Steering & Driving
      const driveAccel = 1600 * throttle;
      car.vel[0] += forwardX * driveAccel * dt;
      car.vel[1] += forwardY * driveAccel * dt;

      // Friction & Steering turn
      const currentSpeed = Math.hypot(car.vel[0], car.vel[1]);
      const turnSpeed = handbrake ? 3.5 : 2.5;
      if (currentSpeed > 20) {
        car.rot[0] += steer * turnSpeed * dt * (currentSpeed / 1000 + 0.5);
      }

      // Lateral drag (less with handbrake)
      const lateralDrag = handbrake ? 0.94 : 0.88;
      const rightX = forwardY;
      const rightY = -forwardX;
      const rightSpeed = car.vel[0] * rightX + car.vel[1] * rightY;
      car.vel[0] -= rightX * rightSpeed * (1 - lateralDrag);
      car.vel[1] -= rightY * rightSpeed * (1 - lateralDrag);

      // Jump
      if (jump && car.hasFlipOrJump && car.jumpCount === 0) {
        car.vel[2] = 292; // RL single jump impulse
        car.onGround = false;
        car.jumpCount = 1;
        car.jumpTimer = 0.2;
        car.jumpSerial++;
      }
    } else {
      // In-Air physics
      // Gravity
      car.vel[2] -= 650 * dt;

      // Aerial rotation
      car.rot[0] += yaw * 3.0 * dt;
      car.rot[1] += pitch * 3.0 * dt;
      car.rot[2] += roll * 3.0 * dt;

      // Double jump or Dodge Flip
      if (jump && car.jumpCount === 1 && car.jumpTimer <= 0) {
        if (Math.abs(throttle) > 0.3 || Math.abs(steer) > 0.3) {
          // Flip / Dodge
          car.isFlipping = true;
          car.dodgeSerial++;
          const dodgeDirX = forwardX * throttle + forwardY * -steer;
          const dodgeDirY = forwardY * throttle + (-forwardX) * -steer;
          const dodgeMag = Math.hypot(dodgeDirX, dodgeDirY) || 1;
          car.vel[0] += (dodgeDirX / dodgeMag) * 500;
          car.vel[1] += (dodgeDirY / dodgeMag) * 500;
          car.vel[2] = Math.max(car.vel[2], 0);
        } else {
          // Pure double jump
          car.vel[2] += 292;
          car.doubleJumpSerial++;
        }
        car.jumpCount = 2;
        car.hasFlipOrJump = false;
      }
    }

    if (car.jumpTimer > 0) car.jumpTimer -= dt;

    // Rocket Boost
    car.isBoosting = false;
    if (boost && car.boost > 0) {
      car.isBoosting = true;
      car.boost = Math.max(0, car.boost - 33.3 * dt);
      const boostAccel = 991.666;
      car.vel[0] += forwardX * boostAccel * dt;
      car.vel[1] += forwardY * boostAccel * dt;
      if (!car.onGround) {
        car.vel[2] += Math.sin(car.rot[1]) * boostAccel * dt;
      }
    }

    // Velocity limits & Supersonic
    const speed = Math.hypot(car.vel[0], car.vel[1], car.vel[2]);
    if (speed > OCTANE.MAX_SPEED) {
      const scale = OCTANE.MAX_SPEED / speed;
      car.vel[0] *= scale;
      car.vel[1] *= scale;
      car.vel[2] *= scale;
    }
    car.supersonic = speed >= OCTANE.SUPERSONIC_SPEED;

    // Position integration
    car.pos[0] += car.vel[0] * dt;
    car.pos[1] += car.vel[1] * dt;
    car.pos[2] += car.vel[2] * dt;

    // Ground floor clamp
    if (car.pos[2] <= 17) {
      car.pos[2] = 17;
      car.vel[2] = 0;
      car.onGround = true;
      car.hasFlipOrJump = true;
      car.jumpCount = 0;
      car.isFlipping = false;
      car.rot[1] = 0;
      car.rot[2] = 0;
    }

    // Arena boundary clamps
    const halfW = ARENA.WIDTH / 2 - 50;
    const halfL = ARENA.LENGTH / 2 - 50;
    if (Math.abs(car.pos[0]) > halfW) {
      car.pos[0] = Math.sign(car.pos[0]) * halfW;
      car.vel[0] *= -0.3;
    }
    if (Math.abs(car.pos[1]) > halfL) {
      // In front of goal?
      const inGoalX = Math.abs(car.pos[0]) < ARENA.GOAL_WIDTH / 2;
      const inGoalZ = car.pos[2] < ARENA.GOAL_HEIGHT;
      if (!(inGoalX && inGoalZ)) {
        car.pos[1] = Math.sign(car.pos[1]) * halfL;
        car.vel[1] *= -0.3;
      }
    }
  }

  stepBall(dt) {
    // Ball gravity
    this.ballVel[2] -= 650 * dt;

    // Position integration
    this.ballPos[0] += this.ballVel[0] * dt;
    this.ballPos[1] += this.ballVel[1] * dt;
    this.ballPos[2] += this.ballVel[2] * dt;

    // Floor collision
    if (this.ballPos[2] <= this.ballRadius) {
      this.ballPos[2] = this.ballRadius;
      this.ballVel[2] = -this.ballVel[2] * BALL.RESTITUTION;
      this.ballVel[0] *= 0.985;
      this.ballVel[1] *= 0.985;
      this.ballOnGround = true;
    } else {
      this.ballOnGround = false;
    }

    // Arena wall collision
    const halfW = ARENA.WIDTH / 2 - this.ballRadius;
    const halfL = ARENA.LENGTH / 2 - this.ballRadius;

    // Side walls
    if (Math.abs(this.ballPos[0]) > halfW) {
      this.ballPos[0] = Math.sign(this.ballPos[0]) * halfW;
      this.ballVel[0] = -this.ballVel[0] * BALL.RESTITUTION;
    }

    // End walls & Goal opening
    if (Math.abs(this.ballPos[1]) > halfL) {
      const inGoalX = Math.abs(this.ballPos[0]) < (ARENA.GOAL_WIDTH / 2 - this.ballRadius);
      const inGoalZ = this.ballPos[2] < (ARENA.GOAL_HEIGHT - this.ballRadius);
      
      if (!inGoalX || !inGoalZ) {
        this.ballPos[1] = Math.sign(this.ballPos[1]) * halfL;
        this.ballVel[1] = -this.ballVel[1] * BALL.RESTITUTION;
      }
    }

    // Ceiling
    if (this.ballPos[2] > ARENA.HEIGHT - this.ballRadius) {
      this.ballPos[2] = ARENA.HEIGHT - this.ballRadius;
      this.ballVel[2] = -this.ballVel[2] * BALL.RESTITUTION;
    }
  }

  checkCarBallCollision(car) {
    const dx = this.ballPos[0] - car.pos[0];
    const dy = this.ballPos[1] - car.pos[1];
    const dz = this.ballPos[2] - car.pos[2];
    const dist = Math.hypot(dx, dy, dz);

    const hitDist = this.ballRadius + OCTANE.WIDTH / 2;
    if (dist < hitDist && dist > 0.001) {
      // Collision occurred!
      const nx = dx / dist;
      const ny = dy / dist;
      const nz = dz / dist;

      // Separation
      const overlap = hitDist - dist;
      this.ballPos[0] += nx * overlap;
      this.ballPos[1] += ny * overlap;
      this.ballPos[2] += nz * overlap;

      // Impulse calculation based on car velocity
      const carSpeed = Math.hypot(car.vel[0], car.vel[1], car.vel[2]);
      const hitPower = Math.max(carSpeed * 1.25, 400);

      this.ballVel[0] = nx * hitPower + car.vel[0] * 0.4;
      this.ballVel[1] = ny * hitPower + car.vel[1] * 0.4;
      this.ballVel[2] = Math.max(nz * hitPower + car.vel[2] * 0.4, 200);

      car.ballHitSerial++;
      car.ballHitSpeed = hitPower;
    }
  }

  updatePads(dt) {
    this.pads.forEach(pad => {
      if (!pad.isActive) {
        pad.cooldown -= dt;
        if (pad.cooldown <= 0) {
          pad.isActive = true;
        }
      } else {
        // Check player/bot pickup
        this.cars.forEach(car => {
          const d = Math.hypot(car.pos[0] - pad.pos[0], car.pos[1] - pad.pos[1]);
          if (d < 160 && car.boost < 100) {
            car.boost = Math.min(100, car.boost + (pad.isBig ? 100 : 12));
            pad.isActive = false;
            pad.cooldown = pad.isBig ? 10.0 : 4.0;
          }
        });
      }
    });
  }

  checkGoal() {
    const goalLine = ARENA.LENGTH / 2 + this.ballRadius;
    if (this.ballPos[1] > goalLine && Math.abs(this.ballPos[0]) < ARENA.GOAL_WIDTH / 2 && this.ballPos[2] < ARENA.GOAL_HEIGHT) {
      this.goalScored = 2; // Blue scored into Orange net!
    } else if (this.ballPos[1] < -goalLine && Math.abs(this.ballPos[0]) < ARENA.GOAL_WIDTH / 2 && this.ballPos[2] < ARENA.GOAL_HEIGHT) {
      this.goalScored = 1; // Orange scored into Blue net!
    }
  }

  pollGoal() {
    const g = this.goalScored;
    return g;
  }

  updateStateBuffer() {
    const b = this.stateBuffer;
    b[SIM_STATE.TICK] = this.tick;
    b[SIM_STATE.GOAL] = this.goalScored;
    b[SIM_STATE.NUM_CARS] = this.cars.length;
    b[SIM_STATE.NUM_PADS] = this.pads.length;

    // Ball state (18 floats at SIM_STATE.BALL)
    const bo = SIM_STATE.BALL;
    b[bo + 0] = this.ballPos[0];
    b[bo + 1] = this.ballPos[1];
    b[bo + 2] = this.ballPos[2];
    // Basis rotation (identity / simple yaw for sphere)
    b[bo + 3] = 1; b[bo + 4] = 0; b[bo + 5] = 0;
    b[bo + 6] = 0; b[bo + 7] = 1; b[bo + 8] = 0;
    b[bo + 9] = 0; b[bo + 10] = 0; b[bo + 11] = 1;
    // Ball velocity
    b[bo + 12] = this.ballVel[0];
    b[bo + 13] = this.ballVel[1];
    b[bo + 14] = this.ballVel[2];
    // Ball ang velocity
    b[bo + 15] = this.ballAngVel[0];
    b[bo + 16] = this.ballAngVel[1];
    b[bo + 17] = this.ballAngVel[2];

    // Cars state (51 floats each starting at SIM_STATE.CARS)
    this.cars.forEach((car, i) => {
      const co = SIM_STATE.CARS + i * CAR_STATE_STRIDE;
      b[co + CAR_STATE.POS + 0] = car.pos[0];
      b[co + CAR_STATE.POS + 1] = car.pos[1];
      b[co + CAR_STATE.POS + 2] = car.pos[2];

      const yaw = car.rot[0];
      const pitch = car.rot[1];
      const roll = car.rot[2];

      // Forward vector
      b[co + CAR_STATE.FWD + 0] = -Math.sin(yaw);
      b[co + CAR_STATE.FWD + 1] = Math.cos(yaw);
      b[co + CAR_STATE.FWD + 2] = Math.sin(pitch);

      // Right vector
      b[co + CAR_STATE.RIGHT + 0] = Math.cos(yaw);
      b[co + CAR_STATE.RIGHT + 1] = Math.sin(yaw);
      b[co + CAR_STATE.RIGHT + 2] = Math.sin(roll);

      // Up vector
      b[co + CAR_STATE.UP + 0] = 0;
      b[co + CAR_STATE.UP + 1] = -Math.sin(pitch);
      b[co + CAR_STATE.UP + 2] = 1;

      b[co + CAR_STATE.VEL + 0] = car.vel[0];
      b[co + CAR_STATE.VEL + 1] = car.vel[1];
      b[co + CAR_STATE.VEL + 2] = car.vel[2];

      b[co + CAR_STATE.BOOST] = car.boost;
      b[co + CAR_STATE.ON_GROUND] = car.onGround ? 1 : 0;
      b[co + CAR_STATE.SUPERSONIC] = car.supersonic ? 1 : 0;
      b[co + CAR_STATE.DEMOED] = car.demoed ? 1 : 0;
      b[co + CAR_STATE.HAS_FLIP_OR_JUMP] = car.hasFlipOrJump ? 1 : 0;
      b[co + CAR_STATE.IS_BOOSTING] = car.isBoosting ? 1 : 0;
      b[co + CAR_STATE.IS_FLIPPING] = car.isFlipping ? 1 : 0;

      b[co + CAR_STATE.JUMP_SERIAL] = car.jumpSerial;
      b[co + CAR_STATE.DODGE_SERIAL] = car.dodgeSerial;
      b[co + CAR_STATE.DOUBLE_JUMP_SERIAL] = car.doubleJumpSerial;
      b[co + CAR_STATE.BALL_HIT_SERIAL] = car.ballHitSerial;
      b[co + CAR_STATE.BALL_HIT_SPEED] = car.ballHitSpeed;
      b[co + CAR_STATE.BALL_WORLD_IMPACT_SERIAL] = car.ballWorldImpactSerial;
      b[co + CAR_STATE.BALL_WORLD_IMPACT_SPEED] = car.ballWorldImpactSpeed;
      b[co + CAR_STATE.BALL_WORLD_SURFACE] = car.ballWorldSurface;
    });
  }

  get state() {
    return this.stateBuffer;
  }

  getPads() {
    return this.pads.map(p => ({
      pos: p.pos,
      isBig: p.isBig,
      isActive: p.isActive,
    }));
  }
}
