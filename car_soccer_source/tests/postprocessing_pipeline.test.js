import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Pass,
  FullScreenGeometry,
  FullScreenQuad,
  ShaderPass,
  MaskPass,
  ClearMaskPass,
  CopyShader,
  OutputShader,
  OutputPass,
  RenderPass,
  EffectComposer,
  RoomEnvironment,
  createRoomEnvironmentMaterial,
  setPostprocessingThreeContext,
  RawShaderMaterial,
  LinearToneMapping,
  ReinhardToneMapping,
  CineonToneMapping,
  ACESFilmicToneMapping,
  AgXToneMapping,
  NeutralToneMapping,
  CustomToneMapping,
  Js,
  cC,
  ll,
  h0,
  Mf,
  dC,
  _A,
  Ko,
  fC,
  pC,
  uC,
  c0,
  gs
} from '../src/effects/index.js';

test('1. PostprocessingPipeline constants and backward-compatibility aliases', () => {
  assert.equal(LinearToneMapping, 1);
  assert.equal(ReinhardToneMapping, 2);
  assert.equal(CineonToneMapping, 3);
  assert.equal(ACESFilmicToneMapping, 4);
  assert.equal(CustomToneMapping, 5);
  assert.equal(AgXToneMapping, 6);
  assert.equal(NeutralToneMapping, 7);

  // Backward-compatibility aliases
  assert.equal(Js, Pass);
  assert.equal(cC, FullScreenGeometry);
  assert.equal(ll, FullScreenQuad);
  assert.equal(h0, ShaderPass);
  assert.equal(Mf, MaskPass);
  assert.equal(dC, ClearMaskPass);
  assert.equal(_A, CopyShader);
  assert.equal(Ko, OutputShader);
  assert.equal(fC, OutputPass);
  assert.equal(pC, RenderPass);
  assert.equal(uC, EffectComposer);
  assert.equal(c0, RoomEnvironment);
  assert.equal(gs, createRoomEnvironmentMaterial);
});

test('2. Pass base class contract', () => {
  const pass = new Pass();
  assert.equal(pass.isPass, true);
  assert.equal(pass.enabled, true);
  assert.equal(pass.needsSwap, true);
  assert.equal(pass.clear, false);
  assert.equal(pass.renderToScreen, false);
  assert.doesNotThrow(() => pass.setSize(800, 600));
  assert.doesNotThrow(() => pass.dispose());
});

test('3. FullScreenGeometry and FullScreenQuad lifecycle and rendering', () => {
  const geom = new FullScreenGeometry();
  assert.ok(geom.attributes.position, 'Must define position attribute');
  assert.ok(geom.attributes.uv, 'Must define uv attribute');
  assert.deepEqual(geom.attributes.position.array, [-1, 3, 0, -1, -1, 0, 3, -1, 0]);
  assert.deepEqual(geom.attributes.uv.array, [0, 2, 0, 0, 2, 0]);

  const mockMaterial = { id: 'mat1', disposeCount: 0, dispose() { this.disposeCount++; } };
  const quad = new FullScreenQuad(mockMaterial);
  assert.equal(quad.material, mockMaterial);

  const updatedMaterial = { id: 'mat2' };
  quad.material = updatedMaterial;
  assert.equal(quad.material, updatedMaterial);

  let renderedMesh = null;
  let renderedCamera = null;
  const mockRenderer = {
    render(mesh, camera) {
      renderedMesh = mesh;
      renderedCamera = camera;
    }
  };

  quad.render(mockRenderer);
  assert.ok(renderedMesh, 'Renderer should receive mesh');
  assert.ok(renderedCamera, 'Renderer should receive orthographic camera');
  assert.equal(renderedMesh.material, updatedMaterial);

  assert.doesNotThrow(() => quad.dispose());
});

test('4. CopyShader and OutputShader structures and uniforms', () => {
  assert.equal(CopyShader.name, 'CopyShader');
  assert.ok('tDiffuse' in CopyShader.uniforms);
  assert.ok('opacity' in CopyShader.uniforms);
  assert.ok(CopyShader.vertexShader.includes('gl_Position'));
  assert.ok(CopyShader.fragmentShader.includes('gl_FragColor'));

  assert.equal(OutputShader.name, 'OutputShader');
  assert.ok('tDiffuse' in OutputShader.uniforms);
  assert.ok('toneMappingExposure' in OutputShader.uniforms);
  assert.ok(OutputShader.fragmentShader.includes('LinearToneMapping'));
  assert.ok(OutputShader.fragmentShader.includes('sRGBTransferOETF'));
});

