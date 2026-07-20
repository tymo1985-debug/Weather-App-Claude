/**
 * app.js
 * ---------------------------------------------------------------------------
 * Application entry point. Wires together storage, geocoding, the weather
 * provider and the runner engine, and drives all UI rendering. Kept as a
 * single orchestrator so the data/UI modules stay independently testable.
 */

import { storage } from './storage.js';
import { weatherProvider } from './weather-api.js';
import { runnerEngine } from './runner-engine.js';
import { UNIT_LABELS } from './units.js';
import { LANGUAGES } from './i18n.js';
import { recordRunFeedback, suggestProfileAdjustment } from './calibration.js';
import * as ui from './ui.js';

const state = {
  favorites: [],
  activeCity: null,
  weather: null,     // normalized payload for the active city
  isOffline: false,
  hasRenderedOnce: false,
  lastRecommendation: null, // populated each renderAll(), used by the share card and feedback buttons
  radar: { meta: null, index: 0, playing: false, timerId: null },
};

const $ = (id) => document.getElementById(id);
const MANUAL_REFRESH_COOLDOWN_MS = 60 * 1000;
let deferredInstallPrompt = null;

// Chrome/Android fires this instead of showing its own banner once the PWA
// install criteria are met; we stash the event and show our own button so
// installing isn't left to chance/timing of the browser's default banner.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  $('install-btn').classList.remove('hidden');
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  $('install-btn').classList.add('hidden');
});

async function promptInstall() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  $('install-btn').classList.add('hidden');
}

/** Fires a short vibration if the device supports it; silently no-ops otherwise. */
function haptic(pattern = 12) {
  if ('vibrate' in navigator) navigator.vibrate(pattern);
}

/* ============================== INITIALIZATION ============================== */

async function init() {
  registerServiceWorker();
  wireEvents();
  wirePullToRefresh();
  wireSwipeBetweenCities();

  const settings = storage.getSettings();
  ui.applyTheme(settings.theme === 'auto' ? 'light' : settings.theme); // provisional, refined after first fetch
  ui.setNotificationButtonState(settings.notificationsEnabled && 'Notification' in window && Notification.permission === 'granted');
  updateUnitButtons(settings);
  applyDensity(settings.density);
  ui.applyStaticTranslations(settings.language);

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

  window.addEventListener('online', () => {
    ui.setRefreshButtonState({ offline: false });
    if (state.activeCity) refreshWeather(state.activeCity);
  });
  window.addEventListener('offline', () => ui.setRefreshButtonState({ offline: true }));
}

