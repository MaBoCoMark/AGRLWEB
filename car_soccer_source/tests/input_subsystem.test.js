/**
 * tests/input_subsystem.test.js
 * Comprehensive unit test suite for Phase 4 Input Subsystem deobfuscation and modularization.
 */

import assert from 'node:assert/strict';

// Mock DOM / Browser environment for Node.js
const storageMap = new Map();
globalThis.localStorage = {
  getItem: (k) => storageMap.get(k) ?? null,
  setItem: (k, v) => storageMap.set(k, String(v)),
  removeItem: (k) => storageMap.delete(k),
  clear: () => storageMap.clear()
};

globalThis.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
  innerWidth: 1920,
  innerHeight: 1080,
  matchMedia: () => ({ matches: false, addEventListener: () => {} })
};

globalThis.document = {
  addEventListener: () => {},
  removeEventListener: () => {},
  createElement: () => ({
    className: '',
    style: {},
    appendChild: () => {},
    removeChild: () => {}
  }),
  body: { classList: { toggle: () => {} } }
};

if (typeof navigator !== 'undefined') {
  try {
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true, writable: true });
    Object.defineProperty(navigator, 'getGamepads', { value: () => [], configurable: true, writable: true });
  } catch {}
}

// Import input subsystem modules
import {
  INPUT_ACTIONS,
  ACTION_GROUPS,
  STORAGE_KEY_INPUT_BINDINGS,
  KEY_DISPLAY_NAMES,
  MOUSE_BUTTON_NAMES,
  XBOX_BUTTON_NAMES,
  PLAYSTATION_BUTTON_NAMES,
  // Backward compat
  io,
  kC,
  BC,
  Rf
} from '../src/input/InputConstants.js';

import {
  createDefaultKeyboardBindings,
  createDefaultGamepadBindings,
  createDefaultInputBindings,
  areBindingsEqual,
  getBindingCategory,
  validateBinding,
  assignBinding,
  removeBinding,
  resetDeviceBindings,
  resetAxisBindings,
  formatKeyDisplayName,
  formatBindingDisplayName,
  detectControllerType,
  formatAxisName,
  getActionLabel,
  loadInputBindings,
  saveInputBindings,
  // Backward compat
  f0,
  p0,
  m0,
  g0,
  v0,
  TC,
  RC,
  Pf,
  PC,
  LC,
  Rh,
  Yo,
  Hi,
  HC,
  Li,
  UC,
  qC
} from '../src/input/InputBindings.js';

import {
  KeyboardMouseController,
  isEventWithinUI,
  SC,
  Tf
} from '../src/input/KeyboardMouseController.js';

import {
  GamepadController,
  XC,
  WC
} from '../src/input/GamepadController.js';

import {
  touchSettingsStore,
  computeTouchLayoutBounds,
  normalizeTouchLayoutRect,
  isExtraActionEnabled,
  getScreenSafeArea,
  renderTouchControlsHtml,
  TouchControls,
  TouchLayoutEditor,
  ib,
  _M,
  La
} from '../src/input/TouchControls.js';

import {
  createLocalStorageStore,
  isPlainObject,
  clampNumberOrDefault,
  booleanOrDefault,
  stringOrDefault,
  filterArraySlice,
  rr,
  Dr,
  _r,
  jr
} from '../src/utils/StorageHelper.js';

console.log('[Test] Running Phase 4 MultiPlatform Input Subsystem validation suite...\n');

// 1. StorageHelper & Validation
console.log('  Testing StorageHelper & Validation Utilities...');
{
  assert.equal(isPlainObject({}), true);
  assert.equal(isPlainObject([]), false);
  assert.equal(isPlainObject(null), false);
  assert.equal(isPlainObject("test"), false);

  assert.equal(booleanOrDefault(true, false), true);
  assert.equal(booleanOrDefault("yes", false), false);

  assert.equal(clampNumberOrDefault(10, 0, { min: 0, max: 5 }), 5);
  assert.equal(clampNumberOrDefault(-2, 0, { min: 0, max: 5 }), 0);
  assert.equal(clampNumberOrDefault(3.7, 0, { integer: true }), 4);
  assert.equal(clampNumberOrDefault("not a number", 42), 42);

  assert.equal(stringOrDefault("arcade", ["realistic", "arcade"], "realistic"), "arcade");
  assert.equal(stringOrDefault("invalid", ["realistic", "arcade"], "realistic"), "realistic");

  const store = createLocalStorageStore('test.store.v1', () => ({ value: 100 }));
  assert.deepEqual(store.load(), { value: 100 });
  store.save({ value: 250 });
  assert.deepEqual(store.load(), { value: 250 });
  store.clear();
  assert.deepEqual(store.load(), { value: 100 });

  // Verify backward-compat aliases
  assert.equal(Dr({ a: 1 }), true);
  assert.equal(jr(false, true), false);
  assert.equal(_r(15, 0, { max: 10 }), 10);
  console.log('  ✓ StorageHelper passed.');
}

