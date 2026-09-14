import { CameraController } from '../camera/CameraController.js';
/**
 * GameRuntime.js
 * High-performance 120Hz Car Soccer Engine Session & Orchestration Runtime (deobfuscates dB & wt).
 *
 * Upstream RocketSim reference: https://github.com/zealanL/rocketsim
 * Decouples game bootstrap (dB) and 120Hz render clock tick (wt) from monolithic inline script
 * into a modular, clean ES class with semantic property names, robust error handling,
 * and seamless fallback support for headless/unit testing.
 */

import { auditRequiredAssets, formatMissingAssetsHtml } from './AssetDiagnostics.js';
import { registerGameServiceWorker } from '../utils/ServiceWorkerManager.js';
import { prewarmSceneShaders } from './ShaderPrewarmer.js';
import { RocketSimPhysicsEngine, getTeamAssignment } from '../physics/RocketSimPhysicsEngine.js';
import { PhysicsStateInterpolator } from '../physics/PhysicsStateInterpolator.js';
import { RenderClockScheduler } from './RenderClockScheduler.js';
import {
  SIM_OFFSETS,
  CAR_STATE_OFFSETS,
  CAR_STATE_STRIDE
} from '../physics/RocketSimConstants.js';

export const PLAYER_CAR_INDEX = 0;
export const BOT_CAR_INDEX = 1;
import {
  VehicleActionAudio,
  BallImpactAudio,
  SupersonicAudio,
  VehicleEngineAudio,
  gameAudio,
  boostCollectAudio
} from '../audio/GameAudioSubsystem.js';
import { updateAudioListener } from '../audio/SpatialAudioSource.js';
import {
  KeyboardMouseController,
  GamepadController,
  TouchControls,
  loadInputBindings,
  getEffectiveGamepad,
  formatBindingDisplayName
} from '../input/MultiPlatformInput.js';
import { getTheme, setTheme, THEMES } from '../ui/ThemeManager.js';
import { SettingsSheet, DEFAULT_TRAINING_SETTINGS } from '../ui/SettingsSheet.js';
import { GarageDialog, garageSettingsStore } from '../ui/GarageDialog.js';
import { MatchStateMachine } from './MatchStateMachine.js';
import { RLBotAgent, botSettingsStore } from '../ai/RLBotAgent.js';
import { MatchDialog } from '../ui/MatchDialog.js';
import { BoostGaugeHUD } from '../ui/BoostGaugeHUD.js';
import { PerformanceProfiler, PerformanceOverlayHUD } from '../ui/PerformanceOverlayHUD.js';
import { SpeedometerHUD } from '../ui/SpeedometerHUD.js';
import { BallTrajectoryPredictor } from './BallTrajectoryPredictor.js';
import { ParallelTrainingManager } from '../training/ParallelTrainingManager.js';
import {
  BoostBloom,
  FlipResetVisual,
  SupersonicSpeedLinesPass,
  RenderPass,
  ShaderPass,
  OutputPass,
  EffectComposer,
  RoomEnvironment
} from '../effects/index.js';
import { ArenaWorld } from '../entities/ArenaWorld.js';
import {
  createGameCarModel,
  applyVehicleMaterials,
  createCarPaintMaterial
} from '../entities/VehicleAssembly.js';
import { createClassicSoccerBall } from '../entities/BallVisual.js';

let gameRuntimeThreeContext = null;

export function setGameRuntimeThreeContext(context) {
  gameRuntimeThreeContext = context;
}

function resolveContext() {
  if (gameRuntimeThreeContext) return gameRuntimeThreeContext;
  if (typeof THREE !== 'undefined') return THREE;
  return {
    WebGLRenderer: class FallbackWebGLRenderer {
      constructor() {
        this.domElement = typeof document !== 'undefined' ? document.createElement('canvas') : {};
        this.shadowMap = { enabled: false, type: 0, autoUpdate: false, needsUpdate: false };
      }
      setSize() {}
      setPixelRatio() {}
      getContext() { return { getParameter: () => 0 }; }
      render() {}
      dispose() {}
    },
    PMREMGenerator: class FallbackPMREMGenerator {
      constructor() {}
      fromScene() { return { texture: {} }; }
      dispose() {}
    },
    Vector3: class FallbackVector3 {
      constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
      set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
      subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
      normalize() { const l = Math.hypot(this.x, this.y, this.z) || 1; this.x /= l; this.y /= l; this.z /= l; return this; }
      dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
      length() { return Math.hypot(this.x, this.y, this.z); }
      setFromMatrixColumn() { return this; }
    },
    ShaderMaterial: class FallbackShaderMaterial { constructor(opts = {}) { Object.assign(this, opts); } },
    MeshBasicMaterial: class FallbackMeshBasicMaterial { constructor(opts = {}) { Object.assign(this, opts); } },
    Mesh: class FallbackMesh {},
    PCFSoftShadowMap: 2,
    ACESFilmicToneMapping: 4,
    DoubleSide: 2,
    RoomEnvironment: class FallbackRoomEnvironment {}
  };
}

const BLOOM_OCCLUDER_LAYER = 1;

export class GameRuntime {
  /**
   * @param {HTMLElement} container DOM element to mount the game UI & canvas
   * @param {object} options Customization options (carLoaders, custom assets, etc.)
   */
  constructor(container, options = {}) {
    this.container = container || (typeof document !== 'undefined' ? document.querySelector('#app') : null);
    this.options = options;

    // Core subsystems
    this.physics = null;
    this.interpolator = null;
    this.match = null;
    this.bot = null;
    this.arena = null;
    this.camera = null;
    this.renderer = null;
    this.composer = null;
    this.boostBloom = null;
    this.speedLinesPass = null;
    this.flipResetVisual = null;
    this.clockScheduler = null;

    // Controllers & HUDs
    this.keyboard = null;
    this.gamepad = null;
    this.touch = null;
    this.settingsSheet = null;
    this.matchDialog = null;
    this.garageDialog = null;
    this.profiler = null;
    this.overlayHUD = null;
    this.boostGaugeHUD = null;
    this.speedometerHUD = null;
    this.trajectoryPredictor = null;
    this.parallelManager = null;

    // Audio subsystems
    this.actionAudio = null;
    this.impactAudio = null;
    this.supersonicAudio = null;
    this.engineAudios = [];
    this.lastBallHitSerials = [0, 0];
    this.audioCarHitSerials = [];
    this.audioCollidingPairs = new Set();
    this.audioLastGoalScored = false;
    this.audioLastRemainingSec = 300;
    this.audioLastOvertime = false;
    this.audioLastCountdown = -1;
    this.audioLastPhase = 'playing';
    this.audioLastSupersonic = false;
    this.audioLastBoostPressed = false;

    // Simulation states
    this.playerCarIndex = PLAYER_CAR_INDEX;
    this.neutralControls = {
      throttle: 0,
      steer: 0,
      pitch: 0,
      yaw: 0,
      roll: 0,
      jump: false,
      boost: false,
      handbrake: false
    };
    this.botControls = { ...this.neutralControls };
    this.botTickSkip = 0;
    this.isBotDeciding = false;
    this.botDecisionEpoch = 0;
    this.botKickoffStep = 0;
    this.isBotPaused = false;
    this.playerControls = { ...this.neutralControls };
    this.playerThrottle = 0;

    // Scratch math vectors
    const ctx = resolveContext();
    const V3 = ctx.Vector3 || Array;
    this.scratchGroundNormal = new V3(0, 0, 0);
    this.scratchVelocity = new V3(0, 0, 0);
    this.scratchBallCamVec = new V3(0, 0, 0);
    this.scratchCameraRight = new V3(0, 0, 0);

    // Camera dynamic inputs
    this.cameraDynamics = {
      onGround: false,
      groundNormal: this.scratchGroundNormal,
      velocity: this.scratchVelocity,
      supersonic: false,
      lookX: 0,
      lookY: 0
    };

    // UI overlays & interaction tracking
    this.openOverlays = new Set();
    this.isCursorBrowsing = false;
    this.pendingClickToPlay = false;
    this.gamepadSettingsJustClosed = false;
    this.lastGamepadId = null;
    this.lastGamepadButton8 = false;
    this.trainingOptions = { ...DEFAULT_TRAINING_SETTINGS };

    // Bloom occluder swap caches
    this.bloomOccluderMeshes = [];
    this.bloomSavedMaterials = [];
    this.bloomInvisibleObjects = [];
    this.bloomHiddenObjects = [];
    this.lastBloomTreeVersion = -1;
    this.lastBloomActive = true;
    this.bloomDarkMaterial = null;

    // Timing
    this.lastTimestamp = performance.now();
    this.activeGraphicsSettings = null;
    this.running = false;
  }

