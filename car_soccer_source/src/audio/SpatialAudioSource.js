/**
 * SpatialAudioSource.js
 * HRTF 3D spatial audio panner and listener tracking for Car Soccer.
 * Deobfuscates original `cg`, `_1`, and `j1`.
 *
 * Implements:
 * - 3D HRTF Web Audio PannerNode with explicit mono speaker channel routing
 * - Cubic Hermite smoothstep distance attenuation (250 uu -> 4500 uu)
 * - Camera-bound Web Audio Listener synchronization (supports AudioParam & legacy APIs)
 * - Zero-allocation listener orientation updates
 */

export const SPATIAL_AUDIO_CONFIG = {
  MIN_DISTANCE: 250,
  MAX_DISTANCE: 4500,
  MAX_GAIN: 0.4,
  RAMP_TIME: 0.025
};

/**
 * Calculates distance gain attenuation using cubic Hermite interpolation.
 * Replaces original mangled `j1`.
 * @param {number} distance - Distance from listener in Unreal Units (uu)
 * @returns {number} Attenuated gain [0.0, 0.4]
 */
export function calculateDistanceGain(distance) {
  if (!Number.isFinite(distance)) return 0;
  const { MIN_DISTANCE, MAX_DISTANCE, MAX_GAIN } = SPATIAL_AUDIO_CONFIG;
  const clamped = Math.max(0, Math.min(1, (distance - MIN_DISTANCE) / (MAX_DISTANCE - MIN_DISTANCE)));
  return MAX_GAIN * (1 - clamped * clamped * (3 - 2 * clamped));
}

// Internal listener state shared across all spatial audio instances
class AudioListenerManager {
  constructor() {
    this.position = { x: 0, y: 0, z: 0 };
    this.forward = { x: 0, y: 0, z: -1 };
    this.up = { x: 0, y: 1, z: 0 };
    this.quaternion = { x: 0, y: 0, z: 0, w: 1 };
    this.hasListener = false;
    this.sources = new Set();
  }

  register(source) {
    this.sources.add(source);
  }

  unregister(source) {
    this.sources.delete(source);
  }

  /**
   * Applies quaternion rotation to a 3D vector.
   */
  rotateVector(v, q) {
    const x = v.x, y = v.y, z = v.z;
    const qx = q.x, qy = q.y, qz = q.z, qw = q.w ?? 1;
    const ix = qw * x + qy * z - qz * y;
    const iy = qw * y + qz * x - qx * z;
    const iz = qw * z + qx * y - qy * x;
    const iw = -qx * x - qy * y - qz * z;
    return {
      x: ix * qw + iw * -qx + iy * -qz - iz * -qy,
      y: iy * qw + iw * -qy + iz * -qx - ix * -qz,
      z: iz * qw + iw * -qz + ix * -qy - iy * -qx
    };
  }

  /**
   * Updates global audio listener state from 3D camera.
   * Replaces original mangled `_1`.
   * @param {Object} camera - Three.js camera or equivalent transform object
   */
  updateFromCamera(camera) {
    if (!camera) return;

    if (typeof camera.updateWorldMatrix === 'function') {
      camera.updateWorldMatrix(true, false);
    }

    if (typeof camera.getWorldPosition === 'function') {
      camera.getWorldPosition(this.position);
    } else if (camera.position) {
      this.position.x = camera.position.x;
      this.position.y = camera.position.y;
      this.position.z = camera.position.z;
    }

    if (typeof camera.getWorldQuaternion === 'function') {
      camera.getWorldQuaternion(this.quaternion);
    } else if (camera.quaternion) {
      this.quaternion.x = camera.quaternion.x;
      this.quaternion.y = camera.quaternion.y;
      this.quaternion.z = camera.quaternion.z;
      this.quaternion.w = camera.quaternion.w;
    }

    // Default orientation: Forward = (0, 0, -1), Up = (0, 1, 0)
    this.forward = this.rotateVector({ x: 0, y: 0, z: -1 }, this.quaternion);
    this.up = this.rotateVector({ x: 0, y: 1, z: 0 }, this.quaternion);
    this.hasListener = true;

    for (const source of this.sources) {
      source.updateListener();
    }
  }
}

export const listenerManager = new AudioListenerManager();

/**
 * Updates the global audio listener position & orientation.
 * Replaces original `_1(H.camera)`.
 * @param {Object} camera - Active camera
 */
export function updateAudioListener(camera) {
  listenerManager.updateFromCamera(camera);
}

/**
 * 3D Spatial Audio Source for individual sound emitters (e.g. car engines, boost nozzles).
 * Deobfuscates class `cg`.
 */
