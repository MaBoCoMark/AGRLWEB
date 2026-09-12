/**
 * MultiplayerManager.js
 * Manages 2-Car / 2-Ball Local Hot-Swappable Multiplayer Mode.
 * 
 * Requirements:
 * - UI Button to open confirmation dialog ("Enter Multiplayer Mode?")
 * - Spawns 2 cars: Blue (Car 0) and Orange (Car 1)
 * - Spawns 2 soccer balls:
 *   - Blue-patterned ball (tracked exclusively by Blue car's ball cam)
 *   - Orange-patterned ball (tracked exclusively by Orange car's ball cam)
 * - Both balls have full 3D physics and arena collision:
 *   - Car-to-ball collisions with dynamic momentum and speed restitution
 *   - Ball-to-ball elastic collision with separation
 *   - Ground indicator ring and height indicator ring under Orange ball
 *   - 120Hz substepping and corner / goal net boundary collision preventing pitch escapes
 * - Hot-swappable player control:
 *   - Dedicated UI button + hotkey (Tab / P) to toggle control between Car 0 and Car 1
 *   - The unselected car remains stationary (neutral input)
 * - Bottom-right UI button to exit multiplayer and return to training/freeplay
 */

export class MultiplayerManager {
  constructor(options = {}) {
    this.container = options.container || document.body;
    this.physics = options.physics;
    this.arena = options.arena; // Arena instance
    this.cameraRig = options.cameraRig; // cw instance
    this.ballRadius = options.ballRadius || 91.25;
    this.createBall = options.createBall || null;
    this.createIndicatorRings = options.createIndicatorRings || null;

    this.isMultiplayer = false;
    this.activeCarIndex = 0; // 0 = Blue, 1 = Orange

    // Second ball (Orange ball) physics & visual state
    this.ball1Pos = { x: 300, y: 150, z: -400 };
    this.ball1Vel = { x: -80, y: 120, z: 100 };
    this.ball1Mesh = null;
    this.originalBall0Mesh = null;
    this.blueBallMesh = null;

    // Ground indicator rings for Ball 1 (Orange ball)
    this.ball1IndicatorRing = null;
    this.ball1IndicatorHeightRing = null;

    // Callbacks for mode switching
    this.onStateChange = options.onStateChange || (() => {});
    this.onEnterMultiplayer = options.onEnterMultiplayer || null;
    this.onLeaveMultiplayer = options.onLeaveMultiplayer || null;

    this.createUI();
    this.setupKeyListeners();
  }

