/**
 * src/loaders/OBJLoader.js
 * Wavefront .obj 3D Model Loader (Phase 7.8 Deobfuscation)
 *
 * Provides parsing and loading of Wavefront .obj geometry assets, used for arena stadium
 * components, goals, and vehicles in Three.js.
 *
 * Upstream deobfuscated symbols:
 * - cb -> OBJLoader
 * - lb -> OBJParser
 */

// Regex patterns for OBJ line parsing
const OBJECT_GROUP_REGEX = /^[og]\s*(.+)?/;
const MTLLIB_REGEX = /^mtllib /;
const USEMTL_REGEX = /^usemtl /;
const USEMAP_REGEX = /^usemap /;
const WHITESPACE_REGEX = /\s+/;

export const SRGBColorSpace = 'srgb';

// Three.js Dependency Injection Context
let objThreeContext = {
  Loader: null,
  FileLoader: null,
  DefaultLoadingManager: null,
  Group: null,
  Mesh: null,
  LineSegments: null,
  Points: null,
  BufferGeometry: null,
  Float32BufferAttribute: null,
  LineBasicMaterial: null,
  PointsMaterial: null,
  MeshPhongMaterial: null,
  Vector3: null,
  Color: null,
  SRGBColorSpace: 'srgb'
};

export function setOBJLoaderThreeContext(context) {
  if (!context) return;
  const descriptors = Object.getOwnPropertyDescriptors(context);
  Object.defineProperties(objThreeContext, descriptors);
}

/**
 * Creates a default loading manager conforming to Three.js LoadingManager interface.
 */
export function createDefaultLoadingManager() {
  const abortCtrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  return {
    isLoading: false,
    itemsLoaded: 0,
    itemsTotal: 0,
    itemStart() {},
    itemEnd() {},
    itemError() {},
    resolveURL(url) {
      return typeof url === 'string' ? url.normalize('NFC') : url;
    },
    setURLModifier(fn) {
      this.resolveURL = (url) => {
        const norm = typeof url === 'string' ? url.normalize('NFC') : url;
        return fn ? fn(norm) : norm;
      };
      return this;
    },
    get abortController() {
      return this._abortController || (this._abortController = (typeof AbortController !== 'undefined' ? new AbortController() : null));
    },
    _abortController: abortCtrl
  };
}

