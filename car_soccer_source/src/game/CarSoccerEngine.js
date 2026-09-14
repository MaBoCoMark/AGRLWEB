/**
 * src/game/CarSoccerEngine.js
 * Main Car Soccer Game Engine Entry Point & Subsystem Coordinator (Phase 8.4).
 *
 * Fully modularized and deobfuscated:
 * - Centralized Three.js Subsystem Context Provider (Phase 8.3 -> src/providers/ThreeProvider.js)
 * - Standalone Three.js r185 Vendor Library (Phase 8.2 -> src/vendor/three.js)
 * - Game Runtime Orchestrator & 120Hz Clock (Phase 8.1 -> src/game/GameRuntime.js)
 * - Lifecycle Bootstrap & Loading Screen (Phase 8.4 -> src/game/GameBootstrap.js)
 * - Retains 100% backward-compatibility aliases and validation hooks.
 */

import { auditRequiredAssets, formatMissingAssetsHtml, validateAssetResponse } from './AssetDiagnostics.js';
import {
  createMultiThemeMaterial,
  createMultiThemeMaterial as vn,
  getThemeMaterial,
  getThemeMaterial as Vi,
  isMultiThemeMaterial,
  isMultiThemeMaterial as F0,
  resolveThemeMaterial,
  resolveThemeMaterial as D0,
  registerThemeSubtree,
  registerThemeSubtree as Ji,
  getArcadeLightRampTexture,
  createCelShadedToonMaterial,
  createCelShadedToonMaterial as Nr,
  applyArcadeCelShading,
  applyArcadeCelShading as N0,
  setThemeMaterialThreeContext
} from '../effects/ThemeMaterialPipeline.js';
import {
  prewarmSceneShaders,
  prewarmSceneShaders as hB,
  setShaderPrewarmerThreeContext
} from './ShaderPrewarmer.js';
import {
  registerGameServiceWorker,
  registerGameServiceWorker as cB,
  waitForServiceWorkerActivation,
  waitForServiceWorkerActivation as lB,
  DEFAULT_SW_SCOPE as td,
  DEFAULT_SW_SCRIPT as pm
} from '../utils/ServiceWorkerManager.js';
import jC from '../physics/RocketSimWasm.js';
import { EMotorSynth } from '../audio/EMotorSynth.js';
import { SpeedometerHUD } from '../ui/SpeedometerHUD.js';
import { BallTrajectoryPredictor, setBallTrajectoryPredictorThreeContext } from './BallTrajectoryPredictor.js';
import { ParallelTrainingManager, PARALLEL_SLOTS } from '../training/ParallelTrainingManager.js';
import {
  RocketSimPhysicsEngine,
  getTeamAssignment,
  PLAYER_CAR_INDEX,
  BOT_CAR_INDEX
} from '../physics/RocketSimPhysicsEngine.js';
import { PhysicsStateInterpolator } from '../physics/PhysicsStateInterpolator.js';
import {
  SIM_OFFSETS,
  CAR_STATE_OFFSETS,
  CAR_STATE_STRIDE,
  CONTROLS_STRIDE,
  MAX_CARS,
  PHYSICS_TICK_RATE,
  FIXED_TIMESTEP,
  MAX_PHYSICS_SUBSTEPS,
  BALL_CONTROL_MODES,
  ht,
  ye,
  ln,
  kf,
  u0,
  xC,
  da,
  oc,
  to
} from '../physics/RocketSimConstants.js';
import { RenderClockScheduler } from './RenderClockScheduler.js';
import { renderIcon, ICONS } from '../ui/Icons.js';
import { BoostGaugeHUD, boostToTrackX } from '../ui/BoostGaugeHUD.js';
import { PerformanceProfiler, PerformanceOverlayHUD } from '../ui/PerformanceOverlayHUD.js';
import {
  SpatialAudioSource,
  SpatialAudioSource as cg,
  updateAudioListener,
  updateAudioListener as _1,
  calculateDistanceGain,
  calculateDistanceGain as j1
} from '../audio/SpatialAudioSource.js';
import {
  AudioMixer,
  AudioMixer as u1,
  getAudioSettings,
  getAudioSettings as m1,
  getAudioContext,
  getAudioContext as qr,
  getMasterAudioInput,
  getMasterAudioInput as $r,
  setMasterVolume,
  setMasterVolume as up,
  setEngineVolume,
  setBoostVolume,
  VehicleActionAudio,
  VehicleActionAudio as Sw,
  BallImpactAudio,
  BallImpactAudio as kw,
  SupersonicAudio,
  SupersonicAudio as Lw,
  BoostAudio,
  BoostAudio as V1,
  FlipResetAudio,
  FlipResetAudio as jw,
  VehicleEngineAudio,
  VehicleEngineAudio as tm,
  GameAudioManager,
  gameAudio,
  boostCollectAudio
} from '../audio/GameAudioSubsystem.js';
import {
  createLocalStorageStore,
  isPlainObject,
  booleanOrDefault,
  clampNumberOrDefault,
  stringOrDefault,
  filterArraySlice
} from '../utils/StorageHelper.js';
import {
  INPUT_ACTIONS,
  ACTION_GROUPS,
  KEY_DISPLAY_NAMES,
  MOUSE_BUTTON_NAMES,
  XBOX_BUTTON_NAMES,
  PLAYSTATION_BUTTON_NAMES,
  AXIS_NAMES,
  TRIGGER_ANALOG_THRESHOLD,
  ACTIVITY_EPSILON,
  CAMERA_LOOK_DEADZONE,
  VEHICLE_ACTIONS,
  CAMERA_LOOK_ACTIONS,
  STORAGE_KEY_INPUT_BINDINGS,
  TOUCH_CONTROL_LABELS,
  TOUCH_BUTTON_DEFINITIONS,
  TOUCH_SETTINGS_CHANGED_EVENT,
  TOUCH_ACTION_IDS,
  JOYSTICK_DEADZONE,
  EXTRA_ROLL_ACTIONS,
  loadInputBindings,
  saveInputBindings,
  getActionLabel,
  formatBindingDisplayName,
  formatAxisName,
  detectControllerType,
  getConnectedGamepads,
  getSelectedController,
  setSelectedController,
  getEffectiveGamepad,
  computeTouchLayoutBounds,
  normalizeTouchLayoutRect,
  applyTouchLayoutToDom,
  getScreenSafeArea,
  isExtraActionEnabled,
  renderTouchControlsHtml,
  virtualJoystickFactory,
  touchSettingsStore,
  TouchControls,
  GamepadController,
  KeyboardMouseController,
  isEventWithinUI,
  TouchLayoutEditor,
  MultiPlatformInputCoordinator
} from '../input/MultiPlatformInput.js';
import {
  MATCH_MODES,
  MATCH_PHASES,
  formatMatchTime,
  MatchStateMachine
} from './MatchStateMachine.js';
import {
  BOT_POLICIES,
  NEXTO_ACTION_TABLE,
  getBotPolicy,
  encodeCarControls,
  decodeCarControls,
  getNextoKickoffControls,
  buildNextoObservation,
  wrapTensorInputs,
  botSettingsStore,
  NextoAdapter,
  NectoAdapter,
  SeerAdapter,
  RLBotAgent
} from '../ai/RLBotAgent.js';
import {
  MatchDialog,
  MatchDialog as $M
} from '../ui/MatchDialog.js';
import {
  THEMES,
  DEFAULT_THEME,
  themeSettingsStore,
  getTheme,
  setTheme,
  onThemeChange,
  applyThemeToDocument
} from '../ui/ThemeManager.js';
import {
  DEFAULT_CAMERA_SETTINGS,
  cameraSettingsStore,
  SettingsSheet
} from '../ui/SettingsSheet.js';
import {
  BoostBloom,
  FlipResetVisual,
  SupersonicSpeedLinesPass,
  SpeedLinesEffectPass,
  setBoostBloomThreeContext,
  setFlipResetThreeContext,
  setSpeedLinesThreeContext
} from '../effects/index.js';
import {
  CameraController,
  setCameraThreeContext,
  CAMERA_INPUT_INDICES,
  CAMERA_INPUT_SIZE,
  CAMERA_POS_OFFSET,
  CAMERA_DIR_OFFSET,
  CAMERA_UP_OFFSET,
  CAMERA_FOV_OFFSET,
  cw
} from '../camera/CameraController.js';
import {
  HITBOX_PRESETS,
  CAR_VISUAL_IDS,
  CAR_VISUAL_OPTIONS,
  createWhiteboxCarModel,
  garageSettingsStore,
  GarageTurntable,
  GarageDialog,
  setGarageThreeContext,
  setGarageModelLoaders
} from '../ui/GarageDialog.js';
import {
  BallLocatorArrow,
  setBallLocatorThreeContext,
  bS,
  yS,
  CS,
  xS,
  DemolitionEffect,
  setDemolitionThreeContext,
  nS,
  tS,
  BoostPadSystem,
  setBoostPadThreeContext,
  SpeedTrail,
  setSpeedTrailThreeContext,
  pS,
  fS,
  createGeodesicSoccerBallGeometry,
  createClassicSoccerBall,
  loadRealisticBallModel,
  loadBallAsset,
  setBallVisualThreeContext,
  rS,
  iS,
  sS,
  aS,
  wp,
  ArenaWorld,
  setArenaWorldThreeContext,
  setArenaWorldCarLoaders,
  createCarHitboxWireframe,
  createCompetitionTurfMesh,
  updateTurfPadDecals,
  createSuspensionUnit,
  createOffroadWheelMesh,
  createSuspensionKnuckle,
  setupCarReactionJets,
  DEFAULT_TEAM_COLORS,
  DEFAULT_TEAM_COLORS as xn,
  // Vehicle Assembly Subsystem (Phase 7.4)
  loadGameCarAsset,
  loadFlatCarAsset,
  loadRealisticCarAsset,
  createRealisticCarModel,
  createRealisticCarGimbals,
  assembleRealisticCar,
  createGameCarModel,
  createFlatCarModel,
  createGameCarWheel,
  createGameCarWheelHardware,
  createFlatCarWheel,
  updateRealisticCockpitGimbal,
  getCarVisualTheme,
  loadRealisticCarShowcase,
  loadGameCarShowcase,
  loadFlatCarShowcase,
  setVehicleAssemblyThreeContext,
  Uh,
  Y0,
  og,
  z0,
  Z0,
  V0,
  W0,
  Q0,
  Yb,
  Jb,
  Kb,
  np,
  ul,
  ip,
  fl,
  $0,
  r1,
  sg,
  rg,
  Ag,
  h1,
  dp,
  FM,
  DM,
  NM,
  GM,
  OM,
  q0,
  X0,
  J0,
  VA,
  zA,
  Wb,
  Qb,
  t1,
  Ir,
  G0,
  O0,
  H0,
  U0,
  Vb,
  K0,
  Zb,
  $d,
  n1,
  ag,
  Ni,
  VehicleBoostEmitter,
  VehicleBoostEmitter as K1,
  setVehicleBoostEmitterThreeContext
} from '../entities/index.js';
import {
  mergeGeometries as hl,
  mergeVertices as hb,
  toTrianglesDrawMode as Jf,
  cloneSkinnedMesh as db,
  computeInterleavedAttributes as Xf,
  traverseHierarchy as T0,
  setBufferGeometryUtilsThreeContext
} from '../utils/BufferGeometryUtils.js';
import {
  OBJLoader,
  OBJLoader as cb,
  OBJParser,
  OBJParser as lb,
  setOBJLoaderThreeContext
} from '../loaders/OBJLoader.js';
import {
  GLTFLoader,
  GLTFParser,
  setGLTFLoaderThreeContext
} from '../loaders/GLTFLoader.js';