async function detectStartCity() {
  try {
    ui.showStatusBanner('Определяем ваше местоположение…', 'info');
    // Geocoding is only needed for search/geolocation, so it's loaded on demand
    // to keep the very first paint of the app as light as possible.
    const { getDeviceLocation, reverseGeocode } = await import('./geocoding.js');
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
  await renderFromCache(city); // show something instantly if we have it
  await refreshWeather(city);
  loadRadar();
  loadModelAgreement(city);
  loadMeteoAlarm(city);
}

async function renderFromCache(city) {
  const cached = await storage.getCachedWeather(city.id);
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
    ui.setRefreshButtonState({ offline: false });
    await storage.cacheWeather(city.id, payload);
    ui.hideStatusBanner();
    renderAll();
  } catch (err) {
    console.warn('Weather fetch failed, falling back to cache:', err);
    state.isOffline = true;
    ui.setRefreshButtonState({ offline: true });
    const cached = await storage.getCachedWeather(city.id);
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

/**
 * Manually triggered refresh (button tap or pull-to-refresh), rate-limited so
 * an impatient user tapping repeatedly can't hammer the free Open-Meteo API.
 */
async function manualRefresh() {
  if (!state.activeCity) return;
  const last = storage.getLastManualRefreshAt();
  if (Date.now() - last < MANUAL_REFRESH_COOLDOWN_MS) {
    ui.showStatusBanner('Уже обновлено недавно — попробуйте через минуту.', 'info');
    setTimeout(ui.hideStatusBanner, 1800);
    return;
  }
  if (!navigator.onLine) {
    ui.showStatusBanner('Нет соединения с интернетом.', 'warn');
    return;
  }
  storage.setLastManualRefreshAt(Date.now());
  haptic(10);
  ui.setRefreshButtonState({ spinning: true });
  await refreshWeather(state.activeCity);
  ui.setRefreshButtonState({ spinning: false });
}

/* ============================== RENDERING ORCHESTRATION ============================== */

/** Runs a render step in isolation so one bad data field can't blank the whole screen. */
function safeRender(label, fn) {
  try {
    fn();
  } catch (err) {
    console.error(`Render step "${label}" failed:`, err);
  }
}

function renderAll() {
  if (!state.weather || !state.activeCity) return;
  const { current, hourly, daily } = state.weather;
  const dailyToday = daily[0];
  const settings = storage.getSettings();
  const profile = settings.runnerProfile;
  const currentHourRow = runnerEngine.findCurrentHourRow(hourly);

  safeRender('theme', () => applyResolvedTheme(dailyToday));
  safeRender('layout', () => ui.applyLayout(settings.sectionOrder, settings.hiddenSections));
  safeRender('hero', () => ui.renderHero(state.activeCity, current, dailyToday, settings));
  safeRender('nowcast', () => ui.renderNowcast(runnerEngine.estimatePrecipitationNowcast(state.weather.minutely15)));
  safeRender('chart', () => ui.renderTemperatureChart(hourly));
  safeRender('hourly', () => ui.renderHourly(hourly, settings));
  safeRender('daily', () => ui.renderDaily(daily, settings));
  safeRender('weekly-trend', () => ui.renderWeeklyTrend(runnerEngine.buildWeeklyTrend(daily, profile), settings));
  safeRender('details', () => ui.renderDetailsGrid(current, dailyToday, currentHourRow, settings));
  safeRender('bg-animation', () => ui.startWeatherAnimation(current.weather_code));
  safeRender('profile-chips', () => ui.renderProfileChips(profile));

  safeRender('runner-timeline', () => {
    const timeline = runnerEngine.buildComfortTimeline(hourly, profile);
    const nowIndex = timeline.findIndex((seg) => seg.time === currentHourRow.time);
    ui.renderRunnerTimeline(timeline, Math.max(0, nowIndex));
    ui.renderBestWindow(runnerEngine.findBestWindow(timeline, 2, { sunrise: dailyToday?.sunrise, sunset: dailyToday?.sunset }));
  });

  safeRender('runner-recommendations', () => {
    const recommendations = runnerEngine.generateRecommendations(currentHourRow, hourly, dailyToday, profile);
    state.lastRecommendation = recommendations;
    ui.renderRunnerRecommendations(recommendations, settings.language);
  });

  safeRender('runner-warning', () => {
    const warning = runnerEngine.checkDeteriorationWarning(hourly, 6, profile);
    ui.renderRunnerWarning(warning);
    maybeNotifyDeterioration(warning);
  });

  safeRender('morning-digest', () => maybeSendMorningDigest());
  safeRender('planned-workout', () => { renderPlannedWorkoutNote(); maybeSendEveningPlanNotification(); });

  if (!state.hasRenderedOnce) {
    state.hasRenderedOnce = true;
    ui.hideSkeletons();
  }

  safeRender('climate-norm', () => loadClimateNorm(dailyToday));
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
  $('install-btn').addEventListener('click', promptInstall);
  $('layout-btn').addEventListener('click', openLayoutPanel);
  $('layout-close').addEventListener('click', closeLayoutPanel);
  $('density-btn').addEventListener('click', cycleDensity);
  $('refresh-btn').addEventListener('click', manualRefresh);
  $('notify-btn').addEventListener('click', toggleNotifications);
  $('heat-profile-btn').addEventListener('click', () => cycleProfile('heatTolerance'));
  $('cold-profile-btn').addEventListener('click', () => cycleProfile('coldTolerance'));
  $('units-btn').addEventListener('click', cycleTempUnit);
  $('wind-unit-btn').addEventListener('click', cycleWindUnit);
  $('quiet-hours-btn').addEventListener('click', cycleQuietHours);
  $('data-saver-btn').addEventListener('click', cycleDataSaver);
  $('language-btn').addEventListener('click', cycleLanguage);
  $('use-location-btn').addEventListener('click', useDeviceLocation);
  $('radar-play-btn').addEventListener('click', toggleRadarPlayback);
  $('share-btn').addEventListener('click', shareCard);
  $('plan-workout-btn').addEventListener('click', openPlanOverlay);
  $('plan-close').addEventListener('click', closePlanOverlay);
  $('plan-cancel-btn').addEventListener('click', cancelPlannedWorkout);
  $('plan-type-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-type]');
    if (btn) savePlannedWorkout(btn.dataset.type, btn.dataset.label);
  });
  $('feedback-buttons').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-feeling]');
    if (btn) recordFeedback(btn.dataset.feeling);
  });

  let searchDebounce;
  $('search-input').addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    const query = e.target.value;
    searchDebounce = setTimeout(() => runSearch(query), 300);
  });

  // Tapping outside the panel closes the overlay.
  $('search-overlay').addEventListener('click', (e) => { if (e.target.id === 'search-overlay') closeSearch(); });
  $('drawer-overlay').addEventListener('click', (e) => { if (e.target.id === 'drawer-overlay') closeDrawer(); });
  $('layout-overlay').addEventListener('click', (e) => { if (e.target.id === 'layout-overlay') closeLayoutPanel(); });
  $('plan-overlay').addEventListener('click', (e) => { if (e.target.id === 'plan-overlay') closePlanOverlay(); });

  // Periodically refresh in the background so data stays fresh while the app is open.
  setInterval(() => { if (state.activeCity && navigator.onLine) refreshWeather(state.activeCity); }, 15 * 60 * 1000);
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

