/**
 * PhysicsManager.js
 * Unified physics orchestrator for RocketSim WebAssembly.
 * Re-exports the deobfuscated RocketSimPhysicsEngine, PhysicsStateInterpolator,
 * and RocketSimConstants aligned with upstream zealanL/rocketsim.
 */

export {
  RocketSimPhysicsEngine,
  RocketSimPhysicsEngine as PhysicsManager,
  yC,
  getTeamAssignment,
  PLAYER_CAR_INDEX,
  BOT_CAR_INDEX
} from './RocketSimPhysicsEngine.js';

export {
  PhysicsStateInterpolator,
  CC
} from './PhysicsStateInterpolator.js';

export {
  SIM_OFFSETS,
  CAR_STATE_OFFSETS,
  CAR_STATE_STRIDE,
  BALL_STATE_STRIDE,
  CONTROLS_STRIDE,
  MAX_CARS,
  PHYSICS_TICK_RATE,
  FIXED_TIMESTEP,
  MAX_PHYSICS_SUBSTEPS,
  BALL_CONTROL_MODES,
  TEAMS,
  HITBOX_PRESETS,
  ht,
  ye,
  ln,
  kf,
  u0,
  xC,
  da,
  oc,
  to
} from './RocketSimConstants.js';