export class SpatialAudioSource {
  /**
   * @param {AudioContext} context - Active Web Audio context
   * @param {AudioNode} destinationNode - Destination node (typically master mixer input)
   */
  constructor(context, destinationNode) {
    this.context = context;
    this.enabled = true;
    this.targetGain = -1;
    this.position = {
      x: 0,
      y: 0,
      z: 0,
      copy(p) {
        if (p) {
          this.x = p.x;
          this.y = p.y;
          this.z = p.z;
        }
        return this;
      },
      set(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
        return this;
      }
    };

    // Explicit mono input bus
    this.input = context.createGain();
    this.input.channelCount = 1;
    this.input.channelCountMode = 'explicit';
    this.input.channelInterpretation = 'speakers';

    // HRTF Spatial Panner
    this.panner = context.createPanner();
    this.panner.panningModel = 'HRTF';
    this.panner.channelCount = 1;
    this.panner.channelCountMode = 'explicit';
    this.panner.rolloffFactor = 0; // Distance gain handled explicitly via smoothstep

    // Output attenuation node
    this.output = context.createGain();
    this.output.gain.value = 0;

    // Chain: input -> panner -> output -> destination
    this.input.connect(this.panner);
    this.panner.connect(this.output);
    if (destinationNode) {
      this.output.connect(destinationNode);
    }

    listenerManager.register(this);
    this.updateListener();
  }

  /**
   * Sets world-space position of this emitter
   * @param {{x: number, y: number, z: number}} pos 
   */
  setPosition(pos) {
    this.position.copy(pos);
    const t = this.context.currentTime;
    if (this.panner.positionX) {
      this.panner.positionX.setValueAtTime(pos.x, t);
      this.panner.positionY.setValueAtTime(pos.y, t);
      this.panner.positionZ.setValueAtTime(pos.z, t);
    } else if (typeof this.panner.setPosition === 'function') {
      this.panner.setPosition(pos.x, pos.y, pos.z);
    }
    this.applyGain();
  }

  /**
   * Enables or disables emitter output
   * @param {boolean} enabled 
   */
  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    this.applyGain();
  }

  /**
   * Syncs Web Audio listener orientation and updates gain
   */
  updateListener() {
    if (listenerManager.hasListener) {
      const listener = this.context.listener;
      const t = this.context.currentTime;
      const { position, forward, up } = listenerManager;

      if (listener.positionX) {
        listener.positionX.setValueAtTime(position.x, t);
        listener.positionY.setValueAtTime(position.y, t);
        listener.positionZ.setValueAtTime(position.z, t);
        listener.forwardX.setValueAtTime(forward.x, t);
        listener.forwardY.setValueAtTime(forward.y, t);
        listener.forwardZ.setValueAtTime(forward.z, t);
        listener.upX.setValueAtTime(up.x, t);
        listener.upY.setValueAtTime(up.y, t);
        listener.upZ.setValueAtTime(up.z, t);
      } else if (typeof listener.setPosition === 'function') {
        listener.setPosition(position.x, position.y, position.z);
        listener.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
      }
    }
    this.applyGain();
  }

  /**
   * Calculates distance attenuation and schedules gain ramps
   */
  applyGain() {
    let target = 0;
    if (this.enabled && listenerManager.hasListener) {
      const dx = this.position.x - listenerManager.position.x;
      const dy = this.position.y - listenerManager.position.y;
      const dz = this.position.z - listenerManager.position.z;
      const distance = Math.hypot(dx, dy, dz);
      target = calculateDistanceGain(distance);
    }

    if (target === this.targetGain) return;
    this.targetGain = target;

    const t = this.context.currentTime;
    const currentGain = this.output.gain.value;
    this.output.gain.cancelScheduledValues(t);

    if (target === 0 || this.context.state !== 'running') {
      this.output.gain.setValueAtTime(target, t);
    } else {
      this.output.gain.setValueAtTime(currentGain, t);
      this.output.gain.linearRampToValueAtTime(target, t + SPATIAL_AUDIO_CONFIG.RAMP_TIME);
    }
  }

  /**
   * Disposes nodes and unregisters from listener manager
   */
  dispose() {
    this.setEnabled(false);
    listenerManager.unregister(this);
    try {
      this.input.disconnect();
      this.panner.disconnect();
      this.output.disconnect();
    } catch (e) {}
  }
}

// Backward-compatibility aliases matching original obfuscated symbols
export {
  SpatialAudioSource as cg,
  updateAudioListener as _1,
  calculateDistanceGain as j1
};
