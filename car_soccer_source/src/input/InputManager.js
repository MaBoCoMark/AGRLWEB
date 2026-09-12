/**
 * InputManager.js
 * Multi-device input handler supporting Keyboard, Gamepad, and Touch controllers.
 */

export class InputManager {
  constructor() {
    this.keys = new Set();
    this.controls = {
      throttle: 0,
      steer: 0,
      pitch: 0,
      yaw: 0,
      roll: 0,
      jump: false,
      boost: false,
      handbrake: false,
    };

    this.ballCamToggleRequested = false;
    this.resetRequested = false;
    this.cameraLook = { x: 0, y: 0 };

    this.touchActive = false;
    this.touchControls = { ...this.controls };

    this.setupKeyboard();
    this.setupGamepad();
  }

  setupKeyboard() {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);

      if (e.code === 'KeyC' || e.code === 'Space' && e.altKey) {
        this.ballCamToggleRequested = true;
      }
      if (e.code === 'KeyR') {
        this.resetRequested = true;
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    // Mouse buttons
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.controls.boost = true;
      if (e.button === 2) this.controls.handbrake = true;
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.controls.boost = false;
      if (e.button === 2) this.controls.handbrake = false;
    });

    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  setupGamepad() {
    window.addEventListener('gamepadconnected', (e) => {
      console.log(`[InputManager] Gamepad connected: ${e.gamepad.id}`);
    });
  }

  pollGamepad() {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = gamepads[0];
    if (!gp) return null;

    const deadzone = (v, threshold = 0.15) => Math.abs(v) > threshold ? v : 0;

    const steer = deadzone(gp.axes[0] || 0);
    const pitch = deadzone(gp.axes[1] || 0);
    const cameraX = deadzone(gp.axes[2] || 0);
    const cameraY = deadzone(gp.axes[3] || 0);

    // Triggers: LT = brake, RT = throttle
    const lt = gp.buttons[6] ? gp.buttons[6].value : 0;
    const rt = gp.buttons[7] ? gp.buttons[7].value : 0;
    const throttle = rt - lt;

    const jump = gp.buttons[0]?.pressed || false; // A / Cross
    const boost = gp.buttons[1]?.pressed || false; // B / Circle
    const handbrake = gp.buttons[2]?.pressed || false; // X / Square
    const ballCam = gp.buttons[3]?.pressed || false; // Y / Triangle

    if (ballCam && !this.lastGpBallCam) {
      this.ballCamToggleRequested = true;
    }
    this.lastGpBallCam = ballCam;

    return {
      throttle,
      steer,
      pitch,
      yaw: steer,
      roll: handbrake ? steer : 0,
      jump,
      boost,
      handbrake,
      cameraLook: { x: cameraX, y: cameraY },
    };
  }

  read() {
    // Check Gamepad first
    const gpControls = this.pollGamepad();
    if (gpControls) {
      this.cameraLook = gpControls.cameraLook;
      return {
        throttle: gpControls.throttle,
        steer: gpControls.steer,
        pitch: gpControls.pitch,
        yaw: gpControls.yaw,
        roll: gpControls.roll,
        jump: gpControls.jump,
        boost: gpControls.boost,
        handbrake: gpControls.handbrake,
      };
    }

    // Touch controls if active
    if (this.touchActive) {
      return { ...this.touchControls };
    }

    // Fall back to Keyboard
    let throttle = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) throttle += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) throttle -= 1;

    let steer = 0;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) steer += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) steer -= 1;

    let roll = 0;
    if (this.keys.has('KeyE')) roll += 1;
    if (this.keys.has('KeyQ')) roll -= 1;

    const jump = this.keys.has('Space');
    const boost = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.controls.boost;
    const handbrake = this.keys.has('KeyX') || this.controls.handbrake;

    return {
      throttle,
      steer,
      pitch: -throttle,
      yaw: steer,
      roll: roll || (handbrake ? steer : 0),
      jump,
      boost,
      handbrake,
    };
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
