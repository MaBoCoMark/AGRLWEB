/**
 * TouchControls.js
 * Mobile touch controller with on-screen virtual joystick, customizable button layouts,
 * training shortcuts, and full Touch Layout Editor UI.
 */

import {
  createLocalStorageStore,
  isPlainObject,
  booleanOrDefault,
  clampNumberOrDefault
} from "../utils/StorageHelper.js";
import { STORAGE_KEY_TOUCH_SETTINGS } from "./InputConstants.js";

export const TOUCH_SETTINGS_CHANGED_EVENT = "touchsettingschanged";
export const EXTRA_ROLL_ACTIONS = Object.freeze(["airRollLeft", "airRollRight", "airRoll"]);
export const TOUCH_ACTION_IDS = Object.freeze([
  "drive",
  "ballCam",
  "reset",
  "handbrake",
  "boost",
  "jump",
  ...EXTRA_ROLL_ACTIONS,
  "training"
]);

export const touchSettingsStore = createLocalStorageStore(
  STORAGE_KEY_TOUCH_SETTINGS,
  () => ({
    extras: {
      airRollLeft: false,
      airRollRight: false,
      airRoll: false
    },
    layouts: {
      portrait: {},
      landscape: {}
    }
  }),
  (target, loaded) => {
    if (isPlainObject(loaded.extras)) {
      for (const act of EXTRA_ROLL_ACTIONS) {
        target.extras[act] = booleanOrDefault(loaded.extras[act], target.extras[act]);
      }
    }
    if (isPlainObject(loaded.layouts)) {
      for (const orient of ["portrait", "landscape"]) {
        const orientObj = loaded.layouts[orient];
        if (isPlainObject(orientObj)) {
          for (const act of TOUCH_ACTION_IDS) {
            const btn = orientObj[act];
            if (isPlainObject(btn)) {
              if (
                typeof btn.x === "number" &&
                Number.isFinite(btn.x) &&
                typeof btn.y === "number" &&
                Number.isFinite(btn.y)
              ) {
                target.layouts[orient][act] = {
                  x: clampNumberOrDefault(btn.x, 0, { min: 0, max: 1 }),
                  y: clampNumberOrDefault(btn.y, 0, { min: 0, max: 1 }),
                  size: clampNumberOrDefault(btn.size, 1, { min: 0.75, max: 1.4 })
                };
              }
            }
          }
        }
      }
    }
  }
);

export const getScreenOrientation = (w, h) => (w > h ? "landscape" : "portrait");

export const TOUCH_CONTROL_LABELS = Object.freeze({
  drive: "Drive stick",
  ballCam: "Ball camera",
  reset: "Reset shot",
  handbrake: "Powerslide",
  boost: "Boost",
  jump: "Jump",
  airRollLeft: "Air roll left",
  airRollRight: "Air roll right",
  airRoll: "Free air roll",
  training: "Training commands"
});

export const TOUCH_BUTTON_DEFINITIONS = Object.freeze([
  ["ballCam", "cam", "Cam", "Toggle ball camera", false],
  ["reset", "reset", "Reset", "Reset shot", false],
  ["handbrake", "handbrake", "Slide", "Hold powerslide and air roll", true],
  ["boost", "boost", "Boost", "Hold boost", true],
  ["jump", "jump", "Jump", "Hold jump", true],
  ["airRollLeft", "roll", "Roll L", "Hold air roll left", true],
  ["airRollRight", "roll", "Roll R", "Hold air roll right", true],
  ["airRoll", "roll", "Roll", "Hold free air roll", true]
]);

export function renderTouchControlsHtml() {
  const trainingButtons = [
    ["takePossession", "Possess", "Take possession"],
    ["startDribble", "Dribble", "Start dribble"],
    ["passBall", "Pass", "Pass ball"],
    ["launchBall", "Launch", "Launch ball"]
  ]
    .map(([id, label, desc]) => `<button class="touch-button" type="button" data-touch-tap="${id}" aria-label="${desc}">${label}</button>`)
    .join("");

  const mainButtons = TOUCH_BUTTON_DEFINITIONS.map(
    ([id, mod, label, desc, isHold]) =>
      `<button class="touch-button touch-button--${mod}" type="button" data-touch-control="${id}" data-touch-${isHold ? "hold" : "tap"}="${id}" aria-label="${desc}" ${isHold ? 'aria-pressed="false"' : ""}>${label}</button>`
  ).join("");

  return `
  <div class="touch-ball-actions" data-touch-control="training" role="group" aria-label="Training controls">
    ${trainingButtons}
  </div>
  <div class="touch-stick-zone" data-touch-stick data-touch-control="drive" role="group" aria-label="Steering and throttle stick">
    <span class="touch-stick-zone__label" aria-hidden="true">Drive</span>
  </div>
  ${mainButtons}
  `;
}

