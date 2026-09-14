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
} from "../physics/RocketSimPhysicsEngine.js";
import { PhysicsStateInterpolator } from "../physics/PhysicsStateInterpolator.js";
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
} from "../physics/RocketSimConstants.js";
import { RenderClockScheduler } from "./RenderClockScheduler.js";
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
} from "../audio/SpatialAudioSource.js";
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
  boostCollectAudio,
  En,
  lg,
  Xd
} from "../audio/GameAudioSubsystem.js";
import {
  createLocalStorageStore,
  isPlainObject,
  booleanOrDefault,
  clampNumberOrDefault,
  stringOrDefault,
  filterArraySlice
} from "../utils/StorageHelper.js";
import {
  KeyboardMouseController,
  GamepadController,
  TouchControls,
  TouchLayoutEditor,
  isEventWithinUI,
  loadInputBindings,
  saveInputBindings,
  getActionLabel,
  formatBindingDisplayName,
  assignBinding,
  removeBinding,
  resetDeviceBindings,
  resetAxisBindings,
  getConnectedGamepads,
  getSelectedController,
  setSelectedController,
  getEffectiveGamepad,
  INPUT_ACTIONS,
  STORAGE_KEY_INPUT_BINDINGS,
  CAMERA_LOOK_ACTIONS,
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
  touchSettingsStore,
  applyTouchLayoutToDom,
  getScreenSafeArea,
  computeTouchLayoutBounds,
  normalizeTouchLayoutRect,
  isExtraActionEnabled,
  renderTouchControlsHtml,
  TOUCH_CONTROL_LABELS,
  TOUCH_BUTTON_DEFINITIONS,
  TOUCH_SETTINGS_CHANGED_EVENT,
  TOUCH_ACTION_IDS,
  EXTRA_ROLL_ACTIONS,
  JOYSTICK_DEADZONE,
  virtualJoystickFactory,
  detectControllerType,
  formatAxisName
} from "../input/MultiPlatformInput.js";
import {
  MatchStateMachine,
  DEFAULT_MATCH_STATE,
  formatMatchTime,
  MATCH_TICK_RATE,
  DEFAULT_MATCH_DURATION_TICKS,
  KICKOFF_COUNTDOWN_TICKS,
  GOAL_RESET_TICKS,
  VM,
  qM,
  sm,
  Is,
  am,
  om,
  zM
} from "./MatchStateMachine.js";
import {
  BOT_POLICIES,
  getBotPolicy,
  botSettingsStore,
  DEFAULT_CAR_CONTROLS,
  encodeCarControls,
  decodeCarControls,
  NEXTO_ACTION_TABLE,
  buildNextoObservation,
  getNextoKickoffControls,
  wrapTensorInputs,
  NextoAdapter,
  NectoAdapter,
  SeerAdapter,
  createBotAdapter,
  RLBotAgent,
  pl,
  JA,
  wA,
  Eg,
  ed,
  Am,
  WM,
  XM,
  lm,
  JM,
  KM,
  ZM,
  Dc,
  QM,
  dm
} from "../ai/RLBotAgent.js";
import {
  MatchDialog,
  $M
} from "../ui/MatchDialog.js";
import {
  THEMES,
  DEFAULT_THEME,
  themeSettingsStore,
  getTheme,
  setTheme,
  onThemeChange,
  applyThemeToDocument,
  dl,
  Gh,
  I0,
  tr,
  qs,
  uo,
  L0
} from "../ui/ThemeManager.js";
import {
  SettingsSheet,
  statusSettingsStore,
  graphicsSettingsStore,
  cameraSettingsStore,
  trainingSettingsStore,
  DEFAULT_CAMERA_SETTINGS,
  DEFAULT_TRAINING_SETTINGS,
  getDefaultRenderScale,
  BM,
  _g,
  Yh,
  uA,
  Ma,
  SA,
  EM,
  Ps,
  bM,
  Zh,
  SM,
  wM,
  nm,
  yM,
  xM,
  Kd,
  rm,
  CM,
  Na,
  MM,
  Pr,
  im
} from "../ui/SettingsSheet.js";
import {
  BoostBloom,
  createBloomRenderTarget,
  setBoostBloomThreeContext,
  BLOOM_MIP_LEVELS,
  BLOOM_DOWNSCALE_FACTOR,
  BLOOM_THRESHOLD,
  BLOOM_SMOOTH_WIDTH,
  BLOOM_OUTPUT_STRENGTH,
  BLOOM_WEIGHTS,
  fw,
  Bc,
  Jn,
  Up,
  hw,
  dw,
  uw,
  qp,
  FlipResetVisual,
  createStarShapeGeometry,
  createSparksMaterial,
  createSoftGlowMaterial,
  enableLayerOne,
  setFlipResetThreeContext,
  RESET_INDICATOR_HEIGHT,
  RESET_PULSE_DURATION,
  RESET_SPARKS_DELAY,
  RESET_SPARKS_DURATION,
  RESET_SPARKS_COUNT,
  RESET_ARCADE_COLOR_HEX,
  xw,
  _w,
  Ew,
  yw,
  Jp,
  mw,
  Vp,
  gw,
  Wp,
  ys,
  SpeedLinesEffectPass,
  SupersonicSpeedLinesPass,
  setSpeedLinesThreeContext,
  Yw,
  Zw,
  Pass,
  Pass as Js,
  FullScreenGeometry,
  FullScreenGeometry as cC,
  FullScreenQuad,
  FullScreenQuad as ll,
  ShaderPass,
  ShaderPass as h0,
  MaskPass,
  MaskPass as Mf,
  ClearMaskPass,
  ClearMaskPass as dC,
  CopyShader,
  CopyShader as _A,
  OutputShader,
  OutputShader as Ko,
  OutputPass,
  OutputPass as fC,
  RenderPass,
  RenderPass as pC,
  EffectComposer,
  EffectComposer as uC,
  RoomEnvironment,
  RoomEnvironment as c0,
  createRoomEnvironmentMaterial as gs,
  setPostprocessingThreeContext
} from "../effects/index.js";
import {
  CameraController,
  setCameraThreeContext,
  CAMERA_INPUT_SIZE,
  CAMERA_POS_OFFSET,
  CAMERA_DIR_OFFSET,
  CAMERA_UP_OFFSET,
  CAMERA_FOV_OFFSET,
  cw,
  Aw,
  Sc,
  wc,
  Mc,
  lw
} from "../camera/CameraController.js";
import {
  HITBOX_PRESETS,
  createWhiteboxCarModel,
  CAR_VISUAL_IDS,
  CAR_VISUAL_OPTIONS,
  garageSettingsStore,
  PAD_NAVIGATION_BUTTONS,
  GarageTurntable,
  GarageDialog,
  setGarageThreeContext,
  setGarageModelLoaders,
  HM,
  UM,
  kM,
  Fc,
  Qh,
  xs
} from "../ui/GarageDialog.js";
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
} from "../entities/index.js";
import {
  mergeGeometries,
  mergeGeometries as hl,
  mergeVertices,
  mergeVertices as hb,
  toTrianglesDrawMode,
  toTrianglesDrawMode as Jf,
  cloneSkinnedMesh,
  cloneSkinnedMesh as db,
  computeInterleavedAttributes,
  computeInterleavedAttributes as Xf,
  traverseHierarchy,
  traverseHierarchy as T0,
  setBufferGeometryUtilsThreeContext
} from "../utils/BufferGeometryUtils.js";
import {
  OBJLoader,
  OBJLoader as cb,
  OBJParser,
  OBJParser as lb,
  setOBJLoaderThreeContext
} from "../loaders/OBJLoader.js";
import {
  GLTFLoader,
  GLTFParser,
  setGLTFLoaderThreeContext
} from "../loaders/GLTFLoader.js";


