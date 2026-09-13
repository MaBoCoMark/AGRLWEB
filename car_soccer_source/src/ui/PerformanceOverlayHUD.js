/**
 * PerformanceOverlayHUD.js
 * Comprehensive profiling and HUD overlay for Car Soccer (deobfuscates iB & aB).
 *
 * Includes:
 * - PerformanceProfiler: High-performance circular buffers tracking frame presentation times,
 *   CPU render phase breakdowns, 120Hz physics sub-ticks, dropped frames, and refresh rate detection.
 * - PerformanceOverlayHUD: Interactive in-game overlay featuring summary metrics,
 *   sub-system phase latency tables, simulation tick rates, Three.js renderer memory/draw-call counters,
 *   SVG latency sparkline charts with budget ceilings, and gamepad navigation support.
 */

import { renderIcon } from './Icons.js';

export const PROFILER_PHASES = ['sim', 'scene', 'camera', 'prep', 'bloom', 'final'];
export const PROFILER_HISTORY_LENGTH = 10000;
export const DISPLAY_SAMPLE_COUNT = 120;
export const MAX_FRAME_GAP_MS = 1000;
export const KNOWN_REFRESH_RATES = [
  30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 175, 200, 240, 360, 480, 500, 540, 600
];

export const STATUS_CHART_CONFIG = {
  WIDTH: 260,
  HEIGHT: 54,
  UPDATE_RATE_HZ: 6,
  HISTORY_SECONDS: 10
};

/**
 * Low-overhead performance sampler and statistical profiler (deobfuscates iB)
 */
export class PerformanceProfiler {
  constructor() {
    this.frameMs = new Float32Array(PROFILER_HISTORY_LENGTH);
    this.cpuMs = new Float32Array(PROFILER_HISTORY_LENGTH);
    this.stamp = new Float64Array(PROFILER_HISTORY_LENGTH);
    this.phaseMs = PROFILER_PHASES.map(() => new Float32Array(PROFILER_HISTORY_LENGTH));
    this.ticks = new Float32Array(PROFILER_HISTORY_LENGTH);
    this.scratch = new Float32Array(PROFILER_HISTORY_LENGTH);

    this.write = 0;
    this.count = 0;
    this.frameStartedAt = 0;
    this.previousFrameAt = 0;
    this.lastMarkAt = 0;
    this.phaseIndex = 0;
    this.pending = new Float32Array(PROFILER_PHASES.length);

    this.droppedTicks = 0;
    this.clampedFrames = 0;
    this.stalls = 0;
    this.resumes = 0;

    this.displayMs = new Float32Array(DISPLAY_SAMPLE_COUNT);
    this.previousDisplayAt = -1;
    this.displayWrite = 0;
    this.displayCount = 0;
  }

  /**
   * Records a display presentation event from requestAnimationFrame
   * @param {number} timestamp - Performance timestamp
   */
  displayFrame(timestamp) {
    const delta = timestamp - this.previousDisplayAt;
    if (this.previousDisplayAt >= 0 && delta > 0 && delta < MAX_FRAME_GAP_MS) {
      this.displayMs[this.displayWrite] = delta;
      this.displayWrite = (this.displayWrite + 1) % DISPLAY_SAMPLE_COUNT;
      this.displayCount = Math.min(this.displayCount + 1, DISPLAY_SAMPLE_COUNT);
    }
    this.previousDisplayAt = timestamp;
  }

  /**
   * Marks start of a CPU render frame
   */
  frameStart() {
    const now = performance.now();
    this.previousFrameAt = this.frameStartedAt;
    this.frameStartedAt = now;
    this.lastMarkAt = now;
    this.phaseIndex = 0;
    this.pending.fill(0);
  }

  /**
   * Marks transition between frame phases (sim -> scene -> camera -> prep -> bloom -> final)
   */
  mark() {
    if (this.phaseIndex >= PROFILER_PHASES.length) return;
    const now = performance.now();
    this.pending[this.phaseIndex] = now - this.lastMarkAt;
    this.lastMarkAt = now;
    this.phaseIndex += 1;
  }