// 2. Input Constants & Action Schemas
console.log('  Testing Input Constants & Schemas...');
{
  assert.equal(INPUT_ACTIONS.length, 21, 'Must define all 21 game actions');
  assert.equal(ACTION_GROUPS.length, 5, 'Must contain 5 action groups');
  assert.equal(io, INPUT_ACTIONS, 'io must alias INPUT_ACTIONS');
  assert.equal(kC, ACTION_GROUPS, 'kC must alias ACTION_GROUPS');
  assert.equal(BC, STORAGE_KEY_INPUT_BINDINGS, 'BC must alias STORAGE_KEY_INPUT_BINDINGS');
  assert.equal(Rf.length, 4, 'Rf must contain 4 camera look actions');

  const actionIds = new Set(INPUT_ACTIONS.map(a => a.id));
  assert.ok(actionIds.has('throttleForward'));
  assert.ok(actionIds.has('throttleReverse'));
  assert.ok(actionIds.has('steerLeft'));
  assert.ok(actionIds.has('steerRight'));
  assert.ok(actionIds.has('boost'));
  assert.ok(actionIds.has('jump'));
  assert.ok(actionIds.has('powerslide'));
  assert.ok(actionIds.has('airRoll'));
  assert.ok(actionIds.has('ballCam'));
  assert.ok(actionIds.has('resetShot'));
  assert.ok(actionIds.has('toggleSettings'));
  console.log('  ✓ Input Constants passed.');
}

// 3. Input Bindings Defaults & Formatting
console.log('  Testing Input Bindings Defaults & Formatting...');
{
  const def = createDefaultInputBindings();
  assert.ok(def.keyboard, 'Must have default keyboard bindings');
  assert.ok(def.pad, 'Must have default pad bindings');
  assert.ok(def.axes, 'Must have default axes config');
  assert.equal(def.axes.deadzone, 0.12);
  assert.equal(def.axes.triggerThreshold, 0.15);

  // Formatting tests
  assert.equal(formatKeyDisplayName('KeyW'), 'W');
  assert.equal(formatKeyDisplayName('Space'), 'Space');
  assert.equal(formatKeyDisplayName('ShiftLeft'), 'L Shift');
  assert.equal(LC('KeyA'), 'A');

  // Controller types
  assert.equal(detectControllerType('Sony Interactive Entertainment Wireless Controller'), 'playstation');
  assert.equal(detectControllerType('Xbox Wireless Controller (STANDARD GAMEPAD)'), 'xbox');
  assert.equal(Rh('054c:0ce6 DualSense Wireless Controller'), 'playstation');

  // Axis names formatting
  assert.equal(formatAxisName(0), 'L Stick X');
  assert.equal(formatAxisName(1), 'L Stick Y');
  assert.equal(Yo(2), 'R Stick X');
  assert.equal(Yo(3), 'R Stick Y');
  assert.equal(Yo(4), 'Axis 4');

  // Display binding format
  const keyBind = { kind: 'key', code: 'KeyW' };
  const mouseBind = { kind: 'mouse', button: 0 };
  const padBtnBind = { kind: 'padButton', index: 0 };
  const padAxisBind = { kind: 'padAxis', axis: 0, dir: -1 };

  assert.equal(formatBindingDisplayName(keyBind), 'W');
  assert.equal(formatBindingDisplayName(mouseBind), 'L Mouse');
  assert.equal(formatBindingDisplayName(padBtnBind, 'xbox'), 'A');
  assert.equal(formatBindingDisplayName(padBtnBind, 'playstation'), 'Cross');
  assert.equal(formatBindingDisplayName(padAxisBind), 'L Stick Left');

  // Action labels
  assert.equal(getActionLabel('boost'), 'Boost');
  assert.equal(getActionLabel('powerslide'), 'Powerslide');
  assert.equal(Li('jump'), 'Jump');

  console.log('  ✓ Input Bindings & Formatting passed.');
}

// 4. Binding Mutations & Equality
console.log('  Testing Binding Mutations & Equality...');
{
  const a = { kind: 'key', code: 'KeyW' };
  const b = { kind: 'key', code: 'KeyW' };
  const c = { kind: 'key', code: 'KeyS' };
  const d = { kind: 'mouse', button: 0 };
  const e = { kind: 'padButton', index: 2 };
  const f = { kind: 'padAxis', axis: 1, dir: 1 };

  assert.equal(areBindingsEqual(a, b), true);
  assert.equal(areBindingsEqual(a, c), false);
  assert.equal(areBindingsEqual(a, d), false);
  assert.equal(g0(e, { kind: 'padButton', index: 2 }), true);
  assert.equal(g0(f, { kind: 'padAxis', axis: 1, dir: 1 }), true);

  assert.equal(getBindingCategory(a), 'keyboard');
  assert.equal(getBindingCategory(d), 'keyboard');
  assert.equal(getBindingCategory(e), 'pad');
  assert.equal(v0(f), 'pad');

  assert.equal(validateBinding(a), true);
  assert.equal(validateBinding({ kind: 'unknown' }), false);
  assert.equal(HC(d), true);

  const bindings = createDefaultInputBindings();
  const assignRes = assignBinding(bindings, 'keyboard', 'boost', 1, { kind: 'key', code: 'KeyB' });
  assert.equal(assignRes.changed, true);
  assert.equal(bindings.keyboard.boost.length, 2);
  assert.equal(bindings.keyboard.boost[1].code, 'KeyB');

  removeBinding(bindings, 'keyboard', 'boost', 1);
  assert.equal(bindings.keyboard.boost.length, 1);

  resetDeviceBindings(bindings, 'keyboard');
  assert.deepEqual(bindings.keyboard.boost, [{ kind: 'mouse', button: 0 }]);

  resetAxisBindings(bindings);
  assert.equal(bindings.axes.deadzone, 0.12);

  console.log('  ✓ Binding Mutations passed.');
}

