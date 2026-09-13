/**
 * InputBindings.js
 * Default input bindings, serialization, schema validation, display formatting,
 * and Gamepad device management.
 */

import {
  INPUT_ACTIONS,
  STORAGE_KEY_INPUT_BINDINGS,
  STORAGE_KEY_CONTROLLER_SELECTION,
  CAMERA_LOOK_ACTIONS,
  KEY_DISPLAY_NAMES,
  MOUSE_BUTTON_NAMES,
  XBOX_BUTTON_NAMES,
  PLAYSTATION_BUTTON_NAMES,
  AXIS_NAMES
} from "./InputConstants.js";
import {
  createLocalStorageStore,
  isPlainObject,
  clampNumberOrDefault,
  booleanOrDefault,
  filterArraySlice
} from "../utils/StorageHelper.js";
import { BALL_CONTROL_MODES } from "../physics/RocketSimConstants.js";

/**
 * Generate default keyboard and mouse bindings.
 */
export function createDefaultKeyboardBindings() {
  return {
    throttleForward: [{ kind: "key", code: "KeyW" }],
    throttleReverse: [{ kind: "key", code: "KeyS" }],
    steerLeft: [{ kind: "key", code: "KeyA" }],
    steerRight: [{ kind: "key", code: "KeyD" }],
    boost: [{ kind: "mouse", button: 0 }],
    jump: [{ kind: "mouse", button: 2 }],
    powerslide: [
      { kind: "key", code: "ShiftLeft" },
      { kind: "key", code: "ShiftRight" }
    ],
    airRoll: [
      { kind: "key", code: "ShiftLeft" },
      { kind: "key", code: "ShiftRight" }
    ],
    airRollLeft: [{ kind: "key", code: "KeyQ" }],
    airRollRight: [{ kind: "key", code: "KeyE" }],
    ballCam: [{ kind: "key", code: "Space" }],
    cameraLeft: [],
    cameraRight: [],
    cameraUp: [],
    cameraDown: [],
    takePossession: [{ kind: "key", code: "Digit1" }],
    startDribble: [{ kind: "key", code: "Digit2" }],
    passBall: [{ kind: "key", code: "Digit3" }],
    launchBall: [{ kind: "key", code: "Digit4" }],
    resetShot: [{ kind: "key", code: "Backspace" }],
    toggleSettings: [{ kind: "key", code: "Escape" }]
  };
}

/**
 * Generate default Gamepad (standard mapping) bindings.
 */
export function createDefaultGamepadBindings() {
  return {
    throttleForward: [{ kind: "padButton", index: 7 }],
    throttleReverse: [{ kind: "padAxis", axis: 1, dir: 1 }],
    steerLeft: [],
    steerRight: [],
    boost: [{ kind: "padButton", index: 5 }],
    jump: [{ kind: "padButton", index: 2 }],
    powerslide: [{ kind: "padButton", index: 6 }],
    airRoll: [{ kind: "padButton", index: 6 }],
    airRollLeft: [{ kind: "padButton", index: 0 }],
    airRollRight: [],
    ballCam: [{ kind: "padButton", index: 3 }],
    cameraLeft: [{ kind: "padAxis", axis: 2, dir: -1 }],
    cameraRight: [{ kind: "padAxis", axis: 2, dir: 1 }],
    cameraUp: [{ kind: "padAxis", axis: 3, dir: -1 }],
    cameraDown: [{ kind: "padAxis", axis: 3, dir: 1 }],
    takePossession: [{ kind: "padButton", index: 13 }],
    startDribble: [{ kind: "padButton", index: 12 }],
    passBall: [{ kind: "padButton", index: 14 }],
    launchBall: [{ kind: "padButton", index: 15 }],
    resetShot: [
      { kind: "padButton", index: 11 },
      { kind: "padButton", index: 8 }
    ],
    toggleSettings: [{ kind: "padButton", index: 9 }]
  };
}

/**
 * Generate complete default binding structure including axes configurations.
 */
