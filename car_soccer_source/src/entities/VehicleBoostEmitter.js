/**
 * VehicleBoostEmitter.js
 * Comprehensive Vehicle Boost visual flame, particle trails, nozzle flash, and audio system.
 * 
 * Features:
 * - Dual-theme architecture: Arcade stylized flame vs Realistic Golden Boost volumetric exhaust plume.
 * - Instanced particle meshes for exhaust puffs (driving) and supersonic particle trails (boosting).
 * - Multi-layered curved cone geometries with procedural noise and water distortion shaders.
 * - Point light emission, bloom occluder layers, and spatialized 3D audio playback.
 * 
 * Backward compatibility aliases:
 * - VehicleBoostEmitter -> K1
 * - RealisticBoostEmitter -> O1
 * - ArcadeBoostParticleMesh -> Sp
 * - RealisticBoostParticleMesh -> jp
 * - createArcadeBoostFlameConeGeometry -> W1
 * - createArcadeBoostFlameConeMaterial -> X1
 * - createNozzleFlash -> J1
 * - createBoostFlare -> G1
 * - createRealisticBoostConeGeometry -> D1
 * - createRealisticBoostConeMaterial -> N1
 * - loadGoldenBoostTextures -> _p
 * - evalCurveLut -> Dn
 */

import { BoostAudio } from '../audio/GameAudioSubsystem.js';
import { getTheme } from '../ui/ThemeManager.js';

// Three.js Context Injection Bridge
let boostEmitterThreeContext = {
  Group: null,
  Mesh: null,
  Points: null,
  PointLight: null,
  BufferGeometry: null,
  BufferAttribute: null,
  InstancedBufferGeometry: null,
  InstancedBufferAttribute: null,
  ShaderMaterial: null,
  Vector3: null,
  Color: null,
  MathUtils: null,
  DynamicDrawUsage: 35048,
  NormalBlending: 1,
  AdditiveBlending: 2,
  DoubleSide: 2,
  RepeatWrapping: 1000,
  SRGBColorSpace: 'srgb',
  TextureLoader: null
};

export function setVehicleBoostEmitterThreeContext(context) {
  if (!context) return;
  const descriptors = Object.getOwnPropertyDescriptors(context);
  Object.defineProperties(boostEmitterThreeContext, descriptors);
}

export function resolveContext() {
  const G = boostEmitterThreeContext;

  class FallbackVector3 {
    constructor(x = 0, y = 0, z = 0) {
      this.x = x; this.y = y; this.z = z;
    }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    clone() { return new FallbackVector3(this.x, this.y, this.z); }
    add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
    subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
    addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
    length() { return Math.hypot(this.x, this.y, this.z); }
    divideScalar(s) { this.x /= s; this.y /= s; this.z /= s; return this; }
    toArray() { return [this.x, this.y, this.z]; }
  }

  class FallbackColor {
    constructor(hex = 0xffffff) {
      this.r = 1; this.g = 1; this.b = 1;
      this.setHex(hex);
    }
    setHex(hex) {
      this.r = ((hex >> 16) & 255) / 255;
      this.g = ((hex >> 8) & 255) / 255;
      this.b = (hex & 255) / 255;
      return this;
    }
    setRGB(r, g, b) { this.r = r; this.g = g; this.b = b; return this; }
    copy(c) { this.r = c.r; this.g = c.g; this.b = c.b; return this; }
  }

  class FallbackBufferAttribute {
    constructor(array, itemSize) {
      this.array = array;
      this.itemSize = itemSize;
      this.count = array ? array.length / itemSize : 0;
      this.needsUpdate = false;
    }
    setUsage() { return this; }
  }

  class FallbackBufferGeometry {
    constructor() {
      this.attributes = {};
      this.index = null;
    }
    setAttribute(name, attr) { this.attributes[name] = attr; return this; }
    setIndex(idx) { this.index = idx; return this; }
    computeVertexNormals() {}
    computeBoundingSphere() {}
  }

  class FallbackShaderMaterial {
    constructor(params = {}) {
      this.name = params.name || '';
      this.uniforms = params.uniforms || {};
      this.vertexShader = params.vertexShader || '';
      this.fragmentShader = params.fragmentShader || '';
      this.transparent = params.transparent ?? false;
      this.depthWrite = params.depthWrite ?? true;
      this.side = params.side ?? 0;
      this.blending = params.blending ?? 1;
    }
  }

  class FallbackObject3D {
    constructor() {
      this.children = [];
      this.position = new FallbackVector3();
      this.layers = { enable() {} };
      this.visible = true;
      this.name = '';
    }
    add(...objs) {
      for (const o of objs) {
        if (o && o !== this) {
          if (o.parent && typeof o.parent.remove === "function") {
            o.parent.remove(o);
          }
          this.children.push(o);
          o.parent = this;
        }
      }
      return this;
    }
    remove(...objs) {
      for (const o of objs) {
        const idx = this.children.indexOf(o);
        if (idx !== -1) {
          o.parent = null;
          this.children.splice(idx, 1);
        }
      }
      return this;
    }
    removeFromParent() {
      if (this.parent && typeof this.parent.remove === "function") {
        this.parent.remove(this);
      }
      return this;
    }
    updateWorldMatrix() {}
    updateMatrixWorld() {}
    localToWorld(v) { return v; }
  }

  class FallbackMesh extends FallbackObject3D {
    constructor(geom, mat) {
      super();
      this.geometry = geom || new FallbackBufferGeometry();
      this.material = mat || new FallbackShaderMaterial();
      this.frustumCulled = true;
      this.renderOrder = 0;
    }
  }

  class FallbackPointLight extends FallbackObject3D {
    constructor(color, intensity = 1, distance = 0, decay = 2) {
      super();
      this.color = (color instanceof FallbackColor) ? color : new FallbackColor(color);
      this.intensity = intensity;
      this.distance = distance;
      this.decay = decay;
    }
  }

  class FallbackMathUtils {
    static clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }
    static lerp(x, y, t) { return (1 - t) * x + t * y; }
    static damp(x, y, lambda, dt) { return FallbackMathUtils.lerp(x, y, 1 - Math.exp(-lambda * dt)); }
    static smoothstep(x, min, max) {
      if (x <= min) return 0;
      if (x >= max) return 1;
      x = (x - min) / (max - min);
      return x * x * (3 - 2 * x);
    }
  }

  class FallbackTextureLoader {
    load(url, onLoad) {
      const tex = { url, colorSpace: 'srgb', wrapS: 1000, wrapT: 1000, anisotropy: 4 };
      if (typeof onLoad === 'function') setTimeout(onLoad, 0);
      return tex;
    }
  }

  return {
    Group: G.Group || FallbackObject3D,
    Mesh: G.Mesh || FallbackMesh,
    Points: G.Points || FallbackMesh,
    PointLight: G.PointLight || FallbackPointLight,
    BufferGeometry: G.BufferGeometry || FallbackBufferGeometry,
    BufferAttribute: G.BufferAttribute || FallbackBufferAttribute,
    InstancedBufferGeometry: G.InstancedBufferGeometry || FallbackBufferGeometry,
    InstancedBufferAttribute: G.InstancedBufferAttribute || FallbackBufferAttribute,
    ShaderMaterial: G.ShaderMaterial || FallbackShaderMaterial,
    Vector3: G.Vector3 || FallbackVector3,
    Color: G.Color || FallbackColor,
    MathUtils: G.MathUtils || FallbackMathUtils,
    DynamicDrawUsage: G.DynamicDrawUsage ?? 35048,
    NormalBlending: G.NormalBlending ?? 1,
    AdditiveBlending: G.AdditiveBlending ?? 2,
    DoubleSide: G.DoubleSide ?? 2,
    RepeatWrapping: G.RepeatWrapping ?? 1000,
    SRGBColorSpace: G.SRGBColorSpace ?? 'srgb',
    TextureLoader: G.TextureLoader || FallbackTextureLoader
  };
}