  createUI() {
    // 1. Entry button (placed on top/action bar)
    this.entryBtn = document.createElement('button');
    this.entryBtn.id = 'multiplayer-mode-btn';
    this.entryBtn.type = 'button';
    this.entryBtn.className = 'multiplayer-nav-btn';
    this.entryBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
        <circle cx="9" cy="7" r="4"></circle>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
      </svg>
      <span>Multiplayer</span>
    `;
    this.entryBtn.style.cssText = `
      position: fixed;
      top: 14px;
      right: 140px;
      z-index: 100;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 7px 14px;
      background: rgba(18, 55, 111, 0.85);
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.35);
      border-radius: 4px;
      font-family: var(--sans, sans-serif);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      backdrop-filter: blur(8px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      transition: background 0.15s ease, transform 0.1s ease;
    `;
    this.entryBtn.addEventListener('mouseenter', () => {
      this.entryBtn.style.background = 'rgba(28, 85, 171, 0.95)';
    });
    this.entryBtn.addEventListener('mouseleave', () => {
      this.entryBtn.style.background = 'rgba(18, 55, 111, 0.85)';
    });
    this.entryBtn.addEventListener('click', () => this.showConfirmModal());
    this.container.appendChild(this.entryBtn);

    // 2. Confirmation Modal Dialog
    this.modal = document.createElement('div');
    this.modal.id = 'multiplayer-confirm-modal';
    this.modal.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(4, 8, 16, 0.75);
      backdrop-filter: blur(6px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 2000;
    `;
    this.modal.innerHTML = `
      <div style="
        background: #101724;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 8px;
        width: 440px;
        max-width: 90vw;
        padding: 24px;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.8);
        color: #ffffff;
        font-family: var(--sans, sans-serif);
      ">
        <h2 style="margin: 0 0 12px 0; font-size: 20px; font-weight: 700; color: #59f168;">
          Enter Multiplayer Mode?
        </h2>
        <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.5; color: #a4b3c6;">
          Spawns <strong>2 cars</strong> (Blue & Orange) and <strong>2 soccer balls</strong> (Blue-patterned & Orange-patterned).
          Both cars are controlled alternately via hot-swap (<kbd>Tab</kbd> / <kbd>P</kbd> or on-screen button).
          Each car's Ball Cam exclusively targets its own ball.
        </p>
        <div style="display: flex; justify-content: flex-end; gap: 12px;">
          <button id="mp-cancel-btn" style="
            padding: 8px 18px;
            background: transparent;
            border: 1px solid rgba(255, 255, 255, 0.25);
            color: #d1d8e0;
            border-radius: 4px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
          ">Cancel</button>
          <button id="mp-confirm-btn" style="
            padding: 8px 20px;
            background: #2563eb;
            border: none;
            color: #ffffff;
            border-radius: 4px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 2px 8px rgba(37, 99, 235, 0.4);
          ">Enter Multiplayer</button>
        </div>
      </div>
    `;
    this.container.appendChild(this.modal);

    this.modal.querySelector('#mp-cancel-btn').addEventListener('click', () => this.hideConfirmModal());
    this.modal.querySelector('#mp-confirm-btn').addEventListener('click', () => {
      this.hideConfirmModal();
      this.startMultiplayer();
    });

    // 3. In-Game Switch Player Floating Button
    this.switchBtn = document.createElement('button');
    this.switchBtn.id = 'mp-switch-player-btn';
    this.switchBtn.type = 'button';
    this.switchBtn.style.cssText = `
      position: fixed;
      top: 14px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 100;
      display: none;
      align-items: center;
      gap: 10px;
      padding: 8px 18px;
      background: rgba(14, 23, 42, 0.9);
      border: 2px solid #0088ff;
      border-radius: 6px;
      color: #ffffff;
      font-family: var(--sans, sans-serif);
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      backdrop-filter: blur(8px);
      box-shadow: 0 4px 16px rgba(0, 136, 255, 0.4);
      user-select: none;
    `;
    this.switchBtn.innerHTML = `
      <span id="mp-car-badge" style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #0088ff;"></span>
      <span id="mp-switch-text">CONTROLLING: BLUE CAR (Press Tab / Click)</span>
    `;
    this.switchBtn.addEventListener('click', () => this.switchPlayer());
    this.container.appendChild(this.switchBtn);

    // 4. Exit Multiplayer Button (Bottom Right)
    this.exitBtn = document.createElement('button');
    this.exitBtn.id = 'mp-exit-btn';
    this.exitBtn.type = 'button';
    this.exitBtn.style.cssText = `
      position: fixed;
      bottom: 28px;
      right: 28px;
      z-index: 100;
      display: none;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      background: rgba(185, 28, 28, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: 4px;
      color: #ffffff;
      font-family: var(--sans, sans-serif);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
      transition: background 0.15s ease;
    `;
    this.exitBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
      <span>Exit Multiplayer</span>
    `;
    this.exitBtn.addEventListener('click', () => this.exitMultiplayer());
    this.container.appendChild(this.exitBtn);
  }

  setupKeyListeners() {
    window.addEventListener('keydown', (e) => {
      if (!this.isMultiplayer) return;
      if (e.code === 'Tab' || e.code === 'KeyP') {
        e.preventDefault();
        this.switchPlayer();
      }
    });
  }

  showConfirmModal() {
    this.modal.style.display = 'flex';
  }

  hideConfirmModal() {
    this.modal.style.display = 'none';
  }

  startMultiplayer() {
    this.isMultiplayer = true;
    this.activeCarIndex = 0;

    // Show in-game HUDs
    this.entryBtn.style.display = 'none';
    this.switchBtn.style.display = 'inline-flex';
    this.exitBtn.style.display = 'inline-flex';

    // Hook RocketSim to simulate 2 cars
    if (this.onEnterMultiplayer) {
      this.onEnterMultiplayer();
    }

    // Ensure opponent car is visible
    if (this.arena && this.arena.cars && this.arena.cars[1]) {
      this.arena.cars[1].visible = true;
      if (this.arena.opponentSun) {
        this.arena.opponentSun.visible = true;
      }
    }

    // Set up Blue patterned ball for Car 0 and Orange patterned ball for Car 1
    this.setupPatternedBalls();

    this.updateSwitchUI();
    this.onStateChange(true, this.activeCarIndex);
  }

  exitMultiplayer() {
    this.isMultiplayer = false;
    this.activeCarIndex = 0;

    this.switchBtn.style.display = 'none';
    this.exitBtn.style.display = 'none';
    this.entryBtn.style.display = 'inline-flex';

    // Restore RocketSim to 1-car training/freeplay
    if (this.onLeaveMultiplayer) {
      this.onLeaveMultiplayer();
    }

    // Hide opponent car in freeplay
    if (this.arena && this.arena.cars && this.arena.cars[1]) {
      this.arena.cars[1].visible = false;
      if (this.arena.opponentSun) {
        this.arena.opponentSun.visible = false;
      }
    }

    // Hide second ball
    if (this.ball1Mesh) {
      this.ball1Mesh.visible = false;
    }

    // Hide indicator rings for Ball 1
    if (this.ball1IndicatorRing) {
      this.ball1IndicatorRing.visible = false;
    }
    if (this.ball1IndicatorHeightRing) {
      this.ball1IndicatorHeightRing.visible = false;
    }

    // Restore original Ball 0 mesh
    if (this.arena && this.arena.ball) {
      for (let i = 0; i < this.arena.ball.children.length; i++) {
        const child = this.arena.ball.children[i];
        if (child !== this.blueBallMesh) {
          child.visible = true;
        }
      }
    }
    if (this.blueBallMesh) {
      this.blueBallMesh.visible = false;
    }

    this.onStateChange(false, 0);
  }

  switchPlayer() {
    if (!this.isMultiplayer) return;
    this.activeCarIndex = this.activeCarIndex === 0 ? 1 : 0;
    this.updateSwitchUI();
    this.onStateChange(true, this.activeCarIndex);
  }

  updateSwitchUI() {
    const isBlue = this.activeCarIndex === 0;
    const color = isBlue ? '#0088ff' : '#ff6600';
    const name = isBlue ? 'BLUE CAR' : 'ORANGE CAR';

    this.switchBtn.style.borderColor = color;
    this.switchBtn.style.boxShadow = `0 4px 16px ${isBlue ? 'rgba(0,136,255,0.4)' : 'rgba(255,102,0,0.4)'}`;
    
    const badge = this.switchBtn.querySelector('#mp-car-badge');
    if (badge) badge.style.background = color;

    const text = this.switchBtn.querySelector('#mp-switch-text');
    if (text) text.textContent = `CONTROLLING: ${name} (Press Tab / Click)`;
  }

  setupPatternedBalls() {
    if (!this.arena || !this.arena.scene || !this.createBall) return;

    // 1. Ball 0 (Blue Car ball): Swap visual to white base + blue pattern
    if (!this.blueBallMesh) {
      this.blueBallMesh = this.createBall(0x0088ff, 'Blue patterned ball');
      this.blueBallMesh.scale.setScalar(1);
      if (this.arena.ball) {
        // Hide default children of arena.ball
        for (let i = 0; i < this.arena.ball.children.length; i++) {
          this.arena.ball.children[i].visible = false;
        }
        this.arena.ball.add(this.blueBallMesh);
      }
    } else {
      if (this.arena.ball) {
        for (let i = 0; i < this.arena.ball.children.length; i++) {
          const child = this.arena.ball.children[i];
          if (child !== this.blueBallMesh) child.visible = false;
        }
      }
      this.blueBallMesh.visible = true;
    }

    // 2. Ball 1 (Orange Car ball): Create white base + orange pattern
    if (!this.ball1Mesh) {
      this.ball1Mesh = this.createBall(0xff6600, 'Orange patterned ball');
      this.ball1Mesh.scale.setScalar(1);
      this.arena.scene.add(this.ball1Mesh);
    }

    this.ball1Mesh.visible = true;
    this.ball1Mesh.scale.setScalar(1);
    this.ball1Pos = { x: 350, y: 150, z: -500 };
    this.ball1Vel = { x: -80, y: 120, z: 100 };
    this.ball1Mesh.position.set(this.ball1Pos.x, this.ball1Pos.y, this.ball1Pos.z);

    // 3. Ground Indicator Rings for Ball 1 (White circle on ground + height ring)
    if (!this.ball1IndicatorRing && this.createIndicatorRings && this.arena.scene) {
      const { ring, heightRing } = this.createIndicatorRings(this.ballRadius);
      this.ball1IndicatorRing = ring;
      this.ball1IndicatorHeightRing = heightRing;
      this.arena.scene.add(this.ball1IndicatorRing);
      this.arena.scene.add(this.ball1IndicatorHeightRing);
    }
    if (this.ball1IndicatorRing) this.ball1IndicatorRing.visible = true;
    if (this.ball1IndicatorHeightRing) this.ball1IndicatorHeightRing.visible = true;
  }

  /**
   * Physics step for the second ball (Orange ball) with realistic momentum transfer,
   * 120Hz substepping, accurate OBB car-ball hit impulse, 45-degree corner walls,
   * airtight goal net boundaries, and ground indicator rings.
   */
  updatePhysics(dt, cars = [], ball0Pos = null) {
    if (!this.isMultiplayer || !this.ball1Mesh || !this.ball1Mesh.visible) return;

    // Substepping at ~120Hz (RL tick rate) to completely prevent tunneling through walls
    const totalDt = Math.min(dt, 0.05);
    const numSubsteps = Math.max(2, Math.ceil(totalDt / 0.008333));
    const subDt = totalDt / numSubsteps;

    const g = -650; // Rocket League gravity uu/s^2
    const r = this.ballRadius; // 91.25 uu
    const restitution = 0.60;
    const airDrag = Math.pow(1 - 0.03, subDt); // RL air drag 0.03/s

    const pState = this.physics && this.physics.state ? this.physics.state : null;

    for (let step = 0; step < numSubsteps; step++) {
      // 1. Gravity & air drag
      this.ball1Vel.y += g * subDt;
      this.ball1Vel.x *= airDrag;
      this.ball1Vel.y *= airDrag;
      this.ball1Vel.z *= airDrag;

      // 2. Position integration
      this.ball1Pos.x += this.ball1Vel.x * subDt;
      this.ball1Pos.y += this.ball1Vel.y * subDt;
      this.ball1Pos.z += this.ball1Vel.z * subDt;

      // 3. Pitch floor collision
      if (this.ball1Pos.y < r) {
        this.ball1Pos.y = r;
        if (this.ball1Vel.y < 0) {
          if (Math.abs(this.ball1Vel.y) < 25) {
            this.ball1Vel.y = 0;
          } else {
            this.ball1Vel.y = -this.ball1Vel.y * restitution;
          }
        }
        // Ground rolling friction
        this.ball1Vel.x *= 0.995;
        this.ball1Vel.z *= 0.995;
      }

      // 4. Ceiling collision (RL ceiling height = 2044)
      const ceiling = 2044 - r;
      if (this.ball1Pos.y > ceiling) {
        this.ball1Pos.y = ceiling;
        if (this.ball1Vel.y > 0) {
          this.ball1Vel.y = -this.ball1Vel.y * restitution;
        }
      }

      // 5. Arena boundaries & Goal collision
      // Pitch dimensions: X in [-4096, 4096], Z in [-5120, 5120]
      // Goal opening: |X| < 892.755, Y < 642.775, depth = 880 (back at |Z| = 6000)
      const absZ = Math.abs(this.ball1Pos.z);
      const absX = Math.abs(this.ball1Pos.x);
      const signZ = Math.sign(this.ball1Pos.z) || 1;
      const signX = Math.sign(this.ball1Pos.x) || 1;

      if (absZ > 5120) {
        // Inside or passing into goal net area
        const goalNetDepth = 5120 + 880 - r; // 5908.75
        const goalNetHalfW = 892.755 - r;   // 801.5
        const goalNetH = 642.775 - r;       // 551.5

        // Back net
        if (absZ > goalNetDepth) {
          this.ball1Pos.z = signZ * goalNetDepth;
          if (this.ball1Vel.z * signZ > 0) {
            this.ball1Vel.z = -this.ball1Vel.z * restitution;
          }
        }

        // Side nets
        if (absX > goalNetHalfW) {
          this.ball1Pos.x = signX * goalNetHalfW;
          if (this.ball1Vel.x * signX > 0) {
            this.ball1Vel.x = -this.ball1Vel.x * restitution;
          }
        }

        // Roof net
        if (this.ball1Pos.y > goalNetH) {
          this.ball1Pos.y = goalNetH;
          if (this.ball1Vel.y > 0) {
            this.ball1Vel.y = -this.ball1Vel.y * restitution;
          }
        }
      } else {
        // Main arena pitch (|Z| <= 5120)

        // Backboards (Z = +/- 5120 outside the goal opening)
        const isOutsideGoalMouth = absX >= (892.755 - r) || this.ball1Pos.y >= (642.775 - r);
        if (isOutsideGoalMouth && absZ > (5120 - r)) {
          this.ball1Pos.z = signZ * (5120 - r);
          if (this.ball1Vel.z * signZ > 0) {
            this.ball1Vel.z = -this.ball1Vel.z * restitution;
          }
        }

        // Side walls (X = +/- 4096)
        if (absX > (4096 - r)) {
          this.ball1Pos.x = signX * (4096 - r);
          if (this.ball1Vel.x * signX > 0) {
            this.ball1Vel.x = -this.ball1Vel.x * restitution;
          }
        }

        // 45-degree corner walls
        // Rocket League corner connects (2944, 5120) and (4096, 3968).
        // Diagonal distance equation: |X| + |Z| <= 8064
        // Accounting for ball radius: |X| + |Z| <= 8064 - r * sqrt(2) = 7934.95
        if (absX > 2500 && absZ > 3500) {
          const cornerDist = absX + absZ;
          const cornerLimit = 8064 - r * 1.41421356;
          if (cornerDist > cornerLimit) {
            const overlap = (cornerDist - cornerLimit) * 0.70710678;
            this.ball1Pos.x -= signX * overlap * 0.70710678;
            this.ball1Pos.z -= signZ * overlap * 0.70710678;

            const vn = (this.ball1Vel.x * signX + this.ball1Vel.z * signZ) * 0.70710678;
            if (vn > 0) {
              const impulse = (1 + restitution) * vn;
              this.ball1Vel.x -= signX * impulse * 0.70710678;
              this.ball1Vel.z -= signZ * impulse * 0.70710678;
            }
          }
        }

        // Goal posts collision (cylinders at X = +/- 892.755, Z = +/- 5120)
        for (const postSignX of [-1, 1]) {
          for (const postSignZ of [-1, 1]) {
            const postX = postSignX * 892.755;
            const postZ = postSignZ * 5120;
            const postRadius = 35;
            const postHeight = 642.775;

            if (this.ball1Pos.y <= postHeight + r) {
              const pdx = this.ball1Pos.x - postX;
              const pdz = this.ball1Pos.z - postZ;
              const pDist = Math.hypot(pdx, pdz);
              const minP = postRadius + r;

              if (pDist < minP && pDist > 0.001) {
                const pnx = pdx / pDist;
                const pnz = pdz / pDist;
                const pOverlap = minP - pDist;
                this.ball1Pos.x += pnx * pOverlap;
                this.ball1Pos.z += pnz * pOverlap;

                const pVn = this.ball1Vel.x * pnx + this.ball1Vel.z * pnz;
                if (pVn < 0) {
                  this.ball1Vel.x -= (1 + restitution) * pVn * pnx;
                  this.ball1Vel.z -= (1 + restitution) * pVn * pnz;
                }
              }
            }
          }
        }
      }

      // 6. Car collisions with Ball 1 (Box OBB hit detection + dynamic momentum)
      for (let i = 0; i < cars.length; i++) {
        const car = cars[i];
        if (!car || !car.visible) continue;

        // Retrieve actual car velocity from RocketSim state
        let carVx = 0, carVy = 0, carVz = 0;
        if (pState) {
          const p = 22 + i * 51; // ht.CARS + i * ln
          carVx = pState[p + 12]; // ye.VEL: RocketSim X -> Three X
          carVz = pState[p + 13]; // RocketSim Y -> Three Z
          carVy = pState[p + 14]; // RocketSim Z -> Three Y
        }
        const carSpeed = Math.hypot(carVx, carVy, carVz);

        // Standard Octane hitbox dimensions & offsets
        const halfL = 59.0;
        const halfW = 42.1;
        const halfH = 18.1;
        const forwardOffset = 13.88;
        const upOffset = 20.75;

        // Compute world axes from car quaternion
        const q = car.quaternion;
        const qx = q.x, qy = q.y, qz = q.z, qw = q.w;

        // Local X (forward) in world:
        const fwdX = 1 - 2 * (qy * qy + qz * qz);
        const fwdY = 2 * (qx * qy + qz * qw);
        const fwdZ = 2 * (qx * qz - qy * qw);

        // Local Y (up) in world:
        const upX = 2 * (qx * qy - qz * qw);
        const upY = 1 - 2 * (qx * qx + qz * qz);
        const upZ = 2 * (qy * qz + qx * qw);

        // Local Z (right/side) in world:
        const rightX = 2 * (qx * qz + qy * qw);
        const rightY = 2 * (qy * qz - qx * qw);
        const rightZ = 1 - 2 * (qx * qx + qy * qy);

        // Hitbox center in world space
        const carCenterX = car.position.x + fwdX * forwardOffset + upX * upOffset;
        const carCenterY = car.position.y + fwdY * forwardOffset + upY * upOffset;
        const carCenterZ = car.position.z + fwdZ * forwardOffset + upZ * upOffset;

        // World vector from car center to ball
        const wx = this.ball1Pos.x - carCenterX;
        const wy = this.ball1Pos.y - carCenterY;
        const wz = this.ball1Pos.z - carCenterZ;

        // Project onto car local axes
        const lx = wx * fwdX + wy * fwdY + wz * fwdZ;
        const ly = wx * upX + wy * upY + wz * upZ;
        const lz = wx * rightX + wy * rightY + wz * rightZ;

        // Clamp to box bounds
        const cx = Math.max(-halfL, Math.min(halfL, lx));
        const cy = Math.max(-halfH, Math.min(halfH, ly));
        const cz = Math.max(-halfW, Math.min(halfW, lz));

        const ldx = lx - cx;
        const ldy = ly - cy;
        const ldz = lz - cz;
        const lDist = Math.hypot(ldx, ldy, ldz);

        if (lDist < r) {
          // Collision detected!
          let lnx = 0, lny = 1, lnz = 0;
          let penetration = r;
          if (lDist > 0.001) {
            lnx = ldx / lDist;
            lny = ldy / lDist;
            lnz = ldz / lDist;
            penetration = r - lDist;
          } else {
            // Ball center inside car box: separate along shallowest axis
            const px = halfL - Math.abs(lx);
            const py = halfH - Math.abs(ly);
            const pz = halfW - Math.abs(lz);
            if (px < py && px < pz) {
              lnx = Math.sign(lx) || 1;
              penetration = px + r;
            } else if (py < pz) {
              lny = Math.sign(ly) || 1;
              penetration = py + r;
            } else {
              lnz = Math.sign(lz) || 1;
              penetration = pz + r;
            }
          }

          // Transform local normal to world space
          const wnx = lnx * fwdX + lny * upX + lnz * rightX;
          const wny = lnx * fwdY + lny * upY + lnz * rightY;
          const wnz = lnx * fwdZ + lny * upZ + lnz * rightZ;

          // Resolve penetration
          this.ball1Pos.x += wnx * penetration;
          this.ball1Pos.y = Math.max(r, this.ball1Pos.y + wny * penetration);
          this.ball1Pos.z += wnz * penetration;

          // Relative velocity along impact normal
          const relVx = carVx - this.ball1Vel.x;
          const relVy = carVy - this.ball1Vel.y;
          const relVz = carVz - this.ball1Vel.z;
          const approachSpeed = relVx * wnx + relVy * wny + relVz * wnz;

          if (approachSpeed > 0) {
            // Power shot bonus if hitting with front bumper (lnx > 0.4)
            const isFrontHit = lnx > 0.4;
            const frontFactor = isFrontHit ? 1.35 : 1.0;
            const impulse = (approachSpeed * 1.55 + carSpeed * 0.4 + 100) * frontFactor;

            this.ball1Vel.x += wnx * impulse + carVx * 0.25;
            this.ball1Vel.y += wny * impulse + carVy * 0.25;
            this.ball1Vel.z += wnz * impulse + carVz * 0.25;
          } else {
            // Dribbling / soft contact
            this.ball1Vel.x = carVx * 0.85 + wnx * 50;
            this.ball1Vel.y = Math.max(this.ball1Vel.y, carVy * 0.85 + wny * 50);
            this.ball1Vel.z = carVz * 0.85 + wnz * 50;
          }

          // Clamp maximum ball velocity (RL max speed 4000 uu/s)
          const curSpeed = Math.hypot(this.ball1Vel.x, this.ball1Vel.y, this.ball1Vel.z);
          if (curSpeed > 4000) {
            const inv = 4000 / curSpeed;
            this.ball1Vel.x *= inv;
            this.ball1Vel.y *= inv;
            this.ball1Vel.z *= inv;
          }
        }
      }

      // 7. Ball-to-ball elastic collision between Ball 0 and Ball 1
      if (ball0Pos) {
        const bx = this.ball1Pos.x - ball0Pos.x;
        const by = this.ball1Pos.y - ball0Pos.y;
        const bz = this.ball1Pos.z - ball0Pos.z;
        const ballDist = Math.hypot(bx, by, bz);
        const minDist = 2 * r;

        if (ballDist < minDist && ballDist > 0.001) {
          const bnx = bx / ballDist;
          const bny = by / ballDist;
          const bnz = bz / ballDist;
          const bOverlap = minDist - ballDist;

          this.ball1Pos.x += bnx * bOverlap;
          this.ball1Pos.y = Math.max(r, this.ball1Pos.y + bny * bOverlap);
          this.ball1Pos.z += bnz * bOverlap;

          let b0Vx = 0, b0Vy = 0, b0Vz = 0;
          if (pState) {
            b0Vx = pState[4 + 12];
            b0Vz = pState[4 + 13];
            b0Vy = pState[4 + 14];
          }
          const relVx = this.ball1Vel.x - b0Vx;
          const relVy = this.ball1Vel.y - b0Vy;
          const relVz = this.ball1Vel.z - b0Vz;
          const relVn = relVx * bnx + relVy * bny + relVz * bnz;

          if (relVn < 0) {
            const impulse = -relVn * 1.5;
            this.ball1Vel.x += bnx * impulse;
            this.ball1Vel.y += bny * impulse;
            this.ball1Vel.z += bnz * impulse;
          }
        }
      }

      // 8. Fail-safe containment boundary: if ball somehow gets outside, safely recover it
      if (Math.abs(this.ball1Pos.x) > 4250 || this.ball1Pos.y < -20 || this.ball1Pos.y > 2150 || Math.abs(this.ball1Pos.z) > 6150) {
        this.ball1Pos = { x: 0, y: 150, z: -800 };
        this.ball1Vel = { x: 0, y: 0, z: 0 };
      }
    } // end substep loop

    // 9. Update 3D mesh transform and rolling rotation
    this.ball1Mesh.position.set(this.ball1Pos.x, this.ball1Pos.y, this.ball1Pos.z);
    this.ball1Mesh.scale.setScalar(1);

    this.ball1Mesh.rotation.z -= (this.ball1Vel.x * totalDt) / r;
    this.ball1Mesh.rotation.x += (this.ball1Vel.z * totalDt) / r;

    // 10. Update ground indicator ring and height indicator ring
    if (this.ball1IndicatorRing && this.ball1IndicatorHeightRing) {
      this.ball1IndicatorRing.position.set(this.ball1Pos.x, 2, this.ball1Pos.z);
      this.ball1IndicatorHeightRing.position.set(this.ball1Pos.x, 2, this.ball1Pos.z);
      const c = Math.max(0, this.ball1Pos.y - this.ballRadius);
      const d = 0.86 - 0.68 * Math.min(1, c / 1600);
      this.ball1IndicatorHeightRing.scale.set(d, d, 1);
    }
  }
}
