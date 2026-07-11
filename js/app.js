/**
 * app.js
 * ---------------------------------------------------------------------------
 * Application entry point. Wires together storage, geocoding, the weather
 * provider and the runner engine, and drives all UI rendering. Kept as a
 * single orchestrator so the data/UI modules stay independently testable.
 */

import { storage } from './storage.js';
import { searchCities, reverseGeocode, getDeviceLocation } from './geocoding.js';
import { weatherProvider } from './weather-api.js';
import { runnerEngine } from './runner-engine.js';
import * as ui from './ui.js';

const state = {
  favorites: [],
  activeCity: null,
  weather: null,     // normalized payload for the active city
  isOffline: false,
};

const $ = (id) => document.getElementById(id);

/* ============================== INITIALIZATION ============================== */

async function init() {
  registerServiceWorker();
  wireEvents();

  const settings = storage.getSettings();
  ui.applyTheme(settings.theme === 'auto' ? 'light' : settings.theme); // provisional, refined after first fetch

  state.favorites = storage.getFavorites();

  const savedActiveId = storage.getActiveCityId();
  let startCity = state.favorites.find((c) => c.id === savedActiveId);

  if (!startCity && state.favorites.length) {
    startCity = state.favorites[0];
  }

  if (!startCity) {
    // First launch: try to detect the device location automatically.
    startCity = await detectStartCity();
  }

  if (startCity) {
    await selectCity(startCity, { addIfMissing: true });
  } else {
    ui.showStatusBanner('Не удалось определить местоположение. Найдите город вручную.', 'warn');
  }
}

async function detectStartCity() {
  try {
    ui.showStatusBanner('Определяем ваше местоположение…', 'info');
    const coords = await getDeviceLocation();
    const city = await reverseGeocode(coords.latitude, coords.longitude);
    ui.hideStatusBanner();
    return city;
  } catch (err) {
    console.warn('Geolocation unavailable:', err);
    ui.hideStatusBanner();
    return null;
  }
}

/* ============================== CITY SELECTION & FETCHING ============================== */

async function selectCity(city, { addIfMissing = false } = {}) {
  state.activeCity = city;
  storage.setActiveCityId(city.id);

  if (addIfMissing && !state.favorites.some((c) => c.id === city.id)) {
    state.favorites = storage.addFavorite(city);
  }

  ui.renderCityTabs(state.favorites, city.id, (c) => selectCity(c));
  renderFromCache(city); // show something instantly if we have it
  await refreshWeather(city);
}

function renderFromCache(city) {
  const cached = storage.getCachedWeather(city.id);
  if (cached) {
    state.weather = cached.payload;
    renderAll();
    if (cached.ageMs > 30 * 60 * 1000) {
      ui.showStatusBanner('Показаны сохранённые данные, обновляем…', 'info');
    }
  }
}

async function refreshWeather(city) {
  try {
    const payload = await weatherProvider.fetchWeather(city.latitude, city.longitude);
    state.weather = payload;
    state.isOffline = false;
    storage.cacheWeather(city.id, payload);
    ui.hideStatusBanner();
    renderAll();
  } catch (err) {
    console.warn('Weather fetch failed, falling back to cache:', err);
    state.isOffline = true;
    const cached = storage.getCachedWeather(city.id);
    if (cached) {
      state.weather = cached.payload;
      renderAll();
      const minutes = Math.round(cached.ageMs / 60000);
      ui.showStatusBanner(`Нет соединения. Данные от ${minutes} мин назад.`, 'warn');
    } else {
      ui.showStatusBanner('Нет соединения и нет сохранённых данных для этого города.', 'error');
    }
  }
}

/* ============================== RENDERING ORCHESTRATION ============================== */

function renderAll() {
  if (!state.weather || !state.activeCity) return;
  const { current, hourly, daily } = state.weather;
  const dailyToday = daily[0];

  applyResolvedTheme(dailyToday);

  ui.renderHero(state.activeCity, current, dailyToday);
  ui.renderHourly(hourly);
  ui.renderDaily(daily);
  ui.renderDetailsGrid(current, dailyToday);
  ui.startWeatherAnimation(current.weather_code);

  const currentHourRow = runnerEngine.findCurrentHourRow(hourly);
  const timeline = runnerEngine.buildComfortTimeline(hourly);
  const nowIndex = timeline.findIndex((seg) => seg.time === currentHourRow.time);
  ui.renderRunnerTimeline(timeline, Math.max(0, nowIndex));

  const recommendations = runnerEngine.generateRecommendations(currentHourRow, hourly, dailyToday);
  ui.renderRunnerRecommendations(recommendations);

  const warning = runnerEngine.checkDeteriorationWarning(hourly);
  ui.renderRunnerWarning(warning);
}

