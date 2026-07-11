/**
 * runner-engine.js
 * ---------------------------------------------------------------------------
 * Turns raw weather data into running-specific guidance:
 *  - a 0-100 comfort score per hour, rolled up into a 5-level rating
 *  - a 24-segment colored comfort timeline for the day
 *  - actionable recommendations (pace types, clothing, hydration, warnings)
 *  - an early-warning check for deteriorating conditions in the next hours
 *
 * Nothing here talks to the network; it is pure functions over the
 * normalized weather shape produced by weather-api.js.
 */

const THUNDER_CODES = new Set([95, 96, 99]);
const ICE_CODES = new Set([56, 57, 66, 67]);
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);
const HEAVY_RAIN_CODES = new Set([65, 82]);

const LEVELS = [
  { min: 90, key: 'excellent', emoji: '🟢', label: 'Отличные условия для бега' },
  { min: 75, key: 'good', emoji: '🟢', label: 'Хорошие условия' },
  { min: 55, key: 'caution', emoji: '🟡', label: 'Бежать можно, но соблюдайте осторожность' },
  { min: 35, key: 'poor', emoji: '🟠', label: 'Условия неблагоприятные' },
  { min: 0, key: 'bad', emoji: '🔴', label: 'Сегодня пробежку лучше перенести' },
];

/** Maps a 0-100 score to its level descriptor. */
export function levelForScore(score) {
  return LEVELS.find((l) => score >= l.min);
}

/** NOAA-style heat index approximation (metric in, metric out), only meaningful above ~20°C. */
function heatIndexC(tempC, humidity) {
  if (tempC < 20) return tempC;
  const tempF = tempC * 9 / 5 + 32;
  const hi =
    -42.379 + 2.04901523 * tempF + 10.14333127 * humidity
    - 0.22475541 * tempF * humidity - 0.00683783 * tempF * tempF
    - 0.05481717 * humidity * humidity + 0.00122874 * tempF * tempF * humidity
    + 0.00085282 * tempF * humidity * humidity - 0.00000199 * tempF * tempF * humidity * humidity;
  return (hi - 32) * 5 / 9;
}

/** Environment-Canada wind chill formula (metric), only meaningful below ~10°C with wind. */
function windChillC(tempC, windKmh) {
  if (tempC > 10 || windKmh < 5) return tempC;
  return 13.12 + 0.6215 * tempC - 11.37 * Math.pow(windKmh, 0.16) + 0.3965 * tempC * Math.pow(windKmh, 0.16);
}

/**
 * Scores a single hour of weather for running suitability.
 * @param {object} hour one row from the normalized `hourly` array, plus optional `is_day`
 * @returns {{score:number, feelsLike:number, factors:string[]}}
 */
export function scoreHour(hour) {
  let score = 100;
  const factors = [];

  const temp = hour.apparent_temperature ?? hour.temperature_2m;
  const humidity = hour.relative_humidity_2m ?? 50;
  const wind = hour.wind_speed_10m ?? 0;
  const gusts = hour.wind_gusts_10m ?? wind;
  const precipProb = hour.precipitation_probability ?? 0;
  const precip = hour.precipitation ?? 0;
  const uv = hour.uv_index ?? 0;
  const code = hour.weather_code ?? 0;
  const pm25 = hour.pm2_5;

  const feelsHot = heatIndexC(temp, humidity);
  const feelsCold = windChillC(temp, wind);
  const feelsLike = temp >= 20 ? feelsHot : temp <= 10 ? feelsCold : temp;

  // --- Temperature comfort (ideal running range ~5-15°C apparent) ---
  if (feelsLike > 15) {
    const over = feelsLike - 15;
    const penalty = Math.min(55, over * 3.2);
    score -= penalty;
    if (over > 8) factors.push('высокий риск перегрева');
  } else if (feelsLike < 5) {
    const under = 5 - feelsLike;
    const penalty = Math.min(50, under * 3);
    score -= penalty;
    if (under > 15) factors.push('риск переохлаждения');
  }

  // --- Humidity compounding heat stress ---
  if (temp > 18 && humidity > 75) {
    score -= 10;
    factors.push('высокая влажность усиливает жару');
  }

  // --- Wind ---
  if (wind > 40) { score -= 18; factors.push('сильный ветер'); }
  else if (wind > 20) { score -= 8; factors.push('заметный ветер'); }
  if (gusts > 55) { score -= 10; factors.push('сильные порывы ветра'); }

  // --- Precipitation ---
  if (precip > 4 || HEAVY_RAIN_CODES.has(code)) { score -= 30; factors.push('сильный дождь'); }
  else if (precipProb > 60 || precip > 0.5) { score -= 15; factors.push('вероятен дождь'); }
  else if (precipProb > 30) { score -= 6; }

  // --- Severe / hazardous conditions override ---
  if (THUNDER_CODES.has(code)) { score = Math.min(score, 15); factors.push('гроза — риск для жизни'); }
  if (ICE_CODES.has(code)) { score = Math.min(score, 20); factors.push('гололедица'); }
  if (SNOW_CODES.has(code)) { score -= 20; factors.push('снегопад'); }

  // --- UV exposure ---
  if (uv >= 8) { score -= 10; factors.push('очень высокий УФ-индекс'); }
  else if (uv >= 6) { score -= 5; factors.push('высокий УФ-индекс'); }

  // --- Air quality ---
  if (typeof pm25 === 'number') {
    if (pm25 > 55) { score -= 25; factors.push('плохое качество воздуха (PM2.5)'); }
    else if (pm25 > 35) { score -= 12; factors.push('умеренно плохое качество воздуха'); }
    else if (pm25 > 15) { score -= 4; }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, feelsLike: Math.round(feelsLike * 10) / 10, factors };
}