// --- Centralized Three.js Subsystem Context Provider (Phase 8.3) ---
import "../providers/ThreeProvider.js";

// --- Decoupled Three.js r185 Vendor Library (Phase 8.2 Deobfuscation -> src/vendor/three.js) ---
import {
  Ad, Ae, Ai, Ao, BA, Bd, Cm, Cn, Cr, Ct, DA, Ee, F, Fd, Gi, Gr,
  Gt, Ha, Hm, Hs, Ht, Ia, Im, It, Ke, Kg, Ld, Lm, Lt, NA, Ne, Nm,
  Oi, Pd, Pj, Pm, Pt, QA, Qa, Qt, Rd, Rj, Rt, Td, Tn, Ua, Ur, Ut,
  Va, Wa, Wj, Xi, Xt, Ya, Yj, Ym, Yt, Yv, Za, Zm, Zt, ad, ai, al,
  ba, bd, bh, bt, cd, ci, cn, dt, e0, e6, el, eo, er, fA, fn, fr,
  gm, gr, il, jn, jt, ka, kd, kn, kt, l0, ld, li, lo, lt, mt, nl,
  od, oo, pn, pr, qa, qj, qn, qt, r6, rl, sd, sl, ui, un, ws, xd,
  xr, yd, zi, zm, zs, zt, zv, $n
} from "../vendor/three.js";

