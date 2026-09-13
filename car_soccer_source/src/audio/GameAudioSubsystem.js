/**
 * GameAudioSubsystem.js
 * Unified game audio subsystem for Car Soccer.
 * Deobfuscates and modularizes:
 * - Master Audio Context & Mixer (`qr`, `$r`, `u1`, `up`, `setEngineVolume`, `setBoostVolume`, `m1`)
 * - Vehicle Action Audio (`Sw`: jump, dodge, doubleJump, suspension landing impacts)
 * - Ball & World Impact Audio (`kw`: multi-layer acoustic synthesis for car-ball and field collisions)
 * - Supersonic Audio Controller (`Lw`: supersonic boom entry and high-speed loop)
 * - Boost Audio Controller (`V1`: golden boost nozzle start, loop, and release)
 * - Flip Reset Audio (`jw`: flip reset audio event trigger)
 * - Vehicle Engine Audio Adapter (`tm`: bridges EMotorSynth and 3D spatial bus)
 * - Game Audio Manager (`GameAudioManager`, `gameAudio`, `boostCollectAudio`: match sfx and announcements)
 */

import { validateAssetResponse } from '../game/AssetDiagnostics.js';
import { EMotorSynth } from './EMotorSynth.js';
import { SpatialAudioSource, updateAudioListener, calculateDistanceGain } from './SpatialAudioSource.js';

// --- Utility Math & Conversion ---
export function dbToLinear(dB) {
  return Math.pow(10, dB / 20);
}

export function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

// --- 1. Master Audio Settings & Global Audio Context ---
export const AUDIO_SETTINGS_KEY = 'car-soccer.audio-settings.v1';
export const AUDIO_SETTINGS_CHANGED_EVENT = 'car-soccer:audio-settings-changed';

export const DEFAULT_AUDIO_SETTINGS = {
  masterVolume: 0.6,
  engineVolume: 0.8,
  boostVolume: 0.8
};

function loadAudioSettings() {
  const fallback = { ...DEFAULT_AUDIO_SETTINGS };
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(AUDIO_SETTINGS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      if (Number.isFinite(parsed.masterVolume)) fallback.masterVolume = clamp01(parsed.masterVolume);
      if (Number.isFinite(parsed.engineVolume)) fallback.engineVolume = clamp01(parsed.engineVolume);
      if (Number.isFinite(parsed.boostVolume)) fallback.boostVolume = clamp01(parsed.boostVolume);
    }
  } catch (e) {}
  return fallback;
}

function saveAudioSettings(settings) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {}
}

/**
 * Master Audio Mixer managing master bus volume and connection to destination.
 * Deobfuscates original `u1`.
 */
export class AudioMixer {
  constructor(context) {
    this.context = context;
    this.input = context.createGain();
    this.output = context.createGain();
    this.output.gain.value = 0;
    this.volume = 1;
    this.active = false;
    this.connected = false;
    this.input.connect(this.output);
  }

  setVolume(vol) {
    this.volume = Number.isFinite(vol) ? clamp01(vol) : 1;
    this.apply();
  }

  setActive(active) {
    this.active = Boolean(active);
    this.apply();
  }

  apply() {
    const { context, output } = this;
    const now = context.currentTime;
    const target = this.active ? this.volume : 0;
    const current = output.gain.value;

    output.gain.cancelScheduledValues(now);
    if (target === 0) {
      output.gain.setValueAtTime(0, now);
      if (this.connected) {
        output.disconnect(context.destination);
        this.connected = false;
      }
      return;
    }

    if (context.state === 'running' && this.connected) {
      output.gain.setValueAtTime(current, now);
      output.gain.linearRampToValueAtTime(target, now + 0.02);
    } else {
      output.gain.setValueAtTime(target, now);
    }

    if (!this.connected) {
      output.connect(context.destination);
      this.connected = true;
    }
  }
}

// Global audio subsystem singleton state
const audioSubsystemState = {
  settings: loadAudioSettings(),
  context: null,
  mixer: null
};

if (typeof window !== 'undefined') {
  const syncActive = () => {
    if (audioSubsystemState.mixer) {
      const active = !document.hidden && (typeof document.hasFocus === 'function' ? document.hasFocus() : true);
      audioSubsystemState.mixer.setActive(active);
    }
  };

  window.addEventListener('focus', syncActive);
  window.addEventListener('blur', syncActive);
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', syncActive);
  }
  window.addEventListener('pagehide', () => audioSubsystemState.mixer?.setActive(false));
  window.addEventListener('pageshow', syncActive);
  window.addEventListener('storage', e => {
    if (e.key === AUDIO_SETTINGS_KEY || e.key === null) {
      audioSubsystemState.settings = loadAudioSettings();
      audioSubsystemState.mixer?.setVolume(audioSubsystemState.settings.masterVolume);
      window.dispatchEvent(new Event(AUDIO_SETTINGS_CHANGED_EVENT));
    }
  });
}

/**
 * Returns current audio settings
 * Replaces original `m1()`.
 */
export function getAudioSettings() {
  return audioSubsystemState.settings;
}

/**
 * Returns or initializes the global Web Audio context.
 * Replaces original `qr()`.
 */
