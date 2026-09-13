/**
 * GarageDialog.js
 * Vehicle showcase turntable, hitbox specifications, car mesh constructors,
 * and 3D garage modal dialog for Car Soccer.
 *
 * Subsystems contained:
 * - HITBOX_PRESETS: 6 standard Rocket League vehicle hitboxes with strict
 *   RocketSim C++ (Sim/Car/CarConfig) dimension & pivot alignment:
 *   Octane, Dominus, Breakout, Hybrid, Batmobile (Plank), Merc.
 * - CAR_VISUAL_OPTIONS & CAR_VISUAL_IDS: Visual variants supported by the arena.
 * - garageSettingsStore (Qh): LocalStorage store for selected car visual (key: car-soccer.display-settings.v1).
 * - createWhiteboxCarModel: Procedural whitebox representation of hitboxes with
 *   direction-indicator faces (front in team color, rear in white) and edge highlights.
 * - GarageTurntable (HM): Off-screen WebGL turntable renderer for 3D car previews.
 * - GarageDialog (UM): Full interactive modal dialog with Gamepad D-pad navigation,
 *   keyboard shortcuts, and reactive theme alignment.
 * - Backward compatibility with original obfuscated symbols:
 *   HM, UM, HITBOX_PRESETS, createWhiteboxCarModel, kM, Fc, Qh, xs.
 */

import { renderIcon } from './Icons.js';
import {
  createLocalStorageStore,
  stringOrDefault
} from '../utils/StorageHelper.js';
import { getEffectiveGamepad } from '../input/MultiPlatformInput.js';
import {
  THEMES,
  getTheme,
  setTheme,
  onThemeChange
} from './ThemeManager.js';

/**
 * Standard Rocket League vehicle hitbox presets.
 * Direct alignment with upstream RocketSim C++ Sim/Car/CarConfig.
 */
export const HITBOX_PRESETS = {
  "hitbox-octane": {
    name: "Octane",
    length: 118.01,
    width: 84.20,
    height: 36.16,
    forward: 13.88,
    up: 20.75
  },
  "hitbox-dominus": {
    name: "Dominus",
    length: 127.93,
    width: 83.28,
    height: 31.30,
    forward: 9.00,
    up: 15.75
  },
  "hitbox-breakout": {
    name: "Breakout",
    length: 131.57,
    width: 80.52,
    height: 30.30,
    forward: 12.50,
    up: 18.65
  },
  "hitbox-hybrid": {
    name: "Hybrid",
    length: 127.02,
    width: 82.19,
    height: 34.16,
    forward: 13.88,
    up: 17.60
  },
  "hitbox-plank": {
    name: "Batmobile (Plank)",
    length: 128.82,
    width: 84.67,
    height: 29.40,
    forward: 9.00,
    up: 19.36
  },
  "hitbox-merc": {
    name: "Merc",
    length: 120.72,
    width: 76.80,
    height: 41.66,
    forward: 12.50,
    up: 12.50
  }
};

/**
 * Valid car visual identifier strings.
 * Original obfuscated alias: kM
 */
export const CAR_VISUAL_IDS = [
  "hitbox-octane",
  "hitbox-dominus",
  "hitbox-breakout",
  "hitbox-hybrid",
  "hitbox-plank",
  "hitbox-merc",
  "game-car",
  "flat-car"
];

/**
 * Full options table for visual selection in the Garage dialog.
 * Original obfuscated alias: Fc
 */
export const CAR_VISUAL_OPTIONS = [
  { id: "hitbox-octane", label: "Octane (Whitebox)", isPreset: true },
  { id: "hitbox-dominus", label: "Dominus (Whitebox)", isPreset: true },
  { id: "hitbox-breakout", label: "Breakout (Whitebox)", isPreset: true },
  { id: "hitbox-hybrid", label: "Hybrid (Whitebox)", isPreset: true },
  { id: "hitbox-plank", label: "Batmobile/Plank (Whitebox)", isPreset: true },
  { id: "hitbox-merc", label: "Merc (Whitebox)", isPreset: true },
  { id: "game-car", label: "Default Car", isPreset: false },
  { id: "flat-car", label: "Flat Car", isPreset: false }
];

