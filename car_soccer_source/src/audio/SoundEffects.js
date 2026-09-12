/**
 * SoundEffects.js
 * Procedural Web Audio synthesizer and audio sample player for Car Soccer.
 * Automatically generates high quality procedural sounds for engine, boost, hits, and jumps
 * even if external audio files have not been downloaded.
 */

export class SoundEffects {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.engineGain = null;
    this.engineOsc = null;
    this.boostGain = null;
    this.boostNoise = null;
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.4, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      // Procedural Engine Sound
      this.setupEngineSynth();

      // Procedural Boost Sound
      this.setupBoostSynth();

      this.initialized = true;
    } catch (e) {
      console.warn('[SoundEffects] Web Audio API failed to initialize:', e);
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setupEngineSynth() {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(55, this.ctx.currentTime);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(250, this.ctx.currentTime);

    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start();

    this.engineOsc = osc;
    this.engineGain = gain;
    this.engineFilter = filter;
  }

  setupBoostSynth() {
    // Generate white noise buffer
    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, this.ctx.currentTime);
    filter.Q.setValueAtTime(1.5, this.ctx.currentTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0, this.ctx.currentTime);

    whiteNoise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    whiteNoise.start();

    this.boostGain = gain;
  }

  updateEngine(speed, isBoosting) {
    if (!this.initialized || !this.engineOsc) return;

    const absSpeed = Math.abs(speed);
    const normalizedSpeed = Math.min(absSpeed / 2300, 1.0);
    
    // Pitch up oscillator with speed
    const freq = 45 + normalizedSpeed * 120 + (isBoosting ? 60 : 0);
    this.engineOsc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.05);

    // Filter frequency opens up with acceleration
    const cutoff = 220 + normalizedSpeed * 700 + (isBoosting ? 400 : 0);
    this.engineFilter.frequency.setTargetAtTime(cutoff, this.ctx.currentTime, 0.05);

    // Boost hiss volume
    const targetBoostGain = isBoosting ? 0.35 : 0.0;
    this.boostGain.gain.setTargetAtTime(targetBoostGain, this.ctx.currentTime, 0.04);
  }

  playJump() {
    if (!this.initialized) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    const now = this.ctx.currentTime;
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.15);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.16);
  }

  playBallHit(power = 800) {
    if (!this.initialized) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    const now = this.ctx.currentTime;
    const normPower = Math.min(power / 2000, 1.0);

    osc.frequency.setValueAtTime(180 + normPower * 100, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.18);

    gain.gain.setValueAtTime(0.2 + normPower * 0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.19);
  }

  playGoalExplosion() {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;
    
    // Sub bass drop
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 1.2);

    gain.gain.setValueAtTime(0.7, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 1.2);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 1.3);
  }
}
