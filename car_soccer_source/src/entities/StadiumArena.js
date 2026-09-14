/**
 * Car Soccer Stadium & Boundary Construction Subsystem
 *
 * Implements procedural continuous boundary assembly, goal portals,
 * dual-theme hexagonal bank shading, enclosure grid shaders, and
 * batched stadium architecture loading.
 *
 * Ground truth mappings from dist_game:
 * - WS -> loadStadiumContinuousBoundary
 * - JS -> loadStadiumArchitecture
 * - qS -> splitBoundaryMeshAtHeight
 * - Vh -> createBoundaryPartGeometry
 * - $S -> assembleBakedGeometries
 * - zS -> createBankHexMaterial
 * - VS -> createContinuousGridMaterial
 * - Rp -> createRoundedGoalPath
 * - Pp -> buildGoalMouthPortal
 * - IS, FS, DS, XS, Ip -> stadium material processors
 */

import { resolveContext } from './ArenaWorld.js';

const ARENA_GOAL_DEPTH = 5120;
const ARENA_BOUNDARY_SPLIT_Y = 280;
const TEAM_BLUE_HEX = 2844350;
const TEAM_ORANGE_HEX = 16750126;

const STADIUM_PALETTE = {
  Basalt: 2436921,
  Concrete: 7433570,
  "Inner fascia": 2702664,
  "Tier deck": 4937303,
  Titanium: 7831675,
  Canopy: 9602673,
  "Seat petrol": TEAM_BLUE_HEX,
  "Seat silver": TEAM_ORANGE_HEX,
  "Seat teal": TEAM_ORANGE_HEX,
  "Seat ochre": TEAM_BLUE_HEX
};

const FLAT_STRUCTURE_MATERIALS = new Set(["Basalt", "Concrete", "Inner fascia", "Tier deck"]);

/**
 * Splits boundary mesh triangles across plane Y = splitY (ja = 280uu)
 * Part 0: lower bank (y <= splitY)
 * Part 1: upper walls & ceiling (y >= splitY)
 */
export function splitBoundaryMeshAtHeight(goalData, splitY = ARENA_BOUNDARY_SPLIT_Y) {
  const parts = [
    { positions: [], normals: [], uv: [], indices: [] },
    { positions: [], normals: [], uv: [], indices: [] }
  ];

  if (!goalData || !goalData.positions || !goalData.indices) {
    return parts;
  }

  const getVertex = (idx) => [
    ...goalData.positions.slice(idx * 3, idx * 3 + 3),
    ...goalData.normals.slice(idx * 3, idx * 3 + 3),
    ...goalData.uv.slice(idx * 2, idx * 2 + 2)
  ];

  for (let i = 0; i < goalData.indices.length; i += 3) {
    const tri = [
      getVertex(goalData.indices[i]),
      getVertex(goalData.indices[i + 1]),
      getVertex(goalData.indices[i + 2])
    ];

    for (let side = 0; side < 2; side++) {
      const clippedPoly = [];
      for (let v = 0; v < 3; v++) {
        const v1 = tri[v];
        const v2 = tri[(v + 1) % 3];
        const inside1 = side === 0 ? v1[1] <= splitY : v1[1] >= splitY;
        const inside2 = side === 0 ? v2[1] <= splitY : v2[1] >= splitY;
        if (inside1) clippedPoly.push(v1);
        if (inside1 !== inside2) {
          const t = (splitY - v1[1]) / (v2[1] - v1[1]);
          clippedPoly.push(v1.map((val, idx) => val + (v2[idx] - val) * t));
        }
      }

      const part = parts[side];
      for (let p = 1; p < clippedPoly.length - 1; p++) {
        for (const pt of [clippedPoly[0], clippedPoly[p], clippedPoly[p + 1]]) {
          part.indices.push(part.positions.length / 3);
          part.positions.push(...pt.slice(0, 3));
          part.normals.push(...pt.slice(3, 6));
          part.uv.push(...pt.slice(6, 8));
        }
      }
    }
  }

  return parts;
}

