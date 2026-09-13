/**
 * MatchDialog.js
 * Match menu modal, difficulty selection dialog, and live scoreboard overlay.
 * 
 * Features:
 * - Bot opponent selector (Nexto, Necto, Seer)
 * - 1v1 match setup with preloading indicator
 * - Live scoreboard HUD with real-time score, countdown, overtime indicator
 * - Keyboard & Gamepad (D-pad) navigation with cross-platform icon labels
 * - Match announcement banners (Kickoff, Goal, Overtime, Match End)
 * - Backward compatibility with original obfuscated symbols ($M).
 */

import { renderIcon } from './Icons.js';
import { BOT_POLICIES, getBotPolicy } from '../ai/RLBotAgent.js';
import { DEFAULT_MATCH_STATE, formatMatchTime } from '../game/MatchStateMachine.js';
import { getEffectiveGamepad, detectControllerType } from '../input/MultiPlatformInput.js';

export class MatchDialog {
  constructor(container, options) {
    this.options = options;
    this.selectedBotId = options.botId ?? "nexto";
    this.view = {
      ...DEFAULT_MATCH_STATE
    };
    this.openState = false;
    this.starting = false;
    this.startAbort = null;
    this.errorMessage = "";
    this.padPoll = 0;
    this.padPrev = [];
    this.padDirection = 0;
    this.padRepeatAt = 0;
    this.padKey = null;
    this.padWaitForNeutral = false;
    this.closeTimer = 0;
    this.renderKey = "";

    this.onKeyDown = (e) => {
      if (this.openState) {
        e.stopImmediatePropagation();
        this.markKeyboard();
        if (e.code === "Escape" || e.code === "KeyM") {
          e.preventDefault();
          if (!e.repeat) this.hide();
        } else if (e.code === "Tab") {
          e.preventDefault();
          this.moveFocus(e.shiftKey ? -1 : 1);
        } else if (["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(e.code)) {
          e.preventDefault();
          this.moveFocus(e.code === "ArrowDown" || e.code === "ArrowRight" ? 1 : -1);
        }
      }
    };

    this.pollPad = (now) => {
      if (!this.openState) return;
      this.padPoll = requestAnimationFrame(this.pollPad);
      const pad = this.firstPad();
      const padKey = pad ? JSON.stringify([pad.id, pad.index]) : null;
      if (padKey !== this.padKey) {
        this.padKey = padKey;
        this.padPrev = (pad?.buttons ?? []).map(b => b.pressed);
        this.padDirection = 0;
        this.padWaitForNeutral = true;
        this.markKeyboard();
        return;
      }
      if (!pad) return;

      const btnPressed = pad.buttons.map(b => b.pressed);
      const confirmPressed = btnPressed[0] && !this.padPrev[0];
      const backPressed = btnPressed[1] && !this.padPrev[1];
      this.padPrev = btnPressed;

      if (backPressed) {
        this.hide();
        return;
      }
      if (confirmPressed) {
        this.markPad(pad);
        if (this.dialog.contains(document.activeElement)) {
          document.activeElement.click();
        } else {
          this.focusInitial();
        }
        return;
      }

      const axisY = pad.axes[1] ?? 0;
      const axisX = pad.axes[0] ?? 0;
      let dir = (btnPressed[13] ? 1 : 0) - (btnPressed[12] ? 1 : 0);
      if (!dir && Math.abs(axisY) > 0.55) dir = Math.sign(axisY);
      if (!dir) dir = (btnPressed[15] ? 1 : 0) - (btnPressed[14] ? 1 : 0);
      if (!dir && Math.abs(axisX) > 0.55) dir = Math.sign(axisX);

      if (this.padWaitForNeutral) {
        if (dir) return;
        this.padWaitForNeutral = false;
      }
      if (!dir) {
        this.padDirection = 0;
        return;
      }
      if (dir !== this.padDirection) {
        this.padDirection = dir;
        this.padRepeatAt = now + 380;
      } else {
        if (now < this.padRepeatAt) return;
        this.padRepeatAt = now + 110;
      }
      this.markPad(pad);
      this.moveFocus(dir);
    };

    container.insertAdjacentHTML("beforeend", `
      <button id="match-button" class="match-tab" type="button"
              aria-label="Open play menu" aria-controls="match-dialog" aria-expanded="false"
              title="Play">
        <span class="match-tab__icon" aria-hidden="true">${renderIcon("play", 30)}</span>
        <span class="match-tab__label">Play<span class="match-tab__mode">1v1 match</span></span>
        <kbd class="match-tab__key" aria-hidden="true">M</kbd>
      </button>

      <section class="match-scoreboard" aria-label="Match score" hidden>
        <div class="match-scoreboard__team match-scoreboard__team--blue">
          <span class="match-scoreboard__name" data-match="blue-name"></span>
          <span class="match-scoreboard__score" data-match="blue-score">0</span>
        </div>
        <div class="match-scoreboard__clock">
          <span class="match-scoreboard__time" data-match="clock">5:00</span>
          <span class="match-scoreboard__period" data-match="period">1v1</span>
        </div>
        <div class="match-scoreboard__team match-scoreboard__team--orange">
          <span class="match-scoreboard__score" data-match="orange-score">0</span>
          <span class="match-scoreboard__name" data-match="orange-name"></span>
        </div>
      </section>

      <div class="match-message" role="status" aria-live="polite" aria-atomic="true" hidden>
        <span class="match-message__eyebrow" data-match="message-eyebrow"></span>
        <strong class="match-message__title" data-match="message-title"></strong>
        <span class="match-message__detail" data-match="message-detail"></span>
      </div>

      <div id="match-overlay" class="match-overlay" hidden inert aria-hidden="true">
        <section id="match-dialog" class="match-panel" role="dialog" aria-modal="true"
                 aria-labelledby="match-title" tabindex="-1">
          <header class="match-panel__head">
            <div>
              <h2 id="match-title">Play</h2>
              <p>One arena. One challenger.</p>
            </div>
            <button class="match-panel__close" type="button" data-match="close" aria-label="Close play menu">
              ${renderIcon("x", 24)}
            </button>
          </header>

          <div class="match-panel__body">
            <fieldset class="match-difficulty" aria-describedby="match-difficulty-help">
              <legend>Choose your difficulty</legend>
              <div class="match-difficulty__options">
                ${BOT_POLICIES.map(n => `
                  <button class="match-difficulty__option" type="button" data-bot-id="${n.id}"
                          aria-pressed="false" aria-label="${n.rank}: ${n.name}">
                    <span class="match-difficulty__rank">${n.rank}</span>
                    <span class="match-difficulty__name">${n.name}</span>
                  </button>
                `).join("")}
              </div>
              <p id="match-difficulty-help" class="match-difficulty__help" data-match="difficulty-help">Ranks are approximate 1v1 estimates.</p>
            </fieldset>
            <div class="match-panel__section-label"><span>Your matchup</span><span>Solo duel</span></div>
            <div class="match-opponent" data-player-team="${options.playerTeam === 0 ? "blue" : "orange"}">
              <span class="match-opponent__faceoff" aria-hidden="true">
                <span class="match-opponent__player">${renderIcon("game-controller", 52)}<span>You</span></span>
                <span class="match-opponent__versus">VS</span>
                <span class="match-opponent__bot">${renderIcon("robot", 64)}</span>
              </span>
              <span class="match-opponent__body">
                <span class="match-opponent__type">Your opponent</span>
                <strong class="match-opponent__name" data-match="bot-name"></strong>
                <span class="match-opponent__description" data-match="bot-description"></span>
              </span>
            </div>

            <dl class="match-rules">
              <div><dt>Format</dt><dd>1 vs 1</dd></div>
              <div><dt>Match time</dt><dd>5 minutes</dd></div>
              <div><dt>Overtime</dt><dd>Next goal wins</dd></div>
            </dl>

            <section class="match-current" data-match="current" aria-label="Current match" hidden>
              <div class="match-panel__section-label"><span data-match="current-label">Match paused</span><span data-match="current-clock">5:00</span></div>
              <div class="match-current__result">
                <span class="match-current__team--blue" data-match="blue-name"></span><strong data-match="current-score">0 — 0</strong><span class="match-current__team--orange" data-match="orange-name"></span>
              </div>
            </section>

            <p class="match-panel__loading" role="status" data-match="loading" hidden>
              <span class="match-panel__loading-mark" aria-hidden="true"></span>
              Preparing your opponent… Close to cancel.
            </p>
            <p class="match-panel__error" role="alert" data-match="error" hidden></p>
          </div>

          <footer class="match-panel__footer">
            <div class="match-panel__actions">
              <button class="match-action match-action--primary" type="button" data-match="resume" hidden>Resume match <span aria-hidden="true">${renderIcon("play", 24)}</span></button>
              <button class="match-action match-action--primary" type="button" data-match="start">Start match <span aria-hidden="true">${renderIcon("play", 24)}</span></button>
              <button class="match-action match-action--quiet" type="button" data-match="leave" hidden>Return to free play</button>
            </div>
            <p class="match-panel__shortcut" data-match="legend"><kbd>M</kbd> Play menu <span>·</span> <kbd>Esc</kbd> Close</p>
            <a class="match-panel__credit" data-match="credit" target="_blank" rel="noopener noreferrer"></a>
          </footer>
        </section>
      </div>
    `);

    this.tab = container.querySelector("#match-button");
    this.overlay = container.querySelector("#match-overlay");
    this.dialog = this.overlay.querySelector(".match-panel");
    this.hud = container.querySelector(".match-scoreboard");
    this.message = container.querySelector(".match-message");
    this.startButton = this.element("start");
    this.resumeButton = this.element("resume");
    this.leaveButton = this.element("leave");
    this.error = this.element("error");
    this.loading = this.element("loading");
    this.legend = this.element("legend");
    this.botButtons = Array.from(this.overlay.querySelectorAll("[data-bot-id]"));

    for (const btn of this.botButtons) {
      btn.addEventListener("click", () => {
        if (this.starting || this.view.mode === "match") return;
        const botId = btn.dataset.botId;
        if (botId !== this.selectedBotId) {
          this.selectedBotId = botId;
          this.errorMessage = "";
          this.options.onSelectBot?.(botId);
          this.render();
        }
      });
    }

    this.tab.addEventListener("click", () => this.openState ? this.hide() : this.show());
    this.element("close").addEventListener("click", () => this.hide());
    this.resumeButton.addEventListener("click", () => {
      this.options.onResume?.();
      this.hide();
    });
    this.startButton.addEventListener("click", () => {
      this.start();
    });
    this.leaveButton.addEventListener("click", () => {
      if (!this.starting) {
        this.options.onLeave();
        this.errorMessage = "";
        this.hide();
      }
    });

    this.overlay.addEventListener("click", (e) => {
      if (e.target === this.overlay) this.hide();
    });

    for (const elem of [this.tab, this.overlay]) {
      for (const eventName of ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "dblclick", "auxclick", "touchstart", "touchend"]) {
        elem.addEventListener(eventName, e => e.stopPropagation());
      }
    }

    this.overlay.addEventListener("pointerdown", () => this.markKeyboard());
    window.addEventListener("keydown", this.onKeyDown, true);
    document.addEventListener("focusin", (e) => {
      if (this.openState && !this.dialog.contains(e.target)) {
        this.focusInitial();
      }
    });

    this.render();
  }