  /**
   * Complete game bootstrapping sequence (deobfuscates dB).
   */
  async init() {
    const ctx = resolveContext();

    // 1. Asset audit
    const { missingCritical, missingNonCritical } = await auditRequiredAssets();
    if (missingCritical && missingCritical.length > 0) {
      const err = new Error(formatMissingAssetsHtml(missingCritical));
      err.isAssetError = true;
      throw err;
    }
    if (missingNonCritical && missingNonCritical.length > 0) {
      console.warn(
        `[GameRuntime Asset Notice] Some non-critical assets are missing:`,
        missingNonCritical.map(m => m.path)
      );
    }

    // 2. Service worker registration
    await registerGameServiceWorker();

    const loadingLabel = this.container ? this.container.querySelector('#loading .load__label') : null;
    const loadingNote = this.container ? this.container.querySelector('#loading .load__note') : null;
    if (loadingLabel) loadingLabel.textContent = 'Preparing the arena';
    if (loadingNote) loadingNote.textContent = 'Getting every car, sound and game mode ready.';

    // 3. Load selected car & initialize RocketSim C++ WebAssembly
    const selectedPreset = garageSettingsStore.load().carVisual;
    const carVisualIndex = selectedPreset === 'game-car' ? 1 : 0;
    const teamAssignment = getTeamAssignment(selectedPreset === 'flat-car');

    this.physics = new RocketSimPhysicsEngine();
    await this.physics.init();
    this.playerCarIndex = this.physics.addCar(
      carVisualIndex,
      selectedPreset === 'flat-car' ? 'flat' : 'default'
    );
    this.physics.resetKickoff();

    this.interpolator = new PhysicsStateInterpolator(this.physics);
    this.match = new MatchStateMachine();
    this.bot = new RLBotAgent(botSettingsStore.load().botId);

    // 4. Audio subsystems
    this.actionAudio = new VehicleActionAudio();
    this.impactAudio = new BallImpactAudio();
    this.supersonicAudio = new SupersonicAudio();
    this.engineAudios = [new VehicleEngineAudio(), new VehicleEngineAudio(true)];
    this.resetAudio();

    // 5. Speed lines & input setup
    this.speedLinesPass = new SupersonicSpeedLinesPass();
    const bindings = loadInputBindings();
    this.keyboard = new KeyboardMouseController(bindings);
    this.gamepad = new GamepadController(bindings);
    this.touch = new TouchControls(this.container);

    const onResetHandler = () => this.resetKickoff();
    this.keyboard.onReset = onResetHandler;
    this.gamepad.onReset = onResetHandler;
    this.touch.onReset = onResetHandler;

    // 6. Arena World & Entities
    this.arena = new ArenaWorld(this.physics.ballRadius, selectedPreset);
    await Promise.all([
      this.arena.loadArena(),
      this.arena.loadBall(),
      this.arena.loadCarAndPadAssets()
    ]);
    this.arena.addCar(0);
    this.arena.addPads(this.physics.getPads());

    // Ball control callbacks
    const onBallControlHandler = actionId => {
      if (this.match.state.mode !== 'match' && (!this.parallelManager || !this.parallelManager.isActive)) {
        if (this.physics.controlBall(this.playerCarIndex, actionId)) {
          this.interpolator.syncBall();
          this.arena.resetBallTrail();
          if (this.trajectoryPredictor) {
            this.trajectoryPredictor.notifyBallControl(this.physics.state);
          }
        }
      }
    };
    this.keyboard.onBallControl = onBallControlHandler;
    this.gamepad.onBallControl = onBallControlHandler;
    this.touch.onBallControl = onBallControlHandler;

    this.flipResetVisual = new FlipResetVisual(this.arena.cars[this.playerCarIndex]);

    const aspect = typeof window !== 'undefined' ? window.innerWidth / window.innerHeight : 16 / 9;
    const CameraControllerClass = this.options.CameraControllerClass || CameraController;
    this.camera = new CameraControllerClass(aspect, this.physics);

    // 7. UI Dialogs & Controls
    this.cursorHintButton = typeof document !== 'undefined' ? document.createElement('button') : null;
    if (this.cursorHintButton) {
      this.cursorHintButton.type = 'button';
      this.cursorHintButton.className = 'cursor-hint';
    }

    this.settingsSheet = new SettingsSheet(
      this.container,
      this.camera.settings,
      this.trainingOptions,
      bindings,
      isOpen => this.handleOverlayChange('settings', isOpen),
      opts => {
        this.physics.setUnlimitedBoost(this.match.state.mode === 'freeplay' && opts.boostOption === 'unlimited');
        this.arena.setCarHitboxesVisible(opts.showCarHitbox);
      },
      b => {
        this.keyboard.setBindings(b);
        this.gamepad.setBindings(b);
        this.updateCursorHint();
      },
      capturing => {
        this.keyboard.capturing = capturing;
        this.gamepad.capturing = capturing;
      }
    );

    this.activeGraphicsSettings = this.settingsSheet.graphics;
    this.settingsSheet.attachGraphics(graphics => {
      this.activeGraphicsSettings = graphics;
      this.arena.setStadiumVisible(graphics.showStadium);
      if (this.clockScheduler) {
        this.clockScheduler.setFpsLimit(graphics.limitFps ? graphics.maxFps : null);
      }
      this.updateViewport(graphics);
    });

    this.speedometerHUD = new SpeedometerHUD(this.container);
    this.trajectoryPredictor = new BallTrajectoryPredictor(this.container, this.physics);
    if (this.arena.scene && this.trajectoryPredictor.object) {
      this.arena.scene.add(this.trajectoryPredictor.object);
    }

    // Parallel Training Manager
    const carMeshCreator = this.options.carLoaders?.createGameCarModel || createGameCarModel;
    const ballMeshCreator = this.options.carLoaders?.createTruncatedIcosahedronBall || createClassicSoccerBall;
    const recolorFn = (mesh, color) => {
      if (!mesh) return;
      const applyMat = this.options.carLoaders?.applyVehicleMaterials || applyVehicleMaterials;
      const createPaint = this.options.carLoaders?.createCarPaintMaterial || createCarPaintMaterial;
      for (const child of mesh.children) {
        if (
          child.name === 'flip-reset-indicator' ||
          child.name === 'realistic-reset-pulse' ||
          child.name === 'car-hitbox'
        ) {
          continue;
        }
        applyMat(child, createPaint(color));
      }
    };

    this.parallelManager = new ParallelTrainingManager({
      container: this.container,
      arenaWorld: this.arena,
      cameraManager: this.camera,
      inputManager: this.keyboard,
      padInputManager: this.gamepad,
      physicsClass: RocketSimPhysicsEngine,
      primaryPhysicsSim: this.physics,
      createCarMesh: (asset, color) => carMeshCreator(asset, color),
      createBallMesh: color => ballMeshCreator(color),
      recolorCar: recolorFn,
      resetEngineAudio: () => this.resetAudio(),
      onSwitchCallback: (targetArena, targetPrev, targetCurr) => {
        this.interpolator.sim = targetArena;
        this.interpolator.prevState.set(targetPrev);
        this.interpolator.currState.set(targetCurr);
        this.interpolator.sync();
        this.arena.applyPhys(this.arena.ball, this.interpolator.prevState, this.interpolator.currState, SIM_OFFSETS.BALL, 0);
        const isParallelActive = this.parallelManager && this.parallelManager.isActive;
        const activeCar = isParallelActive ? this.parallelManager.getActiveArenaCarIndex() : this.playerCarIndex;
        const activeCarMesh = isParallelActive && this.parallelManager.getActiveCarMesh
          ? this.parallelManager.getActiveCarMesh()
          : this.arena.cars[this.playerCarIndex];
        if (activeCarMesh) {
          this.camera.update(activeCarMesh, this.arena.ball, 0, this.cameraDynamics);
        }
        if (this.flipResetVisual) {
          this.flipResetVisual.previousResetSerial =
            targetCurr[SIM_OFFSETS.CARS + activeCar * CAR_STATE_STRIDE + CAR_STATE_OFFSETS.FLIP_RESET_SERIAL];
          this.flipResetVisual.stopVisual();
        }
        if (this.trajectoryPredictor) {
          this.trajectoryPredictor.notifyKickoffReset(targetArena ? targetArena.state : targetCurr);
        }
      },
      ht: SIM_OFFSETS,
      ye: CAR_STATE_OFFSETS,
      ln: CAR_STATE_STRIDE
    });

    this.setupHudButtons();

    this.garageDialog = new GarageDialog(this.container, isOpen => this.handleOverlayChange('car', isOpen));
    this.matchDialog = new MatchDialog(this.container, {
      playerTeam: teamAssignment.playerTeam,
      botId: this.bot.id,
      onSelectBot: botId => {
        if (this.match.state.mode !== 'match') {
          this.resetBotState();
          this.bot.select(botId);
          botSettingsStore.save({ botId });
          this.matchDialog.update({ ...this.match.state, botId });
        }
      },
      onOpenChange: isOpen => this.handleOverlayChange('match', isOpen),
      onResume: () => {
        this.isCursorBrowsing = false;
      },
      onStart: async controller => {
        await Promise.all([this.bot.load(), this.arena.ensureOpponent()]);
        if (!controller.aborted) {
          this.physics.configureCars(selectedPreset === 'flat-car' ? 'flat' : 'default', true);
          this.physics.setUnlimitedBoost(false);
          this.isBotPaused = false;
          this.match.start();
          this.resetKickoff();
          this.matchDialog.update(this.match.state);
        }
      },
      onLeave: () => {
        this.resetBotState();
        this.match.leave();
        this.isBotPaused = false;
        this.physics.configureCars(selectedPreset === 'flat-car' ? 'flat' : 'default', false, carVisualIndex);
        this.physics.setUnlimitedBoost(this.trainingOptions.boostOption === 'unlimited');
        this.resetKickoff();
        this.matchDialog.update(this.match.state);
      }
    });

    // 8. Ball cam indicator & Profiler HUD
    this.boostGaugeHUD = new BoostGaugeHUD(this.container);
    if (this.container && typeof document !== 'undefined') {
      const ballCamElem = document.createElement('p');
      ballCamElem.className = 'ball-cam-indicator';
      ballCamElem.textContent = 'Ball cam';
      ballCamElem.hidden = !this.camera.ballCam;
      this.container.appendChild(ballCamElem);
      this.ballCamIndicator = ballCamElem;
    }

    this.profiler = new PerformanceProfiler();
    const onToggleBallCam = () => {
      this.camera.ballCam = !this.camera.ballCam;
    };
    this.gamepad.onBallCamToggle = onToggleBallCam;
    this.keyboard.onBallCamToggle = onToggleBallCam;
    this.touch.onBallCamToggle = onToggleBallCam;

    // 9. Three.js WebGLRenderer & Postprocessing Composer
    const WebGLRendererClass = ctx.WebGLRenderer;
    this.renderer = new WebGLRendererClass({ antialias: true });
    const winWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const winHeight = typeof window !== 'undefined' ? window.innerHeight : 720;
    const devicePixelRatio = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio, 2) : 1;