/**
 * Creates BufferGeometry from baked boundary vertex attributes
 */
export function createBoundaryPartGeometry(meshData, resolveContextFn = resolveContext) {
  const { BufferGeometry, BufferAttribute } = resolveContextFn();
  const numVertices = meshData.positions.length / 3;
  if (!Number.isInteger(numVertices) || meshData.normals.length !== numVertices * 3 || meshData.uv.length !== numVertices * 2) {
    throw new Error("Baked stadium boundary has inconsistent vertex attributes");
  }

  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(new Float32Array(meshData.positions), 3));
  geo.setAttribute("normal", new BufferAttribute(new Float32Array(meshData.normals), 3));
  geo.setAttribute("uv", new BufferAttribute(new Float32Array(meshData.uv), 2));
  geo.setIndex(meshData.indices);
  geo.computeBoundingSphere?.();
  return geo;
}

/**
 * Merges multiple boundary part geometries into a single mesh
 */
export function assembleBakedGeometries(parts, resolveContextFn = resolveContext) {
  const { mergeGeometries } = resolveContextFn();
  const validGeos = parts.filter(p => p && p.indices && p.indices.length > 0).map(p => createBoundaryPartGeometry(p, resolveContextFn));
  if (validGeos.length === 0) return null;
  const merged = mergeGeometries ? mergeGeometries(validGeos) : validGeos[0];
  for (const g of validGeos) g.dispose?.();
  if (!merged) throw new Error("Baked stadium geometry could not be assembled");
  return merged;
}

/**
 * Generates goal mouth rounded frame spline path
 */
export function createRoundedGoalPath(sign, zOffset, resolveContextFn = resolveContext) {
  const { CurvePath, LineCurve3, Vector3 } = resolveContextFn();
  const path = new CurvePath();
  const z = sign * zOffset;
  const radius = 108;
  const bottomY = 547;
  const halfWidth = 906;
  const pts = [new Vector3(-halfWidth, 5, z), new Vector3(-halfWidth, bottomY, z)];

  for (let step = 1; step <= 12; step++) {
    const angle = Math.PI - (step / 12) * (Math.PI / 2);
    pts.push(new Vector3(-halfWidth + radius + radius * Math.cos(angle), bottomY + radius * Math.sin(angle), z));
  }
  pts.push(new Vector3(halfWidth - radius, bottomY + radius, z));
  for (let step = 1; step <= 12; step++) {
    const angle = Math.PI / 2 - (step / 12) * (Math.PI / 2);
    pts.push(new Vector3(halfWidth - radius + radius * Math.cos(angle), bottomY + radius * Math.sin(angle), z));
  }
  pts.push(new Vector3(halfWidth, 5, z));

  for (let i = 1; i < pts.length; i++) {
    path.add(new LineCurve3(pts[i - 1], pts[i]));
  }
  return path;
}

/**
 * Arcade seat & light palette updater
 */
function updateArcadeMaterialColors(mat, resolveContextFn = resolveContext) {
  if (!mat || !mat.color) return;
  if (mat.name && mat.name.startsWith("Seat ")) {
    const isSilverOrTeal = mat.name === "Seat silver" || mat.name === "Seat teal";
    mat.color.setHex(isSilverOrTeal ? TEAM_ORANGE_HEX : TEAM_BLUE_HEX);
    mat.color.multiplyScalar(mat.name === "Seat silver" ? 0.7 : 0.65);
  } else if (mat.name === "Cyan" || mat.name === "Amber") {
    mat.color.setHex(mat.name === "Cyan" ? TEAM_BLUE_HEX : TEAM_ORANGE_HEX);
    if (mat.emissive?.copy) mat.emissive.copy(mat.color);
  }
}

/**
 * Realistic material palette updater
 */