export function resolveOBJContext() {
  const C = objThreeContext;

  class FallbackLoader {
    constructor(manager) {
      this.manager = manager || C.DefaultLoadingManager || createDefaultLoadingManager();
      if (typeof this.manager.resolveURL !== 'function') {
        this.manager.resolveURL = (url) => (typeof url === 'string' ? url.normalize('NFC') : url);
      }
      if (!this.manager.abortController && typeof AbortController !== 'undefined') {
        try {
          this.manager.abortController = new AbortController();
        } catch (e) {}
      }
      this.path = '';
      this.resourcePath = '';
      this.requestHeader = {};
      this.withCredentials = false;
    }
    setPath(path) { this.path = path; return this; }
    setResourcePath(resourcePath) { this.resourcePath = resourcePath; return this; }
    setRequestHeader(header) { this.requestHeader = header; return this; }
    setWithCredentials(val) { this.withCredentials = val; return this; }
    loadAsync(url, onProgress) {
      return new Promise((resolve, reject) => {
        this.load(url, resolve, onProgress, reject);
      });
    }
  }

  class FallbackFileLoader extends FallbackLoader {
    load(url, onLoad, onProgress, onError) {
      const resolvedUrl = (this.manager && typeof this.manager.resolveURL === 'function')
        ? this.manager.resolveURL(this.path + url)
        : (this.path + url);
      if (typeof fetch !== 'undefined') {
        fetch(resolvedUrl)
          .then((r) => r.text())
          .then(onLoad)
          .catch(onError);
      }
    }
  }

  class FallbackGroup {
    constructor() {
      this.name = '';
      this.children = [];
      this.materialLibraries = [];
      this.isGroup = true;
      this.rotation = { x: 0, y: 0, z: 0 };
    }
    add(...items) {
      this.children.push(...items);
      items.forEach(child => { if (child) child.parent = this; });
      return this;
    }
    clone() {
      const g = new FallbackGroup();
      g.name = this.name;
      g.rotation = { ...this.rotation };
      g.children = this.children.map(c => (typeof c?.clone === 'function' ? c.clone() : c));
      return g;
    }
    traverse(fn) {
      fn(this);
      this.children.forEach(c => c?.traverse?.(fn));
    }
  }

  class FallbackMesh {
    constructor(geometry, material) {
      this.name = '';
      this.geometry = geometry;
      this.material = material;
      this.isMesh = true;
    }
    clone() {
      const m = new FallbackMesh(this.geometry, this.material);
      m.name = this.name;
      return m;
    }
    traverse(fn) {
      fn(this);
    }
  }

  class FallbackLineSegments {
    constructor(geometry, material) {
      this.name = '';
      this.geometry = geometry;
      this.material = material;
      this.isLineSegments = true;
    }
  }

  class FallbackPoints {
    constructor(geometry, material) {
      this.name = '';
      this.geometry = geometry;
      this.material = material;
      this.isPoints = true;
    }
  }

  class FallbackBufferAttribute {
    constructor(array, itemSize) {
      this.array = array instanceof Array ? new Float32Array(array) : array;
      this.itemSize = itemSize;
      this.count = this.array.length / itemSize;
    }
  }

  class FallbackBufferGeometry {
    constructor() {
      this.attributes = {};
      this.groups = [];
    }
    setAttribute(name, attr) {
      this.attributes[name] = attr;
      return this;
    }
    addGroup(start, count, materialIndex = 0) {
      this.groups.push({ start, count, materialIndex });
    }
  }

  class FallbackMaterial {
    constructor(params = {}) {
      this.name = params.name || '';
      this.color = { r: 1, g: 1, b: 1, copy(c) { this.r = c.r; this.g = c.g; this.b = c.b; } };
      Object.assign(this, params);
    }
  }

  class FallbackVector3 {
    constructor(x = 0, y = 0, z = 0) {
      this.x = x; this.y = y; this.z = z;
    }
    fromArray(arr, offset = 0) {
      this.x = arr[offset];
      this.y = arr[offset + 1];
      this.z = arr[offset + 2];
      return this;
    }
    subVectors(a, b) {
      this.x = a.x - b.x;
      this.y = a.y - b.y;
      this.z = a.z - b.z;
      return this;
    }
    cross(v) {
      const ax = this.x, ay = this.y, az = this.z;
      const bx = v.x, by = v.y, bz = v.z;
      this.x = ay * bz - az * by;
      this.y = az * bx - ax * bz;
      this.z = ax * by - ay * bx;
      return this;
    }
    normalize() {
      const len = Math.hypot(this.x, this.y, this.z) || 1;
      this.x /= len; this.y /= len; this.z /= len;
      return this;
    }
    copy(v) {
      this.x = v.x; this.y = v.y; this.z = v.z;
      return this;
    }
  }

  class FallbackColor {
    constructor(r = 1, g = 1, b = 1) {
      this.r = r; this.g = g; this.b = b;
    }
    setRGB(r, g, b, colorSpace) {
      this.r = r; this.g = g; this.b = b;
      return this;
    }
    copy(c) {
      this.r = c.r; this.g = c.g; this.b = c.b;
      return this;
    }
  }

  return {
    Loader: C.Loader || FallbackLoader,
    FileLoader: C.FileLoader || FallbackFileLoader,
    Group: C.Group || FallbackGroup,
    Mesh: C.Mesh || FallbackMesh,
    LineSegments: C.LineSegments || FallbackLineSegments,
    Points: C.Points || FallbackPoints,
    BufferGeometry: C.BufferGeometry || FallbackBufferGeometry,
    Float32BufferAttribute: C.Float32BufferAttribute || FallbackBufferAttribute,
    LineBasicMaterial: C.LineBasicMaterial || FallbackMaterial,
    PointsMaterial: C.PointsMaterial || FallbackMaterial,
    MeshPhongMaterial: C.MeshPhongMaterial || FallbackMaterial,
    Vector3: C.Vector3 || FallbackVector3,
    Color: C.Color || FallbackColor,
    SRGBColorSpace: C.SRGBColorSpace || SRGBColorSpace
  };
}

