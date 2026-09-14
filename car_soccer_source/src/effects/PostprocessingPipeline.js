/**
 * src/effects/PostprocessingPipeline.js
 * Postprocessing Pipeline & Offscreen Turntable Environment Subsystem (Phase 7.8 Part 2)
 *
 * Fully deobfuscates and decouples the Three.js postprocessing framework and
 * room environment previously inlined in CarSoccerEngine.js (lines ~17920 to ~18265):
 *
 * Core Components:
 * - Pass (Js): Base pass interface adhering to EffectComposer lifecycle
 * - FullScreenGeometry (cC): Screen-filling triangle geometry ([-1, 3], [-1, -1], [3, -1])
 * - FullScreenQuad (ll): Screen quad renderer with orthographic camera
 * - ShaderPass (h0): Shader material pass reading from readBuffer and writing to writeBuffer
 * - MaskPass (Mf) & ClearMaskPass (dC): WebGL stencil buffer masking passes
 * - CopyShader (_A): Passthrough copy shader with opacity uniform
 * - OutputShader (Ko): High-precision tonemapping and color space conversion shader
 * - OutputPass (fC): Automatic sRGB transfer and tonemapping application pass
 * - RenderPass (pC): Direct 3D scene & camera render pass into composer buffer
 * - EffectComposer (uC): Dual-target ping-pong rendering compositor and pass coordinator
 * - RoomEnvironment (c0): Procedural studio environment for PBR reflections & PMREM generation
 * - createRoomEnvironmentMaterial (gs): Emissive panel basic material generator
 *
 * Upstream references:
 * - Three.js postprocessing addon: EffectComposer, RenderPass, ShaderPass, OutputPass, MaskPass
 * - Three.js environments addon: RoomEnvironment
 */

// Tone mapping mode constants
export const LinearToneMapping = 1;
export const ReinhardToneMapping = 2;
export const CineonToneMapping = 3;
export const ACESFilmicToneMapping = 4;
export const CustomToneMapping = 5;
export const AgXToneMapping = 6;
export const NeutralToneMapping = 7;
export const NoBlending = 0;
export const BackSide = 1;
export const HalfFloatType = 1016;
export const SRGBTransfer = 'srgb';

// Fallback implementations for standalone/headless testing
class FallbackScene {
  constructor() {
    this.isScene = true;
    this.name = '';
    this.children = [];
    this.position = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
  }
  add(child) {
    this.children.push(child);
  }
  remove(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) this.children.splice(idx, 1);
  }
  traverse(callback) {
    callback(this);
    for (const child of this.children) {
      if (child && child.traverse) child.traverse(callback);
      else if (child) callback(child);
    }
  }
}

class FallbackBufferGeometry {
  constructor() {
    this.isBufferGeometry = true;
    this.attributes = {};
  }
  setAttribute(name, attribute) {
    this.attributes[name] = attribute;
  }
  deleteAttribute(name) {
    delete this.attributes[name];
  }
  dispose() {}
}

class FallbackMesh {
  constructor(geometry, material) {
    this.isMesh = true;
    this.geometry = geometry || new FallbackBufferGeometry();
    this.material = material || {};
    this.position = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
    this.scale = { x: 1, y: 1, z: 1, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
    this.rotation = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
  }
  updateMatrix() {}
}

class FallbackInstancedMesh extends FallbackMesh {
  constructor(geometry, material, count = 1) {
    super(geometry, material);
    this.isInstancedMesh = true;
    this.count = count;
    this.matrices = new Array(count).fill(null);
  }
  setMatrixAt(index, matrix) {
    this.matrices[index] = matrix;
  }
}

class FallbackObject3D {
  constructor() {
    this.position = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
    this.rotation = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
    this.scale = { x: 1, y: 1, z: 1, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
    this.matrix = {};
  }
  updateMatrix() {}
}

class FallbackOrthographicCamera {
  constructor(left, right, top, bottom, near, far) {
    this.isOrthographicCamera = true;
    this.left = left;
    this.right = right;
    this.top = top;
    this.bottom = bottom;
    this.near = near;
    this.far = far;
  }
}

class FallbackColor {
  constructor(r = 0, g = 0, b = 0) {
    this.r = r;
    this.g = g;
    this.b = b;
  }
  set(r, g, b) {
    this.r = r;
    this.g = g;
    this.b = b;
    return this;
  }
  copy(c) {
    if (c) {
      this.r = c.r;
      this.g = c.g;
      this.b = c.b;
    }
    return this;
  }
}

class FallbackVector2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
    this.width = x;
    this.height = y;
  }
  set(x, y) {
    this.x = x;
    this.y = y;
    this.width = x;
    this.height = y;
    return this;
  }
}