function applyDensity(density) {
  document.body.classList.toggle('density-compact', density === 'compact');
  $('density-value').textContent = density === 'compact' ? 'Компактно' : 'Просторно';
}

function cycleDensity() {
  const settings = storage.getSettings();
  const next = settings.density === 'compact' ? 'comfortable' : 'compact';
  const updated = storage.updateSettings({ density: next });
  applyDensity(updated.density);
  haptic(8);
}

function openLayoutPanel() {
  const settings = storage.getSettings();
  ui.renderLayoutList(settings.sectionOrder, settings.hiddenSections, moveSection, toggleSectionHidden);
  $('layout-overlay').classList.remove('hidden');
}
function closeLayoutPanel() {
  $('layout-overlay').classList.add('hidden');
}

function moveSection(id, direction) {
  const settings = storage.getSettings();
  const order = [...settings.sectionOrder];
  const idx = order.indexOf(id);
  const newIdx = idx + direction;
  if (idx === -1 || newIdx < 0 || newIdx >= order.length) return;
  [order[idx], order[newIdx]] = [order[newIdx], order[idx]];
  const updated = storage.updateSettings({ sectionOrder: order });
  haptic(6);
  ui.applyLayout(updated.sectionOrder, updated.hiddenSections);
  ui.renderLayoutList(updated.sectionOrder, updated.hiddenSections, moveSection, toggleSectionHidden);
}

function toggleSectionHidden(id) {
  const settings = storage.getSettings();
  const hidden = settings.hiddenSections.includes(id)
    ? settings.hiddenSections.filter((h) => h !== id)
    : [...settings.hiddenSections, id];
  const updated = storage.updateSettings({ hiddenSections: hidden });
  haptic(6);
  ui.applyLayout(updated.sectionOrder, updated.hiddenSections);
  ui.renderLayoutList(updated.sectionOrder, updated.hiddenSections, moveSection, toggleSectionHidden);
}

function openDrawer() {
  ui.renderFavoritesList(
    state.favorites, state.activeCity?.id,
    (city) => { selectCity(city); closeDrawer(); },
    removeFavorite,
    reorderFavorites
  );
  $('drawer-overlay').classList.remove('hidden');
}
function closeDrawer() {
  $('drawer-overlay').classList.add('hidden');
}

