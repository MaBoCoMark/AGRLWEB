/**
 * garage_dialog.test.js
 * Verification test suite for decoupled GarageDialog, GarageTurntable,
 * Hitbox presets, and display settings storage (Phase 6 Part 2).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// Mock MockElement DOM environment before importing UI modules
class MockElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
    const classes = new Set();
    this.classList = {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
      toggle: (c, force) => {
        if (force === undefined) {
          if (classes.has(c)) classes.delete(c);
          else classes.add(c);
        } else if (force) {
          classes.add(c);
        } else {
          classes.delete(c);
        }
      }
    };
    this.attributes = {};
    this.listeners = {};
    this.style = {};
    this.hidden = false;
    this.textContent = '';
    this.innerHTML = '';
  }

  setAttribute(k, v) {
    this.attributes[k] = String(v);
  }

  getAttribute(k) {
    return this.attributes[k] ?? null;
  }

  removeAttribute(k) {
    delete this.attributes[k];
  }

  addEventListener(evt, fn) {
    if (!this.listeners[evt]) this.listeners[evt] = [];
    this.listeners[evt].push(fn);
  }

  removeEventListener(evt, fn) {
    if (this.listeners[evt]) {
      this.listeners[evt] = this.listeners[evt].filter((l) => l !== fn);
    }
  }

  dispatchEvent(event) {
    const handlers = this.listeners[event.type] || [];
    for (const h of handlers) {
      h.call(this, event);
    }
  }

  appendChild(child) {
    this.children.push(child);
    child.parentElement = this;
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentElement = null;
    }
    return child;
  }

  remove() {
    if (this.parentElement) {
      this.parentElement.removeChild(this);
    }
  }

  querySelector(selector) {
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      if (this.id === id) return this;
      for (const child of this.children) {
        const found = child.querySelector(selector);
        if (found) return found;
      }
      return null;
    }
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      if (this.classList.contains(cls)) return this;
      for (const child of this.children) {
        const found = child.querySelector(selector);
        if (found) return found;
      }
      return null;
    }
    if (selector.startsWith('[')) {
      const match = selector.match(/\[([a-zA-Z0-9_-]+)(?:="([^"]+)")?\]/);
      if (match) {
        const attrName = match[1];
        const attrVal = match[2];
        const val = attrName.startsWith('data-')
          ? this.dataset[attrName.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())]
          : this.attributes[attrName];
        if (attrVal !== undefined ? val === attrVal : val !== undefined) {
          return this;
        }
      }
      for (const child of this.children) {
        const found = child.querySelector(selector);
        if (found) return found;
      }
      return null;
    }
    return null;
  }

  querySelectorAll(selector) {
    const results = [];
    const check = (node) => {
      if (selector.startsWith('[')) {
        const match = selector.match(/\[([a-zA-Z0-9_-]+)(?:="([^"]+)")?\]/);
        if (match) {
          const attrName = match[1];
          const attrVal = match[2];
          const val = attrName.startsWith('data-')
            ? node.dataset[attrName.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())]
            : node.attributes[attrName];
          if (attrVal !== undefined ? val === attrVal : val !== undefined) {
            results.push(node);
          }
        }
      } else if (selector.startsWith('.')) {
        if (node.classList.contains(selector.slice(1))) {
          results.push(node);
        }
      }
      for (const ch of node.children) {
        check(ch);
      }
    };
    check(this);
    return results;
  }

  focus() {
    if (globalThis.document) {
      globalThis.document.activeElement = this;
    }
  }

  click() {
    this.dispatchEvent({ type: 'click', target: this });
  }

  insertAdjacentHTML(position, html) {
    // Basic parser for container injection
    const parser = new MockDOMParser();
    const parsedNodes = parser.parse(html);
    for (const node of parsedNodes) {
      this.appendChild(node);
    }
  }
}

class MockDOMParser {
  parse(html) {
    const nodes = [];
    const buttonRegex = /<button\s+([^>]+)>(.*?)<\/button>/gs;
    const divRegex = /<div\s+([^>]+)>(.*?)<\/div>/gs;

    // Helper to parse attributes
    const parseAttrs = (el, attrStr) => {
      const idM = attrStr.match(/id="([^"]+)"/);
      if (idM) el.id = idM[1];
      const classM = attrStr.match(/class="([^"]+)"/);
      if (classM) classM[1].split(/\s+/).forEach((c) => el.classList.add(c));
      const dataMatches = attrStr.matchAll(/data-([a-zA-Z0-9-]+)="([^"]+)"/g);
      for (const dm of dataMatches) {
        const camel = dm[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        el.dataset[camel] = dm[2];
      }
      if (attrStr.includes('hidden')) el.hidden = true;
    };

    // Quick tag extraction
    const tagMatches = html.matchAll(/<([a-z0-9-]+)\s*([^>]*)>(.*?)<\/\1>/gis);
    for (const m of tagMatches) {
      const tag = m[1];
      const attrs = m[2];
      const inner = m[3];
      const el = new MockElement(tag);
      parseAttrs(el, attrs);

      // Parse nested tags
      const nested = this.parse(inner);
      for (const child of nested) {
        el.appendChild(child);
      }
      nodes.push(el);
    }
    return nodes;
  }
}

// Mock browser globals
const storageBacking = new Map();
globalThis.localStorage = {
  getItem: (k) => (storageBacking.has(k) ? storageBacking.get(k) : null),
  setItem: (k, v) => storageBacking.set(k, String(v)),
  removeItem: (k) => storageBacking.delete(k),
  clear: () => storageBacking.clear()
};

globalThis.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  devicePixelRatio: 1,
  matchMedia: () => ({ matches: false }),
  setTimeout: (fn) => { fn(); return 1; },
  clearTimeout: () => {},
  location: { reload: () => {} }
};

const rootDoc = new MockElement('html');
rootDoc.dataset = { theme: 'arcade' };
const bodyEl = new MockElement('body');
rootDoc.appendChild(bodyEl);

globalThis.document = {
  documentElement: rootDoc,
  body: bodyEl,
  activeElement: null,
  createElement: (tag) => {
    if (tag === 'canvas') {
      const c = new MockElement('canvas');
      c.width = 384;
      c.height = 216;
      c.getContext = () => ({
        clearRect: () => {},
        drawImage: () => {}
      });
      return c;
    }
    return new MockElement(tag);
  },
  querySelector: (sel) => rootDoc.querySelector(sel),
  querySelectorAll: (sel) => rootDoc.querySelectorAll(sel)
};

globalThis.requestAnimationFrame = (cb) => {
  return 101;
};
globalThis.cancelAnimationFrame = () => {};

// Mock Three.js constructs for unit testing
class MockVector3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x; this.y = y; this.z = z;
  }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  normalize() { return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
}

class MockGroup {
  constructor() {
    this.name = '';
    this.children = [];
    this.position = new MockVector3();
    this.rotation = { x: 0, y: 0, z: 0 };
  }
  add(...items) { this.children.push(...items); }
  remove(item) {
    const idx = this.children.indexOf(item);
    if (idx !== -1) this.children.splice(idx, 1);
  }
}

class MockBoxGeometry {
  constructor(length, height, width) {
    this.length = length;
    this.height = height;
    this.width = width;
  }
}

class MockMaterial {
  constructor(params) {
    Object.assign(this, params);
  }
  dispose() {}
}

class MockMesh {
  constructor(geometry, material) {
    this.geometry = geometry;
    this.material = material;
    this.position = new MockVector3();
    this.children = [];
    this.isMesh = true;
  }
  add(item) { this.children.push(item); }
}

class MockEdgesGeometry {
  constructor(geom) { this.geom = geom; }
}

class MockLineSegments {
  constructor(geom, mat) {
    this.geom = geom;
    this.mat = mat;
  }
}

class MockBox3 {
  setFromObject(obj) { return this; }
  getCenter(target) { return target.set(0, 10, 0); }
}

class MockWebGLRenderer {
  constructor(opts) {
    this.domElement = globalThis.document.createElement('canvas');
  }
  setPixelRatio() {}
  setSize() {}
  render() {}
  compileAsync() { return Promise.resolve(); }
}

class MockScene extends MockGroup {
  constructor() {
    super();
    this.environment = null;
    this.environmentIntensity = 1.0;
  }
}

class MockCamera {
  constructor(fov, aspect, near, far) {
    this.position = new MockVector3();
  }
  lookAt() {}
}

class MockLight {
  constructor(c, i) {
    this.color = c;
    this.intensity = i;
    this.position = new MockVector3();
  }
}

const mockThree = {
  Vector3: MockVector3,
  Group: MockGroup,
  BoxGeometry: MockBoxGeometry,
  MeshStandardMaterial: MockMaterial,
  LineBasicMaterial: MockMaterial,
  Mesh: MockMesh,
  EdgesGeometry: MockEdgesGeometry,
  LineSegments: MockLineSegments,
  Box3: MockBox3,
  WebGLRenderer: MockWebGLRenderer,
  Scene: MockScene,
  PerspectiveCamera: MockCamera,
  HemisphereLight: MockLight,
  DirectionalLight: MockLight,
  PMREMGenerator: class {
    constructor(r) {}
    fromScene() { return { texture: {} }; }
    dispose() {}
  },
  RoomEnvironment: class extends MockScene {
    traverse(cb) {}
  }
};

// Now import the decoupled module under test
import {
  HITBOX_PRESETS,
  CAR_VISUAL_IDS,
  CAR_VISUAL_OPTIONS,
  STORAGE_KEY_DISPLAY_SETTINGS,
  garageSettingsStore,
  createWhiteboxCarModel,
  setGarageThreeContext,
  setGarageModelLoaders,
  GarageTurntable,
  GarageDialog,
  PAD_NAVIGATION_BUTTONS,
  HM,
  UM,
  kM,
  Fc,
  Qh,
  xs
} from '../src/ui/GarageDialog.js';

test('1. Hitbox presets match RocketSim physical configurations', () => {
  assert.ok(HITBOX_PRESETS['hitbox-octane'], 'Octane preset must exist');
  assert.equal(HITBOX_PRESETS['hitbox-octane'].name, 'Octane');
  assert.equal(HITBOX_PRESETS['hitbox-octane'].length, 118.01);
  assert.equal(HITBOX_PRESETS['hitbox-octane'].width, 84.20);
  assert.equal(HITBOX_PRESETS['hitbox-octane'].height, 36.16);
  assert.equal(HITBOX_PRESETS['hitbox-octane'].forward, 13.88);
  assert.equal(HITBOX_PRESETS['hitbox-octane'].up, 20.75);

  assert.ok(HITBOX_PRESETS['hitbox-dominus'], 'Dominus preset must exist');
  assert.equal(HITBOX_PRESETS['hitbox-dominus'].length, 127.93);
  assert.equal(HITBOX_PRESETS['hitbox-dominus'].height, 31.30);

  assert.ok(HITBOX_PRESETS['hitbox-breakout']);
  assert.ok(HITBOX_PRESETS['hitbox-hybrid']);
  assert.ok(HITBOX_PRESETS['hitbox-plank']);
  assert.ok(HITBOX_PRESETS['hitbox-merc']);

  assert.equal(CAR_VISUAL_IDS.length, 8);
  assert.ok(CAR_VISUAL_IDS.includes('game-car'));
  assert.ok(CAR_VISUAL_IDS.includes('flat-car'));
  assert.equal(CAR_VISUAL_OPTIONS.length, 8);
});

test('2. Display settings store (Qh) handles persistence and validation', () => {
  storageBacking.clear();
  const def = garageSettingsStore.load();
  assert.equal(def.carVisual, 'game-car');

  garageSettingsStore.save({ carVisual: 'hitbox-dominus' });
  const reloaded = garageSettingsStore.load();
  assert.equal(reloaded.carVisual, 'hitbox-dominus');

  // Corrupted / invalid input should safely fall back
  storageBacking.set(STORAGE_KEY_DISPLAY_SETTINGS, JSON.stringify({ carVisual: 'invalid-cyber-truck' }));
  const sanitized = garageSettingsStore.load();
  assert.equal(sanitized.carVisual, 'game-car');
});

test('3. Procedural whitebox car model generator builds valid Three mesh', () => {
  setGarageThreeContext(mockThree);
  const octaneModel = createWhiteboxCarModel('hitbox-octane', 0x0088ff);

  assert.ok(octaneModel instanceof MockGroup);
  assert.equal(octaneModel.name, 'whitebox-Octane');
  assert.equal(octaneModel.children.length, 1);

  const bodyMesh = octaneModel.children[0];
  assert.ok(bodyMesh instanceof MockMesh);
  assert.equal(bodyMesh.geometry.length, 118.01);
  assert.equal(bodyMesh.geometry.width, 84.20);
  assert.equal(bodyMesh.geometry.height, 36.16);

  // Position offset
  assert.equal(bodyMesh.position.x, 13.88);
  assert.equal(bodyMesh.position.y, 20.75);
  assert.equal(bodyMesh.position.z, 0);

  // Materials: 6 faces, Face 0 colored, Face 1 rear white (0xffffff)
  assert.equal(bodyMesh.material.length, 6);
  assert.equal(bodyMesh.material[0].color, 0x0088ff);
  assert.equal(bodyMesh.material[1].color, 0xffffff);

  // Wireframe highlight attached
  assert.equal(bodyMesh.children.length, 1);
  assert.ok(bodyMesh.children[0] instanceof MockLineSegments);
});

test('4. GarageTurntable (HM) lifecycle, model attachments, and previews', async () => {
  setGarageThreeContext(mockThree);
  setGarageModelLoaders({
    loadFlatCar: async () => new MockGroup(),
    loadGameCar: async () => new MockGroup(),
    getTeamColor: () => 0x2f7bd3
  });

  const turntable = new GarageTurntable({ three: mockThree });
  turntable.init();
  assert.ok(turntable.renderer);
  assert.ok(turntable.scene);
  assert.ok(turntable.camera);

  const attachRes = turntable.attach('hitbox-octane');
  assert.ok(attachRes.canvas);
  assert.ok(attachRes.ready);
  await attachRes.ready;

  assert.ok(turntable.turntables.has('hitbox-octane'));

  turntable.start();
  assert.ok(turntable.frame > 0);
  turntable.draw();
  turntable.stop();
  assert.equal(turntable.frame, 0);

  await turntable.preload();
});

test('5. GarageDialog (UM) DOM bindings, card sync, and pad navigation', () => {
  const container = new MockElement('div');
  let openNotified = null;
  const dialog = new GarageDialog(container, (open) => { openNotified = open; });

  const carButton = container.querySelector('#car-button');
  const carOverlay = container.querySelector('#car-overlay');
  assert.ok(carButton, '#car-button must be created');
  assert.ok(carOverlay, '#car-overlay must be created');

  // Modal show & hide
  assert.equal(dialog.isOpen, false);
  dialog.show();
  assert.equal(dialog.isOpen, true);
  assert.equal(openNotified, true);
  assert.equal(carOverlay.hidden, false);

  dialog.hide();
  assert.equal(dialog.isOpen, false);
  assert.equal(openNotified, false);

  // Focus movement
  dialog.show();
  dialog.moveFocus(1);
  dialog.moveFocus(-1);

  // Selection change
  dialog.choose('hitbox-merc');
  assert.equal(dialog.display.carVisual, 'hitbox-merc');

  dialog.stopPadNav();
});

test('6. Backward-compatibility aliases match expected symbols', () => {
  assert.equal(HM, GarageTurntable);
  assert.equal(UM, GarageDialog);
  assert.equal(kM, CAR_VISUAL_IDS);
  assert.equal(Fc, CAR_VISUAL_OPTIONS);
  assert.equal(Qh, garageSettingsStore);
  assert.equal(xs, PAD_NAVIGATION_BUTTONS);
});