  get isOpen() {
    return this.openState;
  }

  show() {
    if (this.openState) return;
    if (typeof clearTimeout !== "undefined") clearTimeout(this.closeTimer);
    this.openState = true;
    this.overlay.hidden = false;
    this.overlay.inert = false;
    this.overlay.setAttribute("aria-hidden", "false");
    this.tab.setAttribute("aria-expanded", "true");
    this.options.onOpenChange(true);
    this.render();
    requestAnimationFrame(() => {
      if (this.openState) {
        this.overlay.classList.add("is-open");
        this.focusInitial();
      }
    });
    const pad = this.firstPad();
    this.padPrev = (pad?.buttons ?? []).map(b => b.pressed);
    this.padPoll = requestAnimationFrame(this.pollPad);
  }

  hide() {
    if (!this.openState) return;
    this.startAbort?.abort();
    this.startAbort = null;
    this.starting = false;
    this.openState = false;
    this.markKeyboard();
    this.overlay.classList.remove("is-open");
    this.overlay.inert = true;
    this.overlay.setAttribute("aria-hidden", "true");
    this.tab.setAttribute("aria-expanded", "false");
    if (typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(this.padPoll);
    this.padPoll = 0;
    this.padDirection = 0;
    this.options.onOpenChange(false);
    this.render();

    if (this.overlay.contains(document.activeElement)) {
      this.tab.focus({ preventScroll: true });
    }
    this.closeTimer = typeof setTimeout !== "undefined"
      ? setTimeout(() => {
          if (!this.openState) this.overlay.hidden = true;
        }, 240)
      : 0;
  }

  update(state) {
    if (state.botId) {
      this.selectedBotId = state.botId;
    }
    this.view = { ...state };
    this.render();
  }

  showError(msg) {
    this.errorMessage = msg;
    this.starting = false;
    this.render();
    this.show();
  }

  element(id) {
    return this.overlay.querySelector(`[data-match="${id}"]`);
  }

  setText(root, id, text) {
    const el = root.querySelector(`[data-match="${id}"]`);
    if (el && el.textContent !== text) {
      el.textContent = text;
    }
  }

  async start() {
    if (this.starting) return;
    const controller = new AbortController();
    this.startAbort = controller;
    this.starting = true;
    this.errorMessage = "";
    this.render();
    this.element("close").focus({ preventScroll: true });

    try {
      await this.options.onStart(controller.signal);
      if (controller.signal.aborted) return;
      this.startAbort = null;
      this.starting = false;
      this.render();
      this.options.onResume?.();
      this.hide();
    } catch (err) {
      if (controller.signal.aborted) return;
      this.startAbort = null;
      this.showError(err instanceof Error ? err.message : "The opponent could not be prepared. Please try again.");
      this.startButton.focus({ preventScroll: true });
    }
  }

  render() {
    const s = this.view;
    const bot = getBotPolicy(this.selectedBotId) ?? BOT_POLICIES[0];
    const playerTeam = this.options.playerTeam;
    const key = [
      s.mode,
      s.phase,
      s.blueScore,
      s.orangeScore,
      Math.ceil(s.remainingSeconds),
      s.overtime,
      Math.floor(s.overtimeSeconds),
      Math.ceil(s.countdown),
      s.winner,
      s.scorer,
      s.paused,
      this.openState,
      this.starting,
      this.errorMessage,
      playerTeam,
      this.selectedBotId
    ].join("|");

    if (key === this.renderKey) return;
    this.renderKey = key;

    const isMatch = s.mode === "match";
    const isEnded = isMatch && s.phase === "ended";

    for (const btn of this.botButtons) {
      btn.disabled = isMatch || this.starting;
      btn.setAttribute("aria-pressed", String(btn.dataset.botId === this.selectedBotId));
    }

    this.setText(this.overlay, "bot-name", bot.name);
    this.setText(this.overlay, "bot-description", bot.description);
    this.setText(this.overlay, "difficulty-help", isMatch ? "Return to free play to change difficulty." : "Ranks are approximate 1v1 estimates.");

    const creditEl = this.element("credit");
    if (creditEl) {
      creditEl.href = bot.noticeUrl;
      creditEl.textContent = bot.credit;
    }

    const opponentCard = this.overlay.querySelector(".match-opponent");
    if (opponentCard) {
      opponentCard.dataset.playerTeam = playerTeam === 0 ? "blue" : "orange";
    }

    const clockFormatted = s.overtime ? `+${formatMatchTime(s.overtimeSeconds, false)}` : formatMatchTime(s.remainingSeconds, true);
    const blueName = playerTeam === 0 ? "You" : bot.name;
    const orangeName = playerTeam === 1 ? "You" : bot.name;

    this.hud.hidden = !isMatch;
    this.setText(this.hud, "blue-name", blueName);
    this.setText(this.hud, "orange-name", orangeName);
    this.setText(this.hud, "blue-score", String(s.blueScore));
    this.setText(this.hud, "orange-score", String(s.orangeScore));
    this.setText(this.hud, "clock", clockFormatted);
    this.setText(this.hud, "period", isEnded ? "Final" : s.paused || this.openState ? "Paused" : s.overtime ? "Overtime" : "1v1");
    this.hud.classList.toggle("is-overtime", s.overtime);
    this.hud.setAttribute("aria-label", `${blueName} ${s.blueScore}, ${orangeName} ${s.orangeScore}. ${s.overtime ? "Overtime " : ""}${clockFormatted}`);

    const currentSection = this.element("current");
    if (currentSection) currentSection.hidden = !isMatch;
    this.setText(this.overlay, "blue-name", blueName);
    this.setText(this.overlay, "orange-name", orangeName);
    this.setText(this.overlay, "current-clock", clockFormatted);
    this.setText(this.overlay, "current-score", `${s.blueScore} — ${s.orangeScore}`);
    this.setText(this.overlay, "current-label", isEnded ? "Final score" : "Match paused");

    this.resumeButton.hidden = !isMatch || isEnded;
    this.resumeButton.disabled = this.starting;
    this.leaveButton.hidden = !isMatch;
    this.leaveButton.disabled = this.starting;
    this.startButton.disabled = this.starting;
    this.startButton.classList.toggle("match-action--primary", !isMatch || isEnded);
    this.startButton.classList.toggle("match-action--secondary", isMatch && !isEnded);

    const btnLabel = this.starting ? "Preparing opponent…" : this.errorMessage ? "Try again" : isEnded ? "Play again" : isMatch ? "Restart match" : "Start match";
    if (this.startButton.firstChild && this.startButton.firstChild.textContent !== `${btnLabel} `) {
      this.startButton.firstChild.textContent = `${btnLabel} `;
    }

    this.loading.hidden = !this.starting;
    this.error.hidden = !this.errorMessage;
    if (this.error.textContent !== this.errorMessage) {
      this.error.textContent = this.errorMessage;
    }
    this.dialog.setAttribute("aria-busy", String(this.starting));
    this.renderMessage();
  }

  renderMessage() {
    const s = this.view;
    const botName = (getBotPolicy(this.selectedBotId) ?? BOT_POLICIES[0]).name;
    const playerTeam = this.options.playerTeam;
    const botTeam = playerTeam === 0 ? 1 : 0;

    let eyebrow = "";
    let title = "";
    let detail = "";
    let teamColor = "";

    if (s.mode === "match") {
      if (s.phase === "ended") {
        eyebrow = "Full time";
        title = s.winner === playerTeam ? "You win" : s.winner === botTeam ? `${botName} wins` : "Match complete";
        detail = "Open Play for a rematch";
        teamColor = s.winner === 0 ? "blue" : s.winner === 1 ? "orange" : "";
      } else if (s.paused) {
        title = "Paused";
        detail = "Ready when you are";
      } else if (s.phase === "kickoff") {
        eyebrow = s.overtime ? "Overtime · Next goal wins" : "Get ready";
        title = s.countdown > 0 ? String(Math.ceil(s.countdown)) : "Go!";
      } else if (s.phase === "goal") {
        eyebrow = "Goal";
        title = s.scorer === playerTeam ? "You scored" : s.scorer === botTeam ? `${botName} scored` : "Goal scored";
        teamColor = s.scorer === 0 ? "blue" : s.scorer === 1 ? "orange" : "";
      } else if (!s.overtime && s.remainingSeconds <= 0) {
        title = "Keep it up";
        detail = "The clock is at zero. The ball is still live.";
      }
    }

    this.message.hidden = !title || this.openState;
    this.message.dataset.team = teamColor;
    this.message.classList.toggle("is-countdown", s.phase === "kickoff" && !s.paused);
    this.setText(this.message, "message-eyebrow", eyebrow);
    this.setText(this.message, "message-title", title);
    this.setText(this.message, "message-detail", detail);
  }

  focusables() {
    return Array.from(this.dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), a[href], [tabindex="0"]'))
      .filter(el => !el.hidden && el.offsetParent !== null);
  }

  focusInitial() {
    const el = this.resumeButton.hidden ? this.startButton : this.resumeButton;
    (el.disabled ? this.element("close") : el).focus({ preventScroll: true });
  }

  moveFocus(dir) {
    const list = this.focusables();
    if (!list.length) {
      this.dialog.focus();
      return;
    }
    const idx = list.indexOf(document.activeElement);
    const targetIdx = idx < 0 ? (dir > 0 ? 0 : list.length - 1) : (idx + dir + list.length) % list.length;
    list[targetIdx].focus({ preventScroll: true });
    list[targetIdx].scrollIntoView({ block: "nearest" });
  }

  firstPad() {
    return getEffectiveGamepad();
  }

  markKeyboard() {
    if (this.overlay.classList.contains("is-pad-nav")) {
      this.overlay.classList.remove("is-pad-nav");
      this.legend.innerHTML = "<kbd>M</kbd> Play menu <span>·</span> <kbd>Esc</kbd> Close";
    }
  }

  markPad(pad) {
    if (this.overlay.classList.contains("is-pad-nav")) return;
    this.overlay.classList.add("is-pad-nav");
    const isPS = detectControllerType(pad.id) === "playstation";
    this.legend.innerHTML = `<kbd>D-pad</kbd> Move <span>·</span> <kbd>${isPS ? "Cross" : "A"}</kbd> Select <span>·</span> <kbd>${isPS ? "Circle" : "B"}</kbd> Close`;
  }
}

// Backward-compatibility alias
export { MatchDialog as $M };