function updateRealisticMaterialProperties(mat) {
  if (!mat || !mat.color) return;
  if (mat.name === "Cyan" || mat.name === "Amber") {
    mat.color.setHex(mat.name === "Cyan" ? TEAM_BLUE_HEX : TEAM_ORANGE_HEX);
    if (mat.emissive?.copy) mat.emissive.copy(mat.color);
    mat.emissiveIntensity = 0.4;
    mat.roughness = 0.9;
    mat.metalness = 0;
    return;
  }
  const colorHex = STADIUM_PALETTE[mat.name];
  if (colorHex !== undefined) {
    mat.color.setHex(colorHex);
    if (mat.name && mat.name.startsWith("Seat ")) {
      mat.color.multiplyScalar(mat.name === "Seat silver" ? 0.7 : 0.65);
    }
    mat.metalness = 0;
    mat.roughness = 0.95;
    mat.envMapIntensity = 0.2;
  }
}

function processBowlFlatStructureMaterial(mat) {
  const rootName = mat.name ? mat.name.split(" / ")[0] : "";
  if (!FLAT_STRUCTURE_MATERIALS.has(rootName)) return mat;
  const cloned = mat.clone ? mat.clone() : { ...mat };
  cloned.userData = { ...mat.userData, stadiumFlatStructure: true };
  const prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => "";
  cloned.customProgramCacheKey = () => `stadium-flat-structure-v1/${prevKey()}`;
  return cloned;
}

function createFieldSideClippedMaterial(mat) {
  const cloned = mat.clone ? mat.clone() : { ...mat };
  cloned.name = `${mat.name} / field side`;
  cloned.userData = { ...mat.userData, fieldSideOnly: true };
  cloned.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `\n      #include <common>\n      varying vec2 vStadiumPoint;\n    `)
      .replace("#include <begin_vertex>", `\n      #include <begin_vertex>\n      vStadiumPoint = (modelMatrix * vec4(position, 1.0)).xz;\n    `);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `\n      #include <common>\n      varying vec2 vStadiumPoint;\n    `)
      .replace("#include <clipping_planes_fragment>", `\n      #include <clipping_planes_fragment>\n      vec2 stadiumCore = clamp(vStadiumPoint, vec2(-3150.0, -4800.0), vec2(3150.0, 4800.0));\n      vec2 stadiumOutward = vStadiumPoint - stadiumCore;\n      if (dot(cameraPosition.xz - vStadiumPoint, stadiumOutward) > 0.0) discard;\n    `);
  };
  cloned.customProgramCacheKey = () => "stadium-field-side-decoration-v2";
  return cloned;
}

function createDualThemeFieldSideMaterial(mat, multiThemeMaterial, getThemeMaterial) {
  const arcade = getThemeMaterial(mat, "arcade");
  const realistic = getThemeMaterial(mat, "realistic");
  return multiThemeMaterial(createFieldSideClippedMaterial(arcade), createFieldSideClippedMaterial(realistic));
}

/**
 * Loads and batches stadium architecture (/assets/arena/stadium/stadium.glb)
 */
