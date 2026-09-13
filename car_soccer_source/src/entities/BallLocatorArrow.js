/**
 * BallLocatorArrow.js
 * 3D directional arrow hovering above the vehicle pointing towards the ball when Ball Cam is off.
 * Includes distance-based scaling offset, smooth orientation tracking, and clarity halo backdrop.
 */

export const BALL_LOCATOR_MIN_DISTANCE = 100;
export const BALL_LOCATOR_MAX_DISTANCE = 10000;
export const BALL_LOCATOR_MIN_OFFSET = 75;
export const BALL_LOCATOR_MAX_OFFSET = 120;
export const BALL_LOCATOR_HEIGHT_OFFSET = 20;
export const BALL_LOCATOR_HALO_SCALE = 48;

let ballLocatorThreeContext = {
  Group: null,
  CanvasTexture: null,
  Sprite: null,
  SpriteMaterial: null,
  MeshStandardMaterial: null,
  Shape: null,
  ExtrudeGeometry: null,
  Mesh: null,
  Vector3: null,
  MathUtils: null,
  SRGBColorSpace: 'srgb',
  LinearFilter: 1006
};

export function setBallLocatorThreeContext(context) {
  ballLocatorThreeContext = { ...ballLocatorThreeContext, ...context };
}

function resolveContext() {
  const G = ballLocatorThreeContext;
  return {
    Group: G.Group || (typeof THREE !== 'undefined' ? THREE.Group : class {
      constructor() {
        this.children = [];
        this.position = {
          x: 0,
          y: 0,
          z: 0,
          copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; },
          addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
        };
        this.quaternion = { setFromUnitVectors() {} };
        this.visible = false;
      }
      add(c) { this.children.push(c); }
    }),
    CanvasTexture: G.CanvasTexture || (typeof THREE !== 'undefined' ? THREE.CanvasTexture : class { constructor(c) { this.canvas = c; } }),
    Sprite: G.Sprite || (typeof THREE !== 'undefined' ? THREE.Sprite : class { constructor(m) { this.material = m; this.scale = { setScalar() {} }; } }),
    SpriteMaterial: G.SpriteMaterial || (typeof THREE !== 'undefined' ? THREE.SpriteMaterial : class { constructor(opt = {}) { Object.assign(this, opt); } }),
    MeshStandardMaterial: G.MeshStandardMaterial || (typeof THREE !== 'undefined' ? THREE.MeshStandardMaterial : class { constructor(opt = {}) { Object.assign(this, opt); } }),
    Shape: G.Shape || (typeof THREE !== 'undefined' ? THREE.Shape : class { moveTo() {} lineTo() {} closePath() {} }),
    ExtrudeGeometry: G.ExtrudeGeometry || (typeof THREE !== 'undefined' ? THREE.ExtrudeGeometry : class { translate() {} }),
    Mesh: G.Mesh || (typeof THREE !== 'undefined' ? THREE.Mesh : class { constructor(geo, mat) { this.geometry = geo; this.material = mat; } }),
    Vector3: G.Vector3 || (typeof THREE !== 'undefined' ? THREE.Vector3 : class {
      constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
      subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
      length() { return Math.hypot(this.x, this.y, this.z); }
      multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
      copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    }),
    MathUtils: G.MathUtils || (typeof THREE !== 'undefined' ? THREE.MathUtils : {
      clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
      lerp: (a, b, t) => a + (b - a) * t
    }),
    SRGBColorSpace: G.SRGBColorSpace ?? 'srgb',
    LinearFilter: G.LinearFilter ?? 1006
  };
}

export function createBallLocatorHaloTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(0, 0, 0, 0.38)");
  gradient.addColorStop(0.28, "rgba(0, 0, 0, 0.31)");
  gradient.addColorStop(0.58, "rgba(0, 0, 0, 0.16)");
  gradient.addColorStop(0.82, "rgba(0, 0, 0, 0.045)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);

  const { CanvasTexture, SRGBColorSpace, LinearFilter } = resolveContext();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  return texture;
}

