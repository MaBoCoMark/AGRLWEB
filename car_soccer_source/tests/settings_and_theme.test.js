/**
 * tests/settings_and_theme.test.js
 * Verification suite for Phase 6: ThemeManager and SettingsSheet modularization.
 */

import assert from 'node:assert/strict';

// Setup browser/DOM mock environment before importing DOM-dependent modules
class MockDOMTokenList extends Set {
  add(...tokens) {
    for (const t of tokens) super.add(t);
  }
  remove(...tokens) {
    for (const t of tokens) super.delete(t);
  }
  toggle(token, force) {
    if (force !== undefined) {
      if (force) super.add(token);
      else super.delete(token);
      return force;
    }
    if (super.has(token)) {
      super.delete(token);
      return false;
    }
    super.add(token);
    return true;
  }
  contains(token) {
    return super.has(token);
  }
}

class MockElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.attributes = new Map();
    this.dataset = {};
    this.classList = new MockDOMTokenList();
    this.style = {
      setProperty: (k, v) => { this.style[k] = v; },
      getPropertyValue: (k) => this.style[k] || ''
    };
    this.listeners = new Map();
    this.hidden = false;
    this.value = '';
    this.checked = false;
    this.innerHTML = '';
    this.textContent = '';
    this.offsetParent = {};
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'hidden') this.hidden = true;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === 'hidden') this.hidden = false;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  addEventListener(event, fn) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(fn);
  }

  removeEventListener(event, fn) {
    const list = this.listeners.get(event) || [];
    const idx = list.indexOf(fn);
    if (idx !== -1) list.splice(idx, 1);
  }

  dispatchEvent(evt) {
    const list = this.listeners.get(evt.type) || [];
    for (const fn of list) fn.call(this, evt);
    return true;
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  append(...items) {
    for (const it of items) {
      if (it instanceof MockElement) this.appendChild(it);
    }
  }

  replaceChildren(...newChildren) {
    this.children = [];
    for (const c of newChildren) {
      if (c instanceof MockElement) this.appendChild(c);
    }
  }

  click() {
    this.dispatchEvent({ type: 'click', target: this, preventDefault: () => {}, stopPropagation: () => {} });
  }

  focus() {}
  scrollIntoView() {}
  scrollTo() {}

  closest(selector) {
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      if (this.classList.contains(cls)) return this;
    }
    return this.parentElement?.closest(selector) ?? null;
  }

  contains(child) {
    if (child === this) return true;
    for (const c of this.children) {
      if (c.contains(child)) return true;
    }
    return false;
  }

  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all.length > 0 ? all[0] : null;
  }

  querySelectorAll(selector) {
    const results = [];
    const walk = (node) => {
      let matches = false;
      if (selector.startsWith('#') && node.attributes?.get('id') === selector.slice(1)) {
        matches = true;
      } else if (selector.startsWith('.') && node.classList?.contains(selector.slice(1))) {
        matches = true;
      } else if (selector.startsWith('[') && selector.endsWith(']')) {
        const attrExpr = selector.slice(1, -1);
        if (attrExpr.includes('=')) {
          const [k, rawV] = attrExpr.split('=');
          const expectedV = rawV.replace(/['"]/g, '');
          if (k.startsWith('data-')) {
            const dataKey = k.slice(5).replace(/-([a-z])/g, (_, g) => g.toUpperCase());
            matches = node.dataset[dataKey] === expectedV || node.attributes.get(k) === expectedV;
          } else {
            matches = node.attributes.get(k) === expectedV;
          }
        } else {
          matches = node.hasAttribute(attrExpr) || (attrExpr.startsWith('data-') && node.dataset[attrExpr.slice(5)] !== undefined);
        }
      }
      if (matches && node !== this) results.push(node);
      for (const ch of node.children) walk(ch);
    };
    walk(this);
    return results;
  }

  insertAdjacentHTML(position, htmlString) {
    // Parse minimal tag nodes from string
    const idMatches = [...htmlString.matchAll(/id="([^"]+)"/g)];
    const classMatches = [...htmlString.matchAll(/class="([^"]+)"/g)];
    const dataMatches = [...htmlString.matchAll(/data-([a-zA-Z0-9-]+)="([^"]*)"/g)];

    // Create a mock DOM hierarchy representing the injected HTML
    const root = new MockElement('div');
    root.innerHTML = htmlString;

    // Helper to register parsed items
    for (const match of idMatches) {
      const el = new MockElement('div');
      el.setAttribute('id', match[1]);
      root.appendChild(el);
    }
    for (const match of dataMatches) {
      const el = new MockElement('div');
      el.setAttribute(`data-${match[1]}`, match[2]);
      const camel = match[1].replace(/-([a-z])/g, (_, g) => g.toUpperCase());
      el.dataset[camel] = match[2];
      root.appendChild(el);
    }

    if (position === 'beforeend') {
      this.appendChild(root);
    }
  }
}

// Global browser mocks
globalThis.HTMLInputElement = class HTMLInputElement extends MockElement {};
globalThis.HTMLSelectElement = class HTMLSelectElement extends MockElement {
  constructor() {
    super('select');
    this.options = [];
    this.selectedIndex = 0;
  }
};
globalThis.HTMLElement = MockElement;
globalThis.Option = class Option extends MockElement {
  constructor(text, value) {
    super('option');
    this.text = text;
    this.value = value;
  }
};
globalThis.Event = class Event {
  constructor(type, init = {}) {
    this.type = type;
    this.bubbles = !!init.bubbles;
  }
};
globalThis.requestAnimationFrame = (cb) => {
  return setTimeout(() => cb(Date.now()), 16);
};
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

const mockLocalStorage = (() => {
  const store = new Map();
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };
})();
globalThis.localStorage = mockLocalStorage;