function refreshDrawerAndTabs() {
  ui.renderFavoritesList(
    state.favorites, state.activeCity?.id,
    (c) => { selectCity(c); closeDrawer(); },
    removeFavorite,
    reorderFavorites
  );
  ui.renderCityTabs(state.favorites, state.activeCity?.id, (c) => selectCity(c));
}

function removeFavorite(city) {
  state.favorites = storage.removeFavorite(city.id);
  haptic(8);
  refreshDrawerAndTabs();
}

function reorderFavorites(orderedIds) {
  state.favorites = storage.reorderFavorites(orderedIds);
  haptic(8);
  refreshDrawerAndTabs();
}

async function runSearch(query) {
  if (!query || query.trim().length < 2) { $('search-results').innerHTML = ''; return; }
  try {
    const { searchCities } = await import('./geocoding.js');
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
    const { getDeviceLocation, reverseGeocode } = await import('./geocoding.js');
    const coords = await getDeviceLocation();
    const city = await reverseGeocode(coords.latitude, coords.longitude);
    ui.hideStatusBanner();
    await selectCity(city, { addIfMissing: true });
    closeSearch();
  } catch (err) {
    ui.showStatusBanner('Не удалось получить местоположение. Проверьте разрешения браузера.', 'error');
  }
}

function cycleProfile(kind) {
  const settings = storage.getSettings();
  const nextValue = ui.nextTolerance(settings.runnerProfile[kind]);
  const runnerProfile = { ...settings.runnerProfile, [kind]: nextValue };
  storage.updateSettings({ runnerProfile });
  haptic(8);
  if (state.weather) renderAll(); // recompute scores/recommendations with the new profile
}

function updateUnitButtons(settings) {
  $('units-value').textContent = UNIT_LABELS.units[settings.units];
  $('wind-unit-value').textContent = UNIT_LABELS.windUnit[settings.windUnit];
  $('quiet-hours-value').textContent = settings.quietHours.enabled
    ? `${String(settings.quietHours.start).padStart(2, '0')}:00–${String(settings.quietHours.end).padStart(2, '0')}:00`
    : 'Выкл';
  $('data-saver-value').textContent = settings.dataSaverRadar ? 'Радар: Wi-Fi' : 'Радар: всегда';
}

const QUIET_HOURS_PRESETS = [
  { enabled: false, start: 22, end: 7 },
  { enabled: true, start: 22, end: 7 },
  { enabled: true, start: 23, end: 6 },
];

function cycleLanguage() {
  const settings = storage.getSettings();
  const next = LANGUAGES[(LANGUAGES.indexOf(settings.language) + 1) % LANGUAGES.length];
  const updated = storage.updateSettings({ language: next });
  ui.applyStaticTranslations(updated.language);
  haptic(8);
  if (state.weather) renderAll();
}

function cycleQuietHours() {
  const settings = storage.getSettings();
  const currentIdx = QUIET_HOURS_PRESETS.findIndex(
    (p) => p.enabled === settings.quietHours.enabled && p.start === settings.quietHours.start && p.end === settings.quietHours.end
  );
  const next = QUIET_HOURS_PRESETS[(Math.max(0, currentIdx) + 1) % QUIET_HOURS_PRESETS.length];
  const updated = storage.updateSettings({ quietHours: next });
  updateUnitButtons(updated);
  haptic(8);
}

function cycleDataSaver() {
  const settings = storage.getSettings();
  const updated = storage.updateSettings({ dataSaverRadar: !settings.dataSaverRadar });
  updateUnitButtons(updated);
  haptic(8);
  if (state.activeCity) loadRadar(); // re-evaluate immediately with the new preference
}

/** True during the user's configured quiet hours (handles windows that wrap past midnight). */
function isQuietHours(settings) {
  if (!settings.quietHours.enabled) return false;
  const hour = new Date().getHours();
  const { start, end } = settings.quietHours;
  return start > end ? (hour >= start || hour < end) : (hour >= start && hour < end);
}

function cycleTempUnit() {
  const settings = storage.getSettings();
  const next = settings.units === 'metric' ? 'imperial' : 'metric';
  const updated = storage.updateSettings({ units: next });
  updateUnitButtons(updated);
  haptic(8);
  if (state.weather) renderAll();
}

