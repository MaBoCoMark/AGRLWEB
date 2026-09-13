/**
 * SupersonicSpeedLinesPass.js
 * Full-screen instanced postprocessing pass simulating high-speed supersonic travel lines.
 * Projective lines deform along the camera velocity vector with center clear-mask and smooth fade.
 */

export const SPEED_LINES_COUNT = 80;

export const SPEED_LINES_VERTEX_SHADER = `
  attribute vec4 seed;
  uniform float time, strength, aspect;
  uniform vec3 travel;
  uniform mat4 cameraProjection;
  varying vec2 vStroke;
  varying vec2 vScreen;
  varying float vOpacity;
  void main() {
    vec3 reference = abs(travel.y) > 0.95 ? vec3(1., 0., 0.) : vec3(0., 1., 0.);
    vec3 side = normalize(cross(travel, reference));
    vec3 up = cross(side, travel);
    float angle = seed.x * 6.2831853;
    float radius = mix(240., 1550., sqrt(seed.y));
    float phase = fract(seed.z + time * (0.58 + seed.w * 0.22));
    vec3 head = (side * cos(angle) + up * sin(angle)) * radius
      + travel * mix(2400., -2400., phase);
    vec3 tail = head + travel * mix(240., 440., seed.w);
    // Clip in camera space before division, including a camera looking backward.
    float visible = step(30., -min(head.z, tail.z));
    if (visible < 0.5) {
      gl_Position = vec4(2., 2., 2., 1.);
      vScreen = vec2(2.);
      vStroke = position.xy;
      vOpacity = 0.;
      return;
    }
    if (head.z > -30.) head = mix(head, tail, (-30. - head.z) / (tail.z - head.z));
    if (tail.z > -30.) tail = mix(tail, head, (-30. - tail.z) / (head.z - tail.z));
    vec4 a = cameraProjection * vec4(head, 1.);
    vec4 b = cameraProjection * vec4(tail, 1.);
    vec2 start = a.xy / max(a.w, 0.01);
    vec2 end = b.xy / max(b.w, 0.01);
    vec2 delta = (end - start) * vec2(aspect, 1.);
    vec2 normal = vec2(-delta.y, delta.x) / max(length(delta), 0.0001);
    float width = mix(0.0018, 0.0028, seed.w);
    vec2 point = mix(start, end, position.x)
      + normal / vec2(aspect, 1.) * position.y * width;
    gl_Position = vec4(point, 0., 1.);
    vScreen = point * 0.5 + 0.5;
    vStroke = position.xy;
    vOpacity = visible * strength * mix(0.30, 0.48, seed.w)
      * smoothstep(0., 0.08, phase) * (1. - smoothstep(0.88, 1., phase));
  }
`;

export const SPEED_LINES_FRAGMENT_SHADER = `
  uniform float aspect;
  varying vec2 vStroke;
  varying vec2 vScreen;
  varying float vOpacity;
  void main() {
    float width = 1. - smoothstep(0.15, 1., abs(vStroke.y));
    float cap = smoothstep(0., 0.08, vStroke.x) * (1. - smoothstep(0.35, 1., vStroke.x));
    float centerClear = smoothstep(0.12, 0.34, length((vScreen - 0.5) * vec2(aspect, 1.)));
    gl_FragColor = vec4(vec3(0.88, 0.96, 1.), width * cap * centerClear * vOpacity);
  }
`;