// ==========================================
// Realistic Golden Boost Constants & Curves
// ==========================================
const GOLDEN_BOOST_ASSET_PATH = "/assets/golden-boost";
const PLUME_TEXTURE = `${GOLDEN_BOOST_ASSET_PATH}/plume.png`;
const TURBULENCE_TEXTURE = `${GOLDEN_BOOST_ASSET_PATH}/turbulence.png`;
const SPARKS_TEXTURE = `${GOLDEN_BOOST_ASSET_PATH}/sparks.png`;

const REALISTIC_TRAIL_COUNT = 160;
const REALISTIC_DRIVE_COUNT = 32;
const REALISTIC_TRAIL_LIFE = 1.0;
const REALISTIC_DRIVE_LIFE = 0.5;
const REALISTIC_TRAIL_INTERVAL = 32;
const REALISTIC_DRIVE_RATE = 10;
const REALISTIC_MAX_PARTICLES_PER_FRAME = 24;

const CURVE_SCALE = new Float32Array([.047923,.4878,.696485,.776236,.823334,.865453,.901153,.930914,.955217,.974545,.989377,1.000196,1.007483,1.011718,1.013383,1.012959,1.010928,1.00777,1.003967,1,1]);
const CURVE_OPACITY = new Float32Array([0,.052264,.18705,.371348,.572152,.75645,.891236,.9435,.933541,.905905,.863957,.811057,.75057,.685858,.620283,.55721,.5,.391974,.223421,.068158,0]);
const CURVE_VELOCITY = new Float32Array([.989099,.963349,.89434,.794431,.675982,.551353,.432905,.332996,.263987,.238237]);
const CURVE_DRIVE_SIZE = new Float32Array([1,1.02175,1.084,1.18225,1.312,1.46875,1.648,1.84525,2.056,2.27575,2.5,2.72425,2.944,3.15475,3.352,3.53125,3.688,3.81775,3.916,3.97825,4]);
const CURVE_DRIVE_COLOR = new Float32Array([2,1.9855,1.944,1.8785,1.792,1.6875,1.568,1.4365,1.296,1.1495,1,.8505,.704,.5635,.432,.3125,.208,.1215,.056,.0145,0]);
const CURVE_DRIVE_OPACITY = new Float32Array([.25,.2481875,.243,.2348125,.224,.2109375,.196,.1795625,.162,.1436875,.125,.1063125,.088,.0704375,.054,.0390625,.026,.0151875,.007,.0018125,0]);
const CURVE_DYNAMIC_X = new Float32Array([0,.147955,.548288,1.135698,1.844884,2.610548,3.367389,4.050106,4.593399,4.931969,5.000516,4.788702,4.367,3.7901,3.112689,2.389455,1.675084,1.024267,.491688,.132037,0]);
const CURVE_DYNAMIC_Y = new Float32Array([0,.104,.352,.648,.896,1,.99363,.975704,.948,.912296,.87037,.824,.774963,.725037,.676,.62963,.587704,.552,.524296,.50637,.5]);
const CURVE_DYNAMIC_Z = new Float32Array([1,.9748,.9064,.8056,.6832,.55,.4168,.2944,.1936,.1252,.1]);
const CURVE_DYNAMIC_W = new Float32Array([.25,.271,.328,.412,.514,.625,.736,.838,.922,.979,1]);

const REALISTIC_PARTICLE_ATTRS = ["aOffset", "aSize", "aOpacity", "aColorScale", "aDynamic", "aRotation"];

/**
 * Piecewise linear interpolation over a curve LUT.
 */
export function evalCurveLut(lut, t, resolveContextFn = resolveContext) {
  const { MathUtils } = resolveContextFn();
  const clamped = MathUtils.clamp(t, 0, 1) * (lut.length - 1);
  const idx = Math.min(lut.length - 2, Math.floor(clamped));
  return MathUtils.lerp(lut[idx], lut[idx + 1], clamped - idx);
}
export const Dn = evalCurveLut;

/**
 * Realistic Boost Instanced Particle Mesh
 */