// --- Postprocessing Pipeline & RoomEnvironment (Phase 7.8 Part 2 Deobfuscation -> src/effects/PostprocessingPipeline.js) ---
// Extracted classes and shaders:
// - Pass (Js), FullScreenGeometry (cC), FullScreenQuad (ll), ShaderPass (h0)
// - MaskPass (Mf), ClearMaskPass (dC), CopyShader (_A), OutputShader (Ko)
// - OutputPass (fC), RenderPass (pC), EffectComposer (uC)
// - RoomEnvironment (c0), createRoomEnvironmentMaterial (gs)
// Application brand assets
const APP_ICON_URL = "/assets/app-icon-512-DPODCpjJ.png";
const mC = APP_ICON_URL;
// RocketSim Physics Engine, State Interpolator, & Render Scheduler (Deobfuscated & Modularized)
// Upstream reference: https://github.com/zealanL/rocketsim
const yC = RocketSimPhysicsEngine;
const CC = PhysicsStateInterpolator;
const bC = RenderClockScheduler;
const Gd = getTeamAssignment;
const _C = PLAYER_CAR_INDEX;
const no = BOT_CAR_INDEX;
const EC = 3; // WHEEL_STATE_STRIDE (contact, susLength, wheelSpeed)
const ro = ht.CARS + u0 * ln; // BOOST_PAD_STATES_OFFSET

// =========================================================================
// Input Subsystem & Storage Helpers (Phase 4 Deobfuscated & Modularized)
// See: src/input/MultiPlatformInput.js and src/utils/StorageHelper.js
// =========================================================================
const SC = KeyboardMouseController;
const XC = GamepadController;
const ib = TouchControls;
const Tf = isEventWithinUI;
const UC = loadInputBindings;
const qC = saveInputBindings;
const Li = getActionLabel;
const Hi = formatBindingDisplayName;
const TC = assignBinding;
const RC = removeBinding;
const Pf = resetDeviceBindings;
const PC = resetAxisBindings;
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

