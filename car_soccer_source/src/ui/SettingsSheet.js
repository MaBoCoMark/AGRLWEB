/**
 * SettingsSheet.js
 * Comprehensive game settings modal, control remapping, camera configuration,
 * graphics/audio tuning, and diagnostics manager.
 * 
 * Subsystems contained:
 * - Camera tuning (FOV, distance, height, angle, stiffness, swivel/transition speed, shake, invert)
 * - Input controls assignment (Keyboard, Mouse, Gamepad, Touch layout editor)
 * - Graphics tuning (Theme, Limit FPS, Max FPS, Render Scale, Scenery)
 * - Audio volume levels (Master, Engine, Boost)
 * - Training rules (Free play goal restart, unlimited boost, hitbox wireframe, trajectory predictor)
 * - Diagnostics status HUD toggle & detailed profiler launch
 * - Backward compatibility with original obfuscated symbols:
 *   BM, _g, Yh, Ma, SA, uA, EM, Ps, bM, Zh, SM, wM, nm, yM, xM, Kd, rm, CM, Na, MM, Pr, im, getDefaultRenderScale.
 */

import { renderIcon } from './Icons.js';
import {
  createLocalStorageStore,
  booleanOrDefault,
  clampNumberOrDefault,
  stringOrDefault
} from '../utils/StorageHelper.js';
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
} from '../input/MultiPlatformInput.js';
import {
  getAudioSettings,
  setMasterVolume,
  setEngineVolume,
  setBoostVolume,
  En,
  lg,
  Xd
} from '../audio/GameAudioSubsystem.js';
import {
  THEMES,
  DEFAULT_THEME,
  getTheme,
  setTheme,
  onThemeChange
} from './ThemeManager.js';

// --- 1. Diagnostics / Status Settings ---
export const STATUS_SETTING_ITEMS = Object.freeze([
  { key: "fps", label: "FPS Counter", note: "Current frames per second and screen refresh rate." },
  { key: "frame", label: "Frame Time", note: "Average with p50, p95, p99 and the worst frame." },
  { key: "chart", label: "History Plot", note: "Recent frame times against the display's budget." },
  { key: "phases", label: "Time Breakdown", note: "CPU cost of sim, scene, camera, prep and the render passes." },
  { key: "sim", label: "Simulation", note: "Tick rate, and ticks dropped when the loop falls behind." },
  { key: "renderer", label: "Renderer", note: "Draw calls, triangles, and resident geometry and textures." }
]);

export const DEFAULT_STATUS_SETTINGS = Object.freeze({
  enabled: true,
  fps: true,
  frame: false,
  chart: false,
  phases: false,
  sim: false,
  renderer: false,
  phasesCollapsed: false
});

export const statusSettingsStore = createLocalStorageStore(
  "car-soccer.status-settings.v1",
  () => ({ ...DEFAULT_STATUS_SETTINGS }),
  (target, source) => {
    target.enabled = booleanOrDefault(source.enabled, target.enabled);
    target.phasesCollapsed = booleanOrDefault(source.phasesCollapsed, target.phasesCollapsed);
    for (const item of STATUS_SETTING_ITEMS) {
      target[item.key] = booleanOrDefault(source[item.key], target[item.key]);
    }
  }
);

// --- 2. Graphics Settings ---
export const MIN_FPS = 60;
export const MAX_FPS = 240;

export function getDefaultRenderScale() {
  return 50;
}

export const DEFAULT_GRAPHICS_SETTINGS = Object.freeze({
  showStadium: false,
  limitFps: true,
  maxFps: 120,
  renderScale: getDefaultRenderScale()
});

export const graphicsSettingsStore = createLocalStorageStore(
  "car-soccer.graphics-settings.v2",
  () => ({ ...DEFAULT_GRAPHICS_SETTINGS }),
  (target, source) => {
    target.showStadium = booleanOrDefault(source.showStadiumDetails ?? source.showStadium, false);
    target.limitFps = booleanOrDefault(source.limitFps, target.limitFps);
    target.maxFps = clampNumberOrDefault(source.maxFps, target.maxFps, {
      min: MIN_FPS,
      max: MAX_FPS,
      integer: true
    });
    target.renderScale = clampNumberOrDefault(source.renderScale, target.renderScale ?? getDefaultRenderScale(), {
      min: 25,
      max: 100
    });
  }
);

// --- 3. Camera Settings ---
export const CAMERA_SETTINGS_STORAGE_KEY = "car-soccer.camera-settings.v1";

export const DEFAULT_CAMERA_SETTINGS = Object.freeze({
  cameraShake: false,
  fov: 110,
  distance: 270,
  height: 90,
  angleDeg: -4,
  stiffness: 1,
  swivelSpeed: 10,
  transitionSpeed: 1.9,
  invertSwivel: true
});

export const CAMERA_RANGE_SETTINGS = Object.freeze([
  { key: "fov", label: "Field of View", min: 60, max: 110, step: 1, decimals: 0, suffix: "°" },
  { key: "distance", label: "Distance", min: 100, max: 400, step: 10, decimals: 2 },
  { key: "height", label: "Height", min: 40, max: 200, step: 10, decimals: 2 },
  { key: "angleDeg", label: "Angle", min: -15, max: 0, step: 1, decimals: 2, suffix: "°" },
  { key: "stiffness", label: "Stiffness", min: 0, max: 1, step: 0.05, decimals: 2 },
  { key: "swivelSpeed", label: "Swivel Speed", min: 1, max: 10, step: 0.1, decimals: 2 },
  { key: "transitionSpeed", label: "Transition Speed", min: 1, max: 2, step: 0.1, decimals: 2 }
]);

export const CAMERA_RANGE_SETTINGS_MAP = new Map(CAMERA_RANGE_SETTINGS.map(i => [i.key, i]));

export const CAMERA_SETTING_GROUPS = Object.freeze([
  {
    letter: "A",
    label: "Framing",
    note: "Adjust your view. Preview changes in the arena.",
    ranges: ["fov", "distance", "height", "angleDeg"],
    checks: []
  },
  {
    letter: "B",
    label: "Response",
    note: "How the camera follows your car.",
    ranges: ["stiffness", "swivelSpeed", "transitionSpeed"],
    checks: [
      { key: "cameraShake", label: "Camera Shake", note: "Feel the impact of hits and landings." },
      { key: "invertSwivel", label: "Invert Swivel", note: "Reverses vertical camera look in ball cam and car cam." }
    ]
  }
]);

export const cameraSettingsStore = createLocalStorageStore(
  CAMERA_SETTINGS_STORAGE_KEY,
  () => ({ ...DEFAULT_CAMERA_SETTINGS }),
  (target, source) => {
    for (const key of Object.keys(DEFAULT_CAMERA_SETTINGS)) {
      const defVal = DEFAULT_CAMERA_SETTINGS[key];
      if (typeof defVal === "boolean") {
        target[key] = booleanOrDefault(source[key], defVal);
      } else if (typeof defVal === "number") {
        const meta = CAMERA_RANGE_SETTINGS_MAP.get(key);
        target[key] = clampNumberOrDefault(source[key], defVal, meta ? { min: meta.min, max: meta.max } : {});
      }
    }
  }
);

// --- 4. Training Settings ---
export const TRAINING_SETTINGS_STORAGE_KEY = "car-soccer.training-settings.v1";
export const BOOST_OPTIONS = Object.freeze(["unlimited", "standard"]);

export const DEFAULT_TRAINING_SETTINGS = Object.freeze({
  disableGoalReset: false,
  boostOption: "unlimited",
  showCarHitbox: false
});

export const trainingSettingsStore = createLocalStorageStore(
  TRAINING_SETTINGS_STORAGE_KEY,
  () => ({ ...DEFAULT_TRAINING_SETTINGS }),
  (target, source) => {
    target.disableGoalReset = booleanOrDefault(source.disableGoalReset, target.disableGoalReset);
    target.boostOption = stringOrDefault(source.boostOption, BOOST_OPTIONS, target.boostOption);
    target.showCarHitbox = booleanOrDefault(source.showCarHitbox, target.showCarHitbox);
  }
);

// --- 5. Tabs and Axis Options ---
export const SETTINGS_TABS = Object.freeze(["camera", "controls", "graphics", "audio", "training", "diagnostics"]);
export const STICK_AXIS_OPTIONS = Object.freeze([0, 1, 2, 3]);

// --- 6. HTML Render Helpers ---
export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&#39;";
    }
  });
}

export function renderCameraRangeInput(item) {
  if (!item) return "";
  return `
    <div class="dim" data-dim-row="${item.key}">
      <label class="dim__label" for="camera-${item.key}">${item.label}</label>
      <span class="dim__leader" aria-hidden="true"></span>
      <span class="dim__control">
        <input
          id="camera-${item.key}"
          class="dim__line"
          type="range"
          min="${item.min}"
          max="${item.max}"
          step="${item.step}"
          data-camera-setting="${item.key}"
        />
      </span>
      <output class="figure" data-value-for="${item.key}" for="camera-${item.key}"></output>
    </div>
  `;
}

