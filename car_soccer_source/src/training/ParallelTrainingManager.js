/**
 * ParallelTrainingManager.js
 * Multiplayer Parallel Training Mode (多人平行世界训练模式)
 *
 * Implements:
 * 1. Multi-Arena Physics: 6 independent RocketSim physics instances running concurrently at synchronized 120Hz.
 * 2. Single-Environment Rendering: 1 global stadium mesh/lighting with 5 lightweight ghost cars and 5 ghost balls.
 * 3. Slot Specifications & Visual Tinting: 6 dedicated slots with unique hex colors, teams, kickoff poses, and dyed soccer balls.
 * 4. Local Single-Player Hot-Switching & Camera: Hard cut instantaneous switch ("Drive This Car") without smooth lerp.
 * 5. Audio Isolation & Independent Goal/Reset: Muted background arenas; silent resets on background goals; quick reset on active slot only.
 * 6. UI Management Panel & Lifecycle: Frosted glass panel toggled via Tab or top-right "Menu (Tab)" button; clean mode enter/exit.
 */

export const PARALLEL_SLOTS = [
  {
    id: 0,
    name: 'Red',
    nameZh: '红',
    hex: '#ff7043',
    colorInt: 0xff7043,
    team: 1, // Orange/Red Team
    teamName: 'Orange Team',
    teamNameZh: '红队/橙队',
    spawn: { x: 2048, y: 2560, z: 17 },
    yawDeg: -135,
    kickoffIndex: 0
  },
  {
    id: 1,
    name: 'Green',
    nameZh: '绿',
    hex: '#66bb6a',
    colorInt: 0x66bb6a,
    team: 0, // Blue Team
    teamName: 'Blue Team',
    teamNameZh: '蓝队',
    spawn: { x: -2048, y: -2560, z: 17 },
    yawDeg: 45,
    kickoffIndex: 0
  },
  {
    id: 2,
    name: 'Yellow',
    nameZh: '黄',
    hex: '#ffc107',
    colorInt: 0xffc107,
    team: 1, // Orange/Red Team
    teamName: 'Orange Team',
    teamNameZh: '红队/橙队',
    spawn: { x: -2048, y: 2560, z: 17 },
    yawDeg: -45,
    kickoffIndex: 1
  },
  {
    id: 3,
    name: 'Blue',
    nameZh: '蓝',
    hex: '#42a5f5',
    colorInt: 0x42a5f5,
    team: 0, // Blue Team
    teamName: 'Blue Team',
    teamNameZh: '蓝队',
    spawn: { x: 2048, y: -2560, z: 17 },
    yawDeg: 135,
    kickoffIndex: 1
  },
  {
    id: 4,
    name: 'Pink',
    nameZh: '粉',
    hex: '#fd6e9d',
    colorInt: 0xfd6e9d,
    team: 1, // Orange/Red Team
    teamName: 'Orange Team',
    teamNameZh: '红队/橙队',
    spawn: { x: 0, y: 4608, z: 17 },
    yawDeg: -90,
    kickoffIndex: 4
  },
  {
    id: 5,
    name: 'Purple',
    nameZh: '紫',
    hex: '#ba68c8',
    colorInt: 0xba68c8,
    team: 0, // Blue Team
    teamName: 'Blue Team',
    teamNameZh: '蓝队',
    spawn: { x: 0, y: -4608, z: 17 },
    yawDeg: 90,
    kickoffIndex: 4
  }
];

const ZERO_CONTROLS = {
  throttle: 0,
  steer: 0,
  pitch: 0,
  yaw: 0,
  roll: 0,
  jump: false,
  boost: false,
  handbrake: false
};

