/**
 * src/utils/BufferGeometryUtils.js
 * BufferGeometry Utilities & Geometry Post-Processing (Phase 7.8 Deobfuscation)
 *
 * Provides vertex welding (mergeVertices), multi-mesh geometry consolidation (mergeGeometries),
 * draw mode conversion (toTrianglesDrawMode), and skeleton hierarchy cloning (cloneSkinnedMesh).
 * Used extensively in StadiumArena and ArenaWorld for stadium bank meshing and goal frame consolidation.
 *
 * Upstream deobfuscated symbols:
 * - hl -> mergeGeometries
 * - Xf -> computeInterleavedAttributes (helper for mergeGeometries/attributes)
 * - hb -> mergeVertices
 * - Jf -> toTrianglesDrawMode
 * - db -> cloneSkinnedMesh (SkeletonUtils.clone)
 * - T0 -> traverseHierarchy
 */

// Draw Mode Constants (matching Three.js core)
export const TrianglesDrawMode = 0;
export const TriangleStripDrawMode = 1;
export const TriangleFanDrawMode = 2;

// Dependency Injection Context
let geometryThreeContext = {
  BufferGeometry: null,
  BufferAttribute: null,
  TrianglesDrawMode: 0,
  TriangleStripDrawMode: 1,
  TriangleFanDrawMode: 2
};

export function setBufferGeometryUtilsThreeContext(context) {
  if (!context) return;
  const descriptors = Object.getOwnPropertyDescriptors(context);
  Object.defineProperties(geometryThreeContext, descriptors);
}

export function resolveGeometryContext() {
  const C = geometryThreeContext;

  class FallbackBufferAttribute {
    constructor(array, itemSize, normalized = false) {
      this.array = array;
      this.itemSize = itemSize;
      this.count = array ? array.length / itemSize : 0;
      this.normalized = normalized;
      this.isBufferAttribute = true;
    }
    getX(index) { return this.array[index * this.itemSize]; }
    getY(index) { return this.array[index * this.itemSize + 1]; }
    getZ(index) { return this.array[index * this.itemSize + 2]; }
    getW(index) { return this.array[index * this.itemSize + 3]; }
    setX(index, val) { this.array[index * this.itemSize] = val; return this; }
    setY(index, val) { this.array[index * this.itemSize + 1] = val; return this; }
    setZ(index, val) { this.array[index * this.itemSize + 2] = val; return this; }
    setW(index, val) { this.array[index * this.itemSize + 3] = val; return this; }
    setComponent(index, component, val) { this.array[index * this.itemSize + component] = val; }
    getComponent(index, component) { return this.array[index * this.itemSize + component]; }
  }

  class FallbackBufferGeometry {
    constructor() {
      this.attributes = {};
      this.morphAttributes = {};
      this.index = null;
      this.groups = [];
      this.morphTargetsRelative = false;
      this.isBufferGeometry = true;
    }
    getIndex() { return this.index; }
    setIndex(index) {
      if (Array.isArray(index)) {
        this.index = new FallbackBufferAttribute(new Uint32Array(index), 1);
      } else {
        this.index = index;
      }
      return this;
    }
    getAttribute(name) { return this.attributes[name]; }
    setAttribute(name, attribute) {
      this.attributes[name] = attribute;
      return this;
    }
    addGroup(start, count, materialIndex = 0) {
      this.groups.push({ start, count, materialIndex });
    }
    clearGroups() {
      this.groups = [];
    }
    clone() {
      const g = new FallbackBufferGeometry();
      for (const k in this.attributes) {
        const a = this.attributes[k];
        g.setAttribute(k, new a.constructor(a.array.slice(), a.itemSize, a.normalized));
      }
      if (this.index) {
        g.setIndex(new this.index.constructor(this.index.array.slice(), this.index.itemSize));
      }
      g.morphTargetsRelative = this.morphTargetsRelative;
      for (const k in this.morphAttributes) {
        g.morphAttributes[k] = this.morphAttributes[k].map(
          a => new a.constructor(a.array.slice(), a.itemSize, a.normalized)
        );
      }
      return g;
    }
  }

  return {
    BufferGeometry: C.BufferGeometry || FallbackBufferGeometry,
    BufferAttribute: C.BufferAttribute || FallbackBufferAttribute,
    TrianglesDrawMode: C.TrianglesDrawMode ?? TrianglesDrawMode,
    TriangleStripDrawMode: C.TriangleStripDrawMode ?? TriangleStripDrawMode,
    TriangleFanDrawMode: C.TriangleFanDrawMode ?? TriangleFanDrawMode
  };
}

