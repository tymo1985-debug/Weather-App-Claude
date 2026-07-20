/**
 * ensemble.js
 * ---------------------------------------------------------------------------
 * Open-Meteo can return forecasts from several distinct weather models in
 * one request via the `models` parameter. When those models agree closely,
 * the forecast is more trustworthy; when they diverge, that's worth telling
 * the person rather than presenting a single confident-looking number.
 *
 * This only checks today's max temperature across a handful of models — a
 * full ensemble comparison (every variable, every day) would be a much
 * bigger fetch for marginal extra insight, so this keeps it to one cheap,
 * high-signal check.
 */

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const MODELS = ['ecmwf_ifs025', 'gfs_seamless', 'icon_seamless'];

/**
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<{spread:number, agreement:'high'|'low', min:number, max:number} | null>}
 */
export async function checkModelAgreement(latitude, longitude) {
  const url = new URL(FORECAST_URL);
  url.searchParams.set('latitude', latitude);
  url.searchParams.set('longitude', longitude);
  url.searchParams.set('daily', 'temperature_2m_max');
  url.searchParams.set('models', MODELS.join(','));
  url.searchParams.set('forecast_days', '1');
  url.searchParams.set('timezone', 'auto');

  const response = await fetch(url.toString());
  if (!response.ok) return null;
  const data = await response.json();

  // With multiple models requested, Open-Meteo suffixes each field per model,
  // e.g. temperature_2m_max_ecmwf_ifs025, temperature_2m_max_gfs_seamless...
  const values = MODELS
    .map((model) => data.daily?.[`temperature_2m_max_${model}`]?.[0])
    .filter((v) => typeof v === 'number');

  if (values.length < 2) return null; // not enough models responded to compare

  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.round((max - min) * 10) / 10;
  return { spread, agreement: spread <= 2 ? 'high' : 'low', min, max };
}
