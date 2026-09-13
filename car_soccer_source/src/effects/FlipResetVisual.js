/**
 * FlipResetVisual.js
 * Flip reset visual indicator attached to vehicle chassis.
 * Displays an arcade starburst ring or realistic shockwave pulse along with spark particles.
 */

import { FlipResetAudio } from '../audio/GameAudioSubsystem.js';
import { getTheme } from '../ui/ThemeManager.js';

export const RESET_INDICATOR_HEIGHT = -12;
export const RESET_PULSE_DURATION = 0.24;
export const RESET_SPARKS_DELAY = 0.05;
export const RESET_SPARKS_DURATION = 0.18;
export const RESET_SPARKS_COUNT = 8;
export const RESET_ARCADE_COLOR_HEX = 16773836; // 0xFFF12C

let flipResetThreeContext = {
  Group: null,
  MeshBasicMaterial: null,
  Mesh: null,
  RingGeometry: null,
  BufferGeometry: null,
  BufferAttribute: null,
  Points: null,
  PlaneGeometry: null,
  SphereGeometry: null,
  Shape: null,
  ShapeGeometry: null,
  ShaderMaterial: null,
  Color: null,
  Vector4: null,
  MathUtils: null,
  AdditiveBlending: 2,
  DoubleSide: 2
};

export function setFlipResetThreeContext(context) {
  flipResetThreeContext = { ...flipResetThreeContext, ...context };
}

function resolveContext() {
  const G = flipResetThreeContext;
  return {
    Group: G.Group || (typeof THREE !== 'undefined' ? THREE.Group : class { constructor() { this.children = []; this.visible = true; this.position = { y: 0 }; } add(c) { this.children.push(c); } traverse(fn) { fn(this); this.children.forEach(c => c.traverse?.(fn)); } }),
    MeshBasicMaterial: G.MeshBasicMaterial || (typeof THREE !== 'undefined' ? THREE.MeshBasicMaterial : class { constructor(opt = {}) { Object.assign(this, opt); this.color = { set() {}, setRGB() {} }; } clone() { return new this.constructor(this); } }),
    Mesh: G.Mesh || (typeof THREE !== 'undefined' ? THREE.Mesh : class { constructor(geo, mat) { this.geometry = geo; this.material = mat; this.rotation = { x: 0, z: 0 }; this.position = { y: 0 }; this.scale = { setScalar() {} }; } add(c) {} }),
    RingGeometry: G.RingGeometry || (typeof THREE !== 'undefined' ? THREE.RingGeometry : class {}),
    BufferGeometry: G.BufferGeometry || (typeof THREE !== 'undefined' ? THREE.BufferGeometry : class { constructor() { this.attributes = {}; } setAttribute(k, v) { this.attributes[k] = v; } }),
    BufferAttribute: G.BufferAttribute || (typeof THREE !== 'undefined' ? THREE.BufferAttribute : class { constructor(arr, itemSize) { this.array = arr; this.itemSize = itemSize; this.needsUpdate = false; } }),
    Points: G.Points || (typeof THREE !== 'undefined' ? THREE.Points : class { constructor(geo, mat) { this.geometry = geo; this.material = mat; } }),
    PlaneGeometry: G.PlaneGeometry || (typeof THREE !== 'undefined' ? THREE.PlaneGeometry : class {}),
    SphereGeometry: G.SphereGeometry || (typeof THREE !== 'undefined' ? THREE.SphereGeometry : class {}),
    Shape: G.Shape || (typeof THREE !== 'undefined' ? THREE.Shape : class { moveTo() {} lineTo() {} closePath() {} }),
    ShapeGeometry: G.ShapeGeometry || (typeof THREE !== 'undefined' ? THREE.ShapeGeometry : class {}),
    ShaderMaterial: G.ShaderMaterial || (typeof THREE !== 'undefined' ? THREE.ShaderMaterial : class { constructor(opt = {}) { Object.assign(this, opt); this.uniforms = this.uniforms || {}; } }),
    Color: G.Color || (typeof THREE !== 'undefined' ? THREE.Color : class { constructor(h) { this.hex = h; } setRGB() { return this; } }),
    Vector4: G.Vector4 || (typeof THREE !== 'undefined' ? THREE.Vector4 : class { constructor(x = 0, y = 0, z = 0, w = 0) { this.x = x; this.y = y; this.z = z; this.w = w; } }),
    MathUtils: G.MathUtils || (typeof THREE !== 'undefined' ? THREE.MathUtils : { clamp: (v, min, max) => Math.max(min, Math.min(max, v)) }),
    AdditiveBlending: G.AdditiveBlending ?? 2,
    DoubleSide: G.DoubleSide ?? 2
  };
}