  /**
   * Finalizes CPU frame record and commits measurements to circular ring buffers
   * @param {number} ticks - Physics sub-ticks simulated during this frame
   * @param {number} dropped - Sub-ticks dropped to avoid spiral of death
   * @param {boolean} stalled - Whether physical simulation stalled
   */
  frameEnd(ticks, dropped = 0, stalled = false) {
    if (this.previousFrameAt === 0) return;
    const cpuDuration = performance.now() - this.frameStartedAt;
    if (this.frameStartedAt - this.previousFrameAt > MAX_FRAME_GAP_MS) {
      this.resumes += 1;
      return;
    }

    const frameDelta = this.frameStartedAt - this.previousFrameAt;
    const writeIdx = this.write;

    this.frameMs[writeIdx] = frameDelta;
    this.cpuMs[writeIdx] = cpuDuration;
    this.stamp[writeIdx] = this.frameStartedAt;

    for (let p = 0; p < PROFILER_PHASES.length; p += 1) {
      this.phaseMs[p][writeIdx] = this.pending[p];
    }

    this.ticks[writeIdx] = ticks;
    this.write = (this.write + 1) % PROFILER_HISTORY_LENGTH;
    if (this.count < PROFILER_HISTORY_LENGTH) {
      this.count += 1;
    }

    if (dropped > 0) {
      this.droppedTicks += dropped;
      this.clampedFrames += 1;
    }
    if (stalled) {
      this.stalls += 1;
    }
  }

  resetCounters() {
    this.droppedTicks = 0;
    this.clampedFrames = 0;
    this.stalls = 0;
    this.resumes = 0;
  }

  at(offset) {
    return ((this.write - this.count + PROFILER_HISTORY_LENGTH) % PROFILER_HISTORY_LENGTH + offset) % PROFILER_HISTORY_LENGTH;
  }

  percentile(sortedArr, len, p) {
    if (len === 0) return 0;
    const idx = Math.min(len - 1, Math.max(0, Math.round(p * (len - 1))));
    return sortedArr[idx];
  }

  statsOf(sourceArr, len) {
    let sum = 0;
    for (let i = 0; i < len; i += 1) {
      const val = sourceArr[this.at(i)];
      this.scratch[i] = val;
      sum += val;
    }
    const sorted = this.scratch.subarray(0, len);
    sorted.sort();
    const avg = sum / len;
    return {
      avgMs: avg,
      p50: this.percentile(sorted, len, 0.5),
      p95: this.percentile(sorted, len, 0.95),
      p99: this.percentile(sorted, len, 0.99),
      worstMs: sorted[len - 1],
      fps: avg > 0 ? 1000 / avg : 0
    };
  }