export class RealisticBoostParticleMesh {
  constructor(count, textures, renderOrder, resolveContextFn = resolveContext) {
    const {
      Mesh,
      InstancedBufferGeometry,
      BufferAttribute,
      InstancedBufferAttribute,
      ShaderMaterial,
      DynamicDrawUsage,
      NormalBlending
    } = resolveContextFn();

    this.mesh = null;
    this.offsets = new Float32Array(count * 3);
    this.sizes = new Float32Array(count * 2);
    this.opacity = new Float32Array(count);
    this.colorScale = new Float32Array(count).fill(1);
    this.dynamic = new Float32Array(count * 4);
    this.rotations = new Float32Array(count);

    const geom = new InstancedBufferGeometry();
    geom.setAttribute("position", new BufferAttribute(new Float32Array([
      -0.5, -0.5, 0,
       0.5, -0.5, 0,
       0.5,  0.5, 0,
      -0.5,  0.5, 0
    ]), 3));
    geom.setAttribute("uv", new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
    geom.setIndex([0, 1, 2, 0, 2, 3]);

    geom.setAttribute("aOffset", new InstancedBufferAttribute(this.offsets, 3));
    geom.setAttribute("aSize", new InstancedBufferAttribute(this.sizes, 2));
    geom.setAttribute("aOpacity", new InstancedBufferAttribute(this.opacity, 1));
    geom.setAttribute("aColorScale", new InstancedBufferAttribute(this.colorScale, 1));
    geom.setAttribute("aDynamic", new InstancedBufferAttribute(this.dynamic, 4));
    geom.setAttribute("aRotation", new InstancedBufferAttribute(this.rotations, 1));

    for (let i = 0; i < REALISTIC_PARTICLE_ATTRS.length; i++) {
      geom.attributes[REALISTIC_PARTICLE_ATTRS[i]].setUsage(DynamicDrawUsage);
    }
    geom.instanceCount = count;

    const mat = new ShaderMaterial({
      uniforms: {
        cloudMap: { value: textures.cloud },
        dustMap: { value: textures.dust },
        grainMap: { value: textures.grain },
        smokeMap: { value: textures.smoke },
        time: { value: 0 }
      },
      vertexShader: `
        attribute vec3 aOffset;
        attribute vec2 aSize;
        attribute float aOpacity;
        attribute float aColorScale;
        attribute vec4 aDynamic;
        attribute float aRotation;
        varying vec2 vUv;
        varying vec4 vParticleColor;
        varying vec4 vDynamic;
        void main() {
          vec4 viewPosition = modelViewMatrix * vec4(aOffset, 1.0);
          float rotationSin = sin(aRotation);
          float rotationCos = cos(aRotation);
          vec2 corner = position.xy * aSize;
          viewPosition.xy += vec2(
            rotationCos * corner.x - rotationSin * corner.y,
            rotationSin * corner.x + rotationCos * corner.y
          );
          gl_Position = projectionMatrix * viewPosition;
          vUv = uv;
          vParticleColor = vec4(
            vec3(2.5, 1.0, 0.125) * aColorScale,
            aOpacity
          );
          vDynamic = aDynamic;
        }
      `,
      fragmentShader: `
        uniform sampler2D cloudMap;
        uniform sampler2D dustMap;
        uniform sampler2D grainMap;
        uniform sampler2D smokeMap;
        uniform float time;
        varying vec2 vUv;
        varying vec4 vParticleColor;
        varying vec4 vDynamic;
        void main() {
          float angle = -0.125 * time;
          float cs = cos(angle);
          float sn = sin(angle);
          vec2 centered = vUv * 0.5 - 0.5;
          vec2 smokeUv = vec2(
            dot(vec2(cs, -sn), centered),
            dot(vec2(sn,  cs), centered)
          ) + 0.5;

          vec2 smoke = texture2D(smokeMap, smokeUv).rg;
          vec2 distortedUv = vUv + smoke * 0.08;

          vec3 grain = max(abs(texture2D(grainMap, distortedUv).rgb), vec3(0.000001));
          vec3 grain2 = grain * grain;
          grain *= grain2;
          grain2 *= grain2;
          grain *= grain2;
          grain2 *= grain2;
          grain *= grain2 * 50.0;

          float cloud = texture2D(cloudMap, distortedUv).r;
          vec2 dustPan = fract(time * vec2(0.1, 0.5));
          vec3 dust = texture2D(dustMap, distortedUv + dustPan).rgb;
          float dustOffset = dust.r - 0.2;
          vec3 shaped = (dust + vec3(0.5 * dustOffset)) * dust + vec3(vDynamic.w);
          shaped = clamp(shaped * cloud, 0.0, 1.0) * 3.0;

          vec3 signal = cloud * grain + shaped;
          float alpha = clamp(2.0 * (vParticleColor.a * shaped.r - 0.01), 0.0, 1.0);
          vec3 color = vDynamic.y * signal * vParticleColor.rgb;
          gl_FragColor = vec4(color, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      blending: NormalBlending,
      depthWrite: false,
      toneMapped: true
    });
    mat.name = "Realistic / textured exhaust particles";

    this.mesh = new Mesh(geom, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
  }

  setTime(t) {
    if (this.mesh?.material?.uniforms?.time) {
      this.mesh.material.uniforms.time.value = t;
    }
  }

  markDirty() {
    if (!this.mesh?.geometry?.attributes) return;
    for (let i = 0; i < REALISTIC_PARTICLE_ATTRS.length; i++) {
      const attr = this.mesh.geometry.attributes[REALISTIC_PARTICLE_ATTRS[i]];
      if (attr) attr.needsUpdate = true;
    }
  }
}
export const jp = RealisticBoostParticleMesh;

// Cached Golden Boost Textures
let cachedGoldenBoostTextures = null;

function setupBoostTexture(tex, repeatWrap, resolveContextFn = resolveContext) {
  const { SRGBColorSpace, RepeatWrapping } = resolveContextFn();
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  if (repeatWrap) {
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
  }
  return tex;
}

export function loadGoldenBoostTextures(resolveContextFn = resolveContext) {
  if (cachedGoldenBoostTextures) return cachedGoldenBoostTextures;

  const { TextureLoader } = resolveContextFn();
  const loader = new TextureLoader();
  const promises = [];

  const loadTex = (url, repeat) => {
    let t;
    promises.push(new Promise((resolve, reject) => {
      t = setupBoostTexture(loader.load(url, () => resolve(), undefined, reject), repeat, resolveContextFn);
    }));
    return t;
  };

  const plume = loadTex(PLUME_TEXTURE, false);
  const turb = loadTex(TURBULENCE_TEXTURE, true);
  const sparks = loadTex(SPARKS_TEXTURE, true);

  const readyPromise = Promise.all(promises).then(() => {}).catch(() => {});

  cachedGoldenBoostTextures = {
    textures: { cloud: plume, dust: turb, grain: turb, smoke: turb },
    water: turb,
    particleSheet: sparks,
    ready: readyPromise
  };

  return cachedGoldenBoostTextures;
}
export const _p = loadGoldenBoostTextures;

/**
 * Procedural cone geometry for realistic boost exhaust.
 */
export function createRealisticBoostConeGeometry(radius, length, radialSegs = 28, heightSegs = 18, resolveContextFn = resolveContext) {
  const { BufferGeometry, BufferAttribute } = resolveContextFn();
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let h = 0; h <= heightSegs; h++) {
    const fraction = h / heightSegs;
    const profile = Math.max(0.012, (0.12 + 0.88 * (1 - Math.exp(-fraction * 13))) * Math.pow(1 - fraction, 0.62));
    const r = radius * profile;
    const y = -length * fraction;

    for (let s = 0; s <= radialSegs; s++) {
      const u = s / radialSegs;
      const angle = u * Math.PI * 2;
      positions.push(y, Math.cos(angle) * r, Math.sin(angle) * r);
      uvs.push(u, 1 - fraction);
    }
  }

  const stride = radialSegs + 1;
  for (let h = 0; h < heightSegs; h++) {
    for (let s = 0; s < radialSegs; s++) {
      const a = h * stride + s;
      const b = a + stride;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const geom = new BufferGeometry();
  geom.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geom.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  geom.computeBoundingSphere();
  return geom;
}
export const D1 = createRealisticBoostConeGeometry;

/**
 * Procedural shader material for realistic boost exhaust cone.
 */
export function createRealisticBoostConeMaterial(waterMap, particleSheetMap, layer, resolveContextFn = resolveContext) {
  const { ShaderMaterial, NormalBlending, DoubleSide } = resolveContextFn();
  return new ShaderMaterial({
    uniforms: {
      waterMap: { value: waterMap },
      particleSheetMap: { value: particleSheetMap },
      time: { value: 0 },
      opacity: { value: 0 }
    },
    vertexShader: `
      varying vec2 vUv;
      varying float vLayer;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vUv = uv;
        vLayer = ${layer.toFixed(1)};
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-viewPosition.xyz);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform sampler2D waterMap;
      uniform sampler2D particleSheetMap;
      uniform float time;
      uniform float opacity;
      varying vec2 vUv;
      varying float vLayer;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float layer = clamp((vLayer - 0.5) * 100.0, 0.0, 1.0);
        float flow = time * mix(1.5, 1.0, layer);
        vec2 waterA = texture2D(waterMap, vec2(
          vUv.x - flow * 0.05,
          vUv.y * 0.25 + flow
        )).rg;
        vec2 waterB = texture2D(waterMap, vec2(
          vUv.x + flow * 0.02,
          vUv.y * 0.5 + flow
        )).rg;
        vec2 waterSum = waterA + waterB;

        vec2 sheetUvA = vec2(vUv.x * 2.0 + waterSum.r * 0.1,
          vUv.y * 0.4 + flow * 2.0 + waterSum.g * 0.1);
        vec2 sheetUvB = vec2(vUv.x * 2.0 + waterSum.r * 0.1,
          vUv.y * 0.4 + flow + waterSum.g * 0.1);
        float sheetSignal = texture2D(particleSheetMap, sheetUvA).r
          * texture2D(particleSheetMap, sheetUvB).r;

        float distortedV = vUv.y + waterSum.g * 0.5;
        float axial = min(1.0, 6.0 * pow(abs(vUv.y), 3.0));
        float fresnelPower = mix(12.0, 3.0, axial);
        float facing = clamp(dot(normalize(vNormal), normalize(vView)), 0.0, 1.0);
        float fresnel = pow(max(facing, 0.000001), fresnelPower);
        float gradient = clamp(12.0 * pow(max(abs(distortedV), 0.000001), 3.0), 0.0, 1.0);
        float baseAlpha = fresnel * gradient;
        float tip = clamp(1.0 - distortedV, 0.0, 1.0);
        float tipMask = min(1.0, 64.0 * tip * tip * tip * tip) * facing;
        float sparks = 0.08 * sheetSignal * tipMask;
        float distalNoise = (waterSum.r + waterSum.g - 1.0) * 0.16;
        float distalFade = smoothstep(0.02, 0.42, vUv.y + distalNoise);
        float alpha = opacity * 2.0 * (baseAlpha + sparks) * distalFade;
        if (alpha < 0.002) discard;

        vec3 outer = vec3(1.5, 0.8, 0.2) * 3.0;
        vec3 inner = vec3(1.5, 0.8, 0.2) * 6.0;
        vec3 color = mix(outer, inner, layer);
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    blending: NormalBlending,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: true
  });
}
export const N1 = createRealisticBoostConeMaterial;

/**
 * Realistic Boost Emitter (Space-frame buggy exhaust plume)
 */
export class RealisticBoostEmitter {
  constructor(scene, carRoot, nozzleLocal, pointLight, resolveContextFn = resolveContext) {
    const { Group, Mesh, Vector3, MathUtils } = resolveContextFn();

    this.car = carRoot;
    this.nozzleLocal = nozzleLocal.clone ? nozzleLocal.clone() : new Vector3(nozzleLocal.x, nozzleLocal.y, nozzleLocal.z);
    this.cone = new Group();
    this.coneMaterials = [];
    this.drive = null;
    this.trail = null;
    this.lensFlare = null;
    this.light = pointLight;

    this.driveAge = new Float32Array(REALISTIC_DRIVE_COUNT).fill(Infinity);
    this.driveBaseSize = new Float32Array(REALISTIC_DRIVE_COUNT * 2);
    this.driveVelocity = new Float32Array(REALISTIC_DRIVE_COUNT * 3);
    this.driveHead = 0;
    this.driveSpawnAccumulator = 0;
    this.driveParticlesActive = false;

    this.trailAge = new Float32Array(REALISTIC_TRAIL_COUNT).fill(Infinity);
    this.trailBaseSize = new Float32Array(REALISTIC_TRAIL_COUNT * 2);
    this.trailAcceleration = new Float32Array(REALISTIC_TRAIL_COUNT);
    this.trailVelocity = new Float32Array(REALISTIC_TRAIL_COUNT * 3);
    this.trailHead = 0;
    this.trailParticlesActive = false;

    this.previousNozzle = new Vector3();
    this.hasPreviousNozzle = false;
    this.spawnRemainder = 0;
    this.elapsed = 0;
    this.coneOpacity = 0;

    const { textures, water, particleSheet } = loadGoldenBoostTextures(resolveContextFn);

    this.drive = new RealisticBoostParticleMesh(REALISTIC_DRIVE_COUNT, textures, 5, resolveContextFn);
    this.drive.mesh.layers?.enable?.(1);
    this.drive.mesh.visible = false;
    carRoot.add(this.drive.mesh);

    this.trail = new RealisticBoostParticleMesh(REALISTIC_TRAIL_COUNT, textures, 4, resolveContextFn);
    this.trail.mesh.layers?.enable?.(1);
    this.trail.mesh.visible = false;
    scene.add(this.trail.mesh);

    this.cone.name = "realistic-boost-flame";
    this.drive.mesh.name = "realistic-drive-puffs";
    this.trail.mesh.name = "realistic-boost-trail";
    this.cone.position.copy(this.nozzleLocal);
    this.cone.layers?.enable?.(1);
    this.cone.visible = false;
    carRoot.add(this.cone);

    const addConeLayer = (radius, length, layerIdx) => {
      const mat = createRealisticBoostConeMaterial(water, particleSheet, layerIdx, resolveContextFn);
      const mesh = new Mesh(createRealisticBoostConeGeometry(radius, length, 28, 18, resolveContextFn), mat);
      mesh.layers?.enable?.(1);
      mesh.frustumCulled = false;
      this.coneMaterials.push(mat);
      this.cone.add(mesh);
    };

    addConeLayer(3.4, 24, 1);
    addConeLayer(7.2, 48, 0);

    const flarePos = this.nozzleLocal.clone ? this.nozzleLocal.clone() : new Vector3(this.nozzleLocal.x, this.nozzleLocal.y, this.nozzleLocal.z);
    flarePos.x -= 2;
    this.lensFlare = createBoostFlare(flarePos, resolveContextFn);
    this.lensFlare.layers?.enable?.(1);
    this.lensFlare.visible = false;
    carRoot.add(this.lensFlare);

    this._scratchA = new Vector3();
    this._scratchB = new Vector3();
    this._scratchC = new Vector3();
    this._scratchD = new Vector3();
  }

