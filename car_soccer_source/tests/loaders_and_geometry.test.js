/**
 * tests/loaders_and_geometry.test.js
 * Unit tests for BufferGeometryUtils and OBJLoader (Phase 7.8 Deobfuscation)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  mergeGeometries,
  mergeVertices,
  toTrianglesDrawMode,
  cloneSkinnedMesh,
  computeInterleavedAttributes,
  traverseHierarchy,
  TrianglesDrawMode,
  TriangleStripDrawMode,
  TriangleFanDrawMode,
  setBufferGeometryUtilsThreeContext,
  hl,
  hb,
  Jf,
  db,
  Xf,
  T0
} from '../src/utils/BufferGeometryUtils.js';

import {
  OBJLoader,
  OBJParser,
  setOBJLoaderThreeContext,
  cb,
  lb
} from '../src/loaders/OBJLoader.js';

test('1. BufferGeometryUtils constants and backward compatibility aliases', () => {
  assert.equal(TrianglesDrawMode, 0);
  assert.equal(TriangleStripDrawMode, 1);
  assert.equal(TriangleFanDrawMode, 2);

  assert.equal(hl, mergeGeometries);
  assert.equal(hb, mergeVertices);
  assert.equal(Jf, toTrianglesDrawMode);
  assert.equal(db, cloneSkinnedMesh);
  assert.equal(Xf, computeInterleavedAttributes);
  assert.equal(T0, traverseHierarchy);
});

test('2. BufferGeometryUtils.mergeGeometries combines multiple geometries', () => {
  // Setup simple geometries using fallback context
  class MockBufferAttribute {
    constructor(array, itemSize) {
      this.array = array;
      this.itemSize = itemSize;
      this.count = array.length / itemSize;
    }
    getX(idx) { return this.array[idx * this.itemSize]; }
  }

  class MockBufferGeometry {
    constructor() {
      this.attributes = {};
      this.morphAttributes = {};
      this.index = null;
      this.groups = [];
    }
    setIndex(idx) {
      this.index = new MockBufferAttribute(idx, 1);
      return this;
    }
    setAttribute(name, attr) {
      this.attributes[name] = attr;
      return this;
    }
    addGroup(start, count, materialIndex) {
      this.groups.push({ start, count, materialIndex });
    }
  }

  setBufferGeometryUtilsThreeContext({
    BufferGeometry: MockBufferGeometry,
    BufferAttribute: MockBufferAttribute
  });

  const geo1 = new MockBufferGeometry();
  geo1.setAttribute('position', new MockBufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
  geo1.setIndex([0, 1, 2]);

  const geo2 = new MockBufferGeometry();
  geo2.setAttribute('position', new MockBufferAttribute(new Float32Array([2, 0, 0, 3, 0, 0, 2, 1, 0]), 3));
  geo2.setIndex([0, 1, 2]);

  const merged = mergeGeometries([geo1, geo2], true);
  assert.ok(merged, 'Merged geometry must be produced');
  assert.equal(merged.attributes.position.count, 6, 'Total vertex count must be 6');
  assert.equal(merged.index.count, 6, 'Total index count must be 6');
  assert.equal(merged.groups.length, 2, 'Two groups should be created for two merged meshes');
  assert.deepEqual(Array.from(merged.index.array), [0, 1, 2, 3, 4, 5]);
});

test('3. BufferGeometryUtils.mergeVertices deduplicates coincident vertices within tolerance', () => {
  class MockBufferAttribute {
    constructor(array, itemSize) {
      this.array = array;
      this.itemSize = itemSize;
      this.count = array.length / itemSize;
    }
    getX(idx) { return this.array[idx * this.itemSize]; }
    getY(idx) { return this.array[idx * this.itemSize + 1]; }
    getZ(idx) { return this.array[idx * this.itemSize + 2]; }
    setX(idx, v) { this.array[idx * this.itemSize] = v; }
    setY(idx, v) { this.array[idx * this.itemSize + 1] = v; }
    setZ(idx, v) { this.array[idx * this.itemSize + 2] = v; }
  }

  class MockBufferGeometry {
    constructor() {
      this.attributes = {};
      this.index = null;
    }
    getIndex() { return this.index; }
    setIndex(idx) {
      this.index = new MockBufferAttribute(new Uint32Array(idx), 1);
      return this;
    }
    getAttribute(name) { return this.attributes[name]; }
    setAttribute(name, attr) {
      this.attributes[name] = attr;
      return this;
    }
    clone() {
      const g = new MockBufferGeometry();
      for (const k in this.attributes) {
        g.setAttribute(k, new MockBufferAttribute(new Float32Array(this.attributes[k].array.slice()), this.attributes[k].itemSize));
      }
      return g;
    }
  }

  // Geometry with duplicate vertex at (0, 0, 0)
  const geo = new MockBufferGeometry();
  geo.setAttribute('position', new MockBufferAttribute(new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0, 0, 0, // Duplicate of vertex 0
    0, 1, 0
  ]), 3));

  const welded = mergeVertices(geo, 1e-4);
  assert.ok(welded, 'Welded geometry should exist');
  assert.equal(welded.attributes.position.count, 3, '4 vertices with 1 duplicate should be reduced to 3');
  assert.equal(welded.index.count, 4, 'Index count must match original vertex count');
  assert.deepEqual(Array.from(welded.index.array), [0, 1, 0, 2]);
});

test('4. BufferGeometryUtils.toTrianglesDrawMode converts triangle fan and strip', () => {
  class MockBufferAttribute {
    constructor(array, itemSize) {
      this.array = array;
      this.itemSize = itemSize;
      this.count = array.length / itemSize;
    }
    getX(idx) { return this.array[idx]; }
  }

  class MockBufferGeometry {
    constructor() {
      this.attributes = {};
      this.index = null;
    }
    getIndex() { return this.index; }
    setIndex(idx) {
      this.index = new MockBufferAttribute(idx, 1);
      return this;
    }
    getAttribute(name) { return this.attributes[name]; }
    setAttribute(name, attr) { this.attributes[name] = attr; return this; }
    clearGroups() {}
    clone() {
      const g = new MockBufferGeometry();
      g.attributes = { ...this.attributes };
      return g;
    }
  }

  const geo = new MockBufferGeometry();
  geo.setAttribute('position', new MockBufferAttribute(new Float32Array(12), 3));
  geo.setIndex([0, 1, 2, 3]); // 4 vertices in fan/strip

  // TriangleFanDrawMode (2): triangles are (0, 1, 2) and (0, 2, 3)
  const fanConverted = toTrianglesDrawMode(geo, TriangleFanDrawMode);
  assert.deepEqual(fanConverted.index.array, [0, 1, 2, 0, 2, 3]);

  // TriangleStripDrawMode (1): triangles are (0, 1, 2) and (2, 1, 3)
  const stripConverted = toTrianglesDrawMode(geo, TriangleStripDrawMode);
  assert.deepEqual(stripConverted.index.array, [0, 1, 2, 3, 2, 1]);
});

test('5. OBJLoader and OBJParser backward compatibility and aliases', () => {
  assert.equal(cb, OBJLoader);
  assert.equal(lb, OBJParser);
});

test('6. OBJLoader parses wavefront OBJ string into 3D Mesh hierarchy', () => {
  const objSample = `
# Wavefront OBJ test sample
v 0.0 0.0 0.0
v 1.0 0.0 0.0
v 0.0 1.0 0.0
vn 0.0 0.0 1.0
vt 0.0 0.0
vt 1.0 0.0
vt 0.0 1.0
f 1/1/1 2/2/1 3/3/1
`;

  const loader = new OBJLoader();
  const result = loader.parse(objSample);

  assert.ok(result, 'Parser must return a root Object3D/Group');
  assert.ok(result.children.length > 0, 'Parsed group should have child mesh');
  const mesh = result.children[0];
  assert.ok(mesh.geometry, 'Child mesh must have geometry');
  assert.ok(mesh.geometry.attributes.position, 'Must have position attribute');
  assert.equal(mesh.geometry.attributes.position.count, 3, 'Must have 3 vertices for the triangle');
  assert.ok(mesh.geometry.attributes.normal, 'Must have normal attribute');
  assert.ok(mesh.geometry.attributes.uv, 'Must have uv attribute');
});

test("7. OBJLoader.loadAsync returns a Promise and loads successfully", async () => {
  const loader = new OBJLoader();
  assert.equal(typeof loader.loadAsync, "function", "OBJLoader must have loadAsync method");

  // Mock loader.load to resolve with parsed object
  const origLoad = loader.load.bind(loader);
  loader.load = function(url, onLoad, onProgress, onError) {
    onLoad({ name: "mock-pad-mesh", isGroup: true, children: [] });
  };

  const loaded = await loader.loadAsync("/assets/arena/pads/large-active.obj");
  assert.ok(loaded, "loadAsync must resolve with loaded object");
  assert.equal(loaded.name, "mock-pad-mesh");
});

test('8. OBJLoader default manager implements resolveURL and abortController', () => {
  const loader = new OBJLoader();
  assert.ok(loader.manager, 'OBJLoader must have a manager');
  assert.equal(typeof loader.manager.resolveURL, 'function', 'manager must implement resolveURL');
  assert.equal(typeof loader.manager.itemStart, 'function', 'manager must implement itemStart');
  assert.equal(typeof loader.manager.itemEnd, 'function', 'manager must implement itemEnd');
  assert.equal(typeof loader.manager.itemError, 'function', 'manager must implement itemError');
  assert.ok(loader.manager.abortController, 'manager must implement abortController getter');
  assert.equal(loader.manager.resolveURL('/assets/arena/pads/large-active.obj'), '/assets/arena/pads/large-active.obj');
});

test('9. Regression: FileLoader calling this.manager.resolveURL does not throw TypeError', async () => {
  // Simulate Three.js FileLoader (Pd) behavior from CarSoccerEngine.js:7588
  class SimulatedThreeFileLoader {
    constructor(manager) {
      this.manager = manager;
      this.path = '';
      this._abortController = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    }
    setPath(p) { this.path = p; return this; }
    setRequestHeader() { return this; }
    setWithCredentials() { return this; }
    load(url, onLoad, onProgress, onError) {
      let resolved = (this.path || '') + url;
      // Exact line 7588 from CarSoccerEngine.js:
      resolved = this.manager.resolveURL(resolved);
      const signal = this.manager.abortController ? this.manager.abortController.signal : null;
      assert.ok(resolved, 'URL must be resolved');
      // Return mock OBJ content
      onLoad('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n');
    }
  }

  setOBJLoaderThreeContext({
    FileLoader: SimulatedThreeFileLoader
  });

  const loader = new OBJLoader();
  const obj = await loader.loadAsync('/assets/arena/pads/large-active.obj');
  assert.ok(obj, 'OBJ must load and parse through FileLoader');
  assert.ok(obj.children.length > 0, 'Must produce mesh children');
});

test('10. OBJLoader adopts DefaultLoadingManager and Three.js Loader manager hierarchy', () => {
  const mockDefaultManager = {
    isDefaultManager: true,
    resolveURL(url) { return 'resolved:' + url; },
    itemStart() {},
    itemEnd() {},
    itemError() {},
    abortController: {}
  };

  class MockThreeLoader {
    constructor(manager) {
      this.manager = manager !== undefined ? manager : mockDefaultManager;
    }
  }

  setOBJLoaderThreeContext({
    Loader: MockThreeLoader,
    DefaultLoadingManager: mockDefaultManager
  });

  const loader = new OBJLoader();
  assert.equal(loader.manager, mockDefaultManager, 'OBJLoader must adopt DefaultLoadingManager');
  assert.equal(loader.manager.resolveURL('test.obj'), 'resolved:test.obj');
});

test('11. OBJLoader defensively patches custom manager missing resolveURL', () => {
  // Edge case: user or third-party passes incomplete manager
  const partialManager = {
    itemStart() {},
    itemEnd() {},
    itemError() {}
  };

  const loader = new OBJLoader(partialManager);
  assert.equal(typeof loader.manager.resolveURL, 'function', 'Defensively ensured resolveURL exists');
  assert.equal(loader.manager.resolveURL('sample.obj'), 'sample.obj');
  assert.ok(loader.manager.abortController, 'Defensively ensured abortController exists');
});