function cycleWindUnit() {
  const settings = storage.getSettings();
  const order = ['kmh', 'ms', 'mph'];
  const next = order[(order.indexOf(settings.windUnit) + 1) % order.length];
  const updated = storage.updateSettings({ windUnit: next });
  updateUnitButtons(updated);
  haptic(8);
  if (state.weather) renderAll();
}

async function toggleNotifications() {
  const settings = storage.getSettings();
  if (!settings.notificationsEnabled) {
    if (!('Notification' in window)) {
      ui.showStatusBanner('Уведомления не поддерживаются этим браузером.', 'warn');
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      ui.showStatusBanner('Разрешение на уведомления не получено.', 'warn');
      return;
    }
    storage.updateSettings({ notificationsEnabled: true });
    ui.setNotificationButtonState(true);
    ui.showStatusBanner('Уведомления об ухудшении погоды включены.', 'info');
    setTimeout(ui.hideStatusBanner, 2000);
  } else {
    storage.updateSettings({ notificationsEnabled: false });
    ui.setNotificationButtonState(false);
  }
  haptic(8);
}

/**
 * Fires a local notification when the forecast is about to deteriorate,
 * throttled to once per hour per city so refresh cycles don't spam the user.
 */
async function maybeNotifyDeterioration(warning) {
  if (!warning || !state.activeCity) return;
  const settings = storage.getSettings();
  if (!settings.notificationsEnabled || !('Notification' in window) || Notification.permission !== 'granted') return;
  if (isQuietHours(settings)) return;

  const cooldownMs = 60 * 60 * 1000;
  const lastNotified = storage.getLastNotifiedAt(state.activeCity.id);
  if (Date.now() - lastNotified < cooldownMs) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification('Погода для бегуна', {
      body: warning.message,
      icon: 'icons/icon.svg',
      tag: 'weather-deterioration',
    });
    storage.setLastNotifiedAt(state.activeCity.id, Date.now());
  } catch (err) {
    console.warn('Failed to show notification:', err);
  }
}

/* ============================== PULL-TO-REFRESH ============================== */

function wirePullToRefresh() {
  const main = $('main-content');
  let startY = null;
  let pulling = false;
  const threshold = 70;

  main.addEventListener('touchstart', (e) => {
    if (main.scrollTop <= 0) {
      startY = e.touches[0].clientY;
      pulling = true;
    }
  }, { passive: true });

  main.addEventListener('touchmove', (e) => {
    if (!pulling || startY === null) return;
    const delta = e.touches[0].clientY - startY;
    if (delta > 0 && main.scrollTop <= 0) {
      ui.setPullIndicator(Math.min(1, delta / threshold));
    }
  }, { passive: true });

  main.addEventListener('touchend', (e) => {
    if (!pulling || startY === null) return;
    const delta = (e.changedTouches[0]?.clientY ?? startY) - startY;
    pulling = false;
    startY = null;
    if (delta > threshold) {
      ui.setPullIndicator(1, true);
      manualRefresh().finally(() => ui.setPullIndicator(0));
    } else {
      ui.setPullIndicator(0);
    }
  });
}

/* ============================== SWIPE BETWEEN CITIES ============================== */

function wireSwipeBetweenCities() {
  const hero = $('hero-card');
  let startX = null;
  let startY = null;

  hero.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  hero.addEventListener('touchend', (e) => {
    if (startX === null) return;
    const dx = (e.changedTouches[0]?.clientX ?? startX) - startX;
    const dy = (e.changedTouches[0]?.clientY ?? startY) - startY;
    startX = null;
    // Require a mostly-horizontal swipe so vertical scrolling isn't hijacked.
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (!state.favorites.length || !state.activeCity) return;

    const idx = state.favorites.findIndex((c) => c.id === state.activeCity.id);
    if (idx === -1) return;
    const nextIdx = dx < 0
      ? (idx + 1) % state.favorites.length
      : (idx - 1 + state.favorites.length) % state.favorites.length;
    haptic(10);
    selectCity(state.favorites[nextIdx]);
  });
}