/**
 * Builds a 24-segment comfort timeline starting from the current hour.
 * @param {Array} hourlyRows normalized hourly rows (>= 24 entries expected)
 * @returns {Array<{time:string, score:number, level:object}>}
 */
export function buildComfortTimeline(hourlyRows) {
  return hourlyRows.slice(0, 24).map((row) => {
    const { score } = scoreHour(row);
    return { time: row.time, score, level: levelForScore(score) };
  });
}

/** Picks the current hour's row from an hourly array, matching against a Date. */
function findCurrentHourRow(hourlyRows, now = new Date()) {
  const targetPrefix = now.toISOString().slice(0, 13); // "YYYY-MM-DDTHH"
  return (
    hourlyRows.find((row) => row.time.slice(0, 13) === targetPrefix) || hourlyRows[0]
  );
}

/** Builds the clothing advice string for a given "feels like" temperature. */
function clothingAdvice(feelsLike) {
  if (feelsLike >= 25) return 'Майка и лёгкие шорты, светлые тона';
  if (feelsLike >= 20) return 'Футболка и шорты';
  if (feelsLike >= 15) return 'Футболка с коротким рукавом и шорты';
  if (feelsLike >= 10) return 'Лонгслив или футболка + шорты/тайтсы';
  if (feelsLike >= 5) return 'Лонгслив, тайтсы, лёгкая ветровка';
  if (feelsLike >= 0) return 'Термослой, тайтсы, ветрозащитная куртка, перчатки, шапка';
  return 'Полный зимний комплект: термобельё, утеплённая куртка, перчатки, шапка, баф';
}

/**
 * Produces the full set of running recommendations for the current conditions,
 * given the current hour, the rest of today's hourly rows and today's daily summary.
 */
export function generateRecommendations(currentHourRow, todayHourlyRows, dailyToday) {
  const { score, feelsLike, factors } = scoreHour(currentHourRow);
  const level = levelForScore(score);

  const wind = currentHourRow.wind_speed_10m ?? 0;
  const precipProb = currentHourRow.precipitation_probability ?? 0;
  const precip = currentHourRow.precipitation ?? 0;
  const uv = currentHourRow.uv_index ?? 0;
  const code = currentHourRow.weather_code ?? 0;
  const isSevere = THUNDER_CODES.has(code) || ICE_CODES.has(code);

  const overheatRisk = feelsLike >= 25 ? 'высокий' : feelsLike >= 20 ? 'умеренный' : feelsLike >= 15 ? 'низкий' : 'минимальный';
  const hypothermiaRisk = feelsLike <= -2 || (feelsLike <= 5 && wind > 25);

  // Rough hydration guidance for ~60min of running effort.
  let waterMl = 400;
  if (feelsLike >= 25) waterMl = 750;
  else if (feelsLike >= 18) waterMl = 600;
  else if (feelsLike <= 0) waterMl = 300;

  return {
    score,
    feelsLike,
    level,
    factors,
    paceTypes: {
      easyRun: score >= 50 && !isSevere,
      longRun: score >= 65 && precipProb < 40 && wind < 25 && !isSevere,
      intervals: score >= 70 && feelsLike <= 20 && !isSevere,
      tempo: score >= 65 && feelsLike <= 22 && !isSevere,
      recovery: score >= 35 && !isSevere,
    },
    overheatRisk,
    hypothermiaRisk,
    waterMl,
    needSunProtection: uv >= 5,
    needWindbreaker: wind >= 22 || feelsLike < 8,
    needRaincoat: precipProb >= 55 || precip > 1,
    needGloves: feelsLike <= 5,
    needHat: feelsLike <= 5 || uv >= 7,
    clothing: clothingAdvice(feelsLike),
    isSevere,
  };
}

/**
 * Scans the next few hours for a meaningful drop in conditions and returns a
 * warning message if the forecast deteriorates, or null if things look stable.
 * @param {Array} hourlyRows normalized hourly rows starting at (or after) "now"
 * @param {number} lookaheadHours how many hours ahead to scan (default 6)
 */
export function checkDeteriorationWarning(hourlyRows, lookaheadHours = 6) {
  if (!hourlyRows.length) return null;
  const baseline = scoreHour(hourlyRows[0]).score;
  const baselineCode = hourlyRows[0].weather_code;

  for (let i = 1; i < Math.min(lookaheadHours + 1, hourlyRows.length); i++) {
    const row = hourlyRows[i];
    const { score } = scoreHour(row);
    const code = row.weather_code;

    const newSevere =
      (THUNDER_CODES.has(code) && !THUNDER_CODES.has(baselineCode)) ||
      (HEAVY_RAIN_CODES.has(code) && !HEAVY_RAIN_CODES.has(baselineCode)) ||
      (SNOW_CODES.has(code) && !SNOW_CODES.has(baselineCode));

    if (newSevere || baseline - score >= 25) {
      const time = new Date(row.time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      return {
        time,
        message: `Ожидается ухудшение условий к ${time} — рекомендуем пробежать пораньше или перенести тренировку.`,
      };
    }
  }
  return null;
}

export const runnerEngine = {
  scoreHour,
  levelForScore,
  buildComfortTimeline,
  findCurrentHourRow,
  generateRecommendations,
  checkDeteriorationWarning,
};