export async function loadStadiumArchitecture(resolveContextFn = resolveContext) {
  const ctx = resolveContextFn();
  const {
    GLTFLoader,
    Group,
    Mesh,
    mergeGeometries,
    markMatrixDirty,
    multiThemeMaterial,
    getThemeMaterial,
    DoubleSide,
    BackSide
  } = ctx;

  if (!GLTFLoader) return null;
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync("/assets/arena/stadium/stadium.glb");
  const root = gltf.scene;
  if (!root) return null;

  root.name = "Stadium / stadium architecture";
  root.scale.setScalar(100);
  root.rotation.y = Math.PI;
  root.updateMatrixWorld?.(true);

  const batches = new Map();
  const fieldSideMaterials = new Map();
  const bowlMaterials = new Map();
  const geometriesToDispose = new Set();
  const processedMaterials = new Set();

  root.traverse((obj) => {
    if (!(obj instanceof Mesh || obj.isMesh)) return;
    obj.castShadow = false;
    obj.receiveShadow = false;

    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of materials) {
      if (!mat) continue;
      if (mat.name === "Inner fascia" || mat.name === "Tier deck" || (mat.name && mat.name.startsWith("Seat "))) {
        mat.side = BackSide ?? 1;
      } else if (mat.name === "Canopy") {
        mat.side = DoubleSide ?? 2;
      }
      if (!processedMaterials.has(mat)) {
        const arcadeClone = mat.clone ? mat.clone() : { ...mat };
        updateArcadeMaterialColors(arcadeClone, resolveContextFn);
        updateRealisticMaterialProperties(mat);
        if (typeof multiThemeMaterial === 'function') {
          multiThemeMaterial(mat, arcadeClone);
        }
        processedMaterials.add(mat);
      }
    }

    const mat = materials[0];
    const objName = String(obj.userData?.name ?? obj.name);
    const isFieldApron = objName.startsWith("Field apron /") && ["Concrete", "Titanium"].includes(mat?.name);
    const isSeatingBowlLight = objName.startsWith("Seating bowl /") && ["Warm light", "Cyan", "Amber"].includes(mat?.name);
    const needsFieldSide = mat?.name === "Tier deck" || isFieldApron || isSeatingBowlLight;

    let effectiveMat = mat;
    if (needsFieldSide) {
      if (!fieldSideMaterials.has(mat)) {
        fieldSideMaterials.set(mat, createDualThemeFieldSideMaterial(mat, multiThemeMaterial, getThemeMaterial));
      }
      effectiveMat = fieldSideMaterials.get(mat);
    }

    if (objName.startsWith("Seating bowl /")) {
      if (!bowlMaterials.has(effectiveMat)) {
        const arcade = getThemeMaterial ? getThemeMaterial(effectiveMat, "arcade") : effectiveMat;
        const flatArcade = processBowlFlatStructureMaterial(arcade);
        if (flatArcade === arcade) {
          bowlMaterials.set(effectiveMat, effectiveMat);
        } else {
          const realistic = getThemeMaterial ? getThemeMaterial(effectiveMat, "realistic") : effectiveMat;
          const clonedReal = realistic.clone ? realistic.clone() : { ...realistic };
          clonedReal.onBeforeCompile = realistic.onBeforeCompile;
          if (realistic.customProgramCacheKey) {
            clonedReal.customProgramCacheKey = realistic.customProgramCacheKey.bind(realistic);
          }
          bowlMaterials.set(effectiveMat, (typeof multiThemeMaterial === 'function') ? multiThemeMaterial(flatArcade, clonedReal) : flatArcade);
        }
      }
      effectiveMat = bowlMaterials.get(effectiveMat);
    }

    const pos = obj.geometry?.attributes?.position;
    if (!pos || pos.count === 0) return;

    const geoList = batches.get(effectiveMat) ?? [];
    const transformedGeo = obj.geometry.clone();
    if (typeof obj.updateWorldMatrix === "function") {
      obj.updateWorldMatrix(true, false);
    }
    const elements = obj.matrixWorld?.elements;
    const hasValidMatrix = elements && Array.from(elements).every(v => Number.isFinite(v));
    if (hasValidMatrix) {
      transformedGeo.applyMatrix4(obj.matrixWorld);
    }
    if (transformedGeo.boundingBox && (!Number.isFinite(transformedGeo.boundingBox.min?.x) || !Number.isFinite(transformedGeo.boundingBox.max?.x))) {
      transformedGeo.boundingBox = null;
    }
    if (transformedGeo.boundingSphere && !Number.isFinite(transformedGeo.boundingSphere.radius)) {
      transformedGeo.boundingSphere = null;
    }
    geoList.push(transformedGeo);
    batches.set(effectiveMat, geoList);
    geometriesToDispose.add(obj.geometry);
  });

  const stadiumContainer = new Group();
  stadiumContainer.name = root.name;

  for (const [material, geos] of batches) {
    const mergedGeo = mergeGeometries ? mergeGeometries(geos) : geos[0];
    if (mergedGeo) {
      if (!mergedGeo.boundingBox) mergedGeo.computeBoundingBox?.();
      if (!mergedGeo.boundingSphere) mergedGeo.computeBoundingSphere?.();
      const mesh = new Mesh(mergedGeo, material);
      mesh.name = `Stadium / ${material.name || 'batch'}`;
      if (material?.userData?.fieldSideOnly) {
        mesh.userData.bloomOccluder = false;
      }
      mesh.matrixAutoUpdate = false;
      stadiumContainer.add(mesh);
    }
    for (const g of geos) g.dispose?.();
  }

  for (const g of geometriesToDispose) g.dispose?.();
  markMatrixDirty?.(stadiumContainer);
  return stadiumContainer;
}

