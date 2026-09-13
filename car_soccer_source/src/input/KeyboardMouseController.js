/**
 * KeyboardMouseController.js
 * High-performance, low-latency keyboard and mouse input handler with custom bindings,
 * action toggles, aerial pitch/yaw/roll separation, and UI focus evasion.
 */

import { BALL_CONTROL_MODES } from "../physics/RocketSimConstants.js";

/**
 * Detect whether an event target resides inside an interactive UI layer.
 * @param {EventTarget} target
 * @returns {boolean}
 */
export function isEventWithinUI(target) {
  return (
    target instanceof Element &&
    target.closest(
      ".hud-tools, .sheet-overlay, .car-tab, .car-overlay, .match-tab, .match-overlay, .match-hud, .match-result, .status, .touch-controls"
    ) !== null
  );
}

export class KeyboardMouseController {
  constructor(bindings) {
    this.keys = new Set();
    this.mouse = new Set();
    this.inputEnabled = true;
    this.captureActive = false;
    this.bindings = bindings;
    this.look = { x: 0, y: 0 };
    this.cameraLook = this.look;
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

    this.onReset = null;
    this.onBallControl = null;
    this.onBallCamToggle = null;
    this.onSettingsToggle = null;

    if (typeof window !== "undefined") {
      window.addEventListener("keydown", (e) => {
        if (this.captureActive) return;
        const source = { kind: "key", code: e.code };
        if (e.repeat) {
          if (this.inputEnabled) this.suppressBrowserDefault(source, e);
          return;
        }
        if (!this.fireToggles(source, e)) {
          if (this.inputEnabled) {
            this.keys.add(e.code);
            this.suppressBrowserDefault(source, e);
          }
        }
      });

      window.addEventListener("keyup", (e) => {
        this.keys.delete(e.code);
      });

      window.addEventListener("mousedown", (e) => {
        if (this.captureActive || isEventWithinUI(e.target)) return;
        const source = { kind: "mouse", button: e.button };
        if (!this.fireToggles(source, e)) {
          if (this.inputEnabled) {
            this.mouse.add(e.button);
            this.suppressBrowserDefault(source, e);
          }
        }
      });

      window.addEventListener("mouseup", (e) => {
        this.mouse.delete(e.button);
      });

      window.addEventListener("auxclick", (e) => {
        if (!this.inputEnabled || this.captureActive || isEventWithinUI(e.target)) return;
        this.suppressBrowserDefault({ kind: "mouse", button: e.button }, e);
      });

      window.addEventListener("contextmenu", (e) => {
        e.preventDefault();
      });

      window.addEventListener("blur", () => {
        this.keys.clear();
        this.mouse.clear();
      });
    }
  }

  get enabled() {
    return this.inputEnabled;
  }

  set enabled(val) {
    this.inputEnabled = val;
    if (!val) {
      this.keys.clear();
      this.mouse.clear();
    }
  }

  set capturing(val) {
    this.captureActive = val;
    if (val) {
      this.keys.clear();
      this.mouse.clear();
    }
  }

  setBindings(bindings) {
    this.bindings = bindings;
    this.keys.clear();
    this.mouse.clear();
  }

  boundSources(action) {
    return this.bindings?.keyboard?.[action] ?? [];
  }

  held(action) {
    for (const src of this.boundSources(action)) {
      if (src.kind === "key" && this.keys.has(src.code)) return true;
      if (src.kind === "mouse" && this.mouse.has(src.button)) return true;
    }
    return false;
  }

  matches(action, source) {
    for (const src of this.boundSources(action)) {
      if (src.kind === source.kind) {
        if (src.kind === "key" && src.code === source.code) return true;
        if (src.kind === "mouse" && src.button === source.button) return true;
      }
    }
    return false;
  }

  fireToggles(source, event) {
    if (this.captureActive) return false;

    if (this.matches("toggleSettings", source)) {
      event.preventDefault();
      this.onSettingsToggle?.();
      return true;
    }

    const isTyping =
      event &&
      event.target instanceof HTMLElement &&
      ((event.target.tagName === "INPUT" &&
        (event.target.type === "text" || event.target.type === "password" || event.target.type === "search")) ||
        event.target.tagName === "TEXTAREA");

    if (!isTyping) {
      for (const mode of BALL_CONTROL_MODES) {
        if (this.matches(mode, source)) {
          event.preventDefault();
          this.onBallControl?.(mode);
          return true;
        }
      }
    }

    if (!this.inputEnabled) return false;

    if (this.matches("ballCam", source)) {
      event.preventDefault();
      this.onBallCamToggle?.();
    }

    if (this.matches("resetShot", source)) {
      event.preventDefault();
      this.onReset?.();
    }

    return false;
  }

  suppressBrowserDefault(source, event) {
    if (
      (event.ctrlKey && !this.isModifierBound("Control")) ||
      (event.metaKey && !this.isModifierBound("Meta")) ||
      (event.altKey && !this.isModifierBound("Alt"))
    ) {
      return;
    }
    if (this.isBound(source)) {
      event.preventDefault();
    }
  }

  isModifierBound(mod) {
    return this.isBound({ kind: "key", code: `${mod}Left` }) || this.isBound({ kind: "key", code: `${mod}Right` });
  }

  isBound(source) {
    if (!this.bindings?.keyboard) return false;
    for (const act of Object.keys(this.bindings.keyboard)) {
      if (this.matches(act, source)) return true;
    }
    return false;
  }

  axis(negativeAction, positiveAction) {
    return (this.held(positiveAction) ? 1 : 0) - (this.held(negativeAction) ? 1 : 0);
  }

  read() {
    if (!this.inputEnabled || this.captureActive) {
      this.look.x = 0;
      this.look.y = 0;
      this.controls.throttle = 0;
      this.controls.steer = 0;
      this.controls.pitch = 0;
      this.controls.yaw = 0;
      this.controls.roll = 0;
      this.controls.jump = false;
      this.controls.boost = false;
      this.controls.handbrake = false;
      return this.controls;
    }

    const steer = this.axis("steerLeft", "steerRight");
    const airRoll = this.held("airRoll");
    const airRollDiscrete = this.axis("airRollLeft", "airRollRight");
    const roll = Math.max(-1, Math.min(1, airRollDiscrete + (airRoll ? steer : 0)));
    const throttle = this.axis("throttleReverse", "throttleForward");

    this.controls.throttle = throttle;
    this.controls.steer = steer;
    this.controls.pitch = throttle === 0 ? 0 : -throttle;
    this.controls.yaw = airRoll ? 0 : steer;
    this.controls.roll = roll;
    this.controls.jump = this.held("jump");
    this.controls.boost = this.held("boost");
    this.controls.handbrake = this.held("powerslide");

    this.look.x = this.axis("cameraLeft", "cameraRight");
    this.look.y = this.axis("cameraUp", "cameraDown");

    return this.controls;
  }
}

// Backward-compatibility aliases
export const SC = KeyboardMouseController;
export const Tf = isEventWithinUI;