export function renderCheckboxDim(key, label, note, prefix) {
  const id = `${prefix}-${key}`;
  return `
    <div class="dim dim--flag">
      <label class="dim__label" for="${id}">${label}</label>
      <span class="dim__leader" aria-hidden="true"></span>
      <span class="dim__control dim__control--flag">
        <input id="${id}" class="tick" type="checkbox" data-${prefix}-setting="${key}" />
        <span class="tick__mark" aria-hidden="true"></span>
        <span class="dim__note">${note}</span>
      </span>
    </div>
  `;
}

export function renderBindingChip(device, action, slot, binding, padLayout) {
  const devLabel = device === "keyboard" ? "keyboard / mouse" : "controller";
  return binding ? `
    <span class="chip-pair">
      <button class="chip" type="button"
              data-bind-device="${device}" data-bind-action="${action}" data-bind-slot="${slot}"
              aria-label="Change ${devLabel} binding for ${getActionLabel(action)}, currently ${escapeHtml(formatBindingDisplayName(binding, padLayout))}">
        ${escapeHtml(formatBindingDisplayName(binding, padLayout))}
      </button>
      <button class="chip__clear" type="button"
              data-clear-device="${device}" data-clear-action="${action}" data-clear-slot="${slot}"
              aria-label="Remove ${escapeHtml(formatBindingDisplayName(binding, padLayout))} from ${getActionLabel(action)}">
        <span aria-hidden="true">×</span>
      </button>
    </span>
  ` : `
      <button class="chip chip--empty" type="button"
              data-bind-device="${device}" data-bind-action="${action}" data-bind-slot="${slot}"
              aria-label="Add ${devLabel} binding for ${getActionLabel(action)}">
        <span aria-hidden="true">+</span>
      </button>
  `;
}

/**
 * SettingsSheet
 * Master Modal Controller for all Game Configuration.
 */