async function loadModelAgreement(city) {
  try {
    const { checkModelAgreement } = await import('./ensemble.js');
    const agreement = await checkModelAgreement(city.latitude, city.longitude);
    ui.renderModelAgreement(agreement);
  } catch (err) {
    console.warn('Model agreement check unavailable:', err);
    ui.renderModelAgreement(null);
  }
}

async function loadMeteoAlarm(city) {
  try {
    const { fetchMeteoAlarmWarnings } = await import('./meteoalarm.js');
    const warnings = await fetchMeteoAlarmWarnings(city.country);
    ui.renderMeteoAlarmWarnings(warnings);
  } catch (err) {
    console.warn('MeteoAlarm unavailable:', err);
    ui.renderMeteoAlarmWarnings(null);
  }
}

/* ============================== CLIMATE NORM ============================== */

async function loadClimateNorm(dailyToday) {
  if (!state.activeCity || !dailyToday) return;
  const { climateNormCacheKey } = await import('./climate.js');
  const mmdd = climateNormCacheKey();
  const cached = storage.getClimateNorm(state.activeCity.id, mmdd);
  if (cached) {
    ui.renderClimateNorm(cached, dailyToday.temperature_2m_max, storage.getSettings());
    return;
  }
  try {
    const { fetchClimateNorm } = await import('./climate.js');
    const norm = await fetchClimateNorm(state.activeCity.latitude, state.activeCity.longitude);
    if (norm) {
      storage.setClimateNorm(state.activeCity.id, mmdd, norm);
      ui.renderClimateNorm(norm, dailyToday.temperature_2m_max, storage.getSettings());
    }
  } catch (err) {
    console.warn('Climate norm unavailable:', err);
  }
}



async function loadRadar(forceLoad = false) {
  if (!state.activeCity) return;
  stopRadarPlayback();

  const settings = storage.getSettings();
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const onCellularOrSaveData = connection && (connection.saveData || connection.type === 'cellular');
  if (!forceLoad && settings.dataSaverRadar && onCellularOrSaveData) {
    ui.renderRadarTimeLabel('Пропущено (мобильный интернет) — тапните ▶');
    state.radar.meta = null;
    return;
  }

  try {
    const { fetchRadarFrames, drawRadarFrame, formatFrameTime } = await import('./radar.js');
    const meta = await fetchRadarFrames();
    state.radar.meta = meta;
    state.radar.index = meta.frames.length - 1; // start on the most recent frame
    const canvas = $('radar-canvas');
    await drawRadarFrame(canvas, meta, state.radar.index, state.activeCity);
    ui.renderRadarTimeLabel(formatFrameTime(meta, state.radar.index));
  } catch (err) {
    console.warn('Radar unavailable:', err);
    ui.renderRadarTimeLabel('Радар недоступен');
  }
}

function toggleRadarPlayback() {
  if (state.radar.playing) {
    stopRadarPlayback();
    return;
  }
  if (!state.radar.meta) {
    loadRadar(true); // user tapped play explicitly — load even if data-saver skipped it
    return;
  }
  state.radar.playing = true;
  ui.setRadarPlayButtonState(true);
  state.radar.timerId = setInterval(async () => {
    const { frames } = state.radar.meta;
    state.radar.index = (state.radar.index + 1) % frames.length;
    const { drawRadarFrame, formatFrameTime } = await import('./radar.js');
    await drawRadarFrame($('radar-canvas'), state.radar.meta, state.radar.index, state.activeCity);
    ui.renderRadarTimeLabel(formatFrameTime(state.radar.meta, state.radar.index));
  }, 500);
}

function stopRadarPlayback() {
  if (state.radar.timerId) clearInterval(state.radar.timerId);
  state.radar.timerId = null;
  state.radar.playing = false;
  ui.setRadarPlayButtonState(false);
}

/* ============================== PLANNED WORKOUT ============================== */

function tomorrowDateStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function openPlanOverlay() {
  const plan = storage.getPlannedWorkout();
  const isActivePlan = plan && plan.cityId === state.activeCity?.id && plan.forDate === tomorrowDateStr();
  document.querySelectorAll('#plan-type-grid button').forEach((btn) => {
    btn.classList.toggle('selected', isActivePlan && btn.dataset.type === plan.type);
  });
  $('plan-cancel-btn').classList.toggle('hidden', !isActivePlan);
  $('plan-overlay').classList.remove('hidden');
}
function closePlanOverlay() {
  $('plan-overlay').classList.add('hidden');
}

function savePlannedWorkout(type, label) {
  if (!state.activeCity) return;
  storage.setPlannedWorkout({
    type, typeLabel: label,
    cityId: state.activeCity.id,
    cityName: state.activeCity.name,
    forDate: tomorrowDateStr(),
    notifiedAt: null,
  });
  haptic(10);
  closePlanOverlay();
  renderPlannedWorkoutNote();
  ui.showStatusBanner(`Запланировано: ${label} на завтра в ${state.activeCity.name}.`, 'info');
  setTimeout(ui.hideStatusBanner, 2500);
}

function cancelPlannedWorkout() {
  storage.clearPlannedWorkout();
  haptic(8);
  closePlanOverlay();
  renderPlannedWorkoutNote();
}

function renderPlannedWorkoutNote() {
  const el = $('planned-workout-note');
  const plan = storage.getPlannedWorkout();
  const isActivePlan = plan && plan.cityId === state.activeCity?.id && plan.forDate === tomorrowDateStr();
  if (!isActivePlan) {
    el.classList.add('hidden');
    return;
  }
  el.textContent = `📋 Запланировано на завтра: ${plan.typeLabel}. Вечером пришлём уведомление.`;
  el.classList.remove('hidden');
}

/**
 * Checked opportunistically (like the morning digest) during the evening
 * window. Analyzes tomorrow's hourly rows — which the app already has,
 * since it fetches 48h of hourly detail — to suggest a start time and
 * clothing for the planned workout.
 */
async function maybeSendEveningPlanNotification() {
  const plan = storage.getPlannedWorkout();
  if (!plan || !state.weather || !state.activeCity) return;
  if (plan.cityId !== state.activeCity.id || plan.forDate !== tomorrowDateStr()) return;

  const settings = storage.getSettings();
  if (!settings.notificationsEnabled || !('Notification' in window) || Notification.permission !== 'granted') return;
  if (isQuietHours(settings)) return;

  const hour = new Date().getHours();
  if (hour < 18 || hour > 21) return;
  if (plan.notifiedAt && plan.notifiedAt.slice(0, 10) === new Date().toISOString().slice(0, 10)) return;

  const tomorrowRows = state.weather.hourly.filter((row) => row.time.slice(0, 10) === plan.forDate);
  if (tomorrowRows.length < 2) return; // not enough of tomorrow in the 48h window yet

  const dailyTomorrow = state.weather.daily.find((d) => d.time === plan.forDate);
  const timeline = runnerEngine.buildComfortTimeline(tomorrowRows, settings.runnerProfile);
  const bestWindow = runnerEngine.findBestWindow(timeline, 2, { sunrise: dailyTomorrow?.sunrise, sunset: dailyTomorrow?.sunset });

  const representativeRow = bestWindow
    ? tomorrowRows.find((row) => row.time === bestWindow.startTime) || tomorrowRows[0]
    : tomorrowRows[Math.floor(tomorrowRows.length / 2)];
  const rec = runnerEngine.generateRecommendations(representativeRow, tomorrowRows, dailyTomorrow, settings.runnerProfile);

  const windowText = bestWindow
    ? `Лучшее время старта: ${new Date(bestWindow.startTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}${bestWindow.isDark ? ' 🌙' : ''}.`
    : 'Явно комфортного окна завтра не видно — выбери время сам по прогнозу.';

  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(`Завтра: ${plan.typeLabel}`, {
      body: `${windowText} ${rec.clothing}`,
      icon: 'icons/icon.svg',
      tag: 'planned-workout',
    });
    storage.setPlannedWorkout({ ...plan, notifiedAt: new Date().toISOString() });
  } catch (err) {
    console.warn('Failed to show planned-workout notification:', err);
  }
}