  /**
   * Produces a comprehensive statistical snapshot over a rolling time window
   * @param {number} historyBins - Number of sparkline graph columns
   * @param {number} historySeconds - Time window in seconds
   */
  snapshot(historyBins = 240, historySeconds = 10) {
    if (this.count > 0) {
      const cutoff = this.stamp[this.at(this.count - 1)] - historySeconds * 1000;
      while (this.count > 1 && this.stamp[this.at(0)] < cutoff) {
        this.count -= 1;
      }
    }

    const n = this.count;
    const emptyStats = { avgMs: 0, p50: 0, p95: 0, p99: 0, worstMs: 0, fps: 0 };
    if (n === 0) {
      return {
        count: 0,
        windowSeconds: 0,
        frame: emptyStats,
        cpu: emptyStats,
        refreshHz: 60,
        budgetMs: 1000 / 60,
        overBudgetPct: 0,
        phases: [],
        sim: { ticksPerFrame: 0, droppedTicks: 0, clampedFrames: 0, stalls: 0 },
        history: new Float32Array(0),
        historySeconds: 0
      };
    }

    const frameStats = this.statsOf(this.frameMs, n);
    const cpuStats = this.statsOf(this.cpuMs, n);

    this.scratch.set(this.displayMs.subarray(0, this.displayCount));
    const sortedDisplay = this.scratch.subarray(0, this.displayCount);
    sortedDisplay.sort();
    const p10Display = this.percentile(sortedDisplay, this.displayCount, 0.1);

    let refreshHz = p10Display > 0 ? 1000 / p10Display : 60;
    let snapped = false;
    for (const rate of KNOWN_REFRESH_RATES) {
      if (Math.abs(refreshHz - rate) / rate < 0.08) {
        refreshHz = rate;
        snapped = true;
        break;
      }
    }
    if (!snapped) {
      refreshHz = Math.round(refreshHz);
    }

    const budgetMs = 1000 / refreshHz;
    let overBudgetCount = 0;
    for (let i = 0; i < n; i += 1) {
      if (this.frameMs[this.at(i)] > budgetMs * 1.02) {
        overBudgetCount += 1;
      }
    }

    const phases = [];
    let totalPhasesAvg = 0;
    for (let p = 0; p < PROFILER_PHASES.length; p += 1) {
      let phaseSum = 0;
      for (let i = 0; i < n; i += 1) {
        phaseSum += this.phaseMs[p][this.at(i)];
      }
      const phaseAvg = phaseSum / n;
      totalPhasesAvg += phaseAvg;
      phases.push({ phase: PROFILER_PHASES[p], avgMs: phaseAvg, share: 0 });
    }

    const otherAvg = Math.max(0, cpuStats.avgMs - totalPhasesAvg);
    phases.push({ phase: 'other', avgMs: otherAvg, share: 0 });
    for (const ph of phases) {
      ph.share = cpuStats.avgMs > 0 ? ph.avgMs / cpuStats.avgMs : 0;
    }

    let totalTicks = 0;
    for (let i = 0; i < n; i += 1) {
      totalTicks += this.ticks[this.at(i)];
    }

    const bins = Math.max(1, Math.round(historyBins));
    const history = new Float32Array(bins);
    const newestStamp = this.stamp[this.at(n - 1)];
    const windowMs = historySeconds * 1000;
    const msPerBin = windowMs / bins;
    let oldestStamp = newestStamp;

    for (let i = 0; i < n; i += 1) {
      const idx = this.at(i);
      const ageMs = newestStamp - this.stamp[idx];
      if (ageMs > windowMs) continue;
      if (this.stamp[idx] < oldestStamp) {
        oldestStamp = this.stamp[idx];
      }
      const binIdx = Math.min(bins - 1, bins - 1 - Math.floor(ageMs / msPerBin));
      if (this.frameMs[idx] > history[binIdx]) {
        history[binIdx] = this.frameMs[idx];
      }
    }

    for (let i = 1; i < bins; i += 1) {
      if (history[i] === 0) history[i] = history[i - 1];
    }
    for (let i = bins - 2; i >= 0; i -= 1) {
      if (history[i] === 0) history[i] = history[i + 1];
    }

    return {
      count: n,
      windowSeconds: (newestStamp - oldestStamp) / 1000,
      frame: frameStats,
      cpu: cpuStats,
      refreshHz,
      budgetMs,
      overBudgetPct: (overBudgetCount / n) * 100,
      phases,
      sim: {
        ticksPerFrame: totalTicks / n,
        droppedTicks: this.droppedTicks,
        clampedFrames: this.clampedFrames,
        stalls: this.stalls
      },
      history,
      historySeconds: Math.min(historySeconds, (newestStamp - oldestStamp) / 1000)
    };
  }
}

/**
 * Performance and Diagnostics HUD Overlay (deobfuscates aB)
 */
