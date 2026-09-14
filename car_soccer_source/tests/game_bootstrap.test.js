/**
 * tests/game_bootstrap.test.js
 * Unit test suite for Phase 8.4: Game Engine Lifecycle Bootstrap & Loading Screen Orchestrator.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  renderLoadingScreen,
  updateLoadingState,
  setupInputMethodDetection,
  handleBootstrapError,
  GameBootstrap,
  bootstrapGameEngine,
  DEFAULT_APP_ICON_URL,
  dB,
  mC
} from '../src/game/GameBootstrap.js';

/**
 * Creates a mock DOM Element for headless Node testing.
 */
function createMockElement(tagName = 'div', attributes = {}) {
  const dataset = {};
  const children = [];
  const eventListeners = new Map();

  const el = {
    tagName: tagName.toUpperCase(),
    dataset,
    attributes: { ...attributes },
    children,
    textContent: '',
    style: {},
    getAttribute(name) {
      return this.attributes[name] || null;
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    querySelector(selector) {
      if (selector === '#loading') {
        return children.find(c => c.id === 'loading') || null;
      }
      if (selector.includes('.load__label')) {
        const loading = children.find(c => c.id === 'loading');
        return loading ? loading.querySelector('.load__label') : (children.find(c => c.className?.includes('load__label')) || null);
      }
      if (selector.includes('.load__note')) {
        const loading = children.find(c => c.id === 'loading');
        return loading ? loading.querySelector('.load__note') : (children.find(c => c.className?.includes('load__note')) || null);
      }
      if (selector === 'img') {
        return children.find(c => c.tagName === 'IMG') || null;
      }
      return null;
    },
    addEventListener(event, handler) {
      if (!eventListeners.has(event)) eventListeners.set(event, []);
      eventListeners.get(event).push(handler);
    },
    removeEventListener(event, handler) {
      const list = eventListeners.get(event);
      if (list) {
        const idx = list.indexOf(handler);
        if (idx !== -1) list.splice(idx, 1);
      }
    },
    dispatchEvent(event) {
      const list = eventListeners.get(event.type);
      if (list) {
        for (const fn of list) fn(event);
      }
    }
  };

  // When innerHTML is assigned with loading markup, synthesize child mock elements
  let rawHtml = '';
  Object.defineProperty(el, 'innerHTML', {
    get() {
      return rawHtml;
    },
    set(val) {
      rawHtml = val;
      children.length = 0;
      if (val.includes('id="loading"')) {
        const loadingDiv = createMockElement('div');
        loadingDiv.id = 'loading';
        loadingDiv.dataset.state = 'loading';

        const label = createMockElement('p');
        label.className = 'load__label';
        label.textContent = 'Loading game';

        const note = createMockElement('p');
        note.className = 'load__note';

        const img = createMockElement('img');
        const srcMatch = val.match(/src="([^"]+)"/);
        if (srcMatch) img.setAttribute('src', srcMatch[1]);

        loadingDiv.children.push(label, note, img);
        loadingDiv.querySelector = (sel) => {
          if (sel.includes('.load__label')) return label;
          if (sel.includes('.load__note')) return note;
          if (sel === 'img') return img;
          return null;
        };

        children.push(loadingDiv);
      }
    }
  });

  return el;
}

test('1. renderLoadingScreen generates valid markup with default and custom icon URLs', () => {
  const container = createMockElement('div');

  // Default icon
  const refsDefault = renderLoadingScreen(container);
  assert.ok(refsDefault, 'Should return references object');
  assert.ok(refsDefault.loadingElement, 'Should find #loading element');
  assert.equal(refsDefault.loadingElement.dataset.state, 'loading');
  assert.ok(refsDefault.labelElement, 'Should find label element');
  assert.ok(refsDefault.noteElement, 'Should find note element');
  assert.ok(container.innerHTML.includes(DEFAULT_APP_ICON_URL), 'HTML should include default icon URL');

  // Custom icon
  const customIcon = '/custom/emblem.png';
  const refsCustom = renderLoadingScreen(container, customIcon);
  assert.ok(container.innerHTML.includes(customIcon), 'HTML should include custom icon URL');

  // Null safety
  const nullResult = renderLoadingScreen(null);
  assert.equal(nullResult, null, 'Should gracefully return null when container is missing');
});