// Phase 6 Part 2: Wire inlined Three.js classes to decoupled Garage system
setPostprocessingThreeContext({
  Scene: el,
  BoxGeometry: Tn,
  MeshStandardMaterial: lt,
  BackSide: pn,
  PointLight: Fd,
  Mesh: Ee,
  InstancedMesh: Lm,
  Object3D: It,
  MeshBasicMaterial: Zm,
  BufferGeometry: Ct,
  Float32BufferAttribute: Ke,
  OrthographicCamera: lo,
  ShaderMaterial: Lt,
  RawShaderMaterial: Ym,
  UniformsUtils: sl,
  Vector2: Ae,
  WebGLRenderTarget: qn,
  HalfFloatType: er,
  NoBlending: gr,
  Timer: r6,
  Color: Ne,
  ColorManagement: bt,
  SRGBTransfer: kt,
  LinearToneMapping: sd,
  ReinhardToneMapping: ad,
  CineonToneMapping: od,
  ACESFilmicToneMapping: oo,
  AgXToneMapping: ld,
  NeutralToneMapping: cd,
  CustomToneMapping: Ad
});
setGarageThreeContext({
  Group: dt,
  BoxGeometry: Tn,
  MeshStandardMaterial: lt,
  Mesh: Ee,
  EdgesGeometry: Nm,
  LineBasicMaterial: Gi,
  LineSegments: Wa,
  WebGLRenderer: l0,
  Scene: el,
  PMREMGenerator: NA,
  RoomEnvironment: c0,
  HemisphereLight: e0,
  DirectionalLight: eo,
  PerspectiveCamera: fn,
  Box3: xr,
  Vector3: F
});
setCameraThreeContext({
  PerspectiveCamera: fn,
  Vector3: F
});
setBoostBloomThreeContext({
  WebGLRenderTarget: qn,
  ShaderMaterial: Lt,
  Vector2: Ae,
  Color: Ne,
  FullScreenQuad: ll,
  HalfFloatType: er,
  LinearFilter: qt
});
setFlipResetThreeContext({
  Group: dt,
  MeshBasicMaterial: cn,
  Mesh: Ee,
  RingGeometry: Ya,
  BufferGeometry: Ct,
  BufferAttribute: zt,
  Points: Ai,
  PlaneGeometry: ui,
  SphereGeometry: Ur,
  Shape: il,
  ShapeGeometry: Rd,
  ShaderMaterial: Lt,
  Color: Ne,
  Vector4: Pt,
  MathUtils: Gt,
  AdditiveBlending: li,
  DoubleSide: Ut
});
setSpeedLinesThreeContext({
  Pass: Js,
  FullScreenQuad: ll,
  ShaderMaterial: Lt,
  Scene: el,
  OrthographicCamera: Ld,
  BufferGeometry: al,
  BufferAttribute: Ke,
  InstancedBufferAttribute: un,
  Mesh: Ee,
  Vector3: F,
  Quaternion: jn,
  Matrix4: mt,
  DoubleSide: Ut,
  CopyShader: _A,
  MathUtils: Gt
});
setBallLocatorThreeContext({
  Group: dt,
  CanvasTexture: bd,
  Sprite: Pm,
  SpriteMaterial: yd,
  MeshStandardMaterial: lt,
  Shape: il,
  ExtrudeGeometry: kd,
  Mesh: Ee,
  Vector3: F,
  MathUtils: Gt,
  SRGBColorSpace: Ht,
  LinearFilter: qt
});
setDemolitionThreeContext({
  Group: dt,
  BufferGeometry: al,
  BufferAttribute: Ke,
  InstancedBufferAttribute: un,
  PlaneGeometry: ui,
  ShaderMaterial: Lt,
  Mesh: Ee,
  Vector3: F,
  MathUtils: Gt,
  DynamicDrawUsage: qa
});
setBoostPadThreeContext({
  Group: dt,
  Mesh: Ee,
  CylinderGeometry: Xt,
  MeshBasicMaterial: cn,
  MeshStandardMaterial: lt,
  multiThemeMaterial: vn,
  cloneMaterial: Nr,
  markMatrixDirty: Ji
});
setSpeedTrailThreeContext({
  Group: dt,
  BufferGeometry: Ct,
  BufferAttribute: zt,
  ShaderMaterial: Lt,
  Mesh: Ee,
  Sprite: Pm,
  SpriteMaterial: yd,
  CanvasTexture: bd,
  Vector3: F,
  Color: Ne,
  MathUtils: Gt,
  DynamicDrawUsage: qa,
  AdditiveBlending: li,
  DoubleSide: Ut,
  NormalBlending: Gr,
  SRGBColorSpace: Ht
});

// Phase 7.6 & 7.7: Wire inlined Three.js classes to decoupled ThemeMaterialPipeline & ShaderPrewarmer
setThemeMaterialThreeContext({
  Mesh: Ee,
  MeshStandardMaterial: lt,
  MeshPhysicalMaterial: Cn,
  MeshToonMaterial: Pj,
  Material: Qt,
  DataTexture: nl,
  RGBAFormat: QA,
  NearestFilter: Yt
});
setShaderPrewarmerThreeContext({
  Light: ai,
  Mesh: Ee,
  Points: Ai,
  Line: rl
});
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

// --- Phase 7.8 Deobfuscation & Modularization: BufferGeometryUtils & OBJLoader ---
// Extracted to src/utils/BufferGeometryUtils.js (mergeGeometries / hl, mergeVertices / hb, toTrianglesDrawMode / Jf, cloneSkinnedMesh / db, Xf, T0)
// Extracted to src/loaders/OBJLoader.js (OBJLoader / cb, OBJParser / lb)
setBufferGeometryUtilsThreeContext({
  BufferGeometry: Ct,
  BufferAttribute: zt,
  TrianglesDrawMode: Kg,
  TriangleStripDrawMode: Cm,
  TriangleFanDrawMode: bh
});

