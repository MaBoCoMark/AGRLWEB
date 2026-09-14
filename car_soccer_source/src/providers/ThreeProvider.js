/**
 * src/providers/ThreeProvider.js
 * Centralized Three.js Subsystem Context Provider (Phase 8.3).
 *
 * Consolidates the 21 scattered set*ThreeContext injections across the game engine
 * into a single unified initialization bus. Dynamically binds standard Three.js
 * classes and constants to postprocessing, entities, effects, loaders, and game runtime.
 */

import THREE, * as ThreeNamed from '../vendor/three.js';

// Effect contexts
import { setBoostBloomThreeContext } from '../effects/BoostBloom.js';
import { setFlipResetThreeContext } from '../effects/FlipResetVisual.js';
import { setSpeedLinesThreeContext } from '../effects/SupersonicSpeedLinesPass.js';
import { setPostprocessingThreeContext } from '../effects/PostprocessingPipeline.js';
import { setThemeMaterialThreeContext } from '../effects/ThemeMaterialPipeline.js';

// Camera & UI
import { setCameraThreeContext } from '../camera/CameraController.js';
import { setGarageThreeContext } from '../ui/GarageDialog.js';

// Entity contexts
import { setBallLocatorThreeContext } from '../entities/BallLocatorArrow.js';
import { setDemolitionThreeContext } from '../entities/DemolitionEffect.js';
import { setBoostPadThreeContext } from '../entities/BoostPadSystem.js';
import { setSpeedTrailThreeContext } from '../entities/SpeedTrail.js';
import { setBallVisualThreeContext } from '../entities/BallVisual.js';
import { setVehicleAssemblyThreeContext } from '../entities/VehicleAssembly.js';
import { setArenaWorldThreeContext } from '../entities/ArenaWorld.js';
import { setVehicleBoostEmitterThreeContext, VehicleBoostEmitter } from '../entities/VehicleBoostEmitter.js';

// Loaders & Utils
import { setBufferGeometryUtilsThreeContext } from '../utils/BufferGeometryUtils.js';
import { setOBJLoaderThreeContext, OBJLoader } from '../loaders/OBJLoader.js';
import { setGLTFLoaderThreeContext, GLTFLoader, GLTFParser } from '../loaders/GLTFLoader.js';

// Game Runtime & Trajectory
import { setBallTrajectoryPredictorThreeContext } from '../game/BallTrajectoryPredictor.js';
import { setShaderPrewarmerThreeContext } from '../game/ShaderPrewarmer.js';
import { setGameRuntimeThreeContext } from '../game/GameRuntime.js';

// Effects & Themes helper functions
import {
  createMultiThemeMaterial,
  getThemeMaterial,
  isMultiThemeMaterial,
  resolveThemeMaterial,
  registerThemeSubtree,
  createCelShadedToonMaterial,
  cloneMaterial,
  applyArcadeCelShading,
  setShadowFlags
} from '../effects/ThemeMaterialPipeline.js';
import {
  Pass,
  FullScreenQuad,
  CopyShader,
  RoomEnvironment
} from '../effects/PostprocessingPipeline.js';
import {
  mergeGeometries,
  mergeVertices,
  toTrianglesDrawMode,
  cloneSkinnedMesh
} from '../utils/BufferGeometryUtils.js';

/**
 * Registry map recording whether each subsystem context has been initialized.
 */
export const subsystemInitializationStatus = {
  postprocessing: false,
  garage: false,
  camera: false,
  boostBloom: false,
  flipReset: false,
  speedLines: false,
  ballLocator: false,
  demolition: false,
  boostPad: false,
  speedTrail: false,
  themeMaterial: false,
  shaderPrewarmer: false,
  bufferGeometryUtils: false,
  objLoader: false,
  ballTrajectoryPredictor: false,
  gltfLoader: false,
  vehicleBoostEmitter: false,
  ballVisual: false,
  vehicleAssembly: false,
  arenaWorld: false,
  gameRuntime: false
};