class FallbackRenderTarget {
  constructor(width, height, options = {}) {
    this.isWebGLRenderTarget = true;
    this.width = width;
    this.height = height;
    this.texture = {
      name: options.name || '',
      generateMipmaps: false
    };
  }
  clone() {
    const copy = new FallbackRenderTarget(this.width, this.height);
    copy.texture.name = this.texture.name;
    return copy;
  }
  setSize(w, h) {
    this.width = w;
    this.height = h;
  }
  dispose() {}
}

class FallbackShaderMaterial {
  constructor(params = {}) {
    this.isShaderMaterial = true;
    this.name = params.name || 'unspecified';
    this.defines = Object.assign({}, params.defines);
    this.uniforms = params.uniforms || {};
    this.vertexShader = params.vertexShader || '';
    this.fragmentShader = params.fragmentShader || '';
    this.blending = params.blending || 0;
    this.needsUpdate = false;
  }
  dispose() {}
}

class FallbackRawShaderMaterial extends FallbackShaderMaterial {
  constructor(params = {}) {
    super(params);
    this.isRawShaderMaterial = true;
    this.type = 'RawShaderMaterial';
  }
}

class FallbackTimer {
  constructor() {
    this._previousTime = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    this._delta = 0;
  }
  update() {
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    this._delta = (now - this._previousTime) / 1000;
    this._previousTime = now;
  }
  getDelta() {
    return this._delta;
  }
}

// Global context container for Three.js dependencies
let postprocessingThreeContext = {
  Scene: null,
  BoxGeometry: null,
  MeshStandardMaterial: null,
  BackSide: 1,
  PointLight: null,
  Mesh: null,
  InstancedMesh: null,
  Object3D: null,
  MeshBasicMaterial: null,
  BufferGeometry: null,
  Float32BufferAttribute: null,
  OrthographicCamera: null,
  ShaderMaterial: null,
  RawShaderMaterial: null,
  UniformsUtils: null,
  Vector2: null,
  WebGLRenderTarget: null,
  HalfFloatType: 1016,
  NoBlending: 0,
  Timer: null,
  Color: null,
  ColorManagement: null,
  SRGBTransfer: 'srgb',
  LinearToneMapping: 1,
  ReinhardToneMapping: 2,
  CineonToneMapping: 3,
  ACESFilmicToneMapping: 4,
  CustomToneMapping: 5,
  AgXToneMapping: 6,
  NeutralToneMapping: 7
};

export function setPostprocessingThreeContext(context) {
  if (!context) return;
  const descriptors = Object.getOwnPropertyDescriptors(context);
  Object.defineProperties(postprocessingThreeContext, descriptors);

  if (context.Scene) {
    Object.setPrototypeOf(RoomEnvironment, context.Scene);
    Object.setPrototypeOf(RoomEnvironment.prototype, context.Scene.prototype);
  }
  if (context.BufferGeometry) {
    Object.setPrototypeOf(FullScreenGeometry, context.BufferGeometry);
    Object.setPrototypeOf(FullScreenGeometry.prototype, context.BufferGeometry.prototype);
  }

  // Reset cached singletons so they are recreated with active Three.js classes
  sharedFullScreenGeometry = null;
  sharedFullScreenCamera = null;
}