setOBJLoaderThreeContext({
  Loader: Xi,
  FileLoader: Pd,
  DefaultLoadingManager: Wj,
  Group: dt,
  Mesh: Ee,
  LineSegments: Wa,
  Points: Ai,
  BufferGeometry: Ct,
  Float32BufferAttribute: Ke,
  LineBasicMaterial: Gi,
  PointsMaterial: ws,
  MeshPhongMaterial: Rj,
  Vector3: F,
  Color: Ne,
  SRGBColorSpace: Ht
});


setBallTrajectoryPredictorThreeContext({
  Group: dt,
  BufferGeometry: Ct,
  BufferAttribute: zt,
  ShaderMaterial: Lt,
  Mesh: Ee,
  Color: Ne,
  Vector3: F,
  DynamicDrawUsage: 35048,
  NormalBlending: 1,
  DoubleSide: Ut
});

// --- Phase 7.8 Part 3 Deobfuscation: GLTFLoader (ho) & GLTFParser ($b) decoupled to src/loaders/GLTFLoader.js ---
setGLTFLoaderThreeContext({
  Object3D: It,
  Loader: Xi,
  LoaderUtils: Ia,
  FileLoader: Pd,
  TextureLoader: Ao,
  ImageBitmapLoader: e6,
  PropertyBinding: Rt,
  DefaultLoadingManager: Wj,
  Group: dt,
  Mesh: Ee,
  SkinnedMesh: zv,
  InstancedMesh: Lm,
  Points: Ai,
  Line: rl,
  LineSegments: Wa,
  LineLoop: Yv,
  Bone: Im,
  Skeleton: xd,
  BufferGeometry: Ct,
  BufferAttribute: zt,
  InstancedBufferAttribute: un,
  InterleavedBuffer: Va,
  Material: Qt,
  MeshStandardMaterial: lt,
  MeshPhysicalMaterial: Cn,
  MeshBasicMaterial: cn,
  PointsMaterial: ws,
  LineBasicMaterial: Gi,
  PointLight: Fd,
  DirectionalLight: Yj,
  SpotLight: eo,
  PerspectiveCamera: fn,
  OrthographicCamera: lo,
  Texture: Zt,
  Vector2: Ae,
  Vector3: F,
  Matrix4: mt,
  Quaternion: jn,
  Color: Ne,
  Sphere: Cr,
  Box3: xr,
  MathUtils: Gt,
  AnimationClip: qj,
  Interpolant: zs,
  NumberKeyframeTrack: Za,
  QuaternionKeyframeTrack: Qa,
  VectorKeyframeTrack: DA,
  ColorManagement: bt,
  toTrianglesDrawMode: Jf,
  cloneSkinnedMesh: db,
  RepeatWrapping: ci,
  ClampToEdgeWrapping: fr,
  MirroredRepeatWrapping: BA,
  NearestFilter: Yt,
  NearestMipmapNearestFilter: gm,
  NearestMipmapLinearFilter: ba,
  LinearFilter: qt,
  LinearMipmapNearestFilter: pr,
  LinearMipmapLinearFilter: fA,
  InterpolateDiscrete: Ha,
  InterpolateLinear: Ua,
  DoubleSide: Ut,
  SRGBColorSpace: Ht,
  LinearSRGBColorSpace: kn,
  TriangleStripDrawMode: Cm,
  TriangleFanDrawMode: bh
});

// Backward compatibility aliases for GLTFLoader (ho) and GLTFParser ($b)
class ho extends GLTFLoader {}
const $b = GLTFParser;


// --- Visual Themes & Cel-Shading Pipeline (Phase 7.6 Deobfuscation -> src/effects/ThemeMaterialPipeline.js) ---
// Extracted functions and aliases:
// - vn (createMultiThemeMaterial), Vi (getThemeMaterial), F0 (isMultiThemeMaterial), D0 (resolveThemeMaterial)
// - Ji (registerThemeSubtree / markMatrixDirty), $s (arcade light ramp), Nr (createCelShadedToonMaterial / cloneMaterial), N0 (applyArcadeCelShading / setShadowFlags)
// --- Phase 7.4 Deobfuscation & Modularization: Vehicle Assembly Subsystem ---
// Extracted to src/entities/VehicleAssembly.js:
// Octane (Uh, z0, V0, W0, Yb, Jb, Kb, np, ul, ip, fl, /tmp/code_8f436d6f.sh), Dominus (Y0, Z0, Q0, r1),
// Realistic Buggy (og, sg, rg, Ag, h1, dp), dimensional specs (Ir, G0, O0, H0, U0, Vb, q0, Wb, Qb, X0, J0, t1, VA, zA, Wd, ag).

