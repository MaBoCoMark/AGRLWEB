/**
 * RenderClockScheduler.js
 * High-performance WebGL render loop scheduler (deobfuscates bC).
 *
 * Decouples requestAnimationFrame display measurement from GPU command execution
 * using MessageChannel micro-ticks and WebGL2 fenceSync (SYNC_GPU_COMMANDS_COMPLETE).
 * Supports dynamic FPS limiting (60, 120, 144, 240, or unlocked).
 */

export class RenderClockScheduler {
  /**
   * @param {WebGL2RenderingContext} gl
   * @param {(timestamp: number) => void} renderCallback
   * @param {(timestamp: number) => void} displayFrameCallback
   */
  constructor(gl, renderCallback, displayFrameCallback) {
    this.channel = new MessageChannel();
    this.pending = [];
    this.gl = gl;
    this.render = renderCallback;
    this.displayFrame = displayFrameCallback;
    this.running = false;
    this.queued = false;
    this.displayRequest = null;
    this.frameTimer = null;
    this.frameTask = null;
    this.frameInterval = 0;
    this.nextFrameTime = 0;

    this.wake = () => {
      if (!this.active()) {
        this.clearFrameTimer();
        this.nextFrameTime = 0;
        this.clearPending();
        if (this.displayRequest !== null) {
          cancelAnimationFrame(this.displayRequest);
          this.displayRequest = null;
        }
        return;
      }

      if (this.displayRequest === null) {
        this.displayRequest = requestAnimationFrame(this.measureDisplay);
      }
      this.schedule();
    };

    this.measureDisplay = (time) => {
      this.displayRequest = null;
      if (this.active()) {
        this.displayFrame(time);
        this.displayRequest = requestAnimationFrame(this.measureDisplay);
      }
    };

    this.queueTick = () => {
      this.frameTimer = null;
      this.frameTask = null;
      if (!this.queued && this.active()) {
        this.queued = true;
        this.channel.port2.postMessage(null);
      }
    };

    this.tick = () => {
      this.queued = false;
      if (!this.active()) return;

      const now = performance.now();
      if (this.frameInterval > 0 && now < this.nextFrameTime) {
        this.schedule();
        return;
      }

      const glCtx = this.gl;
      while (this.pending.length > 0) {
        const syncStatus = glCtx.clientWaitSync(this.pending[0], 0, 0);
        if (syncStatus === glCtx.TIMEOUT_EXPIRED) break;
        if (syncStatus === glCtx.WAIT_FAILED) {
          this.dispose();
          throw new Error('Could not check completion of a rendered frame.');
        }
        glCtx.deleteSync(this.pending.shift());
      }

      if (this.pending.length < 2) {
        if (this.frameInterval > 0) {
          const target = this.nextFrameTime + this.frameInterval;
          this.nextFrameTime = target > now ? target : now + this.frameInterval;
        }
        this.render(now);

        const sync = glCtx.fenceSync(glCtx.SYNC_GPU_COMMANDS_COMPLETE, 0);
        if (sync) {
          this.pending.push(sync);
        } else if (!glCtx.isContextLost()) {
          this.dispose();
          throw new Error('Could not track completion of a rendered frame.');
        }
        glCtx.flush();
      }

      this.schedule();
    };

    this.channel.port1.onmessage = this.tick;
    document.addEventListener('visibilitychange', this.wake);
    gl.canvas.addEventListener('webglcontextlost', this.wake);
    gl.canvas.addEventListener('webglcontextrestored', this.wake);
  }

  /**
   * Start the render scheduler
   */
  start() {
    this.running = true;
    this.wake();
  }

  /**
   * Set dynamic FPS limit (e.g. 60, 120, 144, 240, or null for unlocked)
   * @param {number | null} maxFps
   */
  setFpsLimit(maxFps) {
    const interval = (maxFps !== null && Number.isFinite(maxFps) && maxFps > 0)
      ? 1000 / maxFps
      : 0;

    if (interval !== this.frameInterval) {
      this.frameInterval = interval;
      this.nextFrameTime = 0;
      this.clearFrameTimer();
      this.schedule();
    }
  }

  /**
   * Stop scheduler and clean up GPU resources and event listeners
   */
  dispose() {
    this.running = false;
    this.clearFrameTimer();
    this.clearPending();

    if (this.displayRequest !== null) {
      cancelAnimationFrame(this.displayRequest);
      this.displayRequest = null;
    }

    this.channel.port1.close();
    this.channel.port2.close();
    document.removeEventListener('visibilitychange', this.wake);
    this.gl.canvas.removeEventListener('webglcontextlost', this.wake);
    this.gl.canvas.removeEventListener('webglcontextrestored', this.wake);
  }

  /**
   * Whether scheduler is actively running and context is alive
   * @returns {boolean}
   */
  active() {
    return this.running && !document.hidden && !this.gl.isContextLost();
  }

  /**
   * Delete pending GPU sync fences
   */
  clearPending() {
    for (const sync of this.pending) {
      this.gl.deleteSync(sync);
    }
    this.pending.length = 0;
  }

  /**
   * Abort any scheduled timers or postTasks
   */
  clearFrameTimer() {
    if (this.frameTimer !== null) {
      clearTimeout(this.frameTimer);
      this.frameTimer = null;
    }
    if (this.frameTask) {
      this.frameTask.abort();
      this.frameTask = null;
    }
  }

  /**
   * Schedule the next frame tick
   */
  schedule() {
    if (this.queued || this.frameTimer !== null || this.frameTask !== null || !this.active()) {
      return;
    }

    if (this.frameInterval > 0) {
      const waitMs = Math.max(
        this.nextFrameTime - performance.now(),
        this.pending.length >= 2 ? 1 : 0
      );

      if (waitMs > 0) {
        const delay = Math.max(1, Math.floor(waitMs));
        if (globalThis.scheduler && globalThis.scheduler.postTask) {
          const ctrl = new AbortController();
          this.frameTask = ctrl;
          globalThis.scheduler
            .postTask(this.queueTick, { delay, signal: ctrl.signal })
            .catch((err) => {
              if (!ctrl.signal.aborted) throw err;
            });
        } else {
          this.frameTimer = setTimeout(this.queueTick, delay);
        }
        return;
      }
    }

    this.queueTick();
  }
}

// Backward-compatibility alias with original obfuscated symbol bC
export const bC = RenderClockScheduler;
export default RenderClockScheduler;