export function resolvePostprocessingContext() {
  const C = postprocessingThreeContext;
  const globalThree = (typeof THREE !== 'undefined' ? THREE : {});

  return {
    Scene: C.Scene || globalThree.Scene || FallbackScene,
    BoxGeometry: C.BoxGeometry || globalThree.BoxGeometry || class extends FallbackBufferGeometry {},
    MeshStandardMaterial: C.MeshStandardMaterial || globalThree.MeshStandardMaterial || class {
      constructor(params = {}) { Object.assign(this, params); }
      dispose() {}
    },
    BackSide: C.BackSide ?? globalThree.BackSide ?? BackSide,
    PointLight: C.PointLight || globalThree.PointLight || class {
      constructor(color, intensity, distance, decay) {
        this.color = color;
        this.intensity = intensity;
        this.distance = distance;
        this.decay = decay;
        this.position = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
      }
    },
    Mesh: C.Mesh || globalThree.Mesh || FallbackMesh,
    InstancedMesh: C.InstancedMesh || globalThree.InstancedMesh || FallbackInstancedMesh,
    Object3D: C.Object3D || globalThree.Object3D || FallbackObject3D,
    MeshBasicMaterial: C.MeshBasicMaterial || globalThree.MeshBasicMaterial || class {
      constructor(params = {}) { Object.assign(this, params); }
      dispose() {}
    },
    BufferGeometry: C.BufferGeometry || globalThree.BufferGeometry || FallbackBufferGeometry,
    Float32BufferAttribute: C.Float32BufferAttribute || globalThree.Float32BufferAttribute || class {
      constructor(array, itemSize) {
        this.array = array;
        this.itemSize = itemSize;
      }
    },
    OrthographicCamera: C.OrthographicCamera || globalThree.OrthographicCamera || FallbackOrthographicCamera,
    ShaderMaterial: C.ShaderMaterial || globalThree.ShaderMaterial || FallbackShaderMaterial,
    RawShaderMaterial: C.RawShaderMaterial || globalThree.RawShaderMaterial || (
      C.ShaderMaterial ? class extends C.ShaderMaterial {
        constructor(params = {}) {
          super(params);
          this.isRawShaderMaterial = true;
          this.type = 'RawShaderMaterial';
        }
      } : FallbackRawShaderMaterial
    ),
    UniformsUtils: C.UniformsUtils || globalThree.UniformsUtils || {
      clone(uniforms) {
        if (!uniforms) return {};
        const result = {};
        for (const [key, val] of Object.entries(uniforms)) {
          result[key] = { value: (val && typeof val === 'object' && 'clone' in val ? val.clone() : val ? val.value : null) };
        }
        return result;
      }
    },
    Vector2: C.Vector2 || globalThree.Vector2 || FallbackVector2,
    WebGLRenderTarget: C.WebGLRenderTarget || globalThree.WebGLRenderTarget || FallbackRenderTarget,
    HalfFloatType: C.HalfFloatType ?? globalThree.HalfFloatType ?? HalfFloatType,
    NoBlending: C.NoBlending ?? globalThree.NoBlending ?? NoBlending,
    Timer: C.Timer || globalThree.Timer || FallbackTimer,
    Color: C.Color || globalThree.Color || FallbackColor,
    ColorManagement: C.ColorManagement || globalThree.ColorManagement || {
      getTransfer(colorSpace) {
        return colorSpace === 'srgb' ? 'srgb' : '';
      }
    },
    SRGBTransfer: C.SRGBTransfer ?? globalThree.SRGBTransfer ?? SRGBTransfer,
    LinearToneMapping: C.LinearToneMapping ?? globalThree.LinearToneMapping ?? LinearToneMapping,
    ReinhardToneMapping: C.ReinhardToneMapping ?? globalThree.ReinhardToneMapping ?? ReinhardToneMapping,
    CineonToneMapping: C.CineonToneMapping ?? globalThree.CineonToneMapping ?? CineonToneMapping,
    ACESFilmicToneMapping: C.ACESFilmicToneMapping ?? globalThree.ACESFilmicToneMapping ?? ACESFilmicToneMapping,
    CustomToneMapping: C.CustomToneMapping ?? globalThree.CustomToneMapping ?? CustomToneMapping,
    AgXToneMapping: C.AgXToneMapping ?? globalThree.AgXToneMapping ?? AgXToneMapping,
    NeutralToneMapping: C.NeutralToneMapping ?? globalThree.NeutralToneMapping ?? NeutralToneMapping
  };
}

/**
 * Procedural MeshBasicMaterial helper with custom emissive intensity
 * Upstream mangled symbol: gs
 */
export function createRoomEnvironmentMaterial(emissiveIntensity) {
  const { MeshBasicMaterial } = resolvePostprocessingContext();
  return new MeshBasicMaterial({
    color: 0,
    emissive: 0xffffff,
    emissiveIntensity
  });
}

/**
 * RoomEnvironment
 * Generates an enclosed box room with 6 lighting panels and subtle diffuse ground bounce
 * used by PMREMGenerator to bake environment cube maps for car models.
 * Upstream mangled class: c0
 */