export function createBallLocatorHaloSprite() {
  const { Sprite, SpriteMaterial } = resolveContext();
  const texture = createBallLocatorHaloTexture();
  const sprite = new Sprite(
    new SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    })
  );
  sprite.name = "ball-locator-clarity-halo";
  if (sprite.scale?.setScalar) sprite.scale.setScalar(BALL_LOCATOR_HALO_SCALE);
  sprite.renderOrder = 9;
  return sprite;
}

export function createBallLocatorMaterial() {
  const { MeshStandardMaterial } = resolveContext();
  return new MeshStandardMaterial({
    color: 12764618,
    emissive: 4474699,
    emissiveIntensity: 0.5,
    metalness: 0.1,
    roughness: 0.52,
    transparent: true,
    opacity: 0.92,
    depthTest: false,
    depthWrite: false
  });
}

export function createBallLocatorArrowMesh() {
  const { Shape, ExtrudeGeometry, Mesh } = resolveContext();
  const shape = new Shape();
  shape.moveTo(-7, -2.4);
  shape.lineTo(1.5, -2.4);
  shape.lineTo(1.5, -5.2);
  shape.lineTo(8, 0);
  shape.lineTo(1.5, 5.2);
  shape.lineTo(1.5, 2.4);
  shape.lineTo(-7, 2.4);
  shape.closePath();

  const geometry = new ExtrudeGeometry(shape, {
    depth: 4,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.7,
    bevelThickness: 0.7,
    curveSegments: 2
  });
  if (typeof geometry.translate === 'function') {
    geometry.translate(0, 0, -2);
  }

  const mesh = new Mesh(geometry, createBallLocatorMaterial());
  mesh.name = "ball-locator-arrow";
  mesh.renderOrder = 10;
  return mesh;
}

export class BallLocatorArrow {
  constructor() {
    const { Group, Vector3 } = resolveContext();
    this.object = new Group();
    this.object.name = "ball-locator";
    this.object.visible = false;

    this.clarityHalo = createBallLocatorHaloSprite();
    this.visual = createBallLocatorArrowMesh();
    this.direction = new Vector3();
    this.forwardVector = new Vector3(1, 0, 0);

    this.object.add(this.clarityHalo);
    this.object.add(this.visual);
  }

  update(car, ball, isBallCamActive) {
    if (isBallCamActive || !car || car.visible === false) {
      this.object.visible = false;
      return;
    }

    this.direction.subVectors(ball.position, car.position);
    const distance = this.direction.length();
    if (distance < 1e-4) {
      this.object.visible = false;
      return;
    }

    this.direction.multiplyScalar(1 / distance);
    const { MathUtils } = resolveContext();
    const progress = MathUtils.clamp(
      (distance - BALL_LOCATOR_MIN_DISTANCE) / (BALL_LOCATOR_MAX_DISTANCE - BALL_LOCATOR_MIN_DISTANCE),
      0,
      1
    );
    const offset = MathUtils.lerp(BALL_LOCATOR_MIN_OFFSET, BALL_LOCATOR_MAX_OFFSET, progress);

    this.object.visible = true;
    if (this.object.position?.copy) {
      this.object.position.copy(car.position);
      if (this.object.position.addScaledVector) {
        this.object.position.addScaledVector(this.direction, offset);
      }
      this.object.position.y += BALL_LOCATOR_HEIGHT_OFFSET;
    }

    if (this.object.quaternion?.setFromUnitVectors) {
      this.object.quaternion.setFromUnitVectors(this.forwardVector, this.direction);
    }
  }
}

// Backward-compatibility aliases
export {
  BallLocatorArrow as bS,
  createBallLocatorHaloSprite as yS,
  createBallLocatorArrowMesh as CS,
  createBallLocatorMaterial as xS,
  BALL_LOCATOR_MIN_DISTANCE as kp,
  BALL_LOCATOR_MAX_DISTANCE as mS,
  BALL_LOCATOR_MIN_OFFSET as gS,
  BALL_LOCATOR_MAX_OFFSET as vS,
  BALL_LOCATOR_HEIGHT_OFFSET as jS,
  BALL_LOCATOR_HALO_SCALE as _S
};