  get bloomActive() {
    return this.coneOpacity > 0.002 || this.driveParticlesActive || this.trailParticlesActive;
  }

  async preload() {
    await loadGoldenBoostTextures().ready;
  }

  update(boosting, driving, visible, dt, resolveContextFn = resolveContext) {
    const { MathUtils } = resolveContextFn();
    const isBoosting = boosting && visible;
    const isDriving = driving && !boosting && visible;
    this.elapsed += dt;

    const dampSpeed = isBoosting ? 28 : 16;
    this.coneOpacity = MathUtils.damp(this.coneOpacity, isBoosting ? 1 : 0, dampSpeed, dt);
    this.cone.visible = this.coneOpacity > 0.002;

    for (const mat of this.coneMaterials) {
      if (mat.uniforms) {
        mat.uniforms.time.value = this.elapsed;
        mat.uniforms.opacity.value = this.coneOpacity;
      }
    }

    if (this.lensFlare) {
      this.lensFlare.visible = this.cone.visible;
      if (this.lensFlare.material?.uniforms?.intensity) {
        this.lensFlare.material.uniforms.intensity.value = this.coneOpacity;
      }
    }

    if (this.light) {
      this.light.color.setRGB?.(1, 0.6689812541, 0.08848005533);
      this.light.intensity = this.coneOpacity * (2500 + 280 * Math.sin(this.elapsed * 37));
    }

    if (isDriving) {
      this.spawnDrive(dt);
    } else {
      this.driveSpawnAccumulator = 0;
    }

    if (isBoosting) {
      this.car.updateMatrixWorld?.();
      this._scratchA.copy(this.nozzleLocal);
      this.car.localToWorld?.(this._scratchA);
      this.spawnTrailByDistance(this._scratchA, dt, resolveContextFn);
    } else {
      this.hasPreviousNozzle = false;
      this.spawnRemainder = 0;
    }

    if (this.driveParticlesActive) {
      this.driveParticlesActive = this.updateDrive(dt, resolveContextFn);
      this.drive.mesh.visible = this.driveParticlesActive;
      this.drive.setTime(this.elapsed);
      this.drive.markDirty();
    }

    if (this.trailParticlesActive) {
      this.trailParticlesActive = this.updateTrail(dt, resolveContextFn);
      this.trail.mesh.visible = this.trailParticlesActive;
      this.trail.setTime(this.elapsed);
      this.trail.markDirty();
    }
  }

  reset() {
    this.driveAge.fill(Infinity);
    this.trailAge.fill(Infinity);
    this.drive.opacity.fill(0);
    this.trail.opacity.fill(0);
    this.drive.markDirty();
    this.trail.markDirty();
    this.coneOpacity = 0;
    this.cone.visible = false;
    if (this.lensFlare) this.lensFlare.visible = false;
    this.drive.mesh.visible = false;
    this.trail.mesh.visible = false;
    this.driveParticlesActive = false;
    this.trailParticlesActive = false;
    this.hasPreviousNozzle = false;
    this.spawnRemainder = 0;
    this.driveSpawnAccumulator = 0;
  }

  spawnDrive(dt) {
    this.driveSpawnAccumulator += dt * REALISTIC_DRIVE_RATE;
    if (!Number.isFinite(this.driveAge[(this.driveHead + REALISTIC_DRIVE_COUNT - 1) % REALISTIC_DRIVE_COUNT])) {
      this.driveSpawnAccumulator = Math.max(this.driveSpawnAccumulator, 1);
    }
    let spawned = 0;
    while (this.driveSpawnAccumulator >= 1 && spawned < REALISTIC_MAX_PARTICLES_PER_FRAME) {
      this.driveSpawnAccumulator -= 1;
      const head = this.driveHead;
      this.driveHead = (head + 1) % REALISTIC_DRIVE_COUNT;
      const pIdx = head * 3;
      const sIdx = head * 2;

      this.drive.offsets[pIdx] = this.nozzleLocal.x;
      this.drive.offsets[pIdx + 1] = this.nozzleLocal.y;
      this.drive.offsets[pIdx + 2] = this.nozzleLocal.z;

      this.driveVelocity[pIdx] = -(50 + Math.random() * 50);
      this.driveVelocity[pIdx + 1] = -5 + Math.random() * 10;
      this.driveVelocity[pIdx + 2] = -5 + Math.random() * 10;

      this.driveBaseSize[sIdx] = 6.5 + Math.random() * 6;
      this.driveBaseSize[sIdx + 1] = this.driveBaseSize[sIdx];

      this.drive.rotations[head] = Math.random() * Math.PI * 2;
      this.driveAge[head] = 0;
      this.driveParticlesActive = true;
      spawned++;
    }
  }