export class RoomEnvironment extends FallbackScene {
  constructor() {
    super();
    this.name = "RoomEnvironment";
    this.position.y = -3.5;

    const {
      BoxGeometry,
      MeshStandardMaterial,
      BackSide: SideBack,
      PointLight,
      Mesh,
      InstancedMesh,
      Object3D
    } = resolvePostprocessingContext();

    const boxGeom = new BoxGeometry();
    if (boxGeom.deleteAttribute) {
      boxGeom.deleteAttribute("uv");
    }

    const backMaterial = new MeshStandardMaterial({ side: SideBack });
    const standardMaterial = new MeshStandardMaterial();

    const mainPointLight = new PointLight(0xffffff, 900, 28, 2);
    mainPointLight.position.set(0.418, 16.199, 0.3);
    this.add(mainPointLight);

    const backMesh = new Mesh(boxGeom, backMaterial);
    backMesh.position.set(-0.757, 13.219, 0.717);
    backMesh.scale.set(31.713, 28.305, 28.591);
    this.add(backMesh);

    const instancedMesh = new InstancedMesh(boxGeom, standardMaterial, 6);
    const dummy = new Object3D();

    dummy.position.set(-10.906, 2.009, 1.846);
    dummy.rotation.set(0, -0.195, 0);
    dummy.scale.set(2.328, 7.905, 4.651);
    dummy.updateMatrix();
    instancedMesh.setMatrixAt(0, dummy.matrix);

    dummy.position.set(-5.607, -0.754, -0.758);
    dummy.rotation.set(0, 0.994, 0);
    dummy.scale.set(1.97, 1.534, 3.955);
    dummy.updateMatrix();
    instancedMesh.setMatrixAt(1, dummy.matrix);

    dummy.position.set(6.167, 0.857, 7.803);
    dummy.rotation.set(0, 0.561, 0);
    dummy.scale.set(3.927, 6.285, 3.687);
    dummy.updateMatrix();
    instancedMesh.setMatrixAt(2, dummy.matrix);

    dummy.position.set(-2.017, 0.018, 6.124);
    dummy.rotation.set(0, 0.333, 0);
    dummy.scale.set(2.002, 4.566, 2.064);
    dummy.updateMatrix();
    instancedMesh.setMatrixAt(3, dummy.matrix);

    dummy.position.set(2.291, -0.756, -2.621);
    dummy.rotation.set(0, -0.286, 0);
    dummy.scale.set(1.546, 1.552, 1.496);
    dummy.updateMatrix();
    instancedMesh.setMatrixAt(4, dummy.matrix);

    dummy.position.set(-2.193, -0.369, -5.547);
    dummy.rotation.set(0, 0.516, 0);
    dummy.scale.set(3.875, 3.487, 2.986);
    dummy.updateMatrix();
    instancedMesh.setMatrixAt(5, dummy.matrix);
    this.add(instancedMesh);

    const lightMesh1 = new Mesh(boxGeom, createRoomEnvironmentMaterial(50));
    lightMesh1.position.set(-16.116, 14.37, 8.208);
    lightMesh1.scale.set(0.1, 2.428, 2.739);
    this.add(lightMesh1);

    const lightMesh2 = new Mesh(boxGeom, createRoomEnvironmentMaterial(50));
    lightMesh2.position.set(-16.109, 18.021, -8.207);
    lightMesh2.scale.set(0.1, 2.425, 2.751);
    this.add(lightMesh2);

    const lightMesh3 = new Mesh(boxGeom, createRoomEnvironmentMaterial(17));
    lightMesh3.position.set(14.904, 12.198, -1.832);
    lightMesh3.scale.set(0.15, 4.265, 6.331);
    this.add(lightMesh3);

    const lightMesh4 = new Mesh(boxGeom, createRoomEnvironmentMaterial(43));
    lightMesh4.position.set(-0.462, 8.89, 14.52);
    lightMesh4.scale.set(4.38, 5.441, 0.088);
    this.add(lightMesh4);

    const lightMesh5 = new Mesh(boxGeom, createRoomEnvironmentMaterial(20));
    lightMesh5.position.set(3.235, 11.486, -12.541);
    lightMesh5.scale.set(2.5, 2, 0.1);
    this.add(lightMesh5);

    const lightMesh6 = new Mesh(boxGeom, createRoomEnvironmentMaterial(100));
    lightMesh6.position.set(0, 20, 0);
    lightMesh6.scale.set(1, 0.1, 1);
    this.add(lightMesh6);
  }

  dispose() {
    const resources = new Set();
    this.traverse((child) => {
      if (child && child.isMesh) {
        if (child.geometry) resources.add(child.geometry);
        if (child.material) resources.add(child.material);
      }
    });
    for (const res of resources) {
      if (typeof res.dispose === 'function') {
        res.dispose();
      }
    }
  }
}

/**
 * Standard passthrough copy shader
 * Upstream mangled symbol: _A
 */
