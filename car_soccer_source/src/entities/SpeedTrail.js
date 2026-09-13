/**
 * SpeedTrail.js
 * Luminous ribbon particle trail emitted behind high-speed objects (such as the ball or supersonic vehicles).
 * Dynamically computes camera-facing ribbon geometry and smooth opacity based on velocity.
 */

export const SPEED_TRAIL_THRESHOLD_SPEED = 2000;
export const SPEED_TRAIL_OPACITY_LERP_RATE = 3;
export const SPEED_TRAIL_MAX_TIME_DILATION = 4;
export const SPEED_TRAIL_EMISSION_RATE = 15;
export const SPEED_TRAIL_MAX_POINT_AGE = 1.0;
export const SPEED_TRAIL_RIBBON_WIDTH = 64;
export const SPEED_TRAIL_MAX_OPACITY = 0.2;
export const SPEED_TRAIL_MAX_POINTS = 60;
export const SPEED_TRAIL_MAX_VERTICES = SPEED_TRAIL_MAX_POINTS + 1; // 61
export const SPEED_TRAIL_TELEPORT_RESET_DISTANCE = 1024;
export const SPEED_TRAIL_ACTIVATION_GLOW_DURATION = 0.25;
export const SPEED_TRAIL_ACTIVATION_GLOW_SCALE = 256;