export const DEFAULT_COPY_SHADER = {
  name: "CopyShader",
  uniforms: {
    tDiffuse: { value: null },
    opacity: { value: 1.0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float opacity;
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      gl_FragColor = opacity * texel;
    }
  `
};

let speedLinesThreeContext = {
  Pass: null,
  FullScreenQuad: null,
  ShaderMaterial: null,
  Scene: null,
  OrthographicCamera: null,
  BufferGeometry: null,
  BufferAttribute: null,
  InstancedBufferAttribute: null,
  Mesh: null,
  Vector3: null,
  Quaternion: null,
  Matrix4: null,
  DoubleSide: 2,
  UniformsUtils: null,
  CopyShader: null,
  MathUtils: null
};

export function setSpeedLinesThreeContext(context) {
  speedLinesThreeContext = { ...speedLinesThreeContext, ...context };
}

function resolveSpeedLinesContext() {
  const G = speedLinesThreeContext;
  return {
    Pass: G.Pass || class {
      constructor() {
        this.isPass = true;
        this.enabled = true;
        this.needsSwap = true;
        this.clear = false;
        this.renderToScreen = false;
      }
      setSize() {}
      render() {}
      dispose() {}
    },
    FullScreenQuad: G.FullScreenQuad || class {
      constructor(mat) { this.material = mat; }
      render() {}
      dispose() {}
    },
    ShaderMaterial: G.ShaderMaterial || class {
      constructor(opt = {}) { Object.assign(this, opt); this.uniforms = this.uniforms || {}; }
      dispose() {}
    },
    Scene: G.Scene || class { constructor() { this.children = []; } add(c) { this.children.push(c); } },
    OrthographicCamera: G.OrthographicCamera || class {},
    BufferGeometry: G.BufferGeometry || class {
      constructor() { this.attributes = {}; }
      setAttribute(k, v) { this.attributes[k] = v; }
    },
    BufferAttribute: G.BufferAttribute || class {
      constructor(arr, itemSize) { this.array = arr; this.itemSize = itemSize; }
    },
    InstancedBufferAttribute: G.InstancedBufferAttribute || class {
      constructor(arr, itemSize) { this.array = arr; this.itemSize = itemSize; }
    },
    Mesh: G.Mesh || class {
      constructor(geo, mat) { this.geometry = geo; this.material = mat; this.frustumCulled = true; }
    },
    Vector3: G.Vector3 || class {
      constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
      set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
      copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
      applyQuaternion() { return this; }
      lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
      normalize() { return this; }
    },
    Quaternion: G.Quaternion || class {
      constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w; }
      copy(q) { this.x = q.x; this.y = q.y; this.z = q.z; this.w = q.w; return this; }
      invert() { return this; }
    },
    Matrix4: G.Matrix4 || class {
      constructor() { this.elements = new Float32Array(16); }
      copy() { return this; }
    },
    DoubleSide: G.DoubleSide ?? 2,
    CopyShader: G.CopyShader || DEFAULT_COPY_SHADER,
    MathUtils: G.MathUtils || {
      damp: (current, target, lambda, dt) => target + (current - target) * Math.exp(-lambda * dt)
    }
  };
}

/**
 * SpeedLinesEffectPass (Original mangled class `Yw`)
 */
export class SpeedLinesEffectPass {
  constructor(material) {
    const ctx = resolveSpeedLinesContext();
    const {
      Pass,
      FullScreenQuad,
      ShaderMaterial,
      Scene,
      OrthographicCamera,
      BufferGeometry,
      BufferAttribute,
      InstancedBufferAttribute,
      Mesh,
      CopyShader
    } = ctx;

    // Inherit from Pass
    Object.assign(this, new Pass());

    const copyUniforms = {
      tDiffuse: { value: null },
      opacity: { value: 1.0 }
    };
    this.copy = new FullScreenQuad(
      new ShaderMaterial({
        uniforms: copyUniforms,
        vertexShader: CopyShader.vertexShader,
        fragmentShader: CopyShader.fragmentShader,
        depthTest: false,
        depthWrite: false
      })
    );

    this.scene = new Scene();
    this.camera = new OrthographicCamera();

    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array([0, -1, 0, 1, -1, 0, 0, 1, 0, 0, 1, 0, 1, -1, 0, 1, 1, 0]), 3)
    );

    const seedArray = new Float32Array(SPEED_LINES_COUNT * 4);
    for (let a = 0; a < seedArray.length; a++) {
      const o = Math.sin((a + 1) * 127.1) * 43758.5453;
      seedArray[a] = o - Math.floor(o);
    }
    geometry.setAttribute("seed", new InstancedBufferAttribute(seedArray, 4));
    geometry.instanceCount = SPEED_LINES_COUNT;

    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.enabled = false;
  }

  render(renderer, writeBuffer, readBuffer) {
    if (!renderer) return;
    this.copy.material.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.copy.render(renderer);
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(this.scene, this.camera);
    renderer.autoClear = autoClear;
  }
}

/**
 * SupersonicSpeedLinesPass (Original mangled class `Zw`)
 */
export class SupersonicSpeedLinesPass {
  constructor() {
    const ctx = resolveSpeedLinesContext();
    const { ShaderMaterial, Vector3, Quaternion, Matrix4, DoubleSide } = ctx;

    this.strength = 0;
    this.time = 0;
    this.viewVelocity = new Vector3();
    this.inverseCamera = new Quaternion();

    this.material = new ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        strength: { value: 0 },
        aspect: { value: 1 },
        travel: { value: new Vector3(0, 0, -1) },
        cameraProjection: { value: new Matrix4() }
      },
      vertexShader: SPEED_LINES_VERTEX_SHADER,
      fragmentShader: SPEED_LINES_FRAGMENT_SHADER,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      side: DoubleSide
    });

    this.pass = new SpeedLinesEffectPass(this.material);
  }

  update(dt, isSupersonic, velocity, camera) {
    if (!camera) return;
    const { MathUtils } = resolveSpeedLinesContext();
    const clampedDt = Math.max(0, Math.min(dt, 0.1));

    const dampFunc = MathUtils.damp || ((curr, target, lambda, step) => target + (curr - target) * Math.exp(-lambda * step));
    this.strength = dampFunc(this.strength, isSupersonic ? 1 : 0, isSupersonic ? 12 : 18, clampedDt);
    this.time += clampedDt;
    this.pass.enabled = this.strength > 0.002;

    const uniforms = this.material.uniforms;
    uniforms.time.value = this.time;
    uniforms.strength.value = this.strength;
    uniforms.aspect.value = camera.aspect ?? 1;

    if (camera.projectionMatrix && uniforms.cameraProjection.value?.copy) {
      uniforms.cameraProjection.value.copy(camera.projectionMatrix);
    }

    if (camera.quaternion && this.inverseCamera?.copy) {
      this.inverseCamera.copy(camera.quaternion);
      if (typeof this.inverseCamera.invert === 'function') {
        this.inverseCamera.invert();
      }
    }

    if (velocity && this.viewVelocity?.copy) {
      this.viewVelocity.copy(velocity);
      if (typeof this.viewVelocity.applyQuaternion === 'function') {
        this.viewVelocity.applyQuaternion(this.inverseCamera);
      }
      if (typeof this.viewVelocity.lengthSq === 'function' && this.viewVelocity.lengthSq() > 1) {
        uniforms.travel.value.copy(this.viewVelocity).normalize();
      }
    }
  }
}

// Backward-compatibility aliases
export {
  SpeedLinesEffectPass as Yw,
  SupersonicSpeedLinesPass as Zw
};
