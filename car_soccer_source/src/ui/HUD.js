/**
 * HUD.js
 * Comprehensive in-game user interface:
 * Scoreboard, Match Clock, Kickoff countdown, Goal Announcement,
 * Boost Meter, Ball Cam Indicator, and Settings Dialog.
 */

export class HUD {
  constructor(container) {
    this.container = container;
    this.root = document.createElement('div');
    this.root.id = 'hud-root';
    this.root.className = 'hud-overlay';
    this.container.appendChild(this.root);

    this.blueScore = 0;
    this.orangeScore = 0;
    this.timeLeft = 300; // 5:00 minutes standard match
    this.isOvertime = false;
    this.boost = 33;
    this.ballCam = true;

    this.render();
  }

  render() {
    this.root.innerHTML = `
      <!-- Top Scoreboard -->
      <div class="hud-top-bar">
        <div class="hud-team blue">
          <span class="hud-team-name">BLUE</span>
          <span class="hud-score" id="blue-score">0</span>
        </div>
        <div class="hud-timer-container">
          <div class="hud-timer" id="match-timer">5:00</div>
          <div class="hud-timer-sub" id="timer-sub">MATCH</div>
        </div>
        <div class="hud-team orange">
          <span class="hud-score" id="orange-score">0</span>
          <span class="hud-team-name">ORANGE</span>
        </div>
      </div>

      <!-- Kickoff Countdown / Big Banner -->
      <div class="hud-center-banner" id="center-banner" style="display: none;">
        <h1 id="banner-text">3</h1>
      </div>

      <!-- Goal Announcement -->
      <div class="hud-goal-banner" id="goal-banner" style="display: none;">
        <h1 id="goal-text">GOAL!</h1>
        <p id="goal-sub">BLUE SCORED</p>
      </div>

      <!-- Bottom-Left: Ball Cam Indicator -->
      <div class="hud-bottom-left">
        <div class="hud-cam-badge active" id="ballcam-badge">
          <span class="cam-icon">⚽</span>
          <span class="cam-text">BALL CAM [C]</span>
        </div>
      </div>

      <!-- Bottom-Right: Boost Meter -->
      <div class="hud-bottom-right">
        <div class="boost-meter-container">
          <svg class="boost-ring" width="140" height="140">
            <circle class="boost-bg" cx="70" cy="70" r="58"></circle>
            <circle class="boost-bar" id="boost-progress" cx="70" cy="70" r="58"></circle>
          </svg>
          <div class="boost-value" id="boost-text">33</div>
          <div class="boost-label">BOOST</div>
        </div>
      </div>

      <!-- Controls Hint Overlay (Fades out after start) -->
      <div class="hud-controls-hint" id="controls-hint">
        <p><span>WASD / Arrows</span> Drive & Steer &nbsp;|&nbsp; <span>SPACE</span> Jump &nbsp;|&nbsp; <span>SHIFT / L-Click</span> Boost &nbsp;|&nbsp; <span>C</span> Ball Cam &nbsp;|&nbsp; <span>R</span> Reset</p>
      </div>
    `;

    this.blueScoreEl = this.root.querySelector('#blue-score');
    this.orangeScoreEl = this.root.querySelector('#orange-score');
    this.timerEl = this.root.querySelector('#match-timer');
    this.timerSubEl = this.root.querySelector('#timer-sub');
    this.centerBannerEl = this.root.querySelector('#center-banner');
    this.bannerTextEl = this.root.querySelector('#banner-text');
    this.goalBannerEl = this.root.querySelector('#goal-banner');
    this.goalTextEl = this.root.querySelector('#goal-text');
    this.goalSubEl = this.root.querySelector('#goal-sub');
    this.ballCamBadgeEl = this.root.querySelector('#ballcam-badge');
    this.boostTextEl = this.root.querySelector('#boost-text');
    this.boostProgressEl = this.root.querySelector('#boost-progress');

    // Circle circumference for r=58
    this.circumference = 2 * Math.PI * 58;
    this.boostProgressEl.style.strokeDasharray = `${this.circumference}`;
    this.updateBoost(33);

    // Fade out hint
    setTimeout(() => {
      const hint = this.root.querySelector('#controls-hint');
      if (hint) hint.classList.add('fade-out');
    }, 7000);
  }

  updateScore(blue, orange) {
    if (this.blueScore !== blue) {
      this.blueScore = blue;
      this.blueScoreEl.textContent = blue;
    }
    if (this.orangeScore !== orange) {
      this.orangeScore = orange;
      this.orangeScoreEl.textContent = orange;
    }
  }

  updateTimer(seconds, isOvertime = false) {
    this.timeLeft = seconds;
    const mins = Math.floor(Math.abs(seconds) / 60);
    const secs = Math.floor(Math.abs(seconds) % 60);
    const timeStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

    this.timerEl.textContent = isOvertime ? `+${timeStr}` : timeStr;
    if (isOvertime) {
      this.timerSubEl.textContent = 'OVERTIME';
      this.timerEl.classList.add('overtime');
    } else if (seconds <= 30) {
      this.timerEl.classList.add('critical');
    } else {
      this.timerEl.classList.remove('critical', 'overtime');
    }
  }

  updateBoost(amount) {
    this.boost = Math.round(Math.max(0, Math.min(100, amount)));
    this.boostTextEl.textContent = this.boost;

    const offset = this.circumference - (this.boost / 100) * this.circumference;
    this.boostProgressEl.style.strokeDashoffset = `${offset}`;

    if (this.boost > 60) {
      this.boostProgressEl.style.stroke = '#ffaa00';
    } else if (this.boost > 20) {
      this.boostProgressEl.style.stroke = '#ffcc00';
    } else {
      this.boostProgressEl.style.stroke = '#ff4400';
    }
  }

  updateBallCam(enabled) {
    this.ballCam = enabled;
    if (enabled) {
      this.ballCamBadgeEl.classList.add('active');
      this.ballCamBadgeEl.querySelector('.cam-text').textContent = 'BALL CAM [ON]';
    } else {
      this.ballCamBadgeEl.classList.remove('active');
      this.ballCamBadgeEl.querySelector('.cam-text').textContent = 'CAR CAM [OFF]';
    }
  }

  showCountdown(numberOrText) {
    this.centerBannerEl.style.display = 'flex';
    this.bannerTextEl.textContent = numberOrText;
    if (numberOrText === 'GO!') {
      setTimeout(() => {
        this.centerBannerEl.style.display = 'none';
      }, 1000);
    }
  }

  hideCountdown() {
    this.centerBannerEl.style.display = 'none';
  }

  showGoal(scoringTeam) {
    this.goalBannerEl.style.display = 'flex';
    this.goalTextEl.textContent = 'GOAL!';
    this.goalSubEl.textContent = scoringTeam === 0 ? 'BLUE SCORED' : 'ORANGE SCORED';
    this.goalBannerEl.className = `hud-goal-banner ${scoringTeam === 0 ? 'blue-theme' : 'orange-theme'}`;

    setTimeout(() => {
      this.goalBannerEl.style.display = 'none';
    }, 3500);
  }
}