export const SPEED_TRAIL_VERTEX_SHADER = `
  attribute float aAcross;
  attribute float aLifeAlpha;
  varying float vAcross;
  varying float vLifeAlpha;
  void main() {
    vAcross = aAcross;
    vLifeAlpha = aLifeAlpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const SPEED_TRAIL_FRAGMENT_SHADER = `
  uniform float uOpacity;
  uniform vec3 uColor;
  varying float vAcross;
  varying float vLifeAlpha;
  void main() {
    // The recovered 64uu Size.X is the ribbon envelope, not a 64uu
    // opaque band. Preserve that geometry while matching the material's
    // much narrower cross-ribbon luminous profile.
    float crossSection = 1.0 - smoothstep(0.0, 0.32, abs(vAcross));
    float alpha = uOpacity * vLifeAlpha * crossSection;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

let speedTrailThreeContext = {
  Group: null,
  BufferGeometry: null,
  BufferAttribute: null,
  ShaderMaterial: null,
  Mesh: null,
  Sprite: null,
  SpriteMaterial: null,
  CanvasTexture: null,
  Vector3: null,
  Color: null,
  MathUtils: null,
  DynamicDrawUsage: 35048,
  AdditiveBlending: 2,
  DoubleSide: 2,
  NormalBlending: 1,
  SRGBColorSpace: 'srgb'
};

export function setSpeedTrailThreeContext(context) {
  speedTrailThreeContext = { ...speedTrailThreeContext, ...context };
}

function resolveContext() {
  const G = speedTrailThreeContext;
  return {
    Group: G.Group || (typeof THREE !== 'undefined' ? THREE.Group : class {
      constructor() {
        this.children = [];
        this.position = { copy() {} };
        this.visible = true;
      }
      add(...items) { this.children.push(...items); }
    }),
    BufferGeometry: G.BufferGeometry || (typeof THREE !== 'undefined' ? THREE.BufferGeometry : class {
      constructor() { this.attributes = {}; this.drawRange = { start: 0, count: 0 }; }
      setAttribute(k, v) { this.attributes[k] = v; }
      setIndex(idx) { this.index = idx; }
      setDrawRange(start, count) { this.drawRange.start = start; this.drawRange.count = count; }
    }),
    BufferAttribute: G.BufferAttribute || (typeof THREE !== 'undefined' ? THREE.BufferAttribute : class {
      constructor(arr, itemSize) { this.array = arr; this.itemSize = itemSize; this.usage = 0; }
      setUsage(u) { this.usage = u; return this; }
    }),
    ShaderMaterial: G.ShaderMaterial || (typeof THREE !== 'undefined' ? THREE.ShaderMaterial : class {
      constructor(opt = {}) { Object.assign(this, opt); this.uniforms = this.uniforms || {}; }
    }),
    Mesh: G.Mesh || (typeof THREE !== 'undefined' ? THREE.Mesh : class {
      constructor(geo, mat) { this.geometry = geo; this.material = mat; this.visible = true; }
    }),
    Sprite: G.Sprite || (typeof THREE !== 'undefined' ? THREE.Sprite : class {
      constructor(mat) {
        this.material = mat;
        this.scale = { setScalar() {} };
        this.position = { copy() {} };
        this.visible = false;
      }
    }),
    SpriteMaterial: G.SpriteMaterial || (typeof THREE !== 'undefined' ? THREE.SpriteMaterial : class {
      constructor(opt = {}) { Object.assign(this, opt); }
    }),
    CanvasTexture: G.CanvasTexture || (typeof THREE !== 'undefined' ? THREE.CanvasTexture : class {
      constructor(c) { this.canvas = c; }
    }),
    Vector3: G.Vector3 || (typeof THREE !== 'undefined' ? THREE.Vector3 : class {
      constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
      copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
      distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
      lerpVectors(v1, v2, alpha) {
        this.x = v1.x + (v2.x - v1.x) * alpha;
        this.y = v1.y + (v2.y - v1.y) * alpha;
        this.z = v1.z + (v2.z - v1.z) * alpha;
        return this;
      }
      length() { return Math.hypot(this.x, this.y, this.z); }
      subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
      crossVectors(a, b) {
        const ax = a.x, ay = a.y, az = a.z, bx = b.x, by = b.y, bz = b.z;
        this.x = ay * bz - az * by;
        this.y = az * bx - ax * bz;
        this.z = ax * by - ay * bx;
        return this;
      }
      normalize() {
        const l = Math.hypot(this.x, this.y, this.z);
        if (l > 1e-6) { this.x /= l; this.y /= l; this.z /= l; }
        return this;
      }
      lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
      set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
      multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
    }),
    Color: G.Color || (typeof THREE !== 'undefined' ? THREE.Color : class {
      constructor(hex) { this.hex = hex; }
    }),
    MathUtils: G.MathUtils || (typeof THREE !== 'undefined' ? THREE.MathUtils : {
      clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
      lerp: (a, b, t) => a + (b - a) * t
    }),
    DynamicDrawUsage: G.DynamicDrawUsage ?? 35048,
    AdditiveBlending: G.AdditiveBlending ?? 2,
    DoubleSide: G.DoubleSide ?? 2,
    NormalBlending: G.NormalBlending ?? 1,
    SRGBColorSpace: G.SRGBColorSpace ?? 'srgb'
  };
}

export function createSpeedTrailGlowTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.28, "rgba(220,239,255,0.82)");
  gradient.addColorStop(0.7, "rgba(139,190,255,0.18)");
  gradient.addColorStop(1, "rgba(100,160,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);

  const { CanvasTexture, SRGBColorSpace } = resolveContext();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export class SpeedTrail {
  constructor() {
    const ctx = resolveContext();
    const {
      Group,
      BufferGeometry,
      BufferAttribute,
      ShaderMaterial,
      Mesh,
      Sprite,
      SpriteMaterial,
      Vector3,
      Color,
      DynamicDrawUsage,
      AdditiveBlending,
      DoubleSide,
      NormalBlending
    } = ctx;

    this.object = new Group();
    this.geometry = new BufferGeometry();
    this.points = [];
    this.pointPool = Array.from({ length: SPEED_TRAIL_MAX_POINTS }, () => ({
      position: new Vector3(),
      age: 0
    }));

    this.positions = new Float32Array(SPEED_TRAIL_MAX_VERTICES * 2 * 3);
    this.across = new Float32Array(SPEED_TRAIL_MAX_VERTICES * 2);
    this.lifeAlpha = new Float32Array(SPEED_TRAIL_MAX_VERTICES * 2);
    this.indices = new Uint16Array((SPEED_TRAIL_MAX_VERTICES - 1) * 6);

    this.positionAttribute = new BufferAttribute(this.positions, 3);
    this.lifeAlphaAttribute = new BufferAttribute(this.lifeAlpha, 1);

    this.sourcePosition = new Vector3();
    this.previousSourcePosition = new Vector3();
    this.cameraPosition = new Vector3();
    this.tangent = new Vector3();
    this.viewDirection = new Vector3();
    this.side = new Vector3();
    this.fallbackAxis = new Vector3(0, 1, 0);

    this.hasSourcePosition = false;
    this.emissionClock = 0;
    this.opacity = 0;
    this.hasSpawnedStartupGlow = false;
    this.activationGlowAge = SPEED_TRAIL_ACTIVATION_GLOW_DURATION;
    this.timeDilation = 1;
    this.geometryDirty = true;

    this.object.name = "ball-speed-trail";
    this.material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: NormalBlending,
      uniforms: {
        uOpacity: { value: 0 },
        uColor: { value: new Color(15398399) }
      },
      vertexShader: SPEED_TRAIL_VERTEX_SHADER,
      fragmentShader: SPEED_TRAIL_FRAGMENT_SHADER
    });
    this.material.toneMapped = true;

    for (let i = 0; i < SPEED_TRAIL_MAX_VERTICES; i++) {
      this.across[i * 2] = -1;
      this.across[i * 2 + 1] = 1;
    }
    for (let i = 0; i < SPEED_TRAIL_MAX_VERTICES - 1; i++) {
      const idx = i * 6;
      const v = i * 2;
      this.indices[idx] = v;
      this.indices[idx + 1] = v + 2;
      this.indices[idx + 2] = v + 1;
      this.indices[idx + 3] = v + 1;
      this.indices[idx + 4] = v + 2;
      this.indices[idx + 5] = v + 3;
    }

    this.positionAttribute.setUsage(DynamicDrawUsage);
    this.lifeAlphaAttribute.setUsage(DynamicDrawUsage);

    this.geometry.setAttribute("position", this.positionAttribute);
    this.geometry.setAttribute("aAcross", new BufferAttribute(this.across, 1));
    this.geometry.setAttribute("aLifeAlpha", this.lifeAlphaAttribute);
    this.geometry.setIndex(new BufferAttribute(this.indices, 1));
    this.geometry.setDrawRange(0, 0);

    this.ribbon = new Mesh(this.geometry, this.material);
    this.ribbon.name = "SpeedTrail_PS-ribbon";
    this.ribbon.visible = false;
    this.ribbon.frustumCulled = false;
    this.ribbon.renderOrder = 1;

    const glowTexture = createSpeedTrailGlowTexture();
    const glowMaterial = new SpriteMaterial({
      map: glowTexture,
      color: 15332863,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: true
    });

    this.activationGlow = new Sprite(glowMaterial);
    this.activationGlow.name = "SpeedTrail_PS-activation-glow";
    if (this.activationGlow.scale?.setScalar) {
      this.activationGlow.scale.setScalar(SPEED_TRAIL_ACTIVATION_GLOW_SCALE);
    }
    this.activationGlow.visible = false;
    this.activationGlow.renderOrder = 2;

    this.object.add(this.ribbon, this.activationGlow);
  }

  reset() {
    while (this.points.length > 0) {
      this.pointPool.push(this.points.pop());
    }
    this.emissionClock = 0;
    this.hasSourcePosition = false;
    this.opacity = 0;
    this.geometry.setDrawRange(0, 0);
    this.geometryDirty = true;
  }

  update(sourcePos, velocity, dt) {
    const { MathUtils } = resolveContext();
    const clampedDt = Math.max(0, Math.min(dt, 0.1));
    const speed = velocity.length();
    const isSupersonic = speed >= SPEED_TRAIL_THRESHOLD_SPEED;

    this.timeDilation = MathUtils.clamp(speed / SPEED_TRAIL_THRESHOLD_SPEED, 1, SPEED_TRAIL_MAX_TIME_DILATION);
    const targetOpacity = isSupersonic ? 1 : 0;

    this.opacity += (targetOpacity - this.opacity) * Math.min(1, clampedDt * SPEED_TRAIL_OPACITY_LERP_RATE);
    if (Math.abs(this.opacity - targetOpacity) < 5e-4) {
      this.opacity = targetOpacity;
    }
    if (this.material?.uniforms?.uOpacity) {
      this.material.uniforms.uOpacity.value = this.opacity * SPEED_TRAIL_MAX_OPACITY;
    }

    if (!this.hasSourcePosition) {
      this.sourcePosition.copy(sourcePos);
      this.previousSourcePosition.copy(sourcePos);
      this.hasSourcePosition = true;
    }

    if (sourcePos.distanceTo(this.previousSourcePosition) > SPEED_TRAIL_TELEPORT_RESET_DISTANCE) {
      while (this.points.length > 0) {
        this.pointPool.push(this.points.pop());
      }
      this.emissionClock = 0;
      this.previousSourcePosition.copy(sourcePos);
    }

    const scaledDeltaTime = clampedDt * this.timeDilation;
    for (let i = 0; i < this.points.length; i++) {
      this.points[i].age += scaledDeltaTime;
    }
    while (this.points.length && this.points[this.points.length - 1].age >= SPEED_TRAIL_MAX_POINT_AGE) {
      this.pointPool.push(this.points.pop());
    }

    if (isSupersonic) {
      this.emissionClock += scaledDeltaTime;
      const interval = 1 / SPEED_TRAIL_EMISSION_RATE;
      while (this.emissionClock >= interval) {
        this.emissionClock -= interval;
        const subTime = this.emissionClock / this.timeDilation;
        const factor = clampedDt > 0 ? MathUtils.clamp(1 - subTime / clampedDt, 0, 1) : 1;
        const pt = this.points.length >= SPEED_TRAIL_MAX_POINTS ? this.points.pop() : this.pointPool.pop();
        pt.position.lerpVectors(this.previousSourcePosition, sourcePos, factor);
        pt.age = this.emissionClock;
        this.points.unshift(pt);
      }
    }

    this.sourcePosition.copy(sourcePos);
    this.previousSourcePosition.copy(sourcePos);

    if (!this.hasSpawnedStartupGlow) {
      this.hasSpawnedStartupGlow = true;
      this.activationGlowAge = 0;
      if (this.activationGlow.position?.copy) {
        this.activationGlow.position.copy(sourcePos);
      }
      this.activationGlow.visible = true;
    }

    if (this.activationGlowAge < SPEED_TRAIL_ACTIVATION_GLOW_DURATION) {
      this.activationGlowAge += scaledDeltaTime;
      const progress = MathUtils.clamp(this.activationGlowAge / SPEED_TRAIL_ACTIVATION_GLOW_DURATION, 0, 1);
      if (this.activationGlow.material) {
        this.activationGlow.material.opacity = (1 - progress) * (1 - progress);
      }
      this.activationGlow.visible = progress < 1;
    } else {
      this.activationGlow.visible = false;
    }

    this.ribbon.visible = this.opacity > 0.002 && this.points.length > 0;
    this.geometryDirty = true;
  }

  prepare(camera) {
    this.rebuildGeometry(camera);
  }

  rebuildGeometry(camera) {
    if (!this.geometryDirty || !this.ribbon.visible) return;
    this.geometryDirty = false;

    const count = this.points.length + 1;
    if (count < 2) {
      this.geometry.setDrawRange(0, 0);
      return;
    }

    if (camera?.getWorldPosition) {
      camera.getWorldPosition(this.cameraPosition);
    }
    const halfWidth = SPEED_TRAIL_RIBBON_WIDTH * 0.5;

    for (let i = 0; i < count; i++) {
      const prevPt = i === 0 ? null : this.points[i - 1];
      const pos = (prevPt?.position) || this.sourcePosition;
      const prevIdx = Math.max(0, i - 1);
      const nextIdx = Math.min(count - 1, i + 1);
      const prevPos = prevIdx === 0 ? this.sourcePosition : this.points[prevIdx - 1].position;
      const nextPos = nextIdx === 0 ? this.sourcePosition : this.points[nextIdx - 1].position;

      this.tangent.subVectors(nextPos, prevPos).normalize();
      this.viewDirection.subVectors(this.cameraPosition, pos).normalize();
      this.side.crossVectors(this.tangent, this.viewDirection);
      if (this.side.lengthSq() < 1e-6) {
        this.side.crossVectors(this.tangent, this.fallbackAxis);
        if (this.side.lengthSq() < 1e-6) {
          this.side.set(1, 0, 0);
        }
      }
      this.side.normalize().multiplyScalar(halfWidth);

      const { MathUtils } = resolveContext();
      const age = prevPt?.age || 0;
      const lifeFade = Math.pow(1 - MathUtils.clamp(age / SPEED_TRAIL_MAX_POINT_AGE, 0, 1), 1.35);

      for (let sideIdx = 0; sideIdx < 2; sideIdx++) {
        const vertexIndex = i * 2 + sideIdx;
        const sign = sideIdx === 0 ? -1 : 1;
        this.positions[vertexIndex * 3] = pos.x + this.side.x * sign;
        this.positions[vertexIndex * 3 + 1] = pos.y + this.side.y * sign;
        this.positions[vertexIndex * 3 + 2] = pos.z + this.side.z * sign;
        this.lifeAlpha[vertexIndex] = lifeFade;
      }
    }

    this.positionAttribute.needsUpdate = true;
    this.lifeAlphaAttribute.needsUpdate = true;
    this.geometry.setDrawRange(0, (count - 1) * 6);
  }
}

// Backward-compatibility aliases
export {
  SpeedTrail as pS,
  createSpeedTrailGlowTexture as fS,
  SPEED_TRAIL_THRESHOLD_SPEED as Mp,
  SPEED_TRAIL_OPACITY_LERP_RATE as oS,
  SPEED_TRAIL_MAX_TIME_DILATION as AS,
  SPEED_TRAIL_EMISSION_RATE as lS,
  SPEED_TRAIL_MAX_POINT_AGE as Bp,
  SPEED_TRAIL_RIBBON_WIDTH as cS,
  SPEED_TRAIL_MAX_OPACITY as hS,
  SPEED_TRAIL_MAX_POINTS as zh,
  SPEED_TRAIL_MAX_VERTICES as Es,
  SPEED_TRAIL_TELEPORT_RESET_DISTANCE as dS,
  SPEED_TRAIL_ACTIVATION_GLOW_DURATION as Cc,
  SPEED_TRAIL_ACTIVATION_GLOW_SCALE as uS
};
