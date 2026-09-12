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

    this.isMultiplayer = false;
    this.activeCarIndex = 0; // 0 = Blue, 1 = Orange

    // Second ball (Orange ball) physics & visual state
    this.ball1Pos = { x: 300, y: 150, z: -400 };
    this.ball1Vel = { x: -80, y: 120, z: 100 };
    this.ball1Mesh = null;
    this.originalBall0Mesh = null;
    this.blueBallMesh = null;

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
  }

  /**
   * Physics step for the second ball (Orange ball) with realistic momentum transfer
   * and collision with cars, boundaries, and Ball 0.
   */
  updatePhysics(dt, cars = [], ball0Pos = null) {
    if (!this.isMultiplayer || !this.ball1Mesh || !this.ball1Mesh.visible) return;

    // Clamped time delta for numerical stability
    const subDt = Math.min(dt, 0.05);
    const g = -650; // RocketSim gravity uu/s^2
    const r = this.ballRadius;
    const restitution = 0.60;
    const drag = Math.pow(1 - 0.03, subDt); // RL air drag 0.03/s

    // 1. Gravity & air drag
    this.ball1Vel.y += g * subDt;
    this.ball1Vel.x *= drag;
    this.ball1Vel.y *= drag;
    this.ball1Vel.z *= drag;

    // 2. Position integration
    this.ball1Pos.x += this.ball1Vel.x * subDt;
    this.ball1Pos.y += this.ball1Vel.y * subDt;
    this.ball1Pos.z += this.ball1Vel.z * subDt;

    // 3. Pitch floor collision
    if (this.ball1Pos.y < r) {
      this.ball1Pos.y = r;
      if (Math.abs(this.ball1Vel.y) < 20) {
        this.ball1Vel.y = 0;
      } else {
        this.ball1Vel.y = -this.ball1Vel.y * restitution;
      }
      // Ground rolling friction
      this.ball1Vel.x *= 0.985;
      this.ball1Vel.z *= 0.985;
    }

    // 4. Ceiling collision
    const ceiling = 2044 - r;
    if (this.ball1Pos.y > ceiling) {
      this.ball1Pos.y = ceiling;
      this.ball1Vel.y = -Math.abs(this.ball1Vel.y) * restitution;
    }

    // 5. Side walls (X: +/- 4096)
    const sideWall = 4096 - r;
    if (Math.abs(this.ball1Pos.x) > sideWall) {
      this.ball1Pos.x = Math.sign(this.ball1Pos.x) * sideWall;
      this.ball1Vel.x = -this.ball1Vel.x * restitution;
    }

    // 6. Back walls and goal mouth (Z: +/- 5120)
    // Goal opening: |X| < 892.755 and Y < 642.775
    const isInsideGoalMouth = Math.abs(this.ball1Pos.x) < (892.755 - r) && this.ball1Pos.y < (642.775 - r);
    const backWall = isInsideGoalMouth ? (5120 + 880 - r) : (5120 - r);

    if (Math.abs(this.ball1Pos.z) > backWall) {
      this.ball1Pos.z = Math.sign(this.ball1Pos.z) * backWall;
      this.ball1Vel.z = -this.ball1Vel.z * restitution;
    }

    // 7. Car collisions with Ball 1 (physics-derived momentum impulse)
    const pState = this.physics && this.physics.state ? this.physics.state : null;

    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];
      if (!car || !car.visible) continue;

      const carCenterY = car.position.y + 16;
      const dx = this.ball1Pos.x - car.position.x;
      const dy = this.ball1Pos.y - carCenterY;
      const dz = this.ball1Pos.z - car.position.z;
      const dist = Math.hypot(dx, dy, dz);
      const hitRadius = r + 46; // Car collision boundary

      if (dist < hitRadius && dist > 0.001) {
        const nx = dx / dist;
        const ny = dy / dist;
        const nz = dz / dist;

        // Position resolution
        this.ball1Pos.x = car.position.x + nx * hitRadius;
        this.ball1Pos.y = Math.max(r, carCenterY + ny * hitRadius);
        this.ball1Pos.z = car.position.z + nz * hitRadius;

        // Retrieve actual car velocity from RocketSim state
        let carVx = 0, carVy = 0, carVz = 0;
        if (pState) {
          const p = 22 + i * 51; // ht.CARS + i * ln
          carVx = pState[p + 12]; // ye.VEL (RocketSim X -> Three X)
          carVz = pState[p + 13]; // RocketSim Y -> Three Z
          carVy = pState[p + 14]; // RocketSim Z -> Three Y
        }
        const carSpeed = Math.hypot(carVx, carVy, carVz);

        // Relative approach velocity along impact normal
        const relVx = carVx - this.ball1Vel.x;
        const relVy = carVy - this.ball1Vel.y;
        const relVz = carVz - this.ball1Vel.z;
        const approachSpeed = relVx * nx + relVy * ny + relVz * nz;

        if (approachSpeed > 0) {
          // Hard or medium hit: impulse proportional to approach speed + car speed
          const impulse = approachSpeed * 1.45 + carSpeed * 0.35 + 80;
          this.ball1Vel.x += nx * impulse;
          this.ball1Vel.y += ny * impulse;
          this.ball1Vel.z += nz * impulse;
        } else {
          // Glancing touch or car following ball: push ball ahead softly
          this.ball1Vel.x = carVx * 0.85 + nx * 40;
          this.ball1Vel.y = Math.max(this.ball1Vel.y, carVy * 0.85 + ny * 40);
          this.ball1Vel.z = carVz * 0.85 + nz * 40;
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

    // 8. Ball-to-ball elastic collision between Ball 0 and Ball 1
    if (ball0Pos) {
      const bx = this.ball1Pos.x - ball0Pos.x;
      const by = this.ball1Pos.y - ball0Pos.y;
      const bz = this.ball1Pos.z - ball0Pos.z;
      const ballDist = Math.hypot(bx, by, bz);
      const minDist = 2 * r;

      if (ballDist < minDist && ballDist > 0.001) {
        const nx = bx / ballDist;
        const ny = by / ballDist;
        const nz = bz / ballDist;

        // Separate Ball 1 from Ball 0
        const overlap = minDist - ballDist;
        this.ball1Pos.x += nx * overlap;
        this.ball1Pos.y += ny * overlap;
        this.ball1Pos.z += nz * overlap;

        // Relative velocity
        let b0Vx = 0, b0Vy = 0, b0Vz = 0;
        if (pState) {
          b0Vx = pState[4 + 12]; // ht.BALL + 12
          b0Vz = pState[4 + 13];
          b0Vy = pState[4 + 14];
        }
        const relVx = this.ball1Vel.x - b0Vx;
        const relVy = this.ball1Vel.y - b0Vy;
        const relVz = this.ball1Vel.z - b0Vz;
        const relVn = relVx * nx + relVy * ny + relVz * nz;

        if (relVn < 0) {
          const impulse = -relVn * 1.5;
          this.ball1Vel.x += nx * impulse;
          this.ball1Vel.y += ny * impulse;
          this.ball1Vel.z += nz * impulse;
        }
      }
    }

    // 9. Update 3D mesh transform and rolling rotation
    this.ball1Mesh.position.set(this.ball1Pos.x, this.ball1Pos.y, this.ball1Pos.z);
    this.ball1Mesh.scale.setScalar(1); // Enforce constant radius / scale

    // Realistic rolling spin
    this.ball1Mesh.rotation.z -= (this.ball1Vel.x * subDt) / r;
    this.ball1Mesh.rotation.x += (this.ball1Vel.z * subDt) / r;
  }
}