export function createDefaultInputBindings() {
  return {
    keyboard: createDefaultKeyboardBindings(),
    pad: createDefaultGamepadBindings(),
    axes: {
      steer: { axis: 0, invert: false },
      pitch: { axis: 1, invert: false },
      deadzone: 0.12,
      triggerThreshold: 0.15
    }
  };
}

/**
 * Compare two input bindings for structural equivalence.
 * @param {any} a
 * @param {any} b
 * @returns {boolean}
 */
export function areBindingsEqual(a, b) {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === "key" && b.kind === "key") return a.code === b.code;
  if (a.kind === "mouse" && b.kind === "mouse") return a.button === b.button;
  if (a.kind === "padButton" && b.kind === "padButton") return a.index === b.index;
  if (a.kind === "padAxis" && b.kind === "padAxis") return a.axis === b.axis && a.dir === b.dir;
  return false;
}

/**
 * Check which input device category a binding source belongs to.
 * @param {{ kind: string }} binding
 * @returns {'keyboard'|'pad'}
 */
export function getBindingCategory(binding) {
  return binding.kind === "key" || binding.kind === "mouse" ? "keyboard" : "pad";
}

/**
 * Validate a binding object.
 * @param {any} b
 * @returns {boolean}
 */
export function validateBinding(b) {
  if (!isPlainObject(b)) return false;
  switch (b.kind) {
    case "key":
      return typeof b.code === "string" && b.code.length > 0;
    case "mouse":
      return Number.isInteger(b.button) && b.button >= 0;
    case "padButton":
      return Number.isInteger(b.index) && b.index >= 0;
    case "padAxis":
      return Number.isInteger(b.axis) && b.axis >= 0 && (b.dir === 1 || b.dir === -1);
    default:
      return false;
  }
}

/**
 * Assign or update a binding slot.
 * @param {any} bindings
 * @param {'keyboard'|'pad'} device
 * @param {string} action
 * @param {number} slot
 * @param {any} newBinding
 * @returns {{ changed: boolean }}
 */
export function assignBinding(bindings, device, action, slot, newBinding) {
  const currentSlots = bindings[device][action];
  if (
    getBindingCategory(newBinding) !== device ||
    !Number.isInteger(slot) ||
    slot < 0 ||
    slot > currentSlots.length ||
    slot >= 2
  ) {
    return { changed: false };
  }
  if (currentSlots.some(existing => areBindingsEqual(existing, newBinding))) {
    return { changed: false };
  }
  if (slot < currentSlots.length) {
    currentSlots[slot] = newBinding;
  } else {
    currentSlots.push(newBinding);
  }
  return { changed: true };
}

/**
 * Remove a binding at the specified slot.
 * @param {any} bindings
 * @param {'keyboard'|'pad'} device
 * @param {string} action
 * @param {number} slot
 */
export function removeBinding(bindings, device, action, slot) {
  const list = bindings[device][action];
  if (slot >= 0 && slot < list.length) {
    list.splice(slot, 1);
  }
}

/**
 * Reset bindings for a specific device ('keyboard' or 'pad').
 * @param {any} bindings
 * @param {'keyboard'|'pad'} device
 */
export function resetDeviceBindings(bindings, device) {
  bindings[device] = device === "keyboard" ? createDefaultKeyboardBindings() : createDefaultGamepadBindings();
}

/**
 * Reset axis configurations to default.
 * @param {any} bindings
 */
export function resetAxisBindings(bindings) {
  bindings.axes = createDefaultInputBindings().axes;
}

/**
 * Format browser KeyboardEvent.code into user-friendly display text.
 * @param {string} code
 * @returns {string}
 */
export function formatKeyDisplayName(code) {
  const custom = KEY_DISPLAY_NAMES[code];
  if (custom) return custom;
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `Num ${code.slice(6)}`;
  return code;
}

/**
 * Format Gamepad axis name.
 * @param {number} axis
 * @returns {string}
 */
export function formatAxisName(axis) {
  return AXIS_NAMES[axis] ?? `Axis ${axis}`;
}

/**
 * Format Gamepad axis direction name (e.g., "L Stick Left").
 * @param {number} axis
 * @param {number} dir
 * @returns {string}
 */