test('5. ShaderPass initializes uniforms, reads texture, and renders', () => {
  const shaderPass = new ShaderPass(CopyShader);
  assert.ok(shaderPass.isPass);
  assert.ok(shaderPass.uniforms);
  assert.equal(shaderPass.textureID, 'tDiffuse');

  let currentTarget = 'unassigned';
  let renderedQuad = false;
  const mockRenderer = {
    setRenderTarget(target) { currentTarget = target; },
    clear() {},
    render() { renderedQuad = true; }
  };

  const mockReadBuffer = { texture: { name: 'sourceTexture' } };
  const mockWriteBuffer = { id: 'writeTarget' };

  // Render to write target (renderToScreen = false)
  shaderPass.renderToScreen = false;
  shaderPass.render(mockRenderer, mockWriteBuffer, mockReadBuffer);
  assert.equal(shaderPass.uniforms.tDiffuse.value, mockReadBuffer.texture);
  assert.equal(currentTarget, mockWriteBuffer);
  assert.equal(renderedQuad, true);

  // Render to screen (renderToScreen = true)
  shaderPass.renderToScreen = true;
  shaderPass.render(mockRenderer, mockWriteBuffer, mockReadBuffer);
  assert.equal(currentTarget, null);

  assert.doesNotThrow(() => shaderPass.dispose());
});

test('6. MaskPass and ClearMaskPass handle stencil state and render calls', () => {
  const mockScene = { isScene: true };
  const mockCamera = { isCamera: true };

  const maskPass = new MaskPass(mockScene, mockCamera);
  assert.equal(maskPass.needsSwap, false);
  assert.equal(maskPass.clear, true);
  assert.equal(maskPass.inverse, false);

  const stateBuffers = {
    color: { setMask() {}, setLocked() {} },
    depth: { setMask() {}, setLocked() {} },
    stencil: {
      setTest() {},
      setOp() {},
      setFunc() {},
      setClear() {},
      setLocked() {}
    }
  };

  let sceneRenderCount = 0;
  const mockRenderer = {
    getContext: () => ({ REPLACE: 1, ALWAYS: 2, KEEP: 3, EQUAL: 4 }),
    state: { buffers: stateBuffers },
    setRenderTarget() {},
    clear() {},
    render() { sceneRenderCount++; }
  };

  maskPass.render(mockRenderer, { id: 'write' }, { id: 'read' });
  assert.equal(sceneRenderCount, 2, 'MaskPass renders scene twice (to read and write buffers)');

  const clearMaskPass = new ClearMaskPass();
  assert.equal(clearMaskPass.needsSwap, false);
  assert.doesNotThrow(() => clearMaskPass.render(mockRenderer));
});

test('7. RenderPass preserves clear settings and evaluates scene', () => {
  const mockScene = { overrideMaterial: null };
  const mockCamera = {};
  const renderPass = new RenderPass(mockScene, mockCamera, { id: 'override' }, 0x112233, 0.8);
  assert.equal(renderPass.isRenderPass, true);
  assert.equal(renderPass.needsSwap, false);

  let renderedScene = null;
  let clearedColor = null;
  let clearedAlpha = null;

  const mockRenderer = {
    autoClear: true,
    getClearAlpha: () => 1.0,
    getClearColor: (target) => { target.r = 0; target.g = 0; target.b = 0; return target; },
    setClearColor: (c, a) => { clearedColor = c; clearedAlpha = a; },
    setClearAlpha: (a) => { clearedAlpha = a; },
    setRenderTarget() {},
    clear() {},
    render: (s) => {
      renderedScene = s;
      assert.equal(s.overrideMaterial.id, 'override', 'Override material should be temporarily applied');
    }
  };

  renderPass.render(mockRenderer, { id: 'write' }, { id: 'read' });
  assert.equal(mockScene.overrideMaterial, null, 'Override material should be restored');
  assert.equal(mockRenderer.autoClear, true, 'autoClear should be restored');
  assert.ok(renderedScene);
});

test('8. OutputPass adapts tonemapping and color space defines', () => {
  const outputPass = new OutputPass();
  assert.equal(outputPass.isOutputPass, true);
  assert.equal(outputPass.material.isRawShaderMaterial, true, 'OutputPass material must have isRawShaderMaterial = true');
  assert.equal(outputPass.material.type, 'RawShaderMaterial', 'OutputPass material type must be RawShaderMaterial');

  const mockRenderer = {
    outputColorSpace: 'srgb',
    toneMapping: ACESFilmicToneMapping,
    toneMappingExposure: 1.5,
    setRenderTarget() {},
    render() {}
  };

  const mockReadBuffer = { texture: { name: 'sceneTex' } };
  outputPass.render(mockRenderer, { id: 'write' }, mockReadBuffer);

  assert.equal(outputPass.uniforms.tDiffuse.value, mockReadBuffer.texture);
  assert.equal(outputPass.uniforms.toneMappingExposure.value, 1.5);
  assert.ok('ACES_FILMIC_TONE_MAPPING' in outputPass.material.defines);
  assert.ok('SRGB_TRANSFER' in outputPass.material.defines);

  // Switch to AgX
  mockRenderer.toneMapping = AgXToneMapping;
  mockRenderer.outputColorSpace = 'linear';
  outputPass.render(mockRenderer, { id: 'write' }, mockReadBuffer);
  assert.ok('AGX_TONE_MAPPING' in outputPass.material.defines);
  assert.ok(!('ACES_FILMIC_TONE_MAPPING' in outputPass.material.defines));

  assert.doesNotThrow(() => outputPass.dispose());
});