export const CopyShader = {
  name: "CopyShader",
  uniforms: {
    tDiffuse: { value: null },
    opacity: { value: 1.0 }
  },
  vertexShader: `
		varying vec2 vUv;
		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,
  fragmentShader: `
		uniform float opacity;
		uniform sampler2D tDiffuse;
		varying vec2 vUv;
		void main() {
			vec4 texel = texture2D( tDiffuse, vUv );
			gl_FragColor = opacity * texel;
		}`
};

/**
 * Base Pass class adhering to EffectComposer lifecycle
 * Upstream mangled class: Js
 */
export class Pass {
  constructor() {
    this.isPass = true;
    this.enabled = true;
    this.needsSwap = true;
    this.clear = false;
    this.renderToScreen = false;
  }
  setSize(width, height) {}
  render(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
    console.error("THREE.Pass: .render() must be implemented in derived pass.");
  }
  dispose() {}
}

/**
 * Single large triangle covering the entire viewport (-1 to 3 in clip space)
 * Upstream mangled class: cC
 */
export class FullScreenGeometry extends FallbackBufferGeometry {
  constructor() {
    super();
    const { Float32BufferAttribute } = resolvePostprocessingContext();
    this.setAttribute("position", new Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3));
    this.setAttribute("uv", new Float32BufferAttribute([0, 2, 0, 0, 2, 0], 2));
  }
}

let sharedFullScreenGeometry = null;
let sharedFullScreenCamera = null;

function getSharedFullScreenGeometry() {
  if (!sharedFullScreenGeometry) {
    sharedFullScreenGeometry = new FullScreenGeometry();
  }
  return sharedFullScreenGeometry;
}

function getSharedFullScreenCamera() {
  if (!sharedFullScreenCamera) {
    const { OrthographicCamera } = resolvePostprocessingContext();
    sharedFullScreenCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  return sharedFullScreenCamera;
}

/**
 * Fullscreen Quad renderer rendering through a fixed OrthographicCamera
 * Upstream mangled class: ll
 */
export class FullScreenQuad {
  constructor(material) {
    const { Mesh } = resolvePostprocessingContext();
    this._mesh = new Mesh(getSharedFullScreenGeometry(), material);
  }

  dispose() {
    if (this._mesh && this._mesh.geometry && typeof this._mesh.geometry.dispose === 'function') {
      this._mesh.geometry.dispose();
    }
  }

  render(renderer) {
    if (renderer && typeof renderer.render === 'function') {
      renderer.render(this._mesh, getSharedFullScreenCamera());
    }
  }

  get material() {
    return this._mesh ? this._mesh.material : null;
  }

  set material(value) {
    if (this._mesh) {
      this._mesh.material = value;
    }
  }
}

/**
 * Generic shader pass rendering a full-screen shader material
 * Upstream mangled class: h0
 */
export class ShaderPass extends Pass {
  constructor(shader, textureID = "tDiffuse") {
    super();
    this.textureID = textureID;
    this.uniforms = null;
    this.material = null;

    const { ShaderMaterial, UniformsUtils } = resolvePostprocessingContext();

    if (shader && (shader.isShaderMaterial || (typeof ShaderMaterial === 'function' && shader instanceof ShaderMaterial))) {
      this.uniforms = shader.uniforms;
      this.material = shader;
    } else if (shader) {
      this.uniforms = UniformsUtils.clone(shader.uniforms);
      this.material = new ShaderMaterial({
        name: shader.name !== undefined ? shader.name : "unspecified",
        defines: Object.assign({}, shader.defines),
        uniforms: this.uniforms,
        vertexShader: shader.vertexShader,
        fragmentShader: shader.fragmentShader
      });
    }

    this._fsQuad = new FullScreenQuad(this.material);
  }

  render(renderer, writeBuffer, readBuffer) {
    if (this.uniforms && this.uniforms[this.textureID] && readBuffer) {
      this.uniforms[this.textureID].value = readBuffer.texture;
    }
    this._fsQuad.material = this.material;

    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
      this._fsQuad.render(renderer);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) {
        renderer.clear(renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil);
      }
      this._fsQuad.render(renderer);
    }
  }

  dispose() {
    if (this.material && typeof this.material.dispose === 'function') {
      this.material.dispose();
    }
    if (this._fsQuad) {
      this._fsQuad.dispose();
    }
  }
}

/**
 * MaskPass
 * Uses the WebGL stencil buffer to confine subsequent rendering to a masked region
 * Upstream mangled class: Mf
 */
export class MaskPass extends Pass {
  constructor(scene, camera) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.clear = true;
    this.needsSwap = false;
    this.inverse = false;
  }

  render(renderer, writeBuffer, readBuffer) {
    const gl = renderer.getContext ? renderer.getContext() : null;
    const state = renderer.state;

    if (!gl || !state) return;

    state.buffers.color.setMask(false);
    state.buffers.depth.setMask(false);
    state.buffers.color.setLocked(true);
    state.buffers.depth.setLocked(true);

    const writeValue = this.inverse ? 0 : 1;
    const clearValue = this.inverse ? 1 : 0;

    state.buffers.stencil.setTest(true);
    state.buffers.stencil.setOp(gl.REPLACE, gl.REPLACE, gl.REPLACE);
    state.buffers.stencil.setFunc(gl.ALWAYS, writeValue, 0xffffffff);
    state.buffers.stencil.setClear(clearValue);
    state.buffers.stencil.setLocked(true);

    renderer.setRenderTarget(readBuffer);
    if (this.clear) renderer.clear();
    renderer.render(this.scene, this.camera);

    renderer.setRenderTarget(writeBuffer);
    if (this.clear) renderer.clear();
    renderer.render(this.scene, this.camera);

    state.buffers.color.setLocked(false);
    state.buffers.depth.setLocked(false);
    state.buffers.color.setMask(true);
    state.buffers.depth.setMask(true);

    state.buffers.stencil.setLocked(false);
    state.buffers.stencil.setFunc(gl.EQUAL, 1, 0xffffffff);
    state.buffers.stencil.setOp(gl.KEEP, gl.KEEP, gl.KEEP);
    state.buffers.stencil.setLocked(true);
  }
}

/**
 * ClearMaskPass
 * Disables and unlocks stencil testing after masked passes complete
 * Upstream mangled class: dC
 */
export class ClearMaskPass extends Pass {
  constructor() {
    super();
    this.needsSwap = false;
  }

  render(renderer) {
    if (renderer && renderer.state && renderer.state.buffers && renderer.state.buffers.stencil) {
      renderer.state.buffers.stencil.setLocked(false);
      renderer.state.buffers.stencil.setTest(false);
    }
  }
}

/**
 * Output color grading and tonemapping shader
 * Upstream mangled symbol: Ko
 */
export const OutputShader = {
  name: "OutputShader",
  uniforms: {
    tDiffuse: { value: null },
    toneMappingExposure: { value: 1.0 }
  },
  vertexShader: `
		precision highp float;
		uniform mat4 modelViewMatrix;
		uniform mat4 projectionMatrix;
		attribute vec3 position;
		attribute vec2 uv;
		varying vec2 vUv;
		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,
  fragmentShader: `
		precision highp float;
		uniform sampler2D tDiffuse;
		#include <tonemapping_pars_fragment>
		#include <colorspace_pars_fragment>
		varying vec2 vUv;
		void main() {
			gl_FragColor = texture2D( tDiffuse, vUv );
			#ifdef LINEAR_TONE_MAPPING
				gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );
			#elif defined( REINHARD_TONE_MAPPING )
				gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );
			#elif defined( CINEON_TONE_MAPPING )
				gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );
			#elif defined( ACES_FILMIC_TONE_MAPPING )
				gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );
			#elif defined( AGX_TONE_MAPPING )
				gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );
			#elif defined( NEUTRAL_TONE_MAPPING )
				gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );
			#elif defined( CUSTOM_TONE_MAPPING )
				gl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );
			#endif
			#ifdef SRGB_TRANSFER
				gl_FragColor = sRGBTransferOETF( gl_FragColor );
			#endif
		}`
};

