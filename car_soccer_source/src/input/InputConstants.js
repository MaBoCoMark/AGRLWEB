/**
 * InputConstants.js
 * Comprehensive constants, metadata, schemas, and display labels for all game inputs.
 * Aligned with RocketSim CarControls (8-stride float controls).
 */

export const STORAGE_KEY_INPUT_BINDINGS = "car-soccer.input-bindings.v1";
export const STORAGE_KEY_CONTROLLER_SELECTION = "car-soccer.controller.v1";
export const STORAGE_KEY_TOUCH_SETTINGS = "car-soccer.touch-settings.v1";

export const CAMERA_LOOK_ACTIONS = Object.freeze([
  "cameraLeft",
  "cameraRight",
  "cameraUp",
  "cameraDown"
]);

export const ACTION_GROUPS = Object.freeze([
  "Driving",
  "Aerial",
  "Camera",
  "Ball Control",
  "Session"
]);

/**
 * Complete metadata for the 21 configurable game actions
 */
export const INPUT_ACTIONS = Object.freeze([
  {
    id: "throttleForward",
    label: "Throttle",
    group: "Driving",
    analog: true,
    note: "Drives forward. On keyboard, also noses down in the air."
  },
  {
    id: "throttleReverse",
    label: "Reverse",
    group: "Driving",
    analog: true,
    note: "Drives backward. On keyboard, also noses up in the air."
  },
  {
    id: "steerLeft",
    label: "Steer Left",
    group: "Driving",
    analog: false,
    note: "Adds to the steering axis. Yaws in the air unless a roll is held."
  },
  {
    id: "steerRight",
    label: "Steer Right",
    group: "Driving",
    analog: false,
    note: "Adds to the steering axis. Yaws in the air unless a roll is held."
  },
  {
    id: "boost",
    label: "Boost",
    group: "Driving",
    analog: false,
    note: "Burns boost for thrust."
  },
  {
    id: "jump",
    label: "Jump",
    group: "Driving",
    analog: false,
    note: "Jumps, flips, and dodges."
  },
  {
    id: "powerslide",
    label: "Powerslide",
    group: "Driving",
    analog: true,
    note: "Slides on the ground. Bind Free Air Roll separately to roll in the air."
  },
  {
    id: "airRoll",
    label: "Free Air Roll",
    group: "Aerial",
    analog: true,
    note: "Hold to roll with the steering inputs in the air, without powersliding."
  },
  {
    id: "airRollLeft",
    label: "Air Roll Left",
    group: "Aerial",
    analog: false,
    note: "Rolls left at a fixed rate while held."
  },
  {
    id: "airRollRight",
    label: "Air Roll Right",
    group: "Aerial",
    analog: false,
    note: "Rolls right at a fixed rate while held."
  },
  {
    id: "ballCam",
    label: "Ball Cam",
    group: "Camera",
    analog: false,
    note: "Toggles between ball cam and car cam."
  },
  {
    id: "cameraLeft",
    label: "Look Left",
    group: "Camera",
    analog: true,
    note: "Looks left while held. Release to return to the follow camera."
  },
  {
    id: "cameraRight",
    label: "Look Right",
    group: "Camera",
    analog: true,
    note: "Looks right while held. Release to return to the follow camera."
  },
  {
    id: "cameraUp",
    label: "Look Up",
    group: "Camera",
    analog: true,
    note: "Looks upward while held. Release to return to the follow camera."
  },
  {
    id: "cameraDown",
    label: "Look Down",
    group: "Camera",
    analog: true,
    note: "Looks downward while held. Release to return to the follow camera."
  },
  {
    id: "resetShot",
    label: "Reset Shot",
    group: "Session",
    analog: false,
    note: "Returns car and ball to kickoff."
  },
  {
    id: "takePossession",
    label: "Take Possession",
    group: "Ball Control",
    analog: false,
    note: "Places the ball just ahead of your car, matching your velocity."
  },
  {
    id: "startDribble",
    label: "Start Dribble",
    group: "Ball Control",
    analog: false,
    note: "Places the ball on your hood, matching your velocity."
  },
  {
    id: "passBall",
    label: "Pass Ball",
    group: "Ball Control",
    analog: false,
    note: "Sends the ball toward your car from its current position."
  },
  {
    id: "launchBall",
    label: "Launch Ball",
    group: "Ball Control",
    analog: false,
    note: "Pops the ball straight upward from its current position."
  },
  {
    id: "toggleSettings",
    label: "Menu / Cursor",
    group: "Session",
    analog: false,
    note: "Browser keys/mouse: show the cursor or return to play. Controller: open settings."
  }
]);

export const KEY_DISPLAY_NAMES = Object.freeze({
  Space: "Space",
  Escape: "Esc",
  Backspace: "Backspace",
  Enter: "Enter",
  Tab: "Tab",
  ShiftLeft: "L Shift",
  ShiftRight: "R Shift",
  ControlLeft: "L Ctrl",
  ControlRight: "R Ctrl",
  AltLeft: "L Alt",
  AltRight: "R Alt",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  CapsLock: "Caps",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/"
});

export const MOUSE_BUTTON_NAMES = Object.freeze({
  0: "L Mouse",
  1: "M Mouse",
  2: "R Mouse",
  3: "Mouse 4",
  4: "Mouse 5"
});

export const XBOX_BUTTON_NAMES = Object.freeze([
  "A", "B", "X", "Y",
  "LB", "RB", "LT", "RT",
  "View", "Menu",
  "L Stick", "R Stick",
  "D-Up", "D-Down", "D-Left", "D-Right",
  "Guide"
]);

export const PLAYSTATION_BUTTON_NAMES = Object.freeze([
  "Cross", "Circle", "Square", "Triangle",
  "L1", "R1", "L2", "R2",
  "Share", "Options",
  "L3", "R3",
  "D-Up", "D-Down", "D-Left", "D-Right",
  "PS"
]);

export const AXIS_NAMES = Object.freeze([
  "L Stick X",
  "L Stick Y",
  "R Stick X",
  "R Stick Y"
]);

export const TRIGGER_ANALOG_THRESHOLD = 0.5;
export const ACTIVITY_EPSILON = 0.05;
export const CAMERA_LOOK_DEADZONE = 0.3;

// Backward-compatibility aliases
export const BC = STORAGE_KEY_INPUT_BINDINGS;
export const Rf = CAMERA_LOOK_ACTIONS;
export const io = INPUT_ACTIONS;
export const kC = ACTION_GROUPS;
export const IC = KEY_DISPLAY_NAMES;
export const FC = MOUSE_BUTTON_NAMES;
export const DC = XBOX_BUTTON_NAMES;
export const NC = PLAYSTATION_BUTTON_NAMES;
export const GC = AXIS_NAMES;
export const zC = TRIGGER_ANALOG_THRESHOLD;
export const VC = ACTIVITY_EPSILON;
export const Zo = CAMERA_LOOK_DEADZONE;
