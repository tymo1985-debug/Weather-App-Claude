/**
 * weather-api.js
 * ---------------------------------------------------------------------------
 * All weather data access goes through the `WeatherProvider` interface below.
 * `OpenMeteoProvider` is the concrete implementation used today; swapping to
 * a different vendor later means writing a new class with the same
 * `fetchWeather(latitude, longitude)` contract and normalized output shape -
 * nothing else in the app needs to change.
 *
 * Normalized output shape:
 * {
 *   current: { ... },
 *   hourly:  [ { time, ... }, ... ]   // next 48h
 *   daily:   [ { date, ... }, ... ]   // next 10 days
 *   airQuality: { current: {...}, hourly: [...] } | null
 * }
 */

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const AIR_QUALITY_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';

const CURRENT_FIELDS = [
  'temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'is_day',
  'precipitation', 'rain', 'showers', 'snowfall', 'weather_code',
  'cloud_cover', 'pressure_msl', 'surface_pressure', 'dew_point_2m',
  'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m',
];

const HOURLY_FIELDS = [
  'temperature_2m', 'relative_humidity_2m', 'dew_point_2m', 'apparent_temperature',
  'precipitation_probability', 'precipitation', 'weather_code', 'cloud_cover',
  'visibility', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'uv_index',
  'is_day',
];

const DAILY_FIELDS = [
  'weather_code', 'temperature_2m_max', 'temperature_2m_min',
  'apparent_temperature_max', 'apparent_temperature_min',
  'sunrise', 'sunset', 'daylight_duration', 'uv_index_max',
  'precipitation_sum', 'precipitation_probability_max',
  'wind_speed_10m_max', 'wind_gusts_10m_max',
];

/** Transposes a `{field: [values...]}` hourly/daily block into an array of row objects. */
function transpose(block) {
  if (!block || !block.time) return [];
  const keys = Object.keys(block).filter((k) => k !== 'time');
  return block.time.map((time, i) => {
    const row = { time };
    for (const key of keys) row[key] = block[key][i];
    return row;
  });
}

/** Simple delay helper used between retry attempts. */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetches a URL with exponential-backoff retries, since flaky mobile
 * connections are the norm rather than the exception for this app.
 * @param {string} url
 * @param {{retries?: number, baseDelayMs?: number}} [options]
 */
async function fetchWithRetry(url, { retries = 2, baseDelayMs = 600 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (err) {
      lastError = err;
      if (attempt < retries) await sleep(baseDelayMs * 2 ** attempt);
    }
  }
  throw lastError;
}

class OpenMeteoProvider {
  /**
   * Fetches current conditions, 48h hourly forecast, 10-day daily forecast
   * and air quality (best-effort) for the given coordinates.
   */
  async fetchWeather(latitude, longitude) {
    const forecastUrl = new URL(FORECAST_URL);
    forecastUrl.searchParams.set('latitude', latitude);
    forecastUrl.searchParams.set('longitude', longitude);
    forecastUrl.searchParams.set('current', CURRENT_FIELDS.join(','));
    forecastUrl.searchParams.set('hourly', HOURLY_FIELDS.join(','));
    forecastUrl.searchParams.set('daily', DAILY_FIELDS.join(','));
    forecastUrl.searchParams.set('minutely_15', 'precipitation');
    forecastUrl.searchParams.set('timezone', 'auto');
    forecastUrl.searchParams.set('forecast_days', '10');
    forecastUrl.searchParams.set('forecast_hours', '48');
    forecastUrl.searchParams.set('forecast_minutely_15', '8'); // next 2 hours in 15-min steps

    const [forecastRes, airRes] = await Promise.allSettled([
      fetchWithRetry(forecastUrl.toString(), { retries: 2, baseDelayMs: 600 }),
      this.#fetchAirQuality(latitude, longitude),
    ]);

    if (forecastRes.status !== 'fulfilled') {
      throw new Error('Failed to fetch weather forecast after retries');
    }
    const forecast = await forecastRes.value.json();
    const airQuality = airRes.status === 'fulfilled' ? airRes.value : null;

    return this.#normalize(forecast, airQuality);
  }

  async #fetchAirQuality(latitude, longitude) {
    const url = new URL(AIR_QUALITY_URL);
    url.searchParams.set('latitude', latitude);
    url.searchParams.set('longitude', longitude);
    url.searchParams.set('current', 'pm10,pm2_5,us_aqi,european_aqi');
    url.searchParams.set('hourly', 'pm10,pm2_5,us_aqi');
    url.searchParams.set('forecast_days', '2');

    const response = await fetchWithRetry(url.toString(), { retries: 1, baseDelayMs: 500 });
    return response.json();
  }

  #normalize(forecast, air) {
    const hourly = transpose(forecast.hourly);
    const daily = transpose(forecast.daily);
    const minutely15 = transpose(forecast.minutely_15);
    const airHourlyByTime = new Map(
      air ? transpose(air.hourly).map((row) => [row.time, row]) : []
    );

    // Merge PM2.5/PM10/AQI onto the matching hourly rows so callers get one row per hour.
    for (const row of hourly) {
      const airRow = airHourlyByTime.get(row.time);
      row.pm2_5 = airRow ? airRow.pm2_5 : null;
      row.pm10 = airRow ? airRow.pm10 : null;
      row.us_aqi = airRow ? airRow.us_aqi : null;
    }

    return {
      timezone: forecast.timezone,
      current: {
        ...forecast.current,
        pm2_5: air ? air.current?.pm2_5 ?? null : null,
        pm10: air ? air.current?.pm10 ?? null : null,
        us_aqi: air ? air.current?.us_aqi ?? null : null,
        european_aqi: air ? air.current?.european_aqi ?? null : null,
      },
      hourly,
      daily,
      minutely15,
    };
  }
}

/** Singleton provider instance used across the app; see class docs above for swap instructions. */
export const weatherProvider = new OpenMeteoProvider();