// --- Deobfuscated Phase 3: Audio Subsystem & Spatial Audio (Imported from src/audio/) ---
let __audioLastPhase = "playing";
let __audioLastOvertime = false;
let __audioLastRemainingSec = 300;
let __audioLastSupersonic = false;
let __audioLastBoostPressed = false;
let __audioLastGoalScored = false;
let __audioLastCountdown = -1;
const __audioCollidingPairs = new Set();
const __audioCarHitSerials = [];

// --- Phase 7.5 Deobfuscation: VehicleBoostEmitter (K1, O1, Sp, jp) extracted to src/entities/VehicleBoostEmitter.js ---
const Ti = 1; // Bloom occluder / boost layer mask

setVehicleBoostEmitterThreeContext({
  Group: dt,
  Mesh: Ee,
  Points: Ai,
  PointLight: Fd,
  BufferGeometry: Ct,
  BufferAttribute: Ke,
  InstancedBufferGeometry: al,
  InstancedBufferAttribute: un,
  ShaderMaterial: Lt,
  Vector3: F,
  Color: Ne,
  MathUtils: Gt,
  DynamicDrawUsage: qa,
  NormalBlending: Gr,
  AdditiveBlending: li,
  DoubleSide: Ut,
  RepeatWrapping: ci,
  SRGBColorSpace: Ht,
  TextureLoader: Ao
});

// --- Phase 7 Part 3 Deobfuscation: DemolitionEffect (nS) extracted to src/entities/DemolitionEffect.js ---
// --- Phase 7 Part 3 Deobfuscation: BallVisual (rS, iS, sS, aS) extracted to src/entities/BallVisual.js ---
// Wire inlined Three.js classes and loaders (including GLTFLoader ho defined above) to decoupled BallVisual
setBallVisualThreeContext({
  Group: dt,
  Mesh: Ee,
  BufferGeometry: Ct,
  BufferAttribute: Ke,
  IcosahedronGeometry: Td,
  MeshStandardMaterial: lt,
  Vector2: Ae,
  Vector3: F,
  Color: Ne,
  get GLTFLoader() { return ho; },
  TextureLoader: Ao,
  SRGBColorSpace: Ht
});
// --- Phase 7 Part 3 Deobfuscation: SpeedTrail (pS, fS) extracted to src/entities/SpeedTrail.js ---
// --- Phase 7 Part 3 (Step 3) Deobfuscation: ArenaWorld (ow), Stadium Arena, & Suspension extracted to src/entities/ArenaWorld.js ---
setVehicleAssemblyThreeContext({
  Object3D: It,
  Group: dt,
  Mesh: Ee,
  BoxGeometry: Tn,
  EdgesGeometry: Nm,
  LineSegments: Wa,
  LineBasicMaterial: Gi,
  CylinderGeometry: Xt,
  SphereGeometry: Ur,
  PlaneGeometry: ui,
  BufferGeometry: Ct,
  BufferAttribute: Ke,
  TubeGeometry: Hs,
  CatmullRomCurve3: Bd,
  CurvePath: zm,
  LineCurve3: Hm,
  LatheGeometry: Oi,
  TorusGeometry: zi,
  RingGeometry: Ya,
  CanvasTexture: bd,
  MeshStandardMaterial: lt,
  MeshPhysicalMaterial: Cn,
  MeshBasicMaterial: cn,
  ShaderMaterial: Lt,
  Vector2: Ae,
  Vector3: F,
  Color: Ne,
  Quaternion: jn,
  Scene: el,
  DoubleSide: Ut,
  BackSide: $n,
  FrontSide: pn,
  get GLTFLoader() { return ho; },
  TextureLoader: Ao,
  OBJLoader: cb,
  multiThemeMaterial: vn,
  getThemeMaterial: Vi,
  cloneMaterial: Nr,
  markMatrixDirty: Ji,
  setShadowFlags: N0,
  Matrix4: mt,
  Matrix3: jt,
  MathUtils: Gt
});

