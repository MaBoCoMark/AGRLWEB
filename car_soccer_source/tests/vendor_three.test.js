/**
 * tests/vendor_three.test.js
 * Comprehensive unit test suite for decoupled Three.js r185 vendor module (Phase 8.2).
 * Validates semantic exports, backward-compatible mangled exports, and basic math functionality.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import THREE, {
  Vector3,
  Vector2,
  Matrix4,
  Quaternion,
  Color,
  Group,
  Mesh,
  Scene,
  BufferGeometry,
  Float32BufferAttribute,
  MeshStandardMaterial,
  MeshBasicMaterial,
  DoubleSide,
  SRGBColorSpace,
  // Mangled exports
  F,
  Ae,
  mt,
  jn,
  Ne,
  dt,
  Ee,
  el,
  Ct,
  Ke,
  lt,
  cn,
  Ut,
  Ht
} from '../src/vendor/three.js';

test('1. Vendor Three.js exports semantic classes and identical mangled aliases', () => {
  assert.equal(Vector3, F, 'Vector3 must match mangled alias F');
  assert.equal(Vector2, Ae, 'Vector2 must match mangled alias Ae');
  assert.equal(Matrix4, mt, 'Matrix4 must match mangled alias mt');
  assert.equal(Quaternion, jn, 'Quaternion must match mangled alias jn');
  assert.equal(Color, Ne, 'Color must match mangled alias Ne');
  assert.equal(Group, dt, 'Group must match mangled alias dt');
  assert.equal(Mesh, Ee, 'Mesh must match mangled alias Ee');
  assert.equal(Scene, el, 'Scene must match mangled alias el');
  assert.equal(BufferGeometry, Ct, 'BufferGeometry must match mangled alias Ct');
  assert.equal(Float32BufferAttribute, Ke, 'Float32BufferAttribute must match mangled alias Ke');
  assert.equal(MeshStandardMaterial, lt, 'MeshStandardMaterial must match mangled alias lt');
  assert.equal(MeshBasicMaterial, cn, 'MeshBasicMaterial must match mangled alias cn');
  assert.equal(DoubleSide, Ut, 'DoubleSide must match mangled alias Ut');
  assert.equal(SRGBColorSpace, Ht, 'SRGBColorSpace must match mangled alias Ht');
});

test('2. Default THREE namespace export mirrors named exports', () => {
  assert.ok(THREE, 'Default THREE export must exist');
  assert.equal(THREE.Vector3, Vector3);
  assert.equal(THREE.Matrix4, Matrix4);
  assert.equal(THREE.Color, Color);
  assert.equal(THREE.Mesh, Mesh);
  assert.equal(THREE.Scene, Scene);
  assert.equal(THREE.BufferGeometry, BufferGeometry);
});

test('3. Vector3 and Vector2 instantiation and vector mathematics', () => {
  const v1 = new Vector3(10, 20, 30);
  const v2 = new Vector3(1, 2, 3);
  const v3 = v1.clone().add(v2);

  assert.equal(v3.x, 11);
  assert.equal(v3.y, 22);
  assert.equal(v3.z, 33);
  assert.equal(v1.dot(v2), 10 * 1 + 20 * 2 + 30 * 3);

  const u = new Vector2(3, 4);
  assert.equal(u.length(), 5);
});

test('4. Matrix4 and Quaternion composition and transformation', () => {
  const m = new Matrix4();
  m.makeTranslation(100, 200, 300);
  const p = new Vector3(0, 0, 0);
  p.applyMatrix4(m);

  assert.equal(p.x, 100);
  assert.equal(p.y, 200);
  assert.equal(p.z, 300);

  const q = new Quaternion();
  q.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
  const forward = new Vector3(0, 0, 1);
  forward.applyQuaternion(q);
  assert.ok(Math.abs(forward.x - 1) < 1e-6);
  assert.ok(Math.abs(forward.z) < 1e-6);
});

test('5. Color parsing and hex conversion', () => {
  const c = new Color(0xff8800);
  assert.equal(c.r, 1);
  // In Three.js r185 Color converts hex from sRGB to linear-sRGB space internally
  assert.ok(c.g > 0 && c.g < 1);
  assert.equal(c.b, 0);
  assert.equal(c.getHex(), 0xff8800);
});

test('6. Scene hierarchy, Groups, and BufferGeometry creation', () => {
  const scene = new Scene();
  const group = new Group();
  const geo = new BufferGeometry();
  const pos = new Float32BufferAttribute([0, 0, 0, 1, 1, 1, 2, 2, 2], 3);
  geo.setAttribute('position', pos);

  const mat = new MeshStandardMaterial({ color: 0x00ff00 });
  const mesh = new Mesh(geo, mat);
  group.add(mesh);
  scene.add(group);

  assert.equal(scene.children.length, 1);
  assert.equal(group.children.length, 1);
  assert.equal(group.children[0], mesh);
});

test("7. Vendor Three.js exports InterleavedBuffer, InterleavedBufferAttribute, and Fog", () => {
  assert.ok(THREE.InterleavedBuffer, "InterleavedBuffer should exist on THREE");
  assert.ok(THREE.InterleavedBufferAttribute, "InterleavedBufferAttribute should exist on THREE");
  assert.ok(THREE.Fog, "Fog should exist on THREE");

  const data = new Float32Array([0, 1, 2, 10, 20, 30, 3, 4, 5, 40, 50, 60]);
  const ib = new THREE.InterleavedBuffer(data, 6);
  assert.equal(ib.count, 2);
  assert.equal(ib.stride, 6);

  const posAttr = new THREE.InterleavedBufferAttribute(ib, 3, 0);
  assert.equal(posAttr.count, 2);
  assert.equal(posAttr.itemSize, 3);
  assert.equal(posAttr.offset, 0);
  assert.equal(posAttr.getX(0), 0);
  assert.equal(posAttr.getY(0), 1);
  assert.equal(posAttr.getZ(0), 2);
  assert.equal(posAttr.getX(1), 3);
  assert.equal(posAttr.getY(1), 4);
  assert.equal(posAttr.getZ(1), 5);

  const normAttr = new THREE.InterleavedBufferAttribute(ib, 3, 3);
  assert.equal(normAttr.getX(0), 10);
  assert.equal(normAttr.getX(1), 40);
});

test("8. InterleavedBufferAttribute applyMatrix4 and bounding box/sphere computation are finite without NaN", () => {
  const data = new Float32Array([
    10, 20, 30, 0, 1, 0,
    40, 50, 60, 0, 1, 0
  ]);
  const ib = new THREE.InterleavedBuffer(data, 6);
  const posAttr = new THREE.InterleavedBufferAttribute(ib, 3, 0);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", posAttr);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();

  assert.ok(Number.isFinite(geo.boundingBox.min.x));
  assert.ok(Number.isFinite(geo.boundingBox.max.x));
  assert.ok(Number.isFinite(geo.boundingSphere.radius));
  assert.equal(geo.boundingBox.min.x, 10);
  assert.equal(geo.boundingBox.max.x, 40);

  // Clone and apply transform
  const cloned = geo.clone();
  const m = new THREE.Matrix4();
  m.makeTranslation(5, 5, 5);
  cloned.applyMatrix4(m);

  assert.ok(Number.isFinite(cloned.boundingBox.min.x), "Cloned min.x must be finite");
  assert.ok(Number.isFinite(cloned.boundingBox.max.x), "Cloned max.x must be finite");
  assert.ok(Number.isFinite(cloned.boundingSphere.radius), "Cloned bounding sphere radius must be finite");
  assert.equal(cloned.boundingBox.min.x, 15);
  assert.equal(cloned.boundingBox.max.x, 45);
});

test("9. Vendor Three.js exports MeshLambertMaterial, DirectionalLight, and SpotLight with correct types", () => {
  assert.ok(THREE.MeshLambertMaterial, "MeshLambertMaterial should exist on THREE");
  const lambert = new THREE.MeshLambertMaterial({ color: 0x112233 });
  assert.equal(lambert.type, "MeshLambertMaterial");
  assert.equal(lambert.isMeshLambertMaterial, true);

  assert.ok(THREE.DirectionalLight, "DirectionalLight should exist on THREE");
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
  assert.equal(dirLight.type, "DirectionalLight");
  assert.equal(dirLight.isDirectionalLight, true);

  assert.ok(THREE.SpotLight, "SpotLight should exist on THREE");
  const spotLight = new THREE.SpotLight(0xffffff, 2.0);
  assert.equal(spotLight.type, "SpotLight");
  assert.equal(spotLight.isSpotLight, true);
});
