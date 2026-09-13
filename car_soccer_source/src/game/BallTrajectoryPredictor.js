/**
 * BallTrajectoryPredictor.js
 * High-performance, deterministic Rocket League ball trajectory prediction system.
 * Simulates future ball trajectory at 120Hz via an isolated, hidden RocketSim physics simulation
 * with exact arena collision meshes (.cmf), spin coupling, and Bullet rigid body dynamics.
 * Updates prediction state ONLY on car-ball impact, kickoff reset, or ball control actions (1/2/3/4).
 */

import * as THREE from 'three';
import jC from '../physics/RocketSimWasm.js';

export const DEFAULT_TRAJECTORY_SETTINGS = {
  enabled: true,          // Default enabled in Free Play
  duration: 2.5,          // 0.5s - 5.0s, step 0.1s
  lineThickness: 4.0,     // 1.0 - 100.0, step 0.5
  existTime: 80,          // 0ms - 100ms, default 80ms
  hiddenTime: 20,         // 0ms - 100ms, default 20ms
  color: '#00f0ff',       // Cyan neon glow
};

const STORAGE_KEY = 'car_soccer_trajectory_settings';

export class BallTrajectoryPredictor {
  constructor(container, physicsInstance = null) {
    this.container = container;
    this.physicsInstance = physicsInstance;
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
      vertexColors: true,
      vertexShader: `
        attribute float aAlpha;
        #if !defined(USE_COLOR) && !defined(USE_COLOR_ALPHA)
        attribute vec3 color;
        #endif
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
          vec3 finalColor = uColor * vColor;
          gl_FragColor = vec4(finalColor, vAlpha * 0.92);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = this.settings.enabled;
    this.group.add(this.mesh);

    // Simulated trajectory points
    this.simulatedPoints = [];
    this.currentBallIndex = 0;
    this.geometryDirty = false;
    this.lastCameraPos = null;

    // Track state changes & collision detection
    this.lastHitSerial = -1;
    this.lastCarHitSerials = [];
    this.wasInCarContact = false;
    this.lastRecalcTime = 0;
    this.lastBallPosRS = null;
    this.lastBallVelRS = null;
    this.lastBallState = null;
    this.lastBallPos = null;
    this.lastBallVel = null;
    this.isActive = false;

    // Scratch vector instances to avoid per-frame allocations
    this.camPos = new THREE.Vector3();
    this.curP = new THREE.Vector3();
    this.tangent = new THREE.Vector3();
    this.viewDir = new THREE.Vector3();
    this.side = new THREE.Vector3();
    this.prevP = new THREE.Vector3();
    this.nextP = new THREE.Vector3();
    this.fallbackAxis = new THREE.Vector3(0, 1, 0);

    // Physics constants (fallback / reference)
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

    // Hidden RocketSim simulation environment
    this.hiddenSimReady = false;
    this.hiddenMod = null;
    this.hiddenArenaPtr = 0;
    this.hiddenBallPtr = 0;
    this.hiddenState = null;
    this.hiddenBallStateBuf = 0;
    this.hiddenBs = null;

    this.initHiddenSim();
    this.createUI();
  }

  loadSettings() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const merged = { ...DEFAULT_TRAJECTORY_SETTINGS, ...parsed };
        merged.lineThickness = Math.max(1.0, Math.min(100.0, Number(merged.lineThickness) || 4.0));
        merged.duration = Math.max(0.5, Math.min(5.0, Number(merged.duration) || 2.5));
        merged.existTime = Math.max(0, Math.min(100, parseInt(merged.existTime, 10) || 80));
        merged.hiddenTime = Math.max(0, Math.min(100, parseInt(merged.hiddenTime, 10) || 20));
        return merged;
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
   * Initializes isolated RocketSim physics environment with full arena collision meshes.
   */
  async initHiddenSim() {
    try {
      let chunks = null;
      if (this.physicsInstance && this.physicsInstance.constructor && this.physicsInstance.constructor.cachedCollisionData) {
        chunks = this.physicsInstance.constructor.cachedCollisionData;
      }
      if (!chunks && typeof window !== 'undefined' && window.__cachedCollisionData) {
        chunks = window.__cachedCollisionData;
      }
      if (!chunks) {
        const mRes = await fetch('/assets/arena/collision/manifest.json');
        const manifest = await mRes.json();
        chunks = await Promise.all(manifest.map(async f => {
          const res = await fetch(`/assets/arena/collision/${f}`);
          return new Uint8Array(await res.arrayBuffer());
        }));
        if (this.physicsInstance && this.physicsInstance.constructor) {
          this.physicsInstance.constructor.cachedCollisionData = chunks;
        }
      }

      const mod = await jC();
      const totalBytes = chunks.reduce((acc, c) => acc + c.length, 0);
      const dataPtr = mod._malloc(totalBytes);
      const sizesPtr = mod._malloc(chunks.length * 4);
      let offset = 0;
      chunks.forEach((c, idx) => {
        mod.HEAPU8.set(c, dataPtr + offset);
        mod.HEAP32[sizesPtr / 4 + idx] = c.length;
        offset += c.length;
      });
      const rInit = mod._physics_init(dataPtr, sizesPtr, chunks.length);
      mod._free(dataPtr);
      mod._free(sizesPtr);
      if (rInit !== 1) throw new Error('Physics init failed: ' + rInit);
      if (mod._physics_createArena() !== 1) throw new Error('Create arena failed');

      this.hiddenMod = mod;
      this.hiddenArenaPtr = mod.HEAP32[43444 / 4];
      this.hiddenBallPtr = mod.HEAP32[(this.hiddenArenaPtr + 52) / 4];
      this.hiddenState = new Float32Array(mod.HEAPF32.buffer, mod._physics_getStatePtr(), mod._physics_getStateSize());
      this.hiddenBallStateBuf = mod._malloc(96);
      this.hiddenBs = new Float32Array(mod.HEAPF32.buffer, this.hiddenBallStateBuf, 24);
      this.hiddenSimReady = true;

      if (this.lastBallState) {
        this.simulateFromState(this.lastBallState);
      }
    } catch (err) {
      console.warn('[BallTrajectoryPredictor] Failed to initialize hidden RocketSim physics:', err);
    }
  }

  /**
   * Run RocketSim physics forward in time using hidden environment.
   */
  simulateFromState(liveBallState) {
    if (!liveBallState) return;
    this.lastBallState = (liveBallState.slice ? liveBallState.slice() : new Float32Array(liveBallState));

    if (!this.settings.enabled) {
      this.clear();
      return;
    }

    // Fallback if hidden simulation is still loading
    if (!this.hiddenSimReady || !this.hiddenMod) {
      if (this.lastBallPos && this.lastBallVel) {
        this.simulateEuler(this.lastBallPos, this.lastBallVel);
      }
      return;
    }

    const b = this.lastBallState;
    // Check if ball is essentially resting motionless on arena floor
    // RocketSim linear velocity indices: 16, 17, 18
    const velSq = b[16] * b[16] + b[17] * b[17] + b[18] * b[18];
    if (velSq < 15 && b[6] <= 95) {
      this.clear();
      return;
    }

    // Load full 96-byte BallState into hidden RocketSim
    const bs = this.hiddenBs;
    // Position (x, y, z in RocketSim)
    bs[0] = b[4]; bs[1] = b[5]; bs[2] = b[6]; bs[3] = 0;
    // 3x3 Rotation matrix (rows with padding)
    bs[4] = b[7];  bs[5] = b[8];  bs[6] = b[9];  bs[7] = 0;
    bs[8] = b[10]; bs[9] = b[11]; bs[10] = b[12]; bs[11] = 0;
    bs[12] = b[13]; bs[13] = b[14]; bs[14] = b[15]; bs[15] = 0;
    // Linear velocity (vx, vy, vz)
    bs[16] = b[16]; bs[17] = b[17]; bs[18] = b[18]; bs[19] = 0;
    // Angular velocity / spin (wx, wy, wz)
    bs[20] = b[19]; bs[21] = b[20]; bs[22] = b[21]; bs[23] = 0;

    this.hiddenMod._physics_setBallState(this.hiddenBallPtr, this.hiddenBallStateBuf);

    const totalTicks = Math.min(this.maxTicks, Math.max(2, Math.round(this.settings.duration * 120)));
    const tickDtMs = 1000 / 120;
    const cycleMs = this.settings.existTime + this.settings.hiddenTime;
    const existMs = this.settings.existTime;
    const nowMs = performance.now();

    const points = [];
    // t=0 initial point (RS coords -> Three.js coords: X->X, Z->Y, Y->Z)
    points.push({
      x: bs[0],
      y: bs[2],
      z: bs[1],
      isVisible: cycleMs > 0 ? ((nowMs % cycleMs) < existMs) : true,
      tMs: 0,
      tickIndex: 0
    });

    const hState = this.hiddenState;
    for (let k = 1; k < totalTicks; k++) {
      this.hiddenMod._physics_step(1);
      const tMs = k * tickDtMs;
      const arrivalTimeMs = nowMs + tMs;
      const isVisible = cycleMs > 0 ? ((arrivalTimeMs % cycleMs) < existMs) : true;
      points.push({
        x: hState[4],
        y: hState[6], // RocketSim Z is up -> Three.js Y
        z: hState[5], // RocketSim Y is forward -> Three.js Z
        isVisible,
        tMs,
        tickIndex: k
      });
    }

    this.simulatedPoints = points;
    this.currentBallIndex = 0;
    this.geometryDirty = true;
  }

  /**
   * Analytical Euler simulation fallback.
   */
  simulateEuler(startPos, startVel) {
    const dt = 1 / 120;
    const tickDtMs = 1000 / 120;
    const totalTicks = Math.min(this.maxTicks, Math.max(2, Math.round(this.settings.duration * 120)));
    const cycleMs = this.settings.existTime + this.settings.hiddenTime;
    const existMs = this.settings.existTime;
    const nowMs = performance.now();

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
      const arrivalTimeMs = nowMs + tMs;
      const isVisible = cycleMs > 0 ? ((arrivalTimeMs % cycleMs) < existMs) : true;

      points.push({ x, y, z, isVisible, tMs, tickIndex: k });

      vx -= vx * this.DRAG * dt;
      vy += (this.GRAVITY - vy * this.DRAG) * dt;
      vz -= vz * this.DRAG * dt;

      x += vx * dt;
      y += vy * dt;
      z += vz * dt;

      if (y <= R) {
        y = R;
        vy = -vy * this.RESTITUTION;
        vx *= this.SURFACE_FRICTION;
        vz *= this.SURFACE_FRICTION;
      }
      if (y >= this.ARENA_HEIGHT - R) {
        y = this.ARENA_HEIGHT - R;
        vy = -vy * this.RESTITUTION;
        vx *= this.SURFACE_FRICTION;
        vz *= this.SURFACE_FRICTION;
      }
      if (Math.abs(x) >= this.ARENA_HALF_W - R) {
        x = Math.sign(x) * (this.ARENA_HALF_W - R);
        vx = -vx * this.RESTITUTION;
        vy *= this.SURFACE_FRICTION;
        vz *= this.SURFACE_FRICTION;
      }
      if (Math.abs(z) >= this.ARENA_HALF_L - R) {
        z = Math.sign(z) * (this.ARENA_HALF_L - R);
        vz = -vz * this.RESTITUTION;
        vx *= this.SURFACE_FRICTION;
        vy *= this.SURFACE_FRICTION;
      }
    }

    this.simulatedPoints = points;
    this.currentBallIndex = 0;
    this.geometryDirty = true;
  }

  syncStateBaselines(ballState) {
    if (!ballState) return;
    const numCarsCount = Math.round(ballState[2]) || 1;
    this.lastCarHitSerials = [];
    for (let ci = 0; ci < numCarsCount; ci++) {
      this.lastCarHitSerials.push(ballState[22 + ci * 51 + 46]);
    }
    this.lastHitSerial = this.lastCarHitSerials[0] ?? 0;
    this.wasInCarContact = false;
    this.lastBallPosRS = { x: ballState[4], y: ballState[5], z: ballState[6] };
    this.lastBallVelRS = { x: ballState[16], y: ballState[17], z: ballState[18] };
    this.lastRecalcTime = 0;
  }

  notifyBallControl(ballState) {
    if (ballState) {
      this.lastBallState = ballState;
      this.syncStateBaselines(ballState);
    }
    this.simulateFromState(this.lastBallState);
  }

  notifyKickoffReset(ballState) {
    if (ballState) {
      this.lastBallState = ballState;
      this.syncStateBaselines(ballState);
    }
    this.clear();
  }

  forceRecalculate() {
    if (this.lastBallState) {
      this.simulateFromState(this.lastBallState);
    }
  }

  clear() {
    this.simulatedPoints = [];
    this.currentBallIndex = 0;
    this.geometry.setDrawRange(0, 0);
    this.geometryDirty = false;
  }

  /**
   * Per-frame update hook.
   * Multi-layered detection guarantees reliable recalculation on every car-ball impact,
   * continuous dribble/carry, soft touch, deflection, or trajectory divergence.
   */
  update({
    active,
    ballPosition,
    ballVelocity,
    ballState,
    ballHitSerial,
    carHitSerials,
    cars,
    numCars,
    kickoffReset
  }) {
    this.isActive = active;

    if (!this.isActive || !this.settings.enabled) {
      this.mesh.visible = false;
      return;
    }

    this.mesh.visible = true;

    if (ballState) {
      this.lastBallState = ballState;
    }
    if (ballPosition) {
      this.lastBallPos = ballPosition;
    }
    if (ballVelocity) {
      this.lastBallVel = ballVelocity;
    }

    if (kickoffReset) {
      this.notifyKickoffReset(ballState);
      return;
    }

    const b = ballState || this.lastBallState;
    if (!b) return;

    const numCarsCount = (numCars !== undefined) ? numCars : (Math.round(b[2]) || 1);
    const ballPosRS = { x: b[4], y: b[5], z: b[6] };
    const ballVelRS = { x: b[16], y: b[17], z: b[18] };
    const ballSpeedSq = ballVelRS.x * ballVelRS.x + ballVelRS.y * ballVelRS.y + ballVelRS.z * ballVelRS.z;
    const isBallStationary = ballSpeedSq < 25 && ballPosRS.z <= 95;

    // Ball motionless on arena floor (e.g. awaiting kickoff hit)
    if (isBallStationary) {
      if (this.simulatedPoints.length > 0) {
        this.clear();
      }
      this.syncStateBaselines(b);
      return;
    }

    // 1. Check discrete hit serial changes across all cars
    let hitSerialChanged = false;
    const currentSerials = [];
    for (let ci = 0; ci < numCarsCount; ci++) {
      const serial = (carHitSerials && carHitSerials[ci] !== undefined)
        ? carHitSerials[ci]
        : b[22 + ci * 51 + 46];
      currentSerials.push(serial);
    }

    if (this.lastCarHitSerials.length === 0) {
      this.lastCarHitSerials = currentSerials.slice();
      if (ballHitSerial !== undefined) this.lastHitSerial = ballHitSerial;
    } else {
      for (let ci = 0; ci < currentSerials.length; ci++) {
        const lastSerial = this.lastCarHitSerials[ci];
        if (lastSerial !== undefined && currentSerials[ci] !== lastSerial) {
          hitSerialChanged = true;
          this.lastCarHitSerials[ci] = currentSerials[ci];
        }
      }
      if (ballHitSerial !== undefined && this.lastHitSerial !== -1 && ballHitSerial !== this.lastHitSerial) {
        hitSerialChanged = true;
        this.lastHitSerial = ballHitSerial;
      }
    }

    // 2. Check physical Car-Ball proximity & contact
    let isNearCar = false;
    const CONTACT_DIST_SQ = 42025; // (205 units)^2: Octane bounding radius (~77) + ball radius (91.25) + margin buffer

    for (let ci = 0; ci < numCarsCount; ci++) {
      const carOffset = 22 + ci * 51;
      const carX = b[carOffset];
      const carY = b[carOffset + 1];
      const carZ = b[carOffset + 2];
      const fwdX = b[carOffset + 3], fwdY = b[carOffset + 4], fwdZ = b[carOffset + 5];
      const upX = b[carOffset + 9],  upY = b[carOffset + 10],  upZ = b[carOffset + 11];

      // Octane hitbox center offset (forward ~13.88, up ~20.76)
      const hbCenterX = carX + fwdX * 13.8757 + upX * 20.755;
      const hbCenterY = carY + fwdY * 13.8757 + upY * 20.755;
      const hbCenterZ = carZ + fwdZ * 13.8757 + upZ * 20.755;

      const dx = ballPosRS.x - hbCenterX;
      const dy = ballPosRS.y - hbCenterY;
      const dz = ballPosRS.z - hbCenterZ;
      const dSq = dx * dx + dy * dy + dz * dz;

      if (dSq <= CONTACT_DIST_SQ) {
        isNearCar = true;
        break;
      }
    }

    // Also check Three.js car meshes as fallback
    if (!isNearCar && cars && cars.length > 0 && ballPosition) {
      for (let ci = 0; ci < cars.length; ci++) {
        const carObj = cars[ci];
        if (!carObj || !carObj.position) continue;
        const cPos = carObj.position;
        const dx = ballPosition.x - cPos.x;
        const dy = ballPosition.y - (cPos.y + 20);
        const dz = ballPosition.z - cPos.z;
        const dSq = dx * dx + dy * dy + dz * dz;
        if (dSq <= CONTACT_DIST_SQ) {
          isNearCar = true;
          break;
        }
      }
    }

    // 3. Multi-layer Collision & Touch Detection Triggers
    const now = performance.now();
    let shouldRecalculate = false;

    // Trigger A: RocketSim registered discrete hit
    if (hitSerialChanged) {
      shouldRecalculate = true;
    }

    // Trigger B: Initial physical contact (transition from not near to near car)
    if (isNearCar && !this.wasInCarContact && ballSpeedSq > 20) {
      shouldRecalculate = true;
    }

    // Trigger C: Contact impulse or velocity discontinuity while in contact with car
    if (isNearCar && this.lastBallVelRS) {
      const dvx = ballVelRS.x - this.lastBallVelRS.x;
      const dvy = ballVelRS.y - this.lastBallVelRS.y;
      // Gravity in RocketSim: -650 UU/s^2. Over 1 tick (1/120s), vertical gravity change is ~-5.42 UU/s.
      const dvz = ballVelRS.z - this.lastBallVelRS.z;
      const dvzNonGravity = dvz + 5.42;
      const impulseSq = dvx * dvx + dvy * dvy + dvzNonGravity * dvzNonGravity;
      if (impulseSq > 80) { // delta-V exceeding ~9 UU/s non-gravity impulse
        shouldRecalculate = true;
      }
    }

    // Trigger D: Continuous contact (Dribbling / Carrying the ball on the roof)
    // Dynamic refresh throttled to ~35Hz (every ~28ms) so the launch arc tracks car steering/acceleration
    if (isNearCar && this.wasInCarContact && (now - this.lastRecalcTime > 28) && ballSpeedSq > 35) {
      shouldRecalculate = true;
    }

    // Trigger E: Empty trajectory when ball begins moving (e.g. first hit from stationary)
    if (this.simulatedPoints.length === 0 && ballSpeedSq > 25) {
      shouldRecalculate = true;
    }

    // 4. Trajectory Tracking & Divergence Detection (Safety Net for any missed deflection)
    if (!shouldRecalculate && this.simulatedPoints.length > 0 && ballPosition) {
      let bestIdx = this.currentBallIndex;
      let bestDistSq = Infinity;
      const searchStart = Math.max(0, this.currentBallIndex - 5);
      const searchEnd = Math.min(this.simulatedPoints.length, this.currentBallIndex + 35);

      for (let i = searchStart; i < searchEnd; i++) {
        const pt = this.simulatedPoints[i];
        const dx = pt.x - ballPosition.x;
        const dy = pt.y - ballPosition.y;
        const dz = pt.z - ballPosition.z;
        const dSq = dx * dx + dy * dy + dz * dz;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = i;
        }
      }

      // Trigger F: Physical trajectory divergence
      // Under free flight, ball tracks precomputed points within < 4 units squared.
      // If error exceeds 25 units squared near a car, or 100 units squared generally, recalculate!
      if ((isNearCar && bestDistSq > 25.0) || bestDistSq > 100.0) {
        shouldRecalculate = true;
      } else {
        if (bestIdx !== this.currentBallIndex) {
          this.currentBallIndex = bestIdx;
          this.geometryDirty = true;
        }

        // Trigger G: Trajectory nearing end while ball is still flying
        if (this.currentBallIndex >= this.simulatedPoints.length - 4 && ballSpeedSq > 100) {
          shouldRecalculate = true;
        }
      }
    }

    // 5. Perform simulation if triggered
    if (shouldRecalculate) {
      this.simulateFromState(b);
      this.lastRecalcTime = now;
      this.wasInCarContact = isNearCar;
      this.lastBallVelRS = { ...ballVelRS };
      this.lastBallPosRS = { ...ballPosRS };
      return;
    }

    this.wasInCarContact = isNearCar;
    this.lastBallVelRS = { ...ballVelRS };
    this.lastBallPosRS = { ...ballPosRS };
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

      // Scale ribbon width according to thickness (up to 100) and distance
      const camDist = this.camPos.distanceTo(this.curP);
      const scaleFactor = Math.max(0.6, Math.min(2.5, camDist / 1200));
      const halfWidth = (thickness * 0.5) * scaleFactor;
      this.side.normalize().multiplyScalar(halfWidth);

      const progress = (i - startIdx) / Math.max(1, totalPts - 1 - startIdx);
      const alpha = Math.max(0.15, 1.0 - progress * 0.7);

      if (vertCount + 2 > this.maxVertices) break;

      const vLeft = vertCount++;
      const vRight = vertCount++;

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
        inVisibleDash = true;
        dashStartVert = vLeft;
      } else {
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
    const styleId = 'trajectory-predictor-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        #app.trajectory-open > canvas {
          cursor: default !important;
        }
        .trajectory-panel {
          position: absolute;
          top: 64px;
          right: 20px;
          width: 320px;
          background: rgba(14, 20, 32, 0.94);
          border: 1px solid rgba(0, 240, 255, 0.35);
          border-radius: 12px;
          color: #f0f4f8;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 13px;
          box-shadow: 0 16px 36px rgba(0, 0, 0, 0.6), 0 0 20px rgba(0, 240, 255, 0.15);
          backdrop-filter: blur(12px);
          z-index: 1000;
          user-select: none;
          pointer-events: auto !important;
          cursor: default !important;
          transition: opacity 0.2s ease, transform 0.2s ease;
        }
        .trajectory-panel * {
          pointer-events: auto;
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
        }
        .trajectory-badge {
          background: rgba(0, 240, 255, 0.2);
          color: #00f0ff;
          border: 1px solid rgba(0, 240, 255, 0.4);
          border-radius: 4px;
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
          cursor: pointer !important;
          padding: 4px;
          border-radius: 6px;
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
          padding-bottom: 8px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }
        .trajectory-row__header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .trajectory-label {
          font-weight: 500;
          color: rgba(255, 255, 255, 0.85);
        }
        .trajectory-val {
          font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
          font-size: 12px;
          color: #00f0ff;
          font-weight: 600;
        }
        .trajectory-hint {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.45);
        }
        .trajectory-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 6px;
          background: rgba(255, 255, 255, 0.12);
          border-radius: 3px;
          outline: none;
          cursor: pointer !important;
          transition: background 0.15s;
        }
        .trajectory-slider:hover {
          background: rgba(255, 255, 255, 0.2);
        }
        .trajectory-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #00f0ff;
          cursor: pointer !important;
          box-shadow: 0 0 8px rgba(0, 240, 255, 0.8);
          transition: transform 0.1s;
        }
        .trajectory-slider::-webkit-slider-thumb:hover {
          transform: scale(1.2);
        }
        .trajectory-toggle {
          appearance: none;
          -webkit-appearance: none;
          width: 40px;
          height: 22px;
          background: rgba(255, 255, 255, 0.15);
          border-radius: 12px;
          position: relative;
          cursor: pointer !important;
          outline: none;
          transition: background 0.2s;
        }
        .trajectory-toggle:checked {
          background: #00f0ff;
        }
        .trajectory-toggle::before {
          content: '';
          position: absolute;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          top: 3px;
          left: 3px;
          background: #fff;
          transition: transform 0.2s;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
        }
        .trajectory-toggle:checked::before {
          transform: translateX(18px);
        }
        #trajectory-button {
          cursor: pointer !important;
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
          <span class="trajectory-badge">Active</span>
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
          <input type="range" id="traj-thickness" class="trajectory-slider" min="1.0" max="100.0" step="0.5" value="${this.settings.lineThickness}" />
          <span class="trajectory-hint">3D ribbon line thickness (1.0 – 100.0)</span>
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

        <div class="trajectory-row">
          <div class="trajectory-row__header">
            <label class="trajectory-label" for="traj-color">Line Color</label>
            <input type="color" id="traj-color" value="${this.settings.color || "#00f0ff"}" style="background:none;border:none;width:36px;height:24px;cursor:pointer;" />
          </div>
          <span class="trajectory-hint">Neon glow ribbon color</span>
        </div>
      </div>
    `;

    panel.addEventListener('pointerenter', () => {
      const appEl = document.getElementById('app') || document.body;
      if (appEl) appEl.classList.add('trajectory-open');
    });

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
      if (!this.settings.enabled) {
        this.mesh.visible = false;
        this.clear();
      } else {
        this.mesh.visible = true;
        this.geometryDirty = true;
        this.forceRecalculate();
      }
    });

    durationInput.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.settings.duration = val;
      durationVal.textContent = `${val.toFixed(1)}s`;
      this.saveSettings();
      this.geometryDirty = true;
      this.forceRecalculate();
    });

    thicknessInput.addEventListener('input', (e) => {
      const val = Math.max(1.0, Math.min(100.0, parseFloat(e.target.value) || 4.0));
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
      this.forceRecalculate();
    });

    hiddenInput.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      this.settings.hiddenTime = val;
      hiddenVal.textContent = `${val} ms`;
      this.saveSettings();
      this.geometryDirty = true;
      this.forceRecalculate();
    });

    const colorInput = panel.querySelector('#traj-color');
    if (colorInput) {
      colorInput.addEventListener('input', (e) => {
        this.settings.color = e.target.value;
        if (this.material && this.material.uniforms && this.material.uniforms.uColor) {
          this.material.uniforms.uColor.value.set(this.settings.color);
        }
        this.saveSettings();
        this.geometryDirty = true;
      });
    }

    closeBtn.addEventListener('click', () => {
      this.togglePanel(false);
    });

    // Create HUD trigger button in .hud-tools
    this.createHudButton();
  }

  syncUI() {
    if (!this.panel) return;
    const enabledInput = this.panel.querySelector('#traj-enabled');
    const durationInput = this.panel.querySelector('#traj-duration');
    const durationVal = this.panel.querySelector('#traj-duration-val');
    const thicknessInput = this.panel.querySelector('#traj-thickness');
    const thicknessVal = this.panel.querySelector('#traj-thickness-val');
    const existInput = this.panel.querySelector('#traj-exist');
    const existVal = this.panel.querySelector('#traj-exist-val');
    const hiddenInput = this.panel.querySelector('#traj-hidden');
    const hiddenVal = this.panel.querySelector('#traj-hidden-val');
    const colorInput = this.panel.querySelector('#traj-color');

    if (enabledInput) enabledInput.checked = !!this.settings.enabled;
    if (durationInput) durationInput.value = this.settings.duration;
    if (durationVal) durationVal.textContent = `${Number(this.settings.duration).toFixed(1)}s`;
    if (thicknessInput) thicknessInput.value = this.settings.lineThickness;
    if (thicknessVal) thicknessVal.textContent = Number(this.settings.lineThickness).toFixed(1);
    if (existInput) existInput.value = this.settings.existTime;
    if (existVal) existVal.textContent = `${this.settings.existTime} ms`;
    if (hiddenInput) hiddenInput.value = this.settings.hiddenTime;
    if (hiddenVal) hiddenVal.textContent = `${this.settings.hiddenTime} ms`;
    if (colorInput && this.settings.color) colorInput.value = this.settings.color;
  }

  createHudButton() {
    const hudTools = this.container.querySelector('.hud-tools');
    if (!hudTools) return;

    const btn = document.createElement('button');
    btn.id = 'trajectory-button';
    btn.className = 'hud-tool';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Trajectory Prediction');
    btn.setAttribute('title', 'Trajectory Prediction / 轨迹预测');
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

    btn.addEventListener('pointerenter', () => {
      const appEl = document.getElementById('app') || document.body;
      if (appEl) appEl.classList.add('trajectory-open');
    });

    hudTools.insertBefore(btn, hudTools.querySelector('#settings-button') || hudTools.firstChild);
    this.hudButton = btn;
  }

  togglePanel(forceState) {
    if (!this.panel) return;
    const shouldOpen = forceState !== undefined ? forceState : this.panel.hidden;
    this.panel.hidden = !shouldOpen;
    const appEl = document.getElementById('app') || document.body;
    if (appEl) {
      appEl.classList.toggle('trajectory-open', shouldOpen);
    }
    if (shouldOpen) {
      this.syncUI();
    }
    if (this.hudButton) {
      this.hudButton.classList.toggle('is-active', shouldOpen);
    }
  }

  get object() {
    return this.group;
  }
}