async function shareCard() {
  if (!state.weather || !state.activeCity || !state.lastRecommendation) return;
  try {
    const { drawShareCard, shareCanvas } = await import('./share.js');
    const canvas = $('share-canvas');
    drawShareCard(canvas, {
      city: state.activeCity,
      current: state.weather.current,
      dailyToday: state.weather.daily[0],
      recommendation: state.lastRecommendation,
      settings: storage.getSettings(),
    });
    haptic(10);
    await shareCanvas(canvas, `weather-${state.activeCity.name}.png`);
  } catch (err) {
    if (err?.name !== 'AbortError') { // user cancelling the native share sheet isn't an error
      console.warn('Share failed:', err);
      ui.showStatusBanner('Не удалось поделиться карточкой.', 'warn');
    }
  }
}

/* ============================== POST-RUN FEEDBACK & CALIBRATION ============================== */

function recordFeedback(feeling) {
  if (!state.lastRecommendation) return;
  ui.markFeedbackSelected(feeling);
  haptic(10);
  recordRunFeedback(feeling, state.lastRecommendation.feelsLike);

  const settings = storage.getSettings();
  const suggestion = suggestProfileAdjustment(settings.runnerProfile);
  if (suggestion) {
    const runnerProfile = { ...settings.runnerProfile, [suggestion.kind]: suggestion.suggestedValue };
    storage.updateSettings({ runnerProfile });
    ui.showStatusBanner(`Профиль обновлён: ${suggestion.reason}.`, 'info');
    setTimeout(ui.hideStatusBanner, 3500);
    if (state.weather) renderAll();
  }
}

/* ============================== MORNING DIGEST ============================== */

/**
 * Sends one local notification per day, in the morning window, summarizing
 * the day's best running window and overall outlook. There's no push
 * server behind this app, so it's checked opportunistically whenever the
 * app renders (foreground refresh, periodic background sync wake-up, etc.)
 * rather than fired at an exact scheduled time.
 */
async function maybeSendMorningDigest() {
  const settings = storage.getSettings();
  if (!settings.notificationsEnabled || !('Notification' in window) || Notification.permission !== 'granted') return;
  if (!state.activeCity || !state.weather || !state.lastRecommendation) return;

  const now = new Date();
  const hour = now.getHours();
  if (hour < 6 || hour > 9) return;

  const todayKey = now.toISOString().slice(0, 10);
  const lastDigestDate = localStorage.getItem('weatherApp.lastDigestDate');
  if (lastDigestDate === todayKey) return;

  const timeline = runnerEngine.buildComfortTimeline(state.weather.hourly, settings.runnerProfile);
  const window = runnerEngine.findBestWindow(timeline);
  const windowText = window
    ? `Лучшее окно: ${new Date(window.startTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}–${new Date(window.endTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}.`
    : 'Сегодня нет явно комфортного окна для бега.';

  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification('Доброе утро ☀️', {
      body: `${state.lastRecommendation.level.emoji} ${state.lastRecommendation.level.label}. ${windowText}`,
      icon: 'icons/icon.svg',
      tag: 'morning-digest',
    });
    localStorage.setItem('weatherApp.lastDigestDate', todayKey);
  } catch (err) {
    console.warn('Failed to show morning digest:', err);
  }
}



function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('service-worker.js');
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'PERIODIC_REFRESH' && state.activeCity && navigator.onLine) {
          refreshWeather(state.activeCity);
        }
      });
      // Best-effort: refresh forecasts periodically even while the app isn't open.
      // Support is currently limited (mainly Chrome on Android with the PWA installed),
      // so this is wrapped defensively and simply does nothing where unsupported.
      if ('periodicSync' in registration) {
        const status = await navigator.permissions.query({ name: 'periodic-background-sync' }).catch(() => null);
        if (status?.state === 'granted') {
          await registration.periodicSync.register('refresh-weather', { minInterval: 60 * 60 * 1000 });
        }
      }
    } catch (err) {
      console.warn('Service worker registration failed:', err);
    }
  });
}

init();
