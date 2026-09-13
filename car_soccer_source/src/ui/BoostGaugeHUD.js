/**
 * BoostGaugeHUD.js
 * High-precision linear boost meter HUD (deobfuscates nB & um).
 *
 * Visualizes vehicle boost inventory (0 - 100) using SVG vector elements:
 * - Background track with graduation marks at 0, 25, 50, 75, 100%
 * - Real-time filled bar indicating available boost
 * - Infinite boost mode display ('∞')
 * - Dynamic firing glow animation when boost is actively consumed
 */

import { renderIcon } from './Icons.js';

export const BOOST_GAUGE_CONFIG = {
  TRACK_START_X: 1,
  TRACK_END_X: 159,
  TRACK_WIDTH: 158, // 159 - 1
  TRACK_Y: 13,
  TICKS: [0, 25, 50, 75, 100]
};

/**
 * Calculates SVG X coordinate along the gauge track for a given boost value
 * @param {number} boostValue - Current boost (0 - 100)
 * @param {number} [startX=1]
 * @param {number} [width=158]
 * @returns {number} SVG X coordinate
 */
export function boostToTrackX(boostValue, startX = BOOST_GAUGE_CONFIG.TRACK_START_X, width = BOOST_GAUGE_CONFIG.TRACK_WIDTH) {
  const clamped = Math.max(0, Math.min(100, boostValue));
  return startX + (clamped / 100) * width;
}

export class BoostGaugeHUD {
  /**
   * @param {HTMLElement} container - DOM container into which the HUD is inserted
   * @param {Object} [options]
   * @param {(name: string, size?: number) => string} [options.renderIcon]
   */
  constructor(container, options = {}) {
    const iconRenderer = options.renderIcon || renderIcon;
    const { TRACK_START_X, TRACK_END_X, TRACK_Y, TICKS } = BOOST_GAUGE_CONFIG;

    this.root = null;
    this.fill = null;
    this.mark = null;
    this.figure = null;
    this.lastValue = -1;
    this.lastSpendingBoost = false;
    this.lastUnlimited = null;

    container.insertAdjacentHTML('beforeend', `
      <div class="boost" data-el="boost" role="meter" aria-valuemin="0" aria-valuemax="100"
           aria-valuenow="0" aria-label="Boost">
        <div class="boost__head">
          <p class="boost__label">${iconRenderer('bolt', 18)}Boost</p>
          <p class="boost__figure" data-el="boostFigure">0</p>
        </div>
        <svg class="boost__scale" viewBox="0 0 160 18" aria-hidden="true">
          <line class="boost__track" x1="${TRACK_START_X}" y1="${TRACK_Y}" x2="${TRACK_END_X}" y2="${TRACK_Y}" />
          ${TICKS.map(tick => {
            const x = boostToTrackX(tick, TRACK_START_X);
            const isMajor = tick === 0 || tick === 100;
            return `<line class="boost__tick${isMajor ? ' boost__tick--major' : ''}"
                          x1="${x}" y1="${TRACK_Y}" x2="${x}" y2="${TRACK_Y - (isMajor ? 8 : 4)}" />`;
          }).join('')}
          <line class="boost__fill" data-el="boostFill"
                x1="${TRACK_START_X}" y1="${TRACK_Y}" x2="${TRACK_START_X}" y2="${TRACK_Y}" />
          <line class="boost__mark" data-el="boostMark"
                x1="${TRACK_START_X}" y1="${TRACK_Y - 10}" x2="${TRACK_START_X}" y2="${TRACK_Y + 4}" />
        </svg>
      </div>
    `);

    this.root = container.querySelector('[data-el="boost"]');
    this.fill = this.root.querySelector('[data-el="boostFill"]');
    this.mark = this.root.querySelector('[data-el="boostMark"]');
    this.figure = this.root.querySelector('[data-el="boostFigure"]');
  }

  /**
   * Updates boost gauge display elements
   * @param {number} boostAmount - Current boost (0 - 100)
   * @param {boolean} isSpending - Whether the vehicle is actively burning boost
   * @param {boolean} isUnlimited - Whether unlimited boost mutator is active
   */
  update(boostAmount, isSpending, isUnlimited) {
    const rounded = Math.round(boostAmount);

    if (isUnlimited !== this.lastUnlimited) {
      this.lastUnlimited = isUnlimited;
      this.root.classList.toggle('is-unlimited', isUnlimited);
      if (isUnlimited) {
        this.figure.textContent = '∞';
        this.root.setAttribute('aria-valuetext', 'Unlimited');
      } else {
        this.root.removeAttribute('aria-valuetext');
        this.lastValue = -1;
      }
    }

    if (!isUnlimited && rounded !== this.lastValue) {
      this.lastValue = rounded;
      const x = String(boostToTrackX(rounded));
      this.fill.setAttribute('x2', x);
      this.mark.setAttribute('x1', x);
      this.mark.setAttribute('x2', x);
      this.figure.textContent = String(rounded);
      this.root.setAttribute('aria-valuenow', String(rounded));
    } else if (isUnlimited && this.lastValue !== 100) {
      this.lastValue = 100;
      const endX = String(BOOST_GAUGE_CONFIG.TRACK_END_X);
      this.fill.setAttribute('x2', endX);
      this.mark.setAttribute('x1', endX);
      this.mark.setAttribute('x2', endX);
      this.root.setAttribute('aria-valuenow', '100');
    }

    const firing = isSpending && !isUnlimited;
    if (firing !== this.lastSpendingBoost) {
      this.lastSpendingBoost = firing;
      this.root.classList.toggle('is-firing', firing);
    }
  }

  destroy() {
    if (this.root && this.root.parentElement) {
      this.root.parentElement.removeChild(this.root);
    }
  }
}

// Backward-compatibility aliases
export { BoostGaugeHUD as nB, boostToTrackX as um };