  spawnTrailByDistance(pos, dt, resolveContextFn = resolveContext) {
    const { MathUtils } = resolveContextFn();
    if (!this.hasPreviousNozzle) {
      this.previousNozzle.copy(pos);
      this.hasPreviousNozzle = true;
      return;
    }

    this._scratchB.copy(this.previousNozzle);
    this._scratchC.subVectors(pos, this._scratchB);
    const dist = this._scratchC.length();
    if (dist < 1e-4) return;
    this._scratchC.divideScalar(dist);

    if (dist > 600) {
      this.previousNozzle.copy(pos);
      this.spawnRemainder = 0;
      return;
    }

    const rem = this.spawnRemainder;
    const step = (Math.random() * 4) / REALISTIC_TRAIL_INTERVAL;
    const progress = rem + dist * step;
    const count = Math.floor(progress);
    const capped = Math.min(count, REALISTIC_MAX_PARTICLES_PER_FRAME);

    this.spawnRemainder = progress - count;

    if (step > 0) {
      for (let i = 0; i < capped; i++) {
        const t = (i + 1 - rem) / step;
        this._scratchD.copy(this._scratchB).addScaledVector(this._scratchC, MathUtils.clamp(t, 0, dist));
        this.spawnTrailParticle(this._scratchD);
      }
    }
    this.previousNozzle.copy(pos);
  }

  spawnTrailParticle(pos) {
    const head = this.trailHead;
    this.trailHead = (head + 1) % REALISTIC_TRAIL_COUNT;
    const pIdx = head * 3;
    const sIdx = head * 2;

    this.trail.offsets[pIdx] = pos.x;
    this.trail.offsets[pIdx + 1] = pos.y;
    this.trail.offsets[pIdx + 2] = pos.z;

    this.trailVelocity[pIdx] = 0;
    this.trailVelocity[pIdx + 1] = 0;
    this.trailVelocity[pIdx + 2] = 0;

    this.trailAcceleration[head] = 15 + Math.random() * 15;
    this.trailBaseSize[sIdx] = 35 + Math.random() * 15;
    this.trailBaseSize[sIdx + 1] = this.trailBaseSize[sIdx];

    this.trail.rotations[head] = Math.random() * Math.PI * 2;
    this.trailAge[head] = 0;
    this.trailParticlesActive = true;
  }

  updateDrive(dt, resolveContextFn = resolveContext) {
    let active = false;
    for (let i = 0; i < REALISTIC_DRIVE_COUNT; i++) {
      this.driveAge[i] += dt;
      const progress = this.driveAge[i] / REALISTIC_DRIVE_LIFE;
      const pIdx = i * 3;
      const sIdx = i * 2;

      if (progress >= 1) {
        this.drive.opacity[i] = 0;
        this.drive.sizes[sIdx] = this.drive.sizes[sIdx + 1] = 0;
        continue;
      }

      active = true;
      this.drive.offsets[pIdx] += this.driveVelocity[pIdx] * dt;
      this.drive.offsets[pIdx + 1] += this.driveVelocity[pIdx + 1] * dt;
      this.drive.offsets[pIdx + 2] += this.driveVelocity[pIdx + 2] * dt;

      const sizeScale = evalCurveLut(CURVE_DRIVE_SIZE, progress, resolveContextFn);
      this.drive.sizes[sIdx] = this.driveBaseSize[sIdx] * sizeScale;
      this.drive.sizes[sIdx + 1] = this.driveBaseSize[sIdx + 1] * sizeScale;

      this.drive.opacity[i] = evalCurveLut(CURVE_DRIVE_OPACITY, progress, resolveContextFn);
      this.drive.colorScale[i] = evalCurveLut(CURVE_DRIVE_COLOR, progress, resolveContextFn);

      const dIdx = i * 4;
      this.drive.dynamic[dIdx] = evalCurveLut(CURVE_DYNAMIC_X, progress, resolveContextFn);
      this.drive.dynamic[dIdx + 1] = evalCurveLut(CURVE_DYNAMIC_Y, progress, resolveContextFn);
      this.drive.dynamic[dIdx + 2] = 1;
      this.drive.dynamic[dIdx + 3] = evalCurveLut(CURVE_DYNAMIC_W, progress, resolveContextFn);
    }
    return active;
  }

