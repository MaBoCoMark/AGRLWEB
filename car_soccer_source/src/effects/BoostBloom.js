/**
 * BoostBloom.js
 * Multi-pass progressive dual-filtering (downsampling & upsampling) bloom post-processor.
 * Generates low-frequency halo glow for vehicle boost fires, supersonic plumes, and goals.
 */

export const BLOOM_MIP_LEVELS = 4;
export const BLOOM_DOWNSCALE_FACTOR = 0.5;
export const BLOOM_THRESHOLD = 1.2;
export const BLOOM_SMOOTH_WIDTH = 0.01;
export const BLOOM_OUTPUT_STRENGTH = 0.275 * 3;
export const BLOOM_WEIGHTS = [0.76, 0.68, 0.6, 0.52 + 0.44];

export const BLOOM_QUAD_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const BLOOM_DOWNSAMPLE_FRAGMENT_SHADER = `
  uniform sampler2D inputTexture;
  uniform vec2 texelSize;
  uniform float applyThreshold;
  uniform float threshold;
  uniform float smoothWidth;
  varying vec2 vUv;

  void main() {
    // Four bilinear taps are enough for a stable, low-frequency boost
    // halo and suppress the stair-stepping of a single scaled lookup.
    vec3 color = (
      texture2D(inputTexture, vUv + texelSize * vec2(-0.5, -0.5)).rgb +
      texture2D(inputTexture, vUv + texelSize * vec2( 0.5, -0.5)).rgb +
      texture2D(inputTexture, vUv + texelSize * vec2(-0.5,  0.5)).rgb +
      texture2D(inputTexture, vUv + texelSize * vec2( 0.5,  0.5)).rgb
    ) * 0.25;

    if (applyThreshold > 0.5) {
      float brightness = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color *= smoothstep(threshold, threshold + smoothWidth, brightness);
    }
    gl_FragColor = vec4(color, 1.0);
  }
`;

export const BLOOM_UPSAMPLE_FRAGMENT_SHADER = `
  uniform sampler2D lowTexture;
  uniform sampler2D highTexture;
  uniform vec2 lowTexelSize;
  uniform float highWeight;
  uniform float lowWeight;
  uniform float outputStrength;
  varying vec2 vUv;

  void main() {
    vec2 d = lowTexelSize;
    // Tent-filter the coarser level while scaling it up. The diagonal
    // taps carry twice the weight of the axial taps, matching the smooth
    // rounded falloff expected from the old Gaussian chain.
    vec3 low = (
      texture2D(lowTexture, vUv + vec2(-d.x, -d.y)).rgb * 2.0 +
      texture2D(lowTexture, vUv + vec2( d.x, -d.y)).rgb * 2.0 +
      texture2D(lowTexture, vUv + vec2(-d.x,  d.y)).rgb * 2.0 +
      texture2D(lowTexture, vUv + vec2( d.x,  d.y)).rgb * 2.0 +
      texture2D(lowTexture, vUv + vec2(-2.0 * d.x, 0.0)).rgb +
      texture2D(lowTexture, vUv + vec2( 2.0 * d.x, 0.0)).rgb +
      texture2D(lowTexture, vUv + vec2(0.0, -2.0 * d.y)).rgb +
      texture2D(lowTexture, vUv + vec2(0.0,  2.0 * d.y)).rgb
    ) / 12.0;
    vec3 high = texture2D(highTexture, vUv).rgb;
    gl_FragColor = vec4(
      (high * highWeight + low * lowWeight) * outputStrength,
      1.0
    );
  }
`;

// Three.js dependency container
let bloomThreeContext = {
  WebGLRenderTarget: null,
  ShaderMaterial: null,
  Vector2: null,
  Color: null,
  FullScreenQuad: null,
  HalfFloatType: 1016,
  LinearFilter: 1006
};

export function setBoostBloomThreeContext(context) {
  bloomThreeContext = { ...bloomThreeContext, ...context };
}