export class ParallelTrainingManager {
  constructor(options = {}) {
    this.container = options.container || document.body;
    this.arenaWorld = options.arenaWorld;
    this.cameraManager = options.cameraManager;
    this.inputManager = options.inputManager;
    this.padInputManager = options.padInputManager;
    this.physicsClass = options.physicsClass;
    this.createCarMesh = options.createCarMesh;
    this.createBallMesh = options.createBallMesh;
    this.recolorCar = options.recolorCar;
    this.resetEngineAudio = options.resetEngineAudio || (() => {});
    this.onSwitchCallback = options.onSwitchCallback || null;
    this.constants = {
      ht: options.ht || { TICK: 0, GOAL: 1, NUM_CARS: 2, NUM_PADS: 3, BALL: 4, CARS: 22 },
      ye: options.ye || { POS: 0, FWD: 3, RIGHT: 6, UP: 9, VEL: 12, ANG_VEL: 15, BOOST: 18, DEMOED: 21 },
      ln: options.ln || 51
    };

    this.activeSlot = 0;
    this.isActive = false;
    this.isMenuOpen = false;
    this.isInitializing = false;

    // 6 Physics arenas
    this.arenas = [null, null, null, null, null, null];
    this.prevStates = [null, null, null, null, null, null];
    this.currStates = [null, null, null, null, null, null];
    this.unlimitedBoost = [false, false, false, false, false, false];

    // Visual ghost meshes group (single environment rendering)
    if (this.arenaWorld && this.arenaWorld.ball && this.arenaWorld.ball.constructor) {
      this.ghostGroup = new this.arenaWorld.ball.constructor();
    } else {
      this.ghostGroup = { name: 'ParallelTrainingGhosts', children: [], add(c){ this.children.push(c); }, remove(c){ const i = this.children.indexOf(c); if(i>=0) this.children.splice(i, 1); }, clear(){ this.children = []; } };
    }
    this.ghostGroup.name = 'ParallelTrainingGhosts';
    this.ghostCars = [null, null, null, null, null, null];
    this.ghostBalls = [null, null, null, null, null, null];

    // Dedicated active ball meshes per slot
    this.activeBallMeshes = [null, null, null, null, null, null];

    // Math temporary matrix and quaternions
    if (this.arenaWorld && this.arenaWorld.ball && this.arenaWorld.ball.quaternion) {
      this._m4 = this.arenaWorld.ball.matrix.clone();
      this._q1 = this.arenaWorld.ball.quaternion.clone();
      this._q2 = this.arenaWorld.ball.quaternion.clone();
    }

    // DOM UI elements
    this.panelOverlay = null;
    this.menuButton = null;
    this.hudToggleButton = null;

    // Stored native Freeplay states for restoration on exit
    this.savedBallChild = null;
    this.disabledConflictElements = [];

    this._onKeyDown = this._onKeyDown.bind(this);
    this._buildUI();
    window.addEventListener('keydown', this._onKeyDown, { capture: true });
  }

  /**
   * Global keyboard shortcut listener: Tab toggles the parallel training menu
   */
  _onKeyDown(e) {
    if (e.code === 'Tab') {
      if (this.isActive) {
        e.preventDefault();
        e.stopPropagation();
        this.toggleMenu();
      }
    }
  }