const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

export function getScreenSafeArea(el) {
  const style = typeof getComputedStyle !== "undefined" ? getComputedStyle(el) : null;
  const parseVal = (prop) => Math.max(10, parseFloat(style?.getPropertyValue(`--safe-${prop}`)) || 0);
  return {
    width: typeof window !== "undefined" ? window.innerWidth : 800,
    height: typeof window !== "undefined" ? window.innerHeight : 600,
    left: parseVal("left"),
    right: parseVal("right"),
    top: parseVal("top"),
    bottom: parseVal("bottom")
  };
}

export function computeTouchLayoutBounds(settings, safeArea) {
  const { width, height, left, right, top, bottom } = safeArea;
  const stickSize = clamp(Math.min(width, height) * 0.3, 120, 150);
  const usableWidth = width - left - right;
  const trainingWidth = Math.min(232, usableWidth);

  const defaults = {
    drive: { left, top: height - bottom - stickSize, width: stickSize, height: stickSize },
    jump: { left: width - right - 66, top: height - bottom - 66, width: 66, height: 66 },
    boost: { left: width - right - 130, top: height - bottom - 105, width: 62, height: 62 },
    handbrake: { left: width - right - 50, top: height - bottom - 128, width: 50, height: 50 },
    ballCam: { left: width - right - 148, top: height - bottom - 44, width: 44, height: 44 },
    reset: { left: width - right - 142, top: height - bottom - 164, width: 44, height: 44 },
    airRollLeft: { left, top: height - bottom - stickSize - 92, width: 48, height: 48 },
    airRollRight: { left: left + 56, top: height - bottom - stickSize - 92, width: 48, height: 48 },
    airRoll: { left: left + 112, top: height - bottom - stickSize - 92, width: 48, height: 48 },
    training: { left: left + (usableWidth - trainingWidth) / 2, top: top + (width > 640 ? 0 : 116), width: trainingWidth, height: 44 }
  };

  const orient = getScreenOrientation(width, height);
  const userLayout = settings?.layouts?.[orient] ?? {};

  for (const act of TOUCH_ACTION_IDS) {
    const item = defaults[act];
    const custom = userLayout[act];
    const scale = custom?.size ?? 1;

    item.width = Math.min(usableWidth, Math.max(act === "training" ? 212 : 44, item.width * scale));
    item.height = Math.min(height - top - bottom, Math.max(44, item.height * scale));

    const maxLeft = Math.max(left, width - right - item.width);
    const maxTop = Math.max(top, height - bottom - item.height - 4);

    item.left = custom ? left + custom.x * (maxLeft - left) : clamp(item.left, left, maxLeft);
    item.top = custom ? top + custom.y * (maxTop - top) : clamp(item.top, top, maxTop);
  }

  return defaults;
}

export function normalizeTouchLayoutRect(rect, safeArea, size = 1) {
  return {
    x: clamp((rect.left - safeArea.left) / Math.max(1, safeArea.width - safeArea.right - rect.width - safeArea.left), 0, 1),
    y: clamp((rect.top - safeArea.top) / Math.max(1, safeArea.height - safeArea.bottom - rect.height - 4 - safeArea.top), 0, 1),
    size
  };
}

export function isExtraActionEnabled(actionId, settings) {
  return !(actionId in settings.extras) || Boolean(settings.extras[actionId]);
}

export function applyTouchLayoutToDom(root, settings, matchActive = false) {
  if (!root || !root.querySelectorAll) return;
  const layout = computeTouchLayoutBounds(settings, getScreenSafeArea(root));
  for (const el of root.querySelectorAll("[data-touch-control]")) {
    const controlId = el.dataset.touchControl;
    const rect = layout[controlId];
    if (rect) {
      Object.assign(el.style, {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        right: "auto",
        bottom: "auto",
        transform: "none"
      });
      el.hidden = !isExtraActionEnabled(controlId, settings) || (matchActive && (controlId === "training" || controlId === "reset"));
    }
  }
}

export const JOYSTICK_DEADZONE = 0.08;
const NAVIGATION_KEYS = new Set([
  "Space", "Enter", "Tab", "Escape", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"
]);

