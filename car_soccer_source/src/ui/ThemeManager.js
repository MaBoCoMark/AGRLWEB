/**
 * ThemeManager.js
 * Centralized theme management for Car Soccer Engine.
 * 
 * Manages visual theme selection ("arcade" vs "realistic"),
 * localStorage persistence under "car-soccer.theme.v1",
 * document dataset attribute synchronization, and reactive listener callbacks.
 * 
 * Backward compatibility aliases:
 * - dl: THEMES
 * - Gh: DEFAULT_THEME
 * - I0: themeSettingsStore
 * - tr: getTheme
 * - qs: setTheme
 * - uo: onThemeChange
 * - L0: applyThemeToDocument
 */

import { createLocalStorageStore, stringOrDefault } from '../utils/StorageHelper.js';

export const THEMES = Object.freeze(["realistic", "arcade"]);
export const DEFAULT_THEME = "arcade";
export const THEME_STORAGE_KEY = "car-soccer.theme.v1";

export const themeSettingsStore = createLocalStorageStore(
  THEME_STORAGE_KEY,
  () => ({
    theme: DEFAULT_THEME
  }),
  (target, source) => {
    target.theme = stringOrDefault(source.theme, THEMES, target.theme);
  }
);

let activeTheme = themeSettingsStore.load().theme;
const themeListeners = new Set();

/**
 * Syncs the active theme to document.documentElement.dataset.theme
 */
export function applyThemeToDocument() {
  if (typeof document !== "undefined" && document.documentElement?.dataset) {
    document.documentElement.dataset.theme = activeTheme;
  }
}

// Initial application
applyThemeToDocument();

/**
 * Returns the currently active theme identifier ("arcade" | "realistic").
 * @returns {string}
 */
export function getTheme() {
  return activeTheme;
}

/**
 * Sets the active game theme.
 * @param {string} theme "arcade" or "realistic"
 * @param {Object} [options]
 * @param {boolean} [options.persist=true] Whether to persist to localStorage
 */
export function setTheme(theme, options = {}) {
  if (!THEMES.includes(theme)) return;
  const changed = theme !== activeTheme;
  activeTheme = theme;
  applyThemeToDocument();
  if (options.persist !== false) {
    themeSettingsStore.save({ theme });
  }
  if (changed) {
    for (const listener of themeListeners) {
      try {
        listener(theme);
      } catch (err) {
        console.error("[ThemeManager] listener threw error:", err);
      }
    }
  }
}

/**
 * Registers a listener for theme changes. The callback is called immediately with the current theme.
 * Returns an unsubscribe function.
 * @param {function(string): void} callback
 * @returns {function(): void}
 */
export function onThemeChange(callback) {
  themeListeners.add(callback);
  try {
    callback(activeTheme);
  } catch (err) {
    console.error("[ThemeManager] callback threw error:", err);
  }
  return () => {
    themeListeners.delete(callback);
  };
}

// Backward-compatibility aliases
export {
  THEMES as dl,
  DEFAULT_THEME as Gh,
  themeSettingsStore as I0,
  getTheme as tr,
  setTheme as qs,
  onThemeChange as uo,
  applyThemeToDocument as L0
};
