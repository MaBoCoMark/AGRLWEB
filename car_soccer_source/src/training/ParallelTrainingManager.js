/**
 * ParallelTrainingManager.js
 * Multi-World Parallel Training Mode (多人多世界平行训练系统)
 *
 * Implements:
 * 1. Input & Focus Controller: Global activePlayerIndex (0~5), ArrowLeft / ArrowRight hotkeys,
 *    WASD controls active player only, camera locked to active player, bottom-left HUD showing active player.
 * 2. Parallel World State Machine & Cascading Migration (SwitchWorld):
 *    6 Worlds & 6 Players; Host Migration moves present group and hides ball; Guest Migration moves single player;
 *    Ball restoration when host returns to empty world.
 * 3. Spawn Safety Algorithm (SpawnPlayer): 10 preset kickoff spawn points (S0..S9), radius R_safe = 2.5m (250 UU)
 *    collision avoidance against existing cars and ball, zero linear & angular velocities, facing midfield.
 * 4. Goal Detection & Local Reset: World-isolated ball trigger, score awarded to lastTouchedPlayer,
 *    local reset ONLY for that world, absolutely no impact on other worlds.
 * 5. UI Matrix Menu (6x1 Grid): Toggled via Tab; 6 player rows; left Unlimited Boost toggle;
 *    right 6 adaptive world buttons with IsButtonVisible visibility rule.
 * 6. Entrance Confirm Modal: Modal prompt "是否进入 Multi-World Parallel Training 模式？" on entry.
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

export const SPAWN_PRESETS = [
  // 5 Left points (Blue side / negative Y)
  { x: -2048, y: -2560, z: 17 }, // S0: Diagonal Left
  { x:  2048, y: -2560, z: 17 }, // S1: Diagonal Right
  { x:  -256, y: -3840, z: 17 }, // S2: Off-center Left
  { x:   256, y: -3840, z: 17 }, // S3: Off-center Right
  { x:     0, y: -4608, z: 17 }, // S4: Goalie
  // 5 Right points (Orange side / positive Y)
  { x: -2048, y:  2560, z: 17 }, // S5: Diagonal Left
  { x:  2048, y:  2560, z: 17 }, // S6: Diagonal Right
  { x:  -256, y:  3840, z: 17 }, // S7: Off-center Left
  { x:   256, y:  3840, z: 17 }, // S8: Off-center Right
  { x:     0, y:  4608, z: 17 }, // S9: Goalie
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
    this.primaryPhysicsSim = options.primaryPhysicsSim || null;
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

    // 1. Input & Player Focus state
    this.activePlayerIndex = 0; // range 0 ~ 5
    this.isActive = false;
    this.isMenuOpen = false;
    this.isInitializing = false;

    // 2. Parallel Worlds (0 ~ 5)
    this.worlds = [0, 1, 2, 3, 4, 5].map(id => ({
      id,
      ownerId: id,
      presentPlayerIds: new Set([id]),
      ball: null,
      ballVisible: true,
      lastTouchedPlayer: null,
      pos: { x: 0, y: 0, z: 93 },
      vel: { x: 0, y: 0, z: 0 }
    }));

    // 3. Players (0 ~ 5)
    this.players = PARALLEL_SLOTS.map(slot => ({
      id: slot.id,
      currentWorldId: slot.id,
      arenaCarIndex: 0,
      unlimitedBoost: false,
      lastTouchedBall: null,
      score: 0,
      name: slot.name,
      nameZh: slot.nameZh,
      hex: slot.hex,
      colorInt: slot.colorInt,
      carMesh: null,
      pos: { ...slot.spawn },
      vel: { x: 0, y: 0, z: 0 },
      angVel: { x: 0, y: 0, z: 0 },
      fwd: { x: 0, y: 1, z: 0 },
      up: { x: 0, y: 0, z: 1 },
      right: { x: 1, y: 0, z: 0 },
      boost: 100
    }));

    // 6 Physics arenas
    this.arenas = [null, null, null, null, null, null];
    this.prevStates = [null, null, null, null, null, null];
    this.currStates = [null, null, null, null, null, null];
    this.unlimitedBoost = [false, false, false, false, false, false];

    // Visual ghost meshes group (single environment rendering)
    if (this.arenaWorld && this.arenaWorld.ball && this.arenaWorld.ball.constructor) {
      this.ghostGroup = new this.arenaWorld.ball.constructor();
    } else {
      this.ghostGroup = {
        name: 'ParallelTrainingGhosts',
        children: [],
        add(c) { this.children.push(c); },
        remove(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); },
        clear() { this.children = []; }
      };
    }
    this.ghostGroup.name = 'ParallelTrainingGhosts';
    this.carMeshes = [null, null, null, null, null, null];
    this.ballMeshes = [null, null, null, null, null, null];
    // Backward compatibility aliases
    this.ghostCars = this.carMeshes;
    this.ghostBalls = this.ballMeshes;
    this.activeBallMeshes = [null, null, null, null, null, null];

    // Math temporary matrix and quaternions
    if (this.arenaWorld && this.arenaWorld.ball && this.arenaWorld.ball.quaternion) {
      this._m4 = this.arenaWorld.ball.matrix.clone();
      this._q1 = this.arenaWorld.ball.quaternion.clone();
      this._q2 = this.arenaWorld.ball.quaternion.clone();
    }

    // DOM UI elements
    this.panelOverlay = null;
    this.cardsContainer = null;
    this.playerHudEl = null;
    this.confirmModal = null;
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
   * Backward compatibility getter/setter for activeSlot
   */
  get activeSlot() {
    return this.activePlayerIndex;
  }

  set activeSlot(idx) {
    this.activePlayerIndex = idx;
  }

  /**
   * Global keyboard shortcut listener:
   * - Tab: Toggles parallel training menu (or prompts confirm modal if not active)
   * - ArrowLeft: activePlayerIndex = (activePlayerIndex - 1 + 6) % 6
   * - ArrowRight: activePlayerIndex = (activePlayerIndex + 1) % 6
   */
  _onKeyDown(e) {
    if (e.code === 'Tab') {
      const isMatch = this.container && this.container.dataset && this.container.dataset.gameMode === 'match';
      if (isMatch) return;
      e.preventDefault();
      e.stopPropagation();
      if (this.isActive) {
        this.toggleMenu();
      } else {
        this.showConfirmModal();
      }
      return;
    }

    if (!this.isActive) return;

    if (e.code === 'ArrowLeft') {
      e.preventDefault();
      e.stopPropagation();
      const prevIdx = (this.activePlayerIndex - 1 + 6) % 6;
      this.setActivePlayer(prevIdx);
    } else if (e.code === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      const nextIdx = (this.activePlayerIndex + 1) % 6;
      this.setActivePlayer(nextIdx);
    }
  }

  /**
   * Show Entry Confirm Modal:
   * "是否进入 Multi-World Parallel Training 模式？"
   */
  showConfirmModal() {
    if (!this.confirmModal) {
      this._buildConfirmModal();
    }
    this.confirmModal.style.display = 'flex';
  }

  _buildConfirmModal() {
    const modal = document.createElement('div');
    modal.id = 'parallel-confirm-modal';
    modal.className = 'parallel-confirm-overlay';
    modal.innerHTML = `
      <div class="parallel-confirm-dialog" role="dialog" aria-modal="true">
        <div class="parallel-confirm-header">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="width:10px;height:10px;border-radius:50%;background:#38bdf8;box-shadow:0 0 10px #38bdf8;"></span>
            <span style="font-size:16px;font-weight:800;color:#ffffff;">Multi-World Parallel Training</span>
          </div>
        </div>
        <div class="parallel-confirm-body">
          <p style="font-size:15px;color:#f1f5f9;margin:0 0 8px 0;line-height:1.5;">
            是否进入 Multi-World Parallel Training 模式？
          </p>
          <p style="font-size:12px;color:#94a3b8;margin:0;line-height:1.4;">
            模式将同时运行 6 个独立的平行世界，支持实时跨世界漫游迁移、安全出生点判定与独立进球机制。
          </p>
        </div>
        <div class="parallel-confirm-footer">
          <button type="button" class="parallel-modal-btn parallel-modal-btn--cancel" data-action="cancel">
            取消 (Cancel)
          </button>
          <button type="button" class="parallel-modal-btn parallel-modal-btn--confirm" data-action="confirm">
            确认进入 (Enter)
          </button>
        </div>
      </div>
    `;

    const cancelBtn = modal.querySelector('[data-action="cancel"]');
    const confirmBtn = modal.querySelector('[data-action="confirm"]');

    cancelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      modal.style.display = 'none';
    });

    confirmBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      modal.style.display = 'none';
      this.enter(this.primaryPhysicsSim || this.arenas[0]).then(() => {
        this.openMenu();
      });
    });

    this.container.appendChild(modal);
    this.confirmModal = modal;
  }

  /**
   * Initialize and enter Parallel Training Mode
   * Initial State:
   * - 6 players in their own worlds 0~5
   * - Each world has 1 car and 1 ball
   * - 6x6 buttons in UI menu fully visible
   */
  async enter(primaryPhysicsSim = null) {
    if (this.isActive || this.isInitializing) return;
    this.isInitializing = true;

    try {
      // 1. Hide & disable native Freeplay shortcut conflict tools
      this._disableFreeplayConflicts();

      // 2. Setup Slot 0 arena (using existing primary arena or fresh)
      const primarySim = primaryPhysicsSim || this.primaryPhysicsSim || this.arenas[0];
      if (primarySim) {
        this.arenas[0] = primarySim;
        this.primaryPhysicsSim = primarySim;
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

      // 4. Initialize initial state for Worlds & Players (6 players in their own worlds 0..5)
      this.worlds = [0, 1, 2, 3, 4, 5].map(id => ({
        id,
        ownerId: id,
        presentPlayerIds: new Set([id]),
        ball: null,
        ballVisible: true,
        lastTouchedPlayer: null,
        pos: { x: 0, y: 0, z: 93 },
        vel: { x: 0, y: 0, z: 0 }
      }));

      this.players = PARALLEL_SLOTS.map(slot => ({
        id: slot.id,
        currentWorldId: slot.id,
        arenaCarIndex: 0,
        unlimitedBoost: false,
        lastTouchedBall: null,
        score: 0,
        name: slot.name,
        nameZh: slot.nameZh,
        hex: slot.hex,
        colorInt: slot.colorInt,
        carMesh: null,
        pos: { ...slot.spawn },
        vel: { x: 0, y: 0, z: 0 },
        angVel: { x: 0, y: 0, z: 0 },
        fwd: { x: 0, y: 1, z: 0 },
        up: { x: 0, y: 0, z: 1 },
        right: { x: 1, y: 0, z: 0 },
        boost: 100
      }));

      // 5. Configure initial kickoffs and spawn points for all 6 arenas
      for (let i = 0; i < 6; i++) {
        this.players[i].arenaCarIndex = 0;
        this.players[i].currentWorldId = i;
        this._resetArenaToKickoff(i);
        this.spawnPlayer(this.players[i], i);
      }

      // 6. Build visual meshes (6 cars & 6 balls)
      this._buildVisualMeshes();

      // Add ghost group to main Three.js scene
      if (this.arenaWorld && this.arenaWorld.scene) {
        this.arenaWorld.scene.add(this.ghostGroup);
      }

      // 7. Mount focus to activePlayerIndex (default 0)
      this.isActive = true;
      this.activePlayerIndex = 0;
      this.setActivePlayer(0, true);

      // Update UI button and render cards
      if (this.menuButton) this.menuButton.style.display = 'flex';
      if (this.hudToggleButton) {
        this.hudToggleButton.classList.add('is-active');
        this.hudToggleButton.setAttribute('title', 'Parallel Training Active (Tab to Open Menu)');
      }

      // Show and update bottom-left HUD
      if (this.playerHudEl) {
        this.playerHudEl.style.display = 'flex';
        this._updateBottomLeftHud();
      }

      this._renderCards();
    } catch (err) {
      console.error('[ParallelTrainingManager] Error entering Parallel Training Mode:', err);
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Exit Parallel Training Mode and restore native Freeplay environment
   */
  exit() {
    if (!this.isActive) return;

    this.closeMenu();
    this.isActive = false;

    // 1. Remove ghost meshes from scene
    if (this.arenaWorld && this.arenaWorld.scene && this.ghostGroup) {
      this.arenaWorld.scene.remove(this.ghostGroup);
    }

    // 2. Restore active car and ball visual
    this._restoreActiveCarAndBall();

    // 3. Rebind CC interpolation helper back to primary arena (Slot 0)
    if (typeof this.onSwitchCallback === 'function' && this.arenas[0]) {
      this.onSwitchCallback(this.arenas[0], this.prevStates[0], this.currStates[0]);
    }

    // 4. Restore native Freeplay conflict elements
    this._restoreFreeplayConflicts();

    // 5. Hide HUD elements
    if (this.menuButton) this.menuButton.style.display = 'none';
    if (this.hudToggleButton) {
      this.hudToggleButton.classList.remove('is-active');
      this.hudToggleButton.setAttribute('title', 'Multiplayer Parallel Training (多人平行世界)');
    }
    if (this.playerHudEl) {
      this.playerHudEl.style.display = 'none';
    }

    // 6. Reset view & engine audio
    if (this.cameraManager && this.cameraManager.kernel) {
      this.cameraManager.kernel.resetView();
    }
    this.resetEngineAudio();
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
   * Build 6 visual cars and 6 visual dyed soccer balls
   */
  _buildVisualMeshes() {
    if (typeof this.ghostGroup.clear === 'function') {
      this.ghostGroup.clear();
    } else {
      this.ghostGroup.children = [];
    }

    for (let i = 0; i < 6; i++) {
      const slot = PARALLEL_SLOTS[i];

      // 1. Visual Car: dyed in slot color
      if (this.createCarMesh && this.arenaWorld && this.arenaWorld.gameCarAsset) {
        const carMesh = this.createCarMesh(this.arenaWorld.gameCarAsset, slot.colorInt);
        carMesh.name = `Car_${slot.name}`;
        carMesh.castShadow = false;
        carMesh.receiveShadow = false;

        carMesh.traverse(child => {
          if (child.isMesh && child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach(m => {
              m.transparent = false;
              m.opacity = 1.0;
              m.depthWrite = true;
            });
          }
        });

        this.carMeshes[i] = carMesh;
        this.players[i].carMesh = carMesh;
        this.ghostGroup.add(carMesh);
      }

      // 2. Dedicated Dyed Soccer Ball for World i
      if (this.createBallMesh) {
        const ballMesh = this.createBallMesh(slot.hex);
        ballMesh.name = `Ball_${slot.name}`;
        ballMesh.castShadow = false;
        ballMesh.receiveShadow = false;

        ballMesh.traverse(child => {
          if (child.isMesh && child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach(m => {
              m.transparent = true;
              m.opacity = 0.95;
              m.depthWrite = false;
            });
          }
        });

        this.ballMeshes[i] = ballMesh;
        this.worlds[i].ball = ballMesh;
        this.ghostGroup.add(ballMesh);
      }

      // 3. Active dyed ball mesh (for primary camera tracking)
      if (this.createBallMesh) {
        const activeBall = this.createBallMesh(slot.hex);
        activeBall.name = `ActiveBall_${slot.name}`;
        activeBall.castShadow = true;
        activeBall.receiveShadow = true;
        this.activeBallMeshes[i] = activeBall;
      }
    }
  }

  /**
   * Cascading World Migration: SwitchWorld(playerId, targetWorldId)
   */
  switchWorld(playerId, targetWorldId) {
    if (!this.isActive) return;
    const p = this.players[playerId];
    if (!p) return;
    if (targetWorldId === p.currentWorldId) return;
    if (targetWorldId < 0 || targetWorldId >= 6) return;

    const sourceWorldId = p.currentWorldId;
    const currentWorld = this.worlds[sourceWorldId];
    const targetWorld = this.worlds[targetWorldId];

    // 判断迁移类型
    if (p.id === currentWorld.ownerId) {
      // 情况 A：p.id === currentWorld.ownerId（宿主迁移，带走本房间所有成员）
      const movingGroup = Array.from(currentWorld.presentPlayerIds);
      for (const pid of movingGroup) {
        const member = this.players[pid];
        if (member) member.currentWorldId = targetWorldId;
      }
      currentWorld.presentPlayerIds.clear();
      for (const pid of movingGroup) {
        targetWorld.presentPlayerIds.add(pid);
      }
    } else {
      // 情况 B：p.id !== currentWorld.ownerId（访客迁移，仅移动单人）
      currentWorld.presentPlayerIds.delete(p.id);
      targetWorld.presentPlayerIds.add(p.id);
      p.currentWorldId = targetWorldId;
    }

    // 球与世界显示状态管理
    if (currentWorld.presentPlayerIds.size === 0) {
      this.hideWorldBall(currentWorld.id);
    }
    if (targetWorld.presentPlayerIds.size > 0) {
      this.showWorldBall(targetWorld.id);
    }

    // 同步重构受影响的两个世界的物理 Arena（生成准确数量的多车，多车原生碰撞，且仅 1 个球）
    this._syncWorldArena(sourceWorldId);
    this._syncWorldArena(targetWorldId);

    // If active player was part of migration, rebind active player
    const activePlayer = this.players[this.activePlayerIndex];
    if (activePlayer && (activePlayer.currentWorldId === targetWorldId || activePlayer.currentWorldId === sourceWorldId)) {
      this.setActivePlayer(this.activePlayerIndex, true);
    }

    this._updateVisualVisibility();
    this._updateBottomLeftHud();
    this._renderCards();
    this.updateVisuals(0);
  }

  /**
   * Rebuild & Synchronize physics arena for a world to contain exactly
   * the cars of players present in this world, with car-to-car collision.
   */
  _syncWorldArena(worldId) {
    const world = this.worlds[worldId];
    if (!world) return;
    const arena = this.arenas[worldId];
    if (!arena || !arena.module) return;

    const { ht, ln } = this.constants;
    const activeWorldId = this.players[this.activePlayerIndex].currentWorldId;
    const presentIds = Array.from(world.presentPlayerIds);

    // 情况 1：世界中无玩家（空世界）：隐藏球并清空 Arena
    if (presentIds.length === 0) {
      this.hideWorldBall(worldId);
      if (arena.module._physics_createArena() !== 1) {
        console.error(`Failed to clear arena for empty world ${worldId}`);
      }
      arena.statePtr = arena.module._physics_getStatePtr();
      arena.stateLen = arena.module._physics_getStateSize();
      arena.controlsPtr = arena.module._physics_getControlsPtr();
      arena.stateView = null;
      arena.controlsView = null;
      if (this.prevStates[worldId]) this.prevStates[worldId].set(arena.state);
      if (this.currStates[worldId]) this.currStates[worldId].set(arena.state);
      return;
    }

    // 情况 2：世界中有 1~6 名玩家
    // 稳定保持自然排序，严禁为了凑 Car 0 而对活动玩家进行特殊重排
    const orderedPlayerIds = [...presentIds].sort((a, b) => a - b);

    // 保存该世界原本已在场的车辆和球的物理状态
    let savedBallState = null;
    if (world.ballVisible && arena.state && arena.state.length > ht.BALL + 18) {
      savedBallState = arena.state.slice(ht.BALL, ht.BALL + 18);
    }

    const savedCarStates = new Map();
    for (const pid of orderedPlayerIds) {
      const pl = this.players[pid];
      if (pl && pl.arenaCarIndex !== undefined && pl.currentWorldId === worldId && arena.state) {
        const offset = ht.CARS + pl.arenaCarIndex * ln;
        if (offset + ln <= arena.state.length) {
          savedCarStates.set(pid, arena.state.slice(offset, offset + ln));
        }
      }
    }

    // 重新创建物理 Arena（重置为 0 辆车和 1 个球）
    if (arena.module._physics_createArena() !== 1) {
      console.error();
      return;
    }
    arena.statePtr = arena.module._physics_getStatePtr();
    arena.stateLen = arena.module._physics_getStateSize();
    arena.controlsPtr = arena.module._physics_getControlsPtr();
    arena.stateView = null;
    arena.controlsView = null;
    if (typeof arena.setCarControls !== 'function') {
      arena.setCarControls = (cIdx, ctrl) => arena.setControls(cIdx, ctrl);
    }

    // 为该世界的所有玩家添加物理车辆（RocketSim 原生支持每个 arena 多辆车）
    for (let i = 0; i < orderedPlayerIds.length; i++) {
      const pid = orderedPlayerIds[i];
      const pl = this.players[pid];
      const team = PARALLEL_SLOTS[pid].team;
      const assignedIndex = arena.addCar(team, 'default');
      pl.arenaCarIndex = assignedIndex;
      pl.currentWorldId = worldId;
    }

    // 重置 Kickoff 基础参数
    arena.resetKickoff(-1);

    // 恢复球的状态
    if (savedBallState && world.ballVisible) {
      arena.state.set(savedBallState, ht.BALL);
      if (typeof arena.module._physics_setBallState === 'function') {
        try { arena.module._physics_setBallState(arena.statePtr + ht.BALL * 4); } catch (e) {}
      }
    } else {
      this.showWorldBall(worldId);
    }

    // 恢复原有车辆（防多车重叠）或为新迁入车辆严格按 index 安全生成
    for (let i = 0; i < orderedPlayerIds.length; i++) {
      const pid = orderedPlayerIds[i];
      const pl = this.players[pid];
      const offset = ht.CARS + i * ln;
      let restored = false;

      if (savedCarStates.has(pid)) {
        const state = savedCarStates.get(pid);
        const posX = state[ye.POS];
        const posY = state[ye.POS + 1];
        const posZ = state[ye.POS + 2];
        let overlaps = false;
        for (let j = 0; j < i; j++) {
          const prevOff = ht.CARS + j * ln;
          const dx = posX - arena.state[prevOff + ye.POS];
          const dy = posY - arena.state[prevOff + ye.POS + 1];
          const dz = posZ - arena.state[prevOff + ye.POS + 2];
          if (dx * dx + dy * dy + dz * dz < 250 * 250) {
            overlaps = true;
            break;
          }
        }
        if (!overlaps) {
          arena.state.set(state, offset);
          if (typeof arena.module._physics_setCarState === 'function') {
            try { arena.module._physics_setCarState(i, arena.statePtr + offset * 4); } catch (e) {}
          }
          pl.pos = { x: posX, y: posY, z: posZ };
          restored = true;
        }
      }

      if (!restored) {
        this.spawnPlayer(pl, worldId);
      }
    }

    // 同步前后状态缓存
    if (this.prevStates[worldId]) this.prevStates[worldId].set(arena.state);
    if (this.currStates[worldId]) this.currStates[worldId].set(arena.state);

    // 若为当前活动世界，同步主引擎物理引用
    if (worldId === activeWorldId && typeof this.onSwitchCallback === 'function') {
      this.onSwitchCallback(arena, this.prevStates[worldId], this.currStates[worldId]);
    }
  }

  /**
   * Hide World Ball: reset to origin and make invisible
   */
  hideWorldBall(worldId) {
    const world = this.worlds[worldId];
    if (!world) return;
    world.ballVisible = false;
    world.pos = { x: 0, y: 0, z: -10000 };
    world.vel = { x: 0, y: 0, z: 0 };
    if (world.ball) {
      world.ball.visible = false;
    }
    const ballMesh = this.ballMeshes[worldId];
    if (ballMesh) {
      ballMesh.visible = false;
      ballMesh.position.set(0, -10000, 0);
    }
    const arena = this.arenas[worldId];
    if (arena && arena.state) {
      const bOff = this.constants.ht.BALL;
      arena.state[bOff] = 0;
      arena.state[bOff + 1] = 0;
      arena.state[bOff + 2] = -10000;
      arena.state[bOff + 12] = 0;
      arena.state[bOff + 13] = 0;
      arena.state[bOff + 14] = 0;
      if (typeof arena.module._physics_setBallState === 'function') {
        try { arena.module._physics_setBallState(arena.statePtr + bOff * 4); } catch (e) {}
      }
    }
  }

  /**
   * Show World Ball
   */
  showWorldBall(worldId) {
    const world = this.worlds[worldId];
    if (!world) return;
    world.ballVisible = true;
    if (world.ball) {
      world.ball.visible = true;
    }
  }

  /**
   * Restore World Ball: reset to midfield (0, 0, 93) with zero velocity
   */
  restoreWorldBall(worldId) {
    const world = this.worlds[worldId];
    if (!world) return;
    world.ballVisible = true;
    world.pos = { x: 0, y: 0, z: 93 };
    world.vel = { x: 0, y: 0, z: 0 };
    world.lastTouchedPlayer = null;
    if (world.ball) {
      world.ball.visible = true;
    }
    const arena = this.arenas[worldId];
    if (arena && arena.state) {
      const bOff = this.constants.ht.BALL;
      arena.state[bOff] = 0;
      arena.state[bOff + 1] = 0;
      arena.state[bOff + 2] = 93;
      arena.state[bOff + 3] = 1;
      arena.state[bOff + 4] = 0;
      arena.state[bOff + 5] = 0;
      arena.state[bOff + 6] = 0;
      arena.state[bOff + 7] = 1;
      arena.state[bOff + 8] = 0;
      arena.state[bOff + 9] = 0;
      arena.state[bOff + 10] = 0;
      arena.state[bOff + 11] = 1;
      arena.state[bOff + 12] = 0;
      arena.state[bOff + 13] = 0;
      arena.state[bOff + 14] = 0;
      arena.state[bOff + 15] = 0;
      arena.state[bOff + 16] = 0;
      arena.state[bOff + 17] = 0;
      if (typeof arena.module._physics_setBallState === 'function') {
        try { arena.module._physics_setBallState(arena.statePtr + bOff * 4); } catch (e) {}
      }
    }
  }

  /**
   * Spawn Safety Algorithm: SpawnPlayer(player, worldId)
   */
  spawnPlayer(player, worldId) {
    const world = this.worlds[worldId];
    if (!world) return;
    const arena = this.arenas[worldId];
    if (!arena) return;

    const { ht, ln, ye } = this.constants;
    const cIdx = (player.arenaCarIndex !== undefined) ? player.arenaCarIndex : 0;
    const offset = ht.CARS + cIdx * ln;

    // 1. 获取该世界当前其他车辆的真实物理坐标（防重叠）
    const otherCarPositions = [];
    for (const pid of world.presentPlayerIds) {
      if (pid !== player.id) {
        const other = this.players[pid];
        if (other && other.arenaCarIndex !== undefined && other.currentWorldId === worldId) {
          const otherOff = ht.CARS + other.arenaCarIndex * ln;
          if (arena.state && otherOff + 3 <= arena.state.length) {
            otherCarPositions.push({
              x: arena.state[otherOff + ye.POS],
              y: arena.state[otherOff + ye.POS + 1],
              z: arena.state[otherOff + ye.POS + 2]
            });
          } else if (other.pos) {
            otherCarPositions.push({ x: other.pos.x, y: other.pos.y, z: other.pos.z });
          }
        }
      }
    }

    const ballPos = world.ballVisible && arena.state && arena.state.length > ht.BALL + 3
      ? { x: arena.state[ht.BALL], y: arena.state[ht.BALL + 1], z: arena.state[ht.BALL + 2] }
      : null;

    // 2. 严格根据 arenaCarIndex 确定初始开球点，严禁出现多车坐标重叠
    const R_safe = 350;
    const R_safe_sq = R_safe * R_safe;

    let selected = null;
    let maxMinDistSq = -1;
    let fallbackCandidate = SPAWN_PRESETS[cIdx % SPAWN_PRESETS.length];

    for (let step = 0; step < SPAWN_PRESETS.length; step++) {
      const candIdx = (cIdx + step) % SPAWN_PRESETS.length;
      const cand = SPAWN_PRESETS[candIdx];
      let isSafe = true;
      let minDistSq = Infinity;

      for (const cp of otherCarPositions) {
        const dx = cand.x - cp.x;
        const dy = cand.y - cp.y;
        const dz = cand.z - cp.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq < minDistSq) minDistSq = distSq;
        if (distSq < R_safe_sq) {
          isSafe = false;
          break;
        }
      }

      if (isSafe && ballPos) {
        const dx = cand.x - ballPos.x;
        const dy = cand.y - ballPos.y;
        const dz = cand.z - ballPos.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq < minDistSq) minDistSq = distSq;
        if (distSq < R_safe_sq) {
          isSafe = false;
        }
      }

      if (isSafe) {
        selected = cand;
        break;
      }

      if (minDistSq > maxMinDistSq) {
        maxMinDistSq = minDistSq;
        fallbackCandidate = cand;
      }
    }

    if (!selected) {
      selected = {
        x: fallbackCandidate.x + (cIdx * 280),
        y: fallbackCandidate.y,
        z: fallbackCandidate.z
      };
    }

    // 3. 重置物理参数与速度
    player.pos = { x: selected.x, y: selected.y, z: selected.z };
    player.vel = { x: 0, y: 0, z: 0 };
    player.angVel = { x: 0, y: 0, z: 0 };
    player.boost = 100;

    // 4. 朝向中场 (0, 0, 0)
    const yaw = Math.atan2(-selected.y, -selected.x);
    const fx = Math.cos(yaw);
    const fy = Math.sin(yaw);
    player.fwd = { x: fx, y: fy, z: 0 };
    player.up = { x: 0, y: 0, z: 1 };
    player.right = { x: fy, y: -fx, z: 0 };

    // 写入 arena 物理状态
    if (arena.state && arena.state.length >= offset + ln) {
      arena.state[offset + ye.POS] = selected.x;
      arena.state[offset + ye.POS + 1] = selected.y;
      arena.state[offset + ye.POS + 2] = selected.z;
      arena.state[offset + ye.VEL] = 0;
      arena.state[offset + ye.VEL + 1] = 0;
      arena.state[offset + ye.VEL + 2] = 0;
      arena.state[offset + ye.ANG_VEL] = 0;
      arena.state[offset + ye.ANG_VEL + 1] = 0;
      arena.state[offset + ye.ANG_VEL + 2] = 0;
      arena.state[offset + ye.FWD] = fx;
      arena.state[offset + ye.FWD + 1] = fy;
      arena.state[offset + ye.FWD + 2] = 0;
      arena.state[offset + ye.UP] = 0;
      arena.state[offset + ye.UP + 1] = 0;
      arena.state[offset + ye.UP + 2] = 1;
      arena.state[offset + ye.RIGHT] = fy;
      arena.state[offset + ye.RIGHT + 1] = -fx;
      arena.state[offset + ye.RIGHT + 2] = 0;
      arena.state[offset + ye.BOOST] = 100;
      arena.state[offset + ye.DEMOED] = 0;
      arena.state[offset + ye.ON_GROUND] = 1;

      if (typeof arena.module._physics_setCarState === 'function') {
        try { arena.module._physics_setCarState(cIdx, arena.statePtr + offset * 4); } catch (e) {}
      }
    }
    if (this.prevStates[worldId]) this.prevStates[worldId].set(arena.state);
    if (this.currStates[worldId]) this.currStates[worldId].set(arena.state);
  }

  /**
   * Switch Active Controlled Player (activePlayerIndex)
   * Instant camera rebind and keyboard isolation
   */
  setActivePlayer(targetPlayerIndex, forceRebind = false) {
    if (targetPlayerIndex < 0 || targetPlayerIndex >= 6) return;
    if (!forceRebind && targetPlayerIndex === this.activePlayerIndex) return;

    const targetPlayer = this.players[targetPlayerIndex];
    const targetWorldId = targetPlayer.currentWorldId;

    // 核心重构：废除“物理状态交换（State Swap）”逻辑
    // 严禁交换或覆写车辆物理位置与速度，每辆车在物理世界中的坐标必须绝对独立且持续累加
    this.activePlayerIndex = targetPlayerIndex;

    // 1. 更新视觉标识
    this._applySlotVisuals(targetPlayerIndex);

    // 2. 调用切换回调将主物理引用 s.sim 切换到目标世界
    if (typeof this.onSwitchCallback === 'function' && this.arenas[targetWorldId]) {
      this.onSwitchCallback(
        this.arenas[targetWorldId],
        this.prevStates[targetWorldId],
        this.currStates[targetWorldId]
      );
    }

    // 3. 镜头硬切：清除平滑插值镜头延迟，直接对齐目标车
    if (this.cameraManager && this.cameraManager.kernel) {
      this.cameraManager.kernel.resetView();
    }

    // 4. 音效隔离：重置引擎合成器
    this.resetEngineAudio();

    // 5. 更新 HUD 与卡片面板
    this._updateVisualVisibility();
    this._updateBottomLeftHud();
    this._renderCards();
  }

  /**
   * Goal Detection & Local Reset
   */
  onGoalScored(worldId) {
    const world = this.worlds[worldId];
    if (!world) return;

    // 1. Score rule: Award score to Worlds[w].ball.lastTouchedPlayer
    if (world.lastTouchedPlayer !== null && this.players[world.lastTouchedPlayer]) {
      this.players[world.lastTouchedPlayer].score += 1;
    }

    // 2. Reset Worlds[w].ball to midfield (0, 0, 93) with zero velocity
    this.restoreWorldBall(worldId);

    // 3. Local Reset Scope: Only reset players present in Worlds[w]
    for (const pid of world.presentPlayerIds) {
      const p = this.players[pid];
      if (p) {
        this.spawnPlayer(p, worldId);
      }
    }

    // 4. Update state buffers
    const arena = this.arenas[worldId];
    if (arena && arena.state) {
      if (this.prevStates[worldId]) this.prevStates[worldId].set(arena.state);
      if (this.currStates[worldId]) this.currStates[worldId].set(arena.state);
    }

    // 5. If this is the active world, reset audio and notify
    if (worldId === this.players[this.activePlayerIndex].currentWorldId) {
      this.resetEngineAudio();
      if (typeof this.onSwitchCallback === 'function' && arena) {
        this.onSwitchCallback(arena, this.prevStates[worldId], this.currStates[worldId]);
      }
    }

    this._updateBottomLeftHud();
    this._renderCards();
    this.updateVisuals(0);
  }

  handleActiveWorldGoal() {
    const activeWorldId = this.players[this.activePlayerIndex].currentWorldId;
    this.onGoalScored(activeWorldId);
  }

  resetActiveSlot() {
    if (!this.isActive) return;
    const activeWorldId = this.players[this.activePlayerIndex].currentWorldId;
    this.onGoalScored(activeWorldId);
  }

  /**
   * Set unlimited boost for a player
   */
  setUnlimitedBoost(playerId, enabled) {
    if (playerId < 0 || playerId >= 6) return;
    const isUnlimited = Boolean(enabled);
    this.players[playerId].unlimitedBoost = isUnlimited;
    this.unlimitedBoost[playerId] = isUnlimited;

    const player = this.players[playerId];
    const worldId = player.currentWorldId;
    const arena = this.arenas[worldId];
    if (arena && arena.state) {
      const cIdx = (player.arenaCarIndex !== undefined) ? player.arenaCarIndex : 0;
      const off = this.constants.ht.CARS + cIdx * this.constants.ln;
      if (isUnlimited && off + this.constants.ye.BOOST < arena.state.length) {
        arena.state[off + this.constants.ye.BOOST] = 100;
      }
    }
    this._updateBottomLeftHud();
    this._renderCards();
  }

  /**
   * Visibility Rule: IsButtonVisible(rowPlayerId, targetWorldId)
   */
  isButtonVisible(rowPlayerId, targetWorldId) {
    // 规则 1：玩家永远可以看到并回到自己的世界
    if (rowPlayerId === targetWorldId) return true;

    // 规则 2：目标世界的宿主必须在其自己的世界内部，其他人才能看到该按钮
    const targetWorld = this.worlds[targetWorldId];
    if (!targetWorld) return false;
    return targetWorld.presentPlayerIds.has(targetWorld.ownerId);
  }

  /**
   * Feed WASD keyboard/touch controls ONLY to the active player's world
   */
  applyActivePlayerControls(controls) {
    if (!this.isActive) return;
    const p = this.players[this.activePlayerIndex];
    if (!p) return;
    const worldId = p.currentWorldId;
    const arena = this.arenas[worldId];
    if (!arena) return;

    const { ht, ln, ye } = this.constants;
    const world = this.worlds[worldId];
    const activeCarIdx = (p.arenaCarIndex !== undefined) ? p.arenaCarIndex : 0;

    // 控制路由：根据当前主控玩家的 arenaCarIndex 精准发送控制输入，严禁只发给 Car 0
    arena.setControls(activeCarIdx, controls);

    // 若主控玩家处于无限气状态，自动补充
    if (p.unlimitedBoost && arena.state) {
      const off = ht.CARS + activeCarIdx * ln;
      if (off + ye.BOOST < arena.state.length) {
        arena.state[off + ye.BOOST] = 100;
      }
    }

    // 其他空闲车辆置零控制并按需补充无限喷气
    if (world) {
      for (const pid of world.presentPlayerIds) {
        if (pid === this.activePlayerIndex) continue;
        const pl = this.players[pid];
        if (!pl || pl.arenaCarIndex === undefined) continue;
        const cIdx = pl.arenaCarIndex;

        arena.setControls(cIdx, ZERO_CONTROLS);

        if (pl.unlimitedBoost && arena.state) {
          const off = ht.CARS + cIdx * ln;
          if (off + ye.BOOST < arena.state.length) {
            arena.state[off + ye.BOOST] = 100;
          }
        }
      }
    }
  }

  getActiveArenaCarIndex() {
    const p = this.players[this.activePlayerIndex];
    return (p && p.arenaCarIndex !== undefined) ? p.arenaCarIndex : 0;
  }

  getActiveCarMesh() {
    return this.carMeshes[this.activePlayerIndex] || (this.arenaWorld && this.arenaWorld.cars ? this.arenaWorld.cars[0] : null);
  }

  getActiveArena() {
    const p = this.players[this.activePlayerIndex];
    const worldId = p ? p.currentWorldId : 0;
    return this.arenas[worldId] || this.arenas[0];
  }

  /**
   * Step background arenas at 120Hz
   */
  stepBackgroundArenas(ticks, alpha, activePrevState = null, activeCurrState = null) {
    if (!this.isActive) return;
    const { ht, ln, ye } = this.constants;
    const activeWorldId = this.players[this.activePlayerIndex].currentWorldId;

    // Sync active world state buffers if provided from s
    if (activePrevState && this.prevStates[activeWorldId]) {
      this.prevStates[activeWorldId].set(activePrevState);
    }
    if (activeCurrState && this.currStates[activeWorldId]) {
      this.currStates[activeWorldId].set(activeCurrState);
    } else {
      const activeArena = this.arenas[activeWorldId];
      if (activeArena && activeArena.state && this.currStates[activeWorldId]) {
        this.currStates[activeWorldId].set(activeArena.state);
      }
    }

    // Step background worlds
    for (let w = 0; w < 6; w++) {
      if (w === activeWorldId) continue;
      const world = this.worlds[w];
      const arena = this.arenas[w];
      if (!world || !arena) continue;

      // Skip empty background worlds (saves CPU)
      if (world.presentPlayerIds.size === 0) continue;

      if (ticks > 0) {
        if (this.prevStates[w] && this.currStates[w]) {
          this.prevStates[w].set(this.currStates[w]);
        }

        // Apply zero controls and boost refills for all cars in this background world
        for (const pid of world.presentPlayerIds) {
          const pl = this.players[pid];
          if (!pl || pl.arenaCarIndex === undefined) continue;
          const cIdx = pl.arenaCarIndex;

          arena.setControls(cIdx, ZERO_CONTROLS);

          if (pl.unlimitedBoost && arena.state) {
            const off = ht.CARS + cIdx * ln;
            if (off + ye.BOOST < arena.state.length) {
              arena.state[off + ye.BOOST] = 100;
            }
          }
        }

        arena.step(ticks);

        // Goal detection on background World w
        const goalScored = arena.pollGoal() !== 0;
        if (goalScored) {
          this.onGoalScored(w);
        } else if (this.currStates[w] && arena.state) {
          this.currStates[w].set(arena.state);
        }
      }
    }

    // Touch tracking
    this._updateTouchTracking();

    // Visual updates
    this.updateVisuals(alpha);
  }

  _updateTouchTracking() {
    for (let w = 0; w < 6; w++) {
      const world = this.worlds[w];
      if (!world || !world.ballVisible) continue;
      const arena = this.arenas[w];
      if (!arena || !arena.state) continue;

      const ballX = arena.state[this.constants.ht.BALL];
      const ballY = arena.state[this.constants.ht.BALL + 1];
      const ballZ = arena.state[this.constants.ht.BALL + 2];
      world.pos = { x: ballX, y: ballY, z: ballZ };

      // Check distance from cars in this world to the ball
      for (const pid of world.presentPlayerIds) {
        const p = this.players[pid];
        if (!p || !p.pos) continue;
        const dx = p.pos.x - ballX;
        const dy = p.pos.y - ballY;
        const dz = p.pos.z - ballZ;
        const distSq = dx * dx + dy * dy + dz * dz;
        // Ball radius ~93, car radius ~100 -> contact within ~220 UU
        if (distSq < 48400) {
          world.lastTouchedPlayer = p.id;
          p.lastTouchedBall = world.ball;
        }
      }
    }
  }

  /**
   * Update visual positions of all cars and balls
   */
  updateVisuals(alpha) {
    if (!this.isActive) return;
    const { ht, ln, ye } = this.constants;
    const activeWorldId = this.players[this.activePlayerIndex].currentWorldId;

    // 隐藏单人原生 Car 0，由 carMeshes 全权负责同世界多车精准渲染
    if (this.arenaWorld && this.arenaWorld.cars && this.arenaWorld.cars[0]) {
      this.arenaWorld.cars[0].visible = false;
    }

    // 1. 更新所有在场玩家的车辆视觉
    for (let pIdx = 0; pIdx < 6; pIdx++) {
      const p = this.players[pIdx];
      const carMesh = this.carMeshes[pIdx];
      if (!p || !carMesh) continue;

      const worldId = p.currentWorldId;
      const prev = this.prevStates[worldId];
      const curr = this.currStates[worldId];
      const world = this.worlds[worldId];
      const isPresent = world && world.presentPlayerIds.has(pIdx);
      const cIdx = (p.arenaCarIndex !== undefined) ? p.arenaCarIndex : 0;
      const offset = ht.CARS + cIdx * ln;

      if (isPresent && prev && curr && (offset + ln <= curr.length)) {
        const isDemoed = (curr[offset + ye.DEMOED] === 1);
        carMesh.visible = !isDemoed;
        if (!isDemoed) {
          this._applyPhysTransform(carMesh, prev, curr, offset, alpha);
          p.pos.x = carMesh.position.x;
          p.pos.y = carMesh.position.z; // Three.js Z is RocketSim Y
          p.pos.z = carMesh.position.y; // Three.js Y is RocketSim Z
        }
      } else {
        carMesh.visible = false;
      }
    }

    // 2. 更新球的视觉
    for (let w = 0; w < 6; w++) {
      const world = this.worlds[w];
      const ballMesh = this.ballMeshes[w];
      if (!world || !ballMesh) continue;

      const prev = this.prevStates[w];
      const curr = this.currStates[w];

      if (world.presentPlayerIds.size === 0 || !world.ballVisible) {
        ballMesh.visible = false;
        continue;
      }

      if (w === activeWorldId) {
        ballMesh.visible = false; // 活动世界由主引擎渲染 N.ball
      } else {
        ballMesh.visible = true;
        if (prev && curr) {
          this._applyPhysTransform(ballMesh, prev, curr, ht.BALL, alpha);
        }
      }
    }
  }

  _updateVisualVisibility() {
    const activeWorldId = this.players[this.activePlayerIndex].currentWorldId;

    for (let pIdx = 0; pIdx < 6; pIdx++) {
      const p = this.players[pIdx];
      const carMesh = this.carMeshes[pIdx];
      if (carMesh && p) {
        const world = this.worlds[p.currentWorldId];
        const isPresent = world && world.presentPlayerIds.has(pIdx);
        carMesh.visible = Boolean(isPresent);
      }
    }

    for (let w = 0; w < 6; w++) {
      const world = this.worlds[w];
      const ballMesh = this.ballMeshes[w];
      if (ballMesh && world) {
        ballMesh.visible = (w !== activeWorldId && world.presentPlayerIds.size > 0 && world.ballVisible);
      }
    }
  }

  _applySlotVisuals(slotIndex) {
    // 隐藏单人 Car 0
    if (this.arenaWorld && this.arenaWorld.cars && this.arenaWorld.cars[0]) {
      this.arenaWorld.cars[0].visible = false;
    }

    // 切换活动球的视觉挂载到 N.ball
    const activeWorldId = this.players[slotIndex].currentWorldId;
    if (this.arenaWorld && this.arenaWorld.ball && this.activeBallMeshes[activeWorldId]) {
      const activeBallGroup = this.arenaWorld.ball;
      if (!this.savedBallChild && activeBallGroup.children.length > 0) {
        this.savedBallChild = activeBallGroup.children[0];
      }
      while (activeBallGroup.children.length > 0) {
        activeBallGroup.remove(activeBallGroup.children[0]);
      }
      activeBallGroup.add(this.activeBallMeshes[activeWorldId]);
    }

    this._updateVisualVisibility();
  }

  _restoreActiveCarAndBall() {
    if (this.arenaWorld) {
      if (this.arenaWorld.cars && this.arenaWorld.cars[0]) {
        this.arenaWorld.cars[0].visible = true;
        if (this.recolorCar) {
          this.recolorCar(this.arenaWorld.cars[0], 0x2F7BD3);
        }
      }
      if (this.arenaWorld.ball && this.savedBallChild) {
        while (this.arenaWorld.ball.children.length > 0) {
          this.arenaWorld.ball.remove(this.arenaWorld.ball.children[0]);
        }
        this.arenaWorld.ball.add(this.savedBallChild);
      }
    }
  }

  _applyPhysTransform(mesh, prev, curr, offset, alpha) {
    const pxA = prev[offset],     pyA = prev[offset + 2], pzA = prev[offset + 1];
    const pxB = curr[offset],     pyB = curr[offset + 2], pzB = curr[offset + 1];
    mesh.position.set(
      pxA + (pxB - pxA) * alpha,
      pyA + (pyB - pyA) * alpha,
      pzA + (pzB - pzA) * alpha
    );

    if (this._m4 && this._q1 && this._q2) {
      this._getBasisQuaternion(prev, offset + 3, this._q1);
      this._getBasisQuaternion(curr, offset + 3, this._q2);
      mesh.quaternion.slerpQuaternions(this._q1, this._q2, alpha);
    }
  }

  _getBasisQuaternion(stateArr, offset, targetQuat) {
    const fx = stateArr[offset],     fy = stateArr[offset + 1], fz = stateArr[offset + 2];
    const rx = stateArr[offset + 3], ry = stateArr[offset + 4], rz = stateArr[offset + 5];
    const ux = stateArr[offset + 6], uy = stateArr[offset + 7], uz = stateArr[offset + 8];

    this._m4.set(
      fx, ux, rx, 0,
      fz, uz, rz, 0,
      fy, uy, ry, 0,
      0,  0,  0,  1
    );
    targetQuat.setFromRotationMatrix(this._m4);
    return targetQuat;
  }

  _disableFreeplayConflicts() {
    this.disabledConflictElements = [];
    const touchBallActions = this.container.querySelector('.touch-ball-actions');
    if (touchBallActions && touchBallActions.style.display !== 'none') {
      touchBallActions.style.display = 'none';
      this.disabledConflictElements.push(touchBallActions);
    }
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

  _restoreFreeplayConflicts() {
    for (const el of this.disabledConflictElements) {
      if (el) el.style.display = '';
    }
    this.disabledConflictElements = [];
  }

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
        #parallel-training-btn.is-active {
          background: var(--mark) !important;
          color: var(--outline) !important;
          border-color: var(--outline) !important;
          box-shadow: inset 0 2px #fff6, 0 1px var(--outline) !important;
        }

        /* Frosted Glass Management Overlay */
        .parallel-overlay {
          display: none;
          position: fixed;
          inset: 0;
          background: rgba(5, 10, 20, 0.65);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
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
          max-width: 820px;
          max-height: 92vh;
          overflow-y: auto;
          background: rgba(15, 23, 42, 0.92);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 16px;
          box-shadow: 0 24px 64px rgba(0, 0, 0, 0.8), 0 0 40px rgba(56, 189, 248, 0.15);
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

        /* 6x1 Matrix Rows */
        .parallel-matrix-container {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .parallel-matrix-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 10px 14px;
          gap: 12px;
          transition: all 0.15s ease;
        }
        .parallel-matrix-row:hover {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(255, 255, 255, 0.15);
        }
        .parallel-matrix-row.is-active-driver {
          border-color: rgba(56, 189, 248, 0.5);
          background: rgba(56, 189, 248, 0.08);
          box-shadow: inset 0 0 16px rgba(56, 189, 248, 0.08);
        }

        .parallel-row-left {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 250px;
        }
        .parallel-player-identity {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .player-color-pip {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          display: inline-block;
        }
        .player-name {
          font-size: 14px;
          font-weight: 700;
          color: #ffffff;
        }
        .driver-badge {
          font-size: 10px;
          font-weight: 800;
          color: #38bdf8;
          background: rgba(56, 189, 248, 0.2);
          border: 1px solid rgba(56, 189, 248, 0.4);
          padding: 2px 6px;
          border-radius: 4px;
        }
        .player-score-badge {
          font-size: 11px;
          font-weight: 700;
          color: #facc15;
          margin-left: 2px;
        }

        .unlimited-boost-btn {
          padding: 5px 10px;
          font-size: 11px;
          font-weight: 700;
          border-radius: 6px;
          cursor: pointer;
          background: rgba(255, 255, 255, 0.08);
          color: #94a3b8;
          border: 1px solid rgba(255, 255, 255, 0.15);
          transition: all 0.15s ease;
          user-select: none;
          white-space: nowrap;
        }
        .unlimited-boost-btn:hover {
          background: rgba(255, 255, 255, 0.15);
          color: #ffffff;
        }
        .unlimited-boost-btn.is-active {
          background: rgba(56, 189, 248, 0.25);
          color: #38bdf8;
          border-color: #38bdf8;
          box-shadow: 0 0 10px rgba(56, 189, 248, 0.35);
        }

        .parallel-row-right {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .world-target-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 10px;
          font-size: 11px;
          font-weight: 700;
          border-radius: 6px;
          cursor: pointer;
          background: rgba(255, 255, 255, 0.06);
          color: #ffffff;
          border: 1px solid var(--world-color, #ffffff);
          transition: all 0.15s ease;
          user-select: none;
        }
        .world-target-btn:hover {
          background: rgba(255, 255, 255, 0.18);
          box-shadow: 0 0 12px var(--world-color, #ffffff);
          transform: translateY(-1px);
        }
        .world-target-btn.is-current-world {
          background: rgba(255, 255, 255, 0.22);
          box-shadow: inset 0 0 8px var(--world-color, #ffffff);
          font-weight: 800;
        }
        .world-btn-pip {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          display: inline-block;
        }
        .world-here-badge {
          font-size: 9px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 3px;
          padding: 1px 4px;
        }

        /* Bottom-Left Player HUD */
        .parallel-player-hud {
          display: none;
          position: fixed;
          bottom: 24px;
          left: 24px;
          align-items: center;
          gap: 12px;
          padding: 8px 16px;
          background: rgba(15, 23, 42, 0.86);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 12px;
          color: #ffffff;
          font-family: var(--sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
          font-size: 14px;
          font-weight: 700;
          z-index: 1000;
          pointer-events: none;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
          transition: all 0.2s ease;
        }

        /* Entry Confirm Modal */
        .parallel-confirm-overlay {
          display: none;
          position: fixed;
          inset: 0;
          background: rgba(5, 10, 20, 0.7);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          z-index: 3000;
          align-items: center;
          justify-content: center;
          padding: 16px;
          animation: parallelFadeIn 0.15s ease-out;
        }
        .parallel-confirm-dialog {
          width: 100%;
          max-width: 440px;
          background: rgba(15, 23, 42, 0.94);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 16px;
          box-shadow: 0 24px 64px rgba(0, 0, 0, 0.85);
          color: #f1f5f9;
          font-family: var(--sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          box-sizing: border-box;
        }
        .parallel-confirm-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          padding-bottom: 10px;
        }
        .parallel-confirm-footer {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 12px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          padding-top: 14px;
        }
        .parallel-modal-btn {
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 700;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .parallel-modal-btn--cancel {
          background: rgba(255, 255, 255, 0.08);
          color: #94a3b8;
          border: 1px solid rgba(255, 255, 255, 0.15);
        }
        .parallel-modal-btn--cancel:hover {
          background: rgba(255, 255, 255, 0.16);
          color: #ffffff;
        }
        .parallel-modal-btn--confirm {
          background: #0284c7;
          color: #ffffff;
          border: 1px solid #38bdf8;
          box-shadow: 0 0 16px rgba(56, 189, 248, 0.4);
        }
        .parallel-modal-btn--confirm:hover {
          background: #0369a1;
          transform: translateY(-1px);
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

    // 3. Management Modal Panel Overlay (6x1 Grid Matrix)
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
              Multi-World Parallel Matrix (平行世界训练矩阵)
            </h2>
            <p>6 行玩家矩阵架构 · 实时世界迁移 · 独立安全出生点 · 专属进球局部重置</p>
          </div>
          <button type="button" class="parallel-close-btn" data-action="close" title="Close Panel (Tab)">✕</button>
        </header>

        <div class="parallel-matrix-container" id="parallel-matrix-rows">
          <!-- 6 Rows generated dynamically -->
        </div>

        <footer class="parallel-footer">
          <div class="parallel-tips">
            快捷键：<kbd>Tab</kbd> 菜单 &nbsp;|&nbsp; <kbd>←</kbd> <kbd>→</kbd> 切车 &nbsp;|&nbsp; <kbd>WASD</kbd> 专属操控
          </div>
          <button type="button" class="exit-training-btn" data-action="exit">
            退出训练 (Exit)
          </button>
        </footer>
      </div>
    `;

    overlay.querySelector('[data-action="close"]').addEventListener('click', () => this.closeMenu());
    overlay.querySelector('[data-action="exit"]').addEventListener('click', () => this.exit());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.closeMenu();
    });

    this.container.appendChild(overlay);
    this.panelOverlay = overlay;
    this.cardsContainer = overlay.querySelector('#parallel-matrix-rows');

    // 4. Bottom-Left HUD Element
    const hud = document.createElement('div');
    hud.id = 'parallel-player-hud';
    hud.className = 'parallel-player-hud';
    this.container.appendChild(hud);
    this.playerHudEl = hud;
  }

  /**
   * Render the 6x1 Matrix Rows
   */
  _renderCards() {
    if (!this.cardsContainer || typeof this.cardsContainer.appendChild !== 'function') return;
    this.cardsContainer.innerHTML = '';

    for (let r = 0; r < 6; r++) {
      const p = this.players[r];
      const slot = PARALLEL_SLOTS[r];
      const isCurrentActiveDriver = (r === this.activePlayerIndex);

      const rowEl = document.createElement('div');
      rowEl.className = `parallel-matrix-row ${isCurrentActiveDriver ? 'is-active-driver' : ''}`;

      // 1. Left Section: Identity & Unlimited Boost Toggle
      const leftCol = document.createElement('div');
      leftCol.className = 'parallel-row-left';
      leftCol.innerHTML = `
        <div class="parallel-player-identity">
          <span class="player-color-pip" style="background:${slot.hex};box-shadow:0 0 8px ${slot.hex};"></span>
          <span class="player-name">${slot.name} (${slot.nameZh})</span>
          ${isCurrentActiveDriver ? '<span class="driver-badge">WASD 驾驶中</span>' : ''}
          <span class="player-score-badge">★ ${p.score}</span>
        </div>
        <button type="button" class="unlimited-boost-btn ${p.unlimitedBoost ? 'is-active' : ''}" data-row="${r}">
          ${p.unlimitedBoost ? '⚡ Boost: INF' : 'Boost: Normal'}
        </button>
      `;

      const boostBtn = leftCol.querySelector('.unlimited-boost-btn');
      boostBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setUnlimitedBoost(r, !p.unlimitedBoost);
      });

      // 2. Right Section: 6 Adaptive Colored World Buttons
      const rightCol = document.createElement('div');
      rightCol.className = 'parallel-row-right';

      for (let c = 0; c < 6; c++) {
        const targetSlot = PARALLEL_SLOTS[c];
        const targetWorld = this.worlds[c];
        const isVisible = this.isButtonVisible(r, c);
        const isCurrentWorld = (p.currentWorldId === c);
        const occupantCount = targetWorld ? targetWorld.presentPlayerIds.size : 0;

        const worldBtn = document.createElement('button');
        worldBtn.type = 'button';
        worldBtn.className = `world-target-btn ${isCurrentWorld ? 'is-current-world' : ''}`;
        worldBtn.style.setProperty('--world-color', targetSlot.hex);
        worldBtn.setAttribute('data-target-world', c);
        worldBtn.setAttribute('title', `迁移至 ${targetSlot.name} 世界 (World ${c}, 当前 ${occupantCount} 车)`);

        if (!isVisible) {
          worldBtn.style.display = 'none';
        }

        worldBtn.innerHTML = `
          <span class="world-btn-pip" style="background:${targetSlot.hex};"></span>
          <span class="world-btn-label">W${c} ${targetSlot.nameZh}</span>
          ${occupantCount > 1 ? `<span style="font-size:10px;opacity:0.85;margin-left:2px;font-weight:700;">(${occupantCount}车)</span>` : ''}
          ${isCurrentWorld ? '<span class="world-here-badge">当前</span>' : ''}
        `;

        worldBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.switchWorld(r, c);
        });

        rightCol.appendChild(worldBtn);
      }

      rowEl.style.cursor = 'pointer';
      rowEl.addEventListener('click', () => {
        this.setActivePlayer(r);
      });
      rowEl.appendChild(leftCol);
      rowEl.appendChild(rightCol);
      this.cardsContainer.appendChild(rowEl);
    }
  }

  /**
   * Refresh bottom-left HUD display
   */
  _updateBottomLeftHud() {
    if (!this.playerHudEl) return;
    const p = this.players[this.activePlayerIndex];
    if (!p) return;
    const slot = PARALLEL_SLOTS[p.id];
    const worldSlot = PARALLEL_SLOTS[p.currentWorldId];

    this.playerHudEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${slot.hex};box-shadow:0 0 10px ${slot.hex};"></span>
        <span style="color:#ffffff;font-size:14px;font-weight:800;">
          ${slot.name} <span style="opacity:0.75;font-weight:600;">(${slot.nameZh}车)</span>
        </span>
        <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px;background:rgba(255,255,255,0.12);border:1px solid ${worldSlot.hex};color:${worldSlot.hex};">
          World ${p.currentWorldId} (${worldSlot.nameZh}世界 · ${this.worlds[p.currentWorldId] ? this.worlds[p.currentWorldId].presentPlayerIds.size : 1}车同场)
        </span>
        <span style="font-size:11px;color:${p.unlimitedBoost ? '#38bdf8' : '#94a3b8'};font-weight:700;">
          ${p.unlimitedBoost ? '⚡ Boost: INF' : 'Boost: 100'}
        </span>
        <span style="font-size:11px;color:#facc15;font-weight:800;">
          ★ ${p.score}
        </span>
      </div>
      <div style="font-size:11px;color:#94a3b8;margin-left:10px;display:flex;align-items:center;gap:6px;">
        <kbd style="padding:1px 5px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:4px;color:#fff;">←</kbd>
        <kbd style="padding:1px 5px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:4px;color:#fff;">→</kbd>
        <span>切车</span>
        <kbd style="padding:1px 5px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:4px;color:#fff;margin-left:4px;">Tab</kbd>
        <span>矩阵菜单</span>
      </div>
    `;
  }
}