test('9. EffectComposer ping-pong buffering, pass execution, and sizing', () => {
  const mockRenderer = {
    getPixelRatio: () => 1,
    getSize: (v) => v.set(1920, 1080),
    getRenderTarget: () => null,
    setRenderTarget() {}
  };

  const composer = new EffectComposer(mockRenderer);
  assert.equal(composer.passes.length, 0);
  assert.equal(composer.writeBuffer, composer.renderTarget1);
  assert.equal(composer.readBuffer, composer.renderTarget2);

  let pass1Rendered = false;
  let pass2Rendered = false;

  const mockPass1 = {
    enabled: true,
    needsSwap: true,
    renderToScreen: false,
    setSize() {},
    render: (r, w, rd) => { pass1Rendered = true; }
  };
  const mockPass2 = {
    enabled: true,
    needsSwap: true,
    renderToScreen: false,
    setSize() {},
    render: (r, w, rd) => { pass2Rendered = true; }
  };

  composer.addPass(mockPass1);
  composer.addPass(mockPass2);
  assert.equal(composer.passes.length, 2);

  // Test isLastEnabledPass
  assert.equal(composer.isLastEnabledPass(0), false);
  assert.equal(composer.isLastEnabledPass(1), true);

  // Execute render
  composer.render(0.016);
  assert.equal(pass1Rendered, true);
  assert.equal(pass2Rendered, true);
  assert.equal(mockPass2.renderToScreen, true, 'Last enabled pass must receive renderToScreen = true');

  // Buffer swap verified
  assert.equal(composer.writeBuffer, composer.renderTarget1);
  assert.equal(composer.readBuffer, composer.renderTarget2);

  // Test setSize and setPixelRatio
  composer.setSize(1280, 720);
  assert.equal(composer._width, 1280);
  assert.equal(composer._height, 720);

  // Remove pass
  composer.removePass(mockPass1);
  assert.equal(composer.passes.length, 1);
  assert.equal(composer.passes[0], mockPass2);

  // Reset and disposal
  assert.doesNotThrow(() => composer.reset());
  assert.doesNotThrow(() => composer.dispose());
});

test('10. RoomEnvironment generates lighting panels and disposes hierarchy', () => {
  const room = new RoomEnvironment();
  assert.equal(room.name, 'RoomEnvironment');
  assert.equal(room.position.y, -3.5);
  assert.ok(room.children.length >= 7, 'Room must contain light, walls, instanced furniture, and 6 emissive panels');

  let meshCount = 0;
  room.traverse((child) => {
    if (child && child.isMesh) meshCount++;
  });
  assert.ok(meshCount >= 7, 'Room must have at least 7 mesh objects');

  assert.doesNotThrow(() => room.dispose());
});

test('11. Context injection dynamically updates prototypes', () => {
  class CustomSceneBase {
    constructor() {
      this.isCustomScene = true;
      this.children = [];
      this.position = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
    }
    add(c) { this.children.push(c); }
  }

  setPostprocessingThreeContext({
    Scene: CustomSceneBase
  });

  const room = new RoomEnvironment();
  assert.ok(room instanceof CustomSceneBase, 'RoomEnvironment must inherit from injected Scene');
  assert.equal(room.isCustomScene, true);
});

test('12. Regression: OutputPass uses RawShaderMaterial to prevent Three.js ShaderMaterial GLSL redefinition errors', () => {
  // 1. Test with custom RawShaderMaterial class injection
  class MockCustomRawShaderMaterial {
    constructor(params = {}) {
      this.isRawShaderMaterial = true;
      this.type = 'RawShaderMaterial';
      this.name = params.name;
      this.uniforms = params.uniforms;
      this.vertexShader = params.vertexShader;
      this.fragmentShader = params.fragmentShader;
    }
    dispose() {}
  }

  setPostprocessingThreeContext({
    RawShaderMaterial: MockCustomRawShaderMaterial
  });

  const pass1 = new OutputPass();
  assert.ok(pass1.material instanceof MockCustomRawShaderMaterial, 'Must instantiate injected RawShaderMaterial');
  assert.equal(pass1.material.isRawShaderMaterial, true);
  assert.equal(pass1.material.name, 'OutputShader');

  // 2. Test with only ShaderMaterial class injection (automatic RawShaderMaterial subclassing fallback)
  class MockCustomShaderMaterial {
    constructor(params = {}) {
      this.isShaderMaterial = true;
      this.type = 'ShaderMaterial';
      this.name = params.name;
      this.uniforms = params.uniforms;
      this.vertexShader = params.vertexShader;
      this.fragmentShader = params.fragmentShader;
    }
    dispose() {}
  }

  setPostprocessingThreeContext({
    ShaderMaterial: MockCustomShaderMaterial,
    RawShaderMaterial: null
  });

  const pass2 = new OutputPass();
  assert.ok(pass2.material instanceof MockCustomShaderMaterial, 'Must subclass injected ShaderMaterial');
  assert.equal(pass2.material.isRawShaderMaterial, true, 'Subclass must enforce isRawShaderMaterial = true');
  assert.equal(pass2.material.type, 'RawShaderMaterial');
});
