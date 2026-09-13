/**
 * MatchStateMachine.js
 * High-precision 120Hz Match State Controller & Rules Engine.
 * 
 * Implements standard Rocket League match rules:
 * - 5-minute regulation clock (only ticks down once ball is touched at kickoff)
 * - 3-second kickoff countdown with engine rev
 * - Goal replay / pause buffer (3 seconds)
 * - Zero-second live ball rule: regulation time does NOT end until the ball touches the ground
 * - Overtime (Golden Goal: sudden death overtime, next goal wins)
 * - Backward compatibility with original obfuscated symbols (VM, qM, sm, Is, am, om, zM).
 */

export const MATCH_TICK_RATE = 120;
export const DEFAULT_MATCH_DURATION_SECONDS = 300; // 5:00
export const DEFAULT_MATCH_DURATION_TICKS = DEFAULT_MATCH_DURATION_SECONDS * MATCH_TICK_RATE; // 36000
export const KICKOFF_COUNTDOWN_SECONDS = 3;
export const KICKOFF_COUNTDOWN_TICKS = KICKOFF_COUNTDOWN_SECONDS * MATCH_TICK_RATE; // 360
export const GOAL_RESET_SECONDS = 3;
export const GOAL_RESET_TICKS = GOAL_RESET_SECONDS * MATCH_TICK_RATE; // 360

export const MATCH_MODES = Object.freeze({
  FREEPLAY: 'freeplay',
  MATCH: 'match'
});

export const MATCH_PHASES = Object.freeze({
  PLAYING: 'playing',
  KICKOFF: 'kickoff',
  GOAL: 'goal',
  ENDED: 'ended'
});

export const DEFAULT_MATCH_STATE = Object.freeze({
  mode: MATCH_MODES.FREEPLAY,
  phase: MATCH_PHASES.PLAYING,
  blueScore: 0,
  orangeScore: 0,
  remainingSeconds: DEFAULT_MATCH_DURATION_SECONDS,
  overtime: false,
  overtimeSeconds: 0,
  countdown: 0,
  winner: null,
  scorer: null,
  paused: false
});

/**
 * Formats a time in seconds to mm:ss format.
 * @param {number} seconds
 * @param {boolean} ceil Whether to round up or down
 * @returns {string} e.g. "5:00", "0:03"
 */
export function formatMatchTime(seconds, ceil = false) {
  const t = Math.max(0, ceil ? Math.ceil(seconds) : Math.floor(seconds));
  const m = Math.floor(t / 60);
  const s = String(t % 60).padStart(2, '0');
  return `${m}:${s}`;
}

export class MatchStateMachine {
  constructor() {
    this.state = {
      ...DEFAULT_MATCH_STATE
    };
    this.remaining = DEFAULT_MATCH_DURATION_TICKS;
    this.overtimeTicks = 0;
    this.phaseTicks = 0;
    this.clockStarted = false;
  }

  /**
   * Resets and initiates a new standard 5-minute match.
   */
  start() {
    Object.assign(this.state, {
      mode: MATCH_MODES.MATCH,
      phase: MATCH_PHASES.KICKOFF,
      blueScore: 0,
      orangeScore: 0,
      remainingSeconds: DEFAULT_MATCH_DURATION_SECONDS,
      overtime: false,
      overtimeSeconds: 0,
      countdown: KICKOFF_COUNTDOWN_SECONDS,
      winner: null,
      scorer: null,
      paused: false
    });
    this.remaining = DEFAULT_MATCH_DURATION_TICKS;
    this.overtimeTicks = 0;
    this.phaseTicks = KICKOFF_COUNTDOWN_TICKS;
    this.clockStarted = false;
  }

  /**
   * Leaves the active match and returns to casual freeplay mode.
   */
  leave() {
    this.state.mode = MATCH_MODES.FREEPLAY;
    this.state.phase = MATCH_PHASES.PLAYING;
    this.state.paused = false;
  }