// Virtual Joystick Event Dispatcher & Component
class JoystickEventEmitter {
  constructor() {
    this._listeners = new Map();
  }
  on(event, fn) {
    const list = this._listeners.get(event) ?? [];
    list.push(fn);
    this._listeners.set(event, list);
  }
  off(event, fn) {
    if (!event) {
      this._listeners.clear();
      return;
    }
    if (!fn) {
      this._listeners.delete(event);
      return;
    }
    const list = this._listeners.get(event);
    if (list) {
      this._listeners.set(event, list.filter(cb => cb !== fn));
    }
  }
  trigger(event, data) {
    const list = this._listeners.get(event);
    if (list) {
      for (const cb of list) cb(data);
    }
  }
}

class Nipple extends JoystickEventEmitter {
  constructor(options) {
    super();
    this.options = options;
    this.frontPosition = { x: 0, y: 0 };
    this.direction = {};
    this.pressure = 0;
    this.ui = this.buildUi();
  }

  buildUi() {
    const el = document.createElement("div");
    el.className = "nipple nipple-static";
    el.style.cssText = `position:absolute;opacity:${this.options.restOpacity};display:block;transition:opacity ${this.options.fadeTime}ms;width:${this.options.size}px;height:${this.options.size}px;`;

    const back = document.createElement("div");
    back.className = "back";
    back.style.cssText = `position:absolute;top:0;left:0;width:100%;height:100%;border-radius:50%;background:${this.options.color?.back ?? "rgba(14, 20, 29, 0.72)"};`;

    const front = document.createElement("div");
    front.className = "front";
    front.style.cssText = `position:absolute;top:50%;left:50%;width:${this.options.size * 0.5}px;height:${this.options.size * 0.5}px;margin-left:-${this.options.size * 0.25}px;margin-top:-${this.options.size * 0.25}px;border-radius:50%;background:${this.options.color?.front ?? "rgba(221, 229, 239, 0.28)"};`;

    el.appendChild(back);
    el.appendChild(front);
    return { el, back, front };
  }

  addToDom() {
    if (!this.options.zone.contains(this.ui.el)) {
      this.options.zone.appendChild(this.ui.el);
    }
  }

  removeFromDom() {
    if (this.options.zone.contains(this.ui.el)) {
      this.options.zone.removeChild(this.ui.el);
    }
  }

  destroy() {
    this.removeFromDom();
    this.off();
  }
}

export const virtualJoystickFactory = {
  create(options) {
    const nipple = new Nipple(options);
    nipple.addToDom();
    return nipple;
  }
};

/**
 * Main Mobile Touch Controls System
 */
