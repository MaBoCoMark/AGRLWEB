/**
 * GameConstants.js
 * Standard Rocket League / RocketSim gameplay, arena, physics and car specifications.
 */

// Arena specifications (Unreal / Rocket League units)
export const ARENA = {
  LENGTH: 10240,       // Total length along X/Y
  WIDTH: 8192,         // Total width
  HEIGHT: 2048,        // Ceiling height
  CORNER_RADIUS: 1629, // Corner bevel
  GOAL_WIDTH: 1785.6,  // Goal mouth opening
  GOAL_HEIGHT: 642.97, // Goal net height
  GOAL_DEPTH: 880,     // Net depth
};

// Ball specifications
export const BALL = {
  RADIUS: 91.25,       // Standard Rocket League ball radius
  MASS: 30,
  RESTITUTION: 0.6,
  MAX_SPEED: 4000,
};

// Car specifications (Octane standard hitbox)
export const OCTANE = {
  LENGTH: 120.507,
  WIDTH: 86.6994,
  HEIGHT: 38.6591,
  WHEEL_RADIUS: 13.8757,
  RESTITUTION: 0.2,
  MAX_SPEED: 2300,
  SUPERSONIC_SPEED: 2200,
  BOOST_FORCE: 991.666,
  MAX_BOOST: 100,
  STARTING_BOOST: 33.33,
};

// RocketSim State Array Indices
export const SIM_STATE = {
  TICK: 0,
  GOAL: 1,
  NUM_CARS: 2,
  NUM_PADS: 3,
  BALL: 4,      // 18 floats: pos (3), rot (9), vel (3), angVel (3)
  CARS: 22,     // Array of 51 floats per car
};

// Per-Car State Layout (51 floats)
export const CAR_STATE = {
  POS: 0,
  FWD: 3,
  RIGHT: 6,
  UP: 9,
  VEL: 12,
  ANG_VEL: 15,
  BOOST: 18,
  ON_GROUND: 19,
  SUPERSONIC: 20,
  DEMOED: 21,
  HAS_FLIP_OR_JUMP: 22,
  IS_BOOSTING: 23,
  IS_FLIPPING: 24,
  FLIP_RESET_SERIAL: 25,
  WHEELS: 26,
  GROUND_NORMAL: 38,
  JUMP_SERIAL: 41,
  DODGE_SERIAL: 42,
  DOUBLE_JUMP_SERIAL: 43,
  WHEEL_IMPACT_SERIAL: 44,
  WHEEL_IMPACT_SPEED: 45,
  BALL_HIT_SERIAL: 46,
  BALL_HIT_SPEED: 47,
  BALL_WORLD_IMPACT_SERIAL: 48,
  BALL_WORLD_IMPACT_SPEED: 49,
  BALL_WORLD_SURFACE: 50,
};

export const CAR_STATE_STRIDE = 51;
export const CONTROLS_STRIDE = 8; // throttle, steer, pitch, yaw, roll, jump, boost, handbrake

// Standard 34 Boost Pad Positions in Soccar
export const BOOST_PADS = [
  // 6 Big Pads (+100 Boost, 10s cooldown)
  { pos: [0, -4096, 73], isBig: true },
  { pos: [0, 4096, 73], isBig: true },
  { pos: [-3584, 0, 73], isBig: true },
  { pos: [3584, 0, 73], isBig: true },
  { pos: [-3072, -4096, 73], isBig: true },
  { pos: [3072, -4096, 73], isBig: true },
  { pos: [-3072, 4096, 73], isBig: true },
  { pos: [3072, 4096, 73], isBig: true },
  // 28 Small Pads (+12 Boost, 4s cooldown)
  { pos: [0, -2816, 70], isBig: false },
  { pos: [0, -1024, 70], isBig: false },
  { pos: [0, 1024, 70], isBig: false },
  { pos: [0, 2816, 70], isBig: false },
  { pos: [-1792, -4184, 70], isBig: false },
  { pos: [1792, -4184, 70], isBig: false },
  { pos: [-1792, 4184, 70], isBig: false },
  { pos: [1792, 4184, 70], isBig: false },
  { pos: [-940, -3308, 70], isBig: false },
  { pos: [940, -3308, 70], isBig: false },
  { pos: [-940, 3308, 70], isBig: false },
  { pos: [940, 3308, 70], isBig: false },
  { pos: [-1792, -2816, 70], isBig: false },
  { pos: [1792, -2816, 70], isBig: false },
  { pos: [-1792, 2816, 70], isBig: false },
  { pos: [1792, 2816, 70], isBig: false },
  { pos: [-2048, -1036, 70], isBig: false },
  { pos: [2048, -1036, 70], isBig: false },
  { pos: [-2048, 1036, 70], isBig: false },
  { pos: [2048, 1036, 70], isBig: false },
  { pos: [-1024, 0, 70], isBig: false },
  { pos: [1024, 0, 70], isBig: false },
  { pos: [-3072, -2048, 70], isBig: false },
  { pos: [3072, -2048, 70], isBig: false },
  { pos: [-3072, 2048, 70], isBig: false },
  { pos: [3072, 2048, 70], isBig: false },
];

export const TEAMS = {
  BLUE: 0,
  ORANGE: 1,
};

export const TEAM_COLORS = {
  BLUE: 0x0077ff,
  ORANGE: 0xff6600,
};