export function getAudioContext() {
  if (!audioSubsystemState.context) {
    const AudioContextClass = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
    if (!AudioContextClass) return null;

    const ctx = new AudioContextClass();
    audioSubsystemState.context = ctx;
    const mixer = new AudioMixer(ctx);
    mixer.setVolume(audioSubsystemState.settings.masterVolume);
    const active = typeof document !== 'undefined' ? (!document.hidden && (typeof document.hasFocus === 'function' ? document.hasFocus() : true)) : true;
    mixer.setActive(active);
    audioSubsystemState.mixer = mixer;
  }
  return audioSubsystemState.context;
}

/**
 * Returns the master mixer input node.
 * Replaces original `$r()`.
 */
export function getMasterAudioInput() {
  getAudioContext();
  return audioSubsystemState.mixer?.input ?? null;
}

/**
 * Sets master audio volume [0, 1]
 * Replaces original `up(i)`.
 */
export function setMasterVolume(vol) {
  if (!Number.isFinite(vol)) return;
  const clamped = clamp01(vol);
  audioSubsystemState.settings.masterVolume = clamped;
  audioSubsystemState.mixer?.setVolume(clamped);
  saveAudioSettings(audioSubsystemState.settings);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUDIO_SETTINGS_CHANGED_EVENT));
  }
}

/**
 * Sets engine volume [0, 1]
 */
export function setEngineVolume(vol) {
  if (!Number.isFinite(vol)) return;
  const clamped = clamp01(vol);
  audioSubsystemState.settings.engineVolume = clamped;
  saveAudioSettings(audioSubsystemState.settings);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUDIO_SETTINGS_CHANGED_EVENT));
  }
}

/**
 * Sets boost and sfx volume [0, 1]
 */
export function setBoostVolume(vol) {
  if (!Number.isFinite(vol)) return;
  const clamped = clamp01(vol);
  audioSubsystemState.settings.boostVolume = clamped;
  saveAudioSettings(audioSubsystemState.settings);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUDIO_SETTINGS_CHANGED_EVENT));
  }
}


// --- 2. Vehicle Action Audio (Jump, Dodge, Wheel Landing) ---
export const VEHICLE_ACTION_AUDIO_BASE_PATH = '/assets/audio/vehicle';
export const VEHICLE_ACTION_SOUNDS = {
  jump: ['jump-01', 'jump-02', 'jump-03', 'jump-04'],
  dodge: ['dodge-01', 'dodge-02', 'dodge-03', 'dodge-04'],
  doubleJump: ['double-jump-01', 'double-jump-02', 'double-jump-03', 'double-jump-04'],
  wheelImpact: ['wheel-impact-01', 'wheel-impact-02', 'wheel-impact-03', 'wheel-impact-04']
};

export const VEHICLE_ACTION_VOLUMES = {
  jump: 0.3,
  dodge: 0.3,
  doubleJump: 0.3
};

/**
 * Manages procedural triggers for jumping, dodging, and suspension landing impacts.
 * Deobfuscates class `Sw`.
 */
export class VehicleActionAudio {
  constructor() {
    this.context = null;
    this.buffers = new Map();
    this.loading = new Map();
    this.lastIndex = new Map();
    this.previous = null;
  }

  getContext() {
    return this.context || (this.context = getAudioContext()), this.context;
  }

  async preload() {
    if (typeof window === 'undefined') return;
    await Promise.all(Object.keys(VEHICLE_ACTION_SOUNDS).map(async key => {
      const loaded = await this.load(key);
      if (loaded.length !== VEHICLE_ACTION_SOUNDS[key].length) {
        throw new Error(`Car ${key} audio is unavailable`);
      }
    }));
  }

  load(key) {
    const cached = this.buffers.get(key);
    if (cached) return Promise.resolve(cached);

    const pending = this.loading.get(key);
    if (pending) return pending;

    if (typeof window === 'undefined') return Promise.resolve([]);

    const ctx = this.getContext();
    const files = VEHICLE_ACTION_SOUNDS[key] || [];
    const promise = Promise.all(files.map(async file => {
      const url = `${VEHICLE_ACTION_AUDIO_BASE_PATH}/${file}.wav`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
      return ctx.decodeAudioData(await res.arrayBuffer());
    })).then(buffers => {
      this.buffers.set(key, buffers);
      return buffers;
    }).catch(err => {
      console.warn(`Car ${key} audio could not be loaded:`, err);
      const empty = [];
      this.buffers.set(key, empty);
      return empty;
    }).finally(() => {
      this.loading.delete(key);
    });

    this.loading.set(key, promise);
    return promise;
  }

  async play(key, volume) {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      await ctx.resume();
    } catch (e) {}
    const buffers = await this.load(key);
    if (buffers.length === 0 || ctx.state !== 'running') return;

