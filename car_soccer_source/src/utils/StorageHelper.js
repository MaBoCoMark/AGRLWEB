/**
 * StorageHelper.js
 * Robust LocalStorage typed persistence, validation, and migration utilities.
 */

/**
 * Safely retrieve a string from localStorage without throwing in restricted contexts.
 * @param {string} key
 * @returns {string|null}
 */
export function safeLocalStorageGet(key) {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

/**
 * Safely save a string to localStorage without throwing in restricted contexts.
 * @param {string} key
 * @param {string} value
 */
export function safeLocalStorageSet(key, value) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  } catch {}
}

/**
 * Safely remove a key from localStorage without throwing in restricted contexts.
 * @param {string} key
 */
export function safeLocalStorageRemove(key) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  } catch {}
}

/**
 * Check whether a value is a non-null plain object.
 * @param {any} val
 * @returns {boolean}
 */
export function isPlainObject(val) {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

/**
 * Validate or fallback a boolean value.
 * @param {any} val
 * @param {boolean} fallback
 * @returns {boolean}
 */
export function booleanOrDefault(val, fallback) {
  return typeof val === 'boolean' ? val : fallback;
}

/**
 * Validate or fallback a numeric value with optional constraints.
 * @param {any} val
 * @param {number} fallback
 * @param {{ min?: number, max?: number, integer?: boolean }} [constraints]
 * @returns {number}
 */
export function clampNumberOrDefault(val, fallback, constraints = {}) {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  let num = val;
  if (constraints.integer) num = Math.round(num);
  if (constraints.min !== undefined) num = Math.max(constraints.min, num);
  if (constraints.max !== undefined) num = Math.min(constraints.max, num);
  return num;
}

/**
 * Validate a string value against an allowed set, returning fallback if not found.
 * @param {any} val
 * @param {string[]|Set<string>} allowed
 * @param {string} fallback
 * @returns {string}
 */
export function stringOrDefault(val, allowed, fallback) {
  if (typeof val === 'string') {
    if (Array.isArray(allowed) && allowed.includes(val)) return val;
    if (allowed instanceof Set && allowed.has(val)) return val;
  }
  return fallback;
}

/**
 * Validate and slice an array.
 * @param {any} val
 * @param {(item: any) => boolean} filterFn
 * @param {number} maxLen
 * @returns {any[]|null}
 */
export function filterArraySlice(val, filterFn, maxLen) {
  return Array.isArray(val) ? val.filter(filterFn).slice(0, maxLen) : null;
}

/**
 * Factory creating a type-safe localStorage store with JSON migration.
 * @template T
 * @param {string} key
 * @param {() => T} defaultFactory
 * @param {(target: T, loaded: any) => void} [migrateFn]
 */
export function createLocalStorageStore(key, defaultFactory, migrateFn) {
  const load = () => {
    const defaults = defaultFactory();
    const raw = safeLocalStorageGet(key);
    if (!raw) return defaults;
    try {
      const parsed = JSON.parse(raw);
      if (isPlainObject(parsed)) {
        if (migrateFn) {
          migrateFn(defaults, parsed);
        } else {
          Object.assign(defaults, parsed);
        }
        return defaults;
      }
      return defaultFactory();
    } catch {
      return defaultFactory();
    }
  };

  return {
    key,
    defaults: defaultFactory,
    load,
    loadInto(target) {
      return Object.assign(target, load());
    },
    save(data) {
      try {
        safeLocalStorageSet(key, JSON.stringify(data));
      } catch {}
    },
    clear() {
      try {
        safeLocalStorageRemove(key);
      } catch {}
    }
  };
}

// Backward-compatibility aliases with original obfuscated symbols
export const wC = safeLocalStorageGet;
export const rr = createLocalStorageStore;
export const Dr = isPlainObject;
export const jr = booleanOrDefault;
export const _r = clampNumberOrDefault;
export const cl = stringOrDefault;
export const MC = filterArraySlice;
