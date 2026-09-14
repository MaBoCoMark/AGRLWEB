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