export class TouchControls {
  constructor(container) {
    this.onReset = null;
    this.onBallCamToggle = null;
    this.onBallControl = null;

    this.settings = touchSettingsStore.load();
    this.inputEnabled = true;
    this.matchActive = false;
    this.prefersTouch = true;
    this.stickEngaged = false;
    this.stickX = 0;
    this.stickY = 0;
    this.resizeTimer = 0;

    this.heldPointers = {
      jump: new Set(),
      boost: new Set(),
      handbrake: new Set(),
      airRollLeft: new Set(),
      airRollRight: new Set(),
      airRoll: new Set()
    };
    this.keyboardHeld = new Set();
    this.tapPointers = new Map();
    this.controls = {
      throttle: 0,
      steer: 0,
      pitch: 0,
      yaw: 0,
      roll: 0,
      jump: false,
      boost: false,
      handbrake: false
    };

    this.coarsePointer =
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia("(any-pointer: coarse)")
        : { matches: false, addEventListener: () => {} };

    this.manager = null;

    if (typeof document !== "undefined" && container) {
      container.insertAdjacentHTML(
        "beforeend",
        `<div id="touch-controls" class="touch-controls" hidden aria-label="Touch controls">${renderTouchControlsHtml()}</div>`
      );

      this.root = container.querySelector("#touch-controls");
      this.stickZone = this.root.querySelector("[data-touch-stick]");
      this.trainingGroup = this.root.querySelector(".touch-ball-actions");
      this.resetButton = this.root.querySelector('[data-touch-tap="reset"]');

      const stopNav = (e) => {
        if (NAVIGATION_KEYS.has(e.code)) e.stopPropagation();
      };
      this.root.addEventListener("keydown", stopNav);
      this.root.addEventListener("keyup", stopNav);

      this.root.querySelectorAll("[data-touch-hold]").forEach((btn) => {
        this.bindHoldButton(btn, btn.dataset.touchHold);
      });

      this.root.querySelectorAll("[data-touch-tap]").forEach((btn) => {
        this.bindTapButton(btn, btn.dataset.touchTap);
      });

      for (const ev of [
        "pointerdown", "pointerup", "pointercancel", "mousedown", "mouseup", "click", "dblclick", "auxclick", "touchstart", "touchend"
      ]) {
        this.root.addEventListener(ev, (e) => e.stopPropagation());
      }

      this.coarsePointer.addEventListener?.("change", () => this.syncVisibility());

      window.addEventListener("keydown", (e) => {
        if ((this.root.contains(e.target) && NAVIGATION_KEYS.has(e.code)) || e.repeat) return;
        this.hideForExternalInput();
      }, true);

      window.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse" && !this.root.contains(e.target)) {
          this.hideForExternalInput();
          return;
        }
        if (e.pointerType === "touch" || e.pointerType === "pen") {
          if (!this.prefersTouch) {
            this.prefersTouch = true;
            this.syncVisibility();
          }
        }
      }, { capture: true, passive: true });

      window.addEventListener(TOUCH_SETTINGS_CHANGED_EVENT, (e) => {
        this.clearState();
        const custom = e.detail;
        if (custom) {
          Object.assign(this.settings, structuredClone(custom));
        } else {
          touchSettingsStore.loadInto(this.settings);
        }
        applyTouchLayoutToDom(this.root, this.settings, this.matchActive);
        this.rebuildJoystick();
      });

      window.addEventListener("resize", () => this.scheduleJoystickRebuild());
      window.addEventListener("blur", () => this.clearState());
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) this.clearState();
      });

      this.syncVisibility();
    }
  }

  get enabled() {
    return this.inputEnabled;
  }

  set enabled(val) {
    if (val !== this.inputEnabled) {
      this.inputEnabled = val;
      this.clearState();
      this.syncVisibility();
    }
  }

  hideForExternalInput() {
    if (this.prefersTouch) {
      this.prefersTouch = false;
      this.syncVisibility();
    }
  }

  syncVisibility() {
    const visible = this.inputEnabled && this.available() && this.prefersTouch;
    if (this.root && this.root.hidden !== !visible) {
      this.root.hidden = !visible;
      document.body.classList.toggle("touch-controls-enabled", visible);
      if (visible) {
        applyTouchLayoutToDom(this.root, this.settings, this.matchActive);
        this.rebuildJoystick();
      } else {
        this.clearState();
        this.destroyJoystick();
      }
    }
  }

  scheduleJoystickRebuild() {
    this.clearState();
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => {
      this.resizeTimer = 0;
      if (this.root && !this.root.hidden) {
        applyTouchLayoutToDom(this.root, this.settings, this.matchActive);
        this.rebuildJoystick();
      }
    }, 120);
  }

  clearState() {
    this.stickEngaged = false;
    this.stickX = 0;
    this.stickY = 0;
    this.tapPointers.clear();
    this.keyboardHeld.clear();

    if (this.root) {
      this.root.querySelectorAll("[data-touch-tap]").forEach((el) => {
        el.classList.remove("is-active");
      });
      for (const act of Object.keys(this.heldPointers)) {
        this.heldPointers[act].clear();
        const btn = this.root.querySelector(`[data-touch-hold="${act}"]`);
        if (btn) this.syncHoldButton(btn, act);
      }
    }
    this.resetControls();
  }

  bindHoldButton(btn, action) {
    btn.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      btn.setPointerCapture(e.pointerId);
      this.heldPointers[action].add(e.pointerId);
      this.syncHoldButton(btn, action);
    });

    const release = (e) => {
      this.heldPointers[action].delete(e.pointerId);
      this.syncHoldButton(btn, action);
    };

    btn.addEventListener("pointerup", release);
    btn.addEventListener("pointercancel", release);
    btn.addEventListener("lostpointercapture", release);
  }

  bindTapButton(btn, action) {
    btn.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      btn.setPointerCapture(e.pointerId);
      this.tapPointers.set(e.pointerId, action);
      btn.classList.add("is-active");
    });

    btn.addEventListener("pointerup", (e) => {
      e.preventDefault();
      if (this.tapPointers.get(e.pointerId) === action) {
        this.fireTap(action);
      }
      this.tapPointers.delete(e.pointerId);
      btn.classList.remove("is-active");
    });

    const cancel = (e) => {
      this.tapPointers.delete(e.pointerId);
      btn.classList.remove("is-active");
    };

    btn.addEventListener("pointercancel", cancel);
    btn.addEventListener("lostpointercapture", cancel);
    btn.addEventListener("click", (e) => {
      if (e.detail === 0) this.fireTap(action);
    });
  }

  fireTap(action) {
    if (!this.inputEnabled || this.root?.hidden) return;
    if (this.matchActive && action !== "ballCam") return;

    if (action === "ballCam") {
      this.onBallCamToggle?.();
    } else if (action === "reset") {
      this.onReset?.();
    } else {
      this.onBallControl?.(action);
    }
  }

  isHeld(action) {
    return this.heldPointers[action]?.size > 0 || this.keyboardHeld.has(action);
  }

  syncHoldButton(btn, action) {
    const held = this.isHeld(action);
    btn.classList.toggle("is-active", held);
    btn.setAttribute("aria-pressed", String(held));
    if (this.root) this.root.dataset[action] = held ? "1" : "0";
  }

  setMatchActive(active) {
    if (active !== this.matchActive) {
      this.matchActive = active;
      if (this.trainingGroup) this.trainingGroup.hidden = active;
      if (this.resetButton) this.resetButton.hidden = active;
      if (active) {
        this.resetButton?.classList.remove("is-active");
        for (const [pId, act] of this.tapPointers) {
          if (act !== "ballCam") this.tapPointers.delete(pId);
        }
      }
    }
  }

  active() {
    return (
      this.inputEnabled &&
      !this.root?.hidden &&
      (this.stickEngaged ||
        this.isHeld("jump") ||
        this.isHeld("boost") ||
        this.isHeld("handbrake") ||
        this.isHeld("airRollLeft") ||
        this.isHeld("airRollRight") ||
        this.isHeld("airRoll"))
    );
  }

  axisWithDeadzone(val) {
    const abs = Math.abs(val);
    if (abs <= JOYSTICK_DEADZONE) return 0;
    return Math.sign(val) * ((abs - JOYSTICK_DEADZONE) / (1 - JOYSTICK_DEADZONE));
  }

  read() {
    if (!this.inputEnabled || this.root?.hidden) {
      this.resetControls();
      return this.controls;
    }

    const steer = this.axisWithDeadzone(this.stickX);
    const throttle = this.axisWithDeadzone(this.stickY);
    const handbrake = this.isHeld("handbrake");
    const airRollLeft = this.isHeld("airRollLeft");
    const airRollRight = this.isHeld("airRollRight");
    const freeRoll = handbrake || this.isHeld("airRoll");

    this.controls.throttle = throttle;
    this.controls.steer = steer;
    this.controls.pitch = -throttle;
    this.controls.yaw = airRollLeft || airRollRight || !freeRoll ? steer : 0;
    this.controls.roll = airRollLeft || airRollRight ? Number(airRollRight) - Number(airRollLeft) : freeRoll ? steer : 0;
    this.controls.jump = this.isHeld("jump");
    this.controls.boost = this.isHeld("boost");
    this.controls.handbrake = handbrake;

    return this.controls;
  }

  resetControls() {
    this.controls.throttle = 0;
    this.controls.steer = 0;
    this.controls.pitch = 0;
    this.controls.yaw = 0;
    this.controls.roll = 0;
    this.controls.jump = false;
    this.controls.boost = false;
    this.controls.handbrake = false;
  }

  available() {
    return (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0) || this.coarsePointer.matches;
  }

  joystickSize() {
    if (!this.stickZone) return 120;
    return Math.round(this.stickZone.getBoundingClientRect().width * 0.9);
  }

  rebuildJoystick() {
    this.destroyJoystick();
    if (this.root?.hidden || !this.stickZone) return;

    this.manager = virtualJoystickFactory.create({
      zone: this.stickZone,
      mode: "static",
      position: { left: "50%", top: "50%" },
      size: this.joystickSize(),
      threshold: JOYSTICK_DEADZONE,
      restOpacity: 0.72,
      fadeTime: 100,
      color: {
        front: "rgba(221, 229, 239, 0.28)",
        back: "rgba(14, 20, 29, 0.72)"
      }
    });

    const handleMove = (e) => {
      const rect = this.stickZone.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) / (rect.width / 2);
      const dy = -(e.clientY - cy) / (rect.height / 2);
      this.stickEngaged = true;
      this.stickX = clamp(dx, -1, 1);
      this.stickY = clamp(dy, -1, 1);
    };

    const handleEnd = () => {
      this.stickEngaged = false;
      this.stickX = 0;
      this.stickY = 0;
    };

    this.stickZone.addEventListener("pointermove", handleMove);
    this.stickZone.addEventListener("pointerup", handleEnd);
    this.stickZone.addEventListener("pointercancel", handleEnd);
  }

  destroyJoystick() {
    if (this.manager) {
      this.manager.destroy?.();
      this.manager = null;
    }
  }
}