/**
 * Internal stateful parser for Wavefront .obj tokens.
 */
export function OBJParser() {
  const ctx = resolveOBJContext();
  const vA = new ctx.Vector3();
  const vB = new ctx.Vector3();
  const vC = new ctx.Vector3();
  const vD = new ctx.Vector3();
  const vE = new ctx.Vector3();

  const state = {
    objects: [],
    object: {},
    vertices: [],
    normals: [],
    colors: [],
    uvs: [],
    materials: {},
    materialLibraries: [],

    startObject: function (name, fromDeclaration) {
      if (this.object && this.object.fromDeclaration === false) {
        this.object.name = name;
        this.object.fromDeclaration = fromDeclaration !== false;
        return;
      }

      const prevMat = this.object && typeof this.object.currentMaterial === 'function'
        ? this.object.currentMaterial()
        : undefined;

      if (this.object && typeof this.object._finalize === 'function') {
        this.object._finalize(true);
      }

      this.object = {
        name: name || '',
        fromDeclaration: fromDeclaration !== false,
        geometry: {
          vertices: [],
          normals: [],
          colors: [],
          uvs: [],
          hasUVIndices: false
        },
        materials: [],
        smooth: true,

        startMaterial: function (matName, libraries) {
          const prev = this._finalize(false);
          if (prev && (prev.inherited || prev.groupCount <= 0)) {
            this.materials.splice(prev.index, 1);
          }
          const m = {
            index: this.materials.length,
            name: matName || '',
            mtllib: Array.isArray(libraries) && libraries.length > 0 ? libraries[libraries.length - 1] : '',
            smooth: prev !== undefined ? prev.smooth : this.smooth,
            groupStart: prev !== undefined ? prev.groupEnd : 0,
            groupEnd: -1,
            groupCount: -1,
            inherited: false,
            clone: function (idx) {
              const cl = {
                index: typeof idx === 'number' ? idx : this.index,
                name: this.name,
                mtllib: this.mtllib,
                smooth: this.smooth,
                groupStart: 0,
                groupEnd: -1,
                groupCount: -1,
                inherited: false
              };
              cl.clone = this.clone.bind(cl);
              return cl;
            }
          };
          this.materials.push(m);
          return m;
        },

        currentMaterial: function () {
          if (this.materials.length > 0) return this.materials[this.materials.length - 1];
        },

        _finalize: function (endObject) {
          const cur = this.currentMaterial();
          if (cur && cur.groupEnd === -1) {
            cur.groupEnd = this.geometry.vertices.length / 3;
            cur.groupCount = cur.groupEnd - cur.groupStart;
            cur.inherited = false;
          }
          if (endObject && this.materials.length > 1) {
            for (let i = this.materials.length - 1; i >= 0; i--) {
              if (this.materials[i].groupCount <= 0) {
                this.materials.splice(i, 1);
              }
            }
          }
          if (endObject && this.materials.length === 0) {
            this.materials.push({
              name: '',
              smooth: this.smooth
            });
          }
          return cur;
        }
      };

      if (prevMat && prevMat.name && typeof prevMat.clone === 'function') {
        const clonedMat = prevMat.clone(0);
        clonedMat.inherited = true;
        this.object.materials.push(clonedMat);
      }

      this.objects.push(this.object);
    },

    finalize: function () {
      if (this.object && typeof this.object._finalize === 'function') {
        this.object._finalize(true);
      }
    },

    parseVertexIndex: function (val, total) {
      const idx = parseInt(val, 10);
      return (idx >= 0 ? idx - 1 : idx + total / 3) * 3;
    },

    parseNormalIndex: function (val, total) {
      const idx = parseInt(val, 10);
      return (idx >= 0 ? idx - 1 : idx + total / 3) * 3;
    },

    parseUVIndex: function (val, total) {
      const idx = parseInt(val, 10);
      return (idx >= 0 ? idx - 1 : idx + total / 2) * 2;
    },

    addVertex: function (a, b, c) {
      const src = this.vertices;
      const dst = this.object.geometry.vertices;
      dst.push(src[a], src[a + 1], src[a + 2]);
      dst.push(src[b], src[b + 1], src[b + 2]);
      dst.push(src[c], src[c + 1], src[c + 2]);
    },

    addVertexPoint: function (a) {
      const src = this.vertices;
      this.object.geometry.vertices.push(src[a], src[a + 1], src[a + 2]);
    },

    addVertexLine: function (a) {
      const src = this.vertices;
      this.object.geometry.vertices.push(src[a], src[a + 1], src[a + 2]);
    },

    addNormal: function (a, b, c) {
      const src = this.normals;
      const dst = this.object.geometry.normals;
      dst.push(src[a], src[a + 1], src[a + 2]);
      dst.push(src[b], src[b + 1], src[b + 2]);
      dst.push(src[c], src[c + 1], src[c + 2]);
    },

    addFaceNormal: function (a, b, c) {
      const verts = this.vertices;
      const norms = this.object.geometry.normals;
      vA.fromArray(verts, a);
      vB.fromArray(verts, b);
      vC.fromArray(verts, c);
      vE.subVectors(vC, vB);
      vD.subVectors(vA, vB);
      vE.cross(vD);
      vE.normalize();
      norms.push(vE.x, vE.y, vE.z);
      norms.push(vE.x, vE.y, vE.z);
      norms.push(vE.x, vE.y, vE.z);
    },

    addColor: function (a, b, c) {
      const src = this.colors;
      const dst = this.object.geometry.colors;
      if (src[a] !== undefined) dst.push(src[a], src[a + 1], src[a + 2]);
      if (src[b] !== undefined) dst.push(src[b], src[b + 1], src[b + 2]);
      if (src[c] !== undefined) dst.push(src[c], src[c + 1], src[c + 2]);
    },

    addUV: function (a, b, c) {
      const src = this.uvs;
      const dst = this.object.geometry.uvs;
      dst.push(src[a], src[a + 1]);
      dst.push(src[b], src[b + 1]);
      dst.push(src[c], src[c + 1]);
    },

    addDefaultUV: function () {
      const dst = this.object.geometry.uvs;
      dst.push(0, 0, 0, 0, 0, 0);
    },

    addUVLine: function (a) {
      const src = this.uvs;
      this.object.geometry.uvs.push(src[a], src[a + 1]);
    },

    addFace: function (v0, v1, v2, uv0, uv1, uv2, n0, n1, n2) {
      const vLen = this.vertices.length;
      let i0 = this.parseVertexIndex(v0, vLen);
      let i1 = this.parseVertexIndex(v1, vLen);
      let i2 = this.parseVertexIndex(v2, vLen);

      this.addVertex(i0, i1, i2);
      this.addColor(i0, i1, i2);

      if (n0 !== undefined && n0 !== '') {
        const nLen = this.normals.length;
        i0 = this.parseNormalIndex(n0, nLen);
        i1 = this.parseNormalIndex(n1, nLen);
        i2 = this.parseNormalIndex(n2, nLen);
        this.addNormal(i0, i1, i2);
      } else {
        this.addFaceNormal(i0, i1, i2);
      }

      if (uv0 !== undefined && uv0 !== '') {
        const uvLen = this.uvs.length;
        i0 = this.parseUVIndex(uv0, uvLen);
        i1 = this.parseUVIndex(uv1, uvLen);
        i2 = this.parseUVIndex(uv2, uvLen);
        this.addUV(i0, i1, i2);
        this.object.geometry.hasUVIndices = true;
      } else {
        this.addDefaultUV();
      }
    },

    addPointGeometry: function (pts) {
      this.object.geometry.type = 'Points';
      const vLen = this.vertices.length;
      for (let i = 0, len = pts.length; i < len; i++) {
        const idx = this.parseVertexIndex(pts[i], vLen);
        this.addVertexPoint(idx);
        this.addColor(idx);
      }
    },

    addLineGeometry: function (lines, uvs) {
      this.object.geometry.type = 'Line';
      const vLen = this.vertices.length;
      const uvLen = this.uvs.length;
      for (let i = 0, len = lines.length; i < len; i++) {
        this.addVertexLine(this.parseVertexIndex(lines[i], vLen));
      }
      for (let i = 0, len = uvs.length; i < len; i++) {
        this.addUVLine(this.parseUVIndex(uvs[i], uvLen));
      }
    }
  };

  state.startObject('', false);
  return state;
}