export function createStarShapeGeometry() {
  const { Shape, ShapeGeometry } = resolveContext();
  const shape = new Shape();
  for (let e = 0; e < 8; e++) {
    const angle = Math.PI / 2 + (e * Math.PI) / 4;
    const radius = e % 2 === 0 ? 1 : 0.25;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (e === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return new ShapeGeometry(shape);
}

export function createSparksMaterial() {
  const { ShaderMaterial } = resolveContext();
  return new ShaderMaterial({
    name: "Arcade / reset sparkles",
    uniforms: {
      opacity: { value: 0 },
      size: { value: 20 },
      viewportHeight: { value: 1 },
      realistic: { value: 0 }
    },
    vertexShader: `
      #include <common>
      uniform float size;
      uniform float viewportHeight;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        gl_PointSize = size * projectionMatrix[1][1] * viewportHeight * 0.5;
        if (isPerspectiveMatrix(projectionMatrix)) gl_PointSize /= max(1.0, -viewPosition.z);
      }
    `,
    fragmentShader: `
      uniform float opacity;
      uniform float realistic;
      void main() {
        vec2 p = abs(gl_PointCoord * 2.0 - 1.0);
        float d = sqrt(p.x) + sqrt(p.y);
        float aa = max(fwidth(d), 0.02);
        float alpha = (1.0 - smoothstep(1.0 - aa, 1.0 + aa, d)) * opacity;
        float inside = 1.0 - smoothstep(0.74 - aa, 0.74 + aa, d);
        vec3 color = mix(vec3(0.02, 0.15, 0.38), vec3(1.8, 1.6, 1.0), inside);
        if (realistic > 0.5) {
          float glow = exp(-dot(p, p) * 7.0);
          float streak = exp(-p.x * p.x * 170.0 - p.y * p.y * 5.0)
            + exp(-p.y * p.y * 170.0 - p.x * p.x * 5.0);
          alpha = (glow * 0.65 + streak * 0.35) * opacity;
          color = vec3(0.72, 1.0, 0.82);
        }
        if (alpha < 0.003) discard;
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    toneMapped: true
  });
}

export function enableLayerOne(object) {
  if (object && typeof object.traverse === 'function') {
    object.traverse(e => e.layers?.enable?.(1));
  }
}

export function createSoftGlowMaterial(color) {
  const { ShaderMaterial, AdditiveBlending, DoubleSide } = resolveContext();
  return new ShaderMaterial({
    name: "Realistic / reset glow",
    uniforms: {
      color: { value: color },
      opacity: { value: 0 }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      uniform float opacity;
      varying vec2 vUv;
      void main() {
        float radius = length(vUv * 2.0 - 1.0);
        float glow = mix(1.0, 0.72, smoothstep(0.0, 0.46, radius));
        glow = mix(glow, 0.18, smoothstep(0.46, 0.72, radius));
        glow *= 1.0 - smoothstep(0.72, 1.0, radius);
        gl_FragColor = vec4(color, opacity * glow);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: true
  });
}

export class FlipResetVisual {
  constructor(parentObject) {
    const ctx = resolveContext();
    const {
      Group,
      MeshBasicMaterial,
      Mesh,
      RingGeometry,
      BufferGeometry,
      BufferAttribute,
      Points,
      PlaneGeometry,
      SphereGeometry,
      Color,
      Vector4,
      DoubleSide,
      AdditiveBlending
    } = ctx;

    this.root = new Group();
    this.root.name = "flip-reset-indicator";
    this.root.position.y = RESET_INDICATOR_HEIGHT;
    this.root.visible = false;
    if (parentObject && typeof parentObject.add === 'function') {
      parentObject.add(this.root);
    }

    this.viewportRect = new Vector4();
    this.sparkPositions = new Float32Array(RESET_SPARKS_COUNT * 3);
    this.sparkOrigins = new Float32Array(RESET_SPARKS_COUNT * 3);
    this.sparkVelocities = new Float32Array(RESET_SPARKS_COUNT * 3);
    this.audio = new FlipResetAudio();
    this.previousResetSerial = null;
    this.elapsed = Infinity;

    const baseMaterial = new MeshBasicMaterial({
      name: "Arcade / reset ring",
      color: new Color(RESET_ARCADE_COLOR_HEX),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: DoubleSide,
      toneMapped: true
    });

    this.ring = new Mesh(new RingGeometry(0.83, 1, 48), baseMaterial);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 9;
    this.root.add(this.ring);

    this.core = new Mesh(createStarShapeGeometry(), baseMaterial.clone());
    this.core.material?.color?.setRGB?.(1.6, 1.4, 0.9);
    this.core.rotation.x = -Math.PI / 2;
    this.core.position.y = 0.5;
    this.core.renderOrder = 10;
    this.root.add(this.core);

    this.outlineMaterial = baseMaterial.clone();
    this.outlineMaterial.color?.set?.(1460613);

    const outlineMesh = new Mesh(new RingGeometry(0.78, 1.05, 48), this.outlineMaterial);
    outlineMesh.renderOrder = 8;
    this.ring.add(outlineMesh);

    this.sparksGeometry = new BufferGeometry();
    this.sparksGeometry.setAttribute("position", new BufferAttribute(this.sparkPositions, 3));
    this.sparksMaterial = createSparksMaterial();
    this.sparks = new Points(this.sparksGeometry, this.sparksMaterial);
    this.sparks.onBeforeRender = (renderer) => {
      if (renderer?.getCurrentViewport) {
        renderer.getCurrentViewport(this.viewportRect);
        if (this.sparksMaterial?.uniforms?.viewportHeight) {
          this.sparksMaterial.uniforms.viewportHeight.value = this.viewportRect.w;
        }
      }
    };
    this.sparks.frustumCulled = false;
    this.sparks.renderOrder = 10;
    this.root.add(this.sparks);

    const softColor = new Color().setRGB(0.72, 1, 0.82);
    const planeGeo = new PlaneGeometry(2, 2);

    this.realistic = new Group();
    this.realistic.name = "realistic-reset-pulse";
    this.realistic.visible = false;

    this.softRing = new Mesh(planeGeo, createSoftGlowMaterial(softColor));
    this.softRing.rotation.x = -Math.PI / 2;
    this.softRing.renderOrder = 8;

    this.softCore = new Mesh(planeGeo, createSoftGlowMaterial(new Color(16777215)));
    this.softCore.rotation.x = -Math.PI / 2;
    this.softCore.position.y = 0.5;
    this.softCore.renderOrder = 9;

    this.softDome = new Mesh(
      new SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
      new MeshBasicMaterial({
        name: "Realistic / reset dome",
        color: softColor,
        opacity: 0,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide
      })
    );
    this.softDome.renderOrder = 8;

    this.realistic.add(this.softRing, this.softCore, this.softDome);
    this.root.add(this.realistic);

    enableLayerOne(this.root);
  }

  preloadAudio() {
    return this.audio.preload();
  }

  get bloomActive() {
    return this.root.visible;
  }

  update(dt, resetSerial, isAlive) {
    const isNewReset = this.previousResetSerial !== null && resetSerial !== this.previousResetSerial && isAlive;
    this.previousResetSerial = resetSerial;
    if (isNewReset) {
      this.play();
      return;
    }

    if (Number.isFinite(this.elapsed)) {
      this.elapsed += dt;
      if (this.elapsed >= RESET_PULSE_DURATION || !isAlive) {
        this.stopVisual();
        return;
      }
      this.updateVisual();
    }
  }

  play(playSound = true) {
    this.elapsed = 0;
    this.root.visible = true;
    this.seedSparks();
    if (playSound) {
      this.audio.play();
    }
    this.updateVisual();
  }

  seedSparks() {
    for (let e = 0; e < RESET_SPARKS_COUNT; e += 1) {
      const idx = e * 3;
      const angle = ((e + Math.random() * 0.25) / RESET_SPARKS_COUNT) * Math.PI * 2;
      const radius = 42 + Math.random() * 8;
      const speed = 100 + Math.random() * 60;
      const height = -4 + Math.random() * 8;

      this.sparkOrigins[idx] = Math.cos(angle) * radius;
      this.sparkOrigins[idx + 1] = height;
      this.sparkOrigins[idx + 2] = Math.sin(angle) * radius;

      this.sparkVelocities[idx] = Math.cos(angle) * speed;
      this.sparkVelocities[idx + 1] = 25 + Math.random() * 45;
      this.sparkVelocities[idx + 2] = Math.sin(angle) * speed;

      this.sparkPositions[idx] = this.sparkOrigins[idx];
      this.sparkPositions[idx + 1] = this.sparkOrigins[idx + 1];
      this.sparkPositions[idx + 2] = this.sparkOrigins[idx + 2];
    }
    if (this.sparksGeometry?.attributes?.position) {
      this.sparksGeometry.attributes.position.needsUpdate = true;
    }
  }

  updateVisual() {
    const isRealistic = (typeof getTheme === 'function' && getTheme() === "realistic");
    this.ring.visible = !isRealistic;
    this.core.visible = !isRealistic;
    this.realistic.visible = isRealistic;

    if (this.sparksMaterial?.uniforms?.realistic) {
      this.sparksMaterial.uniforms.realistic.value = isRealistic ? 1 : 0;
    }

    const { MathUtils } = resolveContext();
    const progress = MathUtils.clamp(this.elapsed / RESET_PULSE_DURATION, 0, 1);
    const alphaFade = Math.pow(1 - progress, 1.65);
    const scaleFactor = 1 - Math.pow(1 - progress, 3);

    this.ring.scale?.setScalar?.(48 + scaleFactor * 58);
    if (this.ring?.material) this.ring.material.opacity = 0.62 * alphaFade;
    if (this.outlineMaterial) this.outlineMaterial.opacity = 0.8 * alphaFade;

    this.core.scale?.setScalar?.(28 + scaleFactor * 26);
    this.core.rotation.z = scaleFactor * 0.3;
    if (this.core?.material) this.core.material.opacity = 0.72 * Math.pow(1 - progress, 2.5);

    this.softRing.scale?.setScalar?.(48 + scaleFactor * 74);
    if (this.softRing?.material?.uniforms?.opacity) {
      this.softRing.material.uniforms.opacity.value = 0.62 * alphaFade;
    }

    this.softCore.scale?.setScalar?.(28 + scaleFactor * 58);
    if (this.softCore?.material?.uniforms?.opacity) {
      this.softCore.material.uniforms.opacity.value = (this.core?.material?.opacity ?? 0);
    }

    this.softDome.scale?.setScalar?.(4.5 + scaleFactor * 8.5);
    if (this.softDome?.material) {
      this.softDome.material.opacity = 0.44 * alphaFade;
    }

    const sparkElapsed = this.elapsed - RESET_SPARKS_DELAY;
    const sparkAlpha = MathUtils.clamp(sparkElapsed / RESET_SPARKS_DURATION, 0, 1);
    const sparksActive = sparkElapsed >= 0 && sparkElapsed < RESET_SPARKS_DURATION;
    this.sparks.visible = sparksActive;

    if (sparksActive) {
      const gravity = -280 * sparkElapsed * sparkElapsed;
      for (let i = 0; i < RESET_SPARKS_COUNT; i += 1) {
        const idx = i * 3;
        this.sparkPositions[idx] = this.sparkOrigins[idx] + this.sparkVelocities[idx] * sparkElapsed;
        this.sparkPositions[idx + 1] = this.sparkOrigins[idx + 1] + this.sparkVelocities[idx + 1] * sparkElapsed + gravity;
        this.sparkPositions[idx + 2] = this.sparkOrigins[idx + 2] + this.sparkVelocities[idx + 2] * sparkElapsed;
      }
      if (this.sparksMaterial?.uniforms?.opacity) {
        this.sparksMaterial.uniforms.opacity.value = 1 - sparkAlpha * sparkAlpha;
      }
      if (this.sparksMaterial?.uniforms?.size) {
        this.sparksMaterial.uniforms.size.value = 20 * (1 - sparkAlpha * 0.65);
      }
      if (this.sparksGeometry?.attributes?.position) {
        this.sparksGeometry.attributes.position.needsUpdate = true;
      }
    }
  }

  stopVisual() {
    this.elapsed = Infinity;
    this.root.visible = false;
    this.sparks.visible = false;
    if (this.ring?.material) this.ring.material.opacity = 0;
    if (this.core?.material) this.core.material.opacity = 0;
    if (this.outlineMaterial) this.outlineMaterial.opacity = 0;
    if (this.sparksMaterial?.uniforms?.opacity) this.sparksMaterial.uniforms.opacity.value = 0;
    if (this.softRing?.material?.uniforms?.opacity) this.softRing.material.uniforms.opacity.value = 0;
    if (this.softCore?.material?.uniforms?.opacity) this.softCore.material.uniforms.opacity.value = 0;
    if (this.softDome?.material) this.softDome.material.opacity = 0;
  }
}

// Backward-compatibility aliases
export {
  FlipResetVisual as xw,
  createStarShapeGeometry as _w,
  createSparksMaterial as Ew,
  enableLayerOne as yw,
  createSoftGlowMaterial as Jp,
  RESET_INDICATOR_HEIGHT as mw,
  RESET_PULSE_DURATION as Vp,
  RESET_SPARKS_DELAY as gw,
  RESET_SPARKS_DURATION as Wp,
  RESET_SPARKS_COUNT as ys
};
