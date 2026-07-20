/**
 * ui.js
 * ---------------------------------------------------------------------------
 * Pure(ish) rendering layer: every function takes data + a callback and
 * writes to a known DOM node. No fetching, no business logic — that lives in
 * app.js and runner-engine.js respectively. Keeping this separation means
 * the scoring/data logic can be unit-tested without a DOM.
 */

import { getWeatherIconSvg, getAnimationCategory, getClothingSilhouetteSvg } from './icons.js';
import { getMoonPhase, formatDurationHM, formatTimeHM } from './astro.js';
import { formatTemp, formatWind, UNIT_LABELS } from './units.js';
import { t, translatedWeatherDescription, translatedLevelLabel, LANGUAGE_NAMES } from './i18n.js';

const $ = (id) => document.getElementById(id);

/** Applies the selected language to every static (non-data-driven) label in the UI. */
export function applyStaticTranslations(lang) {
  const map = {
    'title-runner': 'forRunner',
    'title-chart': 'sectionChart',
    'title-radar': 'sectionRadar',
    'title-hourly': 'sectionHourly',
    'title-daily': 'sectionDaily',
    'title-weekly': 'sectionWeekly',
    'title-details': 'sectionDetails',
    'weekly-trend-note': 'weeklyTrendNote',
    'app-footer-text': 'footer',
    'title-my-cities': 'myCities',
    'add-city-label': 'addCity',
    'title-units': 'units',
    'title-notifications-traffic': 'notificationsAndTraffic',
    'title-customize-screen': 'customizeScreen',
    'title-language': 'interfaceLanguage',
  };
  for (const [id, key] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (el) el.textContent = t(key, lang);
  }
  $('language-value').textContent = LANGUAGE_NAMES[lang];
}

/* ============================== THEME ============================== */

export function applyTheme(themeName) {
  document.documentElement.setAttribute('data-theme', themeName);
}

/**
 * Resolves 'auto' theme to light/dark using local sunrise/sunset if available,
 * otherwise falls back to the OS color-scheme preference.
 */
export function resolveAutoTheme(sunriseIso, sunsetIso) {
  if (sunriseIso && sunsetIso) {
    const now = Date.now();
    const sunrise = new Date(sunriseIso).getTime();
    const sunset = new Date(sunsetIso).getTime();
    return now >= sunrise && now < sunset ? 'light' : 'dark';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/* ============================== STATUS BANNER ============================== */

export function showStatusBanner(message, kind = 'info') {
  const el = $('status-banner');
  el.textContent = message;
  el.classList.remove('hidden');
  el.dataset.kind = kind;
}
export function hideStatusBanner() {
  $('status-banner').classList.add('hidden');
}

/** Reveals the real content and hides the loading skeleton, once the first render has data. */
export function hideSkeletons() {
  $('skeleton-overlay').classList.add('hidden');
  $('content-sections').classList.remove('hidden');
}

/** Reflects refresh-in-progress / offline state onto the header refresh button. */
export function setRefreshButtonState({ spinning = false, offline = false } = {}) {
  const btn = $('refresh-btn');
  btn.classList.toggle('spinning', spinning);
  btn.classList.toggle('offline', offline);
}

/** Shows/hides and animates the pull-to-refresh indicator by height, 0..1 progress. */
export function setPullIndicator(progress, spinning = false) {
  const el = $('pull-indicator');
  el.style.height = `${Math.min(56, progress * 56)}px`;
  el.classList.toggle('spinning', spinning);
}

/* ============================== CITY TABS & FAVORITES ============================== */

export function renderCityTabs(favorites, activeCityId, onSelect) {
  const container = $('city-tabs');
  container.innerHTML = '';
  favorites.forEach((city) => {
    const btn = document.createElement('button');
    btn.className = 'city-tab' + (city.id === activeCityId ? ' active' : '');
    btn.textContent = city.name;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', String(city.id === activeCityId));
    btn.addEventListener('click', () => onSelect(city));
    container.appendChild(btn);
  });
}

export function renderFavoritesList(favorites, activeCityId, onSelect, onRemove, onReorder) {
  const list = $('favorites-list');
  list.innerHTML = '';
  if (!favorites.length) {
    list.innerHTML = '<p style="padding:12px;color:var(--text-tertiary);font-size:14px;">Пока нет сохранённых городов</p>';
    return;
  }

  let dragSrcId = null;

  favorites.forEach((city) => {
    const li = document.createElement('li');
    li.className = 'favorite-item' + (city.id === activeCityId ? ' active' : '');
    li.draggable = true;
    li.dataset.cityId = city.id;
    li.innerHTML = `
      <span class="drag-handle" aria-hidden="true">⠿</span>
      <div style="flex:1;">
        <div class="result-name">${city.name}</div>
        <div class="result-region" style="margin-left:0;">${[city.admin1, city.country].filter(Boolean).join(', ')}</div>
      </div>
      <button class="favorite-remove" aria-label="Удалить">✕</button>
    `;
    li.querySelector('.result-name').closest('div').addEventListener('click', () => onSelect(city));
    li.querySelector('.favorite-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      onRemove(city);
    });

    // --- Drag-and-drop reordering (desktop mouse or touch-capable browsers) ---
    li.addEventListener('dragstart', () => { dragSrcId = city.id; li.classList.add('dragging'); });
    li.addEventListener('dragend', () => li.classList.remove('dragging'));
    li.addEventListener('dragover', (e) => e.preventDefault());
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      if (!dragSrcId || dragSrcId === city.id) return;
      const ids = Array.from(list.children).map((el) => el.dataset.cityId);
      const fromIdx = ids.indexOf(dragSrcId);
      const toIdx = ids.indexOf(city.id);
      ids.splice(toIdx, 0, ids.splice(fromIdx, 1)[0]);
      onReorder(ids);
    });

    list.appendChild(li);
  });
}

