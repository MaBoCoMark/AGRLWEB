/**
 * MultiPlatformInput.js
 * Unified multi-platform input facade providing seamless access to Keyboard & Mouse,
 * Gamepad (standard/custom mapping), Mobile Touch controls, and persistent bindings.
 */

export * from "./InputConstants.js";
export * from "./InputBindings.js";
export * from "./KeyboardMouseController.js";
export * from "./GamepadController.js";
export * from "./TouchControls.js";

import { KeyboardMouseController } from "./KeyboardMouseController.js";
import { GamepadController } from "./GamepadController.js";
import { TouchControls } from "./TouchControls.js";
import { loadInputBindings, getEffectiveGamepad } from "./InputBindings.js";

/**
 * Unified MultiPlatformInputCoordinator orchestrates polling across all devices,
 * prioritizing active gamepads, touch pointers, and falling back to keyboard/mouse.
 */
export class MultiPlatformInputCoordinator {
  constructor(container, bindings = loadInputBindings()) {
    this.bindings = bindings;
    this.keyboard = new KeyboardMouseController(this.bindings);
    this.gamepad = new GamepadController(this.bindings);
    this.touch = new TouchControls(container);

    this.onReset = null;
    this.onBallControl = null;
    this.onBallCamToggle = null;
    this.onSettingsToggle = null;

    const forwardReset = () => this.onReset?.();
    const forwardBallControl = (mode) => this.onBallControl?.(mode);
    const forwardBallCam = () => this.onBallCamToggle?.();
    const forwardSettings = () => this.onSettingsToggle?.();

    this.keyboard.onReset = forwardReset;
    this.keyboard.onBallControl = forwardBallControl;
    this.keyboard.onBallCamToggle = forwardBallCam;
    this.keyboard.onSettingsToggle = forwardSettings;

    this.gamepad.onReset = forwardReset;
    this.gamepad.onBallControl = forwardBallControl;
    this.gamepad.onBallCamToggle = forwardBallCam;
    this.gamepad.onSettingsToggle = forwardSettings;

    this.touch.onReset = forwardReset;
    this.touch.onBallControl = forwardBallControl;
    this.touch.onBallCamToggle = forwardBallCam;
  }

  setBindings(bindings) {
    this.bindings = bindings;
    this.keyboard.setBindings(bindings);
    this.gamepad.setBindings(bindings);
  }

  get activeDevice() {
    if (this.gamepad.active()) return "gamepad";
    if (this.touch.active()) return "touch";
    return "keyboard";
  }

  read() {
    const padControls = this.gamepad.read();
    const touchControls = this.touch.read();
    const kbControls = this.keyboard.read();

    const device = this.activeDevice;
    const activeControls =
      device === "gamepad" ? padControls : device === "touch" ? touchControls : kbControls;

    const lookX = Math.max(-1, Math.min(1, this.keyboard.cameraLook.x + this.gamepad.cameraLook.x));
    const lookY = Math.max(-1, Math.min(1, this.keyboard.cameraLook.y + this.gamepad.cameraLook.y));

    return {
      controls: activeControls,
      device,
      cameraLook: { x: lookX, y: lookY }
    };
  }
}