export function formatAxisDirectionName(axis, dir) {
  const stick = axis < 2 ? "L Stick" : "R Stick";
  return axis % 2 === 0
    ? `${stick} ${dir > 0 ? "Right" : "Left"}`
    : `${stick} ${dir > 0 ? "Down" : "Up"}`;
}

/**
 * Detect controller branding from Gamepad ID.
 * @param {string} id
 * @returns {'playstation'|'xbox'}
 */
export function detectControllerType(id) {
  return id && /playstation|dualshock|dualsense|sony|054c/i.test(id) ? "playstation" : "xbox";
}

/**
 * Format any binding into a short human-readable string.
 * @param {any} binding
 * @param {'playstation'|'xbox'} [controllerType='xbox']
 * @returns {string}
 */
export function formatBindingDisplayName(binding, controllerType = "xbox") {
  if (!binding) return "";
  switch (binding.kind) {
    case "key":
      return formatKeyDisplayName(binding.code);
    case "mouse":
      return MOUSE_BUTTON_NAMES[binding.button] ?? `Mouse ${binding.button + 1}`;
    case "padButton": {
      const names = controllerType === "playstation" ? PLAYSTATION_BUTTON_NAMES : XBOX_BUTTON_NAMES;
      return names[binding.index] ?? `Button ${binding.index}`;
    }
    case "padAxis":
      return formatAxisDirectionName(binding.axis, binding.dir);
    default:
      return "";
  }
}

/**
 * Retrieve user-friendly action label from action ID.
 * @param {string} actionId
 * @returns {string}
 */
export function getActionLabel(actionId) {
  const found = INPUT_ACTIONS.find(a => a.id === actionId);
  return found ? found.label : actionId;
}

function migrateAxisConfig(targetAxis, loadedAxis) {
  if (isPlainObject(loadedAxis)) {
    targetAxis.axis = clampNumberOrDefault(loadedAxis.axis, targetAxis.axis, { min: 0, max: 15, integer: true });
    targetAxis.invert = booleanOrDefault(loadedAxis.invert, targetAxis.invert);
  }
}

/**
 * Typed LocalStorage store for input bindings.
 */
export const inputBindingsStore = createLocalStorageStore(
  STORAGE_KEY_INPUT_BINDINGS,
  createDefaultInputBindings,
  (target, loaded) => {
    const loadedAxes = loaded.axes;
    if (isPlainObject(loadedAxes)) {
      migrateAxisConfig(target.axes.steer, loadedAxes.steer);
      migrateAxisConfig(target.axes.pitch, loadedAxes.pitch);
      target.axes.deadzone = clampNumberOrDefault(loadedAxes.deadzone, target.axes.deadzone, { min: 0, max: 0.5 });
      target.axes.triggerThreshold = clampNumberOrDefault(loadedAxes.triggerThreshold, target.axes.triggerThreshold, { min: 0.02, max: 0.9 });
    }

    for (const dev of ["keyboard", "pad"]) {
      const devObj = isPlainObject(loaded[dev]) ? loaded[dev] : {};
      for (const act of INPUT_ACTIONS) {
        const slots = filterArraySlice(devObj[act.id], validateBinding, 2);
        if (slots) {
          target[dev][act.id] = slots.filter(b => getBindingCategory(b) === dev);
        }
      }

      if (!Object.hasOwn(devObj, "airRoll")) {
        target[dev].airRoll = target[dev].powerslide.map(b => ({ ...b }));
      }

      for (const act of [...BALL_CONTROL_MODES, ...CAMERA_LOOK_ACTIONS]) {
        if (!Array.isArray(devObj[act])) {
          target[dev][act] = target[dev][act].filter(
            b =>
              !(
                b.kind === "padAxis" &&
                CAMERA_LOOK_ACTIONS.includes(act) &&
                (b.axis === target.axes.steer.axis || b.axis === target.axes.pitch.axis)
              ) &&
              !INPUT_ACTIONS.some(
                other => other.id !== act && Array.isArray(devObj[other.id]) && target[dev][other.id].some(o => areBindingsEqual(b, o))
              )
          );
        }
      }
    }
  }
);