    const lastIdx = this.lastIndex.get(key) ?? -1;
    let idx = Math.floor(Math.random() * buffers.length);
    if (buffers.length > 1 && idx === lastIdx) {
      idx = (idx + 1 + Math.floor(Math.random() * (buffers.length - 1))) % buffers.length;
    }
    this.lastIndex.set(key, idx);

    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buffers[idx];
    gain.gain.value = volume;
    src.connect(gain).connect(getMasterAudioInput());
    src.addEventListener('ended', () => {
      src.disconnect();
      gain.disconnect();
    }, { once: true });
    src.start();
  }

  /**
   * Evaluates car physics state diffs and plays corresponding action sounds
   * @param {Object} state
   * @param {number} state.jumpSerial
   * @param {number} state.dodgeSerial
   * @param {number} state.doubleJumpSerial
   * @param {number} state.wheelImpactSerial
   * @param {number} state.wheelImpactSpeed
   * @param {boolean} state.audible
   */
  update(state) {
    const current = {
      jumpSerial: state.jumpSerial,
      dodgeSerial: state.dodgeSerial,
      doubleJumpSerial: state.doubleJumpSerial,
      wheelImpactSerial: state.wheelImpactSerial
    };

    if (!this.previous) {
      this.previous = current;
      return;
    }

    if (state.audible) {
      if (current.jumpSerial !== this.previous.jumpSerial) {
        this.play('jump', VEHICLE_ACTION_VOLUMES.jump);
      }
      if (current.dodgeSerial !== this.previous.dodgeSerial) {
        this.play('dodge', VEHICLE_ACTION_VOLUMES.dodge);
      }
      if (current.doubleJumpSerial !== this.previous.doubleJumpSerial) {
        this.play('doubleJump', VEHICLE_ACTION_VOLUMES.doubleJump);
      }
      if (current.wheelImpactSerial !== this.previous.wheelImpactSerial && state.wheelImpactSpeed >= 50) {
        const normSpeed = clamp01(state.wheelImpactSpeed / 2000);
        const gainMult = dbToLinear(-4.582 * (1 - normSpeed));
        this.play('wheelImpact', 0.15 * gainMult);
      }
    }

    this.previous = current;
  }
}


// --- 3. Ball & World Impact Audio ---
export const IMPACT_AUDIO_BASE_PATH = '/assets/audio/impacts';
export const IMPACT_SOUND_LAYERS = {
  carCore: ['vehicle-body-01', 'vehicle-body-02', 'vehicle-body-03', 'vehicle-body-04', 'vehicle-body-05', 'vehicle-body-06'],
  carDetail: ['vehicle-detail-01', 'vehicle-detail-02', 'vehicle-detail-03', 'vehicle-detail-04', 'vehicle-detail-05', 'vehicle-detail-06'],
  carHard: ['vehicle-hard-01', 'vehicle-hard-02', 'vehicle-hard-03', 'vehicle-hard-04', 'vehicle-hard-05', 'vehicle-hard-06'],
  carSweetener: ['vehicle-accent-01'],
  surfaceDetail: ['surface-detail-01', 'surface-detail-02', 'surface-detail-03', 'surface-detail-04', 'surface-detail-05', 'surface-detail-06'],
  surfaceBody: ['surface-body-01', 'surface-body-02', 'surface-body-03', 'surface-body-04', 'surface-body-05', 'surface-body-06'],
  grass: ['grass-01', 'grass-02', 'grass-03', 'grass-04', 'grass-05'],
  arena: ['arena-01', 'arena-02', 'arena-03', 'arena-04', 'arena-05', 'arena-06']
};

export const IMPACT_CONFIG = {
  CAR_BASE_VOL: 0.3,
  WORLD_BASE_VOL: 0.2
};

/**
 * Multi-layer acoustic impact synthesizer for ball collisions with cars and stadium boundaries.
 * Deobfuscates class `kw`.
 */
export class BallImpactAudio {
  constructor() {
    this.context = null;
    this.buffers = new Map();
    this.loading = new Map();
    this.lastIndex = new Map();
    this.previousCarSerial = null;
    this.previousWorldSerial = null;
  }

  getContext() {
    return this.context || (this.context = getAudioContext()), this.context;
  }

  async preload() {
    if (typeof window === 'undefined') return;
    await Promise.all(Object.keys(IMPACT_SOUND_LAYERS).map(async key => {
      const b = await this.load(key);
      if (b.length !== IMPACT_SOUND_LAYERS[key].length) {
        console.warn(`[Impact Audio Warning] Ball-hit "${key}" audio loaded ${b.length}/${IMPACT_SOUND_LAYERS[key].length} tracks.`);
      }
    }));
  }

  load(key) {
    const cached = this.buffers.get(key);
    if (cached) return Promise.resolve(cached);

    const pending = this.loading.get(key);
    if (pending) return pending;

    if (typeof window === 'undefined') return Promise.resolve([]);

    const ctx = this.getContext();
    const files = IMPACT_SOUND_LAYERS[key] || [];
    const promise = Promise.all(files.map(async file => {
      const url = `${IMPACT_AUDIO_BASE_PATH}/${file}.wav`;
      const res = await fetch(url);
      const check = validateAssetResponse(res, url, 'audio');
      if (!check.ok) throw check.error;
      try {
        return await ctx.decodeAudioData(await res.arrayBuffer());
      } catch (err) {
        throw new Error(`[Impact Audio Error] Failed to decode "${url}": ${err.message}`);
      }
    })).then(buffers => {
      this.buffers.set(key, buffers);
      return buffers;
    }).catch(err => {
      console.warn(`[Impact Audio Warning] Ball-hit "${key}" audio could not be loaded:`, err.message || err);
      const empty = [];
      this.buffers.set(key, empty);
      return empty;
    }).finally(() => {
      this.loading.delete(key);
    });

    this.loading.set(key, promise);
    return promise;
  }

