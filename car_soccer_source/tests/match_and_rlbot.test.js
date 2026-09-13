import fs from "node:fs";
/**
 * tests/match_and_rlbot.test.js
 * Comprehensive unit test suite for Phase 5:
 * MatchStateMachine, MatchDialog, and RLBotAgent subsystems.
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
  setTimeout: (fn) => setTimeout(fn, 0),
  clearTimeout: (id) => clearTimeout(id),
  requestAnimationFrame: (cb) => setTimeout(cb, 16),
  cancelAnimationFrame: (id) => clearTimeout(id)
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
  body: { classList: { toggle: () => {}, add: () => {}, remove: () => {} } }
};

if (typeof navigator !== 'undefined') {
  try {
    Object.defineProperty(navigator, 'getGamepads', {
      value: () => [],
      configurable: true,
      writable: true
    });
  } catch {}
}

import {
  MatchStateMachine,
  DEFAULT_MATCH_STATE,
  formatMatchTime,
  MATCH_TICK_RATE,
  DEFAULT_MATCH_DURATION_TICKS,
  KICKOFF_COUNTDOWN_TICKS,
  GOAL_RESET_TICKS,
  VM,
  qM,
  sm,
  Is,
  am,
  om,
  zM
} from '../src/game/MatchStateMachine.js';

import {
  BOT_POLICIES,
  getBotPolicy,
  botSettingsStore,
  DEFAULT_CAR_CONTROLS,
  encodeCarControls,
  decodeCarControls,
  NEXTO_ACTION_TABLE,
  getNextoKickoffControls,
  wrapTensorInputs,
  NextoAdapter,
  NectoAdapter,
  SeerAdapter,
  createBotAdapter,
  RLBotAgent,
  pl,
  JA,
  wA,
  Eg,
  ed,
  Am,
  XM,
  lm,
  JM,
  KM,
  ZM,
  Dc,
  QM,
  dm
} from '../src/ai/RLBotAgent.js';

import { MatchDialog, $M } from '../src/ui/MatchDialog.js';

console.log("# [Test] Running Phase 5 Match & RLBot Subsystem validation suite...");

// --- Suite 1: MatchStateMachine Tests ---
console.log("#   Testing MatchStateMachine & Match Rules...");

// 1. Aliases identity check
assert.strictEqual(VM, MatchStateMachine, "VM alias must equal MatchStateMachine");
assert.strictEqual(qM, DEFAULT_MATCH_STATE, "qM alias must equal DEFAULT_MATCH_STATE");
assert.strictEqual(sm, formatMatchTime, "sm alias must equal formatMatchTime");
assert.strictEqual(Is, 120, "Is tick rate must be 120");
assert.strictEqual(am, 36000, "am match duration ticks must be 36000");
assert.strictEqual(om, 360, "om kickoff countdown ticks must be 360");
assert.strictEqual(zM, 360, "zM goal reset ticks must be 360");

// 2. formatMatchTime
assert.strictEqual(formatMatchTime(300), "5:00");
assert.strictEqual(formatMatchTime(299.8, true), "5:00");
assert.strictEqual(formatMatchTime(299.8, false), "4:59");
assert.strictEqual(formatMatchTime(65), "1:05");
assert.strictEqual(formatMatchTime(3), "0:03");
assert.strictEqual(formatMatchTime(0), "0:00");

// 3. Match Lifecycle
const match = new MatchStateMachine();
assert.strictEqual(match.state.mode, "freeplay");
assert.strictEqual(match.state.phase, "playing");
assert.strictEqual(match.tick(), "none"); // Freeplay ticks do nothing

// Start match
match.start();
assert.strictEqual(match.state.mode, "match");
assert.strictEqual(match.state.phase, "kickoff");
assert.strictEqual(match.state.countdown, 3);
assert.strictEqual(match.state.blueScore, 0);
assert.strictEqual(match.state.orangeScore, 0);

// Tick through countdown (3 seconds = 360 ticks)
for (let i = 0; i < 359; i++) {
  match.tick();
}
assert.strictEqual(match.state.phase, "kickoff");
assert.strictEqual(match.state.countdown, 1);

match.tick(); // Tick 360
assert.strictEqual(match.state.phase, "playing");

// Clock doesn't count down until kickoff is touched
for (let i = 0; i < 120; i++) {
  match.tick({ kickoffTouched: false });
}
assert.strictEqual(match.state.remainingSeconds, 300);

// Kickoff touch starts clock
match.tick({ kickoffTouched: true });
for (let i = 0; i < 119; i++) {
  match.tick();
}
assert.strictEqual(match.state.remainingSeconds, 299);

// Goal scored by Blue
match.tick({ goal: 1 });
assert.strictEqual(match.state.blueScore, 1);
assert.strictEqual(match.state.orangeScore, 0);
assert.strictEqual(match.state.scorer, 0);
assert.strictEqual(match.state.phase, "goal");

// Goal reset countdown (3 seconds = 360 ticks)
for (let i = 0; i < 359; i++) {
  assert.strictEqual(match.tick(), "none");
}
assert.strictEqual(match.tick(), "kickoff"); // Triggers kickoff
assert.strictEqual(match.state.phase, "kickoff");
assert.strictEqual(match.state.countdown, 3);

// Leave match
match.leave();
assert.strictEqual(match.state.mode, "freeplay");
assert.strictEqual(match.state.phase, "playing");

console.log("#   ✓ MatchStateMachine passed.");

// --- Suite 2: RLBot Policy & Controls Encoding Tests ---
console.log("#   Testing RLBot Policy, Adapters & Controls...");

// 1. Bot Policies check
assert.strictEqual(BOT_POLICIES.length, 3);
assert.strictEqual(pl, BOT_POLICIES);
assert.strictEqual(getBotPolicy("nexto")?.rank, "GC");
assert.strictEqual(getBotPolicy("necto")?.rank, "Diamond");
assert.strictEqual(getBotPolicy("seer")?.rank, "Platinum");
assert.strictEqual(JA("nexto"), getBotPolicy("nexto"));

// 2. Controls encoding & decoding
const sampleControls = {
  throttle: 1,
  steer: -0.5,
  pitch: 0.2,
  yaw: -0.5,
  roll: 0.8,
  jump: true,
  boost: true,
  handbrake: false
};

const encoded = encodeCarControls(sampleControls);
assert.strictEqual(encoded.length, 8);
assert.strictEqual(encoded[0], 1);
assert.strictEqual(encoded[1], -0.5);
assert.strictEqual(encoded[5], 1); // jump boolean -> 1
assert.strictEqual(encoded[6], 1); // boost boolean -> 1
assert.strictEqual(encoded[7], 0); // handbrake boolean -> 0

const decoded = decodeCarControls(encoded);
assert.strictEqual(decoded.throttle, 1);
assert.strictEqual(decoded.steer, -0.5);
assert.strictEqual(decoded.jump, true);
assert.strictEqual(decoded.boost, true);
assert.strictEqual(decoded.handbrake, false);

assert.strictEqual(Eg, encodeCarControls);
assert.strictEqual(ed, decodeCarControls);
assert.strictEqual(wA, DEFAULT_CAR_CONTROLS);

// 3. Nexto Action Table
assert.strictEqual(NEXTO_ACTION_TABLE.length, 90, "Nexto action table must contain 90 discrete actions");
assert.strictEqual(Am, NEXTO_ACTION_TABLE);

// 4. Scripted Kickoff
const mockKickoffState = new Float32Array(256);
mockKickoffState[5] = 0; // Ball Y = 0 (kickoff line)
const kickoffC = getNextoKickoffControls(mockKickoffState, 10);
assert.notStrictEqual(kickoffC, null);
assert.strictEqual(kickoffC.throttle, 1);
assert.strictEqual(kickoffC.boost, true);

// 5. Bot Settings Store
assert.strictEqual(botSettingsStore.load().botId, "nexto");
botSettingsStore.save({ botId: "seer" });
assert.strictEqual(botSettingsStore.load().botId, "seer");
botSettingsStore.save({ botId: "invalid_id" });
assert.strictEqual(botSettingsStore.load().botId, "nexto"); // Fallback resets to default valid id
assert.strictEqual(dm, botSettingsStore);

console.log("#   ✓ RLBot Policy & Controls passed.");

// --- Suite 3: Adapters & Agent Tests ---
console.log("#   Testing Model Adapters & Agent Fallback...");

// 1. Adapters initialization
const nextoAd = createBotAdapter("nexto");
assert.ok(nextoAd instanceof NextoAdapter);
assert.strictEqual(JM, NextoAdapter);
const nextoInputs = nextoAd.initialInputs();
assert.ok(nextoInputs.query.data instanceof Float32Array);
assert.ok(nextoInputs.entities.data instanceof Float32Array);
assert.ok(nextoInputs.mask.data instanceof Float32Array);

const nectoAd = createBotAdapter("necto");
assert.ok(nectoAd instanceof NectoAdapter);
assert.strictEqual(KM, NectoAdapter);
const nectoInputs = nectoAd.initialInputs();
assert.strictEqual(nectoInputs.query.dims[2], 32);

const seerAd = createBotAdapter("seer");
assert.ok(seerAd instanceof SeerAdapter);
assert.strictEqual(ZM, SeerAdapter);
const seerInputs = seerAd.initialInputs();
assert.strictEqual(seerInputs.observation.dims[1], 159);
assert.strictEqual(seerInputs.hidden.dims[2], 512);

// 2. RLBotAgent fallback mode & heuristic decisions
const agent = new RLBotAgent("nexto");
assert.strictEqual(agent.id, "nexto");
assert.strictEqual(agent.option.rank, "GC");
assert.strictEqual(agent.fallbackMode, false);

// In Node environment without Worker, load() triggers fallbackMode cleanly without throwing
await agent.loadPolicy("nexto");
assert.strictEqual(agent.fallbackMode, true, "Agent should smoothly enter fallbackMode when Worker is unavailable");
assert.strictEqual(agent.isReady, true);

// Test heuristic decision in fallback mode
const mockSimState = new Float32Array(256);
mockSimState[2] = 2; // NUM_CARS = 2
// Car 0 (Player) at [0, -1000, 17]
// Car 1 (Bot) at [0, 1000, 17], facing [0, -1, 0]
const botOffset = 22 + 1 * 51;
mockSimState[botOffset + 0] = 0;
mockSimState[botOffset + 1] = 1000;
mockSimState[botOffset + 2] = 17;
mockSimState[botOffset + 3] = 0; // FWD X
mockSimState[botOffset + 4] = -1; // FWD Y (facing towards ball at center)
mockSimState[botOffset + 5] = 0;
mockSimState[botOffset + 18] = 50; // BOOST = 50
mockSimState[botOffset + 19] = 1; // ON_GROUND = 1
// Ball at [0, 0, 93]
mockSimState[4] = 0;
mockSimState[5] = 0;
mockSimState[6] = 93;

const botControls = await agent.decide(mockSimState, [], 1, 0);
assert.ok(botControls.throttle > 0, "Bot should throttle forward towards ball");
assert.strictEqual(typeof botControls.steer, "number");
assert.strictEqual(typeof botControls.boost, "boolean");

agent.dispose();
assert.strictEqual(agent.controls.throttle, 0);

console.log("#   ✓ Adapters & Agent passed.");

// --- Suite 4: MatchDialog Aliases & Structure ---
console.log("#   Testing MatchDialog ($M)...");
assert.strictEqual($M, MatchDialog);

// Verify CarSoccerEngine.js properly imports $M
const engineSource = fs.readFileSync(new URL("../src/game/CarSoccerEngine.js", import.meta.url), "utf-8");
assert.ok(
  engineSource.includes("$M") && new RegExp(`import\\s*\\{[^}]*\\$M[^}]*\\}\\s*from\\s*["\']\\.\\./ui/MatchDialog\\.js["\']`).test(engineSource),
  "CarSoccerEngine.js must explicitly import $M alias from MatchDialog.js to prevent ReferenceError"
);

// Verify MatchDialog instantiation in headless DOM
const mockEl = () => ({
  children: [],
  dataset: {},
  classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
  style: {},
  setAttribute: () => {},
  getAttribute: () => null,
  addEventListener: () => {},
  removeEventListener: () => {},
  querySelector: () => mockEl(),
  querySelectorAll: () => [mockEl()],
  contains: () => true,
  focus: () => {},
  scrollIntoView: () => {},
  insertAdjacentHTML: () => {},
  hidden: false,
  disabled: false,
  offsetParent: {}
});

const mockContainer = mockEl();
if (!globalThis.document.querySelector) {
  globalThis.document.querySelector = () => mockEl();
  globalThis.document.querySelectorAll = () => [mockEl()];
  globalThis.document.activeElement = mockEl();
}

const dialog = new $M(mockContainer, {
  playerTeam: 0,
  botId: "nexto",
  onSelectBot: () => {},
  onOpenChange: () => {},
  onResume: () => {},
  onStart: async () => {},
  onLeave: () => {}
});
assert.strictEqual(dialog.isOpen, false);
console.log("#   ✓ MatchDialog ($M) passed.");

console.log("# [Test] All Phase 5 Match & RLBot Subsystem tests successfully passed!");
