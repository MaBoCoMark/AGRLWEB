/**
 * MultiplayerManager.js
 * Manages 2-Car / 2-Ball Local Hot-Swappable Multiplayer Mode powered entirely
 * by RocketSim WebAssembly physics simulation.
 * 
 * Features:
 * - UI Button to open confirmation dialog ("Enter Multiplayer Mode?")
 * - Spawns 2 cars: Blue (Car 0) and Orange (Car 1)
 * - Spawns 2 soccer balls with 100% IDENTICAL authentic RocketSim physics:
 *   - Ball 0: Blue patterned ball simulated by primary RocketSim Arena
 *   - Ball 1: Orange patterned ball simulated by secondary RocketSim Arena (physics2)
 *   - Full Bullet physics: accurate arena bevels, goal nets, ramps, bounce restitution, and car collisions
 * - Ground indicator ring and height indicator ring under Orange ball
 * - Hot-swappable player control:
 *   - Dedicated UI button + hotkey (Tab / P) to toggle control between Car 0 and Car 1
 *   - The unselected car remains neutral
 * - Bottom-right UI button to exit multiplayer and return to training/freeplay
 */

export class MultiplayerManager {
  constructor(options = {}) {
    this.container = options.container || document.body;
    this.physics = options.physics;
    this.createPhysicsInstance = options.createPhysicsInstance || null;
    this.carVisual = options.carVisual || 'default';
    this.arena = options.arena; // Arena instance
    this.cameraRig = options.cameraRig; // cw instance
    this.ballRadius = options.ballRadius || 91.25;
    this.createBall = options.createBall || null;
    this.createIndicatorRings = options.createIndicatorRings || null;

    this.isMultiplayer = false;
    this.activeCarIndex = 0; // 0 = Blue, 1 = Orange

    // Second RocketSim arena for Ball 1 (Orange ball)
    this.physics2 = null;
    this.prevState2 = null;
    this.currState2 = null;

    // Visual meshes
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
          Spawns <strong>2 cars</strong> (Blue & Orange) and <strong>2 soccer balls</strong> (Blue-patterned & Orange-patterned),
          both powered by RocketSim's authentic physics engine.<br/><br/>
          Cars are controlled alternately via hot-swap (<kbd>Tab</kbd> / <kbd>P</kbd> or on-screen button).
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

    // 3. Hot-Swap Switch Button (Active in multiplayer)
    this.switchBtn = document.createElement('button');
    this.switchBtn.id = 'mp-switch-btn';
    this.switchBtn.type = 'button';
    this.switchBtn.style.cssText = `
      position: fixed;
      top: 14px;
      right: 140px;
      z-index: 100;
      display: none;
      align-items: center;
      gap: 10px;
      padding: 7px 16px;
      background: rgba(12, 20, 32, 0.88);
      border: 2px solid #0088ff;
      border-radius: 6px;
      color: #ffffff;
      font-family: var(--sans, sans-serif);
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.5px;
      cursor: pointer;
      backdrop-filter: blur(8px);
      box-shadow: 0 4px 16px rgba(0, 136, 255, 0.4);
      transition: all 0.2s ease;
    `;
    this.switchBtn.innerHTML = `
      <span id="mp-car-badge" style="
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #0088ff;
        display: inline-block;
        box-shadow: 0 0 8px currentColor;
      "></span>
      <span id="mp-switch-text">CONTROLLING: BLUE CAR (Press Tab / Click)</span>
    `;
    this.switchBtn.addEventListener('click', () => this.switchPlayer());
    this.container.appendChild(this.switchBtn);

    // 4. Exit Multiplayer Button (Bottom-Right)
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

  async startMultiplayer() {
    this.isMultiplayer = true;
    this.activeCarIndex = 0;

    // Show in-game HUDs
    this.entryBtn.style.display = 'none';
    this.switchBtn.style.display = 'inline-flex';
    this.exitBtn.style.display = 'inline-flex';

    // Hook RocketSim to simulate 2 cars in main arena
    if (this.onEnterMultiplayer) {
      this.onEnterMultiplayer();
    }

    // Set up second RocketSim arena for Ball 1 (Orange ball)
    if (!this.physics2 && this.createPhysicsInstance) {
      try {
        this.physics2 = this.createPhysicsInstance();
        await this.physics2.init();
      } catch (err) {
        console.error('Failed to initialize RocketSim physics2 for Ball 1:', err);
      }
    }
    if (this.physics2) {
      this.physics2.configureMultiplayer(this.carVisual === 'flat-car' ? 'flat' : 'default');
      this.physics2.resetKickoff();
      this.prevState2 = new Float32Array(this.physics2.stateLen);
      this.currState2 = new Float32Array(this.physics2.stateLen);
      this.prevState2.set(this.physics2.state);
      this.currState2.set(this.physics2.state);
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

    // 3. Ground Indicator Rings for Ball 1 (Orange ball)
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
   * Step secondary RocketSim Arena (physics2) in lockstep with primary physics.
   */
  stepPhysics2(count = 1) {
    if (!this.isMultiplayer || !this.physics2 || !this.currState2) return;
    if (count > 1) {
      this.physics2.step(count - 1);
      this.prevState2.set(this.physics2.state);
      this.physics2.step(1);
    } else {
      const a = this.prevState2;
      this.prevState2 = this.currState2;
      this.currState2 = a;
      this.physics2.step(1);
    }
    this.currState2.set(this.physics2.state);
  }

  /**
   * Reset kickoff on secondary RocketSim Arena.
   */
  resetKickoff() {
    if (this.physics2) {
      this.physics2.resetKickoff();
      if (this.prevState2 && this.currState2) {
        this.prevState2.set(this.physics2.state);
        this.currState2.set(this.physics2.state);
      }
    }
  }

  /**
   * Update visual positions for Ball 1 using exact RocketSim Bullet physics state.
   */
  updateVisuals(alpha = 1) {
    if (!this.isMultiplayer || !this.ball1Mesh || !this.ball1Mesh.visible || !this.physics2 || !this.prevState2 || !this.currState2) return;

    // Apply RocketSim Bullet physics position & quaternion (offset 4 = ht.BALL)
    this.arena.applyPhys(this.ball1Mesh, this.prevState2, this.currState2, 4, alpha);

    // Ground and height indicator rings
    if (this.ball1IndicatorRing) {
      this.ball1IndicatorRing.position.set(this.ball1Mesh.position.x, 1, this.ball1Mesh.position.z);
    }
    if (this.ball1IndicatorHeightRing) {
      this.ball1IndicatorHeightRing.position.copy(this.ball1Mesh.position);
    }
  }

  /**
   * Deprecated manual JS physics loop replaced by RocketSim physics2 simulation.
   * Retained as no-op for backward compatibility.
   */
  updatePhysics(dt, cars = [], ball0Pos = null) {
    // Replaced by stepPhysics2 & updateVisuals with RocketSim WASM
  }
}