  async playLayer(layerKey, volume, pan = 0) {
    if (volume < 1e-4) return;
    const ctx = this.getContext();
    if (!ctx) return;
    const buffers = await this.load(layerKey);
    if (buffers.length === 0 || ctx.state !== 'running') return;

    const last = this.lastIndex.get(layerKey) ?? -1;
    let idx = Math.floor(Math.random() * buffers.length);
    if (buffers.length > 1 && idx === last) {
      idx = (idx + 1 + Math.floor(Math.random() * (buffers.length - 1))) % buffers.length;
    }
    this.lastIndex.set(layerKey, idx);

    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    const panner = ctx.createStereoPanner();

    src.buffer = buffers[idx];
    gain.gain.value = volume;
    panner.pan.value = Math.min(1, Math.max(-1, pan));

    src.connect(gain).connect(panner).connect(getMasterAudioInput());
    src.addEventListener('ended', () => {
      src.disconnect();
      gain.disconnect();
      panner.disconnect();
    }, { once: true });
    src.start();
  }

  async playCar(speed, pan = 0) {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      await ctx.resume();
    } catch (e) {}
    if (ctx.state !== 'running') return;

    const normSpeed = clamp01(speed / 2000);
    const baseGain = IMPACT_CONFIG.CAR_BASE_VOL * dbToLinear(-8 * (1 - normSpeed));
    const detailGain = -96.3 + 95.3 * normSpeed;
    const hardGain = -96.3 + 96.3 * normSpeed;

    await Promise.all([
      this.playLayer('carCore', baseGain * dbToLinear(-6), pan),
      this.playLayer('carDetail', baseGain * dbToLinear(-1 + detailGain), pan),
      this.playLayer('carHard', baseGain * dbToLinear(hardGain), pan),
      this.playLayer('carSweetener', baseGain * dbToLinear(-2), pan)
    ]);
  }

  async playWorld(speed, surface, pan = 0) {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      await ctx.resume();
    } catch (e) {}
    if (ctx.state !== 'running') return;

    const s = clamp01(speed / 2000);
    const a = clamp01((speed - 35) / 965);
    const baseGain = IMPACT_CONFIG.WORLD_BASE_VOL * (0.18 + 0.82 * Math.sqrt(a));
    const mod = -1 + 1.182 * s;
    const surfaceLayer = surface === 0 ? 'grass' : 'arena';
    const surfaceDb = surface === 0 ? -18.1 : -17.0;

    await Promise.all([
      this.playLayer(surfaceLayer, baseGain * dbToLinear(surfaceDb + mod), pan),
      this.playLayer('surfaceDetail', baseGain * dbToLinear(-9), pan),
      this.playLayer('surfaceBody', baseGain, pan)
    ]);
  }

  update(state) {
    if (this.previousCarSerial === null || this.previousWorldSerial === null) {
      this.previousCarSerial = state.carSerial;
      this.previousWorldSerial = state.worldSerial;
      return;
    }

    if (state.audible) {
      if (state.carSerial !== this.previousCarSerial) {
        this.playCar(state.carSpeed, state.carPan ?? 0);
      }
      if (state.worldSerial !== this.previousWorldSerial) {
        this.playWorld(state.worldSpeed, state.worldSurface, state.worldPan ?? 0);
      }
    }

    this.previousCarSerial = state.carSerial;
    this.previousWorldSerial = state.worldSerial;
  }
}


// --- 4. Supersonic Audio Controller ---
export const SUPERSONIC_AUDIO_BASE_PATH = '/assets/audio/vehicle';
export const SUPERSONIC_CONFIG = {
  LOOP_START: 5802 / 24000,
  LOOP_END: 106283 / 24000,
  LOOP_GAIN: Math.pow(10, 6 / 20) * 0.045,
  ENTRY_GAIN: Math.pow(10, -15 / 20),
  ENTRY_TRACKS: ['supersonic-enter-a', 'supersonic-enter-b', 'supersonic-enter-c']
};

/**
 * Handles supersonic sound effects: entry sonic booms and sustained aerodynamic loops.
 * Deobfuscates class `Lw`.
 */