  /**
   * 120Hz step tick.
   * @param {Object} options
   * @param {number} options.goal 0: no goal, 1: blue scored, 2: orange scored
   * @param {boolean} options.ballOnGround Whether the ball is touching the arena floor
   * @param {boolean} options.kickoffTouched Whether a car touched the ball during kickoff
   * @returns {"none"|"kickoff"|"ended"} Action hint for the caller
   */
  tick({ goal = 0, ballOnGround = false, kickoffTouched = false } = {}) {
    const s = this.state;
    if (s.mode !== MATCH_MODES.MATCH || s.paused || s.phase === MATCH_PHASES.ENDED) {
      return "none";
    }

    // 1. Kickoff countdown phase
    if (s.phase === MATCH_PHASES.KICKOFF) {
      this.phaseTicks--;
      s.countdown = Math.ceil(this.phaseTicks / MATCH_TICK_RATE);
      if (this.phaseTicks <= 0) {
        s.phase = MATCH_PHASES.PLAYING;
      }
      return "none";
    }

    // 2. Goal buffer phase
    if (s.phase === MATCH_PHASES.GOAL) {
      this.phaseTicks--;
      if (this.phaseTicks > 0) {
        return "none";
      }
      // If someone has won (e.g. golden goal overtime or full time), end match
      if (s.winner !== null) {
        return this.end();
      }
      // If time has expired and tied, enter overtime
      if (this.remaining === 0) {
        s.overtime = true;
      }
      return this.kickoff();
    }

    // 3. Active playing phase
    // Start game clock on first touch after kickoff
    if (!this.clockStarted && kickoffTouched) {
      this.clockStarted = true;
    }

    if (this.clockStarted) {
      if (s.overtime) {
        this.overtimeTicks++;
        s.overtimeSeconds = this.overtimeTicks / MATCH_TICK_RATE;
      } else {
        this.remaining = Math.max(0, this.remaining - 1);
        s.remainingSeconds = this.remaining / MATCH_TICK_RATE;
      }
    }

    // Goal scored
    if (goal === 1 || goal === 2) {
      // 1 = Blue scored, 2 = Orange scored
      s.scorer = goal === 1 ? 0 : 1;
      if (s.scorer === 0) {
        s.blueScore++;
      } else {
        s.orangeScore++;
      }
      s.phase = MATCH_PHASES.GOAL;
      this.phaseTicks = GOAL_RESET_TICKS;

      // Check win condition (overtime golden goal or regulation time expired)
      if (s.overtime || (this.remaining === 0 && s.blueScore !== s.orangeScore)) {
        s.winner = s.blueScore > s.orangeScore ? 0 : 1;
      }
      return "none";
    }

    // 0:00 live ball check: regulation ends only when ball touches the ground
    if (!s.overtime && this.remaining === 0 && ballOnGround) {
      if (s.blueScore === s.orangeScore) {
        s.overtime = true;
        return this.kickoff();
      } else {
        s.winner = s.blueScore > s.orangeScore ? 0 : 1;
        return this.end();
      }
    }

    return "none";
  }

  /**
   * Resets field positions and triggers kickoff countdown.
   * @returns {"kickoff"}
   */
  kickoff() {
    this.state.phase = MATCH_PHASES.KICKOFF;
    this.state.scorer = null;
    this.state.countdown = KICKOFF_COUNTDOWN_SECONDS;
    this.phaseTicks = KICKOFF_COUNTDOWN_TICKS;
    this.clockStarted = false;
    return "kickoff";
  }

  /**
   * Ends the match.
   * @returns {"ended"}
   */
  end() {
    this.state.phase = MATCH_PHASES.ENDED;
    return "ended";
  }
}

// Backward-compatibility aliases
export {
  MatchStateMachine as VM,
  DEFAULT_MATCH_STATE as qM,
  formatMatchTime as sm,
  MATCH_TICK_RATE as Is,
  DEFAULT_MATCH_DURATION_TICKS as am,
  KICKOFF_COUNTDOWN_TICKS as om,
  GOAL_RESET_TICKS as zM
};