/**
 * Initializes and wires Three.js classes and constants to all 21 decoupled game subsystems.
 * @param {object} [customContext] Optional custom Three.js context (defaults to src/vendor/three.js)
 * @returns {object} The resolved Three.js context object
 */
export function initializeSubsystemThreeContexts(customContext = ThreeNamed) {
  const T = customContext;

  // 1. Postprocessing & Scene
  setPostprocessingThreeContext({
    Scene: T.Scene,
    BoxGeometry: T.BoxGeometry,
    MeshStandardMaterial: T.MeshStandardMaterial,
    BackSide: T.BackSide,
    PointLight: T.PointLight,
    Mesh: T.Mesh,
    InstancedMesh: T.InstancedMesh,
    Object3D: T.Object3D,
    MeshBasicMaterial: T.FallbackMeshBasicMaterial || T.MeshBasicMaterial,
    BufferGeometry: T.BufferGeometry,
    Float32BufferAttribute: T.Float32BufferAttribute,
    OrthographicCamera: T.OrthographicCamera,
    ShaderMaterial: T.ShaderMaterial,
    RawShaderMaterial: T.RawShaderMaterial,
    UniformsUtils: T.UniformsUtils,
    Vector2: T.Vector2,
    WebGLRenderTarget: T.WebGLRenderTarget,
    HalfFloatType: T.HalfFloatType,
    NoBlending: T.NoBlending,
    Timer: T.Timer,
    Color: T.Color,
    ColorManagement: T.ColorManagement,
    SRGBTransfer: T.SRGBTransfer,
    LinearToneMapping: T.LinearToneMapping,
    ReinhardToneMapping: T.ReinhardToneMapping,
    CineonToneMapping: T.CineonToneMapping,
    ACESFilmicToneMapping: T.ACESFilmicToneMapping,
    AgXToneMapping: T.AgXToneMapping,
    NeutralToneMapping: T.NeutralToneMapping,
    CustomToneMapping: T.CustomToneMapping
  });
  subsystemInitializationStatus.postprocessing = true;

  // 2. Garage Turntable & Preview
  setGarageThreeContext({
    Group: T.Group,
    BoxGeometry: T.BoxGeometry,
    MeshStandardMaterial: T.MeshStandardMaterial,
    Mesh: T.Mesh,
    EdgesGeometry: T.EdgesGeometry,
    LineBasicMaterial: T.LineBasicMaterial,
    LineSegments: T.LineSegments,
    WebGLRenderer: T.WebGLRenderer,
    Scene: T.Scene,
    PMREMGenerator: T.PMREMGenerator,
    RoomEnvironment: RoomEnvironment,
    HemisphereLight: T.HemisphereLight,
    DirectionalLight: T.DirectionalLight,
    PerspectiveCamera: T.PerspectiveCamera,
    Box3: T.Box3,
    Vector3: T.Vector3
  });
  subsystemInitializationStatus.garage = true;

  // 3. Camera Controller
  setCameraThreeContext({
    PerspectiveCamera: T.PerspectiveCamera,
    Vector3: T.Vector3
  });
  subsystemInitializationStatus.camera = true;

  // 4. Boost Bloom & Speed Lines
  setBoostBloomThreeContext({
    WebGLRenderTarget: T.WebGLRenderTarget,
    ShaderMaterial: T.ShaderMaterial,
    Vector2: T.Vector2,
    Color: T.Color,
    FullScreenQuad: FullScreenQuad,
    HalfFloatType: T.HalfFloatType,
    LinearFilter: T.LinearFilter
  });
  subsystemInitializationStatus.boostBloom = true;

  setFlipResetThreeContext({
    Group: T.Group,
    MeshBasicMaterial: T.MeshBasicMaterial,
    Mesh: T.Mesh,
    RingGeometry: T.RingGeometry,
    BufferGeometry: T.BufferGeometry,
    BufferAttribute: T.BufferAttribute,
    Points: T.Points,
    PlaneGeometry: T.PlaneGeometry,
    SphereGeometry: T.SphereGeometry,
    Shape: T.Shape,
    ShapeGeometry: T.ShapeGeometry,
    ShaderMaterial: T.ShaderMaterial,
    Color: T.Color,
    Vector4: T.Vector4,
    MathUtils: T.MathUtils,
    AdditiveBlending: T.AdditiveBlending,
    DoubleSide: T.DoubleSide
  });
  subsystemInitializationStatus.flipReset = true;

  setSpeedLinesThreeContext({
    Pass: Pass,
    FullScreenQuad: FullScreenQuad,
    ShaderMaterial: T.ShaderMaterial,
    Scene: T.Scene,
    OrthographicCamera: T.FallbackOrthographicCamera || T.OrthographicCamera,
    BufferGeometry: T.InstancedBufferGeometry || T.BufferGeometry,
    BufferAttribute: T.Float32BufferAttribute || T.BufferAttribute,
    InstancedBufferAttribute: T.InstancedBufferAttribute,
    Mesh: T.Mesh,
    Vector3: T.Vector3,
    Quaternion: T.Quaternion,
    Matrix4: T.Matrix4,
    DoubleSide: T.DoubleSide,
    CopyShader: CopyShader,
    MathUtils: T.MathUtils
  });
  subsystemInitializationStatus.speedLines = true;

  // 5. Entities (Ball Locator, Demolition, Boost Pads, Speed Trail)
  setBallLocatorThreeContext({
    Group: T.Group,
    CanvasTexture: T.CanvasTexture,
    Sprite: T.Sprite,
    SpriteMaterial: T.SpriteMaterial,
    MeshStandardMaterial: T.MeshStandardMaterial,
    Shape: T.Shape,
    ExtrudeGeometry: T.ExtrudeGeometry,
    Mesh: T.Mesh,
    Vector3: T.Vector3,
    MathUtils: T.MathUtils,
    SRGBColorSpace: T.SRGBColorSpace,
    LinearFilter: T.LinearFilter
  });
  subsystemInitializationStatus.ballLocator = true;

  setDemolitionThreeContext({
    Group: T.Group,
    BufferGeometry: T.InstancedBufferGeometry || T.BufferGeometry,
    BufferAttribute: T.Float32BufferAttribute || T.BufferAttribute,
    InstancedBufferAttribute: T.InstancedBufferAttribute,
    PlaneGeometry: T.PlaneGeometry,
    ShaderMaterial: T.ShaderMaterial,
    Mesh: T.Mesh,
    Vector3: T.Vector3,
    MathUtils: T.MathUtils,
    DynamicDrawUsage: T.DynamicDrawUsage
  });
  subsystemInitializationStatus.demolition = true;

  setBoostPadThreeContext({
    Group: T.Group,
    Mesh: T.Mesh,
    CylinderGeometry: T.CylinderGeometry,
    MeshBasicMaterial: T.MeshBasicMaterial,
    MeshStandardMaterial: T.MeshStandardMaterial,
    multiThemeMaterial: createMultiThemeMaterial,
    cloneMaterial: cloneMaterial,
    markMatrixDirty: registerThemeSubtree
  });
  subsystemInitializationStatus.boostPad = true;

  setSpeedTrailThreeContext({
    Group: T.Group,
    BufferGeometry: T.BufferGeometry,
    BufferAttribute: T.BufferAttribute,
    ShaderMaterial: T.ShaderMaterial,
    Mesh: T.Mesh,
    Sprite: T.Sprite,
    SpriteMaterial: T.SpriteMaterial,
    CanvasTexture: T.CanvasTexture,
    Vector3: T.Vector3,
    Color: T.Color,
    MathUtils: T.MathUtils,
    DynamicDrawUsage: T.DynamicDrawUsage,
    AdditiveBlending: T.AdditiveBlending,
    DoubleSide: T.DoubleSide,
    NormalBlending: T.NormalBlending,
    SRGBColorSpace: T.SRGBColorSpace
  });
  subsystemInitializationStatus.speedTrail = true;

  // 6. Themes & Shader Prewarmer
  setThemeMaterialThreeContext({
    Mesh: T.Mesh,
    MeshStandardMaterial: T.MeshStandardMaterial,
    MeshPhysicalMaterial: T.MeshPhysicalMaterial,
    MeshToonMaterial: T.MeshToonMaterial,
    Material: T.Material,
    DataTexture: T.DataTexture,
    RGBAFormat: T.RGBAFormat,
    NearestFilter: T.NearestFilter
  });
  subsystemInitializationStatus.themeMaterial = true;

  setShaderPrewarmerThreeContext({
    Light: T.Light,
    Mesh: T.Mesh,
    Points: T.Points,
    Line: T.Line
  });
  subsystemInitializationStatus.shaderPrewarmer = true;

  // 7. Geometry & Loaders
  setBufferGeometryUtilsThreeContext({
    BufferGeometry: T.BufferGeometry,
    BufferAttribute: T.BufferAttribute,
    TrianglesDrawMode: T.TrianglesDrawMode,
    TriangleStripDrawMode: T.TriangleStripDrawMode,
    TriangleFanDrawMode: T.TriangleFanDrawMode
  });
  subsystemInitializationStatus.bufferGeometryUtils = true;

  setOBJLoaderThreeContext({
    Loader: T.Loader,
    FileLoader: T.FileLoader,
    DefaultLoadingManager: T.DefaultLoadingManager,
    Group: T.Group,
    Mesh: T.Mesh,
    LineSegments: T.LineSegments,
    Points: T.Points,
    BufferGeometry: T.BufferGeometry,
    Float32BufferAttribute: T.Float32BufferAttribute,
    LineBasicMaterial: T.LineBasicMaterial,
    PointsMaterial: T.PointsMaterial,
    MeshPhongMaterial: T.MeshPhongMaterial,
    Vector3: T.Vector3,
    Color: T.Color,
    SRGBColorSpace: T.SRGBColorSpace
  });
  subsystemInitializationStatus.objLoader = true;

  setBallTrajectoryPredictorThreeContext({
    Group: T.Group,
    BufferGeometry: T.BufferGeometry,
    BufferAttribute: T.BufferAttribute,
    ShaderMaterial: T.ShaderMaterial,
    Mesh: T.Mesh,
    Color: T.Color,
    Vector3: T.Vector3,
    DynamicDrawUsage: T.DynamicDrawUsage,
    NormalBlending: T.NormalBlending,
    DoubleSide: T.DoubleSide
  });
  subsystemInitializationStatus.ballTrajectoryPredictor = true;

  setGLTFLoaderThreeContext({
    Object3D: T.Object3D,
    Loader: T.Loader,
    LoaderUtils: T.LoaderUtils,
    FileLoader: T.FileLoader,
    TextureLoader: T.TextureLoader,
    ImageBitmapLoader: T.ImageBitmapLoader,
    PropertyBinding: T.PropertyBinding,
    DefaultLoadingManager: T.DefaultLoadingManager,
    Group: T.Group,
    Mesh: T.Mesh,
    SkinnedMesh: T.SkinnedMesh,
    InstancedMesh: T.InstancedMesh,
    Points: T.Points,
    Line: T.Line,
    LineSegments: T.LineSegments,
    LineLoop: T.LineLoop,
    Bone: T.Bone,
    Skeleton: T.Skeleton,
    BufferGeometry: T.BufferGeometry,
    BufferAttribute: T.BufferAttribute,
    InstancedBufferAttribute: T.InstancedBufferAttribute,
    InterleavedBuffer: T.InterleavedBuffer,
    InterleavedBufferAttribute: T.InterleavedBufferAttribute,
    Material: T.Material,
    MeshStandardMaterial: T.MeshStandardMaterial,
    MeshPhysicalMaterial: T.MeshPhysicalMaterial,
    MeshBasicMaterial: T.MeshBasicMaterial,
    PointsMaterial: T.PointsMaterial,
    LineBasicMaterial: T.LineBasicMaterial,
    PointLight: T.PointLight,
    DirectionalLight: T.DirectionalLight,
    SpotLight: T.SpotLight,
    PerspectiveCamera: T.PerspectiveCamera,
    OrthographicCamera: T.OrthographicCamera,
    Texture: T.Texture,
    Vector2: T.Vector2,
    Vector3: T.Vector3,
    Matrix4: T.Matrix4,
    Quaternion: T.Quaternion,
    Color: T.Color,
    Sphere: T.Sphere,
    Box3: T.Box3,
    MathUtils: T.MathUtils,
    AnimationClip: T.AnimationClip,
    Interpolant: T.Interpolant,
    NumberKeyframeTrack: T.NumberKeyframeTrack,
    QuaternionKeyframeTrack: T.QuaternionKeyframeTrack,
    VectorKeyframeTrack: T.VectorKeyframeTrack,
    ColorManagement: T.ColorManagement,
    toTrianglesDrawMode: toTrianglesDrawMode,
    cloneSkinnedMesh: cloneSkinnedMesh,
    RepeatWrapping: T.RepeatWrapping,
    ClampToEdgeWrapping: T.ClampToEdgeWrapping,
    MirroredRepeatWrapping: T.MirroredRepeatWrapping,
    NearestFilter: T.NearestFilter,
    NearestMipmapNearestFilter: T.NearestMipmapNearestFilter,
    NearestMipmapLinearFilter: T.NearestMipmapLinearFilter,
    LinearFilter: T.LinearFilter,
    LinearMipmapNearestFilter: T.LinearMipmapNearestFilter,
    LinearMipmapLinearFilter: T.LinearMipmapLinearFilter,
    InterpolateDiscrete: T.InterpolateDiscrete,
    InterpolateLinear: T.InterpolateLinear,
    DoubleSide: T.DoubleSide,
    SRGBColorSpace: T.SRGBColorSpace,
    LinearSRGBColorSpace: T.LinearSRGBColorSpace,
    TriangleStripDrawMode: T.TriangleStripDrawMode,
    TriangleFanDrawMode: T.TriangleFanDrawMode
  });
  subsystemInitializationStatus.gltfLoader = true;

  // 8. Vehicle & Arena Visuals
  setVehicleBoostEmitterThreeContext({
    Group: T.Group,
    Mesh: T.Mesh,
    Points: T.Points,
    PointLight: T.PointLight,
    BufferGeometry: T.BufferGeometry,
    BufferAttribute: T.Float32BufferAttribute,
    InterleavedBuffer: T.InterleavedBuffer,
    InterleavedBufferAttribute: T.InterleavedBufferAttribute,
    Fog: T.Fog,
    InstancedBufferGeometry: T.InstancedBufferGeometry,
    InstancedBufferAttribute: T.InstancedBufferAttribute,
    ShaderMaterial: T.ShaderMaterial,
    Vector3: T.Vector3,
    Color: T.Color,
    MathUtils: T.MathUtils,
    DynamicDrawUsage: T.DynamicDrawUsage,
    NormalBlending: T.NormalBlending,
    AdditiveBlending: T.AdditiveBlending,
    DoubleSide: T.DoubleSide,
    RepeatWrapping: T.RepeatWrapping,
    SRGBColorSpace: T.SRGBColorSpace,
    TextureLoader: T.TextureLoader
  });
  subsystemInitializationStatus.vehicleBoostEmitter = true;

  setBallVisualThreeContext({
    Group: T.Group,
    Mesh: T.Mesh,
    BufferGeometry: T.BufferGeometry,
    BufferAttribute: T.Float32BufferAttribute,
    InterleavedBuffer: T.InterleavedBuffer,
    InterleavedBufferAttribute: T.InterleavedBufferAttribute,
    Fog: T.Fog,
    IcosahedronGeometry: T.IcosahedronGeometry,
    MeshStandardMaterial: T.MeshStandardMaterial,
    Vector2: T.Vector2,
    Vector3: T.Vector3,
    Color: T.Color,
    get GLTFLoader() { return GLTFLoader; },
    TextureLoader: T.TextureLoader,
    SRGBColorSpace: T.SRGBColorSpace
  });
  subsystemInitializationStatus.ballVisual = true;

  setVehicleAssemblyThreeContext({
    Object3D: T.Object3D,
    Group: T.Group,
    Mesh: T.Mesh,
    BoxGeometry: T.BoxGeometry,
    EdgesGeometry: T.EdgesGeometry,
    LineSegments: T.LineSegments,
    LineBasicMaterial: T.LineBasicMaterial,
    CylinderGeometry: T.CylinderGeometry,
    SphereGeometry: T.SphereGeometry,
    PlaneGeometry: T.PlaneGeometry,
    BufferGeometry: T.BufferGeometry,
    BufferAttribute: T.Float32BufferAttribute,
    InterleavedBuffer: T.InterleavedBuffer,
    InterleavedBufferAttribute: T.InterleavedBufferAttribute,
    Fog: T.Fog,
    TubeGeometry: T.TubeGeometry,
    CatmullRomCurve3: T.CatmullRomCurve3,
    CurvePath: T.CurvePath,
    LineCurve3: T.LineCurve3,
    LatheGeometry: T.LatheGeometry,
    TorusGeometry: T.TorusGeometry,
    RingGeometry: T.RingGeometry,
    CanvasTexture: T.CanvasTexture,
    MeshStandardMaterial: T.MeshStandardMaterial,
    MeshPhysicalMaterial: T.MeshPhysicalMaterial,
    MeshBasicMaterial: T.MeshBasicMaterial,
    ShaderMaterial: T.ShaderMaterial,
    Vector2: T.Vector2,
    Vector3: T.Vector3,
    Color: T.Color,
    Quaternion: T.Quaternion,
    Matrix4: T.Matrix4,
    Matrix3: T.Matrix3,
    MathUtils: T.MathUtils,
    UniformsUtils: T.UniformsUtils,
    DoubleSide: T.DoubleSide,
    BackSide: T.BackSide,
    FrontSide: T.FrontSide,
    NormalBlending: T.NormalBlending,
    AdditiveBlending: T.AdditiveBlending,
    SRGBColorSpace: T.SRGBColorSpace,
    Scene: T.Scene,
    TextureLoader: T.TextureLoader,
    OBJLoader: OBJLoader,
    get GLTFLoader() { return GLTFLoader; },
    mergeVertices: mergeVertices,
    mergeGeometries: mergeGeometries,
    multiThemeMaterial: createMultiThemeMaterial,
    getThemeMaterial: getThemeMaterial,
    isMultiThemeMaterial: isMultiThemeMaterial,
    resolveThemeMaterial: resolveThemeMaterial,
    registerThemeSubtree: registerThemeSubtree,
    markMatrixDirty: registerThemeSubtree,
    cloneMaterial: createCelShadedToonMaterial,
    createCelShadedToonMaterial: createCelShadedToonMaterial,
    setShadowFlags: applyArcadeCelShading,
    applyArcadeCelShading: applyArcadeCelShading
  });
  subsystemInitializationStatus.vehicleAssembly = true;

  setArenaWorldThreeContext({
    Object3D: T.Object3D,
    Group: T.Group,
    Mesh: T.Mesh,
    InstancedMesh: T.InstancedMesh,
    BoxGeometry: T.BoxGeometry,
    EdgesGeometry: T.EdgesGeometry,
    LineSegments: T.LineSegments,
    LineBasicMaterial: T.LineBasicMaterial,
    CylinderGeometry: T.CylinderGeometry,
    SphereGeometry: T.SphereGeometry,
    PlaneGeometry: T.PlaneGeometry,
    BufferGeometry: T.BufferGeometry,
    BufferAttribute: T.Float32BufferAttribute,
    InterleavedBuffer: T.InterleavedBuffer,
    InterleavedBufferAttribute: T.InterleavedBufferAttribute,
    Fog: T.Fog,
    TubeGeometry: T.TubeGeometry,
    CatmullRomCurve3: T.CatmullRomCurve3,
    CurvePath: T.CurvePath,
    LineCurve3: T.LineCurve3,
    LatheGeometry: T.LatheGeometry,
    TorusGeometry: T.TorusGeometry,
    RingGeometry: T.RingGeometry,
    CanvasTexture: T.CanvasTexture,
    MeshStandardMaterial: T.MeshStandardMaterial,
    MeshPhysicalMaterial: T.MeshPhysicalMaterial,
    MeshBasicMaterial: T.MeshBasicMaterial,
    ShaderMaterial: T.ShaderMaterial,
    Vector2: T.Vector2,
    Vector3: T.Vector3,
    Color: T.Color,
    Quaternion: T.Quaternion,
    Matrix4: T.Matrix4,
    Matrix3: T.Matrix3,
    MathUtils: T.MathUtils,
    Scene: T.Scene,
    DoubleSide: T.DoubleSide,
    BackSide: T.BackSide,
    FrontSide: T.FrontSide,
    DirectionalLight: T.DirectionalLight,
    HemisphereLight: T.HemisphereLight,
    AdditiveBlending: T.AdditiveBlending,
    RepeatWrapping: T.RepeatWrapping,
    LinearFilter: T.LinearFilter,
    LinearMipmapLinearFilter: T.LinearMipmapLinearFilter,
    SRGBColorSpace: T.SRGBColorSpace,
    mergeVertices: mergeVertices,
    mergeGeometries: mergeGeometries,
    GLTFLoader: GLTFLoader,
    TextureLoader: T.TextureLoader,
    OBJLoader: OBJLoader,
    VehicleBoostEmitter: VehicleBoostEmitter,
    multiThemeMaterial: createMultiThemeMaterial,
    getThemeMaterial: getThemeMaterial,
    cloneMaterial: createCelShadedToonMaterial,
    createCelShadedToonMaterial: createCelShadedToonMaterial,
    markMatrixDirty: registerThemeSubtree,
    registerThemeSubtree: registerThemeSubtree,
    setShadowFlags: applyArcadeCelShading,
    applyArcadeCelShading: applyArcadeCelShading
  });
  subsystemInitializationStatus.arenaWorld = true;

  // 9. Game Runtime Orchestrator
  setGameRuntimeThreeContext({
    WebGLRenderer: T.WebGLRenderer,
    PMREMGenerator: T.PMREMGenerator,
    Vector3: T.Vector3,
    ShaderMaterial: T.ShaderMaterial,
    MeshBasicMaterial: T.MeshBasicMaterial,
    Mesh: T.Mesh,
    PCFSoftShadowMap: T.PCFSoftShadowMap,
    ACESFilmicToneMapping: T.ACESFilmicToneMapping,
    DoubleSide: T.DoubleSide,
    RoomEnvironment: RoomEnvironment
  });
  subsystemInitializationStatus.gameRuntime = true;

  return T;
}

/**
 * Returns the default Three.js instance.
 */
export function getThree() {
  return THREE;
}

// Auto-initialize default subsystem contexts upon module import
initializeSubsystemThreeContexts();

export default {
  initializeSubsystemThreeContexts,
  getThree,
  subsystemInitializationStatus,
  THREE
};