export class SupersonicAudio {
  constructor() {
    this.context = null;
    this.buffer = null;
    this.entries = [];
    this.loading = null;
    this.unavailable = false;
    this.loadError = null;

    this.source = null;
    this.gain = null;
    this.entrySource = null;
    this.entryGain = null;
    this.lastEntry = -1;

    this.previousSupersonic = false;
    this.entryDeadline = 0;
    this.wanted = false;
    this.applied = false;
    this.unlocked = false;
    this.resumePending = false;
    this.stopAt = 0;

    if (typeof window !== 'undefined') {
      const unlock = () => {
        this.unlocked = true;
        if (this.context?.state === 'suspended') {
          this.context.resume().catch(() => {});
        }
        this.prepare();
      };

      window.addEventListener('pointerdown', unlock, { passive: true });
      window.addEventListener('keydown', unlock);
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
          if (document.hidden) this.silence();
        });
      }
      window.addEventListener('blur', () => this.silence());
    }
  }

  preload() {
    if (this.unavailable) return Promise.reject(this.loadError);
    if (this.buffer) return Promise.resolve();
    if (this.loading) return this.loading;

    if (typeof window === 'undefined') return Promise.resolve();

    const ctx = this.context ?? (this.context = getAudioContext());
    const fetchClip = async name => {
      const url = `${SUPERSONIC_AUDIO_BASE_PATH}/${name}.wav`;
      const res = await fetch(url);
      const check = validateAssetResponse(res, url, 'audio');
      if (!check.ok) throw check.error;
      try {
        return await ctx.decodeAudioData(await res.arrayBuffer());
      } catch (decErr) {
        throw new Error(`[Supersonic Audio Error] Failed to decode "${url}": ${decErr.message}`);
      }
    };

    this.loading = Promise.all(['supersonic-loop', ...SUPERSONIC_CONFIG.ENTRY_TRACKS].map(fetchClip))
      .then(([loop, ...entries]) => {
        this.buffer = loop;
        this.entries = entries;
      })
      .catch(err => {
        this.unavailable = true;
        this.loadError = err;
        console.warn(`[CarSoccerEngine Audio Warning] Supersonic sound unavailable: ${err.message || err}`);
        return null;
      })
      .finally(() => {
        this.loading = null;
      });

    return this.loading;
  }

  async prepare() {
    if (this.unavailable) return;
    const ctx = this.context ?? (this.context = getAudioContext());
    if (ctx.state === 'suspended' && !this.resumePending) {
      this.resumePending = true;
      ctx.resume().catch(() => {}).finally(() => {
        this.resumePending = false;
      });
    }

    try {
      await this.preload();
    } catch (e) {
      return;
    }

    if (!this.unlocked || !this.wanted || this.source || ctx.state !== 'running') return;

    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = this.buffer;
    src.loop = true;
    src.loopStart = SUPERSONIC_CONFIG.LOOP_START;
    src.loopEnd = SUPERSONIC_CONFIG.LOOP_END;

    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(SUPERSONIC_CONFIG.LOOP_GAIN, ctx.currentTime + 0.2);

    src.connect(gain).connect(getMasterAudioInput());
    src.start();

    this.source = src;
    this.gain = gain;
    this.applied = true;
    this.stopAt = 0;
    this.playPendingEntry();
  }

  playPendingEntry() {
    const ctx = this.context;
    if (!this.unlocked || !this.entryDeadline || !ctx || ctx.state !== 'running' || this.entries.length === 0) return;

    const validTime = performance.now() <= this.entryDeadline;
    this.entryDeadline = 0;
    if (!validTime || !this.wanted) return;

    this.stopEntry();

    const idx = this.lastEntry < 0
      ? Math.floor(Math.random() * this.entries.length)
      : (this.lastEntry + 1 + Math.floor(Math.random() * (this.entries.length - 1))) % this.entries.length;
    this.lastEntry = idx;

    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = this.entries[idx];
    gain.gain.value = SUPERSONIC_CONFIG.ENTRY_GAIN;
    src.connect(gain).connect(getMasterAudioInput());
    src.onended = () => {
      src.disconnect();
      gain.disconnect();
      if (this.entrySource === src) {
        this.entrySource = null;
        this.entryGain = null;
      }
    };
    src.start();
    this.entrySource = src;
    this.entryGain = gain;
  }

  update(isSupersonic, userActive = false, audible = true) {
    if (userActive) this.unlocked = true;

    const activeInTab = audible && (typeof document === 'undefined' || (!document.hidden && (typeof document.hasFocus === 'function' ? document.hasFocus() : true)));
    this.wanted = Boolean(isSupersonic && activeInTab);

    if (isSupersonic && !this.previousSupersonic && activeInTab) {
      this.entryDeadline = performance.now() + 500;
    }
    this.previousSupersonic = Boolean(isSupersonic);

    if (!activeInTab || !isSupersonic) {
      this.entryDeadline = 0;
    }
    if (!activeInTab) {
      this.stopEntry();
    }

    if (this.unlocked && (!this.buffer || (this.wanted && !this.source))) {
      this.prepare();
    }
    this.playPendingEntry();

    const ctx = this.context;
    if (ctx && this.gain) {
      if (this.wanted !== this.applied) {
        const now = ctx.currentTime;
        const currentGain = this.gain.gain.value;
        this.gain.gain.cancelScheduledValues(now);
        this.gain.gain.setValueAtTime(currentGain, now);
        this.gain.gain.linearRampToValueAtTime(this.wanted ? SUPERSONIC_CONFIG.LOOP_GAIN : 0, now + 0.2);
        this.applied = this.wanted;
        this.stopAt = this.wanted ? 0 : now + 0.21;
      }
      if (this.stopAt && ctx.currentTime >= this.stopAt) {
        this.stopLoop();
      }
    }
  }

  stopLoop() {
    this.source?.stop();
    this.source?.disconnect();
    this.gain?.disconnect();
    this.source = null;
    this.gain = null;
    this.applied = false;
    this.stopAt = 0;
  }

  stopEntry() {
    this.entrySource?.stop();
    this.entrySource?.disconnect();
    this.entryGain?.disconnect();
    this.entrySource = null;
    this.entryGain = null;
  }

  silence() {
    this.wanted = false;
    this.entryDeadline = 0;
    this.stopLoop();
    this.stopEntry();
  }
}


// --- 5. Golden Boost Audio (Car Nozzle Emitter) ---
export const BOOST_AUDIO_BASE_PATH = '/assets/audio/boost';
const boostBufferCache = new WeakMap();

/**
 * 3D-spatialized rocket boost flame audio player.
 * Deobfuscates class `V1`.
 */
export class BoostAudio {
  constructor(spatial = false) {
    this.context = null;
    this.buffers = null;
    this.loading = null;
    this.generation = 0;
    this.boosting = false;
    this.startSource = null;
    this.loopSource = null;
    this.spatial = spatial;
    this.spatialBus = null;
    this.position = { x: 0, y: 0, z: 0, copy(p) { if (p) { this.x = p.x; this.y = p.y; this.z = p.z; } return this; } };
    this.enabled = true;
    this.voices = new Set();
  }