/**
 * OutputPass
 * Dynamically maps output color space and tone mapping algorithm onto the OutputShader defines
 * Upstream mangled class: fC
 */
export class OutputPass extends Pass {
  constructor() {
    super();
    this.isOutputPass = true;

    const { RawShaderMaterial, ShaderMaterial, UniformsUtils } = resolvePostprocessingContext();
    const MaterialClass = RawShaderMaterial || ShaderMaterial;

    this.uniforms = UniformsUtils.clone(OutputShader.uniforms);
    this.material = new MaterialClass({
      name: OutputShader.name,
      uniforms: this.uniforms,
      vertexShader: OutputShader.vertexShader,
      fragmentShader: OutputShader.fragmentShader
    });
    this._fsQuad = new FullScreenQuad(this.material);
    this._outputColorSpace = null;
    this._toneMapping = null;
  }

  render(renderer, writeBuffer, readBuffer) {
    const {
      ColorManagement,
      SRGBTransfer: SRGBTransferConst,
      LinearToneMapping: LinearConst,
      ReinhardToneMapping: ReinhardConst,
      CineonToneMapping: CineonConst,
      ACESFilmicToneMapping: ACESConst,
      AgXToneMapping: AgXConst,
      NeutralToneMapping: NeutralConst,
      CustomToneMapping: CustomConst
    } = resolvePostprocessingContext();

    if (this.uniforms && this.uniforms.tDiffuse && readBuffer) {
      this.uniforms.tDiffuse.value = readBuffer.texture;
    }
    if (this.uniforms && this.uniforms.toneMappingExposure) {
      this.uniforms.toneMappingExposure.value = renderer ? renderer.toneMappingExposure : 1.0;
    }

    if (renderer && (this._outputColorSpace !== renderer.outputColorSpace || this._toneMapping !== renderer.toneMapping)) {
      this._outputColorSpace = renderer.outputColorSpace;
      this._toneMapping = renderer.toneMapping;

      this.material.defines = {};

      if (ColorManagement && ColorManagement.getTransfer && ColorManagement.getTransfer(this._outputColorSpace) === SRGBTransferConst) {
        this.material.defines.SRGB_TRANSFER = "";
      }

      if (this._toneMapping === LinearConst) {
        this.material.defines.LINEAR_TONE_MAPPING = "";
      } else if (this._toneMapping === ReinhardConst) {
        this.material.defines.REINHARD_TONE_MAPPING = "";
      } else if (this._toneMapping === CineonConst) {
        this.material.defines.CINEON_TONE_MAPPING = "";
      } else if (this._toneMapping === ACESConst) {
        this.material.defines.ACES_FILMIC_TONE_MAPPING = "";
      } else if (this._toneMapping === AgXConst) {
        this.material.defines.AGX_TONE_MAPPING = "";
      } else if (this._toneMapping === NeutralConst) {
        this.material.defines.NEUTRAL_TONE_MAPPING = "";
      } else if (this._toneMapping === CustomConst) {
        this.material.defines.CUSTOM_TONE_MAPPING = "";
      }

      this.material.needsUpdate = true;
    }

    if (this.renderToScreen === true) {
      if (renderer) renderer.setRenderTarget(null);
      this._fsQuad.render(renderer);
    } else {
      if (renderer) {
        renderer.setRenderTarget(writeBuffer);
        if (this.clear) {
          renderer.clear(renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil);
        }
      }
      this._fsQuad.render(renderer);
    }
  }