export class PerformanceOverlayHUD {
  /**
   * @param {HTMLElement} container - UI parent element
   * @param {PerformanceProfiler} profiler - Profiler engine instance
   * @param {THREE.WebGLRenderer} renderer - Three.js WebGL renderer
   * @param {Object} settings - Active performance overlay settings
   * @param {(isOpen: boolean) => void} [onDetailsChange] - Overlay expansion callback
   * @param {Object} [options] - Injected helpers for testing or decoupling
   */
  constructor(container, profiler, renderer, settings, onDetailsChange = () => {}, options = {}) {
    this.root = null;
    this.profiler = profiler;
    this.renderer = renderer;
    this.settings = settings;
    this.onDetailsChange = onDetailsChange;
    this.options = options;

    this.timer = 0;
    this.compact = window.matchMedia('(max-width: 860px), (max-height: 500px), (pointer: coarse)');
    this.summary = null;
    this.details = null;
    this.expanded = false;

    this.padPoll = 0;
    this.padKey = null;
    this.padPrevious = [];
    this.padDirection = 0;
    this.padRepeatAt = 0;
    this.padWaitForNeutral = true;

    const iconRenderer = options.renderIcon || renderIcon;
    const { WIDTH, HEIGHT, HISTORY_SECONDS } = STATUS_CHART_CONFIG;

    this.pollPad = (timestamp) => {
      if (!this.expanded) {
        this.padPoll = 0;
        return;
      }
      this.padPoll = requestAnimationFrame(this.pollPad);

      const gamepad = typeof options.getGamepad === 'function'
        ? options.getGamepad()
        : (typeof Ks === 'function' ? Ks() : null);

      const padKey = gamepad ? JSON.stringify([gamepad.id, gamepad.index]) : null;
      if (padKey !== this.padKey) {
        this.padKey = padKey;
        this.padPrevious = ((gamepad?.buttons) ?? []).map(b => b.pressed);
        this.padWaitForNeutral = true;
        this.padDirection = 0;
        return;
      }

      if (!gamepad) return;
      const isDown = (btn) => gamepad.buttons[btn]?.pressed ?? false;
      const isJustPressed = (btn) => {
        const pressed = isDown(btn);
        const just = pressed && !this.padPrevious[btn];
        this.padPrevious[btn] = pressed;
        return just;
      };

      // Button B (Index 1): Close details
      if (isJustPressed(1)) {
        this.hideDetails();
        return;
      }

      // Button A (Index 0): Click active button
      if (isJustPressed(0)) {
        document.body.classList.add('pad-nav');
        const active = document.activeElement;
        if (active instanceof HTMLButtonElement && this.root.contains(active)) {
          active.click();
        }
        return;
      }

      const axisY = gamepad.axes[1] ?? 0;
      const dir = (isDown(13) ? 1 : 0) - (isDown(12) ? 1 : 0) || (Math.abs(axisY) > 0.55 ? Math.sign(axisY) : 0);

      if (this.padWaitForNeutral) {
        if (dir === 0) this.padWaitForNeutral = false;
        return;
      }

      if (dir === 0) {
        this.padDirection = 0;
        return;
      }

      if (dir !== this.padDirection) {
        this.padDirection = dir;
        this.padRepeatAt = timestamp + 380;
      } else {
        if (timestamp < this.padRepeatAt) return;
        this.padRepeatAt = timestamp + 160;
      }

      document.body.classList.add('pad-nav');
      const buttons = Array.from(this.root.querySelectorAll('button')).filter(b => !b.disabled && b.getClientRects().length > 0);
      const nextIdx = buttons.indexOf(document.activeElement) + dir;
      if (nextIdx >= 0 && nextIdx < buttons.length) {
        buttons[nextIdx].focus();
      } else {
        this.details.scrollBy({ top: dir * 70, behavior: 'instant' });
      }
    };

    container.insertAdjacentHTML('beforeend', `
      <div id="status-overlay" class="status" hidden aria-hidden="true">
        <button id="status-summary" class="status__summary" type="button" hidden
                aria-expanded="false" aria-controls="status-details" aria-label="Show status details">
          <span id="status-summary-metrics" class="status__summary-metrics" data-el="summaryMetrics">
            <span><strong data-el="summaryFps">...</strong> fps</span>
            <span><strong data-el="summaryMs">...</strong> ms</span>
          </span>
          <span class="status__summary-label" data-el="summaryLabel" hidden>Status</span>
          <span class="status__summary-arrow" aria-hidden="true">${iconRenderer('arrow-right', 16)}</span>
        </button>
        <div id="status-details" class="status__details">
          <p class="status__empty" data-el="statusEmpty" hidden>No readouts selected. Choose them in Settings.</p>
          <div class="status__section" data-section="fps" hidden>
            <div class="status__hero">
              <span class="status__pair" title="Current frames per second, screen refresh rate, and render scale.">
                <span class="status__value" data-el="statFpsSimple">—</span>
                <span class="status__sep" style="color:rgba(255,255,255,0.4);margin:0 4px;font-weight:300;">/</span>
                <span class="status__hz" data-el="statHzSimple" style="color:rgba(255,255,255,0.45);font-weight:400;font-size:0.85em;">—</span>
                <span class="status__unit" style="margin-left:6px;">fps</span>
                <span class="status__scale" data-el="statScaleSimple" style="color:rgba(255,255,255,0.75);margin-left:8px;font-weight:500;font-size:0.9em;">—</span>
              </span>
            </div>
          </div>
          <div class="status__section" data-section="frame" hidden>
            <div class="status__hero">
              <span class="status__pair" title="Rendered frames per second. Screen presentation follows the display refresh rate.">
                <span class="status__value" data-el="statFps">—</span>
                <span class="status__unit">fps</span>
              </span>
              <span class="status__pair status__pair--alt">
                <span class="status__value" data-el="statFrame">—</span>
                <span class="status__unit">ms</span>
              </span>
            </div>
            <dl class="status__figures">
              ${[['p50', 'statP50'], ['p95', 'statP95'], ['p99', 'statP99'], ['max', 'statWorst']].map(([lbl, el]) =>
                `<div><dt>${lbl}</dt><dd data-el="${el}">—</dd></div>`
              ).join('')}
            </dl>
          </div>

          <div class="status__section" data-section="chart" hidden>
            <svg class="status__chart" viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="none" aria-hidden="true">
              <g class="status__grid" data-el="chartGrid"></g>
              <line class="status__budget" data-el="chartBudget" x1="0" y1="${HEIGHT / 2}" x2="${WIDTH}" y2="${HEIGHT / 2}" />
              <path class="status__over" data-el="chartOver" d="" />
              <polyline class="status__trace" data-el="chartTrace" points="" />
            </svg>
            <p class="status__caption" data-el="chartCaption">—</p>
          </div>

          <div class="status__section" data-section="phases" hidden>
            <button class="status__toggle" type="button" data-el="phasesToggle"
                    aria-expanded="true" aria-controls="status-phases">
              <span class="status__heading">Time · cpu</span>
              <span class="status__chevron" aria-hidden="true"></span>
            </button>
            <div class="status__rows" id="status-phases" data-el="statPhases"></div>
          </div>

          <div class="status__section" data-section="sim" hidden>
            <p class="status__heading">Simulation</p>
            <div class="status__rows" data-el="statSim"></div>
          </div>

          <div class="status__section" data-section="renderer" hidden>
            <p class="status__heading">Renderer</p>
            <div class="status__rows" data-el="statRenderer"></div>
          </div>
        </div>
      </div>
    `);

    this.root = container.querySelector('#status-overlay');
    this.summary = this.root.querySelector('#status-summary');
    this.details = this.root.querySelector('#status-details');

    this.summary.addEventListener('click', () => this.toggleDetails());
    this.root.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Escape' && this.expanded) {
        e.preventDefault();
        this.hideDetails();
      }
    });

    this.compact.addEventListener('change', () => {
      this.hideDetails(false);
      this.applyDisclosure();
      if (this.settings.enabled) this.draw();
    });

    this.root.querySelector('[data-el="phasesToggle"]').addEventListener('click', () => this.togglePhases());
    this.applyPhaseCollapse();
    this.apply(settings);
  }

  get isDetailsOpen() {
    return this.expanded;
  }

  showDetails() {
    if (!this.settings.enabled || !this.compact.matches || this.expanded) return;
    this.expanded = true;
    this.applyDisclosure();
    this.onDetailsChange(true);
    this.summary.focus();
    this.draw();
    this.padKey = null;
    this.padWaitForNeutral = true;
    this.padPoll = requestAnimationFrame(this.pollPad);
  }

  hideDetails(refocus = true) {
    if (!this.expanded) return;
    this.expanded = false;
    if (this.padPoll) cancelAnimationFrame(this.padPoll);
    this.padPoll = 0;
    this.applyDisclosure();
    this.onDetailsChange(false);
    if (refocus && this.settings.enabled && this.compact.matches) {
      this.summary.focus();
    }
  }

  toggleDetails() {
    if (this.expanded) {
      this.hideDetails();
    } else {
      this.showDetails();
    }
  }

  applyDisclosure() {
    const isCompact = this.compact.matches;
    this.root.classList.toggle('is-compact', isCompact);
    this.root.classList.toggle('is-details-open', isCompact && this.expanded);
    this.summary.hidden = !isCompact;
    this.summary.setAttribute('aria-expanded', String(this.expanded));
    this.summary.setAttribute('aria-label', this.expanded ? 'Hide status details' : 'Show status details');

    const hasFpsOrFrame = this.settings.fps || this.settings.frame;
    if (hasFpsOrFrame) {
      this.summary.setAttribute('aria-describedby', 'status-summary-metrics');
    } else {
      this.summary.removeAttribute('aria-describedby');
    }

    this.details.hidden = isCompact && !this.expanded;
    this.root.querySelector('[data-el="summaryMetrics"]').hidden = !hasFpsOrFrame;
    this.root.querySelector('[data-el="summaryLabel"]').hidden = hasFpsOrFrame;

    const msEl = this.root.querySelector('[data-el="summaryMs"]');
    if (msEl && msEl.parentElement) {
      msEl.parentElement.hidden = (this.settings.fps && !this.settings.frame);
    }

    const hasAny = this.settings.fps || this.settings.frame || this.settings.chart ||
      this.settings.phases || this.settings.sim || this.settings.renderer;
    this.root.querySelector('[data-el="statusEmpty"]').hidden = hasAny || !isCompact;
  }

  togglePhases() {
    this.settings.phasesCollapsed = !this.settings.phasesCollapsed;
    if (typeof this.options?.saveSettings === 'function') {
      this.options.saveSettings(this.settings);
    } else if (typeof Yh !== 'undefined' && Yh?.save) {
      Yh.save(this.settings);
    }
    this.applyPhaseCollapse();
    if (!this.settings.phasesCollapsed) {
      this.draw();
    }
  }

  applyPhaseCollapse() {
    const collapsed = this.settings.phasesCollapsed;
    const toggleBtn = this.root.querySelector('[data-el="phasesToggle"]');
    const phaseRows = this.root.querySelector('[data-el="statPhases"]');
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', String(!collapsed));
    if (phaseRows) phaseRows.hidden = collapsed;
    this.root.classList.toggle('is-phases-collapsed', collapsed);
  }

  apply(newSettings) {
    this.settings = newSettings;
    const enabled = newSettings.enabled;
    this.root.hidden = !enabled;
    this.root.setAttribute('aria-hidden', String(!enabled));
    if (!enabled) this.hideDetails(false);

    for (const sec of this.root.querySelectorAll('[data-section]')) {
      const name = sec.dataset.section;
      sec.hidden = !newSettings[name];
    }

    this.applyDisclosure();
    this.applyPhaseCollapse();
    if (enabled) {
      this.start();
      this.draw();
    } else {
      this.stop();
    }
  }

  start() {
    if (this.timer) return;
    this.draw();
    this.timer = window.setInterval(() => this.draw(), 1000 / STATUS_CHART_CONFIG.UPDATE_RATE_HZ);
  }

  stop() {
    if (this.timer) {
      window.clearInterval(this.timer);
      this.timer = 0;
    }
  }

  set(elementKey, content) {
    const el = this.root.querySelector(`[data-el="${elementKey}"]`);
    if (!el) return;
    if (typeof content === 'string' && content.includes('<')) {
      if (el.innerHTML !== content) el.innerHTML = content;
    } else {
      if (el.textContent !== content) el.textContent = content;
    }
  }

  rows(elementKey, rowList) {
    const el = this.root.querySelector(`[data-el="${elementKey}"]`);
    if (!el) return;
    el.innerHTML = rowList.map(([label, val, warn]) => `
      <div class="status__row${warn ? ' is-warn' : ''}">
        <span>${label}</span><span class="status__figure">${val}</span>
      </div>
    `).join('');
  }

  draw() {
    const snap = this.profiler.snapshot(STATUS_CHART_CONFIG.WIDTH / 2, STATUS_CHART_CONFIG.HISTORY_SECONDS);
    if (snap.count === 0) return;

    const currentScale = Math.round(
      (this.options?.getRenderScale?.()) ??
      (typeof activeGraphicsSettings !== 'undefined' && activeGraphicsSettings?.renderScale) ??
      (typeof activeSettingsOverlay !== 'undefined' && activeSettingsOverlay?.graphics?.renderScale) ??
      (typeof We !== 'undefined' && We ? We.renderScale : undefined) ??
      (typeof Xe !== 'undefined' && Xe ? Xe.graphics?.renderScale : undefined) ??
      (typeof uA !== 'undefined' && uA?.load?.()?.renderScale) ??
      50
    );

    const s = this.settings;
    if (s.fps) {
      this.set('statFpsSimple', snap.frame.fps.toFixed(0));
      this.set('statHzSimple', String(Math.round(snap.refreshHz || 60)));
      this.set('statScaleSimple', `${currentScale}%`);
    }

    if (s.fps && !s.frame) {
      this.set('summaryFps', `${snap.frame.fps.toFixed(0)} <span style="color:rgba(255,255,255,0.45);font-weight:400;font-size:0.85em;">/ ${Math.round(snap.refreshHz || 60)}</span> <span style="color:rgba(255,255,255,0.75);margin-left:6px;font-weight:500;font-size:0.85em;">${currentScale}%</span>`);
      const msSpan = this.root.querySelector('[data-el="summaryMs"]');
      if (msSpan?.parentElement) msSpan.parentElement.hidden = true;
    } else if (s.frame) {
      this.set('summaryFps', `${snap.frame.fps.toFixed(0)} <span style="color:rgba(255,255,255,0.75);margin-left:4px;font-size:0.85em;">${currentScale}%</span>`);
      this.set('summaryMs', snap.frame.avgMs.toFixed(1));
      const msSpan = this.root.querySelector('[data-el="summaryMs"]');
      if (msSpan?.parentElement) msSpan.parentElement.hidden = false;
    }

    if (!(this.compact.matches && !this.expanded)) {
      if (s.frame) {
        this.set('statFps', snap.frame.fps.toFixed(0));
        this.set('statFrame', snap.frame.avgMs.toFixed(2));
        this.set('statP50', snap.frame.p50.toFixed(2));
        this.set('statP95', snap.frame.p95.toFixed(2));
        this.set('statP99', snap.frame.p99.toFixed(2));
        this.set('statWorst', snap.frame.worstMs.toFixed(1));
      }

      if (s.chart) {
        this.drawChart(snap);
      }

      if (s.phases && !s.phasesCollapsed) {
        this.rows('statPhases', [
          ...snap.phases.filter(p => p.phase !== 'other' || p.avgMs >= 0.02).map(p => [p.phase, `${p.avgMs.toFixed(2)} ms`]),
          ['cpu total', `${snap.cpu.avgMs.toFixed(2)} ms`]
        ]);
      }

      if (s.sim) {
        const { ticksPerFrame, droppedTicks, clampedFrames, stalls } = snap.sim;
        this.rows('statSim', [
          ['ticks / frame', ticksPerFrame.toFixed(2)],
          ['sim rate', `${Math.round(ticksPerFrame * snap.frame.fps)}/ 120 Hz`],
          ['dropped', droppedTicks === 0 ? 'none' : `${droppedTicks} · ${clampedFrames}f`, droppedTicks > 0],
          ['stalls', stalls === 0 ? 'none' : String(stalls), stalls > 0]
        ]);
      }

      if (s.renderer && this.renderer?.info) {
        const info = this.renderer.info;
        this.rows('statRenderer', [
          ['draw calls', String(info.render.calls)],
          ['triangles', info.render.triangles.toLocaleString('en')],
          ['geometries', String(info.memory.geometries)],
          ['textures', String(info.memory.textures)],
          ['programs', String(info.programs?.length ?? 0)]
        ]);
      }
    }
  }

  drawChart(snap) {
    const trace = this.root.querySelector('[data-el="chartTrace"]');
    const budgetLine = this.root.querySelector('[data-el="chartBudget"]');
    const overPath = this.root.querySelector('[data-el="chartOver"]');
    if (!trace || !budgetLine || !overPath) return;

    const history = snap.history;
    const len = history.length;
    if (len === 0) return;

    const { WIDTH, HEIGHT, HISTORY_SECONDS } = STATUS_CHART_CONFIG;
    let ceiling = snap.budgetMs * 2;
    while (ceiling < snap.frame.worstMs && ceiling < snap.budgetMs * 16) {
      ceiling += snap.budgetMs;
    }

    const calcX = (idx) => (idx / Math.max(1, len - 1)) * WIDTH;
    const calcY = (val) => HEIGHT - Math.min(1, val / ceiling) * HEIGHT;

    const points = [];
    const overSpikes = [];

    for (let i = 0; i < len; i += 1) {
      const x = calcX(i).toFixed(1);
      const y = calcY(history[i]).toFixed(1);
      points.push(`${x},${y}`);
      if (history[i] > snap.budgetMs * 1.02) {
        overSpikes.push(`M ${x} ${HEIGHT} L ${x} ${y}`);
      }
    }

    trace.setAttribute('points', points.join(' '));
    overPath.setAttribute('d', overSpikes.join(' '));

    const budgetY = calcY(snap.budgetMs).toFixed(1);
    budgetLine.setAttribute('y1', budgetY);
    budgetLine.setAttribute('y2', budgetY);

    const grid = this.root.querySelector('[data-el="chartGrid"]');
    if (grid && grid.childElementCount !== HISTORY_SECONDS - 1) {
      grid.innerHTML = Array.from({ length: HISTORY_SECONDS - 1 }, (_, v) => {
        const x = ((v + 1) / HISTORY_SECONDS) * WIDTH;
        return `<line x1="${x}" y1="0" x2="${x}" y2="${HEIGHT}" />`;
      }).join('');
    }

    this.set('chartCaption', `${HISTORY_SECONDS}s · ${snap.budgetMs.toFixed(1)} ms at ~${snap.refreshHz} Hz display · ${snap.overBudgetPct.toFixed(0)}% over · peak ${ceiling.toFixed(0)} ms`);
  }

  destroy() {
    this.stop();
    if (this.padPoll) {
      cancelAnimationFrame(this.padPoll);
      this.padPoll = 0;
    }
    if (this.root && this.root.parentElement) {
      this.root.parentElement.removeChild(this.root);
    }
  }
}

// Backward-compatibility aliases
export { PerformanceProfiler as iB, PerformanceOverlayHUD as aB };