export class SettingsSheet {
  constructor(container, target, trainingTarget, bindings, onOpenChange, onTrainingChange, onBindingsChange, onCaptureChange) {
    this.overlay = null;
    this.sheet = null;
    this.touchPanel = null;
    this.target = target;
    this.trainingTarget = trainingTarget;
    this.bindings = bindings;
    this.onOpenChange = onOpenChange;
    this.onTrainingChange = onTrainingChange;
    this.onBindingsChange = onBindingsChange;
    this.onCaptureChange = onCaptureChange;

    this.openState = false;
    this.activeTab = "camera";
    this.padLayout = "xbox";
    this.capture = null;
    this.capturedMouseButton = null;
    this.capturePoll = 0;
    this.capturePrevButtons = [];
    this.capturePrevAxes = [];
    this.capturePadKey = null;
    this.padNavKey = null;
    this.padNavWaitForNeutral = false;
    this.padNavPoll = 0;
    this.padNavPrev = [];
    this.padNavDir = null;
    this.padNavRepeatAt = 0;
    this.inputSource = "keyboard";
    this.asideMode = false;
    this.asidePinned = false;
    this.stopRendering = true;

    this.status = statusSettingsStore.load();
    this.onStatusChange = null;
    this.onStatusDetails = null;

    this.graphics = graphicsSettingsStore.load();
    this.onGraphicsChange = null;

    cameraSettingsStore.loadInto(this.target);
    trainingSettingsStore.loadInto(this.trainingTarget);

    const initialPad = this.firstPad();
    this.padLayout = detectControllerType(initialPad?.id);

    // Capture key/mouse handlers
    this.onCaptureKey = (e) => {
      if (this.capture) {
        if (e.preventDefault(), e.stopPropagation(), e.code === "Escape") {
          this.cancelCapture();
          this.setStatus("Capture cancelled.");
          return;
        }
        if (this.capture.device === "keyboard") {
          this.applyCapture({
            kind: "key",
            code: e.code
          });
        }
      }
    };

    this.onCaptureMouse = (e) => {
      if (!this.capture || this.capture.device !== "keyboard") return;
      e.preventDefault();
      e.stopPropagation();
      this.capturedMouseButton = e.button;
      this.applyCapture({
        kind: "mouse",
        button: e.button
      });
    };

    this.onCapturedMouseClick = (e) => {
      if (e.button === this.capturedMouseButton) {
        this.capturedMouseButton = null;
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };

    this.pollPadCapture = () => {
      if (!this.capture || this.capture.device !== "pad") return;
      const pad = this.firstPad();
      if (this.controllerKey(pad) !== this.capturePadKey) {
        this.cancelCapture();
        this.refreshPadStatus();
        this.setStatus("Controller changed. Select a binding to try again.");
        return;
      }
      if (pad) {
        for (let n = 0; n < pad.buttons.length; n++) {
          const pressed = pad.buttons[n]?.pressed ?? false;
          if (pressed && !this.capturePrevButtons[n]) {
            this.applyCapture({
              kind: "padButton",
              index: n
            });
            return;
          }
          this.capturePrevButtons[n] = pressed;
        }
        for (let n = 0; n < pad.axes.length; n++) {
          const axisVal = pad.axes[n] ?? 0;
          const prevVal = this.capturePrevAxes[n] ?? 0;
          this.capturePrevAxes[n] = axisVal;
          if (Math.abs(axisVal) > 0.7 && (Math.abs(prevVal) <= 0.7 || Math.sign(prevVal) !== Math.sign(axisVal))) {
            this.applyCapture({
              kind: "padAxis",
              axis: n,
              dir: axisVal > 0 ? 1 : -1
            });
            return;
          }
        }
      }
      this.capturePoll = requestAnimationFrame(this.pollPadCapture);
    };

    this.pollPadNav = (now) => {
      this.padNavPoll = requestAnimationFrame(this.pollPadNav);
      if (!this.openState || this.capture) return;
      const pad = this.firstPad();
      const key = this.controllerKey(pad);
      if (key !== this.padNavKey) {
        this.padNavKey = key;
        this.padNavPrev = (pad?.buttons ?? []).map(b => b.pressed);
        this.padNavDir = null;
        this.padNavWaitForNeutral = true;
        this.refreshPadStatus();
        return;
      }
      if (!pad) return;

      const isPressed = (btnIdx) => pad.buttons[btnIdx]?.pressed ?? false;
      const justPressed = (btnIdx) => {
        const cur = isPressed(btnIdx);
        const prev = this.padNavPrev[btnIdx] ?? false;
        this.padNavPrev[btnIdx] = cur;
        return cur && !prev;
      };

      if (justPressed(1)) {
        this.markPadNav();
        if (this.touchPanel?.isEditing) {
          this.touchPanel.cancel();
        } else {
          this.hide();
        }
        return;
      }
      if (justPressed(0)) {
        this.markPadNav();
        this.padActivate();
      }
      if (justPressed(4)) {
        this.markPadNav();
        this.stepTab(-1);
      }
      if (justPressed(5)) {
        this.markPadNav();
        this.stepTab(1);
      }

      const deadzone = 0.55;
      const axisX = pad.axes[0] ?? 0;
      const axisY = pad.axes[1] ?? 0;
      let dirV = (isPressed(13) ? 1 : 0) - (isPressed(12) ? 1 : 0);
      let dirH = (isPressed(15) ? 1 : 0) - (isPressed(14) ? 1 : 0);
      if (dirV === 0 && Math.abs(axisY) > deadzone) dirV = Math.sign(axisY);
      if (dirH === 0 && Math.abs(axisX) > deadzone) dirH = Math.sign(axisX);
      if (dirV !== 0) dirH = 0;

      const navKey = dirV !== 0 ? `v${dirV}` : dirH !== 0 ? `h${dirH}` : null;
      if (this.padNavWaitForNeutral) {
        if (navKey !== null) return;
        this.padNavWaitForNeutral = false;
      }
      if (navKey === null) {
        this.padNavDir = null;
        return;
      }
      if (navKey !== this.padNavDir) {
        this.padNavDir = navKey;
        this.padNavRepeatAt = now + 380;
      } else {
        if (now < this.padNavRepeatAt) return;
        this.padNavRepeatAt = now + 110;
      }
      this.markPadNav();
      if (dirV !== 0) {
        this.movePadFocus(dirV);
      } else {
        this.adjustFocused(dirH);
      }
    };

    // Inject HTML Structure
    container.insertAdjacentHTML("beforeend", `
      <div class="hud-tools">
        <button id="fullscreen-button" class="hud-tool" type="button"
                aria-label="Enter fullscreen" title="Fullscreen">
          <span data-el="fullscreenIcon">${renderIcon("expand")}</span>
        </button>
        <button id="settings-button" class="hud-tool" type="button"
                aria-label="Open settings" title="Settings">
          ${renderIcon("gear")}
        </button>
      </div>

      <div id="settings-overlay" class="sheet-overlay" hidden aria-hidden="true">
        <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title">
          <button class="sheet-handle" type="button" data-el="handle"
                  aria-pressed="false" aria-label="Move the sheet aside to see the arena">
            <span class="sheet-handle__grip" aria-hidden="true"></span>
            <span class="sheet-handle__arrow">${renderIcon("arrow-right", 19)}</span>
          </button>
          <header class="sheet-head">
            <div class="sheet-head__ident">
              ${renderIcon("gear", 32)}<h1 id="settings-title">Settings</h1>
            </div>
            <div class="sheet-head__actions" style="display:flex;align-items:center;gap:16px;margin-left:auto;">
              <label class="stop-rendering-toggle" style="display:inline-flex;align-items:center;gap:8px;cursor:pointer;user-select:none;font-size:13px;font-weight:600;color:var(--graphite-2);font-family:var(--sans);" title="Pause 3D scene rendering while Settings is open to save power. Uncheck to preview graphics/camera changes live.">
                <input type="checkbox" id="settings-stop-rendering" checked style="appearance:checkbox;-webkit-appearance:checkbox;accent-color:var(--mark);width:18px;height:18px;cursor:pointer;opacity:1;position:static;" />
                <span>Stop Rendering</span>
              </label>
              <button class="sheet-head__close" type="button" data-settings-close
                      aria-label="Close settings">
                ${renderIcon("x")}
              </button>
            </div>
          </header>

          <nav class="sheet-tabs" aria-label="Settings categories" role="tablist">
            <span class="tab-hint" data-el="hintPrev" aria-hidden="true" hidden></span>
            ${[
              ["camera", "Camera", "camera"],
              ["controls", "Controls", "game-controller"],
              ["graphics", "Graphics", "monitor"],
              ["audio", "Audio", "speaker"],
              ["training", "Training", "target"],
              ["diagnostics", "Status", "chart"]
            ].map(([c, h, d]) => `
              <button id="settings-tab-${c}" class="sheet-tab${c === "camera" ? " is-active" : ""}"
                      type="button" role="tab" aria-selected="${c === "camera"}"
                      aria-controls="settings-panel-${c}" data-settings-tab="${c}">
                ${renderIcon(d, 24)}
                <span class="sheet-tab__name">${h}</span>
              </button>
            `).join("")}
            <span class="tab-hint tab-hint--next" data-el="hintNext" aria-hidden="true" hidden></span>
          </nav>

          <div class="sheet-body">
            <section id="settings-panel-camera" class="sheet-panel" role="tabpanel"
                     aria-labelledby="settings-tab-camera" data-settings-panel="camera" tabindex="0">
              ${CAMERA_SETTING_GROUPS.map(c => `
                <section class="zone">
                  <header class="zone__head">
                    <span class="zone__letter" aria-hidden="true">${c.letter}</span>
                    <h2 class="zone__label">${c.label}</h2>
                    <p class="zone__note">${c.note}</p>
                  </header>
                  <div class="zone__rows">
                    ${c.ranges.map(h => renderCameraRangeInput(CAMERA_RANGE_SETTINGS_MAP.get(h))).join("")}
                    ${c.checks.map(h => renderCheckboxDim(h.key, h.label, h.note, "camera")).join("")}
                  </div>
                </section>
              `).join("")}
            </section>

            <section id="settings-panel-controls" class="sheet-panel" role="tabpanel"
                     aria-labelledby="settings-tab-controls" data-settings-panel="controls" tabindex="0" hidden>
              <details class="touch-settings-section" ${typeof navigator !== "undefined" && (navigator.maxTouchPoints > 0 || (typeof window !== "undefined" && window.matchMedia?.("(any-pointer: coarse)").matches)) ? "open" : ""}>
                <summary>Touch controls<span>Edit layout and add extra buttons</span></summary>
                <div id="touch-settings-panel"></div>
              </details>
              <p class="panel-lede">
                Click any binding, then press the key, mouse button, controller
                button, or stick direction that should drive it. Esc cancels.
                The same input can be assigned to multiple actions.
              </p>
              <div class="controller-choice">
                <label for="controller-input" class="parts-head__title">Controller input</label>
                <select id="controller-input" class="pick" aria-describedby="controller-input-note"></select>
                <p id="controller-input-note">Choose the device for driving, menus, and bindings. Press a button on your controller if it is missing.</p>
              </div>
              <div class="parts-head">
                <h3 id="parts-title" class="parts-head__title">Control assignments</h3>
                <span class="parts__pad" data-el="padStatus">No controller detected</span>
              </div>
              <div class="parts-wrap">
                <table class="parts" aria-labelledby="parts-title">
                  <thead>
                    <tr>
                      <th scope="col" class="parts__col-item">Item</th>
                      <th scope="col">Action</th>
                      <th scope="col">Keyboard / Mouse</th>
                      <th scope="col">Controller</th>
                    </tr>
                  </thead>
                  <tbody data-el="partsBody"></tbody>
                </table>
              </div>

              <section class="zone">
                <header class="zone__head">
                  <span class="zone__letter" aria-hidden="true">S</span>
                  <h2 class="zone__label">Stick Roles</h2>
                  <p class="zone__note">Sticks steer and pitch as analog axes, the way the game does.</p>
                </header>
                <div class="zone__rows" data-el="axisRows"></div>
              </section>
            </section>

            <section id="settings-panel-graphics" class="sheet-panel" role="tabpanel"
                     aria-labelledby="settings-tab-graphics" data-settings-panel="graphics" tabindex="0" hidden>
              <section class="zone">
                <header class="zone__head">
                  <h2 class="zone__label" id="theme-heading">Theme</h2>
                </header>
                <p class="panel-lede" id="theme-description">
                  Choose the look of the arena, cars, effects, and interface. Your choice is saved.
                </p>
                <div class="theme-options" role="group" aria-label="Game theme" aria-describedby="theme-description">
                  ${[
                    ["realistic", "Realistic", "Detailed textures, pearl paint, the original ball, and a modern UI."],
                    ["arcade", "Arcade", "Painted materials, bold colors, and playful game UI."]
                  ].map(([c, h, d]) => `
                    <button type="button" class="theme-option theme-option--${c}" data-theme-option="${c}"
                            aria-label="${h} theme" aria-pressed="${getTheme() === c}" aria-describedby="theme-description-${c}">
                      <span class="theme-option__sample" aria-hidden="true">
                        ${renderIcon("car-profile", 72)}
                        <span class="theme-option__palette"><i></i><i></i><i></i></span>
                      </span>
                      <span class="theme-option__body">
                        <span class="theme-option__heading"><span class="theme-option__name">${h}</span>${c === DEFAULT_THEME ? '<span class="theme-option__default">Default</span>' : ""}</span>
                        <span class="theme-option__description" id="theme-description-${c}">${d}</span>
                        <span class="theme-option__selection">${renderIcon("check", 17)}<span data-theme-selection>${getTheme() === c ? "Selected" : "Choose theme"}</span></span>
                      </span>
                    </button>
                  `).join("")}
                </div>
              </section>
              <section class="zone">
                <header class="zone__head">
                  <h2 class="zone__label">Frame Rate</h2>
                  <p class="zone__note">Choose how much rendering power to use.</p>
                </header>
                <div class="zone__rows">
                  ${renderCheckboxDim("limitFps", "Limit FPS", "Reduce GPU usage by capping the frame rate.", "graphics")}
                  <div class="dim" data-dim-row="maxFps">
                    <label class="dim__label" for="graphics-maxFps">Maximum FPS</label>
                    <span class="dim__leader" aria-hidden="true"></span>
                    <span class="dim__control">
                      <input id="graphics-maxFps" class="dim__line" type="range"
                             min="${MIN_FPS}" max="${MAX_FPS}" step="1" data-graphics-setting="maxFps" />
                    </span>
                    <output class="figure" data-graphics-value-for="maxFps" for="graphics-maxFps"></output>
                  </div>
                </div>
              </section>
              <section class="zone">
                <header class="zone__head">
                  <h2 class="zone__label">Resolution</h2>
                  <p class="zone__note">Adjust internal rendering scale to balance sharpness and GPU performance.</p>
                </header>
                <div class="zone__rows">
                  <div class="dim" data-dim-row="renderScale">
                    <label class="dim__label" for="graphics-renderScale">Render Scale</label>
                    <span class="dim__leader" aria-hidden="true"></span>
                    <span class="dim__control">
                      <input id="graphics-renderScale" class="dim__line" type="range"
                             min="25" max="100" step="0.1" data-graphics-setting="renderScale" />
                    </span>
                    <output class="figure" data-graphics-value-for="renderScale" for="graphics-renderScale">50.0%</output>
                  </div>
                </div>
              </section>
              <section class="zone">
                <header class="zone__head">
                  <span class="zone__letter" aria-hidden="true">S</span>
                  <h2 class="zone__label">Scenery</h2>
                  <p class="zone__note">The surroundings outside the playable arena.</p>
                </header>
                <div class="zone__rows">
                  ${renderCheckboxDim("showStadium", "Show Stadium Details", "Draws the stands, roof, lights, and exterior stadium architecture.", "graphics")}
                </div>
              </section>
            </section>

            <section id="settings-panel-audio" class="sheet-panel" role="tabpanel"
                     aria-labelledby="settings-tab-audio" data-settings-panel="audio" tabindex="0" hidden>
              <p class="panel-lede">
                Set the overall output level for every game sound. Changes take
                effect immediately and are remembered for the next session.
              </p>
              <section class="zone">
                <header class="zone__head">
                  <span class="zone__letter" aria-hidden="true">A</span>
                  <h2 class="zone__label">Master Output</h2>
                  <p class="zone__note">One level for vehicle, impact, boost, and event audio.</p>
                </header>
                <div class="zone__rows">
                  <div class="dim" data-dim-row="masterVolume">
                    <label class="dim__label" for="audio-master-volume">Overall Volume</label>
                    <span class="dim__leader" aria-hidden="true"></span>
                    <span class="dim__control">
                      <input id="audio-master-volume" class="dim__line" type="range"
                             min="0" max="100" step="1" data-audio-setting="masterVolume" />
                    </span>
                    <output class="figure" data-audio-value-for="masterVolume"
                            for="audio-master-volume"></output>
                  </div>
                  <div class="dim" data-dim-row="engineVolume">
                    <label class="dim__label" for="audio-engine-volume">Engine Audio Sound</label>
                    <span class="dim__leader" aria-hidden="true"></span>
                    <span class="dim__control">
                      <input id="audio-engine-volume" class="dim__line" type="range"
                             min="0" max="100" step="1" data-audio-setting="engineVolume" />
                    </span>
                    <output class="figure" data-audio-value-for="engineVolume"
                            for="audio-engine-volume"></output>
                  </div>
                  <div class="dim" data-dim-row="boostVolume">
                    <label class="dim__label" for="audio-boost-volume">Boost Effect Audio Volume</label>
                    <span class="dim__leader" aria-hidden="true"></span>
                    <span class="dim__control">
                      <input id="audio-boost-volume" class="dim__line" type="range"
                             min="0" max="100" step="1" data-audio-setting="boostVolume" />
                    </span>
                    <output class="figure" data-audio-value-for="boostVolume"
                            for="audio-boost-volume"></output>
                  </div>
                </div>
              </section>
            </section>

            <section id="settings-panel-diagnostics" class="sheet-panel" role="tabpanel"
                     aria-labelledby="settings-tab-diagnostics" data-settings-panel="diagnostics"
                     tabindex="0" hidden>
              <p class="panel-lede">
                The status overlay draws in the top-left corner while you play.
                These options decide what is shown.
              </p>
              <section class="zone">
                <header class="zone__head">
                  <span class="zone__letter" aria-hidden="true">O</span>
                  <h2 class="zone__label">Overlay</h2>
                  <p class="zone__note">What the corner readout carries.</p>
                </header>
                <div class="status-master">
                  ${renderCheckboxDim("enabled", "Show Status Overlay", "Draws the readout over the game.", "status")}
                  <button class="act status-open-details" type="button" data-status-details disabled>View status details</button>
                </div>
                <div class="zone__rows">
                  ${STATUS_SETTING_ITEMS.map(c => renderCheckboxDim(c.key, c.label, c.note, "status")).join("")}
                </div>
              </section>
            </section>

            <section id="settings-panel-training" class="sheet-panel" role="tabpanel"
                     aria-labelledby="settings-tab-training" data-settings-panel="training" tabindex="0" hidden>
              <section class="zone">
                <header class="zone__head">
                  <span class="zone__letter" aria-hidden="true">F</span>
                  <h2 class="zone__label">Free Play</h2>
                  <p class="zone__note">Session rules for practice.</p>
                </header>
                <div class="zone__rows">
                  ${renderCheckboxDim("disableGoalReset", "Disable Restart on Goal", "Play on after the ball goes in.", "training")}
                  <div class="dim">
                    <label class="dim__label" for="training-boost-option">Boost</label>
                    <span class="dim__leader" aria-hidden="true"></span>
                    <span class="dim__control">
                      <select id="training-boost-option" class="pick" data-training-setting="boostOption">
                        <option value="unlimited">Unlimited</option>
                        <option value="standard">Standard</option>
                      </select>
                    </span>
                  </div>
                  ${renderCheckboxDim("showCarHitbox", "Show Car Hitbox", "Draws the collision box around the car.", "training")}
                  <div class="dim">
                    <label class="dim__label" for="open-trajectory-panel-btn">Ball Trajectory</label>
                    <span class="dim__leader" aria-hidden="true"></span>
                    <span class="dim__control">
                      <button class="act" type="button" id="open-trajectory-panel-btn">Configure Trajectory...</button>
                    </span>
                  </div>
                </div>
              </section>
            </section>
          </div>

          <footer class="title-block">
            <div class="title-block__info">
              <a class="title-block__credit" href="https://x.com/xthomasms" target="_blank" rel="noopener noreferrer"
                 aria-label="Follow @xthomasms on X (opens in a new tab)">Made by @xthomasms <span aria-hidden="true">↗</span></a>
              <p class="title-block__status" data-el="status" role="status" aria-live="polite"></p>
            </div>
            <p class="pad-legend" data-el="padLegend" aria-hidden="true" hidden></p>
            <div class="title-block__actions">
              <button class="act" type="button" data-settings-defaults>Restore defaults</button>
              <button class="act act--primary" type="button" data-settings-close>Done</button>
            </div>
          </footer>
        </section>
      </div>
    `);

    this.overlay = container.querySelector("#settings-overlay");
    this.sheet = this.overlay?.querySelector(".sheet") ?? null;

    // Stop rendering listener
    const sr = this.overlay?.querySelector("#settings-stop-rendering");
    if (sr) {
      sr.addEventListener("change", () => {
        this.stopRendering = sr.checked;
        if (!this.stopRendering && typeof globalThis.renderer !== "undefined" && globalThis.renderer?.shadowMap) {
          globalThis.renderer.shadowMap.needsUpdate = true;
        }
      });
    }

    // Touch controls layout editor panel
    const touchContainer = this.overlay?.querySelector("#touch-settings-panel");
    if (touchContainer) {
      this.touchPanel = new TouchLayoutEditor(touchContainer, (isEditing) => {
        this.setAside(false, false);
        this.overlay?.classList.toggle("is-touch-editing", isEditing);
      });
    }

    this.sheet?.addEventListener("keydown", (e) => {
      if (e.code === "Escape" && this.touchPanel?.isEditing) {
        e.preventDefault();
        e.stopPropagation();
        this.touchPanel.cancel();
      }
    });

    this.renderParts();
    this.renderAxisRows();

    // Toolbar buttons
    container.querySelector("#settings-button")?.addEventListener("click", () => this.show());
    container.querySelector("#fullscreen-button")?.addEventListener("click", () => this.toggleFullscreen());
    if (typeof document !== "undefined") {
      document.addEventListener("fullscreenchange", () => this.syncFullscreenButton());
    }

    // Overlay controls
    this.overlay?.querySelectorAll("[data-settings-close]").forEach(btn => {
      btn.addEventListener("click", () => this.hide());
    });
    this.overlay?.addEventListener("mousedown", (e) => {
      if (e.target === this.overlay) this.hide();
    });
    this.overlay?.querySelector("[data-settings-defaults]")?.addEventListener("click", () => this.restoreDefaults());

    // Camera sliders
    this.overlay?.querySelectorAll("[data-camera-setting]").forEach(input => {
      const handler = () => {
        this.setAside(true, false);
        this.updateCameraSetting(input);
      };
      input.addEventListener("input", handler);
      input.addEventListener("change", handler);
    });

    // Training settings
    this.overlay?.querySelectorAll("[data-training-setting]").forEach(input => {
      input.addEventListener("change", () => {
        this.setAside(false, false);
        this.updateTrainingSetting(input);
      });
    });

    // Ball trajectory panel toggle button
    const tb = this.overlay?.querySelector("#open-trajectory-panel-btn");
    if (tb) {
      tb.addEventListener("click", () => {
        this.hide();
        if (typeof globalThis.trajectoryPredictor !== "undefined" && globalThis.trajectoryPredictor) {
          globalThis.trajectoryPredictor.togglePanel(true);
        }
      });
    }

    // Audio sliders
    this.overlay?.querySelectorAll("[data-audio-setting]").forEach(input => {
      const handler = () => {
        this.setAside(false, false);
        this.updateAudioSetting(input);
      };
      input.addEventListener("input", handler);
      input.addEventListener("change", handler);
    });

    // Diagnostics / status settings
    this.overlay?.querySelectorAll("[data-status-setting]").forEach(input => {
      input.addEventListener("change", () => {
        this.setAside(false, false);
        this.updateStatusSetting(input);
      });
    });
    this.overlay?.querySelector("[data-status-details]")?.addEventListener("click", () => {
      if (!this.status.enabled || !this.onStatusDetails) return;
      this.hide();
      this.onStatusDetails();
    });

    // Graphics settings
    this.overlay?.querySelectorAll("[data-graphics-setting]").forEach(input => {
      const handler = () => {
        this.setAside(false, false);
        this.updateGraphicsSetting(input);
      };
      if (input.type === "range") input.addEventListener("input", handler);
      input.addEventListener("change", handler);
    });

    // Drawer handle
    this.overlay?.querySelector('[data-el="handle"]')?.addEventListener("click", () => {
      this.setAside(!this.asideMode, true);
    });

    // Theme options
    this.overlay?.querySelectorAll("[data-theme-option]").forEach(btn => {
      btn.addEventListener("click", () => {
        const themeChoice = btn.dataset.themeOption;
        setTheme(themeChoice);
        this.setStatus(`${themeChoice === "arcade" ? "Arcade" : "Realistic"} theme selected.`);
      });
    });

    onThemeChange((currentTheme) => {
      this.overlay?.querySelectorAll("[data-theme-option]").forEach(btn => {
        const isSelected = btn.dataset.themeOption === currentTheme;
        btn.setAttribute("aria-pressed", String(isSelected));
        const selText = btn.querySelector("[data-theme-selection]");
        if (selText) selText.textContent = isSelected ? "Selected" : "Choose theme";
      });
    });

    // Tab navigation
    this.overlay?.querySelectorAll("[data-settings-tab]").forEach(btn => {
      btn.addEventListener("click", () => {
        const tabKey = btn.dataset.settingsTab;
        if (tabKey) this.selectTab(tabKey);
      });
    });

    // Key rebind click delegation
    this.overlay?.addEventListener("click", (e) => {
      const bindBtn = e.target?.closest?.("[data-bind-action]");
      if (bindBtn) {
        this.setAside(false, false);
        this.beginCapture(bindBtn.dataset.bindDevice, bindBtn.dataset.bindAction, Number(bindBtn.dataset.bindSlot));
        return;
      }
      const clearBtn = e.target?.closest?.("[data-clear-action]");
      if (clearBtn) {
        this.clearBindingAt(clearBtn.dataset.clearDevice, clearBtn.dataset.clearAction, Number(clearBtn.dataset.clearSlot));
      }
    });

    this.sheet?.addEventListener("keydown", (e) => this.trapFocus(e));

    // Controller selector change
    this.overlay?.querySelector("#controller-input")?.addEventListener("change", (e) => {
      const val = e.target.value;
      const pad = getConnectedGamepads().find(p => p?.connected && String(p.index) === val);
      if (val === "auto" || pad) {
        setSelectedController(pad ?? null);
      } else {
        this.refreshPadStatus();
      }
    });

    // Window events
    if (typeof window !== "undefined") {
      window.addEventListener("controllerselectionchanged", () => {
        this.cancelCapture();
        const pad = this.firstPad();
        const key = this.controllerKey(pad);
        if (key !== this.padNavKey) {
          this.padNavKey = key;
          this.padNavPrev = (pad?.buttons ?? []).map(b => b.pressed);
          this.padNavDir = null;
          this.padNavWaitForNeutral = true;
        }
        this.refreshPadStatus();
      });

      window.addEventListener("gamepadconnected", () => this.refreshPadStatus());
      window.addEventListener("gamepaddisconnected", () => this.refreshPadStatus());
      window.addEventListener("keydown", () => {
        this.capturedMouseButton = null;
        this.setInputSource("keyboard");
      }, true);
      window.addEventListener("mousedown", () => {
        this.capturedMouseButton = null;
        this.setInputSource("keyboard");
      }, true);
      window.addEventListener("click", this.onCapturedMouseClick, true);
      window.addEventListener("auxclick", this.onCapturedMouseClick, true);
      window.addEventListener(Xd, () => this.syncAudioControls());
    }

    this.syncCameraControls();
    this.syncAudioControls();
    this.syncTrainingControls();
    this.syncGraphicsControls();
    this.refreshPadStatus();

    this.onTrainingChange?.(this.trainingTarget);
    this.onBindingsChange?.(this.bindings);
  }

  get isOpen() {
    return this.openState;
  }

  toggleFullscreen() {
    if (typeof document === "undefined") return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {
        this.setStatus("Fullscreen was refused by the browser.");
      });
    }
  }

  syncFullscreenButton() {
    if (typeof document === "undefined") return;
    const btn = document.querySelector("#fullscreen-button");
    const icon = btn?.querySelector('[data-el="fullscreenIcon"]');
    if (!btn || !icon) return;
    const isFull = !!document.fullscreenElement;
    btn.setAttribute("aria-label", isFull ? "Exit fullscreen" : "Enter fullscreen");
    btn.title = isFull ? "Exit fullscreen" : "Fullscreen";
    icon.innerHTML = renderIcon(isFull ? "collapse" : "expand");
  }

  toggle() {
    if (this.openState) {
      this.hide();
    } else {
      this.show();
    }
  }

  show() {
    this.stopRendering = true;
    const srEl = this.overlay?.querySelector("#settings-stop-rendering");
    if (srEl) srEl.checked = true;

    if (!this.openState) {
      this.openState = true;
      if (this.overlay) {
        this.overlay.hidden = false;
        this.overlay.setAttribute("aria-hidden", "false");
      }
      if (typeof document !== "undefined") {
        document.body.classList.add("settings-open");
      }
      this.onOpenChange?.(true);
      requestAnimationFrame(() => {
        this.overlay?.classList.add("is-open");
      });
      this.focusPanelStart();
      this.refreshPadStatus();
      if (typeof document !== "undefined") {
        document.body.classList.toggle("pad-nav", this.inputSource === "pad");
      }
      this.updatePadHints();
      this.startPadNav();
    }
  }

  hide() {
    if (this.openState) {
      this.touchPanel?.cancel();
      this.cancelCapture();
      this.stopPadNav();
      this.asidePinned = false;
      this.setAside(false, false);
      this.openState = false;
      this.overlay?.classList.remove("is-open");
      this.overlay?.setAttribute("aria-hidden", "true");
      if (typeof document !== "undefined") {
        document.body.classList.remove("settings-open");
      }
      this.onOpenChange?.(false);
      setTimeout(() => {
        if (!this.openState && this.overlay) {
          this.overlay.hidden = true;
        }
      }, 180);
      if (typeof document !== "undefined") {
        document.querySelector("#settings-button")?.focus();
      }
    }
  }

  updateCameraSetting(input) {
    const key = input.dataset.cameraSetting;
    if (!key) return;
    if (input.type === "checkbox") {
      this.target[key] = input.checked;
    } else {
      const num = Number(input.value);
      if (!Number.isFinite(num)) return;
      this.target[key] = num;
    }
    this.updateRangePresentation(input);
    this.persistCamera();
  }

  syncCameraControls() {
    this.overlay?.querySelectorAll("[data-camera-setting]").forEach(input => {
      const key = input.dataset.cameraSetting;
      const val = this.target[key];
      if (input.type === "checkbox") {
        input.checked = !!val;
      } else {
        input.value = String(val);
      }
      this.updateRangePresentation(input);
    });
  }

  updateRangePresentation(input) {
    if (input.type !== "range") return;
    const key = input.dataset.cameraSetting;
    const meta = CAMERA_RANGE_SETTINGS_MAP.get(key);
    if (!meta) return;
    const val = Number(input.value);
    const progress = ((val - meta.min) / (meta.max - meta.min)) * 100;
    input.style.setProperty("--dim-progress", `${progress}%`);
    const output = this.overlay?.querySelector(`[data-value-for="${key}"]`);
    if (output) {
      output.value = `${val.toFixed(meta.decimals)}${meta.suffix ?? ""}`;
    }
  }

  updateAudioSetting(input) {
    const key = input.dataset.audioSetting;
    const val = Number(input.value);
    if (!Number.isFinite(val)) return;
    if (key === "masterVolume") setMasterVolume(val / 100);
    else if (key === "engineVolume") setEngineVolume(val / 100);
    else if (key === "boostVolume") setBoostVolume(val / 100);
    this.updateAudioRangePresentation(input);
  }

  syncAudioControls() {
    const s = getAudioSettings();
    this.overlay?.querySelectorAll("[data-audio-setting]").forEach(input => {
      const key = input.dataset.audioSetting;
      const v = key === "engineVolume" ? (s.engineVolume ?? 0.8) : key === "boostVolume" ? (s.boostVolume ?? 0.8) : s.masterVolume;
      input.value = String(Math.round(v * 100));
      this.updateAudioRangePresentation(input);
    });
  }

  updateAudioRangePresentation(input) {
    const val = Math.round(Number(input.value));
    input.style.setProperty("--dim-progress", `${val}%`);
    input.setAttribute("aria-valuetext", `${val} percent`);
    const key = input.dataset.audioSetting;
    const output = this.overlay?.querySelector(`[data-audio-value-for="${key}"]`);
    if (output) output.value = `${val}%`;
  }

  updateTrainingSetting(input) {
    const key = input.dataset.trainingSetting;
    if (!key) return;
    if (input instanceof HTMLInputElement && input.type === "checkbox") {
      this.trainingTarget[key] = input.checked;
    } else if (key === "boostOption" && (input.value === "unlimited" || input.value === "standard")) {
      this.trainingTarget.boostOption = input.value;
    }
    this.persistTraining();
    this.onTrainingChange?.(this.trainingTarget);
  }

  syncTrainingControls() {
    this.overlay?.querySelectorAll("[data-training-setting]").forEach(input => {
      const key = input.dataset.trainingSetting;
      const val = this.trainingTarget[key];
      if (input instanceof HTMLInputElement && input.type === "checkbox") {
        input.checked = !!val;
      } else {
        input.value = String(val);
      }
    });
  }

  firstPad() {
    return getEffectiveGamepad();
  }

  controllerKey(pad) {
    return pad ? JSON.stringify([pad.id, pad.index]) : null;
  }

  refreshPadStatus() {
    const pad = this.firstPad();
    if (this.capture?.device === "pad" && this.controllerKey(pad) !== this.capturePadKey) {
      this.cancelCapture();
      this.setStatus("Controller changed. Select a binding to try again.");
    }

    const selected = getSelectedController();
    const selectEl = this.overlay?.querySelector("#controller-input");
    const options = [new Option("Automatic (prefer game controller)", "auto")];
    for (const p of getConnectedGamepads()) {
      if (p?.connected) {
        options.push(new Option(`${p.id || "Controller"} · ${p.index + 1}`, String(p.index)));
      }
    }
    if (selected.id !== null && !pad) {
      const opt = new Option(`${selected.id} (disconnected)`, "disconnected");
      opt.disabled = true;
      options.push(opt);
    }
    if (selectEl) {
      selectEl.replaceChildren(...options);
      selectEl.value = selected.id === null ? "auto" : pad ? String(pad.index) : "disconnected";
    }

    this.padLayout = detectControllerType(pad?.id);
    const statusEl = this.overlay?.querySelector('[data-el="padStatus"]');
    if (statusEl) {
      statusEl.textContent = pad
        ? `${pad.id.replace(/\s*\(.*\)\s*/g, "").trim() || "Controller"} · ${this.padLayout === "playstation" ? "PlayStation" : "Xbox"} layout`
        : selected.id !== null ? "Selected controller disconnected" : "No controller detected";
      statusEl.classList.toggle("is-live", !!pad);
    }

    if (!this.capture) {
      this.renderParts();
    }
    this.updatePadHints();
  }

  renderParts() {
    const tbody = this.overlay?.querySelector('[data-el="partsBody"]');
    if (!tbody) return;
    let count = 0;
    const rows = [];
    for (const group of ACTION_GROUPS) {
      const groupActions = INPUT_ACTIONS.filter(a => a.group === group);
      if (groupActions.length === 0) continue;
      rows.push(`
        <tr class="parts__group">
          <th scope="rowgroup" colspan="4">${group}</th>
        </tr>
      `);
      for (const action of groupActions) {
        count++;
        const kbBinds = this.bindings.keyboard[action.id] || [];
        const padBinds = this.bindings.pad[action.id] || [];
        rows.push(`
          <tr data-action-row="${action.id}">
            <td class="parts__col-item">
              <span class="balloon">${String(count).padStart(2, "0")}</span>
            </td>
            <th scope="row" class="parts__desc">
              <span class="parts__name">${action.label}</span>
              <span class="parts__note">${action.note}</span>
            </th>
            <td class="parts__binds parts__binds--keyboard">
              ${this.slotMarkup("keyboard", action.id, kbBinds)}
            </td>
            <td class="parts__binds parts__binds--controller">
              ${this.slotMarkup("pad", action.id, padBinds)}
              ${this.axisHintFor(action.id)}
            </td>
          </tr>
        `);
      }
    }
    tbody.innerHTML = rows.join("");
  }

  slotMarkup(device, action, binds) {
    const chips = binds.map((b, idx) => renderBindingChip(device, action, idx, b, this.padLayout));
    if (binds.length < 2) {
      chips.push(renderBindingChip(device, action, binds.length, undefined, this.padLayout));
    }
    return chips.join("");
  }

  axisHintFor(actionId) {
    const { steer, pitch } = this.bindings.axes;
    const wrap = (s) => `<span class="axis-hint">${s}</span>`;
    const steerText = `${formatAxisName(steer.axis)}${steer.invert ? " (inv)" : ""}`;
    if (actionId === "steerLeft" || actionId === "steerRight") {
      return wrap(steerText);
    }
    if (actionId === "throttleForward" || actionId === "throttleReverse") {
      return wrap(`pitch: ${formatAxisName(pitch.axis)}${pitch.invert ? " (inv)" : ""}`);
    }
    if (actionId === "airRoll") {
      return wrap(`held: ${steerText} rolls`);
    }
    return "";
  }

  renderAxisRows() {
    const container = this.overlay?.querySelector('[data-el="axisRows"]');
    if (!container) return;
    const optBuilder = (selected) =>
      STICK_AXIS_OPTIONS.map(axisNum => `<option value="${axisNum}"${axisNum === selected ? " selected" : ""}>${formatAxisName(axisNum)}</option>`).join("");

    container.innerHTML = `
      <div class="dim">
        <label class="dim__label" for="axis-steer">Steer / Yaw Axis</label>
        <span class="dim__leader" aria-hidden="true"></span>
        <span class="dim__control">
          <select id="axis-steer" class="pick" data-axis-role="steer">${optBuilder(this.bindings.axes.steer.axis)}</select>
        </span>
      </div>
      ${renderCheckboxDim("steerInvert", "Invert Steer", "Flips the steering axis.", "axisflag")}
      <div class="dim">
        <label class="dim__label" for="axis-pitch">Pitch Axis</label>
        <span class="dim__leader" aria-hidden="true"></span>
        <span class="dim__control">
          <select id="axis-pitch" class="pick" data-axis-role="pitch">${optBuilder(this.bindings.axes.pitch.axis)}</select>
        </span>
      </div>
      ${renderCheckboxDim("pitchInvert", "Invert Pitch", "Stick up noses down when off.", "axisflag")}
      <div class="dim">
        <label class="dim__label" for="axis-deadzone">Stick Deadzone</label>
        <span class="dim__leader" aria-hidden="true"></span>
        <span class="dim__control">
          <input id="axis-deadzone" class="dim__line" type="range" min="0" max="0.5" step="0.01"
                 data-axis-number="deadzone" />
        </span>
        <output class="figure" data-axis-value="deadzone" for="axis-deadzone"></output>
      </div>
      <div class="dim">
        <label class="dim__label" for="axis-trigger">Trigger Threshold</label>
        <span class="dim__leader" aria-hidden="true"></span>
        <span class="dim__control">
          <input id="axis-trigger" class="dim__line" type="range" min="0.02" max="0.9" step="0.01"
                 data-axis-number="triggerThreshold" />
        </span>
        <output class="figure" data-axis-value="triggerThreshold" for="axis-trigger"></output>
      </div>
    `;

    container.querySelectorAll("[data-axis-role]").forEach(sel => {
      sel.addEventListener("change", () => {
        const role = sel.dataset.axisRole;
        this.bindings.axes[role].axis = Number(sel.value);
        this.commitBindings(`${role === "steer" ? "Steer" : "Pitch"} axis set to ${formatAxisName(Number(sel.value))}.`);
        this.renderParts();
      });
    });

    container.querySelectorAll("[data-axisflag-setting]").forEach(chk => {
      chk.addEventListener("change", () => {
        const flag = chk.dataset.axisflagSetting;
        if (flag === "steerInvert") this.bindings.axes.steer.invert = chk.checked;
        if (flag === "pitchInvert") this.bindings.axes.pitch.invert = chk.checked;
        this.commitBindings(chk.checked ? "Axis inverted." : "Axis restored.");
        this.renderParts();
      });
    });

    container.querySelectorAll("[data-axis-number]").forEach(input => {
      const handler = () => {
        const prop = input.dataset.axisNumber;
        const val = Number(input.value);
        if (Number.isFinite(val)) {
          this.bindings.axes[prop] = val;
          this.syncAxisControls();
          this.commitBindings();
        }
      };
      input.addEventListener("input", handler);
      input.addEventListener("change", handler);
    });

    this.syncAxisControls();
  }

  syncAxisControls() {
    const container = this.overlay?.querySelector('[data-el="axisRows"]');
    if (!container) return;
    const steerSel = container.querySelector('[data-axis-role="steer"]');
    if (steerSel) steerSel.value = String(this.bindings.axes.steer.axis);
    const pitchSel = container.querySelector('[data-axis-role="pitch"]');
    if (pitchSel) pitchSel.value = String(this.bindings.axes.pitch.axis);
    const steerChk = container.querySelector('[data-axisflag-setting="steerInvert"]');
    if (steerChk) steerChk.checked = this.bindings.axes.steer.invert;
    const pitchChk = container.querySelector('[data-axisflag-setting="pitchInvert"]');
    if (pitchChk) pitchChk.checked = this.bindings.axes.pitch.invert;

    for (const numKey of ["deadzone", "triggerThreshold"]) {
      const input = container.querySelector(`[data-axis-number="${numKey}"]`);
      const output = container.querySelector(`[data-axis-value="${numKey}"]`);
      const val = this.bindings.axes[numKey];
      if (input) {
        input.value = String(val);
        const minVal = Number(input.min);
        const maxVal = Number(input.max);
        input.style.setProperty("--dim-progress", `${((val - minVal) / (maxVal - minVal)) * 100}%`);
      }
      if (output) {
        output.value = val.toFixed(2);
      }
    }
  }

  beginCapture(device, action, slot) {
    this.cancelCapture();
    this.capture = { device, action, slot };
    this.onCaptureChange?.(true);

    const btn = this.overlay?.querySelector(`[data-bind-device="${device}"][data-bind-action="${action}"][data-bind-slot="${slot}"]`);
    if (btn) {
      btn.classList.add("is-capturing");
      btn.textContent = device === "keyboard" ? "press key / mouse…" : "press button…";
    }
    this.setStatus(device === "keyboard"
      ? `Listening for a key or mouse button for ${getActionLabel(action)}. Esc cancels.`
      : `Listening for a controller button or stick direction for ${getActionLabel(action)}. Esc cancels.`);

    if (device === "keyboard") {
      if (typeof window !== "undefined") {
        window.addEventListener("keydown", this.onCaptureKey, true);
        window.addEventListener("mousedown", this.onCaptureMouse, true);
      }
    } else {
      if (typeof window !== "undefined") {
        window.addEventListener("keydown", this.onCaptureKey, true);
      }
      const pad = this.firstPad();
      this.capturePrevButtons = (pad?.buttons ?? []).map(b => b.pressed);
      this.capturePrevAxes = [...(pad?.axes ?? [])];
      this.capturePadKey = this.controllerKey(pad);
      this.capturePoll = requestAnimationFrame(this.pollPadCapture);
    }
  }

  applyCapture(binding) {
    const c = this.capture;
    if (!c) return;
    const res = assignBinding(this.bindings, c.device, c.action, c.slot, binding);
    this.cancelCapture();
    if (!res.changed) {
      this.setStatus("Unchanged.");
      this.renderParts();
      return;
    }
    const name = formatBindingDisplayName(binding, this.padLayout);
    this.commitBindings(`${name} bound to ${getActionLabel(c.action)}.`);
    this.renderParts();
    const row = this.overlay?.querySelector(`[data-action-row="${c.action}"]`);
    if (row) {
      row.classList.add("is-changed");
      setTimeout(() => row.classList.remove("is-changed"), 900);
    }
  }

  cancelCapture() {
    if (!this.capture) return;
    const { device, action, slot } = this.capture;
    this.capture = null;
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", this.onCaptureKey, true);
      window.removeEventListener("mousedown", this.onCaptureMouse, true);
    }
    if (this.capturePoll) {
      cancelAnimationFrame(this.capturePoll);
      this.capturePoll = 0;
    }
    this.onCaptureChange?.(false);
    const pad = this.firstPad();
    this.padNavPrev = (pad?.buttons ?? []).map(b => b.pressed);

    const btn = this.overlay?.querySelector(`[data-bind-device="${device}"][data-bind-action="${action}"][data-bind-slot="${slot}"]`);
    btn?.classList.remove("is-capturing");
    this.renderParts();
  }

  clearBindingAt(device, action, slot) {
    const cur = this.bindings[device]?.[action]?.[slot];
    if (cur) {
      removeBinding(this.bindings, device, action, slot);
      this.commitBindings(`${formatBindingDisplayName(cur, this.padLayout)} removed from ${getActionLabel(action)}.`);
      this.renderParts();
    }
  }

  commitBindings(msg) {
    saveInputBindings(this.bindings);
    this.onBindingsChange?.(this.bindings);
    if (msg) this.setStatus(msg);
  }

  setStatus(msg) {
    const el = this.overlay?.querySelector('[data-el="status"]');
    if (el) el.textContent = msg;
  }

  attachGraphics(callback) {
    this.onGraphicsChange = callback;
    this.syncGraphicsControls();
    callback(this.graphics);
    return this.graphics;
  }

  updateGraphicsSetting(input) {
    const key = input.dataset.graphicsSetting;
    if (key === "showStadium" || key === "limitFps") {
      this.graphics[key] = input.checked;
    } else if (key === "maxFps") {
      this.graphics.maxFps = Math.round(Math.max(MIN_FPS, Math.min(MAX_FPS, input.valueAsNumber)));
    } else if (key === "renderScale") {
      this.graphics.renderScale = Math.round(Math.max(25, Math.min(100, input.valueAsNumber)) * 10) / 10;
    } else {
      return;
    }
    graphicsSettingsStore.save(this.graphics);
    this.onGraphicsChange?.(this.graphics);
    this.syncGraphicsControls();
  }

  syncGraphicsControls() {
    this.overlay?.querySelectorAll("[data-graphics-setting]").forEach(input => {
      const key = input.dataset.graphicsSetting;
      if (key === "showStadium" || key === "limitFps") {
        input.checked = this.graphics[key];
      } else if (key === "maxFps") {
        input.value = String(this.graphics.maxFps);
        input.disabled = !this.graphics.limitFps;
        input.setAttribute("aria-valuetext", `${this.graphics.maxFps} frames per second`);
        input.style.setProperty("--dim-progress", `${((this.graphics.maxFps - MIN_FPS) / (MAX_FPS - MIN_FPS)) * 100}%`);
        input.closest(".dim")?.classList.toggle("is-disabled", !this.graphics.limitFps);
      } else if (key === "renderScale") {
        const val = Number(this.graphics.renderScale ?? 50);
        input.value = val.toFixed(1);
        input.setAttribute("aria-valuetext", `${val.toFixed(1)}%`);
        input.style.setProperty("--dim-progress", `${((val - 25) / (100 - 25)) * 100}%`);
      }
    });

    const maxFpsEl = this.overlay?.querySelector('[data-graphics-value-for="maxFps"]');
    if (maxFpsEl) maxFpsEl.value = String(this.graphics.maxFps);
    const scaleEl = this.overlay?.querySelector('[data-graphics-value-for="renderScale"]');
    if (scaleEl) scaleEl.value = `${Number(this.graphics.renderScale ?? 50).toFixed(1)}%`;
  }

  attachStatus(onStatusChange, onStatusDetails) {
    this.onStatusChange = onStatusChange;
    this.onStatusDetails = onStatusDetails ?? null;
    this.syncStatusControls();
    return this.status;
  }

  updateStatusSetting(input) {
    const key = input.dataset.statusSetting;
    if (key) {
      this.status[key] = input.checked;
      statusSettingsStore.save(this.status);
      this.onStatusChange?.(this.status);
      this.syncStatusControls();
    }
  }

  syncStatusControls() {
    const detailsBtn = this.overlay?.querySelector("[data-status-details]");
    if (detailsBtn) {
      detailsBtn.disabled = !this.status.enabled || !this.onStatusDetails;
    }
    this.overlay?.querySelectorAll("[data-status-setting]").forEach(input => {
      const key = input.dataset.statusSetting;
      input.checked = !!this.status[key];
      if (key !== "enabled") {
        input.disabled = !this.status.enabled;
        input.closest(".dim")?.classList.toggle("is-disabled", !this.status.enabled);
      }
    });
  }

  setAside(aside, pinned) {
    if (pinned) {
      this.asidePinned = aside;
    } else if (this.asidePinned) {
      return;
    }
    if (this.asideMode === aside) return;
    this.asideMode = aside;
    this.overlay?.classList.toggle("is-aside", aside);
    const handle = this.overlay?.querySelector('[data-el="handle"]');
    if (handle) {
      handle.setAttribute("aria-pressed", String(aside));
      handle.setAttribute("aria-label", aside ? "Bring the sheet back to the centre" : "Move the sheet aside to see the arena");
    }
  }

  startPadNav() {
    if (!this.padNavPoll) {
      const pad = this.firstPad();
      this.padNavPrev = (pad?.buttons ?? []).map(b => b.pressed);
      this.padNavKey = this.controllerKey(pad);
      this.padNavDir = null;
      this.padNavPoll = requestAnimationFrame(this.pollPadNav);
    }
  }

  stopPadNav() {
    if (this.padNavPoll) {
      cancelAnimationFrame(this.padNavPoll);
      this.padNavPoll = 0;
      this.padNavDir = null;
    }
    if (typeof document !== "undefined") {
      document.body.classList.remove("pad-nav");
    }
  }

  setInputSource(source) {
    if (this.inputSource !== source) {
      this.inputSource = source;
      if (typeof document !== "undefined") {
        document.body.classList.toggle("pad-nav", source === "pad");
      }
      this.updatePadHints();
    }
  }

  markPadNav() {
    this.setInputSource("pad");
  }

  updatePadHints() {
    const isPS = this.padLayout === "playstation";
    const prevKey = isPS ? "L1" : "LB";
    const nextKey = isPS ? "R1" : "RB";
    const confirmKey = isPS ? "Cross" : "A";
    const closeKey = isPS ? "Circle" : "B";
    const isPad = this.inputSource === "pad";

    const prevEl = this.overlay?.querySelector('[data-el="hintPrev"]');
    const nextEl = this.overlay?.querySelector('[data-el="hintNext"]');
    if (prevEl) {
      prevEl.textContent = prevKey;
      prevEl.hidden = !isPad;
    }
    if (nextEl) {
      nextEl.textContent = nextKey;
      nextEl.hidden = !isPad;
    }

    const legendEl = this.overlay?.querySelector('[data-el="padLegend"]');
    if (legendEl) {
      legendEl.hidden = !isPad;
      legendEl.innerHTML = [
        ["D-pad", "Move"],
        ["← →", "Adjust"],
        [confirmKey, "Select"],
        [closeKey, "Close"]
      ].map(([c, h]) => `<span class="pad-legend__item"><kbd>${escapeHtml(c)}</kbd>${escapeHtml(h)}</span>`).join("");
    }
  }

  focusables() {
    if (!this.sheet) return [];
    return Array.from(this.sheet.querySelectorAll('button, summary, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
      .filter(el => !el.hasAttribute("disabled") && el.offsetParent !== null && !el.closest(".touch-preview"));
  }

  padFocusables() {
    return this.focusables().filter(el => el.dataset.settingsTab === undefined && el.dataset.settingsPanel === undefined);
  }

  movePadFocus(dir) {
    const list = this.padFocusables();
    if (list.length === 0) return;
    const idx = list.indexOf(document.activeElement);
    const nextIdx = idx === -1 ? (dir > 0 ? 0 : list.length - 1) : (idx + dir + list.length) % list.length;
    list[nextIdx].focus();
    list[nextIdx].scrollIntoView({ block: "nearest" });
  }

  focusPanelStart() {
    const panel = this.overlay?.querySelector(`[data-settings-panel="${this.activeTab}"]`);
    const target = (panel ? this.padFocusables().find(el => panel.contains(el)) : undefined) ?? this.overlay?.querySelector('[data-el="handle"]');
    target?.focus();
  }

  adjustFocused(dir) {
    const el = document.activeElement;
    if (el instanceof HTMLInputElement && el.type === "range") {
      const step = Number(el.step) || 1;
      const minVal = Number(el.min);
      const maxVal = Number(el.max);
      const nextVal = Math.max(minVal, Math.min(maxVal, Number(el.value) + dir * step));
      el.value = String(Math.round(nextVal / step) * step);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    if (el instanceof HTMLInputElement && el.type === "checkbox") {
      const checked = dir > 0;
      if (el.checked === checked) return;
      el.checked = checked;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    if (el instanceof HTMLSelectElement) {
      let idx = el.selectedIndex + dir;
      while (el.options[idx]?.disabled) {
        idx += dir;
      }
      if (idx < 0 || idx >= el.options.length) return;
      el.selectedIndex = idx;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    if (el instanceof HTMLElement && el.dataset.settingsTab) {
      this.stepTab(dir);
    }
  }

  padActivate() {
    const el = document.activeElement;
    if (el instanceof HTMLElement && this.sheet?.contains(el)) {
      el.click();
    }
  }

  stepTab(dir) {
    if (this.touchPanel?.isEditing) return;
    const idx = SETTINGS_TABS.indexOf(this.activeTab);
    const nextTab = SETTINGS_TABS[(idx + dir + SETTINGS_TABS.length) % SETTINGS_TABS.length];
    this.selectTab(nextTab);
    this.focusPanelStart();
  }

  restoreDefaults() {
    if (this.activeTab === "graphics") {
      setTheme(DEFAULT_THEME);
      Object.assign(this.graphics, graphicsSettingsStore.defaults());
      graphicsSettingsStore.save(this.graphics);
      this.syncGraphicsControls();
      this.onGraphicsChange?.(this.graphics);
      this.setStatus("Graphics and theme restored to defaults.");
      return;
    }
    if (this.activeTab === "camera") {
      Object.assign(this.target, DEFAULT_CAMERA_SETTINGS);
      this.syncCameraControls();
      this.persistCamera();
      this.setStatus("Camera restored to defaults.");
      return;
    }
    if (this.activeTab === "training") {
      Object.assign(this.trainingTarget, DEFAULT_TRAINING_SETTINGS);
      this.syncTrainingControls();
      this.persistTraining();
      this.onTrainingChange?.(this.trainingTarget);
      this.setStatus("Training restored to defaults.");
      return;
    }
    if (this.activeTab === "audio") {
      setMasterVolume(lg.masterVolume);
      this.syncAudioControls();
      this.setStatus("Audio restored to defaults.");
      return;
    }

    this.touchPanel?.restoreDefaults();
    resetDeviceBindings(this.bindings, "keyboard");
    resetDeviceBindings(this.bindings, "pad");
    resetAxisBindings(this.bindings);
    this.renderParts();
    this.syncAxisControls();
    this.commitBindings("All controls restored to defaults.");
  }

  selectTab(tab) {
    this.touchPanel?.cancel();
    this.cancelCapture();
    this.asidePinned = false;
    this.setAside(false, false);
    this.activeTab = tab;

    this.overlay?.querySelectorAll("[data-settings-tab]").forEach(btn => {
      const active = btn.dataset.settingsTab === tab;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", String(active));
      if (active) {
        btn.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    });

    this.overlay?.querySelectorAll("[data-settings-panel]").forEach(panel => {
      panel.hidden = panel.dataset.settingsPanel !== tab;
    });

    this.overlay?.querySelector(".sheet-body")?.scrollTo({ top: 0 });
    if (tab === "controls") {
      this.refreshPadStatus();
    }
  }

  trapFocus(e) {
    if (e.key !== "Tab" || this.capture) return;
    const focusable = this.focusables();
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  persistCamera() {
    cameraSettingsStore.save(this.target);
  }

  persistTraining() {
    trainingSettingsStore.save(this.trainingTarget);
  }
}

// Backward-compatibility aliases
export {
  SettingsSheet as BM,
  STATUS_SETTING_ITEMS as _g,
  statusSettingsStore as Yh,
  MIN_FPS as Ma,
  MAX_FPS as SA,
  graphicsSettingsStore as uA,
  CAMERA_SETTINGS_STORAGE_KEY as EM,
  DEFAULT_CAMERA_SETTINGS as Ps,
  CAMERA_RANGE_SETTINGS as bM,
  CAMERA_RANGE_SETTINGS_MAP as Zh,
  CAMERA_SETTING_GROUPS as SM,
  cameraSettingsStore as nm,
  TRAINING_SETTINGS_STORAGE_KEY as yM,
  BOOST_OPTIONS as xM,
  DEFAULT_TRAINING_SETTINGS as Kd,
  trainingSettingsStore as rm,
  SETTINGS_TABS as CM,
  STICK_AXIS_OPTIONS as wM,
  escapeHtml as Na,
  renderCameraRangeInput as MM,
  renderCheckboxDim as Pr,
  renderBindingChip as im
};
