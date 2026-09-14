/**
 * src/game/GameBootstrap.js
 * Game Engine Lifecycle Bootstrap & Loading Screen Orchestrator (Phase 8.4).
 *
 * Deobfuscates and modularizes:
 * - Application loading screen DOM generation and status reporting (dB/wt bootstrap UI).
 * - Multi-device input method detection (touch, pointer, keyboard).
 * - GameRuntime lifecycle management (instantiation, async initialization, error boundary, and RAF loop).
 * - Backward-compatibility bridges for legacy symbols (dB, wt, mC, GameBootstrap).
 */

import { GameRuntime } from './GameRuntime.js';

export const DEFAULT_APP_ICON_URL = '/assets/app-icon-512-DPODCpjJ.png';

/**
 * Creates the stylized brand loading overlay DOM inside the host container.
 * @param {HTMLElement} container Host DOM container (#app)
 * @param {string} [iconUrl] Brand emblem image URL
 * @returns {{ loadingElement: HTMLElement, labelElement: HTMLElement, noteElement: HTMLElement } | null}
 */
export function renderLoadingScreen(container, iconUrl = DEFAULT_APP_ICON_URL) {
  if (!container) return null;

  container.innerHTML = `
  <div id="loading" data-state="loading">
    <div class="load__emblem"><img src="${iconUrl}" width="512" height="512" alt="Orange car chasing a soccer ball" fetchpriority="high" /></div>
    <h1 class="load__title">CAR <span>SOCCER</span></h1>
    <p class="load__label" role="status">Loading game</p>
    <div class="load__rule"></div>
    <p class="load__note"></p>
  </div>
`;

  return {
    loadingElement: container.querySelector('#loading'),
    labelElement: container.querySelector('#loading .load__label'),
    noteElement: container.querySelector('#loading .load__note')
  };
}

/**
 * Updates loading screen status and visual state.
 * @param {object|HTMLElement} loadingRef Loading DOM references object or element
 * @param {object} options
 * @param {'loading'|'ready'|'error'} [options.state]
 * @param {string} [options.label]
 * @param {string} [options.note]
 * @param {boolean} [options.isHtmlNote]
 */
export function updateLoadingState(loadingRef, { state, label, note, isHtmlNote = false } = {}) {
  if (!loadingRef) return;

  const loadingEl = loadingRef.loadingElement || (loadingRef.dataset ? loadingRef : null);
  const labelEl = loadingRef.labelElement || loadingEl?.querySelector?.('.load__label');
  const noteEl = loadingRef.noteElement || loadingEl?.querySelector?.('.load__note');

  if (loadingEl && state) {
    loadingEl.dataset.state = state;
  }
  if (labelEl && label !== undefined) {
    labelEl.textContent = label;
  }
  if (noteEl && note !== undefined) {
    if (isHtmlNote) {
      noteEl.innerHTML = note;
    } else {
      noteEl.textContent = note;
    }
  }
}

/**
 * Binds pointer, touch, and keyboard listeners to track current active input method on container dataset.
 * @param {HTMLElement} container Host DOM container (#app)
 * @returns {() => void} Cleanup function to unbind attached event listeners
 */
export function setupInputMethodDetection(container) {
  if (!container) return () => {};

  const setMethod = (method) => {
    if (container.dataset && container.dataset.inputMethod !== method) {
      container.dataset.inputMethod = method;
    }
  };

  const hasTouch =
    (typeof navigator !== 'undefined' && (navigator.maxTouchPoints || 0) > 0) ||
    (typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(any-pointer: coarse)').matches);

  setMethod(hasTouch ? 'touch' : 'mouse');

  if (typeof window === 'undefined') return () => {};

  const onKeyDown = (e) => {
    if (!e.repeat) setMethod('keyboard');
  };

  const onPointerDown = (e) => {
    const isTouch = e.pointerType === 'touch' || e.pointerType === 'pen';
    setMethod(isTouch ? 'touch' : 'mouse');
  };

  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });

  return () => {
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
  };
}

/**
 * Handles bootstrap errors with appropriate user-facing diagnostic messages.
 * @param {Error|any} error Caught bootstrap error
 * @param {object|HTMLElement} loadingRef Loading DOM references
 */
export function handleBootstrapError(error, loadingRef) {
  updateLoadingState(loadingRef, {
    state: 'error',
    label: error && error.isAssetError ? '缺少游戏资产 / Assets Required' : 'Failed to start',
    note: error && error.isAssetError ? error.message : (error instanceof Error ? error.message : String(error)),
    isHtmlNote: Boolean(error && error.isAssetError)
  });
  console.error('[CarSoccerEngine Bootstrap Error]', error);
}

/**
 * Lifecycle orchestrator for the Car Soccer Engine bootstrap process.
 */
export class GameBootstrap {
  /**
   * @param {HTMLElement} [container] Host element (defaults to #app)
   * @param {object} [options] Configuration and asset loader callbacks
   */
  constructor(container, options = {}) {
    this.container = container || (typeof document !== 'undefined' ? document.querySelector('#app') : null);
    this.options = options;
    this.loadingRefs = null;
    this.cleanupInput = null;
    this.runtime = null;
    this.iconUrl = options.iconUrl || DEFAULT_APP_ICON_URL;
  }

  /**
   * Prepares DOM, loading screen, and input event listeners.
   */
  prepareDOM() {
    if (this.container) {
      this.loadingRefs = renderLoadingScreen(this.container, this.iconUrl);
      this.cleanupInput = setupInputMethodDetection(this.container);
    }
  }

  /**
   * Instantiates, initializes, and starts the GameRuntime.
   * @returns {Promise<GameRuntime>}
   */
  async start() {
    this.prepareDOM();

    try {
      this.runtime = new GameRuntime(this.container, this.options);
      await this.runtime.init();
      this.runtime.start();
      return this.runtime;
    } catch (err) {
      handleBootstrapError(err, this.loadingRefs);
      throw err;
    }
  }

  /**
   * Stops active runtime and unbinds listeners.
   */
  stop() {
    if (this.runtime) {
      this.runtime.stop();
    }
    if (this.cleanupInput) {
      this.cleanupInput();
      this.cleanupInput = null;
    }
  }

  /**
   * Advances a single render frame on the active runtime.
   * @param {number} timestamp
   */
  renderFrame(timestamp) {
    if (this.runtime) {
      this.runtime.renderFrame(timestamp);
    }
  }
}

/**
 * Standard bootstrap helper function.
 * @param {HTMLElement} [container]
 * @param {object} [options]
 * @returns {Promise<GameRuntime>}
 */
export async function bootstrapGameEngine(container, options = {}) {
  const bootstrap = new GameBootstrap(container, options);
  return await bootstrap.start();
}

// Backward-compatibility aliases
export const dB = bootstrapGameEngine;
export const mC = DEFAULT_APP_ICON_URL;