  updateTrail(dt, resolveContextFn = resolveContext) {
    let active = false;
    for (let i = 0; i < REALISTIC_TRAIL_COUNT; i++) {
      this.trailAge[i] += dt;
      const progress = this.trailAge[i] / REALISTIC_TRAIL_LIFE;
      const pIdx = i * 3;
      const sIdx = i * 2;

      if (progress >= 1) {
        this.trail.opacity[i] = 0;
        this.trail.sizes[sIdx] = this.trail.sizes[sIdx + 1] = 0;
        continue;
      }

      active = true;
      const velScale = evalCurveLut(CURVE_VELOCITY, progress, resolveContextFn);
      this.trailVelocity[pIdx + 2] += this.trailAcceleration[i] * dt;
      this.trail.offsets[pIdx] += this.trailVelocity[pIdx] * velScale * dt;
      this.trail.offsets[pIdx + 1] += this.trailVelocity[pIdx + 1] * velScale * dt;
      this.trail.offsets[pIdx + 2] += this.trailVelocity[pIdx + 2] * velScale * dt;

      this.trail.sizes[sIdx] = this.trailBaseSize[sIdx] * evalCurveLut(CURVE_SCALE, progress, resolveContextFn);
      this.trail.sizes[sIdx + 1] = this.trailBaseSize[sIdx + 1];
      this.trail.opacity[i] = evalCurveLut(CURVE_OPACITY, progress, resolveContextFn);
      this.trail.colorScale[i] = 1;

      const dIdx = i * 4;
      this.trail.dynamic[dIdx] = evalCurveLut(CURVE_DYNAMIC_X, progress, resolveContextFn);
      this.trail.dynamic[dIdx + 1] = evalCurveLut(CURVE_DYNAMIC_Y, progress, resolveContextFn);
      this.trail.dynamic[dIdx + 2] = 1;
      this.trail.dynamic[dIdx + 3] = evalCurveLut(CURVE_DYNAMIC_Z, progress, resolveContextFn);
    }
    return active;
  }
}
export const O1 = RealisticBoostEmitter;

// ==========================================
// Arcade Boost Flame & Particles Constants
// ==========================================
const ARCADE_TRAIL_COUNT = 72;
const ARCADE_DRIVE_COUNT = 16;
const ARCADE_TRAIL_LIFE = 0.36;
const ARCADE_DRIVE_LIFE = 0.3;
const ARCADE_TRAIL_DISTANCE = 28;
const ARCADE_DRIVE_SPAWN_RATE = 8;
const ARCADE_MAX_PARTICLES_PER_FRAME = 24;
const ARCADE_BOOST_COLOR_HEX = 16750126; // #ff942e

const ARCADE_PARTICLE_ATTRS = ["aOffset", "aSize", "aOpacity", "aLife", "aRotation"];

/**
 * Arcade Instanced Particle Mesh
 */
export class ArcadeBoostParticleMesh {
  constructor(count, isDriving, renderOrder, resolveContextFn = resolveContext) {
    const {
      Mesh,
      InstancedBufferGeometry,
      BufferAttribute,
      InstancedBufferAttribute,
      ShaderMaterial,
      DynamicDrawUsage
    } = resolveContextFn();

    this.mesh = null;
    this.offsets = new Float32Array(count * 3);
    this.sizes = new Float32Array(count * 2);
    this.opacity = new Float32Array(count);
    this.life = new Float32Array(count);
    this.rotations = new Float32Array(count);

    const geom = new InstancedBufferGeometry();
    geom.setAttribute("position", new BufferAttribute(new Float32Array([
      -0.5, -0.5, 0,
       0.5, -0.5, 0,
       0.5,  0.5, 0,
      -0.5,  0.5, 0
    ]), 3));
    geom.setAttribute("uv", new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
    geom.setIndex([0, 1, 2, 0, 2, 3]);

    geom.setAttribute("aOffset", new InstancedBufferAttribute(this.offsets, 3));
    geom.setAttribute("aSize", new InstancedBufferAttribute(this.sizes, 2));
    geom.setAttribute("aOpacity", new InstancedBufferAttribute(this.opacity, 1));
    geom.setAttribute("aLife", new InstancedBufferAttribute(this.life, 1));
    geom.setAttribute("aRotation", new InstancedBufferAttribute(this.rotations, 1));

    for (const attr of ARCADE_PARTICLE_ATTRS) {
      geom.attributes[attr].setUsage(DynamicDrawUsage);
    }
    geom.instanceCount = count;

    const mat = new ShaderMaterial({
      uniforms: {
        driving: { value: isDriving ? 1 : 0 }
      },
      vertexShader: `
        attribute vec3 aOffset;
        attribute vec2 aSize;
        attribute float aOpacity;
        attribute float aLife;
        attribute float aRotation;
        varying vec2 vUv;
        varying float vOpacity;
        varying float vLife;
        varying float vSpark;
        void main() {
          vec4 viewPosition = modelViewMatrix * vec4(aOffset, 1.0);
          float rotationSin = sin(aRotation);
          float rotationCos = cos(aRotation);
          vSpark = step(0.55, fract(aRotation * 2.7));
          vec2 corner = position.xy * aSize * mix(1.0, 0.55, vSpark);
          viewPosition.xy += vec2(
            rotationCos * corner.x - rotationSin * corner.y,
            rotationSin * corner.x + rotationCos * corner.y
          );
          gl_Position = projectionMatrix * viewPosition;
          vUv = uv;
          vOpacity = aOpacity;
          vLife = aLife;
        }
      `,
      fragmentShader: `
        uniform float driving;
        varying vec2 vUv;
        varying float vOpacity;
        varying float vLife;
        varying float vSpark;
        float cloud(vec2 p) {
          float d = length(p) - 0.72;
          d = min(d, length(p - vec2(-0.36, 0.08)) - 0.42);
          d = min(d, length(p - vec2(0.30, 0.27)) - 0.43);
          d = min(d, length(p - vec2(0.18, -0.33)) - 0.39);
          return d;
        }
        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          float d = mix(cloud(p), abs(p.x) + abs(p.y) - 0.72, vSpark);
          float aa = max(fwidth(d), 0.008);
          float alpha = (1.0 - smoothstep(-aa, aa, d)) * vOpacity;
          if (alpha < 0.003) discard;
          float inset = 1.0 - smoothstep(-0.12 - aa, -0.12 + aa, d);
          float highlight = 1.0 - smoothstep(-aa, aa, cloud(p * 1.65 + vec2(0.10, -0.24)));
          vec3 edge = mix(vec3(0.88, 0.18, 0.015), vec3(0.25, 0.33, 0.41), driving);
          vec3 fill = mix(vec3(1.0, 0.46, 0.065), vec3(0.53, 0.63, 0.71), driving);
          vec3 cream = mix(vec3(1.25, 0.72, 0.23), vec3(0.76, 0.83, 0.86), driving);
          vec3 color = mix(edge, fill, inset);
          color = mix(color, cream, highlight * inset * (1.0 - smoothstep(0.2, 0.85, vLife)));
          gl_FragColor = vec4(color, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      toneMapped: true
    });
    mat.name = isDriving ? "Arcade / exhaust puffs" : "Arcade / boost puffs";

    this.mesh = new Mesh(geom, mat);
    this.mesh.name = isDriving ? "drive-puffs" : "boost-trail";
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
  }

  markDirty() {
    if (!this.mesh?.geometry?.attributes) return;
    for (const attr of ARCADE_PARTICLE_ATTRS) {
      const a = this.mesh.geometry.attributes[attr];
      if (a) a.needsUpdate = true;
    }
  }
}
export const Sp = ArcadeBoostParticleMesh;

/**
 * Arcade Boost flame cone geometry
 */
export function createArcadeBoostFlameConeGeometry(radius, resolveContextFn = resolveContext) {
  const { BufferGeometry, BufferAttribute } = resolveContextFn();
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let l = 0; l <= 12; l++) {
    const fraction = l / 12;
    const r = radius * (0.22 + 0.78 * Math.sin(Math.PI * Math.pow(fraction, 0.68))) * (1 - fraction);
    for (let d = 0; d <= 12; d++) {
      const u = d / 12;
      const angle = u * Math.PI * 2;
      positions.push(-50 * fraction, Math.cos(angle) * r, Math.sin(angle) * r);
      uvs.push(u, 1 - fraction);
    }
  }

  const stride = 13;
  for (let l = 0; l < 12; l++) {
    for (let c = 0; c < 12; c++) {
      const a = l * stride + c;
      const b = a + stride;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const geom = new BufferGeometry();
  geom.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geom.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}
export const W1 = createArcadeBoostFlameConeGeometry;

/**
 * Arcade Boost flame cone material
 */
export function createArcadeBoostFlameConeMaterial(resolveContextFn = resolveContext) {
  const { ShaderMaterial, DoubleSide } = resolveContextFn();
  return new ShaderMaterial({
    name: "Arcade / painted flame",
    uniforms: {
      time: { value: 0 },
      opacity: { value: 0 }
    },
    vertexShader: `
      uniform float time;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vUv = uv;
        float tail = 1.0 - uv.y;
        vec3 p = position;
        p.x *= 1.0 + 0.09 * sin(time * 24.0);
        p.y += sin(time * 19.0 - tail * 7.0) * 2.0 * tail * tail;
        p.z += sin(time * 15.0 - tail * 5.0) * 1.3 * tail * tail;
        vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-viewPosition.xyz);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform float opacity;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float facing = abs(dot(normalize(vNormal), normalize(vView)));
        float aa = max(fwidth(facing), 0.015);
        float body = smoothstep(0.32 - aa, 0.32 + aa, facing);
        float core = smoothstep(0.83 - aa, 0.83 + aa, facing);
        core *= smoothstep(0.28, 0.32, vUv.y);
        vec3 color = mix(vec3(0.95, 0.16, 0.012), vec3(1.2, 0.46, 0.055), body);
        color = mix(color, vec3(1.3, 1.0, 0.45), core);
        gl_FragColor = vec4(color, opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: true
  });
}
export const X1 = createArcadeBoostFlameConeMaterial;

/**
 * Arcade nozzle flash point light / billboard
 */
export function createNozzleFlash(pos, resolveContextFn = resolveContext) {
  const { BufferGeometry, BufferAttribute, ShaderMaterial, Points } = resolveContextFn();
  const geom = new BufferGeometry();
  geom.setAttribute("position", new BufferAttribute(new Float32Array(pos.toArray ? pos.toArray() : [pos.x, pos.y, pos.z]), 3));

  const mat = new ShaderMaterial({
    name: "Arcade / nozzle glint",
    uniforms: {
      intensity: { value: 0 }
    },
    vertexShader: `
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        gl_PointSize = 15.0 * (500.0 / max(1.0, -viewPosition.z));
      }
    `,
    fragmentShader: `
      uniform float intensity;
      void main() {
        vec2 p = abs(gl_PointCoord * 2.0 - 1.0);
        float shape = sqrt(p.x) + sqrt(p.y);
        float aa = max(fwidth(shape), 0.015);
        float alpha = (1.0 - smoothstep(1.0 - aa, 1.0 + aa, shape)) * intensity;
        if (alpha < 0.003) discard;
        gl_FragColor = vec4(vec3(1.9, 1.48, 0.82), alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    toneMapped: true
  });

  const points = new Points(geom, mat);
  points.frustumCulled = false;
  points.renderOrder = 7;
  return points;
}
export const J1 = createNozzleFlash;

/**
 * Lens Flare billboard for realistic boost
 */
export function createBoostFlare(pos, resolveContextFn = resolveContext) {
  const { BufferGeometry, BufferAttribute, ShaderMaterial, Points, AdditiveBlending } = resolveContextFn();
  const geom = new BufferGeometry();
  geom.setAttribute("position", new BufferAttribute(new Float32Array(pos.toArray ? pos.toArray() : [pos.x, pos.y, pos.z]), 3));

  const mat = new ShaderMaterial({
    uniforms: {
      intensity: { value: 0 }
    },
    vertexShader: `
      uniform float intensity;
      varying float vIntensity;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        gl_PointSize = 45.0 * (500.0 / max(1.0, -viewPosition.z));
        vIntensity = intensity;
      }
    `,
    fragmentShader: `
      varying float vIntensity;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float r = length(p) * 2.0;
        float core = exp(-r * r * 18.0);
        float halo = exp(-r * r * 4.2) * 0.32;
        float alpha = (core + halo) * vIntensity;
        if (alpha < 0.003) discard;
        gl_FragColor = vec4(vec3(4.5, 0.9375, 0.15) * (core + halo), alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: true
  });

  const points = new Points(geom, mat);
  points.frustumCulled = false;
  points.renderOrder = 7;
  return points;
}
export const G1 = createBoostFlare;

// =========================================================================
// Main Vehicle Boost Emitter Component (VehicleBoostEmitter / K1)
// =========================================================================
export class VehicleBoostEmitter {
  setSpatial(isSpatial) {
    this.audio?.setSpatial?.(isSpatial);
  }

  constructor(scene, carRoot, nozzleLocal, isPrimary = true, isBot = false, resolveContextFn = resolveContext) {
    const { Group, Mesh, PointLight, Color, Vector3 } = resolveContextFn();

    this.car = carRoot;
    this.nozzleLocal = nozzleLocal.clone ? nozzleLocal.clone() : new Vector3(nozzleLocal.x, nozzleLocal.y, nozzleLocal.z);
    this.cone = new Group();
    this.coneMaterials = [];
    this.drive = null;
    this.trail = null;
    this.nozzleFlash = null;
    this.light = null;
    this.audio = isPrimary ? new BoostAudio(isBot) : null;
    this.theme = getTheme();

    this.driveAge = new Float32Array(ARCADE_DRIVE_COUNT).fill(Infinity);
    this.driveBaseSize = new Float32Array(ARCADE_DRIVE_COUNT * 2);
    this.driveVelocity = new Float32Array(ARCADE_DRIVE_COUNT * 3);
    this.driveHead = 0;
    this.driveSpawnAccumulator = 0;
    this.driveParticlesActive = false;

    this.trailAge = new Float32Array(ARCADE_TRAIL_COUNT).fill(Infinity);
    this.trailBaseSize = new Float32Array(ARCADE_TRAIL_COUNT * 2);
    this.trailAcceleration = new Float32Array(ARCADE_TRAIL_COUNT);
    this.trailVelocity = new Float32Array(ARCADE_TRAIL_COUNT * 3);
    this.trailHead = 0;
    this.trailParticlesActive = false;

    this.previousNozzle = new Vector3();
    this.hasPreviousNozzle = false;
    this.spawnRemainder = 0;
    this.elapsed = 0;
    this.coneOpacity = 0;

    // Build arcade drive puffs
    this.drive = new ArcadeBoostParticleMesh(ARCADE_DRIVE_COUNT, true, 5, resolveContextFn);
    this.drive.mesh.layers?.enable?.(1);
    this.drive.mesh.visible = false;
    carRoot.add(this.drive.mesh);

    // Build arcade boost trail puffs
    this.trail = new ArcadeBoostParticleMesh(ARCADE_TRAIL_COUNT, false, 4, resolveContextFn);
    this.trail.mesh.layers?.enable?.(1);
    this.trail.mesh.visible = false;
    scene.add(this.trail.mesh);

    // Build arcade flame cone
    this.cone.position.copy(this.nozzleLocal);
    this.cone.layers?.enable?.(1);
    this.cone.visible = false;
    this.cone.name = "boost-flame";
    carRoot.add(this.cone);

    const flameMat = createArcadeBoostFlameConeMaterial(resolveContextFn);
    const flameMesh = new Mesh(createArcadeBoostFlameConeGeometry(11, resolveContextFn), flameMat);
    flameMesh.layers?.enable?.(1);
    flameMesh.frustumCulled = false;
    this.coneMaterials.push(flameMat);
    this.cone.add(flameMesh);

    // Build nozzle flash
    const flashPos = this.nozzleLocal.clone ? this.nozzleLocal.clone() : new Vector3(this.nozzleLocal.x, this.nozzleLocal.y, this.nozzleLocal.z);
    flashPos.x -= 2;
    this.nozzleFlash = createNozzleFlash(flashPos, resolveContextFn);
    this.nozzleFlash.layers?.enable?.(1);
    this.nozzleFlash.visible = false;
    carRoot.add(this.nozzleFlash);

    // Point Light
    const flameColor = new Color(ARCADE_BOOST_COLOR_HEX);
    this.light = new PointLight(flameColor, 0, 300, 2);
    const lightPos = this.nozzleLocal.clone ? this.nozzleLocal.clone() : new Vector3(this.nozzleLocal.x, this.nozzleLocal.y, this.nozzleLocal.z);
    lightPos.x -= 10;
    this.light.position.copy(lightPos);
    carRoot.add(this.light);

    // Realistic branch
    this.realistic = new RealisticBoostEmitter(scene, carRoot, this.nozzleLocal, this.light, resolveContextFn);

    this._scratchWorldNozzle = new Vector3();
    this._scratchPrevNozzle = new Vector3();
    this._scratchDelta = new Vector3();
    this._scratchParticlePos = new Vector3();
  }

  get bloomActive() {
    if (this.theme === "realistic") {
      return this.realistic.bloomActive;
    }
    return this.coneOpacity > 0.002 || this.driveParticlesActive || this.trailParticlesActive;
  }

  async preload() {
    await Promise.all([
      this.audio?.preload?.().catch(() => {}),
      this.realistic?.preload?.()
    ]);
  }

  disposeAudio() {
    this.audio?.dispose?.();
  }

  update(boosting, driving, visible, dt, isFocused = true, resolveContextFn = resolveContext) {
    const { MathUtils, Color } = resolveContextFn();
    const isBoosting = boosting && visible;
    const isDriving = driving && !boosting && visible;
    this.elapsed += dt;

    if (this.audio) {
      this.car.updateWorldMatrix?.(true, false);
      this._scratchWorldNozzle.copy(this.nozzleLocal);
      this.car.localToWorld?.(this._scratchWorldNozzle);
      this.audio.updateSpatial?.(this._scratchWorldNozzle, visible && isFocused);
      this.audio.setBoosting?.(isBoosting && isFocused);
    }

    const currentTheme = getTheme();
    if (this.theme !== currentTheme) {
      this.resetVisual();
      this.realistic.reset();
      this.theme = currentTheme;
    }

    if (currentTheme === "realistic") {
      this.realistic.update(boosting, driving, visible, dt, resolveContextFn);
      return;
    }

    if (this.light) {
      this.light.color.setHex?.(ARCADE_BOOST_COLOR_HEX);
    }

    const dampSpeed = isBoosting ? 28 : 16;
    this.coneOpacity = MathUtils.damp(this.coneOpacity, isBoosting ? 1 : 0, dampSpeed, dt);
    this.cone.visible = this.coneOpacity > 0.002;

    for (const mat of this.coneMaterials) {
      if (mat.uniforms) {
        mat.uniforms.time.value = this.elapsed;
        mat.uniforms.opacity.value = this.coneOpacity;
      }
    }

    if (this.nozzleFlash) {
      this.nozzleFlash.visible = this.cone.visible;
      if (this.nozzleFlash.material?.uniforms?.intensity) {
        this.nozzleFlash.material.uniforms.intensity.value = this.coneOpacity;
      }
    }

    if (this.light) {
      this.light.intensity = this.coneOpacity * (380 + 25 * Math.sin(this.elapsed * 24));
    }

    if (isDriving) {
      this.spawnDrive(dt);
    } else {
      this.driveSpawnAccumulator = 0;
    }

    if (isBoosting) {
      this.car.updateMatrixWorld?.();
      this._scratchWorldNozzle.copy(this.nozzleLocal);
      this.car.localToWorld?.(this._scratchWorldNozzle);
      this.spawnTrailByDistance(this._scratchWorldNozzle, dt, resolveContextFn);
    } else {
      this.hasPreviousNozzle = false;
      this.spawnRemainder = 0;
    }

    if (this.driveParticlesActive) {
      this.driveParticlesActive = this.updateDrive(dt);
      this.drive.mesh.visible = this.driveParticlesActive;
      this.drive.markDirty();
    }

    if (this.trailParticlesActive) {
      this.trailParticlesActive = this.updateTrail(dt, resolveContextFn);
      this.trail.mesh.visible = this.trailParticlesActive;
      this.trail.markDirty();
    }
  }

  resetVisual() {
    this.driveAge.fill(Infinity);
    this.trailAge.fill(Infinity);
    this.drive.opacity.fill(0);
    this.trail.opacity.fill(0);
    this.drive.markDirty();
    this.trail.markDirty();
    this.coneOpacity = 0;
    this.cone.visible = false;
    if (this.nozzleFlash) this.nozzleFlash.visible = false;
    this.drive.mesh.visible = false;
    this.trail.mesh.visible = false;
    this.driveParticlesActive = false;
    this.trailParticlesActive = false;
    this.hasPreviousNozzle = false;
    this.spawnRemainder = 0;
    this.driveSpawnAccumulator = 0;
  }

  spawnDrive(dt) {
    this.driveSpawnAccumulator += dt * ARCADE_DRIVE_SPAWN_RATE;
    if (!Number.isFinite(this.driveAge[(this.driveHead + ARCADE_DRIVE_COUNT - 1) % ARCADE_DRIVE_COUNT])) {
      this.driveSpawnAccumulator = Math.max(this.driveSpawnAccumulator, 1);
    }
    let spawned = 0;
    while (this.driveSpawnAccumulator >= 1 && spawned < ARCADE_MAX_PARTICLES_PER_FRAME) {
      this.driveSpawnAccumulator -= 1;
      const head = this.driveHead;
      this.driveHead = (head + 1) % ARCADE_DRIVE_COUNT;
      const pIdx = head * 3;
      const sIdx = head * 2;

      this.drive.offsets[pIdx] = this.nozzleLocal.x;
      this.drive.offsets[pIdx + 1] = this.nozzleLocal.y;
      this.drive.offsets[pIdx + 2] = this.nozzleLocal.z;

      this.driveVelocity[pIdx] = -(50 + Math.random() * 50);
      this.driveVelocity[pIdx + 1] = -5 + Math.random() * 10;
      this.driveVelocity[pIdx + 2] = -5 + Math.random() * 10;

      this.driveBaseSize[sIdx] = 6 + Math.random() * 3;
      this.driveBaseSize[sIdx + 1] = this.driveBaseSize[sIdx];

      this.drive.rotations[head] = Math.random() * Math.PI * 2;
      this.driveAge[head] = 0;
      this.driveParticlesActive = true;
      spawned++;
    }
  }

  spawnTrailByDistance(pos, dt, resolveContextFn = resolveContext) {
    const { MathUtils } = resolveContextFn();
    if (!this.hasPreviousNozzle) {
      this.previousNozzle.copy(pos);
      this.hasPreviousNozzle = true;
      return;
    }

    this._scratchPrevNozzle.copy(this.previousNozzle);
    this._scratchDelta.subVectors(pos, this._scratchPrevNozzle);
    const dist = this._scratchDelta.length();
    if (dist < 1e-4) return;
    this._scratchDelta.divideScalar(dist);

    if (dist > 600) {
      this.previousNozzle.copy(pos);
      this.spawnRemainder = 0;
      return;
    }

    const rem = this.spawnRemainder;
    const invInterval = 1 / ARCADE_TRAIL_DISTANCE;
    const progress = rem + dist * invInterval;
    const count = Math.floor(progress);
    const capped = Math.min(count, ARCADE_MAX_PARTICLES_PER_FRAME);

    this.spawnRemainder = progress - count;

    for (let i = 0; i < capped; i++) {
      const t = (i + 1 - rem) / invInterval;
      this._scratchParticlePos.copy(this._scratchPrevNozzle).addScaledVector(this._scratchDelta, MathUtils.clamp(t, 0, dist));
      this.spawnTrailParticle(this._scratchParticlePos);
    }
    this.previousNozzle.copy(pos);
  }

  spawnTrailParticle(pos) {
    const head = this.trailHead;
    this.trailHead = (head + 1) % ARCADE_TRAIL_COUNT;
    const pIdx = head * 3;
    const sIdx = head * 2;

    this.trail.offsets[pIdx] = pos.x;
    this.trail.offsets[pIdx + 1] = pos.y;
    this.trail.offsets[pIdx + 2] = pos.z;

    this.trailVelocity[pIdx] = 0;
    this.trailVelocity[pIdx + 1] = 0;
    this.trailVelocity[pIdx + 2] = 0;

    this.trailAcceleration[head] = 15 + Math.random() * 15;
    this.trailBaseSize[sIdx] = 16 + Math.random() * 6;
    this.trailBaseSize[sIdx + 1] = this.trailBaseSize[sIdx];

    this.trail.rotations[head] = Math.random() * Math.PI * 2;
    this.trailAge[head] = 0;
    this.trailParticlesActive = true;
  }

  updateDrive(dt) {
    let active = false;
    for (let i = 0; i < ARCADE_DRIVE_COUNT; i++) {
      this.driveAge[i] += dt;
      const progress = this.driveAge[i] / ARCADE_DRIVE_LIFE;
      const pIdx = i * 3;
      const sIdx = i * 2;

      if (progress >= 1) {
        this.drive.opacity[i] = 0;
        this.drive.sizes[sIdx] = this.drive.sizes[sIdx + 1] = 0;
        continue;
      }

      active = true;
      this.drive.offsets[pIdx] += this.driveVelocity[pIdx] * dt;
      this.drive.offsets[pIdx + 1] += this.driveVelocity[pIdx + 1] * dt;
      this.drive.offsets[pIdx + 2] += this.driveVelocity[pIdx + 2] * dt;

      const scale = (1 + progress * 1.5) * (1 - progress * progress);
      this.drive.sizes[sIdx] = this.driveBaseSize[sIdx] * scale;
      this.drive.sizes[sIdx + 1] = this.driveBaseSize[sIdx + 1] * scale;
      this.drive.opacity[i] = 0.5 * (1 - progress);
      this.drive.life[i] = progress;
    }
    return active;
  }

  updateTrail(dt, resolveContextFn = resolveContext) {
    const { MathUtils } = resolveContextFn();
    let active = false;
    for (let i = 0; i < ARCADE_TRAIL_COUNT; i++) {
      this.trailAge[i] += dt;
      const progress = this.trailAge[i] / ARCADE_TRAIL_LIFE;
      const pIdx = i * 3;
      const sIdx = i * 2;

      if (progress >= 1) {
        this.trail.opacity[i] = 0;
        this.trail.sizes[sIdx] = this.trail.sizes[sIdx + 1] = 0;
        continue;
      }

      active = true;
      this.trailVelocity[pIdx + 1] += this.trailAcceleration[i] * dt;
      this.trail.offsets[pIdx + 1] += this.trailVelocity[pIdx + 1] * dt;

      const scale = (0.65 + 0.6 * Math.sin(progress * Math.PI)) * (1 - progress * progress);
      this.trail.sizes[sIdx] = this.trailBaseSize[sIdx] * scale;
      this.trail.sizes[sIdx + 1] = this.trailBaseSize[sIdx + 1] * scale;
      this.trail.opacity[i] = 0.9 * (1 - MathUtils.smoothstep(progress, 0.65, 1));
      this.trail.life[i] = progress;
    }
    return active;
  }
}
export const K1 = VehicleBoostEmitter;
