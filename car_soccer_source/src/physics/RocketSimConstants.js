/**
 * RocketSimConstants.js
 * Comprehensive constants and memory offsets for RocketSim WebAssembly physics simulation.
 * Reference: https://github.com/zealanL/rocketsim (RLConst.h, CarConfig.h, CarControls.h, PhysState.h)
 */

/**
 * Global RocketSim arena shared-memory buffer offsets (ht)
 */
export const SIM_OFFSETS = Object.freeze({
  TICK: 0,        // uint32 current physics simulation tick
  GOAL: 1,        // Goal scored event flag (0: none, 1: blue goal, 2: orange goal)
  NUM_CARS: 2,    // Number of active cars in the arena (1 in freeplay, 2+ in match/multiplayer)
  NUM_PADS: 3,    // Number of boost pads (34 in standard stadium)
  BALL: 4,        // Ball state data start offset (18 Float32 values)
  CARS: 22        // First car state data start offset (each car has CAR_STATE_STRIDE floats)
});

/**
 * Per-car RocketSim physics state offsets within a 51-float block (ye)
 * Formula: carOffset = SIM_OFFSETS.CARS + carIndex * CAR_STATE_STRIDE
 */
export const CAR_STATE_OFFSETS = Object.freeze({
  POS: 0,                     // World position [x, y, z] (3 floats)
  FWD: 3,                     // Forward direction unit vector [x, y, z] (3 floats)
  RIGHT: 6,                   // Right direction unit vector [x, y, z] (3 floats)
  UP: 9,                      // Upward direction unit vector [x, y, z] (3 floats)
  VEL: 12,                    // Linear velocity [x, y, z] (3 floats, unreal units / sec)
  ANG_VEL: 15,                // Angular velocity [x, y, z] (3 floats, rad / sec)
  BOOST: 18,                  // Boost reserve (0.0 to 100.0)
  ON_GROUND: 19,              // Contact with ground / surface (1 if >= 3 wheels touching, else 0)
  SUPERSONIC: 20,             // In supersonic state (speed > 2200 uu/s) (1 or 0)
  DEMOED: 21,                 // Demolished state (1 or 0)
  HAS_FLIP_OR_JUMP: 22,       // Has jump or dodge available (1 or 0)
  IS_BOOSTING: 23,            // Currently expending boost (1 or 0)
  IS_FLIPPING: 24,            // Currently executing flip/dodge animation (1 or 0)
  FLIP_RESET_SERIAL: 25,      // Flip reset sequence counter
  WHEELS: 26,                 // 4 wheels suspension & contact data (12 floats: 4 * [contact, susLength, wheelSpeed])
  GROUND_NORMAL: 38,          // Surface contact normal [x, y, z] (3 floats)
  JUMP_SERIAL: 41,            // Jump execution counter
  DODGE_SERIAL: 42,           // Dodge / flip execution counter
  DOUBLE_JUMP_SERIAL: 43,     // Double-jump execution counter
  WHEEL_IMPACT_SERIAL: 44,    // Suspension landing impact counter
  WHEEL_IMPACT_SPEED: 45,     // Suspension landing impact velocity
  BALL_HIT_SERIAL: 46,        // Ball hit counter (increments on every car-ball touch)
  BALL_HIT_SPEED: 47,         // Relative collision velocity with ball
  BALL_WORLD_IMPACT_SERIAL: 48,// Ball impact counter against arena walls/floor
  BALL_WORLD_IMPACT_SPEED: 49, // Ball impact speed against arena geometry
  BALL_WORLD_SURFACE: 50      // Ball impact surface type
});

/** Float stride per car in RocketSim state buffer */
export const CAR_STATE_STRIDE = 51;

/** Float stride per ball in RocketSim state buffer */
export const BALL_STATE_STRIDE = 18;

/** Float stride per car in controls view buffer */
export const CONTROLS_STRIDE = 8;

/** Maximum number of cars supported in memory layout */
export const MAX_CARS = 8;

/** Standard 120Hz physics simulation tick rate */
export const PHYSICS_TICK_RATE = 120;

/** Standard fixed physics delta time (1 / 120s = 8.333ms) */
export const FIXED_TIMESTEP = 1 / PHYSICS_TICK_RATE;

/** Maximum physics substeps simulated per frame before dropping (12 ticks = 100ms) */
export const MAX_PHYSICS_SUBSTEPS = 12;

/**
 * Ball control actions supported by RocketSim WASM
 */
export const BALL_CONTROL_MODES = Object.freeze([
  'takePossession',
  'startDribble',
  'passBall',
  'launchBall'
]);

/**
 * Team IDs
 */
export const TEAMS = Object.freeze({
  BLUE: 0,
  ORANGE: 1
});

/**
 * Accurate hitbox dimensions and offsets directly aligned with zealanL/rocketsim (CarConfig.cpp)
 */
export const HITBOX_PRESETS = Object.freeze({
  OCTANE: {
    name: 'Octane',
    size: [120.507, 86.6994, 38.6591],
    offset: [13.8757, 0, 20.755],
    frontWheels: { radius: 12.50, susRest: 38.755, offset: [51.25, 25.90, 20.755] },
    backWheels: { radius: 15.00, susRest: 37.055, offset: [-33.75, 29.50, 20.755] }
  },
  DOMINUS: {
    name: 'Dominus',
    size: [130.427, 85.7799, 33.8],
    offset: [9.0, 0, 15.75],
    frontWheels: { radius: 12.00, susRest: 33.95, offset: [50.30, 31.10, 15.75] },
    backWheels: { radius: 13.50, susRest: 33.85, offset: [-34.75, 33.00, 15.75] }
  },
  PLANK: {
    name: 'Plank',
    size: [131.32, 87.1704, 31.8944],
    offset: [9.00857, 0, 12.0942],
    frontWheels: { radius: 12.50, susRest: 31.9242, offset: [49.97, 27.80, 12.0942] },
    backWheels: { radius: 17.00, susRest: 27.9242, offset: [-35.43, 20.28, 12.0942] }
  },
  BREAKOUT: {
    name: 'Breakout',
    size: [133.992, 83.021, 32.8],
    offset: [12.5, 0, 11.75],
    frontWheels: { radius: 13.50, susRest: 29.7, offset: [51.50, 26.67, 11.75] },
    backWheels: { radius: 15.00, susRest: 29.666, offset: [-35.75, 35.00, 11.75] }
  },
  HYBRID: {
    name: 'Hybrid',
    size: [129.519, 84.6879, 36.6591],
    offset: [13.8757, 0, 20.755],
    frontWheels: { radius: 12.50, susRest: 38.755, offset: [51.25, 25.90, 20.755] },
    backWheels: { radius: 15.00, susRest: 37.055, offset: [-34.00, 29.50, 20.755] }
  },
  MERC: {
    name: 'Merc',
    size: [123.22, 79.2103, 44.1591],
    offset: [11.3757, 0, 21.505],
    frontWheels: { radius: 15.00, susRest: 39.505, offset: [51.25, 25.90, 21.505] },
    backWheels: { radius: 15.00, susRest: 39.105, offset: [-33.75, 29.50, 21.505] }
  }
});

// Backward-compatibility aliases with the original obfuscated symbols
export const ht = SIM_OFFSETS;
export const ye = CAR_STATE_OFFSETS;
export const ln = CAR_STATE_STRIDE;
export const kf = CONTROLS_STRIDE;
export const u0 = MAX_CARS;
export const xC = PHYSICS_TICK_RATE;
export const da = FIXED_TIMESTEP;
export const oc = MAX_PHYSICS_SUBSTEPS;
export const to = BALL_CONTROL_MODES;