/**
 * Touch Layout Customization Editor Dialog Tab
 */
export class TouchLayoutEditor {
  constructor(panel, onEditChange) {
    this.settings = touchSettingsStore.load();
    this.draft = null;
    this.selected = "drive";
    this.panel = panel;
    this.onEditChange = onEditChange;
    this.drag = null;

    if (panel) {
      panel.innerHTML = `
      <div class="touch-settings-content">
        <p class="panel-lede">Make the controls fit your hands. Training commands stay one tap away in free play.</p>
        <section class="zone touch-layout-intro">
          <header class="zone__head"><h2 class="zone__label">Your layout</h2></header>
          <p>Move the stick, buttons, and training bar. Resize each control to suit your reach.</p>
          <button class="act act--primary" type="button" data-touch-edit>Edit layout</button>
          <p class="touch-settings-note">Portrait and landscape layouts are saved separately on this device.</p>
        </section>
        <section class="zone">
          <header class="zone__head"><h2 class="zone__label">Extra buttons</h2><p class="zone__note">Add only what you use, then position it in your layout.</p></header>
          ${EXTRA_ROLL_ACTIONS.map(
            (act) => `<label class="touch-extra" for="touch-extra-${act}">
            <span><strong>${TOUCH_CONTROL_LABELS[act]}</strong><small>${
              act === "airRoll"
                ? "Hold and steer to roll. Does not powerslide."
                : `Roll ${act === "airRollLeft" ? "left" : "right"} while keeping steering free.`
            }</small></span>
            <input id="touch-extra-${act}" type="checkbox" data-touch-extra="${act}" />
          </label>`
          ).join("")}
          <p class="touch-settings-note">Slide still combines powerslide and free air roll.</p>
        </section>
      </div>
      <div class="touch-editor" hidden>
        <div class="touch-controls touch-preview" aria-hidden="true">${renderTouchControlsHtml()}</div>
        <section class="touch-editor-tools" aria-label="Layout adjustments">
          <header><div><h2>Edit touch layout</h2><p data-touch-orientation></p></div>
            <button class="act" type="button" data-touch-collapse aria-expanded="true" aria-controls="touch-editor-adjustments">Hide tools</button></header>
          <div id="touch-editor-adjustments">
            <p class="touch-editor-help">Drag a control, or adjust it below.</p>
            <label class="touch-editor-choice" for="touch-edit-control">Control<select class="pick" id="touch-edit-control"></select></label>
            <div class="touch-editor-ranges">
              ${[
                ["x", "Across", 0, 100],
                ["y", "Down", 0, 100],
                ["size", "Size", 75, 140]
              ]
                .map(
                  ([id, label, min, max]) =>
                    `<label for="touch-edit-${id}">${label} <output data-touch-output="${id}"></output>
                    <input id="touch-edit-${id}" class="dim__line" type="range" min="${min}" max="${max}" step="1" data-touch-adjust="${id}" /></label>`
                )
                .join("")}
            </div>
          </div>
          <footer>
            <button class="act" type="button" data-touch-reset>Reset layout</button>
            <button class="act" type="button" data-touch-cancel>Cancel</button>
            <button class="act act--primary" type="button" data-touch-save>Save</button>
          </footer>
          <p class="touch-editor-help" data-touch-layout-status role="status" aria-live="polite"></p>
        </section>
      </div>`;

      this.preview = panel.querySelector(".touch-preview");
      this.tools = panel.querySelector(".touch-editor-tools");

      for (const ev of ["touchstart", "touchend", "mousedown", "mouseup", "click"]) {
        this.tools.addEventListener(ev, (e) => e.stopPropagation());
      }

      let activePointer = null;
      let lastPointerId = null;

      window.addEventListener("pointerdown", () => {
        lastPointerId = null;
      }, true);

      window.addEventListener("click", (e) => {
        if (lastPointerId === null || e.detail === 0) return;
        if (e instanceof PointerEvent && e.pointerId !== lastPointerId) return;
        lastPointerId = null;
        e.preventDefault();
        e.stopImmediatePropagation();
      }, true);

      this.tools.addEventListener("pointerdown", (e) => {
        const btn = e.target.closest("button");
        if (e.pointerType === "mouse" || !btn || activePointer) return;
        e.preventDefault();
        btn.setPointerCapture(e.pointerId);
        activePointer = { id: e.pointerId, button: btn };
      });

      this.tools.addEventListener("pointerup", (e) => {
        if (activePointer?.id !== e.pointerId) return;
        const { button } = activePointer;
        activePointer = null;
        lastPointerId = e.pointerId;
        e.preventDefault();
        const rect = button.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
          button.click();
        }
      });

      for (const ev of ["pointercancel", "lostpointercapture"]) {
        this.tools.addEventListener(ev, (e) => {
          if (activePointer?.id === e.pointerId) activePointer = null;
        });
      }

      this.select = panel.querySelector("#touch-edit-control");
      this.editButton = panel.querySelector("[data-touch-edit]");
      this.preview
        .querySelector("[data-touch-stick]")
        .insertAdjacentHTML("afterbegin", '<span class="touch-preview-stick" aria-hidden="true"><span></span></span>');

      for (const btn of this.preview.querySelectorAll("button")) {
        btn.tabIndex = -1;
      }

      for (const ctrl of this.preview.querySelectorAll("[data-touch-control]")) {
        ctrl.addEventListener("pointerdown", (e) => this.startDrag(e, ctrl));
        ctrl.addEventListener("pointermove", (e) => this.moveDrag(e));
        const stop = (e) => {
          if (this.drag?.pointerId === e.pointerId) this.drag = null;
        };
        ctrl.addEventListener("pointerup", stop);
        ctrl.addEventListener("pointercancel", stop);
        ctrl.addEventListener("lostpointercapture", stop);
        ctrl.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
        });
      }

      this.editButton.addEventListener("click", () => this.startEditing());
      panel.querySelector("[data-touch-save]").addEventListener("click", () => this.finish(true));
      panel.querySelector("[data-touch-cancel]").addEventListener("click", () => this.finish(false));

      panel.querySelector("[data-touch-reset]").addEventListener("click", () => {
        if (!this.draft) return;
        const orient = getScreenOrientation(window.innerWidth, window.innerHeight);
        this.draft.layouts[orient] = {};
        this.render();
        this.tools.querySelector("[data-touch-layout-status]").textContent = `${
          orient === "portrait" ? "Portrait" : "Landscape"
        } reset. Save to keep it.`;
      });

      panel.querySelector("[data-touch-collapse]").addEventListener("click", (e) => {
        const btn = e.currentTarget;
        const adj = panel.querySelector("#touch-editor-adjustments");
        adj.hidden = !adj.hidden;
        btn.setAttribute("aria-expanded", String(!adj.hidden));
        btn.textContent = adj.hidden ? "Show tools" : "Hide tools";
      });

      this.select.addEventListener("change", () => {
        this.selected = this.select.value;
        this.render();
      });

      panel.querySelectorAll("[data-touch-adjust]").forEach((input) => {
        input.addEventListener("input", () => {
          if (!this.draft) return;
          const placement = this.currentPlacement();
          placement[input.dataset.touchAdjust] = Number(input.value) / 100;
          this.draft.layouts[getScreenOrientation(window.innerWidth, window.innerHeight)][this.selected] = placement;
          this.render();
        });
      });

      panel.querySelectorAll("[data-touch-extra]").forEach((chk) => {
        chk.addEventListener("change", () => {
          this.settings.extras[chk.dataset.touchExtra] = chk.checked;
          this.persist();
        });
      });

      window.addEventListener("resize", () => {
        this.drag = null;
        if (this.draft) this.render();
      });

      window.addEventListener("blur", () => {
        this.drag = null;
      });

      this.syncExtras();
    }
  }

  get isEditing() {
    return this.draft !== null;
  }

  cancel() {
    if (this.draft) this.finish(false);
  }

  restoreDefaults() {
    Object.assign(this.settings, touchSettingsStore.defaults());
    this.syncExtras();
    this.persist();
  }

  syncExtras() {
    this.panel.querySelectorAll("[data-touch-extra]").forEach((el) => {
      el.checked = this.settings.extras[el.dataset.touchExtra];
    });
  }

  persist() {
    touchSettingsStore.save(this.settings);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(TOUCH_SETTINGS_CHANGED_EVENT, { detail: structuredClone(this.settings) })
      );
    }
  }

  startEditing() {
    this.draft = structuredClone(this.settings);
    this.selected = "drive";
    this.select.replaceChildren(
      ...TOUCH_ACTION_IDS.filter((act) => isExtraActionEnabled(act, this.settings)).map(
        (act) => new Option(TOUCH_CONTROL_LABELS[act], act)
      )
    );
    this.panel.querySelector(".touch-editor").hidden = false;
    this.tools.querySelector("[data-touch-layout-status]").textContent = "";
    this.onEditChange?.(true);
    this.render();
    this.select.focus();
  }

  finish(save) {
    if (save && this.draft) {
      Object.assign(this.settings, this.draft);
      this.persist();
    }
    this.draft = null;
    this.drag = null;
    this.panel.querySelector(".touch-editor").hidden = true;
    this.onEditChange?.(false);
    if (this.editButton.offsetParent !== null) {
      this.editButton.focus();
    } else {
      const parentSheet = this.panel.closest(".sheet");
      parentSheet?.querySelector("#controller-input")?.focus();
    }
  }

  currentPlacement() {
    const safeArea = getScreenSafeArea(this.preview);
    const orient = getScreenOrientation(safeArea.width, safeArea.height);
    const existing = this.draft.layouts[orient][this.selected];
    if (existing) return { ...existing };
    const bounds = computeTouchLayoutBounds(this.draft, safeArea)[this.selected];
    return normalizeTouchLayoutRect(bounds, safeArea);
  }

  render() {
    if (!this.draft) return;
    applyTouchLayoutToDom(this.preview, this.draft);
    this.select.value = this.selected;
    const orient = getScreenOrientation(window.innerWidth, window.innerHeight);
    this.tools.querySelector("[data-touch-orientation]").textContent = `${
      orient === "portrait" ? "Portrait" : "Landscape"
    } · game controls paused`;

    const placement = this.currentPlacement();
    this.panel.querySelectorAll("[data-touch-adjust]").forEach((input) => {
      const prop = input.dataset.touchAdjust;
      input.value = String(Math.round(placement[prop] * 100));
      input.style.setProperty(
        "--dim-progress",
        `${((Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min))) * 100}%`
      );
      this.tools.querySelector(`[data-touch-output="${prop}"]`).value = `${input.value}%`;
    });

    this.preview.querySelectorAll("[data-touch-control]").forEach((el) => {
      el.classList.toggle("is-selected", el.dataset.touchControl === this.selected);
    });
  }

  startDrag(e, target) {
    if (!this.draft || this.drag || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
    e.stopPropagation();
    this.selected = target.dataset.touchControl;
    const rect = target.getBoundingClientRect();
    this.drag = {
      pointerId: e.pointerId,
      id: this.selected,
      x: e.clientX,
      y: e.clientY,
      left: rect.left,
      top: rect.top
    };
    target.setPointerCapture(e.pointerId);
    this.render();
  }

  moveDrag(e) {
    if (!this.draft || this.drag?.pointerId !== e.pointerId) return;
    e.preventDefault();
    const safeArea = getScreenSafeArea(this.preview);
    const bounds = computeTouchLayoutBounds(this.draft, safeArea)[this.drag.id];
    bounds.left = this.drag.left + e.clientX - this.drag.x;
    bounds.top = this.drag.top + e.clientY - this.drag.y;

    const orient = getScreenOrientation(safeArea.width, safeArea.height);
    this.draft.layouts[orient][this.drag.id] = normalizeTouchLayoutRect(
      bounds,
      safeArea,
      this.currentPlacement().size
    );
    this.render();
  }
}

// Backward-compatibility aliases
export const ib = TouchControls;
export const _M = TouchLayoutEditor;
export const La = touchSettingsStore;
export const yA = applyTouchLayoutToDom;
export const Lh = getScreenSafeArea;
export const Fh = computeTouchLayoutBounds;
export const Hf = normalizeTouchLayoutRect;
export const k0 = isExtraActionEnabled;
export const B0 = renderTouchControlsHtml;
export const Of = TOUCH_CONTROL_LABELS;
export const rb = TOUCH_BUTTON_DEFINITIONS;
export const M0 = TOUCH_SETTINGS_CHANGED_EVENT;
export const Ud = EXTRA_ROLL_ACTIONS;
export const qd = TOUCH_ACTION_IDS;
export const tA = JOYSTICK_DEADZONE;
export const nb = virtualJoystickFactory;
