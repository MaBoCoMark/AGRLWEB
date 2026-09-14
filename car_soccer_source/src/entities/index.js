/**
 * entities/index.js
 * Unified export point for 3D game entities, arena visual systems, and post-processing elements.
 */

export * from "./BallLocatorArrow.js";
export * from "./DemolitionEffect.js";
export * from "./BoostPadSystem.js";
export * from "./SpeedTrail.js";
export * from "./BallVisual.js";
export * from "./ArenaWorld.js";
export * from "./StadiumArena.js";
export * from "./VehicleAssembly.js";
export * from "./VehicleBoostEmitter.js";

// Explicit disambiguation for star-exported symbols shared across submodules
// Resolves esbuild / Vite "Ambiguous import has multiple matching exports"
export {
  OCTANE_BOOST_OUTLETS,
  FLAT_CAR_BOOST_OUTLETS
} from "./VehicleAssembly.js";

export {
  loadStadiumContinuousBoundary,
  loadStadiumArchitecture
} from "./StadiumArena.js";

export {
  resolveContext
} from "./ArenaWorld.js";