// --- Centralized Three.js Subsystem Context Provider (Phase 8.3) ---
import '../providers/ThreeProvider.js';

// --- Game Runtime Orchestrator (Phase 8.1) ---
import { GameRuntime, setGameRuntimeThreeContext } from './GameRuntime.js';

// --- Lifecycle Bootstrap & Loading Screen (Phase 8.4) ---
import {
  GameBootstrap,
  bootstrapGameEngine,
  renderLoadingScreen,
  updateLoadingState,
  setupInputMethodDetection,
  handleBootstrapError,
  DEFAULT_APP_ICON_URL,
  dB as defaultBootstrap,
  mC as defaultAppIconUrl
} from './GameBootstrap.js';

// =========================================================================
// Backward-Compatibility Aliases & Historical Symbols
// =========================================================================

// Application brand assets
const APP_ICON_URL = DEFAULT_APP_ICON_URL;
const mC = APP_ICON_URL;

// RocketSim Physics Engine, State Interpolator, & Render Scheduler
const yC = RocketSimPhysicsEngine;
const CC = PhysicsStateInterpolator;
const bC = RenderClockScheduler;
const Gd = getTeamAssignment;
const _C = PLAYER_CAR_INDEX;
const no = BOT_CAR_INDEX;
const EC = 3; // WHEEL_STATE_STRIDE (contact, susLength, wheelSpeed)
const ro = ht.CARS + u0 * ln; // BOOST_PAD_STATES_OFFSET