export function loadInputBindings() {
  return inputBindingsStore.load();
}

export function saveInputBindings(bindings) {
  inputBindingsStore.save(bindings);
}

/**
 * Gamepad controller selection persistence.
 */
export const controllerSelectionStore = createLocalStorageStore(
  STORAGE_KEY_CONTROLLER_SELECTION,
  () => ({ id: null, index: null }),
  (target, loaded) => {
    if (typeof loaded.id === "string" && loaded.id.length > 0) target.id = loaded.id;
    if (typeof loaded.index === "number" && Number.isFinite(loaded.index) && loaded.index >= 0) {
      target.index = clampNumberOrDefault(loaded.index, 0, { min: 0, integer: true });
    }
  }
);

let cachedSelectedController;
export const ignoredControllerIndices = new Set();

/**
 * Get all connected Gamepad instances from navigator.
 * @returns {Gamepad[]}
 */
export function getConnectedGamepads() {
  try {
    if (typeof navigator === "undefined" || !navigator.getGamepads) return [];
    return navigator.getGamepads() ?? [];
  } catch {
    return [];
  }
}

/**
 * Get active controller preferences.
 * @returns {{ id: string|null, index: number|null }}
 */
export function getSelectedController() {
  if (!cachedSelectedController) {
    cachedSelectedController = controllerSelectionStore.load();
  }
  return { ...cachedSelectedController };
}

/**
 * Set active controller preference.
 * @param {{ id: string, index: number }|null} controller
 */
export function setSelectedController(controller) {
  const prev = getSelectedController();
  const next = controller ? { id: controller.id, index: controller.index } : { id: null, index: null };

  if (!(prev.id === next.id && prev.index === next.index)) {
    cachedSelectedController = next;
    ignoredControllerIndices.clear();
    if (controller) {
      for (const gp of getConnectedGamepads()) {
        if (gp && gp.connected && gp.id === controller.id && gp.index !== controller.index) {
          ignoredControllerIndices.add(gp.index);
        }
      }
    }
    controllerSelectionStore.save(next);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("controllerselectionchanged"));
    }
  }
}

/**
 * Find the primary active Gamepad according to preferences.
 * @returns {Gamepad|null}
 */
export function getEffectiveGamepad() {
  const sel = getSelectedController();
  const pads = getConnectedGamepads().filter(g => !!(g && g.connected));
  if (sel.id === null) {
    return pads.find(g => g.mapping === "standard") ?? pads[0] ?? null;
  }
  const matchingId = pads.filter(g => g.id === sel.id);
  const exact = matchingId.find(g => g.index === sel.index);
  if (exact) {
    for (const g of matchingId) {
      if (g.index !== exact.index) ignoredControllerIndices.add(g.index);
    }
    return exact;
  }
  const available = matchingId.filter(g => !ignoredControllerIndices.has(g.index));
  if (available.length !== 1) return null;
  const single = available[0];
  cachedSelectedController = { id: single.id, index: single.index };
  controllerSelectionStore.save(cachedSelectedController);
  return single;
}

// Backward-compatibility aliases
export const f0 = createDefaultKeyboardBindings;
export const p0 = createDefaultGamepadBindings;
export const m0 = createDefaultInputBindings;
export const g0 = areBindingsEqual;
export const v0 = getBindingCategory;
export const TC = assignBinding;
export const RC = removeBinding;
export const Pf = resetDeviceBindings;
export const PC = resetAxisBindings;
export const LC = formatKeyDisplayName;
export const Rh = detectControllerType;
export const Yo = formatAxisName;
export const OC = formatAxisDirectionName;
export const Hi = formatBindingDisplayName;
export const HC = validateBinding;
export const Li = getActionLabel;
export const j0 = inputBindingsStore;
export const UC = loadInputBindings;
export const qC = saveInputBindings;
export const Od = controllerSelectionStore;
export const OA = getConnectedGamepads;
export const Hd = getSelectedController;
export const $C = setSelectedController;
export const Ks = getEffectiveGamepad;
export const so = cachedSelectedController;
export const GA = ignoredControllerIndices;