/**
 * Three.js OBJLoader for loading and parsing Wavefront .obj files.
 */
export class OBJLoader {
  constructor(manager) {
    const ctx = resolveOBJContext();
    const LoaderClass = ctx.Loader;
    if (manager !== undefined) {
      this.manager = manager;
    } else if (LoaderClass) {
      try {
        const dummyLoader = new LoaderClass();
        this.manager = dummyLoader.manager;
      } catch (e) {
        this.manager = ctx.DefaultLoadingManager;
      }
    } else if (ctx.DefaultLoadingManager) {
      this.manager = ctx.DefaultLoadingManager;
    }

    if (!this.manager) {
      this.manager = createDefaultLoadingManager();
    } else {
      if (typeof this.manager.resolveURL !== 'function') {
        this.manager.resolveURL = (url) => (typeof url === 'string' ? url.normalize('NFC') : url);
      }
      if (!this.manager.abortController && typeof AbortController !== 'undefined') {
        try {
          this.manager.abortController = new AbortController();
        } catch (e) {}
      }
    }

    this.materials = null;
    this.path = '';
    this.resourcePath = '';
    this.requestHeader = {};
    this.withCredentials = false;
  }

  setPath(path) {
    this.path = path;
    return this;
  }

  setResourcePath(resourcePath) {
    this.resourcePath = resourcePath;
    return this;
  }

