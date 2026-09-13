/**
 * Test Suite: Deobfuscation Phase 2 - HUD, Icons, & Performance Profiler
 * Verifies correctness, numerical accuracy, and backward-compatibility aliases.
 */

import assert from 'node:assert/strict';
import { ICONS, renderIcon, jM, Vt } from '../src/ui/Icons.js';
import { BoostGaugeHUD, boostToTrackX, BOOST_GAUGE_CONFIG, nB, um } from '../src/ui/BoostGaugeHUD.js';
import {
  PerformanceProfiler,
  PerformanceOverlayHUD,
  PROFILER_PHASES,
  PROFILER_HISTORY_LENGTH,
  STATUS_CHART_CONFIG,
  iB,
  aB
} from '../src/ui/PerformanceOverlayHUD.js';

console.log('[Test] Running Phase 2 HUD & Profiler validation suite...');

// --- 1. Icons Registry & Renderer ---
console.log('  Testing Icons.js...');
assert.equal(jM, ICONS, 'Alias jM must point to ICONS registry');
assert.equal(Vt, renderIcon, 'Alias Vt must point to renderIcon');

const expectedIcons = [
  'play', 'x', 'robot', 'check', 'trophy', 'sword', 'car-profile',
  'arrow-right', 'arrows-clockwise', 'game-controller', 'clock', 'gear',
  'camera', 'speaker', 'monitor', 'target', 'chart', 'expand', 'collapse', 'bolt'
];

for (const name of expectedIcons) {
  assert.ok(ICONS[name], `Icon "${name}" should exist in registry`);
  assert.ok(ICONS[name].includes('<svg'), `Icon "${name}" should contain <svg`);
  const rendered = renderIcon(name, 20);
  assert.ok(rendered.includes('width="20"'), `Rendered icon should have width 20`);
  assert.ok(rendered.includes('class="ui-icon"'), `Rendered icon should have class ui-icon`);
}

// Fallback on unknown icon
assert.equal(renderIcon('unknown_nonexistent_icon'), '', 'Unknown icon should return empty string');
console.log('  ✓ Icons.js passed.');

// --- 2. Boost Gauge Math & Configuration ---
console.log('  Testing BoostGaugeHUD.js math & aliases...');
assert.equal(nB, BoostGaugeHUD, 'Alias nB must point to BoostGaugeHUD');
assert.equal(um, boostToTrackX, 'Alias um must point to boostToTrackX');

assert.equal(BOOST_GAUGE_CONFIG.TRACK_START_X, 1);
assert.equal(BOOST_GAUGE_CONFIG.TRACK_END_X, 159);
assert.equal(BOOST_GAUGE_CONFIG.TRACK_WIDTH, 158);

// Test coordinate mapping
assert.equal(boostToTrackX(0), 1, 'Boost 0% must map to start X (1)');
assert.equal(boostToTrackX(100), 159, 'Boost 100% must map to end X (159)');
assert.equal(boostToTrackX(50), 1 + 0.5 * 158, 'Boost 50% must map to midpoint (80)');
// Test clamp boundaries
assert.equal(boostToTrackX(-20), 1, 'Negative boost must clamp to start X');
assert.equal(boostToTrackX(150), 159, 'Boost > 100 must clamp to end X');
console.log('  ✓ BoostGaugeHUD math passed.');

// --- 3. Mock DOM Test for BoostGaugeHUD ---
console.log('  Testing BoostGaugeHUD DOM behavior...');
class MockClassList {
  constructor() {
    this.classes = new Set();
  }
  add(cls) { this.classes.add(cls); }
  delete(cls) { this.classes.delete(cls); }
  has(cls) { return this.classes.has(cls); }
  toggle(cls, force) {
    if (force === undefined) {
      if (this.classes.has(cls)) {
        this.classes.delete(cls);
        return false;
      }
      this.classes.add(cls);
      return true;
    }
    if (force) {
      this.classes.add(cls);
      return true;
    }
    this.classes.delete(cls);
    return false;
  }
}

class MockElement {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.classList = new MockClassList();
    this.innerHTML = '';
    this.textContent = '';
    this.parentElement = null;
  }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k] ?? null; }
  removeAttribute(k) { delete this.attributes[k]; }
  insertAdjacentHTML(_pos, html) {
    this.innerHTML += html;
  }
  querySelector(_selector) {
    return new MockElement('div');
  }
  querySelectorAll() {
    return [];
  }
}

const mockContainer = new MockElement();
const gauge = new BoostGaugeHUD(mockContainer);
assert.ok(gauge.root, 'BoostGaugeHUD must bind root element');
assert.equal(gauge.lastValue, -1);
gauge.update(50, true, false);
assert.equal(gauge.lastValue, 50);
assert.equal(gauge.lastSpendingBoost, true);

gauge.update(100, false, true);
assert.equal(gauge.lastUnlimited, true);
assert.equal(gauge.figure.textContent, '∞');
console.log('  ✓ BoostGaugeHUD DOM lifecycle passed.');

// --- 4. PerformanceProfiler ---
console.log('  Testing PerformanceProfiler...');
assert.equal(iB, PerformanceProfiler, 'Alias iB must point to PerformanceProfiler');
assert.equal(aB, PerformanceOverlayHUD, 'Alias aB must point to PerformanceOverlayHUD');

const profiler = new PerformanceProfiler();
assert.equal(profiler.frameMs.length, PROFILER_HISTORY_LENGTH);
assert.equal(profiler.cpuMs.length, PROFILER_HISTORY_LENGTH);
assert.equal(profiler.phaseMs.length, PROFILER_PHASES.length);

// Empty snapshot test
const emptySnap = profiler.snapshot();
assert.equal(emptySnap.count, 0);
assert.equal(emptySnap.frame.fps, 0);

// Simulate presentation display frames
for (let i = 0; i < 30; i++) {
  profiler.displayFrame(1000 + i * 16.666);
}

// Simulate CPU frames
for (let i = 0; i < 60; i++) {
  profiler.frameStart();
  for (let p = 0; p < PROFILER_PHASES.length; p++) {
    profiler.mark();
  }
  profiler.frameEnd(2, i === 10 ? 1 : 0, false);
}

assert.equal(profiler.count, 59);
assert.equal(profiler.droppedTicks, 1);
assert.equal(profiler.clampedFrames, 1);

const snap = profiler.snapshot(120, 5);
assert.equal(snap.count, 59);
assert.ok(snap.refreshHz >= 55 && snap.refreshHz <= 65, `Detected refresh rate should be close to 60Hz, got ${snap.refreshHz}`);
assert.equal(snap.sim.ticksPerFrame, 2);
assert.equal(snap.sim.droppedTicks, 1);
assert.equal(snap.phases.length, PROFILER_PHASES.length + 1); // phases + 'other'

profiler.resetCounters();
assert.equal(profiler.droppedTicks, 0);
assert.equal(profiler.clampedFrames, 0);
console.log('  ✓ PerformanceProfiler passed.');

console.log('[Test] All Phase 2 tests successfully passed!');