export function createBloomRenderTarget(name, hasDepth) {
  const RenderTarget = bloomThreeContext.WebGLRenderTarget || (typeof THREE !== 'undefined' ? THREE.WebGLRenderTarget : null);
  if (!RenderTarget) {
    // Mock target for headless testing
    return {
      texture: { name, generateMipmaps: false },
      width: 1,
      height: 1,
      setSize(w, h) { this.width = w; this.height = h; },
      dispose() {}
    };
  }
  const target = new RenderTarget(1, 1, {
    type: bloomThreeContext.HalfFloatType,
    minFilter: bloomThreeContext.LinearFilter,
    magFilter: bloomThreeContext.LinearFilter,
    depthBuffer: hasDepth,
    stencilBuffer: false
  });
  target.texture.name = name;
  target.texture.generateMipmaps = false;
  return target;
}

export class BoostBloom {
  constructor(renderer, width, height, pixelRatio) {
    this.renderer = renderer;
    this.renderSubmissions = 1 + BLOOM_MIP_LEVELS + (BLOOM_MIP_LEVELS - 1);
    this.sourceTarget = createBloomRenderTarget("BoostBloom.source", true);
    this.downTargets = [];
    this.upTargets = [];

    const ShaderMaterial = bloomThreeContext.ShaderMaterial || (typeof THREE !== 'undefined' ? THREE.ShaderMaterial : null);
    const Vector2 = bloomThreeContext.Vector2 || (typeof THREE !== 'undefined' ? THREE.Vector2 : function (x = 0, y = 0) { this.x = x; this.y = y; this.set = (nx, ny) => { this.x = nx; this.y = ny; }; });
    const Color = bloomThreeContext.Color || (typeof THREE !== 'undefined' ? THREE.Color : function () { this.r = 0; this.g = 0; this.b = 0; });
    const FullScreenQuad = bloomThreeContext.FullScreenQuad || (typeof THREE !== 'undefined' ? THREE.FullScreenQuad : null);

    this.oldClearColor = new Color();

    for (let s = 0; s < BLOOM_MIP_LEVELS; s += 1) {
      this.downTargets.push(createBloomRenderTarget(`BoostBloom.down${s}`, false));
      if (s < BLOOM_MIP_LEVELS - 1) {
        this.upTargets.push(createBloomRenderTarget(`BoostBloom.up${s}`, false));
      }
    }

    this.texture = this.upTargets[0]?.texture || null;

    if (ShaderMaterial) {
      this.downsampleMaterial = new ShaderMaterial({
        uniforms: {
          inputTexture: { value: null },
          texelSize: { value: new Vector2() },
          applyThreshold: { value: 0 },
          threshold: { value: BLOOM_THRESHOLD },
          smoothWidth: { value: BLOOM_SMOOTH_WIDTH }
        },
        vertexShader: BLOOM_QUAD_VERTEX_SHADER,
        fragmentShader: BLOOM_DOWNSAMPLE_FRAGMENT_SHADER,
        depthTest: false,
        depthWrite: false,
        toneMapped: false
      });

      this.upsampleMaterial = new ShaderMaterial({
        uniforms: {
          lowTexture: { value: null },
          highTexture: { value: null },
          lowTexelSize: { value: new Vector2() },
          highWeight: { value: 1 },
          lowWeight: { value: 1 },
          outputStrength: { value: 1 }
        },
        vertexShader: BLOOM_QUAD_VERTEX_SHADER,
        fragmentShader: BLOOM_UPSAMPLE_FRAGMENT_SHADER,
        depthTest: false,
        depthWrite: false,
        toneMapped: false
      });
    } else {
      this.downsampleMaterial = { uniforms: { inputTexture: {}, texelSize: { value: new Vector2() }, applyThreshold: {} }, dispose() {} };
      this.upsampleMaterial = { uniforms: { lowTexture: {}, highTexture: {}, lowTexelSize: { value: new Vector2() }, highWeight: {}, lowWeight: {}, outputStrength: {} }, dispose() {} };
    }

    if (FullScreenQuad) {
      this.quad = new FullScreenQuad(this.downsampleMaterial);
    } else {
      this.quad = { material: this.downsampleMaterial, render() {}, dispose() {} };
    }

    this.setSize(width, height, pixelRatio);
  }