const mockDocument = {
  documentElement: new MockElement('html'),
  body: new MockElement('body'),
  fullscreenElement: null,
  createElement: (tag) => new MockElement(tag),
  createElementNS: (ns, tag) => new MockElement(tag),
  querySelector: (s) => null,
  querySelectorAll: (s) => [],
  addEventListener: () => {},
  removeEventListener: () => {},
  hasFocus: () => true
};
globalThis.document = mockDocument;

const mockWindow = {
  innerWidth: 1920,
  innerHeight: 1080,
  addEventListener: () => {},
  removeEventListener: () => {},
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  matchMedia: () => ({ matches: false })
};
globalThis.window = mockWindow;
try { Object.defineProperty(globalThis.navigator, "maxTouchPoints", { value: 0, configurable: true }); } catch (e) {}

// Dynamically import after DOM environment is prepared
const {
  THEMES,
  DEFAULT_THEME,
  themeSettingsStore,
  getTheme,
  setTheme,
  onThemeChange,
  applyThemeToDocument,
  dl,
  Gh,
  I0,
  tr,
  qs,
  uo,
  L0
} = await import('../src/ui/ThemeManager.js');

applyThemeToDocument();

const {
  SettingsSheet,
  statusSettingsStore,
  graphicsSettingsStore,
  cameraSettingsStore,
  trainingSettingsStore,
  DEFAULT_CAMERA_SETTINGS,
  DEFAULT_TRAINING_SETTINGS,
  STATUS_SETTING_ITEMS,
  CAMERA_RANGE_SETTINGS,
  CAMERA_SETTING_GROUPS,
  BOOST_OPTIONS,
  SETTINGS_TABS,
  STICK_AXIS_OPTIONS,
  MIN_FPS,
  MAX_FPS,
  getDefaultRenderScale,
  escapeHtml,
  renderCameraRangeInput,
  renderCheckboxDim,
  renderBindingChip,
  BM,
  _g,
  Yh,
  uA,
  Ma,
  SA,
  EM,
  Ps,
  bM,
  Zh,
  SM,
  wM,
  nm,
  yM,
  xM,
  Kd,
  rm,
  CM,
  Na,
  MM,
  Pr,
  im
} = await import('../src/ui/SettingsSheet.js');

console.log('[Test] Running Phase 6 Settings & Theme validation suite...');