/**
 * Merges a set of attributes into a single attribute.
 * @param {Array<BufferAttribute>} attributes
 * @returns {BufferAttribute|null}
 */
export function computeInterleavedAttributes(attributes) {
  let arrayType, itemSize, normalized, gpuType = -1, totalLength = 0;
  for (let i = 0; i < attributes.length; ++i) {
    const attr = attributes[i];
    if (arrayType === undefined) arrayType = attr.array.constructor;
    if (arrayType !== attr.array.constructor) {
      console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.array must be of consistent array types across matching attributes.");
      return null;
    }
    if (itemSize === undefined) itemSize = attr.itemSize;
    if (itemSize !== attr.itemSize) {
      console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.itemSize must be consistent across matching attributes.");
      return null;
    }
    if (normalized === undefined) normalized = attr.normalized;
    if (normalized !== attr.normalized) {
      console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.normalized must be consistent across matching attributes.");
      return null;
    }
    if (gpuType === -1 && attr.gpuType !== undefined) gpuType = attr.gpuType;
    if (gpuType !== -1 && attr.gpuType !== undefined && gpuType !== attr.gpuType) {
      console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.gpuType must be consistent across matching attributes.");
      return null;
    }
    totalLength += attr.count * itemSize;
  }

  const { BufferAttribute } = resolveGeometryContext();
  const mergedArray = new arrayType(totalLength);
  const result = new BufferAttribute(mergedArray, itemSize, normalized);
  let offset = 0;

  for (let i = 0; i < attributes.length; ++i) {
    const attr = attributes[i];
    if (attr.isInterleavedBufferAttribute) {
      const baseIndex = offset / itemSize;
      for (let c = 0, count = attr.count; c < count; c++) {
        for (let p = 0; p < itemSize; p++) {
          result.setComponent(c + baseIndex, p, attr.getComponent(c, p));
        }
      }
    } else {
      const expectedLength = attr.count * itemSize;
      const srcArray = attr.array.length === expectedLength ? attr.array : attr.array.subarray(0, expectedLength);
      mergedArray.set(srcArray, offset);
    }
    offset += attr.count * itemSize;
  }

  if (gpuType !== -1 && gpuType !== undefined) {
    result.gpuType = gpuType;
  }
  return result;
}

/**
 * Merges an array of geometries into a single BufferGeometry.
 * @param {Array<BufferGeometry>} geometries
 * @param {boolean} useGroups
 * @returns {BufferGeometry|null}
 */
export function mergeGeometries(geometries, useGroups = false) {
  if (!geometries || geometries.length === 0) return null;

  const isIndexed = geometries[0].index !== null;
  const attributeNames = new Set(Object.keys(geometries[0].attributes));
  const morphAttributeNames = new Set(Object.keys(geometries[0].morphAttributes || {}));
  const collectedAttributes = {};
  const collectedMorphAttributes = {};
  const morphTargetsRelative = geometries[0].morphTargetsRelative;

  const { BufferGeometry } = resolveGeometryContext();
  const mergedGeometry = new BufferGeometry();
  let groupOffset = 0;

  for (let i = 0; i < geometries.length; ++i) {
    const geom = geometries[i];
    let matchedAttrs = 0;

    if (isIndexed !== (geom.index !== null)) {
      console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " + i + ". All geometries must have compatible attributes; make sure index attribute exists among all geometries, or in none of them.");
      return null;
    }

    for (const name in geom.attributes) {
      if (!attributeNames.has(name)) {
        console.error('THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index ' + i + '. All geometries must have compatible attributes; make sure "' + name + '" attribute exists among all geometries, or in none of them.');
        return null;
      }
      if (collectedAttributes[name] === undefined) collectedAttributes[name] = [];
      collectedAttributes[name].push(geom.attributes[name]);
      matchedAttrs++;
    }

    if (matchedAttrs !== attributeNames.size) {
      console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " + i + ". Make sure all geometries have the same number of attributes.");
      return null;
    }

    if (morphTargetsRelative !== geom.morphTargetsRelative) {
      console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " + i + ". .morphTargetsRelative must be consistent throughout all geometries.");
      return null;
    }

    for (const name in geom.morphAttributes) {
      if (!morphAttributeNames.has(name)) {
        console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " + i + ".  .morphAttributes must be consistent throughout all geometries.");
        return null;
      }
      if (collectedMorphAttributes[name] === undefined) collectedMorphAttributes[name] = [];
      collectedMorphAttributes[name].push(geom.morphAttributes[name]);
    }

    if (useGroups) {
      let count;
      if (isIndexed) {
        count = geom.index.count;
      } else if (geom.attributes.position !== undefined) {
        count = geom.attributes.position.count;
      } else {
        console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " + i + ". The geometry must have either an index or a position attribute");
        return null;
      }
      mergedGeometry.addGroup(groupOffset, count, i);
      groupOffset += count;
    }
  }

  // Merge indices
  if (isIndexed) {
    let indexOffset = 0;
    const mergedIndices = [];
    for (let i = 0; i < geometries.length; ++i) {
      const idx = geometries[i].index;
      for (let p = 0; p < idx.count; ++p) {
        mergedIndices.push(idx.getX(p) + indexOffset);
      }
      indexOffset += geometries[i].attributes.position.count;
    }
    mergedGeometry.setIndex(mergedIndices);
  }

  // Merge attributes
  for (const name in collectedAttributes) {
    const attr = computeInterleavedAttributes(collectedAttributes[name]);
    if (!attr) {
      console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the " + name + " attribute.");
      return null;
    }
    mergedGeometry.setAttribute(name, attr);
  }

  // Merge morph attributes
  for (const name in collectedMorphAttributes) {
    const numTargets = collectedMorphAttributes[name][0].length;
    if (numTargets !== 0) {
      mergedGeometry.morphAttributes = mergedGeometry.morphAttributes || {};
      mergedGeometry.morphAttributes[name] = [];
      for (let t = 0; t < numTargets; ++t) {
        const targetAttrs = [];
        for (let g = 0; g < collectedMorphAttributes[name].length; ++g) {
          targetAttrs.push(collectedMorphAttributes[name][g][t]);
        }
        const mergedMorph = computeInterleavedAttributes(targetAttrs);
        if (!mergedMorph) {
          console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the " + name + " morphAttribute.");
          return null;
        }
        mergedGeometry.morphAttributes[name].push(mergedMorph);
      }
    }
  }

  return mergedGeometry;
}