// Input Subsystem & Storage Helpers
const SC = KeyboardMouseController;
const XC = GamepadController;
const ib = TouchControls;
const Tf = isEventWithinUI;
const UC = loadInputBindings;
const qC = saveInputBindings;
const Li = getActionLabel;
const Hi = formatBindingDisplayName;
const TC = (b, a) => {}; // Unused binding helper alias stub
const RC = (b, a) => {};
const Pf = (d) => {};
const PC = (d) => {};
const OA = getConnectedGamepads;
const Hd = getSelectedController;
const $C = setSelectedController;
const Ks = getEffectiveGamepad;
const Rh = detectControllerType;
const Yo = formatAxisName;
const io = INPUT_ACTIONS;
const BC = STORAGE_KEY_INPUT_BINDINGS;
const Rf = CAMERA_LOOK_ACTIONS;
const kC = ACTION_GROUPS;
const IC = KEY_DISPLAY_NAMES;
const FC = MOUSE_BUTTON_NAMES;
const DC = XBOX_BUTTON_NAMES;
const NC = PLAYSTATION_BUTTON_NAMES;
const GC = AXIS_NAMES;
const zC = TRIGGER_ANALOG_THRESHOLD;
const VC = ACTIVITY_EPSILON;
const Zo = CAMERA_LOOK_DEADZONE;
const WC = VEHICLE_ACTIONS;
const La = touchSettingsStore;
const yA = applyTouchLayoutToDom;
const Lh = getScreenSafeArea;
const Fh = computeTouchLayoutBounds;
const Hf = normalizeTouchLayoutRect;
const k0 = isExtraActionEnabled;
const B0 = renderTouchControlsHtml;
const Of = TOUCH_CONTROL_LABELS;
const rb = TOUCH_BUTTON_DEFINITIONS;
const M0 = TOUCH_SETTINGS_CHANGED_EVENT;
const Ud = EXTRA_ROLL_ACTIONS;
const qd = TOUCH_ACTION_IDS;
const tA = JOYSTICK_DEADZONE;
const nb = virtualJoystickFactory;
const rr = createLocalStorageStore;
const Dr = isPlainObject;
const jr = booleanOrDefault;
const _r = clampNumberOrDefault;
const cl = stringOrDefault;
const MC = filterArraySlice;