  /**
   * Initialize and enter Parallel Training Mode
   */
  async enter(primaryPhysicsSim = null) {
    if (this.isActive || this.isInitializing) return;
    this.isInitializing = true;

    try {
      // 1. Hide & disable native Freeplay shortcut conflict tools
      this._disableFreeplayConflicts();

      // 2. Setup Slot 0 arena (using existing primary arena or fresh)
      if (primaryPhysicsSim) {
        this.arenas[0] = primaryPhysicsSim;
      } else if (!this.arenas[0]) {
        this.arenas[0] = new this.physicsClass();
        await this.arenas[0].init();
        this.arenas[0].addCar(PARALLEL_SLOTS[0].team, 'default');
      }

      // Initialize slot 0 state buffers
      this.prevStates[0] = this.arenas[0].state.slice();
      this.currStates[0] = this.arenas[0].state.slice();

      // 3. Initialize background Arenas (Slots 1 to 5)
      for (let i = 1; i < 6; i++) {
        if (!this.arenas[i]) {
          const arena = new this.physicsClass();
          await arena.init();
          arena.addCar(PARALLEL_SLOTS[i].team, 'default');
          this.arenas[i] = arena;
        }
        this.prevStates[i] = this.arenas[i].state.slice();
        this.currStates[i] = this.arenas[i].state.slice();
      }

      // 4. Configure Kickoffs for all 6 arenas
      for (let i = 0; i < 6; i++) {
        this._resetArenaToKickoff(i);
      }

      // 5. Build visual meshes: 6 ghost cars + 6 ghost balls + 6 active ball meshes
      this._buildVisualMeshes();

      // 6. Ensure ghostGroup is added to the Three.js stadium scene
      if (this.arenaWorld && this.arenaWorld.scene) {
        if (!this.arenaWorld.scene.children.includes(this.ghostGroup)) {
          this.arenaWorld.scene.add(this.ghostGroup);
        }
      }

      // 7. Activate Slot 0 as default
      this.isActive = true;
      this.activeSlot = 0;
      this._applySlotVisuals(0, true);

      // 8. Update UI indicators
      if (this.menuButton) this.menuButton.style.display = 'flex';
      if (this.hudToggleButton) {
        this.hudToggleButton.classList.add('is-active');
        this.hudToggleButton.setAttribute('title', 'Parallel Training Active (Tab to Open Menu)');
      }
      this._renderCards();

    } catch (err) {
      console.error('[ParallelTrainingManager] Error entering parallel training mode:', err);
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Exit Parallel Training Mode and restore native single-player Freeplay
   */
  exit() {
    if (!this.isActive) return;

    // 1. Close Menu Panel
    this.closeMenu();
    if (this.menuButton) this.menuButton.style.display = 'none';
    if (this.hudToggleButton) {
      this.hudToggleButton.classList.remove('is-active');
      this.hudToggleButton.setAttribute('title', 'Multiplayer Parallel Training (多人平行世界)');
    }

    // 2. Clean up background arenas (Slots 1 to 5)
    for (let i = 1; i < 6; i++) {
      if (this.arenas[i]) {
        try {
          if (typeof this.arenas[i].dispose === 'function') {
            this.arenas[i].dispose();
          }
        } catch (e) {}
        this.arenas[i] = null;
        this.prevStates[i] = null;
        this.currStates[i] = null;
      }
    }

    // 3. Remove ghost meshes from Three.js scene
    if (this.arenaWorld && this.arenaWorld.scene) {
      this.arenaWorld.scene.remove(this.ghostGroup);
    }
    for (let i = 0; i < 6; i++) {
      if (this.ghostCars[i]) {
        this._disposeMesh(this.ghostCars[i]);
        this.ghostCars[i] = null;
      }
      if (this.ghostBalls[i]) {
        this._disposeMesh(this.ghostBalls[i]);
        this.ghostBalls[i] = null;
      }
    }
    if (typeof this.ghostGroup.clear === 'function') {
      this.ghostGroup.clear();
    } else {
      this.ghostGroup.children = [];
    }

    // 4. Restore active car & active ball to standard Freeplay appearance
    this._restoreActiveCarAndBall();

    // 5. Restore native Freeplay shortcut conflict tools
    this._restoreFreeplayConflicts();

    // 6. Reset Slot 0 arena back to standard kickoff
    if (this.arenas[0]) {
      this.arenas[0].resetKickoff(-1);
      this.arenas[0].setUnlimitedBoost(false);
    }

    // 7. Notify switch callback to restore primary physics reference
    if (typeof this.onSwitchCallback === 'function' && this.arenas[0]) {
      this.onSwitchCallback(this.arenas[0], this.arenas[0].state, this.arenas[0].state);
    }

    this.isActive = false;
    this.activeSlot = 0;
  }

  /**
   * Reset kickoff for a specific arena to its designated slot kickoff configuration
   */
  _resetArenaToKickoff(slotIndex) {
    const arena = this.arenas[slotIndex];
    if (!arena) return;
    const slot = PARALLEL_SLOTS[slotIndex];

    arena.resetKickoff(slot.kickoffIndex);
    arena.setUnlimitedBoost(this.unlimitedBoost[slotIndex]);

    // In sync state buffers
    if (this.prevStates[slotIndex]) this.prevStates[slotIndex].set(arena.state);
    if (this.currStates[slotIndex]) this.currStates[slotIndex].set(arena.state);
  }

  /**
   * Build 6 visual ghost cars, 6 visual ghost balls, and 6 active dyed balls
   */
  _buildVisualMeshes() {
    if (typeof this.ghostGroup.clear === 'function') {
      this.ghostGroup.clear();
    } else {
      this.ghostGroup.children = [];
    }

    for (let i = 0; i < 6; i++) {
      const slot = PARALLEL_SLOTS[i];

      // 1. Ghost Car: low overhead Three.js mesh
      if (this.createCarMesh && this.arenaWorld && this.arenaWorld.gameCarAsset) {
        const carMesh = this.createCarMesh(this.arenaWorld.gameCarAsset, slot.colorInt);
        carMesh.name = `GhostCar_${slot.name}`;
        carMesh.castShadow = false;
        carMesh.receiveShadow = false;

        // Semi-transparent ghost appearance
        carMesh.traverse(child => {
          if (child.isMesh && child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach(m => {
              m.transparent = true;
              m.opacity = 0.85;
              m.depthWrite = false;
            });
          }
        });

        this.ghostCars[i] = carMesh;
        this.ghostGroup.add(carMesh);
      }

      // 2. Ghost Ball: dyed soccer ball (black leather panels replaced with slot hex color)
      if (this.createBallMesh) {
        const ballMesh = this.createBallMesh(slot.hex);
        ballMesh.name = `GhostBall_${slot.name}`;
        ballMesh.castShadow = false;
        ballMesh.receiveShadow = false;

        ballMesh.traverse(child => {
          if (child.isMesh && child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach(m => {
              m.transparent = true;
              m.opacity = 0.88;
              m.depthWrite = false;
            });
          }
        });

        this.ghostBalls[i] = ballMesh;
        this.ghostGroup.add(ballMesh);
      }

      // 3. Active Dyed Ball Mesh: full PBR classic soccer ball with slot color
      if (this.createBallMesh) {
        const activeBall = this.createBallMesh(slot.hex);
        activeBall.name = `ActiveDyedBall_${slot.name}`;
        activeBall.castShadow = true;
        activeBall.receiveShadow = true;
        this.activeBallMeshes[i] = activeBall;
      }
    }
  }

  /**
   * Apply visual tinting and active car/ball appearance for the target slot
   */
  _applySlotVisuals(slotIndex, isInitial = false) {
    const slot = PARALLEL_SLOTS[slotIndex];

    // 1. Recolor active car (N.cars[0])
    if (this.arenaWorld && this.arenaWorld.cars && this.arenaWorld.cars[0] && this.recolorCar) {
      this.recolorCar(this.arenaWorld.cars[0], slot.colorInt);
    }

    // 2. Swap active ball visual inside N.ball
    if (this.arenaWorld && this.arenaWorld.ball && this.activeBallMeshes[slotIndex]) {
      const activeBallGroup = this.arenaWorld.ball;
      // Save original child on first load
      if (!this.savedBallChild && activeBallGroup.children.length > 0) {
        this.savedBallChild = activeBallGroup.children[0];
      }
      while (activeBallGroup.children.length > 0) {
        activeBallGroup.remove(activeBallGroup.children[0]);
      }
      activeBallGroup.add(this.activeBallMeshes[slotIndex]);
    }

    // 3. Ghost visibility: Active slot is hidden from ghosts; other 5 are visible
    for (let i = 0; i < 6; i++) {
      const isCurrentActive = (i === slotIndex);
      if (this.ghostCars[i]) this.ghostCars[i].visible = !isCurrentActive;
      if (this.ghostBalls[i]) this.ghostBalls[i].visible = !isCurrentActive;
    }
  }

  /**
   * Restore default car and ball appearance when exiting mode
   */
  _restoreActiveCarAndBall() {
    if (this.arenaWorld) {
      // Restore car default color
      if (this.arenaWorld.cars && this.arenaWorld.cars[0] && this.recolorCar) {
        this.recolorCar(this.arenaWorld.cars[0], 0x2F7BD3); // Default blue
      }
      // Restore ball
      if (this.arenaWorld.ball && this.savedBallChild) {
        while (this.arenaWorld.ball.children.length > 0) {
          this.arenaWorld.ball.remove(this.arenaWorld.ball.children[0]);
        }
        this.arenaWorld.ball.add(this.savedBallChild);
      }
    }
  }

  /**
   * Hot-switch to target slot car ("Drive This Car")
   * Instantaneous hard cut without smooth lerp
   */
  switchActiveSlot(targetSlotIndex) {
    if (!this.isActive || targetSlotIndex === this.activeSlot) return;
    if (targetSlotIndex < 0 || targetSlotIndex >= 6) return;

    this.activeSlot = targetSlotIndex;

    // 1. Update visual dye on active car and ball
    this._applySlotVisuals(targetSlotIndex);

    // 2. Call switch callback to rebind CC interpolation helper `s`
    if (typeof this.onSwitchCallback === 'function' && this.arenas[targetSlotIndex]) {
      this.onSwitchCallback(
        this.arenas[targetSlotIndex],
        this.prevStates[targetSlotIndex],
        this.currStates[targetSlotIndex]
      );
    }

    // 3. Hard-cut camera view: resetView() clears camera smoothing/lag
    if (this.cameraManager && this.cameraManager.kernel) {
      this.cameraManager.kernel.resetView();
    }

    // 4. Audio isolation: reset engine synth so there's zero sound bleed
    this.resetEngineAudio();

    // 5. Update UI cards
    this._renderCards();
  }

  /**
   * Reset active slot car and ball
   * Quick reset affects ONLY the active slot
   */
  resetActiveSlot() {
    if (!this.isActive) return;
    this._resetArenaToKickoff(this.activeSlot);
    this.resetEngineAudio();
  }

  /**
   * Set unlimited boost on/off for a slot
   */
  setUnlimitedBoost(slotIndex, enabled) {
    if (slotIndex < 0 || slotIndex >= 6) return;
    this.unlimitedBoost[slotIndex] = Boolean(enabled);
    if (this.arenas[slotIndex]) {
      this.arenas[slotIndex].setUnlimitedBoost(this.unlimitedBoost[slotIndex]);
    }
    this._renderCards();
  }

  /**
   * Step background arenas synchronously with the active arena (120Hz)
   * Unselected 5 arena cars execute real inertial physics simulation without player input.
   */
  stepBackgroundArenas(ticks, alpha) {
    if (!this.isActive) return;
    const { ht, ye } = this.constants;

    for (let i = 0; i < 6; i++) {
      if (i === this.activeSlot) continue;
      const arena = this.arenas[i];
      if (!arena) continue;

      if (ticks > 0) {
        // Record previous state for interpolation
        if (this.prevStates[i] && this.currStates[i]) {
          this.prevStates[i].set(this.currStates[i]);
        }

        // Unselected 5 arena cars execute real inertial physics simulation without player input
        arena.setControls(0, ZERO_CONTROLS);

        // Enforce unlimited boost if checked
        if (this.unlimitedBoost[i]) {
          arena.setUnlimitedBoost(true);
          const carOffset = ht.CARS;
          arena.state[carOffset + ye.BOOST] = 100;
        }

        // Step arena by exact number of ticks
        arena.step(ticks);

        // Background Goal Detection: SILENT reset of this arena only!
        const goalScored = arena.pollGoal() !== 0;
        if (goalScored) {
          this._resetArenaToKickoff(i);
        } else if (this.currStates[i]) {
          this.currStates[i].set(arena.state);
        }
      }
    }

    // Update ghost mesh positions and rotations
    this.updateVisuals(alpha);
  }

  /**
   * Update visual positions of the 5 ghost cars and 5 ghost balls
   * Called every render frame with interpolation alpha
   */
  updateVisuals(alpha) {
    if (!this.isActive) return;

    const { ht } = this.constants;

    for (let i = 0; i < 6; i++) {
      // Active slot is rendered by main engine (N.cars[0] and N.ball)
      if (i === this.activeSlot) {
        if (this.ghostCars[i]) this.ghostCars[i].visible = false;
        if (this.ghostBalls[i]) this.ghostBalls[i].visible = false;
        continue;
      }

      const prev = this.prevStates[i];
      const curr = this.currStates[i];
      if (!prev || !curr) continue;

      // Update Ghost Car
      const carMesh = this.ghostCars[i];
      if (carMesh) {
        carMesh.visible = true;
        this._applyPhysTransform(carMesh, prev, curr, ht.CARS, alpha);
      }

      // Update Ghost Ball
      const ballMesh = this.ghostBalls[i];
      if (ballMesh) {
        ballMesh.visible = true;
        this._applyPhysTransform(ballMesh, prev, curr, ht.BALL, alpha);
      }
    }
  }

  /**
   * Convert RocketSim physics coordinates (X, Y, Z) and basis to Three.js (X, Z, Y)
   */
  _applyPhysTransform(mesh, prev, curr, offset, alpha) {
    // Position interpolation: RocketSim (X, Y, Z) -> Three.js (X, Z, Y)
    const pxA = prev[offset],     pyA = prev[offset + 2], pzA = prev[offset + 1];
    const pxB = curr[offset],     pyB = curr[offset + 2], pzB = curr[offset + 1];
    mesh.position.set(
      pxA + (pxB - pxA) * alpha,
      pyA + (pyB - pyA) * alpha,
      pzA + (pzB - pzA) * alpha
    );

    // Orientation basis interpolation
    if (this._m4 && this._q1 && this._q2) {
      this._getBasisQuaternion(prev, offset + 3, this._q1);
      this._getBasisQuaternion(curr, offset + 3, this._q2);
      mesh.quaternion.slerpQuaternions(this._q1, this._q2, alpha);
    }
  }

  /**
   * Build quaternion from RocketSim forward, right, up vectors in Three.js coordinates
   */
  _getBasisQuaternion(stateArr, offset, targetQuat) {
    // RocketSim coordinates: forward (0..2), right (3..5), up (6..8)
    // Three.js coordinates mapping: (x, z, y)
    const fx = stateArr[offset],     fy = stateArr[offset + 1], fz = stateArr[offset + 2];
    const rx = stateArr[offset + 3], ry = stateArr[offset + 4], rz = stateArr[offset + 5];
    const ux = stateArr[offset + 6], uy = stateArr[offset + 7], uz = stateArr[offset + 8];

    // Column 0 = fwd (fx, fz, fy), Column 1 = up (ux, uz, uy), Column 2 = right (rx, rz, ry)
    this._m4.set(
      fx, ux, rx, 0,
      fz, uz, rz, 0,
      fy, uy, ry, 0,
      0,  0,  0,  1
    );
    targetQuat.setFromRotationMatrix(this._m4);
    return targetQuat;
  }

  /**
   * Dispose helper for Three.js objects
   */
  _disposeMesh(obj) {
    if (!obj) return;
    if (typeof obj.traverse === 'function') {
      obj.traverse(child => {
        if (child.isMesh) {
          if (child.geometry && typeof child.geometry.dispose === 'function') child.geometry.dispose();
          if (child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach(m => {
              if (m && typeof m.dispose === 'function') m.dispose();
            });
          }
        }
      });
    }
  }

  /**
   * Disable and hide native Freeplay shortcut conflict tools
   */
  _disableFreeplayConflicts() {
    this.disabledConflictElements = [];

    // Hide touch ball actions (.touch-ball-actions)
    const touchBallActions = this.container.querySelector('.touch-ball-actions');
    if (touchBallActions && touchBallActions.style.display !== 'none') {
      touchBallActions.style.display = 'none';
      this.disabledConflictElements.push(touchBallActions);
    }

    // Hide match button & car button if active
    const carBtn = this.container.querySelector('#car-button');
    if (carBtn && carBtn.style.display !== 'none') {
      carBtn.style.display = 'none';
      this.disabledConflictElements.push(carBtn);
    }
    const matchBtn = this.container.querySelector('#match-button');
    if (matchBtn && matchBtn.style.display !== 'none') {
      matchBtn.style.display = 'none';
      this.disabledConflictElements.push(matchBtn);
    }
  }

  /**
   * Restore native Freeplay conflict tools
   */
  _restoreFreeplayConflicts() {
    for (const el of this.disabledConflictElements) {
      if (el) el.style.display = '';
    }
    this.disabledConflictElements = [];
  }

  /**
   * Toggle Management Panel Menu
   */
  toggleMenu() {
    if (this.isMenuOpen) {
      this.closeMenu();
    } else {
      this.openMenu();
    }
  }

  openMenu() {
    if (!this.panelOverlay) return;
    this.isMenuOpen = true;
    this.panelOverlay.classList.add('is-visible');
    this.panelOverlay.setAttribute('aria-hidden', 'false');
    this._renderCards();
  }

  closeMenu() {
    if (!this.panelOverlay) return;
    this.isMenuOpen = false;
    this.panelOverlay.classList.remove('is-visible');
    this.panelOverlay.setAttribute('aria-hidden', 'true');
  }

  /**
   * Build the UI Management Panel and Top-Right HUD Floating Button
   */
  _buildUI() {
    if (typeof document === 'undefined') return;

    // 1. Inject Styles
    if (!document.getElementById('parallel-training-styles')) {
      const style = document.createElement('style');
      style.id = 'parallel-training-styles';
      style.textContent = `
        .parallel-menu-btn {
          display: none;
          align-items: center;
          gap: 6px;
          position: fixed;
          top: 14px;
          right: 156px;
          padding: 6px 12px;
          font-family: var(--sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.02em;
          color: #f1f5f9;
          background: rgba(15, 23, 42, 0.75);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          cursor: pointer;
          z-index: 1050;
          transition: all 0.15s ease;
          user-select: none;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        }
        .parallel-menu-btn:hover {
          background: rgba(30, 41, 59, 0.9);
          border-color: #38bdf8;
          color: #ffffff;
          box-shadow: 0 0 16px rgba(56, 189, 248, 0.4);
          transform: translateY(-1px);
        }
        .parallel-menu-btn svg {
          width: 16px;
          height: 16px;
          fill: currentColor;
        }
        .parallel-menu-btn kbd {
          display: inline-block;
          padding: 1px 4px;
          font-size: 10px;
          font-family: inherit;
          background: rgba(255, 255, 255, 0.15);
          border-radius: 4px;
          border: 1px solid rgba(255, 255, 255, 0.25);
        }

        /* Frosted Glass Management Overlay */
        .parallel-overlay {
          display: none;
          position: fixed;
          inset: 0;
          background: rgba(5, 10, 20, 0.6);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          z-index: 2000;
          align-items: center;
          justify-content: center;
          padding: 16px;
          animation: parallelFadeIn 0.18s ease-out;
        }
        .parallel-overlay.is-visible {
          display: flex;
        }
        @keyframes parallelFadeIn {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }

        .parallel-panel {
          width: 100%;
          max-width: 620px;
          max-height: 90vh;
          overflow-y: auto;
          background: rgba(15, 23, 42, 0.88);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 16px;
          box-shadow: 0 24px 64px rgba(0, 0, 0, 0.75), 0 0 40px rgba(56, 189, 248, 0.15);
          color: #f1f5f9;
          font-family: var(--sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 18px;
          box-sizing: border-box;
        }

        .parallel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          padding-bottom: 14px;
        }
        .parallel-title-group h2 {
          margin: 0;
          font-size: 19px;
          font-weight: 800;
          letter-spacing: 0.02em;
          display: flex;
          align-items: center;
          gap: 10px;
          color: #ffffff;
        }
        .parallel-title-group p {
          margin: 4px 0 0 0;
          font-size: 12px;
          color: #94a3b8;
        }
        .parallel-close-btn {
          background: transparent;
          border: none;
          color: #94a3b8;
          font-size: 20px;
          cursor: pointer;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          transition: all 0.15s ease;
        }
        .parallel-close-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
        }

        /* 6 Slots Grid */
        .parallel-cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 12px;
        }

        .slot-card {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          transition: all 0.15s ease;
          position: relative;
          box-sizing: border-box;
        }
        .slot-card.is-active {
          background: rgba(255, 255, 255, 0.08);
          box-shadow: inset 0 0 20px rgba(255, 255, 255, 0.05);
        }

        .slot-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .slot-card-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 15px;
          font-weight: 700;
        }
        .slot-color-pip {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          display: inline-block;
          box-shadow: 0 0 8px currentColor;
        }
        .slot-active-badge {
          font-size: 10px;
          font-weight: 800;
          padding: 2px 6px;
          border-radius: 4px;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }

        .slot-card-meta {
          font-size: 11px;
          color: #94a3b8;
          display: flex;
          flex-direction: column;
          gap: 3px;
          line-height: 1.3;
        }

        .slot-card-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 4px;
          padding-top: 8px;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }

        .drive-btn {
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 700;
          border-radius: 6px;
          cursor: pointer;
          border: 1px solid transparent;
          transition: all 0.15s ease;
          color: #ffffff;
        }
        .drive-btn.is-driving {
          background: rgba(255, 255, 255, 0.12);
          color: #cbd5e1;
          cursor: default;
          border-color: rgba(255, 255, 255, 0.15);
        }
        .drive-btn:not(.is-driving):hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }

        .boost-toggle-label {
          font-size: 11px;
          font-weight: 600;
          color: #cbd5e1;
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          user-select: none;
        }
        .boost-toggle-label input {
          cursor: pointer;
          width: 14px;
          height: 14px;
          accent-color: #38bdf8;
        }

        /* Panel Footer */
        .parallel-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          padding-top: 16px;
          margin-top: 4px;
        }
        .parallel-tips {
          font-size: 12px;
          color: #64748b;
        }
        .parallel-tips kbd {
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 4px;
          padding: 1px 4px;
          color: #94a3b8;
        }
        .exit-training-btn {
          background: rgba(239, 68, 68, 0.15);
          color: #f87171;
          border: 1px solid rgba(239, 68, 68, 0.35);
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 700;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .exit-training-btn:hover {
          background: rgba(239, 68, 68, 0.3);
          color: #ffffff;
          border-color: #ef4444;
          box-shadow: 0 0 16px rgba(239, 68, 68, 0.4);
        }
      `;
      document.head.appendChild(style);
    }

    // 2. Floating Top-Right HUD Button: "Menu (Tab)"
    const menuBtn = document.createElement('button');
    menuBtn.id = 'parallel-training-menu-btn';
    menuBtn.className = 'parallel-menu-btn';
    menuBtn.setAttribute('type', 'button');
    menuBtn.setAttribute('aria-label', 'Open Parallel Training Menu');
    menuBtn.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/></svg>
      <span>Menu</span>
      <kbd>Tab</kbd>
    `;
    menuBtn.addEventListener('click', () => this.toggleMenu());
    this.container.appendChild(menuBtn);
    this.menuButton = menuBtn;

    // 3. Management Modal Panel Overlay
    const overlay = document.createElement('div');
    overlay.id = 'parallel-training-overlay';
    overlay.className = 'parallel-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <div class="parallel-panel" role="dialog" aria-modal="true" aria-labelledby="parallel-title">
        <header class="parallel-header">
          <div class="parallel-title-group">
            <h2 id="parallel-title">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#38bdf8;box-shadow:0 0 10px #38bdf8;"></span>
              Multiplayer Parallel Training / 多人平行世界
            </h2>
            <p>6 Arenas Concurrently Simulated • Synchronized 120Hz Physics</p>
          </div>
          <button class="parallel-close-btn" type="button" data-close aria-label="Close menu">&times;</button>
        </header>

        <div class="parallel-cards-grid" id="parallel-cards-container">
          <!-- 6 Slot Cards rendered dynamically -->
        </div>

        <footer class="parallel-footer">
          <div class="parallel-tips">
            <kbd>Tab</kbd> Toggle Menu &nbsp;&bull;&nbsp; <kbd>Backspace</kbd> Reset Active Car
          </div>
          <button class="exit-training-btn" type="button" data-exit>
            Exit Training Mode (退出训练)
          </button>
        </footer>
      </div>
    `;

    // Event bindings on panel
    overlay.querySelector('[data-close]').addEventListener('click', () => this.closeMenu());
    overlay.querySelector('[data-exit]').addEventListener('click', () => this.exit());
    overlay.addEventListener('click', e => {
      if (e.target === overlay) this.closeMenu();
    });

    this.container.appendChild(overlay);
    this.panelOverlay = overlay;
  }

  /**
   * Render the 6 Slot Cards inside the Management Panel
   */
  _renderCards() {
    const container = this.panelOverlay?.querySelector('#parallel-cards-container');
    if (!container) return;

    container.innerHTML = PARALLEL_SLOTS.map(slot => {
      const isCurrent = (slot.id === this.activeSlot);
      const isBoostUnlimited = this.unlimitedBoost[slot.id];
      const borderColor = slot.hex;

      return `
        <div class="slot-card ${isCurrent ? 'is-active' : ''}" style="border-left: 4px solid ${borderColor}; ${isCurrent ? `border-color: ${borderColor}99;` : ''}">
          <div class="slot-card-header">
            <div class="slot-card-title">
              <span class="slot-color-pip" style="background:${slot.hex}; color:${slot.hex};"></span>
              <span>Slot ${slot.id}: ${slot.name}</span>
            </div>
            ${isCurrent 
              ? `<span class="slot-active-badge" style="background:${slot.hex}28; color:${slot.hex}; border:1px solid ${slot.hex};">Active Car</span>`
              : `<span class="slot-active-badge" style="background:rgba(255,255,255,0.06); color:#94a3b8;">Ghost</span>`
            }
          </div>

          <div class="slot-card-meta">
            <div><strong>Team:</strong> ${slot.teamNameZh} (${slot.team === 1 ? 'Orange' : 'Blue'})</div>
            <div><strong>Kickoff Spawn:</strong> (${slot.spawn.x}, ${slot.spawn.y}, ${slot.spawn.z})</div>
            <div><strong>Yaw:</strong> ${slot.yawDeg}&deg;</div>
          </div>

          <div class="slot-card-actions">
            <button
              class="drive-btn ${isCurrent ? 'is-driving' : ''}"
              type="button"
              data-slot-drive="${slot.id}"
              ${isCurrent ? 'disabled' : ''}
              style="${!isCurrent ? `background:${slot.hex}22; border-color:${slot.hex}; color:#ffffff;` : ''}"
            >
              ${isCurrent ? 'Driving This Car' : 'Drive This Car'}
            </button>

            <label class="boost-toggle-label">
              <input
                type="checkbox"
                data-slot-boost="${slot.id}"
                ${isBoostUnlimited ? 'checked' : ''}
              />
              <span>Unlimited Boost</span>
            </label>
          </div>
        </div>
      `;
    }).join('');

    // Attach click events for "Drive This Car" buttons
    container.querySelectorAll('[data-slot-drive]').forEach(btn => {
      btn.addEventListener('click', e => {
        const slotId = parseInt(btn.getAttribute('data-slot-drive'), 10);
        this.switchActiveSlot(slotId);
      });
    });

    // Attach change events for "Unlimited Boost" checkboxes
    container.querySelectorAll('[data-slot-boost]').forEach(chk => {
      chk.addEventListener('change', e => {
        const slotId = parseInt(chk.getAttribute('data-slot-boost'), 10);
        this.setUnlimitedBoost(slotId, chk.checked);
      });
    });
  }
}
