/**
 * InputManager.js
 * Multi-device input coordinator supporting Keyboard & Mouse, Gamepad, and Mobile Touch.
 * Built on top of the modular MultiPlatformInput subsystem.
 */

import {
  KeyboardMouseController,
  GamepadController,
  createDefaultInputBindings,
  loadInputBindings
} from "./MultiPlatformInput.js";

export class InputManager {
  constructor(bindings = loadInputBindings()) {
    this.bindings = bindings;
    this.keyboard = new KeyboardMouseController(this.bindings);
    this.gamepad = new GamepadController(this.bindings);

    this.ballCamToggleRequested = false;
    this.resetRequested = false;
    this.cameraLook = { x: 0, y: 0 };

    this.touchActive = false;
    this.touchControls = {
      throttle: 0,
      steer: 0,
      pitch: 0,
      yaw: 0,
      roll: 0,
      jump: false,
      boost: false,
      handbrake: false
    };

    this.keyboard.onBallCamToggle = () => {
      this.ballCamToggleRequested = true;
    };
    this.keyboard.onReset = () => {
      this.resetRequested = true;
    };

    this.gamepad.onBallCamToggle = () => {
      this.ballCamToggleRequested = true;
    };
    this.gamepad.onReset = () => {
      this.resetRequested = true;
    };
  }

  get controls() {
    return this.keyboard.controls;
  }

  read() {
    // 1. Check Gamepad
    const gpControls = this.gamepad.read();
    if (this.gamepad.active()) {
      this.cameraLook = this.gamepad.cameraLook;
      return gpControls;
    }

    // 2. Touch controls if active
    if (this.touchActive) {
      return { ...this.touchControls };
    }

    // 3. Fall back to Keyboard
    const kbControls = this.keyboard.read();
    this.cameraLook = this.keyboard.cameraLook;
    return kbControls;
  }

  consumeBallCamToggle() {
    const t = this.ballCamToggleRequested;
    this.ballCamToggleRequested = false;
    return t;
  }

  consumeReset() {
    const r = this.resetRequested;
    this.resetRequested = false;
    return r;
  }
}