// 3D Model Loaders
class ho extends GLTFLoader {}
const $b = GLTFParser;

// Defensive verification hook ensuring BallVisual context includes GLTFLoader (ho) without TDZ
setBallVisualThreeContext({
  get GLTFLoader() { return ho; }
});

// Arena & Visual Entities
const ow = ArenaWorld;
const RS = createCarHitboxWireframe;
const GS = createCompetitionTurfMesh;
const OS = updateTurfPadDecals;
const mg = createSuspensionUnit;
const gg = createOffroadWheelMesh;
const vg = createSuspensionKnuckle;
const jg = setupCarReactionJets;

// Vehicle model loaders configuration for ArenaWorld and GarageDialog
setArenaWorldCarLoaders({
  loadGameCarAsset: Uh,
  loadFlatCarAsset: Y0,
  loadRealisticCarAsset: og,
  createRealisticCarModel: sg,
  createRealisticCarGimbals: rg,
  assembleRealisticCar: Ag,
  createGameCarModel: z0,
  createFlatCarModel: Z0,
  createGameCarWheel: V0,
  createGameCarWheelHardware: W0,
  createFlatCarWheel: Q0,
  updateRealisticCockpitGimbal: h1,
  getCarVisualTheme: r1,
  wheelSpecs: { realistic: VA, flat: X0, game: q0 },
  suspensionSpecs: { realisticZ: zA, flatY: J0 },
  hitboxOffsets: { realistic: Wb, flat: Qb, flatJets: t1 },
  teamColors: xn
});