    this.renderer.setSize(winWidth, winHeight);
    this.renderer.setPixelRatio(devicePixelRatio);
    if (this.renderer.shadowMap) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = ctx.PCFSoftShadowMap || 2;
      this.renderer.shadowMap.autoUpdate = false;
    }
    this.renderer.toneMapping = ctx.ACESFilmicToneMapping || 4;
    this.renderer.toneMappingExposure = 1.15;

    // Environment map
    const PMREMGeneratorClass = ctx.PMREMGenerator;
    const pmrem = new PMREMGeneratorClass(this.renderer);
    const RoomEnvClass = ctx.RoomEnvironment || RoomEnvironment;
    this.arena.scene.environment = pmrem.fromScene(new RoomEnvClass(), 0.04).texture;
    this.arena.scene.environmentIntensity = 0.5;
    pmrem.dispose();

    if (this.container && this.renderer.domElement && this.renderer.domElement.parentNode !== this.container) {
      this.container.appendChild(this.renderer.domElement);
    }

    // Performance Overlay HUD
    const statusCallbacks = this.settingsSheet.attachStatus(
      opts => this.overlayHUD && this.overlayHUD.apply(opts),
      () => this.overlayHUD && this.overlayHUD.showDetails()
    );
    this.overlayHUD = new PerformanceOverlayHUD(
      this.container,
      this.profiler,
      this.renderer,
      statusCallbacks,
      isOpen => this.handleOverlayChange('status', isOpen)
    );

    // BoostBloom & Composer setup
    this.boostBloom = new BoostBloom(this.renderer, winWidth, winHeight, this.renderer.getPixelRatio());
    this.composer = new EffectComposer(this.renderer);
    this.updateViewport();

    this.composer.addPass(new RenderPass(this.arena.scene, this.camera.camera));

    const ShaderMaterialClass = ctx.ShaderMaterial;
    this.composer.addPass(
      new ShaderPass(
        new ShaderMaterialClass({
          uniforms: {
            baseTexture: { value: null },
            bloomTexture: { value: this.boostBloom.texture }
          },
          vertexShader: `
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            uniform sampler2D baseTexture;
            uniform sampler2D bloomTexture;
            varying vec2 vUv;
            void main() {
              vec4 base = texture2D(baseTexture, vUv);
              vec3 glow = texture2D(bloomTexture, vUv).rgb;
              gl_FragColor = vec4(base.rgb + glow, base.a);
            }
          `
        }),
        'baseTexture'
      )
    );
    this.composer.addPass(new OutputPass());
    this.composer.addPass(this.speedLinesPass.pass);

    // Occluder material for bloom pass
    const MeshBasicMaterialClass = ctx.MeshBasicMaterial;
    this.bloomDarkMaterial = new MeshBasicMaterialClass({
      color: 0,
      colorWrite: false,
      depthWrite: true,
      depthTest: true,
      side: ctx.DoubleSide || 2
    });

    this.setupWindowEvents();

    // 10. Preload assets & fonts
    if (loadingLabel) loadingLabel.textContent = 'Preparing cars, sounds and opponents';
    await Promise.all([
      this.actionAudio.preload(),
      this.impactAudio.preload(),
      this.supersonicAudio.preload(),
      ...this.engineAudios.map(a => a.preload()),
      this.flipResetVisual.preloadAudio(),
      this.bot.preloadAll().catch(err => console.warn('[Bot] Policy preload deferred or failed:', err)),
      this.arena.prepareAssets(),
      this.garageDialog.preload(),
      ...(typeof document !== 'undefined' && document.fonts
        ? ['400 16px Archivo', '500 16px Archivo', '700 16px Archivo', '400 20px "Lilita One"'].map(f =>
            document.fonts.load(f)
          )
        : [])
    ]);

    // 11. Prewarm visual shaders
    if (loadingLabel) loadingLabel.textContent = 'Warming up visual effects';
    if (loadingNote) loadingNote.textContent = 'Almost ready to play.';
    this.arena.update(
      this.interpolator.prevState,
      this.interpolator.currState,
      0,
      0,
      0,
      this.neutralControls,
      this.neutralControls,
      false
    );
    this.camera.update(this.arena.cars[this.playerCarIndex], this.arena.ball, 0, this.cameraDynamics);

    const originalTheme = getTheme();
    try {
      for (const theme of THEMES) {
        setTheme(theme, { persist: false });
        if (typeof document !== 'undefined' && document.documentElement) {
          document.documentElement.dataset.theme = originalTheme;
        }
        await prewarmSceneShaders(this.renderer, this.arena.scene, this.camera.camera, {
          disappearingLightRoots: this.arena.cars,
          renderBloom: async () => {
            this.applyBloomOccluders();
            try {
              if (typeof this.renderer.compileAsync === 'function') {
                await this.renderer.compileAsync(this.arena.scene, this.camera.camera);
              }
              this.boostBloom.render(this.arena.scene, this.camera.camera);
            } finally {
              this.restoreBloomMaterials();
            }
          },
          renderFinal: () => {
            if (this.renderer.shadowMap) this.renderer.shadowMap.needsUpdate = true;
            this.composer.render(0);
          },
          passes: [this.speedLinesPass.pass]
        });
      }
    } finally {
      setTheme(originalTheme, { persist: false });
    }

    this.boostBloom.clear();
    if (this.renderer.shadowMap) this.renderer.shadowMap.needsUpdate = true;
    this.composer.render(0);
    this.lastTimestamp = performance.now();
    this.interpolator.sync(this.lastTimestamp);

    // Remove loading screen
    if (typeof document !== 'undefined') {
      const loading = document.querySelector('#loading');
      if (loading) loading.remove();
    }
  }

  /**
   * Start 120Hz render loop and clock scheduler.
   */
  start() {
    if (this.running) return;
    this.running = true;
    const glContext = this.renderer ? this.renderer.getContext() : null;
    this.clockScheduler = new RenderClockScheduler(
      glContext,
      timestamp => this.renderFrame(timestamp),
      timestamp => this.profiler && this.profiler.displayFrame(timestamp)
    );
    if (this.activeGraphicsSettings) {
      this.clockScheduler.setFpsLimit(
        this.activeGraphicsSettings.limitFps ? this.activeGraphicsSettings.maxFps : null
      );
    }
    this.updateInteractionState();
    this.clockScheduler.start();
  }

  /**
   * Stop render loop.
   */
  stop() {
    if (!this.running) return;
    this.running = false;
    if (this.clockScheduler) {
      this.clockScheduler.stop();
    }
  }

  /**
   * Main 120Hz tick and render pipeline (deobfuscates wt).
   * @param {number} timestamp Current performance.now() high-res timestamp
   */
  renderFrame(timestamp) {
    if (this.profiler) this.profiler.frameStart();

    // Check low-power stop-rendering toggle
    if (this.settingsSheet && this.settingsSheet.isOpen && this.settingsSheet.stopRendering) {
      this.lastTimestamp = timestamp;
      this.interpolator.sync(timestamp);
      if (this.profiler) this.profiler.frameEnd(0, 0, 0);
      return;
    }

    const dt = Math.min((timestamp - this.lastTimestamp) / 1000, 0.1);
    this.lastTimestamp = timestamp;

    const isHidden = typeof document !== 'undefined' && (!document.hasFocus() || document.hidden);
    this.match.state.paused =
      this.match.state.mode === 'match' &&
      (this.isCursorBrowsing || this.openOverlays.size > 0 || isHidden || this.isBotPaused);

    if (this.match.state.paused || (this.match.state.mode === 'match' && this.match.state.phase === 'ended')) {
      this.pollInputs();
      this.interpolator.sync(timestamp);
    } else {
      this.interpolator.update(
        timestamp,
        () => this.pollInputs(),
        this.match.state.mode === 'match' ? () => this.stepBot() : undefined
      );
    }

    // Step parallel training background worlds
    if (this.parallelManager && this.parallelManager.isActive) {
      this.parallelManager.stepBackgroundArenas(
        this.interpolator.lastTicks,
        this.interpolator.alpha,
        this.interpolator.prevState,
        this.interpolator.currState
      );
    }

    const activeSim =
      this.parallelManager && this.parallelManager.isActive
        ? this.parallelManager.getActiveArena()
        : this.physics;
    const goalScored = activeSim.pollGoal() !== 0;

    // Free play goal handling
    if (this.match.state.mode === 'freeplay' && goalScored && !this.trainingOptions.disableGoalReset) {
      if (this.parallelManager && this.parallelManager.isActive) {
        this.parallelManager.handleActiveWorldGoal();
      } else {
        this.physics.resetKickoff();
      }
      this.resetAudio();
      this.interpolator.sync(timestamp);
      this.arena.resetBallTrail();
      if (this.trajectoryPredictor) {
        this.trajectoryPredictor.notifyKickoffReset(activeSim ? activeSim.state : null);
      }
    }

    this.matchDialog.update(this.match.state);

    if (this.container && this.container.dataset.gameMode !== this.match.state.mode) {
      this.container.dataset.gameMode = this.match.state.mode;
      this.touch.setMatchActive(this.match.state.mode === 'match');
      if (this.parallelManager && this.parallelManager.hudToggleButton) {
        this.parallelManager.hudToggleButton.style.display =
          this.match.state.mode === 'match' ? 'none' : '';
      }
    }

    if (this.profiler) this.profiler.mark();

    // Visual updates
    const isMatchActive =
      this.match.state.mode === 'freeplay' ||
      (!this.match.state.paused && this.match.state.phase === 'playing');

    this.arena.update(
      this.interpolator.prevState,
      this.interpolator.currState,
      this.interpolator.alpha,
      dt,
      this.playerThrottle,
      this.playerControls,
      this.botControls,
      isMatchActive
    );

    const isParallelActive = this.parallelManager && this.parallelManager.isActive;
    const activeCar = isParallelActive
      ? this.parallelManager.getActiveArenaCarIndex()
      : this.playerCarIndex;
    const activeCarMesh =
      isParallelActive && this.parallelManager.getActiveCarMesh
        ? this.parallelManager.getActiveCarMesh()
        : this.arena.cars[this.playerCarIndex];

    const carOffset = SIM_OFFSETS.CARS + activeCar * CAR_STATE_STRIDE;
    const curr = this.interpolator.currState;

    this.flipResetVisual.update(
      dt,
      curr[carOffset + CAR_STATE_OFFSETS.FLIP_RESET_SERIAL],
      curr[carOffset + CAR_STATE_OFFSETS.DEMOED] !== 1
    );

    this.actionAudio.update({
      jumpSerial: curr[carOffset + CAR_STATE_OFFSETS.JUMP_SERIAL],
      dodgeSerial: curr[carOffset + CAR_STATE_OFFSETS.DODGE_SERIAL],
      doubleJumpSerial: curr[carOffset + CAR_STATE_OFFSETS.DOUBLE_JUMP_SERIAL],
      wheelImpactSerial: curr[carOffset + CAR_STATE_OFFSETS.WHEEL_IMPACT_SERIAL],
      wheelImpactSpeed: curr[carOffset + CAR_STATE_OFFSETS.WHEEL_IMPACT_SPEED],
      audible: curr[carOffset + CAR_STATE_OFFSETS.DEMOED] !== 1
    });

    this.scratchBallCamVec.subVectors(this.arena.ball.position, this.camera.camera.position).normalize();
    this.scratchCameraRight.setFromMatrixColumn(this.camera.camera.matrixWorld, 0).normalize();

    const playerHitSerial = curr[carOffset + CAR_STATE_OFFSETS.BALL_HIT_SERIAL];
    const botHitSerial =
      this.match.state.mode === 'match'
        ? curr[carOffset + CAR_STATE_STRIDE + CAR_STATE_OFFSETS.BALL_HIT_SERIAL]
        : 0;
    const maxHitSpeed = Math.max(
      playerHitSerial !== this.lastBallHitSerials[0] ? curr[carOffset + CAR_STATE_OFFSETS.BALL_HIT_SPEED] : 0,
      botHitSerial !== this.lastBallHitSerials[1] ? curr[carOffset + CAR_STATE_STRIDE + CAR_STATE_OFFSETS.BALL_HIT_SPEED] : 0
    );
    const cameraPan = Math.min(Math.max(this.scratchBallCamVec.dot(this.scratchCameraRight), -1), 1);

    this.impactAudio.update({
      carSerial: playerHitSerial + botHitSerial,
      carSpeed: maxHitSpeed,
      carPan: botHitSerial !== this.lastBallHitSerials[1] ? cameraPan : 0,
      worldSerial: curr[carOffset + CAR_STATE_OFFSETS.BALL_WORLD_IMPACT_SERIAL],
      worldSpeed: curr[carOffset + CAR_STATE_OFFSETS.BALL_WORLD_IMPACT_SPEED],
      worldSurface: curr[carOffset + CAR_STATE_OFFSETS.BALL_WORLD_SURFACE] === 0 ? 0 : 1,
      worldPan: cameraPan,
      audible: true
    });
    this.lastBallHitSerials[0] = playerHitSerial;
    this.lastBallHitSerials[1] = botHitSerial;

    if (this.profiler) this.profiler.mark();

    // Camera dynamics & follow
    this.cameraDynamics.onGround = curr[carOffset + CAR_STATE_OFFSETS.ON_GROUND] === 1;
    this.cameraDynamics.supersonic = curr[carOffset + CAR_STATE_OFFSETS.SUPERSONIC] === 1;
    this.scratchGroundNormal.set(
      curr[carOffset + CAR_STATE_OFFSETS.GROUND_NORMAL],
      curr[carOffset + CAR_STATE_OFFSETS.GROUND_NORMAL + 2],
      curr[carOffset + CAR_STATE_OFFSETS.GROUND_NORMAL + 1]
    );
    this.scratchVelocity.set(
      curr[carOffset + CAR_STATE_OFFSETS.VEL],
      curr[carOffset + CAR_STATE_OFFSETS.VEL + 2],
      curr[carOffset + CAR_STATE_OFFSETS.VEL + 1]
    );

    this.camera.update(activeCarMesh, this.arena.ball, dt, this.cameraDynamics);
    this.arena.updateBallLocatorArrow(this.camera.ballCam, activeCar, this.arena.ball, activeCarMesh);

    if (this.profiler) this.profiler.mark();

    if (this.ballCamIndicator && this.ballCamIndicator.hidden === this.camera.ballCam) {
      this.ballCamIndicator.hidden = !this.camera.ballCam;
    }
    updateAudioListener(this.camera.camera);

    // Multi-car vehicle engine audios
    const numCarsInArena = curr[SIM_OFFSETS.NUM_CARS] || 0;
    while (this.engineAudios.length < Math.max(2, numCarsInArena)) {
      this.engineAudios.push(new VehicleEngineAudio(true));
    }
    for (let i = 0; i < this.engineAudios.length; i++) {
      const isThisActiveCar = i === activeCar;
      this.engineAudios[i].setSpatial(!isThisActiveCar);
      const isCarValid = i < numCarsInArena;
      if (!isCarValid) {
        this.engineAudios[i].silence();
        continue;
      }

      const cOff = SIM_OFFSETS.CARS + i * CAR_STATE_STRIDE;
      let carPos = null;
      const cControls = isThisActiveCar ? this.playerControls : this.botControls;

      if (isParallelActive) {
        const activeWorldId = this.parallelManager.players
          ? this.parallelManager.players[this.parallelManager.activePlayerIndex]?.currentWorldId ?? 0
          : 0;
        let pObj = null;
        if (this.parallelManager.players) {
          for (const p of this.parallelManager.players) {
            if (p && p.currentWorldId === activeWorldId && p.arenaCarIndex === i) {
              pObj = p;
              break;
            }
          }
        }
        if (pObj && this.parallelManager.carMeshes && this.parallelManager.carMeshes[pObj.id]) {
          carPos = this.parallelManager.carMeshes[pObj.id].position;
        }
      } else {
        carPos =
          isThisActiveCar && activeCarMesh
            ? activeCarMesh.position
            : this.arena.cars[i]?.position;
      }

      const forwardSpeed =
        curr[cOff + CAR_STATE_OFFSETS.VEL] * curr[cOff + CAR_STATE_OFFSETS.FWD] +
        curr[cOff + CAR_STATE_OFFSETS.VEL + 1] * curr[cOff + CAR_STATE_OFFSETS.FWD + 1] +
        curr[cOff + CAR_STATE_OFFSETS.VEL + 2] * curr[cOff + CAR_STATE_OFFSETS.FWD + 2];

      this.engineAudios[i].update(
        {
          forwardSpeed,
          throttle: cControls.throttle,
          handbrake: cControls.handbrake,
          boosting: isCarValid && curr[cOff + CAR_STATE_OFFSETS.IS_BOOSTING] === 1,
          onGround: isCarValid && curr[cOff + CAR_STATE_OFFSETS.ON_GROUND] === 1,
          alive: isCarValid && curr[cOff + CAR_STATE_OFFSETS.DEMOED] !== 1,
          audible: this.keyboard.enabled && isMatchActive,
          controllerActive: this.gamepad.active() || this.touch.active(),
          position: carPos
        },
        dt
      );
    }

    this.arena.prepareBallSpeedTrail(this.camera.camera);

    // Ball trajectory predictor
    if (this.trajectoryPredictor) {
      const allHitSerials = [];
      const activeCarObjects = [];
      for (let ci = 0; ci < numCarsInArena; ci++) {
        allHitSerials.push(curr[SIM_OFFSETS.CARS + ci * CAR_STATE_STRIDE + CAR_STATE_OFFSETS.BALL_HIT_SERIAL]);
        if (ci === activeCar && activeCarMesh) {
          activeCarObjects.push(activeCarMesh);
        } else if (this.arena.cars[ci]) {
          activeCarObjects.push(this.arena.cars[ci]);
        }
      }
      this.trajectoryPredictor.update({
        active: this.match.state.mode === 'freeplay' || this.match.state.mode === 'match',
        ballPosition: this.arena.ball.position,
        ballVelocity: this.arena.ballVelocity,
        ballState: activeSim ? activeSim.state : this.physics.state,
        ballHitSerial: playerHitSerial,
        carHitSerials: allHitSerials,
        cars: activeCarObjects,
        numCars: numCarsInArena,
        kickoffReset: goalScored
      });
      this.trajectoryPredictor.prepare(this.camera.camera);
    }

    // Speed lines & supersonic effects
    const isSupersonic =
      curr[carOffset + CAR_STATE_OFFSETS.SUPERSONIC] === 1 &&
      curr[carOffset + CAR_STATE_OFFSETS.DEMOED] !== 1;
    this.scratchVelocity.set(
      curr[carOffset + CAR_STATE_OFFSETS.VEL],
      curr[carOffset + CAR_STATE_OFFSETS.VEL + 2],
      curr[carOffset + CAR_STATE_OFFSETS.VEL + 1]
    );

    this.speedLinesPass.update(dt, isSupersonic && this.keyboard.enabled && isMatchActive, this.scratchVelocity, this.camera.camera);
    this.supersonicAudio.update(isSupersonic, this.gamepad.active(), this.keyboard.enabled && isMatchActive);

    if (this.speedometerHUD) {
      this.speedometerHUD.update(this.scratchVelocity.length());
    }

    const curBoost = curr[carOffset + CAR_STATE_OFFSETS.BOOST];
    if (typeof window !== 'undefined') {
      if (typeof window.__lastBoostAmount === 'undefined') window.__lastBoostAmount = curBoost;
      if (
        curBoost > window.__lastBoostAmount + 1 &&
        !(this.match.state.mode === 'freeplay' && this.trainingOptions.boostOption === 'unlimited')
      ) {
        if (typeof boostCollectAudio !== 'undefined' && boostCollectAudio) {
          boostCollectAudio.play();
        }
      }
      window.__lastBoostAmount = curBoost;
    }

    this.boostGaugeHUD.update(
      curBoost,
      curr[carOffset + CAR_STATE_OFFSETS.IS_BOOSTING] === 1,
      this.match.state.mode === 'freeplay' && this.trainingOptions.boostOption === 'unlimited'
    );

    this.triggerGameAudioEvents(goalScored, curBoost, isSupersonic, curr, carOffset);

    if (this.profiler) this.profiler.mark();

    // Render passes & Bloom
    const isBloomActive = this.arena.boostBloomActive || this.flipResetVisual.bloomActive;
    if (isBloomActive) {
      this.camera.camera.layers.set(0);
      this.applyBloomOccluders();
      try {
        this.boostBloom.render(this.arena.scene, this.camera.camera);
      } finally {
        this.restoreBloomMaterials();
      }
    } else if (this.lastBloomActive) {
      this.boostBloom.clear();
    }
    this.lastBloomActive = isBloomActive;

    if (this.profiler) this.profiler.mark();

    if (this.renderer.shadowMap) this.renderer.shadowMap.needsUpdate = true;
    this.composer.render(dt);

    if (this.profiler) {
      this.profiler.mark();
      this.profiler.frameEnd(
        this.interpolator.lastTicks,
        this.interpolator.lastDropped,
        this.interpolator.lastStalled
      );
    }
  }

  /**
   * Evaluates and dispatches the 9 distinct game audio triggers.
   */
  triggerGameAudioEvents(goalScored, curBoost, isSupersonic, curr, carOffset) {
    const audio = this.options.gameAudio || globalThis.gameAudio || (typeof gameAudio !== 'undefined' ? gameAudio : null);
    if (!audio) return;

    // 1. Goal scored poof SFX
    const isGoalNow = goalScored || (this.match.state.mode === 'match' && this.match.state.phase === 'goal');
    if (isGoalNow && !this.audioLastGoalScored) {
      audio.play('sfx_goal_poof', 1.0);
    }
    this.audioLastGoalScored = isGoalNow;

    // 2. Match 30 seconds left SFX
    if (this.match.state.mode === 'match' && !this.match.state.overtime && this.match.state.phase === 'playing') {
      if (
        this.audioLastRemainingSec > 30 &&
        this.match.state.remainingSeconds <= 30 &&
        this.match.state.remainingSeconds > 0
      ) {
        audio.play('match_30_seconds_left', 1.0, 10000);
      }
    }
    this.audioLastRemainingSec = this.match.state.remainingSeconds;

    // 3. Match entering overtime SFX
    if (this.match.state.mode === 'match' && this.match.state.overtime && !this.audioLastOvertime) {
      audio.play('match_entering_overtime', 1.0, 10000);
    }
    this.audioLastOvertime = this.match.state.overtime;

    // 4. Kickoff countdown 321 SFX
    if (this.match.state.mode === 'match' && this.match.state.phase === 'kickoff') {
      const currentCount = Math.ceil(this.match.state.countdown);
      if (currentCount >= 1 && currentCount <= 3 && currentCount !== this.audioLastCountdown) {
        this.audioLastCountdown = currentCount;
        audio.play('match_countdown_321', 1.0);
      }
    } else {
      this.audioLastCountdown = -1;
    }

    // 5. Match start / kickoff Go! SFX
    if (this.match.state.mode === 'match' && this.audioLastPhase === 'kickoff' && this.match.state.phase === 'playing') {
      audio.play('match_start_go', 1.0);
    }
    this.audioLastPhase = this.match.state.phase;

    // 6. Supersonic enter SFX
    if (isSupersonic && !this.audioLastSupersonic) {
      audio.play('sfx_state_supersonic', 0.9);
    }
    this.audioLastSupersonic = isSupersonic;

    // 7. Ball hit SFX (spatialized)
    const numCars = curr[SIM_OFFSETS.NUM_CARS] || 1;
    let anyCarHitBall = false;
    for (let ci = 0; ci < numCars; ci++) {
      const hitSerial = curr[SIM_OFFSETS.CARS + ci * CAR_STATE_STRIDE + CAR_STATE_OFFSETS.BALL_HIT_SERIAL];
      const lastHit = this.audioCarHitSerials[ci];
      if (lastHit !== undefined && hitSerial !== lastHit && hitSerial > 0) {
        anyCarHitBall = true;
      }
      this.audioCarHitSerials[ci] = hitSerial;
    }
    if (anyCarHitBall && this.arena.ball && this.arena.ball.position) {
      audio.playSpatial('sfx_ball_hit', this.arena.ball.position, 1.0, this.camera.camera);
    }

    // 8. No boost SFX
    const isBoostPressed = Boolean(this.playerControls && this.playerControls.boost);
    if (isBoostPressed && !this.audioLastBoostPressed && curBoost <= 0.001) {
      audio.play('sfx_error_no_boost', 0.85);
    }
    this.audioLastBoostPressed = isBoostPressed;

    // 9. Car-to-car collision SFX (spatialized)
    if (curr[SIM_OFFSETS.NUM_CARS] > 1) {
      for (let ci = 0; ci < numCars; ci++) {
        for (let cj = ci + 1; cj < numCars; cj++) {
          const offI = SIM_OFFSETS.CARS + ci * CAR_STATE_STRIDE;
          const offJ = SIM_OFFSETS.CARS + cj * CAR_STATE_STRIDE;
          const dx = curr[offI + CAR_STATE_OFFSETS.POS] - curr[offJ + CAR_STATE_OFFSETS.POS];
          const dy = curr[offI + CAR_STATE_OFFSETS.POS + 1] - curr[offJ + CAR_STATE_OFFSETS.POS + 1];
          const dz = curr[offI + CAR_STATE_OFFSETS.POS + 2] - curr[offJ + CAR_STATE_OFFSETS.POS + 2];
          const distSq = dx * dx + dy * dy + dz * dz;
          const pairKey = ci + '_' + cj;
          if (distSq < 120 * 120) {
            if (!this.audioCollidingPairs.has(pairKey)) {
              this.audioCollidingPairs.add(pairKey);
              const midX = (curr[offI + CAR_STATE_OFFSETS.POS] + curr[offJ + CAR_STATE_OFFSETS.POS]) * 0.5;
              const midY = (curr[offI + CAR_STATE_OFFSETS.POS + 2] + curr[offJ + CAR_STATE_OFFSETS.POS + 2]) * 0.5;
              const midZ = (curr[offI + CAR_STATE_OFFSETS.POS + 1] + curr[offJ + CAR_STATE_OFFSETS.POS + 1]) * 0.5;
              audio.playSpatial('sfx_car_collision', { x: midX, y: midY, z: midZ }, 1.0, this.camera.camera);
            }
          } else if (distSq > 140 * 140) {
            this.audioCollidingPairs.delete(pairKey);
          }
        }
      }
    }
  }

  /**
   * Polls input devices (keyboard, gamepad, touch) and dispatches to simulation.
   */
  pollInputs() {
    const pad = getEffectiveGamepad();
    const btn8 = pad?.buttons[8]?.pressed ?? false;
    const padId = pad ? JSON.stringify([pad.id, pad.index]) : null;

    if (padId !== this.lastGamepadId) {
      this.lastGamepadButton8 = btn8;
    }
    this.lastGamepadId = padId;

    const shouldToggleMatch =
      btn8 && !this.lastGamepadButton8 && !this.settingsSheet.isOpen && !this.garageDialog.isOpen;
    if (shouldToggleMatch) {
      if (this.matchDialog.isOpen) this.matchDialog.hide();
      else this.matchDialog.show();
    }
    this.lastGamepadButton8 = btn8;

    if (shouldToggleMatch) this.gamepad.capturing = true;
    let padReading = this.gamepad.read();
    if (shouldToggleMatch) this.gamepad.capturing = false;

    if (this.gamepadSettingsJustClosed) {
      this.gamepadSettingsJustClosed = [0, 1, 8, 9].some(i => pad?.buttons[i]?.pressed);
      if (this.gamepadSettingsJustClosed) padReading = this.neutralControls;
    }

    const touchReading = this.touch.read();
    const kbReading = this.keyboard.read();
    const activeDevice = this.gamepad.active()
      ? 'gamepad'
      : this.touch.active()
      ? 'touch'
      : 'keyboard';

    const effectiveControls =
      activeDevice === 'gamepad'
        ? padReading
        : activeDevice === 'touch'
        ? touchReading
        : kbReading;

    const hasFocus =
      typeof document !== 'undefined' && !document.hidden && document.hasFocus();

    this.cameraDynamics.lookX = hasFocus
      ? Math.min(Math.max(this.keyboard.cameraLook.x + (this.gamepadSettingsJustClosed ? 0 : this.gamepad.cameraLook.x), -1), 1)
      : 0;
    this.cameraDynamics.lookY = hasFocus
      ? Math.min(Math.max(this.keyboard.cameraLook.y + (this.gamepadSettingsJustClosed ? 0 : this.gamepad.cameraLook.y), -1), 1)
      : 0;

    this.playerThrottle = effectiveControls.throttle;
    this.playerControls = effectiveControls;

    if (this.parallelManager && this.parallelManager.isActive) {
      this.parallelManager.applyActivePlayerControls(effectiveControls);
    } else {
      this.physics.setControls(this.playerCarIndex, effectiveControls);
    }
  }

  /**
   * Advances RL bot decision making and simulation step during 1v1 match.
   */
  stepBot() {
    if (this.match.state.paused || this.match.state.phase === 'ended' || this.isBotPaused) {
      return false;
    }

    if (this.match.state.phase === 'playing') {
      const kickoffControls = this.bot.getKickoffControls(this.physics.state, this.botKickoffStep);
      if (kickoffControls) {
        this.botControls = kickoffControls;
        this.bot.overrideControls(kickoffControls);
      } else if (this.botTickSkip === 0) {
        this.scheduleBotDecision();
        return false;
      }

      this.physics.setControls(BOT_CAR_INDEX, this.botControls);
      this.physics.step(1);
      this.botKickoffStep++;
      if (!kickoffControls) this.botTickSkip--;

      const state = this.physics.state;
      const kickoffTouched =
        Math.abs(state[SIM_OFFSETS.BALL]) + Math.abs(state[SIM_OFFSETS.BALL + 1]) > 1 ||
        Math.hypot(state[SIM_OFFSETS.BALL + 12], state[SIM_OFFSETS.BALL + 13]) > 1;

      const transition = this.match.tick({
        goal: this.physics.pollGoal(),
        ballOnGround: this.physics.ballOnGround,
        kickoffTouched
      });

      if (transition === 'kickoff') {
        this.resetKickoff();
      }

      if (
        this.match.state.phase === 'playing' &&
        this.botTickSkip === 0 &&
        !this.bot.getKickoffControls(this.physics.state, this.botKickoffStep)
      ) {
        this.scheduleBotDecision();
      }
    } else {
      const transition = this.match.tick();
      if (transition === 'kickoff') {
        this.resetKickoff();
      }
    }
    return true;
  }

  /**
   * Schedules async ONNX decision from Web Worker with stale response protection.
   */
  scheduleBotDecision() {
    if (this.isBotDeciding) return;
    this.isBotDeciding = true;
    const epoch = this.botDecisionEpoch;
    const pads = this.physics.getPads();
    const teamAssignment = getTeamAssignment(garageSettingsStore.load().carVisual === 'flat-car');

    this.bot
      .decide(this.physics.state, pads, BOT_CAR_INDEX, teamAssignment.botTeam)
      .then(controls => {
        if (epoch === this.botDecisionEpoch) {
          this.botControls = controls;
          this.botTickSkip = this.bot.option.tickSkip;
          this.isBotDeciding = false;
        }
      })
      .catch(err => {
        if (epoch === this.botDecisionEpoch) {
          this.isBotDeciding = false;
          this.isBotPaused = true;
          this.match.state.paused = true;
          this.matchDialog.showError(
            err instanceof Error ? err.message : 'The opponent stopped responding.'
          );
        }
      });
  }

  /**
   * Resets simulation positions to kickoff standards.
   */
  resetKickoff() {
    if (this.match.state.mode !== 'match') {
      if (this.parallelManager && this.parallelManager.isActive) {
        this.parallelManager.resetActiveSlot();
      } else {
        this.physics.resetKickoff();
      }
      this.resetAudio();
      this.interpolator.sync();
      const currentSim =
        this.parallelManager && this.parallelManager.isActive
          ? this.parallelManager.getActiveArena()
          : this.physics;
      if (this.trajectoryPredictor) {
        this.trajectoryPredictor.notifyKickoffReset(currentSim ? currentSim.state : null);
      }
      return;
    }

    this.physics.resetKickoff();
    this.resetAudio();
    this.resetBotState();

    const state = this.physics.state;
    const carOffset = SIM_OFFSETS.CARS + this.playerCarIndex * CAR_STATE_STRIDE;
    this.flipResetVisual.update(0, state[carOffset + CAR_STATE_OFFSETS.FLIP_RESET_SERIAL], false);

    this.actionAudio.update({
      jumpSerial: state[carOffset + CAR_STATE_OFFSETS.JUMP_SERIAL],
      dodgeSerial: state[carOffset + CAR_STATE_OFFSETS.DODGE_SERIAL],
      doubleJumpSerial: state[carOffset + CAR_STATE_OFFSETS.DOUBLE_JUMP_SERIAL],
      wheelImpactSerial: state[carOffset + CAR_STATE_OFFSETS.WHEEL_IMPACT_SERIAL],
      wheelImpactSpeed: 0,
      audible: false
    });

    const botHit =
      state[SIM_OFFSETS.NUM_CARS] > 1
        ? state[carOffset + CAR_STATE_STRIDE + CAR_STATE_OFFSETS.BALL_HIT_SERIAL]
        : 0;
    this.impactAudio.update({
      carSerial: state[carOffset + CAR_STATE_OFFSETS.BALL_HIT_SERIAL] + botHit,
      carSpeed: 0,
      worldSerial: state[carOffset + CAR_STATE_OFFSETS.BALL_WORLD_IMPACT_SERIAL],
      worldSpeed: 0,
      worldSurface: 0,
      worldPan: 0,
      audible: false
    });

    this.lastBallHitSerials[0] = state[carOffset + CAR_STATE_OFFSETS.BALL_HIT_SERIAL];
    this.lastBallHitSerials[1] = botHit;
    this.arena.resetBallTrail();
    this.physics.resetView();
    this.interpolator.sync();

    if (this.trajectoryPredictor) {
      this.trajectoryPredictor.notifyKickoffReset(this.physics.state);
    }
  }

  /**
   * Resets internal audio state caches.
   */
  resetAudio() {
    for (const eng of this.engineAudios) {
      if (eng) eng.reset();
    }
    if (this.actionAudio) this.actionAudio.previous = null;
    if (this.impactAudio) {
      this.impactAudio.previousCarSerial = null;
      this.impactAudio.previousWorldSerial = null;
    }
    this.lastBallHitSerials[0] = 0;
    this.lastBallHitSerials[1] = 0;
    this.audioCarHitSerials.length = 0;
    this.audioCollidingPairs.clear();
    this.audioLastGoalScored = false;
    this.audioLastCountdown = -1;
    this.audioLastBoostPressed = false;
  }

  /**
   * Resets bot controls and step counters.
   */
  resetBotState() {
    if (this.bot) this.bot.reset();
    this.botDecisionEpoch++;
    this.botTickSkip = 0;
    this.isBotDeciding = false;
    this.botControls = { ...this.neutralControls };
    this.botKickoffStep = 0;
  }

  /**
   * Dynamically resizes viewports and adjusts pixel ratio scaling.
   */
  updateViewport(graphics) {
    if (!this.renderer || !this.boostBloom || !this.composer) return;
    const currentGraphics = graphics ?? this.activeGraphicsSettings ?? this.settingsSheet?.graphics;
    const scale = ((currentGraphics?.renderScale) ?? 50) / 100;
    const winWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const winHeight = typeof window !== 'undefined' ? window.innerHeight : 720;
    const basePixelRatio = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    const effectivePixelRatio = basePixelRatio * scale;

    if (this.camera?.camera) {
      this.camera.camera.aspect = winWidth / winHeight;
      this.camera.camera.updateProjectionMatrix();
    }

    this.renderer.setPixelRatio(effectivePixelRatio);
    this.renderer.setSize(winWidth, winHeight);
    this.boostBloom.setSize(winWidth, winHeight, this.renderer.getPixelRatio());
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(winWidth, winHeight);
  }

  /**
   * Traverses scene and substitutes non-bloom meshes with dark occluders.
   */
  applyBloomOccluders() {
    const ctx = resolveContext();
    const MeshClass = ctx.Mesh || Object;

    if (this.lastBloomTreeVersion !== this.arena.renderTreeVersion) {
      this.bloomOccluderMeshes.length = 0;
      this.bloomSavedMaterials.length = 0;
      this.bloomInvisibleObjects.length = 0;

      this.arena.scene.traverse(node => {
        if (node.layers && node.layers.isEnabled(BLOOM_OCCLUDER_LAYER)) return;
        if (node instanceof MeshClass) {
          const mats = Array.isArray(node.material) ? node.material : [node.material];
          if (node.userData?.bloomOccluder === false || mats.every(m => m && m.transparent && !m.depthWrite)) {
            this.bloomInvisibleObjects.push(node);
            return;
          }
          this.bloomOccluderMeshes.push(node);
          this.bloomSavedMaterials.push(node.material);
          return;
        }
        if (node.material) this.bloomInvisibleObjects.push(node);
      });
      this.lastBloomTreeVersion = this.arena.renderTreeVersion;
    }

    for (let i = 0; i < this.bloomOccluderMeshes.length; i++) {
      const mesh = this.bloomOccluderMeshes[i];
      this.bloomSavedMaterials[i] = mesh.material;
      mesh.material = this.bloomDarkMaterial;
    }

    this.bloomHiddenObjects.length = 0;
    for (let i = 0; i < this.bloomInvisibleObjects.length; i++) {
      const obj = this.bloomInvisibleObjects[i];
      if (obj.visible) {
        obj.visible = false;
        this.bloomHiddenObjects.push(obj);
      }
    }
  }

  /**
   * Restores original materials after bloom pass.
   */
  restoreBloomMaterials() {
    for (let i = 0; i < this.bloomOccluderMeshes.length; i++) {
      this.bloomOccluderMeshes[i].material = this.bloomSavedMaterials[i];
    }
    for (let i = 0; i < this.bloomHiddenObjects.length; i++) {
      this.bloomHiddenObjects[i].visible = true;
    }
  }

  /**
   * Handles modal dialog visibility and keeps them mutually exclusive.
   */
  handleOverlayChange(name, isOpen) {
    if (isOpen) {
      this.openOverlays.add(name);
      if (name !== 'settings' && this.settingsSheet) this.settingsSheet.hide();
      if (name !== 'car' && this.garageDialog) this.garageDialog.hide();
      if (name !== 'match' && this.matchDialog) this.matchDialog.hide();
      if (name !== 'status' && this.overlayHUD) this.overlayHUD.hideDetails(false);
    } else {
      this.openOverlays.delete(name);
      this.gamepadSettingsJustClosed = true;
    }
    this.syncPausedAndInputState();
  }

  /**
   * Synchronizes pause state and enables/disables input controllers.
   */
  syncPausedAndInputState() {
    this.pendingClickToPlay = false;
    const isPlaying = this.openOverlays.size === 0 && !this.isCursorBrowsing;
    this.match.state.paused = this.match.state.mode === 'match' && (!isPlaying || this.isBotPaused);
    if (this.keyboard) this.keyboard.enabled = isPlaying;
    if (this.gamepad) this.gamepad.enabled = isPlaying;
    if (this.touch) this.touch.enabled = isPlaying;
    this.updateInteractionState();
    if (this.interpolator) this.interpolator.sync();
  }

  /**
   * Updates CSS interaction classes on root container.
   */
  updateInteractionState() {
    if (!this.container) return;
    const hasFocus = typeof document !== 'undefined' ? (!document.hidden && (typeof document.hasFocus === 'function' ? document.hasFocus() : true)) : true;
    const isPlaying = this.openOverlays.size === 0 && hasFocus;
    if (this.container.classList) {
      this.container.classList.toggle('game-playing', isPlaying && !this.isCursorBrowsing);
      this.container.classList.toggle('cursor-browsing', isPlaying && this.isCursorBrowsing);
    }
    this.updateCursorHint();
  }

  /**
   * Updates text inside the cursor hint HUD button.
   */
  updateCursorHint() {
    if (!this.cursorHintButton) return;
    const bindings = loadInputBindings();
    const toggleBindings = bindings.keyboard.toggleSettings;
    const keyBinding = toggleBindings.find(b => b.kind === 'key') ?? toggleBindings[0];

    this.cursorHintButton.replaceChildren();
    if (this.isCursorBrowsing) {
      this.cursorHintButton.textContent = 'Click field to play';
    } else if (keyBinding) {
      const kbd = document.createElement('kbd');
      kbd.textContent = formatBindingDisplayName(keyBinding);
      this.cursorHintButton.append(kbd, ' to show cursor');
    } else {
      this.cursorHintButton.textContent = 'Show cursor';
    }
    this.cursorHintButton.setAttribute(
      'aria-label',
      this.isCursorBrowsing
        ? 'Return to play'
        : keyBinding
        ? `Show mouse cursor (${formatBindingDisplayName(keyBinding)})`
        : 'Show mouse cursor'
    );
  }

  /**
   * Set up HUD buttons (Multiplayer training, settings hint).
   */
  setupHudButtons() {
    if (!this.container || typeof document === 'undefined') return;
    const hudTools = this.container.querySelector('.hud-tools');
    if (hudTools) {
      const pBtn = document.createElement('button');
      pBtn.id = 'parallel-training-btn';
      pBtn.className = 'hud-tool';
      pBtn.type = 'button';
      pBtn.setAttribute('aria-label', 'Multiplayer Mode');
      pBtn.setAttribute('title', 'Multiplayer Mode / 多人模式 (Tab)');
      pBtn.innerHTML =
        '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
      pBtn.addEventListener('click', () => {
        if (this.match.state.mode === 'match') return;
        if (this.parallelManager.isActive) {
          this.parallelManager.toggleMenu();
        } else {
          this.parallelManager.showConfirmModal();
        }
      });
      hudTools.prepend(pBtn);
      this.parallelManager.hudToggleButton = pBtn;

      if (this.cursorHintButton) {
        hudTools.appendChild(this.cursorHintButton);
      }
    }
  }

  /**
   * Sets up window and DOM event listeners for resize, blur/focus, and keydown.
   */
  setupWindowEvents() {
    if (typeof window === 'undefined') return;

    window.addEventListener('resize', () => {
      this.updateViewport();
    });

    const onSettingsToggle = () => {
      if (this.overlayHUD && this.overlayHUD.isDetailsOpen) {
        this.overlayHUD.hideDetails();
        return;
      }
      if (this.matchDialog && this.matchDialog.isOpen) {
        this.matchDialog.hide();
        return;
      }
      if (this.garageDialog && this.garageDialog.isOpen) {
        this.garageDialog.hide();
        return;
      }
      if (this.settingsSheet) {
        this.settingsSheet.toggle();
      }
    };
    this.gamepad.onSettingsToggle = onSettingsToggle;

    const onDismissCursor = () => {
      this.isCursorBrowsing = false;
      if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      this.syncPausedAndInputState();
    };

    const onCursorToggle = () => {
      if (this.openOverlays.size > 0) {
        this.isCursorBrowsing = true;
        onSettingsToggle();
      } else if (this.isCursorBrowsing) {
        onDismissCursor();
      } else {
        this.isCursorBrowsing = true;
        this.syncPausedAndInputState();
      }
    };
    this.keyboard.onSettingsToggle = onCursorToggle;
    if (this.cursorHintButton) {
      this.cursorHintButton.addEventListener('click', onCursorToggle);
    }

    if (this.container) {
      const settingsBtn = this.container.querySelector('#settings-button');
      if (settingsBtn) settingsBtn.setAttribute('title', 'Settings');

      this.container.addEventListener(
        'pointerdown',
        evt => {
          if (
            evt.pointerType !== 'mouse' ||
            !(evt.target instanceof Element) ||
            evt.target.closest(
              '#settings-button, #car-button, #match-button, #trajectory-button, #trajectory-panel, #parallel-training-btn, #parallel-training-overlay, #parallel-training-menu-btn'
            )
          ) {
            this.isCursorBrowsing = true;
            this.syncPausedAndInputState();
          }
        },
        true
      );
    }

    this.gamepad.onActivity = () => {
      if (this.container) this.container.dataset.inputMethod = 'gamepad';
      this.touch.hideForExternalInput();
      if (this.isCursorBrowsing) {
        this.isCursorBrowsing = false;
        this.syncPausedAndInputState();
      }
    };

    window.addEventListener(
      'keydown',
      evt => {
        if (
          evt.code !== 'KeyM' ||
          evt.repeat ||
          evt.ctrlKey ||
          evt.metaKey ||
          evt.altKey ||
          this.settingsSheet?.isOpen ||
          this.garageDialog?.isOpen
        ) {
          return;
        }
        evt.preventDefault();
        evt.stopImmediatePropagation();
        this.isCursorBrowsing = true;
        if (this.matchDialog?.isOpen) {
          this.matchDialog.hide();
        } else {
          this.matchDialog?.show();
        }
      },
      true
    );

    for (const evtName of ['blur', 'focus', 'visibilitychange']) {
      const target = evtName === 'visibilitychange' && typeof document !== 'undefined' ? document : window;
      target.addEventListener(evtName, () => {
        this.pendingClickToPlay = false;
        this.updateInteractionState();
        if (this.interpolator) this.interpolator.sync();
      });
    }

    if (this.renderer?.domElement) {
      this.renderer.domElement.addEventListener('mousedown', evt => {
        this.pendingClickToPlay = this.isCursorBrowsing && this.openOverlays.size === 0 && evt.button === 0;
        const bindings = loadInputBindings();
        if (
          !(!this.isCursorBrowsing || this.openOverlays.size > 0) &&
          bindings.keyboard.toggleSettings.some(b => b.kind === 'mouse' && b.button === evt.button)
        ) {
          evt.preventDefault();
          evt.stopPropagation();
          onCursorToggle();
        }
      });

      this.renderer.domElement.addEventListener('click', evt => {
        const wasPending = this.pendingClickToPlay;
        this.pendingClickToPlay = false;
        if (!(!wasPending || !this.isCursorBrowsing || this.openOverlays.size > 0 || evt.button !== 0)) {
          evt.preventDefault();
          evt.stopPropagation();
          onDismissCursor();
        }
      });
    }
  }

  /**
   * Destroys the runtime and disposes all resources.
   */
  destroy() {
    this.stop();
    if (this.composer) this.composer.dispose();
    if (this.boostBloom) this.boostBloom.dispose();
    if (this.speedLinesPass) this.speedLinesPass.dispose();
    if (this.renderer) this.renderer.dispose();
    if (this.arena) this.arena.dispose();
    if (this.physics) this.physics.destroy();
  }
}

// Backward-compatibility aliases
export {
  GameRuntime as CarSoccerGameSession,
  GameRuntime as GameSession,
  GameRuntime as GameOrchestration
};
