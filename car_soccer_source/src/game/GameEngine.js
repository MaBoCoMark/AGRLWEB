/**
 * GameEngine.js
 * Main Game Controller:
 * Coordinates Three.js rendering, 120Hz physics stepping, AI opponent,
 * camera tracking, audio synthesis, and match state management.
 */

import THREE from '../vendor/three.js';
import { PhysicsManager } from '../physics/PhysicsManager.js';
import { ArenaEntity } from '../entities/ArenaEntity.js';
import { BallEntity } from '../entities/BallEntity.js';
import { CarEntity } from '../entities/CarEntity.js';
import { CameraController } from '../camera/CameraController.js';
import { InputManager } from '../input/InputManager.js';
import { BotController } from '../ai/BotController.js';
import { SoundEffects } from '../audio/SoundEffects.js';
import { HUD } from '../ui/HUD.js';
import { SIM_STATE, CAR_STATE, CAR_STATE_STRIDE, TEAMS } from '../constants/GameConstants.js';

export const MATCH_PHASE = {
  COUNTDOWN: 'countdown',
  PLAYING: 'playing',
  GOAL_SCORED: 'goal_scored',
  ENDED: 'ended',
};

export class GameEngine {
  constructor(container) {
    this.container = container;
    this.phase = MATCH_PHASE.COUNTDOWN;
    this.countdownTimer = 3.0;

    this.blueScore = 0;
    this.orangeScore = 0;
    this.matchTime = 300; // 5:00
    this.isOvertime = false;

    // Fixed timestep accumulator for 120Hz physics
    this.physicsAccumulator = 0;
    this.physicsStepDt = 1 / 120;
    this.lastFrameTime = performance.now();

    // Subsystems
    this.physics = new PhysicsManager();
    this.input = new InputManager();
    this.audio = new SoundEffects();
    this.bot = new BotController(TEAMS.ORANGE);
    this.cameraCtrl = new CameraController();

    this.setupThreeScene();
    this.hud = new HUD(this.container);
  }

  setupThreeScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a1424);
    this.scene.fog = new THREE.FogExp2(0x0a1424, 0.00004);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // Lighting setup
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x223344, 0.65);
    this.scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xfffaed, 1.2);
    dirLight.position.set(2000, 4000, 2000);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 500;
    dirLight.shadow.camera.far = 10000;
    dirLight.shadow.camera.left = -5000;
    dirLight.shadow.camera.right = 5000;
    dirLight.shadow.camera.top = 6000;
    dirLight.shadow.camera.bottom = -6000;
    this.scene.add(dirLight);

    // Entities
    this.arena = new ArenaEntity();
    this.arena.addToScene(this.scene);

    this.ball = new BallEntity();
    this.ball.addToScene(this.scene);

    this.playerCar = new CarEntity(0, TEAMS.BLUE);
    this.playerCar.addToScene(this.scene);

    this.botCar = new CarEntity(1, TEAMS.ORANGE);
    this.botCar.addToScene(this.scene);

    window.addEventListener('resize', () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.cameraCtrl.resize(window.innerWidth, window.innerHeight);
    });
  }

  async start() {
    await this.physics.init();

    // Register user interaction to unlock Web Audio
    const unlockAudio = () => {
      this.audio.init();
      this.audio.resume();
      window.removeEventListener('keydown', unlockAudio);
      window.removeEventListener('mousedown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
    window.addEventListener('keydown', unlockAudio);
    window.addEventListener('mousedown', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);

    this.startKickoff();
    this.lastFrameTime = performance.now();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  startKickoff() {
    this.phase = MATCH_PHASE.COUNTDOWN;
    this.countdownTimer = 3.5;
    this.physics.resetKickoff(0);

    // Zero out controls
    this.physics.setControls(0, { throttle: 0, steer: 0, pitch: 0, yaw: 0, roll: 0, jump: false, boost: false, handbrake: false });
    this.physics.setControls(1, { throttle: 0, steer: 0, pitch: 0, yaw: 0, roll: 0, jump: false, boost: false, handbrake: false });
  }

  loop(currentTime) {
    requestAnimationFrame(this.loop);

    const frameDt = Math.min((currentTime - this.lastFrameTime) / 1000, 0.1);
    this.lastFrameTime = currentTime;

    // 1. Process Input & Camera
    if (this.input.consumeBallCamToggle()) {
      const isBallCam = this.cameraCtrl.toggleBallCam();
      this.hud.updateBallCam(isBallCam);
    }
    if (this.input.consumeReset()) {
      this.startKickoff();
    }

    const playerControls = this.input.read();

    // 2. State Machine & Countdown
    if (this.phase === MATCH_PHASE.COUNTDOWN) {
      this.countdownTimer -= frameDt;
      if (this.countdownTimer > 2.0) {
        this.hud.showCountdown('3');
      } else if (this.countdownTimer > 1.0) {
        this.hud.showCountdown('2');
      } else if (this.countdownTimer > 0.0) {
        this.hud.showCountdown('1');
      } else {
        this.hud.showCountdown('GO!');
        this.phase = MATCH_PHASE.PLAYING;
      }
    } else if (this.phase === MATCH_PHASE.PLAYING) {
      // Match Timer countdown
      if (!this.isOvertime) {
        this.matchTime -= frameDt;
        if (this.matchTime <= 0) {
          this.matchTime = 0;
          if (this.blueScore === this.orangeScore) {
            this.isOvertime = true;
          } else {
            this.phase = MATCH_PHASE.ENDED;
          }
        }
      } else {
        this.matchTime += frameDt;
      }
      this.hud.updateTimer(this.matchTime, this.isOvertime);

      // AI Decision
      const botControls = this.bot.decide(this.physics.state);

      // Feed controls to physics
      this.physics.setControls(0, playerControls);
      this.physics.setControls(1, botControls);

      // Physics stepping (120Hz accumulator)
      this.physicsAccumulator += frameDt;
      while (this.physicsAccumulator >= this.physicsStepDt) {
        this.physics.step(1);
        this.physicsAccumulator -= this.physicsStepDt;
      }

      // Check for Goal
      const goalScored = this.physics.pollGoal();
      if (goalScored !== 0) {
        this.onGoal(goalScored);
      }
    } else if (this.phase === MATCH_PHASE.GOAL_SCORED) {
      // Goal celebration pause
      this.goalDelay -= frameDt;
      if (this.goalDelay <= 0) {
        if (this.isOvertime) {
          this.phase = MATCH_PHASE.ENDED;
        } else {
          this.startKickoff();
        }
      }
    }

    // 3. Sync Visuals with Physics State
    this.syncVisuals(playerControls, frameDt);

    // 4. Update Audio Engine
    const state = this.physics.state;
    const playerSpeed = Math.hypot(state[SIM_STATE.CARS + CAR_STATE.VEL + 0], state[SIM_STATE.CARS + CAR_STATE.VEL + 1]);
    const isBoosting = playerControls.boost && state[SIM_STATE.CARS + CAR_STATE.BOOST] > 0;
    this.audio.updateEngine(playerSpeed, isBoosting);

    // 5. Update Camera
    this.cameraCtrl.update(this.playerCar.group, this.ball.group, frameDt, this.input.cameraLook);

    // 6. Render Frame
    this.renderer.render(this.scene, this.cameraCtrl.camera);
  }

  onGoal(teamFlag) {
    this.phase = MATCH_PHASE.GOAL_SCORED;
    this.goalDelay = 3.5;

    if (teamFlag === 2) {
      this.blueScore++;
      this.hud.showGoal(TEAMS.BLUE);
    } else {
      this.orangeScore++;
      this.hud.showGoal(TEAMS.ORANGE);
    }

    this.audio.playGoalExplosion();
    this.hud.updateScore(this.blueScore, this.orangeScore);
  }

  syncVisuals(playerControls, dt) {
    const s = this.physics.state;
    if (!s || s.length < SIM_STATE.CARS) return;

    // 1. Sync Ball
    const bx = s[SIM_STATE.BALL + 0];
    const by = s[SIM_STATE.BALL + 1];
    const bz = s[SIM_STATE.BALL + 2];
    this.ball.update(bx, by, bz, dt);

    // 2. Sync Player Car (Car 0)
    const pOff = SIM_STATE.CARS;
    const px = s[pOff + CAR_STATE.POS + 0];
    const py = s[pOff + CAR_STATE.POS + 1];
    const pz = s[pOff + CAR_STATE.POS + 2];
    const pfwd = [s[pOff + CAR_STATE.FWD], s[pOff + CAR_STATE.FWD + 1], s[pOff + CAR_STATE.FWD + 2]];
    const pright = [s[pOff + CAR_STATE.RIGHT], s[pOff + CAR_STATE.RIGHT + 1], s[pOff + CAR_STATE.RIGHT + 2]];
    const pup = [s[pOff + CAR_STATE.UP], s[pOff + CAR_STATE.UP + 1], s[pOff + CAR_STATE.UP + 2]];
    const isPlayerBoosting = s[pOff + CAR_STATE.IS_BOOSTING] === 1;
    this.playerCar.update(px, py, pz, pfwd, pright, pup, isPlayerBoosting);

    // Update Player Boost HUD
    this.hud.updateBoost(s[pOff + CAR_STATE.BOOST]);

    // 3. Sync Bot Car (Car 1)
    if (s.length >= SIM_STATE.CARS + 2 * CAR_STATE_STRIDE) {
      const bOff = SIM_STATE.CARS + CAR_STATE_STRIDE;
      const ox = s[bOff + CAR_STATE.POS + 0];
      const oy = s[bOff + CAR_STATE.POS + 1];
      const oz = s[bOff + CAR_STATE.POS + 2];
      const ofwd = [s[bOff + CAR_STATE.FWD], s[bOff + CAR_STATE.FWD + 1], s[bOff + CAR_STATE.FWD + 2]];
      const oright = [s[bOff + CAR_STATE.RIGHT], s[bOff + CAR_STATE.RIGHT + 1], s[bOff + CAR_STATE.RIGHT + 2]];
      const oup = [s[bOff + CAR_STATE.UP], s[bOff + CAR_STATE.UP + 1], s[bOff + CAR_STATE.UP + 2]];
      const isBotBoosting = s[bOff + CAR_STATE.IS_BOOSTING] === 1;
      this.botCar.update(ox, oy, oz, ofwd, oright, oup, isBotBoosting);
    }

    // 4. Sync Boost Pads
    this.arena.updatePads(this.physics.getPads());
  }
}