setArenaWorldThreeContext({
  Object3D: It,
  Group: dt,
  Mesh: Ee,
  BoxGeometry: Tn,
  EdgesGeometry: Nm,
  LineSegments: Wa,
  LineBasicMaterial: Gi,
  CylinderGeometry: Xt,
  SphereGeometry: Ur,
  PlaneGeometry: ui,
  BufferGeometry: Ct,
  BufferAttribute: Ke,
  TubeGeometry: Hs,
  CatmullRomCurve3: Bd,
  CurvePath: zm,
  LineCurve3: Hm,
  LatheGeometry: Oi,
  TorusGeometry: zi,
  RingGeometry: Ya,
  CanvasTexture: bd,
  MeshStandardMaterial: lt,
  MeshBasicMaterial: cn,
  ShaderMaterial: Lt,
  Vector2: Ae,
  Vector3: F,
  Color: Ne,
  Quaternion: jn,
  Scene: el,
  DirectionalLight: eo,
  HemisphereLight: e0,
  DoubleSide: Ut,
  BackSide: $n,
  FrontSide: pn,
  AdditiveBlending: li,
  RepeatWrapping: ci,
  LinearFilter: qt,
  LinearMipmapLinearFilter: pr,
  SRGBColorSpace: Ht,
  mergeVertices: hb,
  mergeGeometries: hl,
  get GLTFLoader() { return ho; },
  TextureLoader: Ao,
  OBJLoader: cb,
  VehicleBoostEmitter: K1,
  multiThemeMaterial: vn,
  getThemeMaterial: Vi,
  cloneMaterial: Nr,
  markMatrixDirty: Ji,
  setShadowFlags: N0,
  Matrix4: mt
});

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

const ow = ArenaWorld;
const RS = createCarHitboxWireframe;
const GS = createCompetitionTurfMesh;
const OS = updateTurfPadDecals;
const mg = createSuspensionUnit;
const gg = createOffroadWheelMesh;
const vg = createSuspensionKnuckle;
const jg = setupCarReactionJets;

// CameraController (cw) modularized into src/camera/CameraController.js
// Visual Effects Subsystem (BoostBloom/fw, FlipResetVisual/xw, SupersonicSpeedLinesPass/Zw, SpeedLinesEffectPass/Yw)
// modularized into src/effects/index.js
// Centralized SVG UI Icons (Deobfuscated & Modularized)
const jM = ICONS;
const Vt = renderIcon;

// Touch Layout Settings Editor (Phase 4 Deobfuscated & Modularized)
const _M = TouchLayoutEditor;

// --- Phase 6 Deobfuscation & Modularization: SettingsSheet & ThemeManager ---
// Extracted to:
// - src/ui/ThemeManager.js (Theme settings store, reactive event listeners, DOM sync, aliases dl, Gh, I0, tr, qs, uo, L0)
// - src/ui/SettingsSheet.js (Settings dialog, camera/controls/audio/graphics/training tuning, pad nav, aliases BM, _g, Yh, uA, Ma, SA, EM, Ps, bM, Zh, SM, wM, nm, yM, xM, Kd, rm, CM, Na, MM, Pr, im)
let activeSettingsOverlay = null;
let activeGraphicsSettings = null;
// --- Vehicle Showcase Loaders & Suspension Helpers (Extracted to src/entities/VehicleAssembly.js) ---
// Functions FM, DM, NM, GM, OM, and Ni are now imported from src/entities/VehicleAssembly.js.

// --- Phase 6 Part 2 Deobfuscation & Modularization: Garage Turntable, Hitbox Presets, and GarageDialog ---
// Vehicle showcase turntable (HM), Garage modal dialog (UM), Hitbox presets, and display settings store (Qh)
// have been extracted to src/ui/GarageDialog.js.
setGarageModelLoaders({
  loadFlatCar: OM,
  loadGameCar: GM,
  getTeamColor: () => xn[Ni]
});

