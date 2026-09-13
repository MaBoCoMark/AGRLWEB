/**
 * BallTrajectoryPredictor.js
 * High-performance, deterministic Rocket League ball trajectory prediction system.
 * Simulates future ball trajectory at 120Hz with realistic arena collisions,
 * generates world-space fixed time-sliced dashed patterns, and provides an independent UI control panel.
 */

import * as THREE from 'three';

export const DEFAULT_TRAJECTORY_SETTINGS = {
  enabled: true,          // Default enabled in Free Play
  duration: 2.5,          // 0.5s - 5.0s, step 0.1s
  lineThickness: 4.0,     // 1.0 - 10.0, step 0.5
  existTime: 80,          // 0ms - 100ms, default 80ms
  hiddenTime: 20,         // 0ms - 100ms, default 20ms
  color: '#00f0ff',       // Cyan neon glow
};

const STORAGE_KEY = 'car_soccer_trajectory_settings';

export class BallTrajectoryPredictor {
  constructor(container) {
    this.container = container;
    this.settings = this.loadSettings();

    // Scene visual objects
    this.group = new THREE.Group();
    this.group.name = 'BallTrajectoryPrediction';

    // Maximum ticks: 5.0 seconds at 120Hz = 600 ticks
    this.maxTicks = 600;
    this.maxVertices = this.maxTicks * 2;
    this.maxIndices = (this.maxTicks - 1) * 6;

    // Buffer arrays for dynamic camera-facing ribbon
    this.positions = new Float32Array(this.maxVertices * 3);
    this.alphas = new Float32Array(this.maxVertices);
    this.colors = new Float32Array(this.maxVertices * 3);
    this.indices = new Uint16Array(this.maxIndices);

    this.geometry = new THREE.BufferGeometry();
    this.positionAttr = new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage);
    this.alphaAttr = new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage);
    this.colorAttr = new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage);

    this.geometry.setAttribute('position', this.positionAttr);
    this.geometry.setAttribute('aAlpha', this.alphaAttr);
    this.geometry.setAttribute('color', this.colorAttr);
    this.geometry.setIndex(new THREE.BufferAttribute(this.indices, 1));
    this.geometry.setDrawRange(0, 0);

    // Custom shader material for vibrant glowing neon ribbon
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(this.settings.color) },
      },
      vertexShader: `
        attribute float aAlpha;
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          vAlpha = aAlpha;
          vColor = color;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          if (vAlpha <= 0.001) discard;
          gl_FragColor = vec4(uColor * vColor, vAlpha * 0.92);
        }
      `,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.group.add(this.mesh);

    // Trajectory state
    this.simulatedPoints = [];     // Array of {x, y, z, isVisible, tMs}
    this.lastHitSerial = -1;
    this.lastSimTime = 0;
    this.currentBallIndex = 0;
    this.geometryDirty = false;
    this.isActive = false;

    // Scratch math vectors
    this.tangent = new THREE.Vector3();
    this.viewDir = new THREE.Vector3();
    this.side = new THREE.Vector3();
    this.camPos = new THREE.Vector3();
    this.curP = new THREE.Vector3();
    this.nextP = new THREE.Vector3();
    this.fallbackAxis = new THREE.Vector3(0, 1, 0);

    // Physics constants (Unreal/RocketSim units, Three.js coords: Y is up, X width, Z length)
    this.BALL_RADIUS = 91.25;
    this.GRAVITY = -650;
    this.DRAG = 0.0305;
    this.RESTITUTION = 0.60;
    this.SURFACE_FRICTION = 0.985;
    this.ARENA_HALF_W = 4096;
    this.ARENA_HALF_L = 5120;
    this.ARENA_HEIGHT = 2048;
    this.GOAL_HALF_W = 892.8;
    this.GOAL_HEIGHT = 642.97;
    this.GOAL_DEPTH = 880;

    // Create UI Panel & inject styles
    this.createUI();
  }

  loadSettings() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return { ...DEFAULT_TRAJECTORY_SETTINGS, ...JSON.parse(saved) };
      }
    } catch (_) {}
    return { ...DEFAULT_TRAJECTORY_SETTINGS };
  }

  saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch (_) {}
  }

  /**
   * Run 120Hz physics simulation forward in time.
   * Deterministically calculates trajectory points and marks visible/hidden time slices.
   */
  simulate(startPos, startVel) {
    const dt = 1 / 120;
    const tickDtMs = 1000 / 120;
    const totalTicks = Math.min(this.maxTicks, Math.max(1, Math.round(this.settings.duration * 120)));
    const cycleMs = this.settings.existTime + this.settings.hiddenTime;
    const existMs = this.settings.existTime;

    let x = startPos.x;
    let y = startPos.y;
    let z = startPos.z;
    let vx = startVel.x;
    let vy = startVel.y;
    let vz = startVel.z;

    const R = this.BALL_RADIUS;
    const points = [];

    for (let k = 0; k < totalTicks; k++) {
      const tMs = k * tickDtMs;
      // Time-sliced dash pattern:
      const isVisible = cycleMs > 0 ? ((tMs % cycleMs) < existMs) : true;

      points.push({ x, y, z, isVisible, tMs, tickIndex: k });

      // Ball in-flight physics
      vx -= vx * this.DRAG * dt;
      vy += (this.GRAVITY - vy * this.DRAG) * dt;
      vz -= vz * this.DRAG * dt;

      x += vx * dt;
      y += vy * dt;
      z += vz * dt;

      // Arena Ground collision
      if (y <= R) {
        y = R;
        vy = -vy * this.RESTITUTION;
        vx *= this.SURFACE_FRICTION;
        vz *= this.SURFACE_FRICTION;
      }

      // Arena Ceiling collision
      if (y >= this.ARENA_HEIGHT - R) {
        y = this.ARENA_HEIGHT - R;
        vy = -vy * this.RESTITUTION;
        vx *= this.SURFACE_FRICTION;
        vz *= this.SURFACE_FRICTION;
      }

      // Arena Side Walls (|X| = 4096)
      if (Math.abs(x) >= this.ARENA_HALF_W - R) {
        x = Math.sign(x) * (this.ARENA_HALF_W - R);
        vx = -vx * this.RESTITUTION;
        vy *= this.SURFACE_FRICTION;
        vz *= this.SURFACE_FRICTION;
      }

      // End Walls (|Z| = 5120) & Goals
      const isInsideGoalOpening = Math.abs(x) <= this.GOAL_HALF_W - R && y <= this.GOAL_HEIGHT - R;
      if (!isInsideGoalOpening) {
        if (Math.abs(z) >= this.ARENA_HALF_L - R) {
          z = Math.sign(z) * (this.ARENA_HALF_L - R);
          vz = -vz * this.RESTITUTION;
          vx *= this.SURFACE_FRICTION;
          vy *= this.SURFACE_FRICTION;
        }
      } else {
        // Inside Goal mouth
        const maxGoalZ = this.ARENA_HALF_L + this.GOAL_DEPTH - R;
        if (Math.abs(z) >= maxGoalZ) {
          z = Math.sign(z) * maxGoalZ;
          vz = -vz * this.RESTITUTION;
        }
      }

      // 45-degree Corner Bevels (|x| + |z| >= 8060)
      const cornerThreshold = 8064 - R;
      if (Math.abs(x) + Math.abs(z) >= cornerThreshold) {
        const excess = (Math.abs(x) + Math.abs(z)) - cornerThreshold;
        const nx = -Math.sign(x) * 0.70710678;
        const nz = -Math.sign(z) * 0.70710678;
        const vDotN = vx * nx + vz * nz;
        if (vDotN < 0) {
          vx -= (1 + this.RESTITUTION) * vDotN * nx;
          vz -= (1 + this.RESTITUTION) * vDotN * nz;
          vy *= this.SURFACE_FRICTION;
          x += nx * excess;
          z += nz * excess;
        }
      }
    }

    this.simulatedPoints = points;
    this.currentBallIndex = 0;
    this.geometryDirty = true;
  }

  /**
   * Recalculates trajectory immediately from current ball physics.
   */
  recalculate(ballPos, ballVelocity) {
    if (!this.settings.enabled || !this.isActive) {
      this.clear();
      return;
    }
    this.simulate(ballPos, ballVelocity);
  }

  clear() {
    this.simulatedPoints = [];
    this.currentBallIndex = 0;
    this.geometry.setDrawRange(0, 0);
    this.geometryDirty = false;
  }

  /**
   * Per-frame update hook.
   */
  update({ active, ballPosition, ballVelocity, ballHitSerial, kickoffReset }) {
    this.isActive = active;

    if (!this.isActive || !this.settings.enabled) {
      this.mesh.visible = false;
      return;
    }

    this.mesh.visible = true;

    // Check collision / hit / kickoff recalculation triggers
    const hitChanged = ballHitSerial !== this.lastHitSerial && ballHitSerial !== undefined;
    if (hitChanged) {
      this.lastHitSerial = ballHitSerial;
    }

    if (hitChanged || kickoffReset || this.simulatedPoints.length === 0) {
      this.simulate(ballPosition, ballVelocity);
      return;
    }

    // World-space fixed pattern:
    // Find the closest point along the fixed trajectory to current real ball position
    const pts = this.simulatedPoints;
    let bestIdx = this.currentBallIndex;
    let bestDistSq = Infinity;
    const searchLimit = Math.min(pts.length, this.currentBallIndex + 40);

    for (let i = this.currentBallIndex; i < searchLimit; i++) {
      const p = pts[i];
      const dx = p.x - ballPosition.x;
      const dy = p.y - ballPosition.y;
      const dz = p.z - ballPosition.z;
      const dSq = dx * dx + dy * dy + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestIdx = i;
      }
    }

    // If ball has drifted too far (external impulse without serial update), recalculate
    if (bestDistSq > 40000 && ballVelocity.lengthSq() > 100) {
      this.simulate(ballPosition, ballVelocity);
      return;
    }

    if (bestIdx !== this.currentBallIndex) {
      this.currentBallIndex = bestIdx;
      this.geometryDirty = true;
    }
  }

  /**
   * Prepares billboard geometry facing the camera.
   */
  prepare(camera) {
    if (!this.isActive || !this.settings.enabled || !this.mesh.visible) {
      return;
    }

    if (!this.geometryDirty && this.lastCameraPos && camera.position.distanceToSquared(this.lastCameraPos) < 1.0) {
      return;
    }

    this.rebuildGeometry(camera);
  }

  rebuildGeometry(camera) {
    const pts = this.simulatedPoints;
    const totalPts = pts.length;
    const startIdx = this.currentBallIndex;

    if (totalPts < 2 || startIdx >= totalPts - 1) {
      this.geometry.setDrawRange(0, 0);
      return;
    }

    camera.getWorldPosition(this.camPos);
    this.lastCameraPos = (this.lastCameraPos || new THREE.Vector3()).copy(camera.position);

    let vertCount = 0;
    let indexCount = 0;
    const thickness = this.settings.lineThickness;

    // Traverse the remaining trajectory from current ball position onwards
    let inVisibleDash = false;
    let dashStartVert = 0;

    for (let i = startIdx; i < totalPts; i++) {
      const p = pts[i];
      const isVisible = p.isVisible;

      if (!isVisible) {
        // End current dash if active
        inVisibleDash = false;
        continue;
      }

      // Point is visible
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(totalPts - 1, i + 1)];

      this.curP.set(p.x, p.y, p.z);
      this.tangent.set(next.x - prev.x, next.y - prev.y, next.z - prev.z);
      if (this.tangent.lengthSq() < 1e-4) {
        this.tangent.set(0, 0, 1);
      } else {
        this.tangent.normalize();
      }

      this.viewDir.subVectors(this.camPos, this.curP).normalize();
      this.side.crossVectors(this.tangent, this.viewDir);
      if (this.side.lengthSq() < 1e-5) {
        this.side.crossVectors(this.tangent, this.fallbackAxis);
        if (this.side.lengthSq() < 1e-5) this.side.set(1, 0, 0);
      }

      // Subtle scale with camera distance to ensure consistent pixel legibility
      const camDist = this.camPos.distanceTo(this.curP);
      const scaleFactor = Math.max(0.6, Math.min(2.5, camDist / 1200));
      const halfWidth = (thickness * 0.5) * scaleFactor;
      this.side.normalize().multiplyScalar(halfWidth);

      // Fade alpha towards the very end of the trajectory
      const progressToEnd = (i - startIdx) / Math.max(1, totalPts - 1 - startIdx);
      const alpha = progressToEnd > 0.85 ? (1.0 - progressToEnd) / 0.15 : 1.0;

      // Add 2 ribbon vertices (left, right)
      const vLeft = vertCount++;
      const vRight = vertCount++;

      if (vRight >= this.maxVertices) break;

      const baseIdxL = vLeft * 3;
      this.positions[baseIdxL] = p.x - this.side.x;
      this.positions[baseIdxL + 1] = p.y - this.side.y;
      this.positions[baseIdxL + 2] = p.z - this.side.z;
      this.alphas[vLeft] = alpha;
      this.colors[baseIdxL] = 1.0;
      this.colors[baseIdxL + 1] = 1.0;
      this.colors[baseIdxL + 2] = 1.0;

      const baseIdxR = vRight * 3;
      this.positions[baseIdxR] = p.x + this.side.x;
      this.positions[baseIdxR + 1] = p.y + this.side.y;
      this.positions[baseIdxR + 2] = p.z + this.side.z;
      this.alphas[vRight] = alpha;
      this.colors[baseIdxR] = 1.0;
      this.colors[baseIdxR + 1] = 1.0;
      this.colors[baseIdxR + 2] = 1.0;

      if (!inVisibleDash) {
        // Started a new dash
        inVisibleDash = true;
        dashStartVert = vLeft;
      } else {
        // Connect quad to previous vertices in this dash
        const prevL = vLeft - 2;
        const prevR = vRight - 2;

        if (indexCount + 6 <= this.maxIndices) {
          this.indices[indexCount++] = prevL;
          this.indices[indexCount++] = vLeft;
          this.indices[indexCount++] = prevR;

          this.indices[indexCount++] = prevR;
          this.indices[indexCount++] = vLeft;
          this.indices[indexCount++] = vRight;
        }
      }
    }

    this.positionAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
    this.geometry.index.needsUpdate = true;
    this.geometry.setDrawRange(0, indexCount);
    this.geometryDirty = false;
  }

  /**
   * Independent UI settings panel & HUD button.
   */
  createUI() {
    // Inject stylesheet
    const styleId = 'trajectory-predictor-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        .trajectory-panel {
          position: absolute;
          top: 64px;
          right: 20px;
          width: 310px;
          background: rgba(14, 20, 32, 0.94);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(0, 229, 255, 0.28);
          border-radius: 12px;
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.65), 0 0 20px rgba(0, 229, 255, 0.08);
          color: #e2e8f0;
          font-family: var(--sans, system-ui, -apple-system, sans-serif);
          font-size: 13px;
          z-index: 1000;
          user-select: none;
          pointer-events: auto;
          transition: opacity 0.2s ease, transform 0.2s ease;
        }
        .trajectory-panel[hidden] {
          display: none !important;
        }
        .trajectory-panel__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        .trajectory-panel__title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
          font-size: 14px;
          color: #fff;
          letter-spacing: -0.01em;
        }
        .trajectory-badge {
          background: rgba(0, 229, 255, 0.15);
          color: #00f0ff;
          border: 1px solid rgba(0, 229, 255, 0.3);
          border-radius: 999px;
          font-size: 10px;
          font-weight: 700;
          padding: 1px 7px;
          text-transform: uppercase;
        }
        .trajectory-panel__close {
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.5);
          font-size: 18px;
          cursor: pointer;
          padding: 2px 6px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          line-height: 1;
          transition: color 0.15s, background 0.15s;
        }
        .trajectory-panel__close:hover {
          color: #fff;
          background: rgba(255, 255, 255, 0.1);
        }
        .trajectory-panel__body {
          padding: 14px 16px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .trajectory-row {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .trajectory-row--toggle {
          flex-direction: row;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 4px;
        }
        .trajectory-row__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .trajectory-label {
          font-weight: 500;
          color: rgba(255, 255, 255, 0.9);
          font-size: 12px;
        }
        .trajectory-val {
          font-family: var(--mono, monospace);
          font-size: 12px;
          font-weight: 600;
          color: #00f0ff;
        }
        .trajectory-hint {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.45);
          line-height: 1.3;
        }
        .trajectory-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 6px;
          border-radius: 3px;
          background: rgba(255, 255, 255, 0.12);
          outline: none;
          accent-color: #00e5ff;
          cursor: pointer;
        }
        .trajectory-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #00f0ff;
          cursor: pointer;
          box-shadow: 0 0 10px rgba(0, 229, 255, 0.7);
        }
        .trajectory-toggle {
          position: relative;
          width: 38px;
          height: 20px;
          -webkit-appearance: none;
          appearance: none;
          background: rgba(255, 255, 255, 0.15);
          outline: none;
          border-radius: 10px;
          cursor: pointer;
          transition: background 0.2s;
        }
        .trajectory-toggle:checked {
          background: #00e5ff;
        }
        .trajectory-toggle::before {
          content: '';
          position: absolute;
          top: 2px;
          left: 2px;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #fff;
          transition: transform 0.2s;
        }
        .trajectory-toggle:checked::before {
          transform: translateX(18px);
        }
        #trajectory-button svg {
          stroke: currentColor;
          fill: none;
        }
        #trajectory-button.is-active {
          color: #00f0ff;
          border-color: rgba(0, 229, 255, 0.4);
          background: rgba(0, 229, 255, 0.1);
        }
      `;
      document.head.appendChild(style);
    }

    // Create panel element
    const panel = document.createElement('div');
    panel.id = 'trajectory-panel';
    panel.className = 'trajectory-panel';
    panel.hidden = true;
    panel.innerHTML = `
      <div class="trajectory-panel__header">
        <div class="trajectory-panel__title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 20 C 7 20, 11 5, 21 5" stroke="#00f0ff"/>
            <circle cx="21" cy="5" r="2.5" fill="#00f0ff"/>
          </svg>
          <span>Trajectory Prediction</span>
          <span class="trajectory-badge">Free Play</span>
        </div>
        <button type="button" class="trajectory-panel__close" data-action="close" title="Close Panel">✕</button>
      </div>
      <div class="trajectory-panel__body">
        <div class="trajectory-row trajectory-row--toggle">
          <label class="trajectory-label" for="traj-enabled">Enable Prediction</label>
          <input type="checkbox" id="traj-enabled" class="trajectory-toggle" ${this.settings.enabled ? 'checked' : ''} />
        </div>

        <div class="trajectory-row">
          <div class="trajectory-row__header">
            <label class="trajectory-label" for="traj-duration">Prediction Duration</label>
            <span class="trajectory-val" id="traj-duration-val">${Number(this.settings.duration).toFixed(1)}s</span>
          </div>
          <input type="range" id="traj-duration" class="trajectory-slider" min="0.5" max="5.0" step="0.1" value="${this.settings.duration}" />
          <span class="trajectory-hint">Forward prediction range (0.5s – 5.0s, step 0.1s)</span>
        </div>

        <div class="trajectory-row">
          <div class="trajectory-row__header">
            <label class="trajectory-label" for="traj-thickness">Line Thickness</label>
            <span class="trajectory-val" id="traj-thickness-val">${Number(this.settings.lineThickness).toFixed(1)}</span>
          </div>
          <input type="range" id="traj-thickness" class="trajectory-slider" min="1.0" max="10.0" step="0.5" value="${this.settings.lineThickness}" />
          <span class="trajectory-hint">3D ribbon line thickness</span>
        </div>

        <div class="trajectory-row">
          <div class="trajectory-row__header">
            <label class="trajectory-label" for="traj-exist">Exist Time (Solid)</label>
            <span class="trajectory-val" id="traj-exist-val">${this.settings.existTime} ms</span>
          </div>
          <input type="range" id="traj-exist" class="trajectory-slider" min="0" max="100" step="1" value="${this.settings.existTime}" />
          <span class="trajectory-hint">Solid line duration per cycle (0 – 100 ms)</span>
        </div>

        <div class="trajectory-row">
          <div class="trajectory-row__header">
            <label class="trajectory-label" for="traj-hidden">Hidden Time (Gap)</label>
            <span class="trajectory-val" id="traj-hidden-val">${this.settings.hiddenTime} ms</span>
          </div>
          <input type="range" id="traj-hidden" class="trajectory-slider" min="0" max="100" step="1" value="${this.settings.hiddenTime}" />
          <span class="trajectory-hint">Hidden gap duration per cycle (0 – 100 ms)</span>
        </div>
      </div>
    `;

    this.container.appendChild(panel);
    this.panel = panel;

    // Attach event listeners
    const enabledInput = panel.querySelector('#traj-enabled');
    const durationInput = panel.querySelector('#traj-duration');
    const durationVal = panel.querySelector('#traj-duration-val');
    const thicknessInput = panel.querySelector('#traj-thickness');
    const thicknessVal = panel.querySelector('#traj-thickness-val');
    const existInput = panel.querySelector('#traj-exist');
    const existVal = panel.querySelector('#traj-exist-val');
    const hiddenInput = panel.querySelector('#traj-hidden');
    const hiddenVal = panel.querySelector('#traj-hidden-val');
    const closeBtn = panel.querySelector('[data-action="close"]');

    enabledInput.addEventListener('change', (e) => {
      this.settings.enabled = e.target.checked;
      this.saveSettings();
      if (!this.settings.enabled) this.clear();
      else this.geometryDirty = true;
    });

    durationInput.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.settings.duration = val;
      durationVal.textContent = `${val.toFixed(1)}s`;
      this.saveSettings();
      this.geometryDirty = true;
    });

    thicknessInput.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.settings.lineThickness = val;
      thicknessVal.textContent = val.toFixed(1);
      this.saveSettings();
      this.geometryDirty = true;
    });

    existInput.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      this.settings.existTime = val;
      existVal.textContent = `${val} ms`;
      this.saveSettings();
      this.geometryDirty = true;
    });

    hiddenInput.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      this.settings.hiddenTime = val;
      hiddenVal.textContent = `${val} ms`;
      this.saveSettings();
      this.geometryDirty = true;
    });

    closeBtn.addEventListener('click', () => {
      this.togglePanel(false);
    });

    // Create HUD trigger button in .hud-tools
    this.createHudButton();
  }

  createHudButton() {
    const hudTools = this.container.querySelector('.hud-tools');
    if (!hudTools) return;

    const btn = document.createElement('button');
    btn.id = 'trajectory-button';
    btn.className = 'hud-tool';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Trajectory Prediction');
    btn.setAttribute('title', 'Trajectory Prediction / 轨迹预测 (Free Play)');
    btn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 20 C 6 20, 10 6, 20 6"/>
        <circle cx="20" cy="6" r="2.5" fill="currentColor"/>
      </svg>
    `;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePanel();
    });

    hudTools.insertBefore(btn, hudTools.querySelector('#settings-button') || hudTools.firstChild);
    this.hudButton = btn;
  }

  togglePanel(forceState) {
    if (!this.panel) return;
    const shouldOpen = forceState !== undefined ? forceState : this.panel.hidden;
    this.panel.hidden = !shouldOpen;
    if (this.hudButton) {
      this.hudButton.classList.toggle('is-active', shouldOpen);
    }
  }

  get object() {
    return this.group;
  }
}