test('2. updateLoadingState updates visual states and error messages cleanly', () => {
  const container = createMockElement('div');
  const refs = renderLoadingScreen(container);

  // Update state to ready
  updateLoadingState(refs, { state: 'ready', label: 'Game Ready', note: 'All systems operational' });
  assert.equal(refs.loadingElement.dataset.state, 'ready');
  assert.equal(refs.labelElement.textContent, 'Game Ready');
  assert.equal(refs.noteElement.textContent, 'All systems operational');

  // Update error with HTML content
  const htmlNote = '<b>Draco decoder</b> failed to download';
  updateLoadingState(refs, { state: 'error', label: 'Load Failure', note: htmlNote, isHtmlNote: true });
  assert.equal(refs.loadingElement.dataset.state, 'error');
  assert.equal(refs.labelElement.textContent, 'Load Failure');
  assert.equal(refs.noteElement.innerHTML, htmlNote);
});

test('3. setupInputMethodDetection tracks touch and pointer activity safely', () => {
  const container = createMockElement('div');
  const cleanup = setupInputMethodDetection(container);

  assert.ok(typeof cleanup === 'function', 'Should return cleanup function');
  assert.ok(['touch', 'mouse'].includes(container.dataset.inputMethod), 'Initial method should be touch or mouse');

  cleanup();
});

test('4. handleBootstrapError formats asset error vs general Error into user-facing diagnostics', () => {
  const container = createMockElement('div');
  const refs = renderLoadingScreen(container);

  // 1. Asset error with HTML message
  const assetError = new Error('<span>Asset missing: octane.glb</span>');
  assetError.isAssetError = true;
  handleBootstrapError(assetError, refs);
  assert.equal(refs.loadingElement.dataset.state, 'error');
  assert.equal(refs.labelElement.textContent, '缺少游戏资产 / Assets Required');
  assert.equal(refs.noteElement.innerHTML, '<span>Asset missing: octane.glb</span>');

  // 2. Generic runtime error
  const runtimeError = new Error('WebGL context lost');
  handleBootstrapError(runtimeError, refs);
  assert.equal(refs.loadingElement.dataset.state, 'error');
  assert.equal(refs.labelElement.textContent, 'Failed to start');
  assert.equal(refs.noteElement.textContent, 'WebGL context lost');
});

test('5. GameBootstrap lifecycle methods (prepareDOM, stop, renderFrame)', () => {
  const container = createMockElement('div');
  const bootstrap = new GameBootstrap(container);

  bootstrap.prepareDOM();
  assert.ok(bootstrap.loadingRefs, 'prepareDOM should instantiate loadingRefs');
  assert.ok(container.innerHTML.includes('id="loading"'), 'DOM should have loading screen');

  let frameCalled = false;
  bootstrap.runtime = {
    stop() {},
    renderFrame(ts) {
      frameCalled = true;
      assert.equal(ts, 12345);
    }
  };

  bootstrap.renderFrame(12345);
  assert.ok(frameCalled, 'renderFrame should delegate to runtime');

  bootstrap.stop();
  assert.equal(bootstrap.cleanupInput, null, 'stop should clean up input listeners');
});

test('6. Backward-compatibility aliases and constants match expected interfaces', () => {
  assert.equal(DEFAULT_APP_ICON_URL, '/assets/app-icon-512-DPODCpjJ.png');
  assert.equal(mC, DEFAULT_APP_ICON_URL);
  assert.equal(dB, bootstrapGameEngine);
  assert.equal(typeof bootstrapGameEngine, 'function');
});