  getContext() {
    if (!this.context) {
      this.context = getAudioContext();
      if (this.spatial && !this.spatialBus && this.context) {
        this.spatialBus = new SpatialAudioSource(this.context, getMasterAudioInput());
        this.spatialBus.setPosition(this.position);
        this.spatialBus.setEnabled(this.enabled);
      }
    }
    return this.context;
  }

  setSpatial(spatial) {
    if (this.spatial === spatial) return;
    this.spatial = spatial;
    if (!spatial && this.spatialBus) {
      this.spatialBus.dispose();
      this.spatialBus = null;
    } else if (spatial && !this.spatialBus && this.context) {
      this.spatialBus = new SpatialAudioSource(this.context, getMasterAudioInput());
      this.spatialBus.setPosition(this.position);
      this.spatialBus.setEnabled(this.enabled);
    }
  }

  updateSpatial(pos, enabled) {
    if (this.spatial) {
      this.position.copy(pos);
      this.enabled = enabled;
      this.spatialBus?.setPosition(pos);
      this.spatialBus?.setEnabled(enabled);
    }
  }

  async preload() {
    const bufs = await this.load();
    if (bufs.length !== 3) throw new Error('Golden Boost audio is unavailable');
  }

  load() {
    if (this.buffers) return Promise.resolve(this.buffers);
    if (this.loading) return this.loading;

    if (typeof window === 'undefined') return Promise.resolve([]);

    const ctx = this.getContext();
    const files = [`${BOOST_AUDIO_BASE_PATH}/start.wav`, `${BOOST_AUDIO_BASE_PATH}/loop.wav`, `${BOOST_AUDIO_BASE_PATH}/release.wav`];

    let cached = boostBufferCache.get(ctx);
    if (!cached) {
      cached = Promise.all(files.map(async url => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
        return ctx.decodeAudioData(await res.arrayBuffer());
      }));
      boostBufferCache.set(ctx, cached);
    }

    this.loading = cached.then(bufs => {
      this.buffers = bufs;
      return bufs;
    }).catch(err => {
      console.warn('Golden Boost audio could not be loaded', err);
      return [];
    });

    return this.loading;
  }

  play(buffer, volume, startTime, loop = false) {
    const ctx = this.getContext();
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buffer;
    src.loop = loop;
    gain.gain.setValueAtTime(volume * 0.5, startTime);

    const dest = this.spatialBus?.input ?? getMasterAudioInput();
    src.connect(gain).connect(dest);

    const voice = { source: src, gain };
    this.voices.add(voice);
    src.addEventListener('ended', () => {
      src.disconnect();
      gain.disconnect();
      this.voices.delete(voice);
    }, { once: true });
    src.start(startTime);
    return voice;
  }

  setBoosting(isBoosting) {
    if (isBoosting === this.boosting) return;
    this.boosting = isBoosting;
    const gen = ++this.generation;
    if (isBoosting) {
      this.start(gen);
    } else {
      this.stop(gen);
    }
  }

  async start(gen) {
    const ctx = this.getContext();
    try {
      await ctx.resume();
    } catch (e) {}
    const bufs = await this.load();
    if (!this.boosting || !this.enabled || gen !== this.generation || bufs.length !== 3) return;

    const now = ctx.currentTime;
    this.stopCurrentVoices(now);
    this.startSource = this.play(bufs[0], dbToLinear(-3), now);
    this.loopSource = this.play(bufs[1], dbToLinear(-2), now + 0.3, true);
  }

  async stop(gen) {
    const ctx = this.context;
    if (!ctx) return;
    const now = ctx.currentTime;
    this.stopCurrentVoices(now);

    const bufs = await this.load();
    if (this.boosting || !this.enabled || gen !== this.generation || bufs.length !== 3) return;

    try {
      await ctx.resume();
    } catch (e) {}
    if (!this.boosting && this.enabled && gen === this.generation) {
      this.play(bufs[2], dbToLinear(-8), ctx.currentTime);
    }
  }

  stopCurrentVoices(time) {
    this.fadeAndStop(this.loopSource, time, 0.1);
    this.fadeAndStop(this.startSource, time, 0.3);
    this.loopSource = null;
    this.startSource = null;
  }

  fadeAndStop(voice, time, duration) {
    if (voice) {
      voice.gain.gain.cancelScheduledValues(time);
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, time);
      voice.gain.gain.linearRampToValueAtTime(0, time + duration);
      try {
        voice.source.stop(time + duration);
      } catch (e) {}
    }
  }

  dispose() {
    this.boosting = false;
    this.enabled = false;
    this.generation++;
    for (const v of this.voices) {
      try {
        v.source.stop();
      } catch (e) {}
      v.source.disconnect();
      v.gain.disconnect();
    }
    this.voices.clear();
    this.startSource = this.loopSource = null;
    this.spatialBus?.dispose();
    this.spatialBus = null;
  }
}


// --- 6. Flip Reset Event Audio ---
export const FLIP_RESET_AUDIO_PATH = '/assets/audio/events/reset.wav';

/**
 * Flip reset trigger sound effect.
 * Deobfuscates class `jw`.
 */
export class FlipResetAudio {
  constructor() {
    this.context = null;
    this.buffer = null;
    this.loading = null;
    this.playSerial = 0;
    this.load();
  }

  getContext() {
    return this.context || (this.context = getAudioContext()), this.context;
  }

  async preload() {
    if (!await this.load()) throw new Error('Flip reset audio is unavailable');
  }