  setSize(width, height, pixelRatio = (this.renderer?.getPixelRatio?.() ?? 1)) {
    let r = Math.max(1, Math.round(width * pixelRatio * BLOOM_DOWNSCALE_FACTOR));
    let s = Math.max(1, Math.round(height * pixelRatio * BLOOM_DOWNSCALE_FACTOR));
    this.sourceTarget.setSize(r, s);

    for (let a = 0; a < BLOOM_MIP_LEVELS; a += 1) {
      r = Math.max(1, Math.round(r / 2));
      s = Math.max(1, Math.round(s / 2));
      this.downTargets[a].setSize(r, s);
      if (a < BLOOM_MIP_LEVELS - 1) {
        this.upTargets[a].setSize(r, s);
      }
    }
  }

  clear() {
    if (!this.renderer) return;
    const e = this.renderer;
    const t = e.getRenderTarget();
    const n = e.getClearAlpha();
    e.getClearColor(this.oldClearColor);
    e.setRenderTarget(this.upTargets[0]);
    e.setClearColor(0, 0);
    e.clear(true, false, false);
    e.setRenderTarget(t);
    e.setClearColor(this.oldClearColor, n);
  }

  render(scene, camera) {
    if (!this.renderer) return;
    const n = this.renderer;
    const r = n.getRenderTarget();
    const s = n.autoClear;
    const a = n.getClearAlpha();

    n.getClearColor(this.oldClearColor);
    n.autoClear = false;
    n.setRenderTarget(this.sourceTarget);
    n.setClearColor(0, 0);
    n.clear(true, true, true);
    n.render(scene, camera);

    this.quad.material = this.downsampleMaterial;
    let o = this.sourceTarget;
    for (let l = 0; l < BLOOM_MIP_LEVELS; l += 1) {
      this.downsampleMaterial.uniforms.inputTexture.value = o.texture;
      this.downsampleMaterial.uniforms.texelSize.value.set(1 / o.width, 1 / o.height);
      this.downsampleMaterial.uniforms.applyThreshold.value = (l === 0 ? 1 : 0);
      n.setRenderTarget(this.downTargets[l]);
      this.quad.render(n);
      o = this.downTargets[l];
    }

    this.quad.material = this.upsampleMaterial;
    let A = this.downTargets[BLOOM_MIP_LEVELS - 1];
    for (let l = BLOOM_MIP_LEVELS - 2; l >= 0; l -= 1) {
      this.upsampleMaterial.uniforms.lowTexture.value = A.texture;
      this.upsampleMaterial.uniforms.highTexture.value = this.downTargets[l].texture;
      this.upsampleMaterial.uniforms.lowTexelSize.value.set(1 / A.width, 1 / A.height);
      this.upsampleMaterial.uniforms.highWeight.value = BLOOM_WEIGHTS[l];
      this.upsampleMaterial.uniforms.lowWeight.value = (l === BLOOM_MIP_LEVELS - 2 ? BLOOM_WEIGHTS[BLOOM_MIP_LEVELS - 1] : 1);
      this.upsampleMaterial.uniforms.outputStrength.value = (l === 0 ? BLOOM_OUTPUT_STRENGTH : 1);
      n.setRenderTarget(this.upTargets[l]);
      this.quad.render(n);
      A = this.upTargets[l];
    }

    n.setRenderTarget(r);
    n.setClearColor(this.oldClearColor, a);
    n.autoClear = s;
  }

  dispose() {
    this.sourceTarget.dispose();
    for (const target of this.downTargets) target.dispose();
    for (const target of this.upTargets) target.dispose();
    this.downsampleMaterial.dispose();
    this.upsampleMaterial.dispose();
    this.quad.dispose();
  }
}

// Backward-compatibility aliases
export {
  BoostBloom as fw,
  createBloomRenderTarget as Bc,
  BLOOM_MIP_LEVELS as Jn,
  BLOOM_DOWNSCALE_FACTOR as Up,
  BLOOM_THRESHOLD as hw,
  BLOOM_SMOOTH_WIDTH as dw,
  BLOOM_OUTPUT_STRENGTH as uw,
  BLOOM_WEIGHTS as qp,
  BLOOM_QUAD_VERTEX_SHADER as $p
};
