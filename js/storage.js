/**
 * storage.js
 * ---------------------------------------------------------------------------
 * Thin persistence layer built on top of localStorage.
 * Centralising all reads/writes here means the rest of the app never touches
 * localStorage directly, which makes it trivial to swap the backing store
 * later (e.g. IndexedDB) without touching UI or business logic code.
 */

const STORAGE_KEYS = {
  FAVORITES: 'weatherApp.favorites',      // array of city objects
  ACTIVE_CITY: 'weatherApp.activeCityId', // id of the currently selected city
  CACHE: 'weatherApp.cache.',             // prefix + cityId -> cached weather payload
  SETTINGS: 'weatherApp.settings',        // theme, units, etc.
};

const DEFAULT_SETTINGS = {
  theme: 'auto',       // 'light' | 'dark' | 'auto'
  units: 'metric',     // 'metric' | 'imperial'
  windUnit: 'kmh',     // 'kmh' | 'ms' | 'mph'
  notificationsEnabled: false,
  runnerProfile: {
    heatTolerance: 'average', // 'sensitive' | 'average' | 'adapted'
    coldTolerance: 'average', // 'sensitive' | 'average' | 'adapted'
  },
};

/** Safely parse JSON, returning a fallback value on any failure. */
function safeParse(raw, fallback) {
  if (raw === null || raw === undefined) return fallback;
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.warn('storage: failed to parse value, using fallback', err);
    return fallback;
  }
}

export const storage = {
  /** Returns the list of favorite cities, ordered as saved by the user. */
  getFavorites() {
    return safeParse(localStorage.getItem(STORAGE_KEYS.FAVORITES), []);
  },

  /** Persists the full favorites list (used after add/remove/reorder). */
  saveFavorites(favorites) {
    localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(favorites));
  },

  /** Adds a city to favorites if it isn't already present, returns the new list. */
  addFavorite(city) {
    const favorites = this.getFavorites();
    if (favorites.some((c) => c.id === city.id)) return favorites;
    const updated = [...favorites, city];
    this.saveFavorites(updated);
    return updated;
  },

  /** Removes a city by id, returns the new list. */
  removeFavorite(cityId) {
    const updated = this.getFavorites().filter((c) => c.id !== cityId);
    this.saveFavorites(updated);
    return updated;
  },

  /** Reads/writes which city the user last viewed, so we can restore it on launch. */
  getActiveCityId() {
    return localStorage.getItem(STORAGE_KEYS.ACTIVE_CITY);
  },
  setActiveCityId(cityId) {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_CITY, cityId);
  },

  /** Caches the last successfully fetched weather payload for a city, with a timestamp. */
  cacheWeather(cityId, payload) {
    const record = { payload, cachedAt: Date.now() };
    localStorage.setItem(STORAGE_KEYS.CACHE + cityId, JSON.stringify(record));
  },

  /** Retrieves a cached payload (and its age in ms) for a city, or null if none exists. */
  getCachedWeather(cityId) {
    const record = safeParse(localStorage.getItem(STORAGE_KEYS.CACHE + cityId), null);
    if (!record) return null;
    return { payload: record.payload, ageMs: Date.now() - record.cachedAt };
  },

  /** Reads persisted settings, merged over defaults so new fields get sane values. */
  getSettings() {
    return { ...DEFAULT_SETTINGS, ...safeParse(localStorage.getItem(STORAGE_KEYS.SETTINGS), {}) };
  },

  /** Merges and persists a partial settings update. */
  updateSettings(partial) {
    const merged = { ...this.getSettings(), ...partial };
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(merged));
    return merged;
  },

  /** Timestamp (ms) of the last deterioration-warning notification we fired, per city. */
  getLastNotifiedAt(cityId) {
    return Number(localStorage.getItem(`weatherApp.lastNotified.${cityId}`) || 0);
  },
  setLastNotifiedAt(cityId, timeMs) {
    localStorage.setItem(`weatherApp.lastNotified.${cityId}`, String(timeMs));
  },
};