// 5. KeyboardMouseController (SC)
console.log('  Testing KeyboardMouseController (SC)...');
{
  const bindings = createDefaultInputBindings();
  const km = new KeyboardMouseController(bindings);
  assert.equal(km.enabled, true);

  let resetTriggered = false;
  km.onReset = () => { resetTriggered = true; };

  // Simulate read when no keys are pressed
  const controls = km.read();
  assert.equal(controls.throttle, 0);
  assert.equal(controls.steer, 0);
  assert.equal(controls.pitch, 0);
  assert.equal(controls.yaw, 0);
  assert.equal(controls.roll, 0);
  assert.equal(controls.jump, false);
  assert.equal(controls.boost, false);
  assert.equal(controls.handbrake, false);

  // Simulate key presses
  km.keys.add('KeyW');
  km.keys.add('KeyD');
  km.keys.add('ShiftLeft'); // powerslide + air roll
  const pressedControls = km.read();
  assert.equal(pressedControls.throttle, 1, 'KeyW should give throttle 1');
  assert.equal(pressedControls.steer, 1, 'KeyD should give steer 1');
  assert.equal(pressedControls.pitch, -1, 'KeyW in air noses down / pitch -1');
  assert.equal(pressedControls.yaw, 0, 'Holding airRoll converts steer to roll');
  assert.equal(pressedControls.roll, 1, 'Holding airRoll with steer 1 produces roll 1');
  assert.equal(pressedControls.handbrake, true, 'ShiftLeft engages handbrake');

  // Verify backward compat alias
  assert.equal(SC, KeyboardMouseController);
  console.log('  ✓ KeyboardMouseController passed.');
}

// 6. GamepadController (XC)
console.log('  Testing GamepadController (XC)...');
{
  const bindings = createDefaultInputBindings();
  const gp = new GamepadController(bindings);
  assert.equal(gp.enabled, true);

  // Test deadzone math
  assert.equal(gp.dz(0.05, 0.1), 0, 'Inside deadzone must be 0');
  const outside = gp.dz(0.55, 0.1);
  assert.ok(Math.abs(outside - 0.5) < 0.001, 'Should linearly ramp from threshold');
  assert.equal(gp.dz(-0.55, 0.1), -outside, 'Negative input preserves sign');

  // Read with no gamepads connected
  const controls = gp.read();
  assert.equal(controls.throttle, 0);
  assert.equal(controls.steer, 0);
  assert.equal(gp.active(), false);

  // Backward compat alias
  assert.equal(XC, GamepadController);
  console.log('  ✓ GamepadController passed.');
}

// 7. Touch Controls & Layout Editor (ib, _M)
console.log('  Testing Touch Controls & Layout Editor (ib, _M)...');
{
  const defaults = touchSettingsStore.load();
  assert.ok(defaults.extras);
  assert.ok(defaults.layouts);

  assert.equal(isExtraActionEnabled('drive', defaults), true);
  assert.equal(isExtraActionEnabled('airRoll', defaults), false);

  const safeArea = { width: 1000, height: 600, left: 10, right: 10, top: 10, bottom: 10 };
  const layout = computeTouchLayoutBounds(defaults, safeArea);
  assert.ok(layout.drive, 'Layout must contain drive');
  assert.ok(layout.jump, 'Layout must contain jump');
  assert.ok(layout.boost, 'Layout must contain boost');
  assert.ok(layout.handbrake, 'Layout must contain handbrake');

  const normalized = normalizeTouchLayoutRect(layout.drive, safeArea);
  assert.ok(normalized.x >= 0 && normalized.x <= 1);
  assert.ok(normalized.y >= 0 && normalized.y <= 1);

  const html = renderTouchControlsHtml();
  assert.ok(html.includes('data-touch-stick'));
  assert.ok(html.includes('data-touch-control="boost"'));

  // Backward compat aliases
  assert.equal(ib, TouchControls);
  assert.equal(_M, TouchLayoutEditor);
  assert.equal(La, touchSettingsStore);
  console.log('  ✓ Touch Controls passed.');
}

console.log('\n[Test] All Phase 4 MultiPlatform Input Subsystem tests successfully passed!');
