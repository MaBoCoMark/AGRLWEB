/**
 * tests/gltf_loader.test.js
 * Unit tests for GLTFLoader and GLTFParser (Phase 7.8 Part 3 Deobfuscation)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GLTFLoader,
  GLTFParser,
  GLTFBinaryExtension,
  GLTFLightsExtension,
  GLTFMaterialsUnlitExtension,
  GLTFMaterialsEmissiveStrengthExtension,
  GLTFMaterialsClearcoatExtension,
  GLTFMaterialsDispersionExtension,
  GLTFMaterialsIridescenceExtension,
  GLTFMaterialsSheenExtension,
  GLTFMaterialsTransmissionExtension,
  GLTFMaterialsVolumeExtension,
  GLTFMaterialsIorExtension,
  GLTFMaterialsSpecularExtension,
  GLTFMaterialsBumpExtension,
  GLTFMaterialsAnisotropyExtension,
  GLTFTextureBasisUExtension,
  GLTFTextureWebPExtension,
  GLTFTextureAVIFExtension,
  GLTFMeshoptCompressionExtension,
  GLTFMeshGpuInstancing,
  GLTFDracoMeshCompressionExtension,
  GLTFTextureTransformExtension,
  GLTFMeshQuantizationExtension,
  GLTFCubicSplineInterpolant,
  GLTFCubicSplineQuaternionInterpolant,
  GLTF_EXTENSIONS,
  EXTENSIONS,
  WEBGL_CONSTANTS,
  WEBGL_COMPONENT_TYPES,
  WEBGL_FILTERS,
  WEBGL_WRAPPINGS,
  WEBGL_TYPE_SIZES,
  ATTRIBUTES,
  PATH_PROPERTIES,
  INTERPOLATION_MODES,
  ALPHA_MODES,
  assignExtras,
  assignExtensions,
  createMorphTargets,
  buildMorphTargetAttributes,
  computeBoundingBoxSphere,
  initGeometryAttributes,
  getMaterialExtension,
  extractUrlMimeType,
  getNormalizedComponentScale,
  createPrimitiveKey,
  hashAttributes,
  createCache,
  setGLTFLoaderThreeContext,
  resolveGLTFContext,

  // Obfuscated aliases
  ho,
  $b,
  Tb,
  fb,
  pb,
  mb,
  gb,
  vb,
  jb,
  _b,
  Eb,
  yb,
  xb,
  Cb,
  bb,
  Sb,
  wb,
  Mb,
  Bb,
  Kf,
  kb,
  Rb,
  Pb,
  Ib,
  P0,
  Fb,
  St,
  Nn,
  Ts,
  Zf,
  Qf,
  hc,
  Dh,
  Qr,
  Db,
  dc,
  hr,
  _i,
  Ob,
  Gb,
  zb,
  ep,
  Jt,
  Ub,
  Nh,
  Hb,
  uc,
  ub
} from '../src/loaders/GLTFLoader.js';

test('1. GLTFLoader and GLTFParser backward compatibility aliases match implementations', () => {
  assert.equal(ho, GLTFLoader);
  assert.equal($b, GLTFParser);
  assert.equal(Tb, GLTFBinaryExtension);
  assert.equal(fb, GLTFLightsExtension);
  assert.equal(pb, GLTFMaterialsUnlitExtension);
  assert.equal(mb, GLTFMaterialsEmissiveStrengthExtension);
  assert.equal(gb, GLTFMaterialsClearcoatExtension);
  assert.equal(vb, GLTFMaterialsDispersionExtension);
  assert.equal(jb, GLTFMaterialsIridescenceExtension);
  assert.equal(_b, GLTFMaterialsSheenExtension);
  assert.equal(Eb, GLTFMaterialsTransmissionExtension);
  assert.equal(yb, GLTFMaterialsVolumeExtension);
  assert.equal(xb, GLTFMaterialsIorExtension);
  assert.equal(Cb, GLTFMaterialsSpecularExtension);
  assert.equal(bb, GLTFMaterialsBumpExtension);
  assert.equal(Sb, GLTFMaterialsAnisotropyExtension);
  assert.equal(wb, GLTFTextureBasisUExtension);
  assert.equal(Mb, GLTFTextureWebPExtension);
  assert.equal(Bb, GLTFTextureAVIFExtension);
  assert.equal(Kf, GLTFMeshoptCompressionExtension);
  assert.equal(kb, GLTFMeshGpuInstancing);
  assert.equal(Rb, GLTFDracoMeshCompressionExtension);
  assert.equal(Pb, GLTFTextureTransformExtension);
  assert.equal(Ib, GLTFMeshQuantizationExtension);
  assert.equal(P0, GLTFCubicSplineInterpolant);
  assert.equal(Fb, GLTFCubicSplineQuaternionInterpolant);

  assert.equal(St, EXTENSIONS);
  assert.equal(St, GLTF_EXTENSIONS);
  assert.equal(Nn, WEBGL_CONSTANTS);
  assert.equal(Ts, WEBGL_COMPONENT_TYPES);
  assert.equal(Zf, WEBGL_FILTERS);
  assert.equal(Qf, WEBGL_WRAPPINGS);
  assert.equal(hc, WEBGL_TYPE_SIZES);
  assert.equal(Dh, ATTRIBUTES);
  assert.equal(Qr, PATH_PROPERTIES);
  assert.equal(Db, INTERPOLATION_MODES);
  assert.equal(dc, ALPHA_MODES);

  assert.equal(hr, assignExtras);
  assert.equal(_i, assignExtensions);
  assert.equal(Ob, createMorphTargets);
  assert.equal(Gb, buildMorphTargetAttributes);
  assert.equal(zb, computeBoundingBoxSphere);
  assert.equal(ep, initGeometryAttributes);
  assert.equal(Jt, getMaterialExtension);
  assert.equal(Ub, extractUrlMimeType);
  assert.equal(Nh, getNormalizedComponentScale);
  assert.equal(Hb, createPrimitiveKey);
  assert.equal(uc, hashAttributes);
  assert.equal(ub, createCache);
});

test('2. GLTFLoader constants, type mappings, and extension identifiers', () => {
  // Constants validation
  assert.equal(WEBGL_CONSTANTS.POINTS, 0);
  assert.equal(WEBGL_CONSTANTS.LINES, 1);
  assert.equal(WEBGL_CONSTANTS.LINE_LOOP, 2);
  assert.equal(WEBGL_CONSTANTS.LINE_STRIP, 3);
  assert.equal(WEBGL_CONSTANTS.TRIANGLES, 4);
  assert.equal(WEBGL_CONSTANTS.TRIANGLE_STRIP, 5);
  assert.equal(WEBGL_CONSTANTS.TRIANGLE_FAN, 6);

  // Type sizes
  assert.equal(WEBGL_TYPE_SIZES.SCALAR, 1);
  assert.equal(WEBGL_TYPE_SIZES.VEC2, 2);
  assert.equal(WEBGL_TYPE_SIZES.VEC3, 3);
  assert.equal(WEBGL_TYPE_SIZES.VEC4, 4);
  assert.equal(WEBGL_TYPE_SIZES.MAT2, 4);
  assert.equal(WEBGL_TYPE_SIZES.MAT3, 9);
  assert.equal(WEBGL_TYPE_SIZES.MAT4, 16);

  // Attributes mapping
  assert.equal(ATTRIBUTES.POSITION, 'position');
  assert.equal(ATTRIBUTES.NORMAL, 'normal');
  assert.equal(ATTRIBUTES.TANGENT, 'tangent');
  assert.equal(ATTRIBUTES.TEXCOORD_0, 'uv');
  assert.equal(ATTRIBUTES.TEXCOORD_1, 'uv1');
  assert.equal(ATTRIBUTES.COLOR_0, 'color');
  assert.equal(ATTRIBUTES.JOINTS_0, 'skinIndex');
  assert.equal(ATTRIBUTES.WEIGHTS_0, 'skinWeight');

  // Extensions
  assert.equal(GLTF_EXTENSIONS.KHR_BINARY_GLTF, 'KHR_binary_glTF');
  assert.equal(GLTF_EXTENSIONS.KHR_DRACO_MESH_COMPRESSION, 'KHR_draco_mesh_compression');
  assert.equal(GLTF_EXTENSIONS.KHR_LIGHTS_PUNCTUAL, 'KHR_lights_punctual');
  assert.equal(GLTF_EXTENSIONS.KHR_MATERIALS_CLEARCOAT, 'KHR_materials_clearcoat');
  assert.equal(GLTF_EXTENSIONS.KHR_MATERIALS_TRANSMISSION, 'KHR_materials_transmission');
  assert.equal(GLTF_EXTENSIONS.EXT_MESHOPT_COMPRESSION, 'EXT_meshopt_compression');
  assert.equal(GLTF_EXTENSIONS.KHR_MESH_QUANTIZATION, 'KHR_mesh_quantization');
});

test('3. GLTFLoader instantiation and plugin registration', () => {
  const loader = new GLTFLoader();
  assert.ok(loader);
  assert.equal(typeof loader.load, 'function');
  assert.equal(typeof loader.parse, 'function');
  assert.equal(typeof loader.register, 'function');
  assert.equal(typeof loader.unregister, 'function');
  assert.equal(typeof loader.setDRACOLoader, 'function');
  assert.equal(typeof loader.setKTX2Loader, 'function');
  assert.equal(typeof loader.setMeshoptDecoder, 'function');

  // Should have registered all 18 default plugin factories
  assert.ok(loader.pluginCallbacks.length >= 18);

  // Custom plugin register/unregister
  const dummyPlugin = () => {};
  loader.register(dummyPlugin);
  assert.ok(loader.pluginCallbacks.includes(dummyPlugin));
  loader.unregister(dummyPlugin);
  assert.ok(!loader.pluginCallbacks.includes(dummyPlugin));
});

test('4. GLTFLoader.parse parses minimal GLTF 2.0 structure', (t, done) => {
  const loader = new GLTFLoader();
  const sampleGLTF = JSON.stringify({
    asset: { version: '2.0', generator: 'AGRLWEB Unit Test' },
    scenes: [{ name: 'TestScene', nodes: [0] }],
    nodes: [{ name: 'TestRootNode' }]
  });

  loader.parse(
    sampleGLTF,
    '',
    (gltf) => {
      assert.ok(gltf);
      assert.ok(gltf.scene);
      assert.equal(gltf.scene.children.length, 1);
      assert.equal(gltf.scene.children[0].name, 'TestRootNode');
      assert.ok(gltf.asset);
      assert.equal(gltf.asset.version, '2.0');
      done();
    },
    (err) => {
      done(err);
    }
  );
});

test('5. GLTFLoader.parse parses mesh, material, and embedded base64 buffers', (t, done) => {
  const loader = new GLTFLoader();
  const sampleGLTF = JSON.stringify({
    asset: { version: '2.0' },
    scenes: [{ name: 'CarScene', nodes: [0] }],
    nodes: [{ name: 'CarBodyNode', mesh: 0 }],
    meshes: [{
      name: 'CarBodyMesh',
      primitives: [{
        attributes: { POSITION: 0 },
        indices: 1,
        material: 0
      }]
    }],
    materials: [{
      name: 'MetallicCarPaint',
      pbrMetallicRoughness: {
        baseColorFactor: [0.9, 0.1, 0.1, 1.0],
        metallicFactor: 0.8,
        roughnessFactor: 0.2
      }
    }],
    accessors: [
      { bufferView: 0, byteOffset: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-1, -1, 0], max: [1, 1, 0] },
      { bufferView: 1, byteOffset: 0, componentType: 5123, count: 3, type: 'SCALAR', min: [0], max: [2] }
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 6 }
    ],
    buffers: [
      { byteLength: 42, uri: 'data:application/octet-stream;base64,AAAAAAAAgD8AAACAAAAAAAAAgL8AAACAAAAAAAAAAACAPwAAAAAAAAAAAQACAAAA' }
    ]
  });

  loader.parse(
    sampleGLTF,
    '',
    (gltf) => {
      assert.ok(gltf);
      assert.ok(gltf.scene);
      assert.equal(gltf.scene.children.length, 1);
      const meshNode = gltf.scene.children[0];
      assert.equal(meshNode.name, 'CarBodyNode');
      assert.ok(meshNode.isMesh);
      assert.ok(meshNode.geometry);
      assert.ok(meshNode.geometry.attributes.position);
      assert.equal(meshNode.geometry.attributes.position.count, 3);
      assert.ok(meshNode.geometry.index);
      assert.equal(meshNode.geometry.index.count, 3);
      assert.ok(meshNode.material);
      assert.equal(meshNode.material.name, 'MetallicCarPaint');
      done();
    },
    (err) => {
      done(err);
    }
  );
});

test('6. Helper utilities: extractUrlMimeType, getNormalizedComponentScale, createCache', () => {
  // extractUrlMimeType
  assert.equal(extractUrlMimeType('texture.jpg'), 'image/jpeg');
  assert.equal(extractUrlMimeType('texture.jpeg'), 'image/jpeg');
  assert.equal(extractUrlMimeType('texture.webp'), 'image/webp');
  assert.equal(extractUrlMimeType('texture.ktx2'), 'image/ktx2');
  assert.equal(extractUrlMimeType('texture.png'), 'image/png');
  assert.equal(extractUrlMimeType('data:image/jpeg;base64,...'), 'image/jpeg');

  // getNormalizedComponentScale
  assert.equal(getNormalizedComponentScale(Int8Array), 1 / 127);
  assert.equal(getNormalizedComponentScale(Uint8Array), 1 / 255);
  assert.equal(getNormalizedComponentScale(Int16Array), 1 / 32767);
  assert.equal(getNormalizedComponentScale(Uint16Array), 1 / 65535);

  // createCache
  const cache = createCache();
  cache.add('keyA', 123);
  assert.equal(cache.get('keyA'), 123);
  cache.remove('keyA');
  assert.equal(cache.get('keyA'), undefined);
  cache.add('keyB', 456);
  cache.removeAll();
  assert.equal(cache.get('keyB'), undefined);
});

test('7. Context resolution and setGLTFLoaderThreeContext dynamic injection', () => {
  const ctx = resolveGLTFContext();
  assert.ok(ctx);
  assert.ok(ctx.Loader);
  assert.ok(ctx.Vector3);
  assert.ok(ctx.Matrix4);
  assert.ok(ctx.BufferGeometry);
  assert.equal(ctx.RepeatWrapping, 1000);
  assert.equal(ctx.TriangleStripDrawMode, 1);

  // Test dynamic injection
  let customInjected = false;
  class CustomVector3 {
    constructor(x = 0, y = 0, z = 0) {
      customInjected = true;
      this.x = x; this.y = y; this.z = z;
    }
  }
  setGLTFLoaderThreeContext({ Vector3: CustomVector3 });
  const updatedCtx = resolveGLTFContext();
  assert.equal(updatedCtx.Vector3, CustomVector3);
});