// --- Phase 5 Deobfuscation & Modularization: MatchStateMachine, MatchDialog, and RLBotAgent ---
// The following subsystems have been extracted into clean, modular ES components:
// - src/game/MatchStateMachine.js (Match rules, 120Hz clock, overtime, kickoff countdown, aliases VM, qM, sm, Is, am, om, zM)
// - src/ai/RLBotAgent.js (ONNX worker inference, Nexto/Necto/Seer adapters, kickoff logic, aliases QM, JM, KM, ZM, Dc, pl, JA, wA, Eg, ed, Am, WM, XM, lm, dm)
// - src/ui/MatchDialog.js (Match modal dialog, bot selector, scoreboard HUD, alias $M)

// Boost Gauge HUD & Performance Overlay HUD (Phase 2 Deobfuscation & Modularization)
const nB = BoostGaugeHUD;
const um = boostToTrackX;
const iB = PerformanceProfiler;
const aB = PerformanceOverlayHUD;

// Analytics disabled in development
const oB = "phc_rwFXBqE8hWPtW4YS84PSHCxxXAFZfJUC2rpREZfRt9sg",AB = false;
// --- PWA Service Worker & Scene Shader Prewarmer (Phase 7.7 Deobfuscation) ---
// Extracted to:
// - src/utils/ServiceWorkerManager.js (registerGameServiceWorker / cB, waitForServiceWorkerActivation / lB, td, pm)
// - src/game/ShaderPrewarmer.js (prewarmSceneShaders / hB)

const an = document.querySelector("#app");
const ml = i => {
  an.dataset.inputMethod !== i && (an.dataset.inputMethod = i);
};
ml(navigator.maxTouchPoints > 0 || window.matchMedia("(any-pointer: coarse)").matches ? "touch" : "mouse");
window.addEventListener("keydown", i => {
  i.repeat || ml("keyboard");
}, !0);
window.addEventListener("pointerdown", i => {
  ml(i.pointerType === "touch" || i.pointerType === "pen" ? "touch" : "mouse");
}, { capture: !0, passive: !0 });

an.innerHTML = `
  <div id="loading" data-state="loading">
    <div class="load__emblem"><img src="${mC}" width="512" height="512" alt="Orange car chasing a soccer ball" fetchpriority="high" /></div>
    <h1 class="load__title">CAR <span>SOCCER</span></h1>
    <p class="load__label" role="status">Loading game</p>
    <div class="load__rule"></div>
    <p class="load__note"></p>
  </div>
`;
const nd = document.querySelector("#loading"),
      rd = document.querySelector("#loading .load__note"),
      Gc = document.querySelector("#loading .load__label");

// --- Game Runtime Orchestrator (Phase 8.1 Deobfuscation) ---
// Extracted to src/game/GameRuntime.js
import { GameRuntime, setGameRuntimeThreeContext } from './GameRuntime.js';

setGameRuntimeThreeContext({
  WebGLRenderer: l0,
  PMREMGenerator: NA,
  Vector3: F,
  ShaderMaterial: Lt,
  MeshBasicMaterial: cn,
  Mesh: Ee,
  PCFSoftShadowMap: ka,
  ACESFilmicToneMapping: oo,
  DoubleSide: Ut,
  RoomEnvironment: c0
});

let activeGameRuntime = null;

async function dB() {
  activeGameRuntime = new GameRuntime(an, {
    carLoaders: {
      createGameCarModel: z0,
      createTruncatedIcosahedronBall: iS,
      applyVehicleMaterials: fl,
      createCarPaintMaterial: ul
    },
    CameraControllerClass: cw
  });
  await activeGameRuntime.init();
  activeGameRuntime.start();
  return activeGameRuntime;
}

function wt(timestamp) {
  if (activeGameRuntime) {
    activeGameRuntime.renderFrame(timestamp);
  }
}

dB().catch(i => {
  if (nd) nd.dataset.state = 'error';
  const e = nd ? nd.querySelector('.load__label') : null;
  if (i && i.isAssetError) {
    if (e) e.textContent = '缺少游戏资产 / Assets Required';
    if (rd) rd.innerHTML = i.message;
  } else {
    if (e) e.textContent = 'Failed to start';
    if (rd) rd.textContent = i instanceof Error ? i.message : String(i);
  }
  console.error(i);
});

export { dB, wt, activeGameRuntime, GameRuntime };