export function renderSearchResults(results, onSelect) {
  const list = $('search-results');
  list.innerHTML = '';
  results.forEach((city) => {
    const li = document.createElement('li');
    li.className = 'search-result-item';
    li.innerHTML = `
      <span class="result-name">${city.name}</span>
      <span class="result-region">${[city.admin1, city.country].filter(Boolean).join(', ')}</span>
    `;
    li.addEventListener('click', () => onSelect(city));
    list.appendChild(li);
  });
}

/* ============================== HERO CARD ============================== */

export function renderHero(city, current, dailyToday, settings = { units: 'metric', language: 'ru' }) {
  $('hero-city-name').textContent = city.name;
  $('hero-updated').textContent = `${t('updated', settings.language)} ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
  $('hero-icon').innerHTML = getWeatherIconSvg(current.weather_code, current.is_day === 1);
  $('hero-temp-value').textContent = formatTemp(current.temperature_2m, settings.units);
  $('hero-description').textContent = translatedWeatherDescription(current.weather_code, settings.language);
  $('hero-feels-like').textContent = `${t('feelsLike', settings.language)} ${formatTemp(current.apparent_temperature, settings.units)}`;
  if (dailyToday) {
    $('hero-temp-min').textContent = formatTemp(dailyToday.temperature_2m_min, settings.units);
    $('hero-temp-max').textContent = formatTemp(dailyToday.temperature_2m_max, settings.units);
  }
}

export function renderNowcast(nowcast) {
  const el = $('hero-nowcast');
  if (!nowcast) {
    el.classList.add('hidden');
    return;
  }
  el.textContent = `🌧️ ${nowcast.message}`;
  el.classList.remove('hidden');
}

export function renderClimateNorm(norm, todayTempMax, settings = { units: 'metric' }) {
  const el = $('hero-climate-norm');
  if (!norm) {
    el.classList.add('hidden');
    return;
  }
  const diff = Math.round(todayTempMax - norm.avgHigh);
  const diffText = diff === 0 ? 'как обычно' : diff > 0 ? `на ${diff}° теплее нормы` : `на ${Math.abs(diff)}° холоднее нормы`;
  el.textContent = `Норма на этот день: ${formatTemp(norm.avgHigh, settings.units)} — сегодня ${diffText}`;
  el.classList.remove('hidden');
}

export function renderModelAgreement(agreement) {
  const el = $('hero-confidence');
  if (!agreement) {
    el.classList.add('hidden');
    return;
  }
  el.classList.remove('hidden', 'high', 'low');
  el.classList.add(agreement.agreement);
  el.textContent = agreement.agreement === 'high'
    ? '✓ Прогноз надёжный (модели согласны)'
    : `⚠ Модели расходятся на ${agreement.spread}° — прогноз менее уверенный`;
}

export function renderMeteoAlarmWarnings(warnings) {
  const el = $('meteoalarm-section');
  if (!warnings || !warnings.length) {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }
  el.innerHTML = `
    <span class="meteoalarm-title">⚠️ Официальные предупреждения (MeteoAlarm)</span>
    ${warnings.map((w) => `
      <div class="meteoalarm-item">
        ${w.emoji} ${w.title}
        ${w.summary ? `<span class="meteoalarm-summary">${w.summary}</span>` : ''}
      </div>
    `).join('')}
  `;
  el.classList.remove('hidden');
}

/* ============================== HOURLY ============================== */

export function renderHourly(hourlyRows, settings = { units: 'metric' }) {
  const container = $('hourly-scroll');
  container.innerHTML = '';
  hourlyRows.slice(0, 48).forEach((row, i) => {
    const time = i === 0 ? 'Сейчас' : new Date(row.time).toLocaleTimeString('ru-RU', { hour: '2-digit' }).replace(':00', ':00');
    const item = document.createElement('div');
    item.className = 'hour-item';
    item.innerHTML = `
      <span class="hour-time">${time}</span>
      ${getWeatherIconSvg(row.weather_code, row.is_day === 1)}
      <span class="hour-temp">${formatTemp(row.temperature_2m, settings.units)}</span>
      <span class="hour-precip">${row.precipitation_probability > 10 ? row.precipitation_probability + '%' : ''}</span>
    `;
    container.appendChild(item);
  });
}

/* ============================== DAILY (10-day) ============================== */

export function renderDaily(dailyRows, settings = { units: 'metric' }) {
  const container = $('daily-list');
  container.innerHTML = '';

  const allMin = Math.min(...dailyRows.map((d) => d.temperature_2m_min));
  const allMax = Math.max(...dailyRows.map((d) => d.temperature_2m_max));
  const range = Math.max(1, allMax - allMin);

  dailyRows.forEach((row, i) => {
    const dayLabel = i === 0 ? 'Сегодня' : new Date(row.time).toLocaleDateString('ru-RU', { weekday: 'short' });
    const leftPct = ((row.temperature_2m_min - allMin) / range) * 100;
    const widthPct = ((row.temperature_2m_max - row.temperature_2m_min) / range) * 100;

    const item = document.createElement('div');
    item.className = 'daily-item';
    item.innerHTML = `
      <span class="daily-day">${dayLabel}</span>
      ${getWeatherIconSvg(row.weather_code, true)}
      <span class="daily-precip">${row.precipitation_probability_max > 10 ? row.precipitation_probability_max + '%' : ''}</span>
      <div class="daily-range">
        <span class="daily-min">${formatTemp(row.temperature_2m_min, settings.units)}</span>
        <div class="daily-bar-track">
          <div class="daily-bar-fill" style="left:${leftPct}%;width:${widthPct}%;"></div>
        </div>
        <span class="daily-max">${formatTemp(row.temperature_2m_max, settings.units)}</span>
      </div>
    `;
    container.appendChild(item);
  });
}

/* ============================== DETAILS GRID ============================== */

function tile(label, value, sub = '') {
  return `<div class="detail-tile">
    <span class="detail-label">${label}</span>
    <span class="detail-value">${value}</span>
    ${sub ? `<span class="detail-sub">${sub}</span>` : ''}
  </div>`;
}

const WIND_DIRECTIONS = ['С', 'ССВ', 'СВ', 'ВСВ', 'В', 'ВЮВ', 'ЮВ', 'ЮЮВ', 'Ю', 'ЮЮЗ', 'ЮЗ', 'ЗЮЗ', 'З', 'ЗСЗ', 'СЗ', 'ССЗ'];
function windDirLabel(deg) {
  return WIND_DIRECTIONS[Math.round(deg / 22.5) % 16];
}

export function renderDetailsGrid(current, dailyToday, currentHourRow, settings = { units: 'metric', windUnit: 'kmh' }) {
  const container = $('details-grid');
  const moon = getMoonPhase();
  const visibilityKm = currentHourRow?.visibility != null ? (currentHourRow.visibility / 1000).toFixed(1) : null;

  container.innerHTML = [
    tile('Ощущается', formatTemp(current.apparent_temperature, settings.units)),
    tile('Влажность', `${current.relative_humidity_2m}%`),
    tile('Осадки сейчас', `${current.precipitation ?? 0}`, 'мм'),
    tile('Давление', `${Math.round(current.pressure_msl)}`, 'гПа'),
    tile('Ветер', formatWind(current.wind_speed_10m, settings.windUnit), windDirLabel(current.wind_direction_10m)),
    tile('Порывы ветра', formatWind(current.wind_gusts_10m, settings.windUnit)),
    tile('Облачность', `${current.cloud_cover}%`),
    tile('Видимость', visibilityKm != null ? visibilityKm : '—', 'км'),
    tile('УФ-индекс', dailyToday ? Math.round(dailyToday.uv_index_max) : '—'),
    tile('Качество воздуха', current.us_aqi ?? '—', current.us_aqi ? aqiLabel(current.us_aqi) : ''),
    tile('PM2.5', current.pm2_5 != null ? `${Math.round(current.pm2_5)}` : '—', 'мкг/м³'),
    tile('PM10', current.pm10 != null ? `${Math.round(current.pm10)}` : '—', 'мкг/м³'),
    tile('Точка росы', current.dew_point_2m != null ? formatTemp(current.dew_point_2m, settings.units) : '—'),
    tile('Восход', dailyToday ? formatTimeHM(dailyToday.sunrise) : '—'),
    tile('Закат', dailyToday ? formatTimeHM(dailyToday.sunset) : '—'),
    tile('Световой день', dailyToday ? formatDurationHM(dailyToday.daylight_duration) : '—'),
    tile('Фаза Луны', `${moon.emoji} ${moon.name}`, `Освещённость ${Math.round(moon.illumination * 100)}%`),
  ].join('');
}

function aqiLabel(aqi) {
  if (aqi <= 50) return 'Хорошее';
  if (aqi <= 100) return 'Умеренное';
  if (aqi <= 150) return 'Вредно для чувствительных групп';
  if (aqi <= 200) return 'Вредное';
  return 'Очень вредное';
}

/* ============================== RUNNER SECTION ============================== */

function segmentColor(score) {
  if (score >= 90) return '#34C759';
  if (score >= 75) return '#7ED957';
  if (score >= 55) return '#FFD24C';
  if (score >= 35) return '#FF9142';
  return '#FF4B4B';
}

export function renderRunnerTimeline(timeline, nowIndex = 0) {
  const track = $('runner-timeline');
  const labels = $('runner-timeline-labels');
  track.innerHTML = '';
  timeline.forEach((seg, i) => {
    const div = document.createElement('div');
    div.className = 'runner-segment' + (i === nowIndex ? ' is-now' : '');
    div.style.background = segmentColor(seg.score);
    div.style.animationDelay = `${i * 0.015}s`;
    div.title = `${new Date(seg.time).toLocaleTimeString('ru-RU', { hour: '2-digit' })} — ${seg.level.label} (${seg.score})`;
    track.appendChild(div);
  });
  labels.innerHTML = `<span>${new Date(timeline[0].time).toLocaleTimeString('ru-RU', { hour: '2-digit' })}</span>
    <span>${new Date(timeline[Math.floor(timeline.length / 2)].time).toLocaleTimeString('ru-RU', { hour: '2-digit' })}</span>
    <span>${new Date(timeline[timeline.length - 1].time).toLocaleTimeString('ru-RU', { hour: '2-digit' })}</span>`;
}

const PACE_LABELS = [
  ['easyRun', '🏃', 'Лёгкий бег'],
  ['longRun', '🛣️', 'Длительная'],
  ['intervals', '⏱️', 'Интервалы'],
  ['tempo', '⚡', 'Темповая'],
  ['recovery', '🌿', 'Восстановление'],
];

export function renderRunnerRecommendations(rec, lang = 'ru') {
  $('runner-emoji').textContent = rec.level.emoji;
  $('runner-label').textContent = translatedLevelLabel(rec.level.key, lang);

  const paceGrid = $('runner-pace-grid');
  paceGrid.innerHTML = PACE_LABELS.map(([key, icon, label]) => `
    <div class="pace-chip ${rec.paceTypes[key] ? 'ok' : ''}">
      <span class="pace-icon">${icon}</span>
      <span>${label}</span>
    </div>
  `).join('');

  const detailsGrid = $('runner-details-grid');
  const rows = [
    ['Риск перегрева', capitalize(rec.overheatRisk)],
    ['Переохлаждение', rec.hypothermiaRisk ? 'Есть риск' : 'Не грозит'],
    ['Поправка темпа', rec.paceAdjustment.note],
    ['Вода на пробежку', `${rec.waterMl} мл`],
    ['Солнцезащита', rec.needSunProtection ? 'Рекомендуется' : 'Не требуется'],
    ['Ветровка', rec.needWindbreaker ? 'Да' : 'Нет'],
    ['Дождевик', rec.needRaincoat ? 'Да' : 'Нет'],
    ['Перчатки', rec.needGloves ? 'Да' : 'Нет'],
    ['Головной убор', rec.needHat ? 'Да' : 'Нет'],
  ];
  detailsGrid.innerHTML = rows.map(([label, value]) => `
    <div class="runner-detail">
      <span class="runner-detail-label">${label}</span>
      <span class="runner-detail-value">${value}</span>
    </div>
  `).join('');

  $('runner-clothing').innerHTML = `${getClothingSilhouetteSvg(rec)}<span>${rec.clothing}</span>`;

  if (rec.factors.length) {
    showStatusBanner('', 'noop'); // no-op placeholder kept for symmetry, hidden below if unused
    hideStatusBanner();
  }
}

export function renderRunnerWarning(warning) {
  const el = $('runner-warning');
  if (!warning) {
    el.classList.add('hidden');
    el.textContent = '';
    return;
  }
  el.classList.remove('hidden');
  el.textContent = `⚠️ ${warning.message}`;
}

/** Shows the best comfort window for a run today, or hides the banner if none clears the bar. */
export function renderBestWindow(window) {
  const el = $('best-window');
  if (!window) {
    el.classList.add('hidden');
    return;
  }
  const start = new Date(window.startTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const end = new Date(window.endTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const darkNote = window.isDark ? ' 🌙 потребуется фонарик/светоотражатели' : '';
  el.textContent = `🎯 Лучшее окно сегодня: ${start}–${end}${darkNote}`;
  el.classList.remove('hidden');
}

export function renderRadarTimeLabel(text) {
  $('radar-time-label').textContent = text;
}

export function setRadarPlayButtonState(playing) {
  $('radar-play-btn').textContent = playing ? '⏸' : '▶';
}

/** Briefly highlights the tapped post-run feedback button for visual confirmation. */
export function markFeedbackSelected(feeling) {
  document.querySelectorAll('#feedback-buttons button').forEach((btn) => {
    btn.classList.toggle('selected', btn.dataset.feeling === feeling);
  });
  setTimeout(() => {
    document.querySelectorAll('#feedback-buttons button').forEach((btn) => btn.classList.remove('selected'));
  }, 1500);
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ============================== DASHBOARD LAYOUT CUSTOMIZATION ============================== */

const SECTION_LABELS = {
  runner: 'Для бегуна',
  chart: 'График температуры',
  radar: 'Радар осадков',
  hourly: 'Почасовой прогноз',
  daily: 'Прогноз на 10 дней',
  weekly: 'Недельный тренд',
  details: 'Подробности',
};

/**
 * Reorders the section elements inside #content-sections to match `order`,
 * and shows/hides them per `hiddenIds`. The hero card and footer are never
 * part of `order` — the hero always stays first, the footer always last.
 */
export function applyLayout(order, hiddenIds) {
  const container = $('content-sections');
  order.forEach((id) => {
    const el = container.querySelector(`[data-section-id="${id}"]`);
    if (!el) return;
    el.classList.toggle('hidden', hiddenIds.includes(id));
    container.appendChild(el);
  });
  const footer = container.querySelector('.app-footer');
  if (footer) container.appendChild(footer);
}

/** Renders the reorder/hide list inside the "Настроить экран" overlay. */
export function renderLayoutList(order, hiddenIds, onMove, onToggleHidden) {
  const list = $('layout-list');
  list.innerHTML = order.map((id, i) => `
    <li class="layout-item ${hiddenIds.includes(id) ? 'section-hidden' : ''}" data-id="${id}">
      <button class="move-up-btn" aria-label="Выше" ${i === 0 ? 'disabled' : ''}>▲</button>
      <button class="move-down-btn" aria-label="Ниже" ${i === order.length - 1 ? 'disabled' : ''}>▼</button>
      <span class="layout-item-name">${SECTION_LABELS[id] || id}</span>
      <button class="eye-btn ${hiddenIds.includes(id) ? 'is-hidden' : ''}" aria-label="Показать/скрыть">${hiddenIds.includes(id) ? '🚫' : '👁'}</button>
    </li>
  `).join('');

  list.querySelectorAll('.layout-item').forEach((item) => {
    const id = item.dataset.id;
    item.querySelector('.move-up-btn').addEventListener('click', () => onMove(id, -1));
    item.querySelector('.move-down-btn').addEventListener('click', () => onMove(id, 1));
    item.querySelector('.eye-btn').addEventListener('click', () => onToggleHidden(id));
  });
}



/**
 * Renders a lightweight inline-SVG line chart of temperature and "feels like"
 * for the next 24 hours. No charting library needed — a hand-rolled polyline
 * keeps the app dependency-free, per the project's "no heavy frameworks" brief.
 */
export function renderTemperatureChart(hourlyRows) {
  const rows = hourlyRows.slice(0, 24);
  const container = $('temp-chart');
  if (!rows.length) { container.innerHTML = ''; return; }

  const width = 320;
  const height = 140;
  const padX = 8;
  const padTop = 22;
  const padBottom = 24;

  const temps = rows.map((r) => r.temperature_2m);
  const feels = rows.map((r) => r.apparent_temperature ?? r.temperature_2m);
  const allValues = temps.concat(feels);
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const span = Math.max(1, max - min);

  const xStep = (width - padX * 2) / (rows.length - 1 || 1);
  const yFor = (v) => padTop + (height - padTop - padBottom) * (1 - (v - min) / span);
  const xFor = (i) => padX + i * xStep;

  const linePoints = temps.map((t, i) => `${xFor(i)},${yFor(t)}`).join(' ');
  const feelsPoints = feels.map((t, i) => `${xFor(i)},${yFor(t)}`).join(' ');
  const fillPoints = `${xFor(0)},${height - padBottom} ${linePoints} ${xFor(rows.length - 1)},${height - padBottom}`;

  // Label every 4th hour to avoid crowding.
  const labelIndices = rows.map((_, i) => i).filter((i) => i % 4 === 0);
  const labels = labelIndices.map((i) => {
    const label = i === 0 ? 'Сейчас' : new Date(rows[i].time).toLocaleTimeString('ru-RU', { hour: '2-digit' });
    return `<text class="temp-chart-label" x="${xFor(i)}" y="${height - 6}" text-anchor="middle">${label}</text>`;
  }).join('');

  // Highlight current temperature value above its point.
  const peakDots = labelIndices.map((i) => `
    <circle class="temp-chart-dot" cx="${xFor(i)}" cy="${yFor(temps[i])}" r="2.6"></circle>
    <text class="temp-chart-value" x="${xFor(i)}" y="${yFor(temps[i]) - 8}" text-anchor="middle">${Math.round(temps[i])}°</text>
  `).join('');

  container.innerHTML = `
    <div class="chart-legend">
      <span><i class="dot actual"></i>Температура</span>
      <span><i class="dot feels"></i>Ощущается</span>
    </div>
    <svg class="temp-chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      <defs>
        <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="var(--accent)" stop-opacity="0.5"/>
          <stop offset="1" stop-color="var(--accent)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <polygon class="temp-chart-fill" points="${fillPoints}" fill="url(#chartFill)"></polygon>
      <polyline class="temp-chart-line-feels" points="${feelsPoints}"></polyline>
      <polyline class="temp-chart-line" points="${linePoints}"></polyline>
      ${peakDots}
      ${labels}
    </svg>
  `;
}

/**
 * Renders the 7-day comfort trend as a small inline-SVG bar chart, colored
 * with the same comfort scale as the 24h ribbon, with temperature range
 * labels so it doubles as a quick "which day to plan the long run on" view.
 */
export function renderWeeklyTrend(trend, settings = { units: 'metric' }) {
  const container = $('weekly-trend');
  if (!trend.length) { container.innerHTML = ''; return; }

  const width = 320;
  const height = 150;
  const barGap = 8;
  const barWidth = (width - barGap * (trend.length - 1)) / trend.length;
  const chartTop = 30;
  const chartBottom = height - 22;
  const chartHeight = chartBottom - chartTop;

  const bars = trend.map((day, i) => {
    const x = i * (barWidth + barGap);
    const barHeight = (day.score / 100) * chartHeight;
    const y = chartBottom - barHeight;
    const dayLabel = i === 0 ? 'Сегодня' : new Date(day.date).toLocaleDateString('ru-RU', { weekday: 'short' });
    return `
      <rect class="trend-bar" x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="6" fill="${segmentColor(day.score)}"></rect>
      <text class="temp-chart-value" x="${x + barWidth / 2}" y="${y - 6}" text-anchor="middle">${formatTemp(day.tempMax, settings.units)}</text>
      <text class="temp-chart-label" x="${x + barWidth / 2}" y="${height - 4}" text-anchor="middle">${dayLabel}</text>
    `;
  }).join('');

  container.innerHTML = `<svg class="temp-chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">${bars}</svg>`;
}



const TOLERANCE_LABELS = { sensitive: 'чувствителен', average: 'обычная', adapted: 'привык' };
const TOLERANCE_CYCLE = ['average', 'adapted', 'sensitive'];

/** Reflects the current personalization profile onto the two toggle chips. */
export function renderProfileChips(profile) {
  $('heat-profile-value').textContent = TOLERANCE_LABELS[profile.heatTolerance];
  $('cold-profile-value').textContent = TOLERANCE_LABELS[profile.coldTolerance];
}

/** Returns the next value in the tolerance cycle, used when a chip is tapped. */
export function nextTolerance(current) {
  const idx = TOLERANCE_CYCLE.indexOf(current);
  return TOLERANCE_CYCLE[(idx + 1) % TOLERANCE_CYCLE.length];
}

/* ============================== NOTIFICATIONS UI ============================== */

/** Reflects whether notifications are on/off onto the bell button's visual state. */
export function setNotificationButtonState(enabled) {
  $('notify-btn').classList.toggle('active', enabled);
}



let animationFrameId = null;
let particles = [];
let canvasCtx = null;
let currentCategory = null;

function resizeCanvas() {
  const canvas = $('bg-canvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function seedParticles(category) {
  const canvas = $('bg-canvas');
  const count = { rain: 90, snow: 60, cloudy: 5, 'partly-cloudy': 4, fog: 6, thunder: 90, clear: 25, drizzle: 60 }[category] ?? 20;
  particles = Array.from({ length: count }, () => spawnParticle(category, canvas));
}

function spawnParticle(category, canvas) {
  const x = Math.random() * canvas.width;
  const y = Math.random() * canvas.height;
  switch (category) {
    case 'rain':
    case 'drizzle':
      return { x, y, len: 12 + Math.random() * 14, speed: 6 + Math.random() * 6, drift: -1 };
    case 'snow':
      return { x, y, r: 1.5 + Math.random() * 2.5, speed: 0.6 + Math.random() * 1.2, drift: Math.random() * 0.6 - 0.3 };
    case 'thunder':
      return { x, y, len: 14 + Math.random() * 16, speed: 8 + Math.random() * 8, drift: -1.5 };
    case 'cloudy':
    case 'partly-cloudy':
      return { x: Math.random() * canvas.width, y: canvas.height * (0.08 + Math.random() * 0.25), r: 60 + Math.random() * 70, speed: 0.15 + Math.random() * 0.15 };
    case 'fog':
      return { x: Math.random() * canvas.width, y: canvas.height * (0.2 + Math.random() * 0.6), w: 200 + Math.random() * 200, speed: 0.2 + Math.random() * 0.2 };
    default: // clear — soft floating dust / star motes
      return { x, y, r: 0.6 + Math.random() * 1.2, phase: Math.random() * Math.PI * 2 };
  }
}

function drawParticles(category) {
  const canvas = $('bg-canvas');
  canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  particles.forEach((p) => {
    switch (category) {
      case 'rain':
      case 'drizzle':
      case 'thunder':
        canvasCtx.strokeStyle = isDark ? 'rgba(140,170,255,0.35)' : 'rgba(80,120,255,0.28)';
        canvasCtx.lineWidth = 1.4;
        canvasCtx.beginPath();
        canvasCtx.moveTo(p.x, p.y);
        canvasCtx.lineTo(p.x + p.drift * 4, p.y + p.len);
        canvasCtx.stroke();
        p.y += p.speed; p.x += p.drift * 0.3;
        if (p.y > canvas.height) { p.y = -20; p.x = Math.random() * canvas.width; }
        break;
      case 'snow':
        canvasCtx.fillStyle = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.85)';
        canvasCtx.beginPath();
        canvasCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        canvasCtx.fill();
        p.y += p.speed; p.x += p.drift;
        if (p.y > canvas.height) { p.y = -10; p.x = Math.random() * canvas.width; }
        break;
      case 'cloudy':
      case 'partly-cloudy':
        canvasCtx.fillStyle = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.5)';
        canvasCtx.beginPath();
        canvasCtx.ellipse(p.x, p.y, p.r, p.r * 0.5, 0, 0, Math.PI * 2);
        canvasCtx.fill();
        p.x += p.speed;
        if (p.x - p.r > canvas.width) p.x = -p.r;
        break;
      case 'fog':
        canvasCtx.fillStyle = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.35)';
        canvasCtx.fillRect(p.x, p.y, p.w, 2);
        p.x += p.speed;
        if (p.x > canvas.width) p.x = -p.w;
        break;
      default: {
        const twinkle = 0.5 + 0.5 * Math.sin(Date.now() / 900 + p.phase);
        canvasCtx.fillStyle = isDark ? `rgba(255,255,255,${0.15 + twinkle * 0.2})` : `rgba(255,255,255,${0.08 + twinkle * 0.12})`;
        canvasCtx.beginPath();
        canvasCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        canvasCtx.fill();
        break;
      }
    }
  });

  animationFrameId = requestAnimationFrame(() => drawParticles(category));
}

/**
 * (Re)starts the ambient canvas animation for the given weather code.
 * Safe to call repeatedly; it tears down the previous loop first.
 */
export function startWeatherAnimation(weatherCode) {
  const category = getAnimationCategory(weatherCode);
  if (category === currentCategory) return; // avoid needless re-seeding on every refresh
  currentCategory = category;

  const canvas = $('bg-canvas');
  canvasCtx = canvas.getContext('2d');
  resizeCanvas();
  seedParticles(category);

  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  if (!document.hidden) drawParticles(category);
}

// Pause the animation loop while the tab/app is backgrounded — no point burning
// battery drawing frames nobody can see, especially on a phone.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  } else if (currentCategory && !animationFrameId) {
    drawParticles(currentCategory);
  }
});

let resizeRaf = null;
window.addEventListener('resize', () => {
  if (resizeRaf) return;
  resizeRaf = requestAnimationFrame(() => {
    resizeCanvas();
    if (currentCategory) seedParticles(currentCategory);
    resizeRaf = null;
  });
});