/**
 * Builds the continuous playing enclosure and goal frames
 * (/assets/arena/stadium/continuous-boundary.json)
 */
export async function loadStadiumContinuousBoundary(resolveContextFn = resolveContext) {
  const ctx = resolveContextFn();
  const {
    Group,
    Mesh,
    Color,
    PlaneGeometry,
    TubeGeometry,
    MeshStandardMaterial,
    MeshBasicMaterial,
    RepeatWrapping,
    SRGBColorSpace,
    Vector2,
    TextureLoader,
    mergeGeometries,
    mergeVertices,
    multiThemeMaterial,
    markMatrixDirty,
    BackSide,
    DoubleSide
  } = ctx;

  const blueColor = new Color(TEAM_BLUE_HEX);
  const orangeColor = new Color(TEAM_ORANGE_HEX);

  const createBankHexMaterial = async () => {
    if (!TextureLoader) return new MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
    const texLoader = new TextureLoader();
    const [albedo, normal] = await Promise.all([
      texLoader.loadAsync("/assets/arena/stadium/bank-hex-albedo.png"),
      texLoader.loadAsync("/assets/arena/stadium/bank-hex-normal.png")
    ]);
    for (const tex of [albedo, normal]) {
      if (tex) {
        if (RepeatWrapping) {
          tex.wrapS = RepeatWrapping;
          tex.wrapT = RepeatWrapping;
        }
        tex.repeat?.set(1 / 56, 1 / (56 * Math.sqrt(3)));
        tex.anisotropy = 8;
      }
    }
    if (albedo && SRGBColorSpace) albedo.colorSpace = SRGBColorSpace;

    const paintedBankMat = new MeshStandardMaterial({
      map: albedo,
      normalMap: normal,
      normalScale: new Vector2(0.18, 0.18),
      roughness: 0.95,
      metalness: 0,
      envMapIntensity: 0.2,
      side: BackSide ?? 1
    });
    paintedBankMat.name = "Stadium · painted slate hexagonal bank";
    paintedBankMat.onBeforeCompile = (shader) => {
      shader.uniforms.bankSeam = { value: new Color(3951446) };
      shader.uniforms.bankFace = { value: new Color(4938855) };
      shader.fragmentShader = shader.fragmentShader
        .replace("uniform vec3 diffuse;", "uniform vec3 diffuse;\nuniform vec3 bankSeam;\nuniform vec3 bankFace;")
        .replace("#include <map_fragment>", "#include <map_fragment>\n        float bankPanel = smoothstep(0.006, 0.055, dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)));\n        diffuseColor.rgb = mix(bankSeam, bankFace, bankPanel);");
    };
    paintedBankMat.customProgramCacheKey = () => "stadium-painted-bank-v1";

    const graphiteBankMat = new MeshStandardMaterial({
      name: "Stadium / graphite hexagonal bank",
      map: albedo,
      normalMap: normal,
      normalScale: new Vector2(0.65, 0.65),
      roughness: 0.82,
      metalness: 0.035,
      side: BackSide ?? 1
    });

    return (typeof multiThemeMaterial === 'function') ? multiThemeMaterial(paintedBankMat, graphiteBankMat) : paintedBankMat;
  };

  const createContinuousGridMaterial = () => {
    const gridMat = new MeshBasicMaterial({
      color: 16777215,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      side: DoubleSide ?? 2,
      toneMapped: false,
      forceSinglePass: true
    });
    gridMat.name = "Stadium · continuous coarse and close-range fine enclosure grid";
    gridMat.onBeforeCompile = (shader) => {
      shader.uniforms.goalBlue = { value: blueColor };
      shader.uniforms.goalOrange = { value: orangeColor };
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `\n      #include <common>\n      varying vec3 vBoundaryPosition;\n      varying vec3 vBoundaryNormal;\n    `)
        .replace("#include <begin_vertex>", `\n      #include <begin_vertex>\n      vBoundaryPosition = (modelMatrix * vec4(position, 1.0)).xyz;\n      vBoundaryNormal = normalize(mat3(modelMatrix) * normal);\n    `);
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `\n      #include <common>\n      varying vec3 vBoundaryPosition;\n      varying vec3 vBoundaryNormal;\n      uniform vec3 goalBlue;\n      uniform vec3 goalOrange;\n      float enclosureGrid(vec3 p, vec3 n, float spacing, float width) {\n        vec3 planeDistance = abs(mod(p + spacing * .5, spacing) - spacing * .5);\n        vec3 antialias = max(fwidth(p) * .8, vec3(.7));\n        vec3 line = 1.0 - smoothstep(vec3(width), vec3(width) + antialias, planeDistance);\n        line *= sqrt(max(vec3(0.0), vec3(1.0) - n * n));\n        return max(line.x, max(line.y, line.z));\n      }\n    `)
        .replace("#include <color_fragment>", `\n      #include <color_fragment>\n      vec3 p = vBoundaryPosition;\n      vec3 normal = normalize(vBoundaryNormal);\n      vec3 view = normalize(cameraPosition - p);\n      float facing = abs(dot(normal, view));\n      float range = distance(cameraPosition, p);\n      float distanceFade = 1.0 - smoothstep(3500.0, 13000.0, range) * .45;\n      float closeFade = 1.0 - smoothstep(900.0, 3200.0, range);\n      float coarse = enclosureGrid(p, normal, 512.0, 1.4);\n      float fine = enclosureGrid(p, normal, 64.0, .55);\n      vec3 tint = vec3(.32, .51, .58);\n      float alpha = .009 + pow(1.0 - facing, 3.0) * .025\n        + (coarse * .105 + fine * .075 * closeFade) * distanceFade * (.45 + .55 * facing);\n      if (abs(p.z) > 5340.0) {\n        tint = mix(goalBlue, goalOrange, step(0.0, p.z));\n        alpha = .006 + fine * .15 * distanceFade;\n      }\n      diffuseColor.rgb = tint;\n      diffuseColor.a = alpha;\n    `);
    };
    gridMat.customProgramCacheKey = () => "stadium-continuous-grid-v1";
    return gridMat;
  };

  const [res, bankMaterial] = await Promise.all([
    fetch("/assets/arena/stadium/continuous-boundary.json"),
    createBankHexMaterial()
  ]);
  if (!res.ok) throw new Error(`Continuous stadium boundary could not load (${res.status})`);
  const data = await res.json();
  if (data.version !== 1 || !data.lower || !data.upper || !data.goal || !data.ceiling) {
    throw new Error("Continuous stadium boundary asset has an unsupported format");
  }

  const [goalLower, goalUpper] = splitBoundaryMeshAtHeight(data.goal, ARENA_BOUNDARY_SPLIT_Y);
  const boundaryGroup = new Group();
  boundaryGroup.name = "Stadium · continuous playing enclosure";

  const goalLowerGeo = createBoundaryPartGeometry(goalLower, resolveContextFn);
  goalLowerGeo.deleteAttribute("normal");
  const weldedGoalLowerGeo = mergeVertices ? mergeVertices(goalLowerGeo, 1e-4) : goalLowerGeo;
  goalLowerGeo.dispose?.();
  weldedGoalLowerGeo.computeVertexNormals?.();

  const lowerBankGeo = createBoundaryPartGeometry(data.lower, resolveContextFn);
  const bankCombinedGeo = mergeGeometries ? mergeGeometries([lowerBankGeo, weldedGoalLowerGeo]) : lowerBankGeo;
  lowerBankGeo.dispose?.();
  weldedGoalLowerGeo.dispose?.();
  if (!bankCombinedGeo) throw new Error("Field and goal banks could not be assembled");

  const bankMesh = new Mesh(bankCombinedGeo, bankMaterial);
  bankMesh.name = "Continuous field and recessed goal banks · arc-length UVs";
  bankMesh.receiveShadow = true;

  const upperCeilingGridMesh = new Mesh(
    assembleBakedGeometries([data.upper, data.ceiling, goalUpper], resolveContextFn),
    createContinuousGridMaterial()
  );
  upperCeilingGridMesh.name = "Continuous corner / wall / ceiling · single-pass grid";
  upperCeilingGridMesh.userData.bloomOccluder = false;

  boundaryGroup.add(bankMesh, upperCeilingGridMesh);

  // Goal portals for blue (-1) and orange (+1)
  const addGoalPortal = (sign) => {
    const goalColor = sign < 0 ? blueColor : orangeColor;
    const portalGroup = new Group();
    portalGroup.name = sign < 0 ? "Blue goal · north portal" : "Orange goal · south portal";

    if (TubeGeometry && ctx.CurvePath) {
      const framePath = createRoundedGoalPath(sign, 5145, resolveContextFn);
      const frameGeo = new TubeGeometry(framePath, 100, 23, 8, false);
      const frameMat = (typeof multiThemeMaterial === 'function') ? multiThemeMaterial(
        new MeshStandardMaterial({ color: 1322577, metalness: 0, roughness: 0.9 }),
        new MeshStandardMaterial({ color: 1386289, metalness: 0.65, roughness: 0.4 })
      ) : new MeshStandardMaterial({ color: 1322577, metalness: 0, roughness: 0.9 });
      const frameMesh = new Mesh(frameGeo, frameMat);
      frameMesh.name = "Rounded goal-mouth structural frame";

      const lightPath = createRoundedGoalPath(sign, 5117, resolveContextFn);
      const lightGeo = new TubeGeometry(lightPath, 100, 7, 6, false);
      const lightMat = new MeshBasicMaterial({ color: goalColor, toneMapped: false });
      const lightMesh = new Mesh(lightGeo, lightMat);
      lightMesh.name = "Inset continuous team-colored goal light";

      portalGroup.add(frameMesh, lightMesh);
    }

    if (PlaneGeometry) {
      const floorMesh = new Mesh(new PlaneGeometry(1595, 650), new MeshStandardMaterial({ color: 1521711, roughness: 0.94 }));
      floorMesh.rotation.x = -Math.PI / 2;
      floorMesh.position.set(0, 0.5, sign * (ARENA_GOAL_DEPTH + 325));
      floorMesh.receiveShadow = true;
      floorMesh.name = "Recessed goal-floor surface";
      portalGroup.add(floorMesh);
    }

    boundaryGroup.add(portalGroup);
  };

  addGoalPortal(-1);
  addGoalPortal(1);

  boundaryGroup.userData.continuousBoundaryAsset = "/assets/arena/stadium/continuous-boundary.json";
  boundaryGroup.userData.bakeMetrics = data.metrics;
  markMatrixDirty?.(boundaryGroup);

  return boundaryGroup;
}