  setRequestHeader(header) {
    this.requestHeader = header;
    return this;
  }

  setWithCredentials(value) {
    this.withCredentials = value;
    return this;
  }

  setMaterials(materials) {
    this.materials = materials;
    return this;
  }

  loadAsync(url, onProgress) {
    return new Promise((resolve, reject) => {
      this.load(url, resolve, onProgress, reject);
    });
  }

  load(url, onLoad, onProgress, onError) {
    const { FileLoader } = resolveOBJContext();
    if (this.manager && typeof this.manager.resolveURL !== 'function') {
      this.manager.resolveURL = (u) => (typeof u === 'string' ? u.normalize('NFC') : u);
    }
    const loader = new FileLoader(this.manager);
    loader.setPath(this.path);
    if (typeof loader.setResourcePath === 'function') {
      loader.setResourcePath(this.resourcePath);
    }
    loader.setRequestHeader(this.requestHeader);
    loader.setWithCredentials(this.withCredentials);

    loader.load(
      url,
      (text) => {
        try {
          onLoad(this.parse(text));
        } catch (e) {
          if (onError) onError(e);
          else console.error(e);
          if (this.manager && typeof this.manager.itemError === 'function') {
            this.manager.itemError(url);
          }
        }
      },
      onProgress,
      onError
    );
  }