/**
 * Welds coincident vertices within a specified tolerance distance.
 * @param {BufferGeometry} geometry
 * @param {number} tolerance
 * @returns {BufferGeometry}
 */
export function mergeVertices(geometry, tolerance = 1e-4) {
  tolerance = Math.max(tolerance, Number.EPSILON);
  const hashToIndex = {};
  const index = geometry.getIndex();
  const position = geometry.getAttribute("position");
  if (!position) return geometry;

  const vertexCount = index ? index.count : position.count;
  let uniqueVertexCount = 0;
  const attributeKeys = Object.keys(geometry.attributes);
  const newAttributes = {};
  const newMorphAttributes = {};
  const newIndices = [];
  const getMethods = ["getX", "getY", "getZ", "getW"];
  const setMethods = ["setX", "setY", "setZ", "setW"];

  for (let i = 0, len = attributeKeys.length; i < len; i++) {
    const key = attributeKeys[i];
    const attr = geometry.attributes[key];
    newAttributes[key] = new attr.constructor(new attr.array.constructor(attr.count * attr.itemSize), attr.itemSize, attr.normalized);
    const morphs = geometry.morphAttributes && geometry.morphAttributes[key];
    if (morphs) {
      newMorphAttributes[key] = [];
      morphs.forEach((m) => {
        const arr = new m.array.constructor(m.count * m.itemSize);
        newMorphAttributes[key].push(new m.constructor(arr, m.itemSize, m.normalized));
      });
    }
  }

  const halfTolerance = tolerance * 0.5;
  const exponent = Math.log10(1 / tolerance);
  const multiplier = Math.pow(10, exponent);
  const offset = halfTolerance * multiplier;

  for (let i = 0; i < vertexCount; i++) {
    const vertexIndex = index ? index.getX(i) : i;
    let hash = "";

    for (let k = 0, klen = attributeKeys.length; k < klen; k++) {
      const key = attributeKeys[k];
      const attr = geometry.getAttribute(key);
      const itemSize = attr.itemSize;
      for (let c = 0; c < itemSize; c++) {
        hash += `${~~(attr[getMethods[c]](vertexIndex) * multiplier + offset)},`;
      }
    }

    if (hash in hashToIndex) {
      newIndices.push(hashToIndex[hash]);
    } else {
      for (let k = 0, klen = attributeKeys.length; k < klen; k++) {
        const key = attributeKeys[k];
        const attr = geometry.getAttribute(key);
        const morphs = geometry.morphAttributes && geometry.morphAttributes[key];
        const itemSize = attr.itemSize;
        const targetAttr = newAttributes[key];
        const targetMorph = newMorphAttributes[key];

        for (let c = 0; c < itemSize; c++) {
          const getter = getMethods[c];
          const setter = setMethods[c];
          targetAttr[setter](uniqueVertexCount, attr[getter](vertexIndex));
          if (morphs) {
            for (let m = 0, mlen = morphs.length; m < mlen; m++) {
              targetMorph[m][setter](uniqueVertexCount, morphs[m][getter](vertexIndex));
            }
          }
        }
      }
      hashToIndex[hash] = uniqueVertexCount;
      newIndices.push(uniqueVertexCount);
      uniqueVertexCount++;
    }
  }

  const cloned = geometry.clone();
  for (const key in geometry.attributes) {
    const attr = newAttributes[key];
    cloned.setAttribute(key, new attr.constructor(attr.array.slice(0, uniqueVertexCount * attr.itemSize), attr.itemSize, attr.normalized));
    if (key in newMorphAttributes) {
      for (let m = 0; m < newMorphAttributes[key].length; m++) {
        const morph = newMorphAttributes[key][m];
        cloned.morphAttributes[key][m] = new morph.constructor(morph.array.slice(0, uniqueVertexCount * morph.itemSize), morph.itemSize, morph.normalized);
      }
    }
  }

  return cloned.setIndex(newIndices), cloned;
}