  load() {
    if (this.buffer) return Promise.resolve(this.buffer);
    if (this.loading) return this.loading;

    if (typeof window === 'undefined') return Promise.resolve(null);

    const ctx = this.getContext();
    this.loading = fetch(FLIP_RESET_AUDIO_PATH).then(res => {
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${FLIP_RESET_AUDIO_PATH}`);
      return res.arrayBuffer();
    }).then(buf => ctx.decodeAudioData(buf)).then(audioBuf => {
      this.buffer = audioBuf;
      return audioBuf;
    }).catch(err => {
      console.warn('Flip reset audio could not be loaded from local asset directory', err);
      return null;
    });

    return this.loading;
  }

  play() {
    this.playAsync();
  }

  async playAsync() {
    const serial = ++this.playSerial;
    const start = performance.now();
    const ctx = this.getContext();

    if (!this.buffer || ctx.state !== 'running') {
      try {
        await Promise.all([this.load(), ctx.state === 'suspended' ? ctx.resume() : Promise.resolve()]);
      } catch (e) {
        return;
      }
      if (serial !== this.playSerial || performance.now() - start > 100) return;
    }

    if (!this.buffer || ctx.state !== 'running') return;

    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = this.buffer;
    gain.gain.value = 0.78;
    src.connect(gain).connect(getMasterAudioInput());
    src.addEventListener('ended', () => {
      src.disconnect();
      gain.disconnect();
    }, { once: true });
    src.start();
  }
}


// --- 7. Vehicle Engine Audio Adapter ---
/**
 * Bridges vehicle powertrain physics with EMotorSynth and 3D HRTF spatial panner.
 * Deobfuscates class `tm`.
 */
export class VehicleEngineAudio {
  constructor(spatial = false) {
    this.synth = null;
    this.spatial = Boolean(spatial);
    this.position = { x: 0, y: 0, z: 0, copy(p) { if (p) { this.x = p.x; this.y = p.y; this.z = p.z; } return this; } };
    this.alive = true;
    this.audible = true;
    this.disposed = false;
    this.unlocked = false;
    this.spatialBus = null;

    this.unlock = () => {
      if (!this.disposed) {
        this.unlocked = true;
        try {
          this.prepare();
        } catch (e) {}
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('pointerdown', this.unlock, { passive: true });
      window.addEventListener('keydown', this.unlock);
    }
  }

  setSpatial(spatial) {
    if (this.spatial === spatial) return;
    this.spatial = spatial;
    if (this.synth?.outputNode) {
      try {
        this.synth.outputNode.disconnect();
        if (this.spatial) {
          const ctx = getAudioContext();
          if (!this.spatialBus) {
            this.spatialBus = new SpatialAudioSource(ctx, getMasterAudioInput());
            this.spatialBus.setPosition(this.position);
          }
          this.synth.outputNode.connect(this.spatialBus.input);
        } else {
          this.synth.outputNode.connect(getMasterAudioInput());
        }
      } catch (err) {}
    }
  }

  prepare() {
    if (this.disposed) return Promise.resolve();
    try {
      const ctx = getAudioContext();
      if (ctx?.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    } catch (e) {}
    return this.preload();
  }

  apply() {}

  preload() {
    if (this.disposed) return Promise.resolve();
    try {
      const ctx = getAudioContext();
      if (!this.synth && ctx) {
        if (this.spatial) {
          this.spatialBus = new SpatialAudioSource(ctx, getMasterAudioInput());
          this.spatialBus.setPosition(this.position);
          this.synth = new EMotorSynth(ctx, this.spatialBus.input);
        } else {
          this.synth = new EMotorSynth(ctx, getMasterAudioInput());
        }
      }
    } catch (err) {}
    return Promise.resolve();
  }

  update(params, _delta) {
    if (this.disposed) return;
    if (!this.synth) {
      this.preload();
    }

    if (params.position) {
      this.position.copy(params.position);
      this.spatialBus?.setPosition(this.position);
    }

    this.alive = params.alive !== false;
    const tabFocused = typeof document === 'undefined' || (!document.hidden && (typeof document.hasFocus === 'function' ? document.hasFocus() : true));
    this.audible = params.audible !== false && tabFocused;

    const settings = getAudioSettings();
    const vol = (settings.engineVolume ?? 0.8) * (settings.masterVolume ?? 1.0);

    if (this.synth) {
      this.synth.setVolume(vol);
      this.synth.update({
        forwardSpeed: params.forwardSpeed,
        alive: this.alive,
        audible: this.audible
      });
    }

    this.spatialBus?.setEnabled(this.alive && this.audible);
  }

  silence() {
    this.synth?.silence();
    this.spatialBus?.setEnabled(false);
  }

  reset() {
    this.synth?.reset();
    this.spatialBus?.setEnabled(false);
  }

  dispose() {
    if (!this.disposed) {
      this.disposed = true;
      if (typeof window !== 'undefined') {
        window.removeEventListener('pointerdown', this.unlock);
        window.removeEventListener('keydown', this.unlock);
      }
      this.synth?.dispose();
      this.synth = null;
      this.spatialBus?.dispose();
      this.spatialBus = null;
    }
  }
}


// --- 8. Custom Game Audio Manager & Match Announcements ---
export class GameAudioManager {
  constructor() {
    this.buffers = new Map();
    this.soundDefs = {
      boost_collect: '/custom/assets/audio/boost_collect.wav',
      match_30_seconds_left: '/custom/assets/audio/match_30_seconds_left.wav',
      match_countdown_321: '/custom/assets/audio/match_countdown_321.wav',
      match_entering_overtime: '/custom/assets/audio/match_entering_overtime.wav',
      match_start_go: '/custom/assets/audio/match_start_go.wav',
      sfx_ball_hit: '/custom/assets/audio/sfx_ball_hit.wav',
      sfx_car_collision: '/custom/assets/audio/sfx_car_collision.wav',
      sfx_error_no_boost: '/custom/assets/audio/sfx_error_no_boost.wav',
      sfx_goal_poof: '/custom/assets/audio/sfx_goal_poof.wav',
      sfx_state_supersonic: '/custom/assets/audio/sfx_state_supersonic.wav'
    };
    this.lastPlayTime = new Map();
  }

  async loadAll() {
    if (typeof window === 'undefined') return;
    for (const [key, url] of Object.entries(this.soundDefs)) {
      this.loadSound(key, url);
    }
  }

  async loadSound(key, url) {
    if (typeof window === 'undefined') return;
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const ctx = getAudioContext();
      const data = await res.arrayBuffer();
      const buf = await ctx.decodeAudioData(data);
      this.buffers.set(key, buf);
    } catch (e) {
      console.warn(`[GameAudio] Failed to load ${key}:`, (e && e.message) || e);
    }
  }

  play(key, volMult = 1.0, minInterval = 0) {
    const now = performance.now();
    if (minInterval > 0) {
      const last = this.lastPlayTime.get(key) || 0;
      if (now - last < minInterval) return;
    }
    this.lastPlayTime.set(key, now);

    const buf = this.buffers.get(key);
    if (!buf) {
      if (this.soundDefs[key] && !this.buffers.has(key)) {
        this.loadSound(key, this.soundDefs[key]);
      }
      return;
    }

    try {
      const ctx = getAudioContext();
      if (!ctx || ctx.state === 'suspended') return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      const settings = getAudioSettings();
      const master = settings.masterVolume ?? 1.0;
      const fxVol = settings.boostVolume ?? 0.8;
      const finalVol = Math.max(0, Math.min(1, volMult * master * fxVol));
      gain.gain.setValueAtTime(finalVol, ctx.currentTime);
      src.connect(gain);
      gain.connect(getMasterAudioInput());
      src.start();
    } catch (e) {}
  }

  playSpatial(key, pos, baseVol = 1.0, camera = null, minInterval = 0) {
    const now = performance.now();
    if (minInterval > 0) {
      const last = this.lastPlayTime.get(key) || 0;
      if (now - last < minInterval) return;
    }
    this.lastPlayTime.set(key, now);

    const buf = this.buffers.get(key);
    if (!buf) {
      if (this.soundDefs[key] && !this.buffers.has(key)) {
        this.loadSound(key, this.soundDefs[key]);
      }
      return;
    }

    try {
      const ctx = getAudioContext();
      if (!ctx || ctx.state === 'suspended') return;
      let vol = baseVol;
      let pan = 0;

      if (pos && camera?.position) {
        const camPos = camera.position;
        const dx = pos.x - camPos.x;
        const dy = pos.y - camPos.y;
        const dz = pos.z - camPos.z;
        const dist = Math.hypot(dx, dy, dz);
        const refDist = 900;
        const falloff = refDist / (refDist + Math.max(0, dist - 250));
        vol = Math.max(0.08, Math.min(1.0, baseVol * falloff));

        if (camera.matrixWorld) {
          const m = camera.matrixWorld.elements;
          const rx = m[0], ry = m[1], rz = m[2];
          const rLen = Math.hypot(rx, ry, rz) || 1;
          const dLen = dist || 1;
          pan = Math.max(-1, Math.min(1, (dx * rx + dy * ry + dz * rz) / (rLen * dLen)));
        }
      }

      const src = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      const settings = getAudioSettings();
      const master = settings.masterVolume ?? 1.0;
      const fxVol = settings.boostVolume ?? 0.8;
      const finalVol = Math.max(0, Math.min(1, vol * master * fxVol));
      gain.gain.setValueAtTime(finalVol, ctx.currentTime);
      src.connect(gain);

      if (typeof ctx.createStereoPanner === 'function') {
        const panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(pan, ctx.currentTime);
        gain.connect(panner);
        panner.connect(getMasterAudioInput());
      } else {
        gain.connect(getMasterAudioInput());
      }
      src.start();
    } catch (e) {}
  }
}

export const gameAudio = new GameAudioManager();
gameAudio.loadAll();

export const boostCollectAudio = {
  play: () => gameAudio.play('boost_collect', 1.0, 100),
  load: () => gameAudio.loadAll()
};


// --- Backward-Compatibility Aliases ---
export {
  audioSubsystemState as En,
  DEFAULT_AUDIO_SETTINGS as lg,
  AUDIO_SETTINGS_CHANGED_EVENT as Xd,
  VehicleActionAudio as Sw,
  BallImpactAudio as kw,
  SupersonicAudio as Lw,
  BoostAudio as V1,
  FlipResetAudio as jw,
  VehicleEngineAudio as tm,
  AudioMixer as u1,
  getAudioContext as qr,
  getMasterAudioInput as $r,
  getAudioSettings as m1,
  setMasterVolume as up,
  SpatialAudioSource as cg,
  updateAudioListener as _1,
  calculateDistanceGain as j1
};