export const STORAGE_KEY_DISPLAY_SETTINGS = "car-soccer.display-settings.v1";

/**
 * Display settings store for car body selection.
 * Original obfuscated alias: Qh
 */
export const garageSettingsStore = createLocalStorageStore(
  STORAGE_KEY_DISPLAY_SETTINGS,
  () => ({ carVisual: "game-car" }),
  (target, stored) => {
    target.carVisual = stringOrDefault(stored.carVisual, CAR_VISUAL_IDS, target.carVisual);
  }
);

// Turntable dimensional constants
export const GARAGE_CANVAS_WIDTH = 384;
export const GARAGE_CANVAS_HEIGHT = 216;
export const TURNTABLE_CAMERA_DISTANCE = 292;
export const TURNTABLE_MODEL_HEIGHT_OFFSET = 11;

// Global Three.js dependency container for decoupling
let garageThreeContext = null;
let garageModelLoaders = {
  loadFlatCar: null,
  loadGameCar: null,
  getTeamColor: () => 0x2f7bd3
};

/**
 * Inject Three.js classes and constructors.
 */
export function setGarageThreeContext(context) {
  garageThreeContext = context;
}

/**
 * Inject external GLTF model loader callbacks.
 */
export function setGarageModelLoaders(loaders) {
  Object.assign(garageModelLoaders, loaders);
}

/**
 * Constructs a procedural 3D whitebox car body based on a RocketSim hitbox preset.
 * Includes colored team faces and rear orientation indicator.
 */
export function createWhiteboxCarModel(presetId, teamColor = 0x0088ff, three = garageThreeContext) {
  const cfg = HITBOX_PRESETS[presetId] || HITBOX_PRESETS["hitbox-octane"];
  if (!three || !three.Group || !three.BoxGeometry || !three.MeshStandardMaterial || !three.Mesh) {
    throw new Error("[Garage] Three.js context required to build procedural car model.");
  }

  const root = new three.Group();
  root.name = `whitebox-${cfg.name}`;

  const bodyGeom = new three.BoxGeometry(cfg.length, cfg.height, cfg.width);
  const bodyMat = new three.MeshStandardMaterial({
    color: teamColor,
    roughness: 0.35,
    metalness: 0.2
  });
  const rearMat = new three.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.35,
    metalness: 0.2
  });

  const materials = [
    bodyMat, // Face 0: +X (Front - team color)
    rearMat, // Face 1: -X (Rear / 车屁股 - White)
    bodyMat, // Face 2: +Y (Top - team color)
    bodyMat, // Face 3: -Y (Bottom - team color)
    bodyMat, // Face 4: +Z (Side - team color)
    bodyMat  // Face 5: -Z (Side - team color)
  ];

  const bodyMesh = new three.Mesh(bodyGeom, materials);
  bodyMesh.position.set(cfg.forward, cfg.up, 0);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;

  if (three.EdgesGeometry && three.LineBasicMaterial && three.LineSegments) {
    const edgesGeom = new three.EdgesGeometry(bodyGeom);
    const wireMat = new three.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85
    });
    const wireMesh = new three.LineSegments(edgesGeom, wireMat);
    bodyMesh.add(wireMesh);
  }

  root.add(bodyMesh);
  return root;
}

/**
 * Turntable off-screen 3D staging and preview renderer.
 * Original obfuscated alias: HM
 */
export class GarageTurntable {
  constructor(options = {}) {
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.envTarget = null;
    this.turntables = new Map();
    this.targets = new Map();
    this.frame = 0;
    this.lastTime = 0;
    this.spin = 0;
    this.three = options.three || null;
    this.modelLoaders = options.modelLoaders || null;

    const ref = new WeakRef(this);
    onThemeChange(() => {
      const self = ref.deref();
      if (self != null && self.frame) {
        self.draw();
      }
    });
  }

  getThree() {
    return this.three || garageThreeContext;
  }

  getModelLoaders() {
    return this.modelLoaders || garageModelLoaders;
  }

