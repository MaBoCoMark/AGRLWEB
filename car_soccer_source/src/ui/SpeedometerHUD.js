/**
 * SpeedometerHUD.js
 * Low-Latency Nonlinear Speedometer / Progress Bar HUD.
 * 
 * Position: Screen bottom center, sharp corners (no border-radius).
 * Features:
 * - Direct style updates (zero latency, no transitions)
 * - Light-grey vertical notch at 2200 uu/s (85% mark) for supersonic threshold reference
 * - Segment 1: 0 <= v <= 1410 -> p = (v / 1410) * 40%, solid #77ca7a
 * - Segment 2: 1410 < v < 2200 -> p = 40 + ((v - 1410) / 790) * 45%, lerp #77ca7a to #59f168
 * - Segment 3: 2200 <= v <= 2300 -> p = 85 + ((v - 2200) / 100) * 15%, supersonic purple glow #a020f0
 */

export class SpeedometerHUD {
  constructor(container = document.body) {
    this.container = container;
    this.root = document.createElement('div');
    this.root.id = 'hud-speedometer';
    this.root.style.cssText = `
      position: fixed;
      bottom: 12px;
      left: 50%;
      transform: translateX(-50%);
      width: min(640px, 75vw);
      height: 9px;
      background: rgba(10, 15, 25, 0.75);
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 0px !important;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.6);
      pointer-events: none;
      z-index: 1000;
      overflow: visible;
      user-select: none;
    `;

    // Light-grey vertical notch at 2200 uu/s (85% mark)
    this.notch = document.createElement('div');
    this.notch.style.cssText = `
      position: absolute;
      left: 85%;
      top: -3px;
      bottom: -3px;
      width: 2px;
      background: #cfd4dc;
      box-shadow: 0 0 4px rgba(255, 255, 255, 0.8);
      z-index: 5;
      pointer-events: none;
    `;
    this.notch.title = 'Supersonic Threshold (2200 uu/s)';

    // Supersonic notch indicator label
    this.notchLabel = document.createElement('div');
    this.notchLabel.style.cssText = `
      position: absolute;
      left: 85%;
      bottom: 12px;
      transform: translateX(-50%);
      font-size: 9px;
      font-family: var(--sans, sans-serif);
      font-weight: 700;
      letter-spacing: 0.5px;
      color: #cfd4dc;
      text-transform: uppercase;
      white-space: nowrap;
      pointer-events: none;
    `;
    this.notchLabel.textContent = 'SUPERSONIC';

    // Progress bar fill (zero latency, sharp corners)
    this.bar = document.createElement('div');
    this.bar.style.cssText = `
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 0%;
      background: #77ca7a;
      border-radius: 0px !important;
      transition: none !important;
      z-index: 2;
    `;

    this.root.appendChild(this.notch);
    this.root.appendChild(this.notchLabel);
    this.root.appendChild(this.bar);
    this.container.appendChild(this.root);

    this.lastSpeed = -1;
  }

  /**
   * Linear color interpolation between #77ca7a and #59f168
   */
  static lerpColor(t) {
    const r = Math.round(119 + (89 - 119) * t);
    const g = Math.round(202 + (241 - 202) * t);
    const b = Math.round(122 + (104 - 122) * t);
    return `rgb(${r}, ${g}, ${b})`;
  }

  /**
   * Update speedometer directly with car speed in Unreal Units/second.
   * Lowest latency: directly mutates DOM without requestAnimationFrame delay or CSS easing.
   */
  update(rawSpeed) {
    const v = Math.max(0, Math.min(2300, Math.abs(rawSpeed || 0)));
    if (Math.abs(v - this.lastSpeed) < 0.1) return;
    this.lastSpeed = v;

    let p = 0;
    let color = '#77ca7a';
    let isSupersonic = false;

    if (v <= 1410) {
      p = (v / 1410) * 40;
      color = '#77ca7a';
    } else if (v < 2200) {
      const t = (v - 1410) / (2200 - 1410);
      p = 40 + t * 45;
      color = SpeedometerHUD.lerpColor(t);
    } else {
      const t = Math.min(1, (v - 2200) / 100);
      p = 85 + t * 15;
      color = '#a020f0';
      isSupersonic = true;
    }

    this.bar.style.width = `${p}%`;
    this.bar.style.backgroundColor = color;

    if (isSupersonic) {
      this.bar.style.boxShadow = '0 0 12px #a020f0, 0 0 4px #e080ff';
      this.root.style.borderColor = '#d060ff';
    } else {
      this.bar.style.boxShadow = 'none';
      this.root.style.borderColor = 'rgba(255, 255, 255, 0.25)';
    }
  }

  setVisible(visible) {
    this.root.style.display = visible ? 'block' : 'none';
  }

  destroy() {
    this.root.remove();
  }
}
