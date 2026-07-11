/**
 * ui.js
 * ---------------------------------------------------------------------------
 * Pure(ish) rendering layer: every function takes data + a callback and
 * writes to a known DOM node. No fetching, no business logic — that lives in
 * app.js and runner-engine.js respectively. Keeping this separation means
 * the scoring/data logic can be unit-tested without a DOM.
 */

import { getWeatherIconSvg, getWeatherDescription, getAnimationCategory } from './icons.js';
import { getMoonPhase, formatDurationHM, formatTimeHM } from './astro.js';

const $ = (id) => document.getElementById(id);

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

export function renderFavoritesList(favorites, activeCityId, onSelect, onRemove) {
  const list = $('favorites-list');
  list.innerHTML = '';
  if (!favorites.length) {
    list.innerHTML = '<p style="padding:12px;color:var(--text-tertiary);font-size:14px;">Пока нет сохранённых городов</p>';
    return;
  }
  favorites.forEach((city) => {
    const li = document.createElement('li');
    li.className = 'favorite-item' + (city.id === activeCityId ? ' active' : '');
    li.innerHTML = `
      <div>
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

export function renderHero(city, current, dailyToday) {
  $('hero-city-name').textContent = city.name;
  $('hero-updated').textContent = `Обновлено в ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
  $('hero-icon').innerHTML = getWeatherIconSvg(current.weather_code, current.is_day === 1);
  $('hero-temp-value').textContent = `${Math.round(current.temperature_2m)}°`;
  $('hero-description').textContent = getWeatherDescription(current.weather_code);
  $('hero-feels-like').textContent = `Ощущается как ${Math.round(current.apparent_temperature)}°`;
  if (dailyToday) {
    $('hero-temp-min').textContent = `${Math.round(dailyToday.temperature_2m_min)}°`;
    $('hero-temp-max').textContent = `${Math.round(dailyToday.temperature_2m_max)}°`;
  }
}

/* ============================== HOURLY ============================== */

export function renderHourly(hourlyRows) {
  const container = $('hourly-scroll');
  container.innerHTML = '';
  hourlyRows.slice(0, 48).forEach((row, i) => {
    const time = i === 0 ? 'Сейчас' : new Date(row.time).toLocaleTimeString('ru-RU', { hour: '2-digit' }).replace(':00', ':00');
    const item = document.createElement('div');
    item.className = 'hour-item';
    item.innerHTML = `
      <span class="hour-time">${time}</span>
      ${getWeatherIconSvg(row.weather_code, row.is_day === 1)}
      <span class="hour-temp">${Math.round(row.temperature_2m)}°</span>
      <span class="hour-precip">${row.precipitation_probability > 10 ? row.precipitation_probability + '%' : ''}</span>
    `;
    container.appendChild(item);
  });
}

/* ============================== DAILY (10-day) ============================== */

export function renderDaily(dailyRows) {
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
        <span class="daily-min">${Math.round(row.temperature_2m_min)}°</span>
        <div class="daily-bar-track">
          <div class="daily-bar-fill" style="left:${leftPct}%;width:${widthPct}%;"></div>
        </div>
        <span class="daily-max">${Math.round(row.temperature_2m_max)}°</span>
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

export function renderDetailsGrid(current, dailyToday) {
  const container = $('details-grid');
  const moon = getMoonPhase();

  container.innerHTML = [
    tile('Ощущается', `${Math.round(current.apparent_temperature)}°`),
    tile('Влажность', `${current.relative_humidity_2m}%`),
    tile('Давление', `${Math.round(current.pressure_msl)}`, 'гПа'),
    tile('Ветер', `${Math.round(current.wind_speed_10m)} км/ч`, windDirLabel(current.wind_direction_10m)),
    tile('Порывы ветра', `${Math.round(current.wind_gusts_10m)} км/ч`),
    tile('Облачность', `${current.cloud_cover}%`),
    tile('УФ-индекс', dailyToday ? Math.round(dailyToday.uv_index_max) : '—'),
    tile('Качество воздуха', current.us_aqi ?? '—', current.us_aqi ? aqiLabel(current.us_aqi) : ''),
    tile('PM2.5', current.pm2_5 != null ? `${Math.round(current.pm2_5)}` : '—', 'мкг/м³'),
    tile('PM10', current.pm10 != null ? `${Math.round(current.pm10)}` : '—', 'мкг/м³'),
    tile('Точка росы', dailyToday ? '' : '', ''),
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

export function renderRunnerRecommendations(rec) {
  $('runner-emoji').textContent = rec.level.emoji;
  $('runner-label').textContent = rec.level.label;

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

  $('runner-clothing').innerHTML = `<span class="clothing-icon">👕</span><span>${rec.clothing}</span>`;

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

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ============================== BACKGROUND WEATHER ANIMATION ============================== */

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
  drawParticles(category);
}

window.addEventListener('resize', () => {
  resizeCanvas();
  if (currentCategory) seedParticles(currentCategory);
});