  init() {
    if (this.renderer) return;
    const three = this.getThree();
    if (!three || !three.WebGLRenderer) {
      return;
    }

    const renderer = new three.WebGLRenderer({ antialias: true, alpha: true });
    if (typeof window !== 'undefined') {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    }
    renderer.setSize(GARAGE_CANVAS_WIDTH, GARAGE_CANVAS_HEIGHT, false);
    renderer.toneMapping = 4;
    renderer.toneMappingExposure = 1.15;
    renderer.outputColorSpace = "srgb";
    this.renderer = renderer;

    const scene = new three.Scene();
    if (three.PMREMGenerator && three.RoomEnvironment) {
      const pmrem = new three.PMREMGenerator(renderer);
      const room = new three.RoomEnvironment();
      this.envTarget = pmrem.fromScene(room, 0.04);
      scene.environment = this.envTarget.texture;
      scene.environmentIntensity = 0.5;
      pmrem.dispose();
      room.traverse((node) => {
        if (node.isMesh) {
          node.geometry.dispose();
          const mats = Array.isArray(node.material) ? node.material : [node.material];
          mats.forEach((m) => m && m.dispose && m.dispose());
        }
      });
    }

    if (three.HemisphereLight) {
      scene.add(new three.HemisphereLight(13625599, 1581103, 0.8));
    }
    if (three.DirectionalLight) {
      const sun1 = new three.DirectionalLight(16777215, 2);
      sun1.position.set(2500, 4000, 1500);
      scene.add(sun1);
      const sun2 = new three.DirectionalLight(8956671, 0.35);
      sun2.position.set(-2000, 2000, -2000);
      scene.add(sun2);
    }
    this.scene = scene;

    if (three.PerspectiveCamera) {
      const camera = new three.PerspectiveCamera(28, GARAGE_CANVAS_WIDTH / GARAGE_CANVAS_HEIGHT, 1, 2000);
      const camDir = new three.Vector3(156.12, 77, 109).normalize();
      camera.position.copy(camDir).multiplyScalar(TURNTABLE_CAMERA_DISTANCE);
      camera.lookAt(0, 0, 0);
      this.camera = camera;
    }
  }

  attach(visualId) {
    this.init();
    const canvas = typeof document !== 'undefined' && document.createElement
      ? document.createElement("canvas")
      : { width: GARAGE_CANVAS_WIDTH, height: GARAGE_CANVAS_HEIGHT, getContext: () => null };
    canvas.width = GARAGE_CANVAS_WIDTH;
    canvas.height = GARAGE_CANVAS_HEIGHT;
    const ctx = canvas.getContext ? canvas.getContext("2d") : null;
    if (ctx) {
      this.targets.set(visualId, ctx);
    }

    const three = this.getThree();
    const loaders = this.getModelLoaders();
    const teamColor = loaders.getTeamColor ? loaders.getTeamColor() : 0x2f7bd3;

    const onModelLoaded = (mesh) => {
      if (!three || !three.Group || !three.Box3 || !three.Vector3) return;
      const group = new three.Group();
      const center = new three.Box3().setFromObject(mesh).getCenter(new three.Vector3());
      mesh.position.set(-center.x, -center.y + TURNTABLE_MODEL_HEIGHT_OFFSET, -center.z);
      group.add(mesh);
      this.turntables.set(visualId, group);
    };

    let readyPromise;
    if (visualId.startsWith("hitbox-")) {
      readyPromise = Promise.resolve(createWhiteboxCarModel(visualId, teamColor, three)).then(onModelLoaded);
    } else if (visualId === "flat-car") {
      readyPromise = loaders.loadFlatCar ? loaders.loadFlatCar().then(onModelLoaded) : Promise.reject(new Error("Flat car loader unavailable"));
    } else {
      readyPromise = loaders.loadGameCar ? loaders.loadGameCar().then(onModelLoaded) : Promise.reject(new Error("Game car loader unavailable"));
    }

    return {
      canvas,
      ready: readyPromise
    };
  }

  async preload() {
    const { renderer, scene, camera } = this;
    if (!renderer || !scene || !camera) return;
    const currentTheme = getTheme();
    try {
      for (const theme of THEMES) {
        setTheme(theme, { persist: false });
        if (typeof document !== 'undefined' && document.documentElement) {
          document.documentElement.dataset.theme = currentTheme;
        }
        for (const turntable of this.turntables.values()) {
          scene.add(turntable);
          try {
            if (renderer.compileAsync) {
              await renderer.compileAsync(scene, camera);
            }
            renderer.render(scene, camera);
          } finally {
            scene.remove(turntable);
          }
        }
      }
    } finally {
      setTheme(currentTheme, { persist: false });
    }
    this.draw();
  }