// --- 1. ThemeManager Tests ---
console.log('  Testing ThemeManager.js & aliases...');
{
  assert.deepEqual(THEMES, ["realistic", "arcade"]);
  assert.equal(DEFAULT_THEME, "arcade");
  assert.equal(dl, THEMES);
  assert.equal(Gh, DEFAULT_THEME);
  assert.equal(tr, getTheme);
  assert.equal(qs, setTheme);
  assert.equal(uo, onThemeChange);
  assert.equal(L0, applyThemeToDocument);
  assert.equal(I0, themeSettingsStore);

  // Initial theme check
  assert.equal(getTheme(), "arcade");
  assert.equal(document.documentElement.dataset.theme, "arcade");

  // Reactive listener
  let seenTheme = null;
  let calls = 0;
  const unsub = onThemeChange((t) => {
    seenTheme = t;
    calls++;
  });
  assert.equal(seenTheme, "arcade");
  assert.equal(calls, 1);

  // Set to realistic
  setTheme("realistic");
  assert.equal(getTheme(), "realistic");
  assert.equal(document.documentElement.dataset.theme, "realistic");
  assert.equal(seenTheme, "realistic");
  assert.equal(calls, 2);

  // Invalid theme ignored
  setTheme("cyberpunk");
  assert.equal(getTheme(), "realistic");
  assert.equal(calls, 2);

  // Unsubscribe
  unsub();
  setTheme("arcade");
  assert.equal(getTheme(), "arcade");
  assert.equal(calls, 2, "Unsubscribed listener should not be called again");

  console.log('  ✓ ThemeManager tests passed.');
}

// --- 2. Settings Constants & Stores Tests ---
console.log('  Testing Settings Stores & Schemas...');
{
  // Status settings
  assert.equal(STATUS_SETTING_ITEMS.length, 6);
  assert.equal(_g, STATUS_SETTING_ITEMS);
  assert.equal(Yh, statusSettingsStore);
  const statusDef = statusSettingsStore.load();
  assert.equal(statusDef.enabled, true);
  assert.equal(statusDef.fps, true);

  // Graphics settings
  assert.equal(MIN_FPS, 60);
  assert.equal(MAX_FPS, 240);
  assert.equal(Ma, 60);
  assert.equal(SA, 240);
  assert.equal(uA, graphicsSettingsStore);
  assert.equal(getDefaultRenderScale(), 50);
  const graphicsDef = graphicsSettingsStore.load();
  assert.equal(graphicsDef.showStadium, false);
  assert.equal(graphicsDef.limitFps, true);
  assert.equal(graphicsDef.maxFps, 120);
  assert.equal(graphicsDef.renderScale, 50);

  // Camera settings
  assert.equal(Ps, DEFAULT_CAMERA_SETTINGS);
  assert.equal(bM, CAMERA_RANGE_SETTINGS);
  assert.equal(SM, CAMERA_SETTING_GROUPS);
  assert.equal(nm, cameraSettingsStore);
  assert.equal(DEFAULT_CAMERA_SETTINGS.fov, 110);
  assert.equal(DEFAULT_CAMERA_SETTINGS.distance, 270);
  assert.equal(DEFAULT_CAMERA_SETTINGS.height, 90);
  assert.equal(DEFAULT_CAMERA_SETTINGS.angleDeg, -4);
  const camDef = cameraSettingsStore.load();
  assert.equal(camDef.fov, 110);

  // Training settings
  assert.equal(Kd, DEFAULT_TRAINING_SETTINGS);
  assert.equal(xM, BOOST_OPTIONS);
  assert.equal(rm, trainingSettingsStore);
  assert.equal(DEFAULT_TRAINING_SETTINGS.disableGoalReset, false);
  assert.equal(DEFAULT_TRAINING_SETTINGS.boostOption, "unlimited");
  assert.equal(DEFAULT_TRAINING_SETTINGS.showCarHitbox, false);

  // Tabs & axes
  assert.deepEqual(SETTINGS_TABS, ["camera", "controls", "graphics", "audio", "training", "diagnostics"]);
  assert.deepEqual(CM, SETTINGS_TABS);
  assert.deepEqual(STICK_AXIS_OPTIONS, [0, 1, 2, 3]);
  assert.deepEqual(wM, STICK_AXIS_OPTIONS);

  // Render helpers
  assert.equal(Na, escapeHtml);
  assert.equal(MM, renderCameraRangeInput);
  assert.equal(Pr, renderCheckboxDim);
  assert.equal(im, renderBindingChip);

  const escaped = escapeHtml('<script>"test"&\'foo\'</script>');
  assert.ok(!escaped.includes('<script>'));
  assert.ok(escaped.includes('&lt;script&gt;'));

  const rangeHtml = renderCameraRangeInput(CAMERA_RANGE_SETTINGS[0]);
  assert.ok(rangeHtml.includes('camera-fov'));
  assert.ok(rangeHtml.includes('data-camera-setting="fov"'));

  const chkHtml = renderCheckboxDim("showStadium", "Show Stadium", "Note", "graphics");
  assert.ok(chkHtml.includes('graphics-showStadium'));
  assert.ok(chkHtml.includes('data-graphics-setting="showStadium"'));

  console.log('  ✓ Settings Stores & Schemas passed.');
}

