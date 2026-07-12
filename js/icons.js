/**
 * icons.js
 * ---------------------------------------------------------------------------
 * Maps WMO weather codes (as returned by Open-Meteo) to inline SVG icon
 * markup. Icons are drawn with currentColor / CSS custom properties so they
 * automatically follow the active theme and accent gradients.
 */

/** Groups raw WMO codes into a small set of visual categories. */
function categorize(code) {
  if (code === 0) return 'clear';
  if (code === 1 || code === 2) return 'partly-cloudy';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if ([51, 53, 55, 56, 57].includes(code)) return 'drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if ([95, 96, 99].includes(code)) return 'thunder';
  return 'clear';
}

const SUN = `<circle cx="32" cy="32" r="13" fill="url(#sunGrad)"/>
  <g stroke="url(#sunGrad)" stroke-width="3" stroke-linecap="round">
    <line x1="32" y1="6" x2="32" y2="13"/><line x1="32" y1="51" x2="32" y2="58"/>
    <line x1="6" y1="32" x2="13" y2="32"/><line x1="51" y1="32" x2="58" y2="32"/>
    <line x1="13.5" y1="13.5" x2="18.5" y2="18.5"/><line x1="45.5" y1="45.5" x2="50.5" y2="50.5"/>
    <line x1="50.5" y1="13.5" x2="45.5" y2="18.5"/><line x1="18.5" y1="45.5" x2="13.5" y2="50.5"/>
  </g>`;

const MOON = `<path d="M40 12a20 20 0 1 0 12 32 16 16 0 0 1-12-32z" fill="url(#moonGrad)"/>`;

const CLOUD = `<path d="M20 42a11 11 0 0 1-1-21.9A14 14 0 0 1 46 22a10 10 0 0 1-2 20H20z" fill="url(#cloudGrad)"/>`;

const CLOUD_SMALL = `<path d="M14 46a9 9 0 0 1-.8-18A11.5 11.5 0 0 1 35.5 26a8 8 0 0 1-1.6 16.4H14z" fill="url(#cloudGrad)" opacity="0.9"/>`;

const RAIN_DROPS = `<g stroke="url(#rainGrad)" stroke-width="3" stroke-linecap="round">
    <line x1="22" y1="48" x2="19" y2="56"/><line x1="32" y1="48" x2="29" y2="56"/><line x1="42" y1="48" x2="39" y2="56"/>
  </g>`;

const SNOW_FLAKES = `<g fill="url(#snowGrad)">
    <circle cx="20" cy="50" r="2.4"/><circle cx="32" cy="54" r="2.4"/><circle cx="44" cy="50" r="2.4"/>
  </g>`;

const FOG_LINES = `<g stroke="url(#fogGrad)" stroke-width="3" stroke-linecap="round">
    <line x1="10" y1="40" x2="54" y2="40"/><line x1="14" y1="48" x2="50" y2="48"/>
  </g>`;

const BOLT = `<path d="M34 44l-8 12 10-4-4 12 14-16-9 3z" fill="url(#boltGrad)"/>`;

const DEFS = `<defs>
    <linearGradient id="sunGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFC94A"/><stop offset="1" stop-color="#FF9142"/></linearGradient>
    <linearGradient id="moonGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#C9D6FF"/><stop offset="1" stop-color="#8FA3E3"/></linearGradient>
    <linearGradient id="cloudGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#EAF1FB"/><stop offset="1" stop-color="#B9C8E8"/></linearGradient>
    <linearGradient id="rainGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6FA8FF"/><stop offset="1" stop-color="#3E7BEA"/></linearGradient>
    <linearGradient id="snowGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#CFE3FF"/></linearGradient>
    <linearGradient id="fogGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#C7D0DE"/><stop offset="1" stop-color="#9FACC2"/></linearGradient>
    <linearGradient id="boltGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFE066"/><stop offset="1" stop-color="#FFB020"/></linearGradient>
  </defs>`;

const TEMPLATES = {
  clear: (isDay) => (isDay ? SUN : MOON),
  'partly-cloudy': (isDay) => `${isDay ? SUN : MOON}${CLOUD_SMALL}`,
  cloudy: () => CLOUD,
  fog: () => `${CLOUD}${FOG_LINES}`,
  drizzle: () => `${CLOUD}<g stroke="url(#rainGrad)" stroke-width="2.5" stroke-linecap="round"><line x1="24" y1="47" x2="22" y2="52"/><line x1="40" y1="47" x2="38" y2="52"/></g>`,
  rain: () => `${CLOUD}${RAIN_DROPS}`,
  snow: () => `${CLOUD}${SNOW_FLAKES}`,
  thunder: () => `${CLOUD}${BOLT}`,
};

const iconCache = new Map();

/**
 * Returns inline SVG markup for a given WMO weather code.
 * @param {number} weatherCode
 * @param {boolean} isDay
 * @returns {string} SVG markup (without the outer <svg> wrapper)
 */
export function getWeatherIconSvg(weatherCode, isDay = true) {
  const cacheKey = `${weatherCode}-${isDay}`;
  if (iconCache.has(cacheKey)) return iconCache.get(cacheKey);
  const category = categorize(weatherCode);
  const body = TEMPLATES[category](isDay);
  const svg = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" class="weather-icon">${DEFS}${body}</svg>`;
  iconCache.set(cacheKey, svg);
  return svg;
}

/** Returns a short human description in Russian for a weather code (used as alt text / labels). */
export function getWeatherDescription(weatherCode) {
  const map = {
    0: 'Ясно', 1: 'Преимущественно ясно', 2: 'Переменная облачность', 3: 'Пасмурно',
    45: 'Туман', 48: 'Изморозь',
    51: 'Слабая морось', 53: 'Морось', 55: 'Сильная морось',
    56: 'Ледяная морось', 57: 'Сильная ледяная морось',
    61: 'Небольшой дождь', 63: 'Дождь', 65: 'Сильный дождь',
    66: 'Ледяной дождь', 67: 'Сильный ледяной дождь',
    71: 'Небольшой снег', 73: 'Снег', 75: 'Сильный снег', 77: 'Снежная крупа',
    80: 'Небольшой ливень', 81: 'Ливень', 82: 'Сильный ливень',
    85: 'Снегопад', 86: 'Сильный снегопад',
    95: 'Гроза', 96: 'Гроза с градом', 99: 'Сильная гроза с градом',
  };
  return map[weatherCode] || 'Неизвестно';
}

/** Returns the CSS animation-category name, used to pick a background animation layer. */
export function getAnimationCategory(weatherCode) {
  return categorize(weatherCode);
}