  start() {
    if (this.frame) return;
    this.lastTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const loop = (timestamp) => {
      this.frame = requestAnimationFrame(loop);
      const delta = Math.min((timestamp - this.lastTime) / 1000, 0.1);
      this.lastTime = timestamp;
      this.spin += delta * 0.45;
      this.draw();
    };
    this.frame = requestAnimationFrame(loop);
  }

  stop() {
    if (this.frame) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
  }

  draw() {
    const { renderer, scene, camera } = this;
    if (!renderer || !scene || !camera) return;
    for (const [visualId, turntable] of this.turntables) {
      const ctx = this.targets.get(visualId);
      if (ctx) {
        turntable.rotation.y = this.spin;
        scene.add(turntable);
        renderer.render(scene, camera);
        scene.remove(turntable);
        ctx.clearRect(0, 0, GARAGE_CANVAS_WIDTH, GARAGE_CANVAS_HEIGHT);
        ctx.drawImage(renderer.domElement, 0, 0, GARAGE_CANVAS_WIDTH, GARAGE_CANVAS_HEIGHT);
      }
    }
  }
}

/**
 * Gamepad button indices for modal menu navigation.
 * Original obfuscated alias: xs
 */
export const PAD_NAVIGATION_BUTTONS = {
  confirm: 0,
  back: 1,
  left: 14,
  right: 15,
  up: 12,
  down: 13
};

/**
 * Garage modal dialog for vehicle selection and inspection.
 * Original obfuscated alias: UM
 */