function applyResolvedTheme(dailyToday) {
  const settings = storage.getSettings();
  if (settings.theme !== 'auto') {
    ui.applyTheme(settings.theme);
    return;
  }
  const resolved = ui.resolveAutoTheme(dailyToday?.sunrise, dailyToday?.sunset);
  ui.applyTheme(resolved);
}

/* ============================== EVENT WIRING ============================== */

function wireEvents() {
  $('theme-btn').addEventListener('click', cycleTheme);
  $('search-btn').addEventListener('click', openSearch);
  $('search-close').addEventListener('click', closeSearch);
  $('menu-btn').addEventListener('click', openDrawer);
  $('drawer-add-btn').addEventListener('click', () => { closeDrawer(); openSearch(); });
  $('use-location-btn').addEventListener('click', useDeviceLocation);

  let searchDebounce;
  $('search-input').addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    const query = e.target.value;
    searchDebounce = setTimeout(() => runSearch(query), 300);
  });

  // Tapping outside the panel closes the overlay.
  $('search-overlay').addEventListener('click', (e) => { if (e.target.id === 'search-overlay') closeSearch(); });
  $('drawer-overlay').addEventListener('click', (e) => { if (e.target.id === 'drawer-overlay') closeDrawer(); });

  // Periodically refresh in the background so data stays fresh while the app is open.
  setInterval(() => { if (state.activeCity && navigator.onLine) refreshWeather(state.activeCity); }, 15 * 60 * 1000);
  window.addEventListener('online', () => { if (state.activeCity) refreshWeather(state.activeCity); });
}

function cycleTheme() {
  const settings = storage.getSettings();
  const order = ['auto', 'light', 'dark'];
  const next = order[(order.indexOf(settings.theme) + 1) % order.length];
  storage.updateSettings({ theme: next });
  ui.showStatusBanner(`Тема: ${{ auto: 'Автоматически', light: 'Светлая', dark: 'Тёмная' }[next]}`, 'info');
  setTimeout(ui.hideStatusBanner, 1500);
  if (state.weather) applyResolvedTheme(state.weather.daily[0]);
}

function openSearch() {
  $('search-overlay').classList.remove('hidden');
  $('search-input').value = '';
  $('search-results').innerHTML = '';
  setTimeout(() => $('search-input').focus(), 50);
}
function closeSearch() {
  $('search-overlay').classList.add('hidden');
}

function openDrawer() {
  ui.renderFavoritesList(state.favorites, state.activeCity?.id, (city) => { selectCity(city); closeDrawer(); }, removeFavorite);
  $('drawer-overlay').classList.remove('hidden');
}
function closeDrawer() {
  $('drawer-overlay').classList.add('hidden');
}

function removeFavorite(city) {
  state.favorites = storage.removeFavorite(city.id);
  ui.renderFavoritesList(state.favorites, state.activeCity?.id, (c) => { selectCity(c); closeDrawer(); }, removeFavorite);
  ui.renderCityTabs(state.favorites, state.activeCity?.id, (c) => selectCity(c));
}

async function runSearch(query) {
  if (!query || query.trim().length < 2) { $('search-results').innerHTML = ''; return; }
  try {
    const results = await searchCities(query);
    ui.renderSearchResults(results, (city) => {
      selectCity(city, { addIfMissing: true });
      closeSearch();
    });
  } catch (err) {
    console.warn('City search failed:', err);
  }
}

async function useDeviceLocation() {
  try {
    ui.showStatusBanner('Определяем местоположение…', 'info');
    const coords = await getDeviceLocation();
    const city = await reverseGeocode(coords.latitude, coords.longitude);
    ui.hideStatusBanner();
    await selectCity(city, { addIfMissing: true });
    closeSearch();
  } catch (err) {
    ui.showStatusBanner('Не удалось получить местоположение. Проверьте разрешения браузера.', 'error');
  }
}

/* ============================== SERVICE WORKER ============================== */

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}

init();