// --- 3. SettingsSheet Lifecycle & Methods ---
console.log('  Testing SettingsSheet (BM) class...');
{
  assert.equal(BM, SettingsSheet);

  const container = new MockElement('div');
  const cameraTarget = { ...DEFAULT_CAMERA_SETTINGS };
  const trainingTarget = { ...DEFAULT_TRAINING_SETTINGS };
  const bindings = {
    keyboard: { throttleForward: [{ kind: "key", code: "KeyW" }] },
    pad: { throttleForward: [{ kind: "padAxis", axis: 1, dir: 1 }] },
    axes: {
      steer: { axis: 0, invert: false },
      pitch: { axis: 1, invert: false },
      deadzone: 0.1,
      triggerThreshold: 0.1
    }
  };

  let openChangedVal = null;
  let trainingChangedVal = null;
  let bindingsChangedVal = null;

  const sheet = new SettingsSheet(
    container,
    cameraTarget,
    trainingTarget,
    bindings,
    (isOpen) => { openChangedVal = isOpen; },
    (tt) => { trainingChangedVal = tt; },
    (b) => { bindingsChangedVal = b; },
    (capturing) => {}
  );

  assert.equal(sheet.isOpen, false);
  assert.equal(sheet.activeTab, "camera");

  // Show & Hide
  sheet.show();
  assert.equal(sheet.isOpen, true);
  assert.equal(openChangedVal, true);

  sheet.hide();
  assert.equal(sheet.isOpen, false);
  assert.equal(openChangedVal, false);

  sheet.toggle();
  assert.equal(sheet.isOpen, true);

  // Tab switching
  sheet.selectTab("graphics");
  assert.equal(sheet.activeTab, "graphics");
  sheet.selectTab("controls");
  assert.equal(sheet.activeTab, "controls");
  sheet.selectTab("audio");
  assert.equal(sheet.activeTab, "audio");

  // Graphics attachment
  let attachedGraphics = null;
  sheet.attachGraphics((g) => {
    attachedGraphics = g;
  });
  assert.ok(attachedGraphics !== null);
  assert.equal(attachedGraphics.limitFps, true);

  // Status attachment
  let attachedStatus = null;
  const returnedStatus = sheet.attachStatus((s) => {
    attachedStatus = s;
  });
  assert.ok(returnedStatus !== null);
  assert.equal(returnedStatus.enabled, true);

  // Defaults restoration
  sheet.selectTab("graphics");
  sheet.restoreDefaults();
  assert.equal(getTheme(), "arcade");

  sheet.selectTab("camera");
  sheet.restoreDefaults();
  assert.equal(cameraTarget.fov, 110);

  sheet.selectTab("training");
  sheet.restoreDefaults();
  assert.equal(trainingTarget.boostOption, "unlimited");

  sheet.hide();
  console.log('  ✓ SettingsSheet (BM) class tests passed.');
}

console.log('[Test] All Phase 6 Settings & Theme tests successfully passed!');