export class GarageDialog {
  constructor(container, onOpenChange, options = {}) {
    this.overlay = null;
    this.stage = options.stage || new GarageTurntable(options.stageOptions);
    this.display = garageSettingsStore.load();
    this.onOpenChange = onOpenChange;
    this.openState = false;
    this.preparing = null;
    this.padPoll = 0;
    this.padPrev = [];
    this.padRepeatAt = 0;
    this.padDir = 0;
    this.padKey = null;
    this.padWaitForNeutral = false;

    this.pollPad = (timestamp) => {
      this.padPoll = requestAnimationFrame(this.pollPad);
      if (!this.openState) return;
      const pad = this.firstPad();
      const key = pad ? JSON.stringify([pad.id, pad.index]) : null;
      if (key !== this.padKey) {
        this.padKey = key;
        this.padPrev = ((pad?.buttons) ?? []).map((btn) => btn.pressed);
        this.padDir = 0;
        this.padWaitForNeutral = true;
        return;
      }
      if (!pad) return;

      const isPressed = (btnIndex) => pad.buttons[btnIndex]?.pressed ?? false;
      const wasJustPressed = (btnIndex) => {
        const pressed = isPressed(btnIndex);
        const prev = this.padPrev[btnIndex] ?? false;
        this.padPrev[btnIndex] = pressed;
        return pressed && !prev;
      };

      if (wasJustPressed(PAD_NAVIGATION_BUTTONS.back)) {
        this.hide();
        return;
      }
      if (wasJustPressed(PAD_NAVIGATION_BUTTONS.confirm)) {
        if (typeof document !== 'undefined') {
          document.body?.classList.add("pad-nav");
          document.activeElement?.click();
        }
        return;
      }

      wasJustPressed(PAD_NAVIGATION_BUTTONS.up);
      wasJustPressed(PAD_NAVIGATION_BUTTONS.down);

      const stickX = pad.axes[0] ?? 0;
      let dir = (isPressed(PAD_NAVIGATION_BUTTONS.right) ? 1 : 0) - (isPressed(PAD_NAVIGATION_BUTTONS.left) ? 1 : 0);
      if (dir === 0 && Math.abs(stickX) > 0.55) {
        dir = Math.sign(stickX);
      }

      if (this.padWaitForNeutral) {
        if (dir !== 0) return;
        this.padWaitForNeutral = false;
      }

      if (dir === 0) {
        this.padDir = 0;
        return;
      }

      if (dir !== this.padDir) {
        this.padDir = dir;
        this.padRepeatAt = timestamp + 380;
      } else {
        if (timestamp < this.padRepeatAt) return;
        this.padRepeatAt = timestamp + 160;
      }

      if (typeof document !== 'undefined') {
        document.body?.classList.add("pad-nav");
      }
      this.moveFocus(dir);
    };

    if (container && container.insertAdjacentHTML) {
      container.insertAdjacentHTML("beforeend", `
        <button id="car-button" class="car-tab" type="button"
                aria-label="Choose the car body" title="Garage" aria-haspopup="dialog">
          <span class="car-tab__icon" aria-hidden="true">${renderIcon("car-profile", 36)}</span>
          <span class="car-tab__copy">
            <span class="car-tab__label">Garage</span>
            <span class="car-tab__ride"></span>
          </span>
        </button>

        <div id="car-overlay" class="car-overlay" hidden aria-hidden="true">
          <section class="car-dialog" role="dialog" aria-modal="true" aria-labelledby="car-dialog-title">
            <header class="car-dialog__head">
              <div>
                <h2 id="car-dialog-title">Garage</h2>
                <p class="car-dialog__subtitle">Choose your ride.</p>
              </div>
              <button class="sheet-head__close" type="button" data-car-close aria-label="Close">
                ${renderIcon("x", 24)}
              </button>
            </header>

            <div class="car-grid" role="radiogroup" aria-label="Car body">
              ${CAR_VISUAL_OPTIONS.map((opt) => `
                <button class="car-card" type="button" role="radio" aria-checked="false"
                        data-car-choice="${opt.id}">
                  <span class="car-card__stage" data-car-stage="${opt.id}">
                    <span class="car-card__equipped" aria-hidden="true">${renderIcon("check", 19)}</span>
                    <span class="car-card__status" data-car-status="${opt.id}">Loading…</span>
                  </span>
                  <span class="car-card__body">
                    <span class="car-card__name">${opt.label}</span>
                    <span class="car-card__action" aria-hidden="true">
                      <span class="car-card__state"></span>
                      ${renderIcon("arrow-right", 18)}
                    </span>
                  </span>
                </button>
              `).join("")}
            </div>
            <footer class="car-dialog__foot">
              <span>${renderIcon("arrows-clockwise", 16)} Switching cars restarts the arena.</span>
              <span class="car-dialog__keys"><kbd>←</kbd><kbd>→</kbd> Choose <kbd>Enter</kbd> Select</span>
            </footer>
          </section>
        </div>
      `);

      this.overlay = container.querySelector("#car-overlay");
      container.querySelector("#car-button")?.addEventListener("click", () => this.show());
      this.overlay?.querySelector("[data-car-close]")?.addEventListener("click", () => this.hide());
      this.overlay?.addEventListener("mousedown", (e) => {
        if (e.target === this.overlay) this.hide();
      });
      this.overlay?.querySelectorAll("[data-car-choice]").forEach((card) => {
        card.addEventListener("click", () => this.choose(card.dataset.carChoice));
      });

      if (typeof window !== 'undefined') {
        window.addEventListener("keydown", (e) => {
          if (this.openState) {
            if (e.code === "Escape") {
              e.preventDefault();
              this.hide();
              return;
            }
            if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
              e.preventDefault();
              this.moveFocus(e.code === "ArrowRight" ? 1 : -1);
            }
          }
        });
      }

      this.syncCards();
    }
  }

  get isOpen() {
    return this.openState;
  }

  show() {
    if (this.openState) return;
    this.openState = true;
    this.preload().catch(() => {});
    if (this.overlay) {
      this.overlay.hidden = false;
      this.overlay.setAttribute("aria-hidden", "false");
      requestAnimationFrame(() => this.overlay.classList.add("is-open"));
    }
    if (this.onOpenChange) {
      this.onOpenChange(true);
    }
    this.startPreviews();
    this.cards()[0]?.focus();
    const pad = this.firstPad();
    this.padPrev = ((pad?.buttons) ?? []).map((b) => b.pressed);
    this.startPadNav();
  }

  hide() {
    if (!this.openState) return;
    this.openState = false;
    if (this.overlay) {
      this.overlay.classList.remove("is-open");
      this.overlay.setAttribute("aria-hidden", "true");
      if (typeof window !== 'undefined') {
        window.setTimeout(() => {
          if (!this.openState && this.overlay) {
            this.overlay.hidden = true;
          }
        }, 180);
      }
    }
    if (this.onOpenChange) {
      this.onOpenChange(false);
    }
    this.stopPadNav();
    this.stage.stop();
    if (typeof document !== 'undefined') {
      document.querySelector("#car-button")?.focus();
    }
  }

  preload() {
    if (this.preparing) return this.preparing;
    const promises = [];
    if (this.overlay) {
      for (const opt of CAR_VISUAL_OPTIONS) {
        const stageEl = this.overlay.querySelector(`[data-car-stage="${opt.id}"]`);
        const statusEl = this.overlay.querySelector(`[data-car-status="${opt.id}"]`);
        if (!stageEl) continue;

        const { canvas, ready } = this.stage.attach(opt.id);
        if (canvas) {
          canvas.className = "car-card__canvas";
          stageEl.appendChild(canvas);
        }

        promises.push(
          ready.then(() => {
            statusEl?.remove();
            if (this.openState) this.startPreviews();
          }).catch((err) => {
            if (statusEl) {
              statusEl.textContent = "Model unavailable";
              statusEl.classList.add("is-missing");
            }
            const card = this.overlay.querySelector(`[data-car-choice="${opt.id}"]`);
            card?.classList.add("is-unavailable");
            throw err;
          })
        );
      }
    }
    this.preparing = Promise.all(promises).then(() => this.stage.preload());
    return this.preparing;
  }

  startPreviews() {
    this.stage.start();
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      requestAnimationFrame(() => this.stage.stop());
    }
  }

  cards() {
    return this.overlay ? Array.from(this.overlay.querySelectorAll("[data-car-choice]")) : [];
  }

  moveFocus(direction) {
    const cardList = this.cards();
    if (cardList.length === 0) return;
    const currentIdx = cardList.indexOf(document.activeElement);
    const nextIdx = currentIdx === -1 ? 0 : (currentIdx + direction + cardList.length) % cardList.length;
    cardList[nextIdx].focus();
  }

  syncCards() {
    const rideLabel = typeof document !== 'undefined' ? document.querySelector(".car-tab__ride") : null;
    if (rideLabel) {
      const match = CAR_VISUAL_OPTIONS.find((opt) => opt.id === this.display.carVisual);
      rideLabel.textContent = match?.label ?? "";
    }
    for (const card of this.cards()) {
      const isEquipped = card.dataset.carChoice === this.display.carVisual;
      card.classList.toggle("is-selected", isEquipped);
      card.setAttribute("aria-checked", String(isEquipped));
      const stateEl = card.querySelector(".car-card__state");
      if (stateEl) {
        stateEl.textContent = isEquipped ? "Equipped" : "Select";
      }
    }
  }

  choose(visualId) {
    if (this.display.carVisual === visualId) {
      this.hide();
      return;
    }
    this.display.carVisual = visualId;
    garageSettingsStore.save(this.display);
    this.syncCards();
    if (this.overlay) {
      this.overlay.classList.add("is-committing");
    }
    if (typeof window !== 'undefined' && window.location) {
      window.setTimeout(() => window.location.reload(), 320);
    }
  }

  firstPad() {
    return getEffectiveGamepad();
  }

  startPadNav() {
    if (!this.padPoll) {
      this.padPoll = requestAnimationFrame(this.pollPad);
    }
  }

  stopPadNav() {
    if (this.padPoll) {
      cancelAnimationFrame(this.padPoll);
      this.padPoll = 0;
      this.padDir = 0;
    }
  }
}

// Backward-compatibility aliases
export {
  GarageTurntable as HM,
  GarageDialog as UM,
  CAR_VISUAL_IDS as kM,
  CAR_VISUAL_OPTIONS as Fc,
  garageSettingsStore as Qh,
  PAD_NAVIGATION_BUTTONS as xs
};
