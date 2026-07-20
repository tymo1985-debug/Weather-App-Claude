/**
 * climate.js
 * ---------------------------------------------------------------------------
 * Open-Meteo doesn't expose a ready-made "daily normals" endpoint, so this
 * approximates one: it pulls daily max/min temperatures for a ±3-day window
 * around today's date from the last few years (via the free Historical
 * Weather / Archive API) and averages them. It's a rough estimate (a proper
 * 30-year climate normal needs far more samples), but it's enough to say
 * "today is unusually warm/cold for the time of year" — which is the goal.
 *
 * This is deliberately lazy-loaded and cached (see storage.js) since it costs
 * several archive API requests — we don't want to redo this on every visit.
 */

const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';

function toDateStr(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * @param {number} latitude
 * @param {number} longitude
 * @param {Date} [referenceDate] defaults to today
 * @param {number} [yearsBack] how many past years to sample, default 5
 * @param {number} [windowDays] +/- days around the reference date, default 3
 * @returns {Promise<{avgHigh:number, avgLow:number, sampleSize:number, yearsBack:number} | null>}
 */
export async function fetchClimateNorm(latitude, longitude, referenceDate = new Date(), yearsBack = 5, windowDays = 3) {
  const requests = [];
  for (let y = 1; y <= yearsBack; y++) {
    const year = referenceDate.getFullYear() - y;
    const start = new Date(year, referenceDate.getMonth(), referenceDate.getDate() - windowDays);
    const end = new Date(year, referenceDate.getMonth(), referenceDate.getDate() + windowDays);

    const url = new URL(ARCHIVE_URL);
    url.searchParams.set('latitude', latitude);
    url.searchParams.set('longitude', longitude);
    url.searchParams.set('start_date', toDateStr(start));
    url.searchParams.set('end_date', toDateStr(end));
    url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min');
    url.searchParams.set('timezone', 'auto');

    requests.push(
      fetch(url.toString())
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
    );
  }

  const results = await Promise.all(requests);
  const highs = [];
  const lows = [];
  for (const r of results) {
    if (!r?.daily?.temperature_2m_max) continue;
    for (const v of r.daily.temperature_2m_max) if (v != null) highs.push(v);
    for (const v of r.daily.temperature_2m_min) if (v != null) lows.push(v);
  }
  if (!highs.length) return null;

  const avg = (arr) => arr.reduce((sum, v) => sum + v, 0) / arr.length;
  return {
    avgHigh: Math.round(avg(highs) * 10) / 10,
    avgLow: Math.round(avg(lows) * 10) / 10,
    sampleSize: highs.length,
    yearsBack,
  };
}

/** Builds the "MM-DD" cache key used to store one norm per calendar day per city. */
export function climateNormCacheKey(date = new Date()) {
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
