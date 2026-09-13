/**
 * src/game/ShaderPrewarmer.js
 * Scene & Postprocessing Shader Prewarmer (Phase 7.7 Deobfuscation)
 *
 * Pre-compiles WebGL shaders across light and postprocessing pass permutations
 * to eliminate runtime frame drops / micro-stutters during match gameplay.
 *
 * Upstream deobfuscated symbol:
 * - hB -> prewarmSceneShaders
 */

let prewarmerThreeContext = {
  Light: null,
  Mesh: null,
  Points: null,
  Line: null
};

export function setShaderPrewarmerThreeContext(context) {
  if (!context) return;
  const descriptors = Object.getOwnPropertyDescriptors(context);
  Object.defineProperties(prewarmerThreeContext, descriptors);
}

function isLightNode(obj) {
  if (!obj) return false;
  const { Light } = prewarmerThreeContext;
  return Boolean(obj.isLight || (Light && obj instanceof Light));
}

function isRenderableVisualNode(obj) {
  if (!obj) return false;
  const { Mesh, Points, Line } = prewarmerThreeContext;
  return Boolean(
    obj.isMesh || (Mesh && obj instanceof Mesh) ||
    obj.isPoints || (Points && obj instanceof Points) ||
    obj.isLine || (Line && obj instanceof Line)
  );
}

/**
 * Pre-warms shaders by iterating all lighting states and postprocessing permutations.
 * Temporarily un-culls geometry, compiles shaders asynchronously, renders bloom and final passes,
 * and completely restores initial scene & renderer states in a finally block.
 *
 * @param {object} renderer WebGLRenderer
 * @param {object} scene Scene
 * @param {object} camera Camera
 * @param {object} pipeline Postprocessing pipeline { passes, disappearingLightRoots, renderBloom, renderFinal }
 */
export async function prewarmSceneShaders(renderer, scene, camera, pipeline = {}) {
  if (!renderer || !scene || !camera) return;

  const initiallyVisibleLights = new Set();
  scene.traverseVisible?.((node) => {
    if (isLightNode(node)) initiallyVisibleLights.add(node);
  });

  const savedStates = [];
  const savedDrawRanges = new Map();
  const passes = (pipeline.passes ?? []).map((p) => ({ pass: p, enabled: p.enabled }));
  const disappearingLightRoots = (pipeline.disappearingLightRoots ?? [])
    .map((root) => {
      const lights = [];
      root?.traverse?.((u) => {
        if (isLightNode(u)) lights.push(u);
      });
      return lights;
    })
    .filter((group) => group.length > 0);

  const prevRenderTarget = renderer.getRenderTarget ? renderer.getRenderTarget() : null;
  const prevShadowMapNeedsUpdate = renderer.shadowMap ? renderer.shadowMap.needsUpdate : false;

  // Uncull and ensure non-empty draw ranges for shader compilation
  scene.traverse?.((node) => {
    savedStates.push({
      object: node,
      visible: node.visible,
      frustumCulled: node.frustumCulled
    });
    node.visible = true;
    node.frustumCulled = false;

    if (isRenderableVisualNode(node)) {
      const geo = node.geometry;
      if (geo && geo.drawRange && geo.drawRange.count === 0 && !savedDrawRanges.has(geo)) {
        savedDrawRanges.set(geo, { ...geo.drawRange });
        const vertexCount = geo.index?.count ?? geo.attributes?.position?.count ?? 0;
        geo.setDrawRange?.(0, vertexCount);
      }
    }
  });

  // Enable all postprocessing passes for warm-up
  for (const { pass } of passes) {
    if (pass) pass.enabled = true;
  }

  try {
    const compiledPermutationKeys = new Set();

    for (const forceLightVisible of [false, true]) {
      const numPermutations = 2 ** disappearingLightRoots.length;
      for (let u = 0; u < numPermutations; u++) {
        for (const { object: lightObj } of savedStates) {
          if (isLightNode(lightObj)) {
            lightObj.visible = forceLightVisible || initiallyVisibleLights.has(lightObj);
          }
        }
        for (let v = 0; v < disappearingLightRoots.length; v++) {
          if (u & (1 << v)) {
            for (const light of disappearingLightRoots[v]) {
              light.visible = false;
            }
          }
        }

        const visibleLightKey = savedStates
          .filter(({ object: node }) => isLightNode(node) && node.visible)
          .map(({ object: node }) => node.id)
          .join(',');

        if (!compiledPermutationKeys.has(visibleLightKey)) {
          compiledPermutationKeys.add(visibleLightKey);
          if (typeof renderer.compileAsync === 'function') {
            await renderer.compileAsync(scene, camera);
          } else if (typeof renderer.compile === 'function') {
            renderer.compile(scene, camera);
          }

          if (typeof pipeline.renderBloom === 'function') {
            await pipeline.renderBloom();
          }

          if (renderer.shadowMap) renderer.shadowMap.needsUpdate = true;

          if (typeof pipeline.renderFinal === 'function') {
            pipeline.renderFinal();
          }
        }
      }
    }
  } finally {
    // Restore all original object visibilities and frustum culling
    for (const { object: node, visible, frustumCulled } of savedStates) {
      node.visible = visible;
      node.frustumCulled = frustumCulled;
    }
    // Restore geometry draw ranges
    for (const [geo, range] of savedDrawRanges) {
      geo.setDrawRange?.(range.start, range.count);
    }
    // Restore pass enabled states
    for (const { pass, enabled } of passes) {
      if (pass) pass.enabled = enabled;
    }
    // Restore renderer shadowMap and renderTarget
    if (renderer.shadowMap) renderer.shadowMap.needsUpdate = prevShadowMapNeedsUpdate;
    if (renderer.setRenderTarget) renderer.setRenderTarget(prevRenderTarget);
  }
}

export { prewarmSceneShaders as hB };