/**
 * Converts a geometry from TriangleStripDrawMode or TriangleFanDrawMode into TrianglesDrawMode.
 * @param {BufferGeometry} geometry
 * @param {number} drawMode
 * @returns {BufferGeometry}
 */
export function toTrianglesDrawMode(geometry, drawMode) {
  const { TrianglesDrawMode, TriangleStripDrawMode, TriangleFanDrawMode } = resolveGeometryContext();

  if (drawMode === TrianglesDrawMode) {
    console.warn("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Geometry already defined as triangles.");
    return geometry;
  }

  if (drawMode === TriangleFanDrawMode || drawMode === TriangleStripDrawMode) {
    let index = geometry.getIndex();
    if (index === null) {
      const indices = [];
      const position = geometry.getAttribute("position");
      if (position !== undefined) {
        for (let i = 0; i < position.count; i++) indices.push(i);
        geometry.setIndex(indices);
        index = geometry.getIndex();
      } else {
        console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Undefined position attribute. Processing not possible.");
        return geometry;
      }
    }

    const numTriangles = index.count - 2;
    const triangles = [];

    if (drawMode === TriangleFanDrawMode) {
      for (let i = 1; i <= numTriangles; i++) {
        triangles.push(index.getX(0), index.getX(i), index.getX(i + 1));
      }
    } else {
      for (let i = 0; i < numTriangles; i++) {
        if (i % 2 === 0) {
          triangles.push(index.getX(i), index.getX(i + 1), index.getX(i + 2));
        } else {
          triangles.push(index.getX(i + 2), index.getX(i + 1), index.getX(i));
        }
      }
    }

    if (triangles.length / 3 !== numTriangles) {
      console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unable to generate correct amount of triangles.");
    }

    const cloned = geometry.clone();
    cloned.setIndex(triangles);
    cloned.clearGroups();
    return cloned;
  } else {
    console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unknown draw mode:", drawMode);
    return geometry;
  }
}

/**
 * Recursively pairs nodes between two object hierarchies.
 */
export function traverseHierarchy(source, target, callback) {
  callback(source, target);
  for (let i = 0; i < source.children.length; i++) {
    traverseHierarchy(source.children[i], target.children[i], callback);
  }
}

/**
 * Clones a SkinnedMesh hierarchy, rebinding bones and skeleton clones properly.
 * @param {Object3D} source
 * @returns {Object3D}
 */
export function cloneSkinnedMesh(source) {
  const cloneToSourceMap = new Map();
  const sourceToCloneMap = new Map();
  const cloned = source.clone();

  traverseHierarchy(source, cloned, function (s, c) {
    cloneToSourceMap.set(c, s);
    sourceToCloneMap.set(s, c);
  });

  cloned.traverse(function (node) {
    if (!node.isSkinnedMesh) return;
    const src = cloneToSourceMap.get(node);
    const origBones = src.skeleton.bones;
    node.skeleton = src.skeleton.clone();
    node.bindMatrix.copy(src.bindMatrix);
    node.skeleton.bones = origBones.map(function (bone) {
      return sourceToCloneMap.get(bone);
    });
    node.bind(node.skeleton, node.bindMatrix);
  });

  return cloned;
}

// Backward-Compatibility Aliases
export {
  mergeGeometries as hl,
  computeInterleavedAttributes as Xf,
  mergeVertices as hb,
  toTrianglesDrawMode as Jf,
  cloneSkinnedMesh as db,
  traverseHierarchy as T0
};
