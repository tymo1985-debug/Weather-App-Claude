/**
 * storage.js
 * ---------------------------------------------------------------------------
 * Persistence layer for the app. Small, frequently-read data (favorites,
 * settings, active city) stays in localStorage — it's synchronous and tiny.
 * Weather payloads are bigger and grow with every extra favorite city, so
 * they live in IndexedDB instead, with a localStorage fallback for browsers
 * or private-browsing modes where IndexedDB is unavailable.
 */

const STORAGE_KEYS = {
  FAVORITES: 'weatherApp.favorites',      // array of city objects
  ACTIVE_CITY: 'weatherApp.activeCityId', // id of the currently selected city
  CACHE_FALLBACK: 'weatherApp.cacheFallback.', // prefix used only if IndexedDB is unavailable
  SETTINGS: 'weatherApp.settings',        // theme, units, etc.
};

const DEFAULT_SECTION_ORDER = ['runner', 'chart', 'radar', 'hourly', 'daily', 'weekly', 'details'];

const DEFAULT_SETTINGS = {
  theme: 'auto',       // 'light' | 'dark' | 'auto'
  units: 'metric',     // 'metric' | 'imperial'
  windUnit: 'kmh',     // 'kmh' | 'ms' | 'mph'
  notificationsEnabled: false,
  runnerProfile: {
    heatTolerance: 'average', // 'sensitive' | 'average' | 'adapted'
    coldTolerance: 'average', // 'sensitive' | 'average' | 'adapted'
  },
  sectionOrder: DEFAULT_SECTION_ORDER.slice(),
  hiddenSections: [],
};

const DB_NAME = 'weatherAppDB';
const DB_VERSION = 1;
const STORE_NAME = 'weatherCache';

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

let dbPromise = null;
/** Opens (or creates) the single IndexedDB database used for weather caching. */
function openDB() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('IndexedDB unavailable'));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'cityId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function idbGet(cityId) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(cityId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  }));
}

function idbSet(record) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  }));
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

  /** Reorders favorites to match the given array of city ids (used by drag-and-drop). */
  reorderFavorites(orderedIds) {
    const favorites = this.getFavorites();
    const byId = new Map(favorites.map((c) => [c.id, c]));
    const reordered = orderedIds.map((id) => byId.get(id)).filter(Boolean);
    this.saveFavorites(reordered);
    return reordered;
  },

  /** Reads/writes which city the user last viewed, so we can restore it on launch. */
  getActiveCityId() {
    return localStorage.getItem(STORAGE_KEYS.ACTIVE_CITY);
  },
  setActiveCityId(cityId) {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_CITY, cityId);
  },

  /** Caches the last successfully fetched weather payload for a city, with a timestamp. */
  async cacheWeather(cityId, payload) {
    const record = { cityId, payload, cachedAt: Date.now() };
    try {
      await idbSet(record);
    } catch (err) {
      console.warn('IndexedDB write failed, falling back to localStorage', err);
      try {
        localStorage.setItem(STORAGE_KEYS.CACHE_FALLBACK + cityId, JSON.stringify(record));
      } catch (fallbackErr) {
        console.warn('localStorage cache fallback also failed (quota?):', fallbackErr);
      }
    }
  },

  /** Retrieves a cached payload (and its age in ms) for a city, or null if none exists. */
  async getCachedWeather(cityId) {
    try {
      const record = await idbGet(cityId);
      if (record) return { payload: record.payload, ageMs: Date.now() - record.cachedAt };
    } catch (err) {
      console.warn('IndexedDB read failed, falling back to localStorage', err);
    }
    const fallback = safeParse(localStorage.getItem(STORAGE_KEYS.CACHE_FALLBACK + cityId), null);
    if (!fallback) return null;
    return { payload: fallback.payload, ageMs: Date.now() - fallback.cachedAt };
  },

  /** Reads persisted settings, merged over defaults so new fields get sane values. */
  getSettings() {
    const merged = { ...DEFAULT_SETTINGS, ...safeParse(localStorage.getItem(STORAGE_KEYS.SETTINGS), {}) };
    const known = new Set(merged.sectionOrder);
    for (const id of DEFAULT_SECTION_ORDER) {
      if (!known.has(id)) merged.sectionOrder.push(id);
    }
    return merged;
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

  /** Timestamp (ms) of the last manual (pull-to-refresh / button) refresh, used to rate-limit it. */
  getLastManualRefreshAt() {
    return Number(sessionStorage.getItem('weatherApp.lastManualRefresh') || 0);
  },
  setLastManualRefreshAt(timeMs) {
    sessionStorage.setItem('weatherApp.lastManualRefresh', String(timeMs));
  },
};