setGarageModelLoaders({
  loadFlatCar: OM,
  loadGameCar: GM,
  getTeamColor: () => xn[Ni]
});

// HUD & UI Aliases
const jM = ICONS;
const Vt = renderIcon;
const _M = TouchLayoutEditor;
const nB = BoostGaugeHUD;
const um = boostToTrackX;
const iB = PerformanceProfiler;
const aB = PerformanceOverlayHUD;
const Ti = 1; // Bloom occluder / boost layer mask
const oB = 'phc_rwFXBqE8hWPtW4YS84PSHCxxXAFZfJUC2rpREZfRt9sg', AB = false;

// =========================================================================
// Game Engine Bootstrap & Lifecycle Coordination
// =========================================================================

let activeGameRuntime = null;

/**
 * Historical bootstrap entry function (dB).
 * Starts the application lifecycle, instantiates GameRuntime, and begins rendering.
 * @returns {Promise<GameRuntime>}
 */
async function dB() {
  const host = typeof document !== 'undefined' ? document.querySelector('#app') : null;
  activeGameRuntime = await bootstrapGameEngine(host, {
    carLoaders: {
      createGameCarModel: z0,
      createTruncatedIcosahedronBall: iS,
      applyVehicleMaterials: fl,
      createCarPaintMaterial: ul
    },
    CameraControllerClass: cw
  });
  return activeGameRuntime;
}

/**
 * Historical render loop step function (wt).
 * Delegates to the active GameRuntime instance to render a single frame.
 * @param {number} timestamp
 */
function wt(timestamp) {
  if (activeGameRuntime) {
    activeGameRuntime.renderFrame(timestamp);
  }
}

const renderGameFrame = wt;

// Auto-bootstrap in browser environment if #app container is present
if (typeof document !== 'undefined' && typeof document.querySelector === 'function') {
  const appContainer = document.querySelector('#app');
  if (appContainer) {
    dB().catch((err) => {
      console.error('[CarSoccerEngine] Auto-bootstrap failed:', err);
    });
  }
}

export {
  dB,
  wt,
  activeGameRuntime,
  GameRuntime,
  GameBootstrap,
  bootstrapGameEngine,
  renderGameFrame
};