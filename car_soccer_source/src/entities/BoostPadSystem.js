/**
 * BoostPadSystem.js
 * Manages the 34 RocketSim boost pads (6 Large 100-boost pads + 28 Small 12-boost pads).
 * Controls visual representation, active/idle pad swapping, dynamic state buffer polling,
 * and procedural fallback geometries when OBJ models are missing.
 */

export const BOOST_PAD_BIG_HEIGHT = 30;
export const BOOST_PAD_SMALL_HEIGHT = 15;
export const BOOST_PAD_BIG_RADIUS = 80;
export const BOOST_PAD_SMALL_RADIUS = 40;
export const BOOST_PAD_BASE_HEIGHT = 4;

let boostPadThreeContext = {
  Group: null,
  Mesh: null,
  CylinderGeometry: null,
  MeshBasicMaterial: null,
  MeshStandardMaterial: null,
  multiThemeMaterial: null,
  cloneMaterial: null,
  markMatrixDirty: null
};

export function setBoostPadThreeContext(context) {
  boostPadThreeContext = { ...boostPadThreeContext, ...context };
}

function resolveContext() {
  const G = boostPadThreeContext;
  return {
    Group: G.Group || (typeof THREE !== 'undefined' ? THREE.Group : class {
      constructor() {
        this.children = [];
        this.position = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
      }
      add(...items) { this.children.push(...items); }
    }),
    Mesh: G.Mesh || (typeof THREE !== 'undefined' ? THREE.Mesh : class {
      constructor(geo, mat) {
        this.geometry = geo;
        this.material = mat;
        this.visible = true;
        this.position = { y: 0 };
        this.rotation = { x: 0 };
      }
      clone() { return new this.constructor(this.geometry, this.material); }
    }),
    CylinderGeometry: G.CylinderGeometry || (typeof THREE !== 'undefined' ? THREE.CylinderGeometry : class {}),
    MeshBasicMaterial: G.MeshBasicMaterial || (typeof THREE !== 'undefined' ? THREE.MeshBasicMaterial : class {
      constructor(opt = {}) { Object.assign(this, opt); }
    }),
    MeshStandardMaterial: G.MeshStandardMaterial || (typeof THREE !== 'undefined' ? THREE.MeshStandardMaterial : class {
      constructor(opt = {}) { Object.assign(this, opt); }
    }),
    multiThemeMaterial: G.multiThemeMaterial || null,
    cloneMaterial: G.cloneMaterial || null,
    markMatrixDirty: G.markMatrixDirty || null
  };
}

export function createFallbackPadMeshes(isBig) {
  const { Mesh, CylinderGeometry, MeshStandardMaterial, multiThemeMaterial, cloneMaterial } = resolveContext();
  const radius = isBig ? BOOST_PAD_BIG_RADIUS : BOOST_PAD_SMALL_RADIUS;
  const height = isBig ? BOOST_PAD_BIG_HEIGHT : BOOST_PAD_SMALL_HEIGHT;

  const fullMat = (typeof multiThemeMaterial === "function") ? multiThemeMaterial(
    cloneMaterial ? cloneMaterial({ color: 16750126, emissive: 5579776 }) : new MeshStandardMaterial({ color: 16750126, emissive: 5579776 }),
    new MeshStandardMaterial({
      color: 16750126,
      emissive: 5579776,
      roughness: 0.55,
      metalness: 0.25
    })
  ) : new MeshStandardMaterial({
    color: 16750126,
    emissive: 5579776,
    roughness: 0.55,
    metalness: 0.25
  });

  const fullMesh = new Mesh(
    new CylinderGeometry(radius, radius, height, 12),
    fullMat
  );
  fullMesh.position.y = height / 2;

  const baseMat = (typeof multiThemeMaterial === "function") ? multiThemeMaterial(
    cloneMaterial ? cloneMaterial({ color: 2111056 }) : new MeshStandardMaterial({ color: 2111056 }),
    new MeshStandardMaterial({
      color: 2111056,
      roughness: 0.5,
      metalness: 0.5
    })
  ) : new MeshStandardMaterial({
    color: 2111056,
    roughness: 0.5,
    metalness: 0.5
  });

  const baseMesh = new Mesh(
    new CylinderGeometry(radius, radius, BOOST_PAD_BASE_HEIGHT, 12),
    baseMat
  );
  baseMesh.position.y = 2;

  return { full: fullMesh, base: baseMesh };
}

export class BoostPadSystem {
  constructor() {
    this.pads = [];
  }

  /**
   * Initializes boost pad meshes from loaded pad templates or fallback geometries.
   * @param {Array<{pos: number[], isBig: boolean}>} padsData
   * @param {Object} [padTemplates] { bigFull, bigBase, smallFull, smallBase }
   * @param {Object} [scene]
   * @param {Function} [onPadMeshAdded]
   */
  addPads(padsData, padTemplates = null, scene = null, onPadMeshAdded = null) {
    const { Group } = resolveContext();
    this.pads.length = 0;

    for (const data of padsData) {
      let fullMesh, baseMesh;
      if (padTemplates) {
        const srcFull = data.isBig ? padTemplates.bigFull : padTemplates.smallFull;
        const srcBase = data.isBig ? padTemplates.bigBase : padTemplates.smallBase;
        fullMesh = (typeof srcFull?.clone === "function") ? srcFull.clone() : srcFull;
        baseMesh = (typeof srcBase?.clone === "function") ? srcBase.clone() : srcBase;
      } else {
        const fallbacks = createFallbackPadMeshes(data.isBig);
        fullMesh = fallbacks.full;
        baseMesh = fallbacks.base;
      }

      const padGroup = new Group();
      padGroup.position.set(data.pos[0], 0, data.pos[1]);
      padGroup.add(fullMesh, baseMesh);
      baseMesh.visible = false;

      if (typeof onPadMeshAdded === 'function') {
        onPadMeshAdded(padGroup);
      } else {
        const { markMatrixDirty } = resolveContext();
        if (typeof markMatrixDirty === 'function') {
          markMatrixDirty(padGroup);
        }
      }

      this.pads.push({
        full: fullMesh,
        base: baseMesh,
        group: padGroup,
        isBig: data.isBig,
        pos: data.pos
      });

      if (scene && typeof scene.add === 'function') {
        scene.add(padGroup);
      }
    }
  }

  /**
   * Updates visibility of active (full) vs respawning (base) pad meshes based on state buffer.
   * @param {Float32Array|Array} stateBuffer
   * @param {number} boostPadStatesOffset
   */
  update(stateBuffer, boostPadStatesOffset) {
    if (!stateBuffer || boostPadStatesOffset === undefined) return;
    for (let i = 0; i < this.pads.length; i++) {
      const isActive = stateBuffer[boostPadStatesOffset + i * 2] === 1;
      this.pads[i].full.visible = isActive;
      this.pads[i].base.visible = !isActive;
    }
  }
}