  dispose() {
    if (this.material && typeof this.material.dispose === 'function') {
      this.material.dispose();
    }
    if (this._fsQuad) {
      this._fsQuad.dispose();
    }
  }
}

/**
 * RenderPass
 * Evaluates the 3D scene & camera into an offscreen render target
 * Upstream mangled class: pC
 */
export class RenderPass extends Pass {
  constructor(scene, camera, overrideMaterial = null, clearColor = null, clearAlpha = null) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.overrideMaterial = overrideMaterial;
    this.clearColor = clearColor;
    this.clearAlpha = clearAlpha;
    this.clear = true;
    this.clearDepth = false;
    this.needsSwap = false;
    this.isRenderPass = true;

    const { Color } = resolvePostprocessingContext();
    this._oldClearColor = new Color();
  }

  render(renderer, writeBuffer, readBuffer) {
    if (!renderer) return;

    const oldAutoClear = renderer.autoClear;
    renderer.autoClear = false;

    let oldClearAlpha, oldOverrideMaterial;

    if (this.overrideMaterial !== null && this.scene) {
      oldOverrideMaterial = this.scene.overrideMaterial;
      this.scene.overrideMaterial = this.overrideMaterial;
    }

    if (this.clearColor !== null) {
      renderer.getClearColor(this._oldClearColor);
      renderer.setClearColor(this.clearColor, renderer.getClearAlpha());
    }

    if (this.clearAlpha !== null) {
      oldClearAlpha = renderer.getClearAlpha();
      renderer.setClearAlpha(this.clearAlpha);
    }

    if (this.clearDepth === true && renderer.clearDepth) {
      renderer.clearDepth();
    }

    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);

    if (this.clear === true) {
      renderer.clear(renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil);
    }

    renderer.render(this.scene, this.camera);

    if (this.clearColor !== null) {
      renderer.setClearColor(this._oldClearColor);
    }

    if (this.clearAlpha !== null) {
      renderer.setClearAlpha(oldClearAlpha);
    }

    if (this.overrideMaterial !== null && this.scene) {
      this.scene.overrideMaterial = oldOverrideMaterial;
    }

    renderer.autoClear = oldAutoClear;
  }
}

/**
 * EffectComposer
 * Ping-pong render target coordinator executing the postprocessing pass chain
 * Upstream mangled class: uC
 */
export class EffectComposer {
  constructor(renderer, renderTarget) {
    this.renderer = renderer;
    this._pixelRatio = (renderer && typeof renderer.getPixelRatio === 'function' ? renderer.getPixelRatio() : 1);

    const {
      Vector2,
      WebGLRenderTarget,
      HalfFloatType: HalfFloatConst,
      NoBlending: NoBlendConst,
      Timer
    } = resolvePostprocessingContext();

    if (renderTarget === undefined) {
      const size = (renderer && typeof renderer.getSize === 'function' ? renderer.getSize(new Vector2()) : new Vector2(800, 600));
      this._width = size.width;
      this._height = size.height;
      renderTarget = new WebGLRenderTarget(
        this._width * this._pixelRatio,
        this._height * this._pixelRatio,
        { type: HalfFloatConst }
      );
      renderTarget.texture.name = "EffectComposer.rt1";
    } else {
      this._width = renderTarget.width;
      this._height = renderTarget.height;
    }

    this.renderTarget1 = renderTarget;
    this.renderTarget2 = renderTarget.clone();
    if (this.renderTarget2.texture) {
      this.renderTarget2.texture.name = "EffectComposer.rt2";
    }

    this.writeBuffer = this.renderTarget1;
    this.readBuffer = this.renderTarget2;
    this.renderToScreen = true;
    this.passes = [];

    this.copyPass = new ShaderPass(CopyShader);
    if (this.copyPass.material) {
      this.copyPass.material.blending = NoBlendConst;
    }

    this.timer = new Timer();
  }