  parse(text) {
    const ctx = resolveOBJContext();
    const parser = OBJParser();
    const scratchColor = new ctx.Color();

    if (text.indexOf('\r\n') !== -1) text = text.replace(/\r\n/g, '\n');
    if (text.indexOf('\\\n') !== -1) text = text.replace(/\\\n/g, '');

    const lines = text.split('\n');
    let match;

    for (let i = 0, len = lines.length; i < len; i++) {
      const line = lines[i].trimStart();
      if (line.length === 0) continue;

      const firstChar = line.charAt(0);
      if (firstChar === '#') continue;

      if (firstChar === 'v') {
        const parts = line.split(WHITESPACE_REGEX);
        switch (parts[0]) {
          case 'v':
            parser.vertices.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]));
            if (parts.length >= 7) {
              scratchColor.setRGB(parseFloat(parts[4]), parseFloat(parts[5]), parseFloat(parts[6]), ctx.SRGBColorSpace);
              parser.colors.push(scratchColor.r, scratchColor.g, scratchColor.b);
            } else {
              parser.colors.push(undefined, undefined, undefined);
            }
            break;
          case 'vn':
            parser.normals.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]));
            break;
          case 'vt':
            parser.uvs.push(parseFloat(parts[1]), parseFloat(parts[2]));
            break;
        }
      } else if (firstChar === 'f') {
        const rawFaces = line.slice(1).trim().split(WHITESPACE_REGEX);
        const faceVertices = [];
        for (let f = 0; f < rawFaces.length; f++) {
          const item = rawFaces[f];
          if (item.length > 0) faceVertices.push(item.split('/'));
        }
        const v0 = faceVertices[0];
        for (let f = 1; f < faceVertices.length - 1; f++) {
          const v1 = faceVertices[f];
          const v2 = faceVertices[f + 1];
          parser.addFace(v0[0], v1[0], v2[0], v0[1], v1[1], v2[1], v0[2], v1[2], v2[2]);
        }
      } else if (firstChar === 'l') {
        const lineParts = line.substring(1).trim().split(' ');
        let lineIndices = [];
        const uvIndices = [];
        if (line.indexOf('/') === -1) {
          lineIndices = lineParts;
        } else {
          for (let p = 0; p < lineParts.length; p++) {
            const spl = lineParts[p].split('/');
            if (spl[0] !== '') lineIndices.push(spl[0]);
            if (spl[1] !== '') uvIndices.push(spl[1]);
          }
        }
        parser.addLineGeometry(lineIndices, uvIndices);
      } else if (firstChar === 'p') {
        const pts = line.slice(1).trim().split(' ');
        parser.addPointGeometry(pts);
      } else if ((match = OBJECT_GROUP_REGEX.exec(line)) !== null) {
        const objName = (' ' + match[0].slice(1).trim()).slice(1);
        parser.startObject(objName);
      } else if (USEMTL_REGEX.test(line)) {
        parser.object.startMaterial(line.substring(7).trim(), parser.materialLibraries);
      } else if (MTLLIB_REGEX.test(line)) {
        parser.materialLibraries.push(line.substring(7).trim());
      } else if (USEMAP_REGEX.test(line)) {
        console.warn('THREE.OBJLoader: Rendering identifier "usemap" not supported. Textures must be defined in MTL files.');
      } else if (firstChar === 's') {
        const parts = line.split(' ');
        if (parts.length > 1) {
          const val = parts[1].trim().toLowerCase();
          parser.object.smooth = val !== '0' && val !== 'off';
        } else {
          parser.object.smooth = true;
        }
        const curMat = parser.object.currentMaterial();
        if (curMat) curMat.smooth = parser.object.smooth;
      } else {
        if (line === '\0') continue;
        console.warn('THREE.OBJLoader: Unexpected line: "' + line + '"');
      }
    }

    parser.finalize();

    const rootGroup = new ctx.Group();
    rootGroup.materialLibraries = [].concat(parser.materialLibraries);

    const hasMeaningfulObjects = !(parser.objects.length === 1 && parser.objects[0].geometry.vertices.length === 0);

    if (hasMeaningfulObjects) {
      for (let o = 0, oLen = parser.objects.length; o < oLen; o++) {
        const objData = parser.objects[o];
        const geomData = objData.geometry;
        const matConfigs = objData.materials;
        const isLine = geomData.type === 'Line';
        const isPoints = geomData.type === 'Points';
        let hasColors = false;

        if (geomData.vertices.length === 0) continue;

        const geometry = new ctx.BufferGeometry();
        geometry.setAttribute('position', new ctx.Float32BufferAttribute(geomData.vertices, 3));

        if (geomData.normals.length > 0) {
          geometry.setAttribute('normal', new ctx.Float32BufferAttribute(geomData.normals, 3));
        }
        if (geomData.colors.length > 0) {
          hasColors = true;
          geometry.setAttribute('color', new ctx.Float32BufferAttribute(geomData.colors, 3));
        }
        if (geomData.hasUVIndices) {
          geometry.setAttribute('uv', new ctx.Float32BufferAttribute(geomData.uvs, 2));
        }

        const materialsList = [];
        for (let m = 0, mLen = matConfigs.length; m < mLen; m++) {
          const matConfig = matConfigs[m];
          const matKey = matConfig.name + '_' + matConfig.smooth + '_' + hasColors;
          let material = parser.materials[matKey];

          if (this.materials !== null && typeof this.materials.create === 'function') {
            material = this.materials.create(matConfig.name);
            if (isLine && material && !(material instanceof ctx.LineBasicMaterial)) {
              const lineMat = new ctx.LineBasicMaterial();
              lineMat.color.copy(material.color);
              material = lineMat;
            } else if (isPoints && material && !(material instanceof ctx.PointsMaterial)) {
              const ptMat = new ctx.PointsMaterial({ size: 10, sizeAttenuation: false });
              ptMat.color.copy(material.color);
              ptMat.map = material.map;
              material = ptMat;
            }
          }

          if (material === undefined) {
            if (isLine) {
              material = new ctx.LineBasicMaterial();
            } else if (isPoints) {
              material = new ctx.PointsMaterial({ size: 1, sizeAttenuation: false });
            } else {
              material = new ctx.MeshPhongMaterial();
            }
            material.name = matConfig.name;
            material.flatShading = !matConfig.smooth;
            material.vertexColors = hasColors;
            parser.materials[matKey] = material;
          }

          materialsList.push(material);
        }

        let mesh;
        if (materialsList.length > 1) {
          for (let m = 0, mLen = matConfigs.length; m < mLen; m++) {
            const matConfig = matConfigs[m];
            geometry.addGroup(matConfig.groupStart, matConfig.groupCount, m);
          }
          if (isLine) mesh = new ctx.LineSegments(geometry, materialsList);
          else if (isPoints) mesh = new ctx.Points(geometry, materialsList);
          else mesh = new ctx.Mesh(geometry, materialsList);
        } else {
          const singleMat = materialsList[0];
          if (isLine) mesh = new ctx.LineSegments(geometry, singleMat);
          else if (isPoints) mesh = new ctx.Points(geometry, singleMat);
          else mesh = new ctx.Mesh(geometry, singleMat);
        }

        mesh.name = objData.name;
        rootGroup.add(mesh);
      }
    } else if (parser.vertices.length > 0) {
      const ptMat = new ctx.PointsMaterial({ size: 1, sizeAttenuation: false });
      const geometry = new ctx.BufferGeometry();
      geometry.setAttribute('position', new ctx.Float32BufferAttribute(parser.vertices, 3));
      if (parser.colors.length > 0 && parser.colors[0] !== undefined) {
        geometry.setAttribute('color', new ctx.Float32BufferAttribute(parser.colors, 3));
        ptMat.vertexColors = true;
      }
      const points = new ctx.Points(geometry, ptMat);
      rootGroup.add(points);
    }

    return rootGroup;
  }
}

// Backward-Compatibility Aliases
export {
  OBJLoader as cb,
  OBJParser as lb
};
