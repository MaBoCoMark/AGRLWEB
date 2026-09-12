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
 *   - Car-to-ball collisions (both cars can hit both balls)
 *   - Ball-to-ball elastic collision
 * - Hot-swappable player control:
 *   - Dedicated UI button + hotkey (Tab / P) to toggle control between Car 0 and Car 1
 *   - The unselected car remains stationary (neutral input)
 * - Bottom-right UI button to exit multiplayer and return to training/freeplay
 */

export class MultiplayerManager {
  constructor(options = {}) {
    this.container = options.container || document.body;
    this.physics = options.physics;
    this.arena = options.arena; // ow instance
    this.cameraRig = options.cameraRig; // cw instance
    this.ballRadius = options.ballRadius || 91.25;
    this.createBall = options.createBall || null;

    this.isMultiplayer = false;
    this.activeCarIndex = 0; // 0 = Blue, 1 = Orange

    // Second ball (Orange ball) physics & visual state
    this.ball1Pos = { x: 350, y: 120, z: -450 };
    this.ball1Vel = { x: -50, y: 100, z: 120 };
    this.ball1Mesh = null;
    this.originalBall0Mesh = null;
    this.blueBallMesh = null;

    // Callbacks
    this.onStateChange = options.onStateChange || (() => {});

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
          Spawns <strong>2 cars</strong> (Blue & Orange) and <strong>2 soccer balls</strong> (White with Blue or Orange pattern).
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

    // Restore original Ball 0
    if (this.originalBall0Mesh) {
      this.originalBall0Mesh.visible = true;
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
      if (this.arena.ball) {
        // Hide default child mesh of arena.ball
        if (this.arena.ball.children.length > 0) {
          this.originalBall0Mesh = this.arena.ball.children[0];
          this.originalBall0Mesh.visible = false;
        }
        this.arena.ball.add(this.blueBallMesh);
      }
    } else {
      if (this.originalBall0Mesh) this.originalBall0Mesh.visible = false;
      this.blueBallMesh.visible = true;
    }

    // 2. Ball 1 (Orange Car ball): Create white base + orange pattern
    if (!this.ball1Mesh) {
      this.ball1Mesh = this.createBall(0xff6600, 'Orange patterned ball');
      this.arena.scene.add(this.ball1Mesh);
    }

    this.ball1Mesh.visible = true;
    this.ball1Pos = { x: 600, y: 180, z: -500 };
    this.ball1Vel = { x: -100, y: 350, z: 200 };
    this.ball1Mesh.position.set(this.ball1Pos.x, this.ball1Pos.y, this.ball1Pos.z);
  }

  /**
   * Physics step for the second ball (Orange ball) and ball-ball / car-ball collisions
   */
  updatePhysics(dt, cars = [], ball0Pos = null) {
    if (!this.isMultiplayer || !this.ball1Mesh || !this.ball1Mesh.visible) return;

    const g = -650; // gravity
    const r = this.ballRadius;
    const restitution = 0.65;
    const drag = 0.998;

    // Apply gravity & drag
    this.ball1Vel.y += g * dt;
    this.ball1Vel.x *= drag;
    this.ball1Vel.y *= drag;
    this.ball1Vel.z *= drag;

    // Integrate position
    this.ball1Pos.x += this.ball1Vel.x * dt;
    this.ball1Pos.y += this.ball1Vel.y * dt;
    this.ball1Pos.z += this.ball1Vel.z * dt;

    // Floor collision
    if (this.ball1Pos.y < r) {
      this.ball1Pos.y = r;
      this.ball1Vel.y = -this.ball1Vel.y * restitution;
      this.ball1Vel.x *= 0.95;
      this.ball1Vel.z *= 0.95;
    }

    // Ceiling collision
    const ceiling = 2044 - r;
    if (this.ball1Pos.y > ceiling) {
      this.ball1Pos.y = ceiling;
      this.ball1Vel.y = -this.ball1Vel.y * restitution;
    }

    // Side walls (X)
    const sideWall = 4096 - r;
    if (Math.abs(this.ball1Pos.x) > sideWall) {
      this.ball1Pos.x = Math.sign(this.ball1Pos.x) * sideWall;
      this.ball1Vel.x = -this.ball1Vel.x * restitution;
    }

    // Back walls (Z)
    const backWall = 5120 - r;
    if (Math.abs(this.ball1Pos.z) > backWall) {
      this.ball1Pos.z = Math.sign(this.ball1Pos.z) * backWall;
      this.ball1Vel.z = -this.ball1Vel.z * restitution;
    }

    // Car collisions with Ball 1
    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];
      if (!car || !car.visible) continue;

      const dx = this.ball1Pos.x - car.position.x;
      const dy = this.ball1Pos.y - car.position.y;
      const dz = this.ball1Pos.z - car.position.z;
      const dist = Math.hypot(dx, dy, dz);
      const hitRadius = r + 60; // Approximate car collision sphere

      if (dist < hitRadius && dist > 0.001) {
        const nx = dx / dist;
        const ny = dy / dist;
        const nz = dz / dist;

        // Separate out of car
        this.ball1Pos.x = car.position.x + nx * hitRadius;
        this.ball1Pos.y = car.position.y + ny * hitRadius;
        this.ball1Pos.z = car.position.z + nz * hitRadius;

        // Impart impulse
        const impactSpeed = 850;
        this.ball1Vel.x = nx * impactSpeed;
        this.ball1Vel.y = Math.max(200, ny * impactSpeed);
        this.ball1Vel.z = nz * impactSpeed;
      }
    }

    // Ball-to-ball elastic collision between Ball 0 and Ball 1
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

        // Separate overlapping balls
        const overlap = (minDist - ballDist) * 0.5;
        this.ball1Pos.x += nx * overlap;
        this.ball1Pos.y += ny * overlap;
        this.ball1Pos.z += nz * overlap;

        // Elastic bounce
        const relVel = this.ball1Vel.x * nx + this.ball1Vel.y * ny + this.ball1Vel.z * nz;
        if (relVel < 0) {
          const impulse = -relVel * 1.6;
          this.ball1Vel.x += nx * impulse;
          this.ball1Vel.y += ny * impulse;
          this.ball1Vel.z += nz * impulse;
        }
      }
    }

    // Update 3D mesh transform
    this.ball1Mesh.position.set(this.ball1Pos.x, this.ball1Pos.y, this.ball1Pos.z);
  }
}