  swapBuffers() {
    const tmp = this.readBuffer;
    this.readBuffer = this.writeBuffer;
    this.writeBuffer = tmp;
  }

  addPass(pass) {
    this.passes.push(pass);
    if (pass && typeof pass.setSize === 'function') {
      pass.setSize(this._width * this._pixelRatio, this._height * this._pixelRatio);
    }
  }

  insertPass(pass, index) {
    this.passes.splice(index, 0, pass);
    if (pass && typeof pass.setSize === 'function') {
      pass.setSize(this._width * this._pixelRatio, this._height * this._pixelRatio);
    }
  }

  removePass(pass) {
    const idx = this.passes.indexOf(pass);
    if (idx !== -1) {
      this.passes.splice(idx, 1);
    }
  }

  isLastEnabledPass(passIndex) {
    for (let i = passIndex + 1; i < this.passes.length; i++) {
      if (this.passes[i].enabled) return false;
    }
    return true;
  }

  render(deltaTime) {
    if (this.timer && typeof this.timer.update === 'function') {
      this.timer.update();
    }
    if (deltaTime === undefined && this.timer && typeof this.timer.getDelta === 'function') {
      deltaTime = this.timer.getDelta();
    }

    const currentRenderTarget = (this.renderer && typeof this.renderer.getRenderTarget === 'function' ? this.renderer.getRenderTarget() : null);
    let maskActive = false;

    for (let i = 0, len = this.passes.length; i < len; i++) {
      const pass = this.passes[i];
      if (pass && pass.enabled !== false) {
        pass.renderToScreen = this.renderToScreen && this.isLastEnabledPass(i);
        pass.render(this.renderer, this.writeBuffer, this.readBuffer, deltaTime, maskActive);

        if (pass.needsSwap) {
          if (maskActive && this.renderer && this.renderer.getContext && this.renderer.state) {
            const gl = this.renderer.getContext();
            const stencil = this.renderer.state.buffers.stencil;
            stencil.setFunc(gl.NOTEQUAL, 1, 0xffffffff);
            this.copyPass.render(this.renderer, this.writeBuffer, this.readBuffer, deltaTime);
            stencil.setFunc(gl.EQUAL, 1, 0xffffffff);
          }
          this.swapBuffers();
        }

        if (pass instanceof MaskPass) {
          maskActive = true;
        } else if (pass instanceof ClearMaskPass) {
          maskActive = false;
        }
      }
    }

    if (this.renderer && typeof this.renderer.setRenderTarget === 'function') {
      this.renderer.setRenderTarget(currentRenderTarget);
    }
  }

  reset(renderTarget) {
    if (renderTarget === undefined) {
      const { Vector2 } = resolvePostprocessingContext();
      const size = (this.renderer && typeof this.renderer.getSize === 'function' ? this.renderer.getSize(new Vector2()) : new Vector2(800, 600));
      this._pixelRatio = (this.renderer && typeof this.renderer.getPixelRatio === 'function' ? this.renderer.getPixelRatio() : 1);
      this._width = size.width;
      this._height = size.height;
      renderTarget = this.renderTarget1.clone();
      renderTarget.setSize(this._width * this._pixelRatio, this._height * this._pixelRatio);
    }

    this.renderTarget1.dispose();
    this.renderTarget2.dispose();
    this.renderTarget1 = renderTarget;
    this.renderTarget2 = renderTarget.clone();
    this.writeBuffer = this.renderTarget1;
    this.readBuffer = this.renderTarget2;
  }

  setSize(width, height) {
    this._width = width;
    this._height = height;
    const w = this._width * this._pixelRatio;
    const h = this._height * this._pixelRatio;
    this.renderTarget1.setSize(w, h);
    this.renderTarget2.setSize(w, h);
    for (let i = 0; i < this.passes.length; i++) {
      if (this.passes[i] && typeof this.passes[i].setSize === 'function') {
        this.passes[i].setSize(w, h);
      }
    }
  }

  setPixelRatio(pixelRatio) {
    this._pixelRatio = pixelRatio;
    this.setSize(this._width, this._height);
  }

  dispose() {
    this.renderTarget1.dispose();
    this.renderTarget2.dispose();
    this.copyPass.dispose();
  }
}

// Backward-compatibility aliases exactly matching mangled symbols
export {
  Pass as Js,
  FullScreenGeometry as cC,
  FullScreenQuad as ll,
  ShaderPass as h0,
  MaskPass as Mf,
  ClearMaskPass as dC,
  CopyShader as _A,
  OutputShader as Ko,
  OutputPass as fC,
  RenderPass as pC,
  EffectComposer as uC,
  RoomEnvironment as c0,
  createRoomEnvironmentMaterial as gs,
  FallbackRawShaderMaterial as RawShaderMaterial
};
