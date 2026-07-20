/**
 * meteoalarm.js
 * ---------------------------------------------------------------------------
 * CAVEAT: MeteoAlarm doesn't publish a simple JSON API — this fetches their
 * public per-country Atom feed and parses it defensively. I built this from
 * memory of MeteoAlarm's feed layout without being able to test it live in
 * this environment (no network access here), so the exact feed URL pattern
 * or field names may have drifted since. If warnings never appear even
 * during a known active alert, that's the most likely reason — the fetch
 * fails silently (by design, see below) rather than breaking the app, but
 * the URL pattern is the first thing worth double-checking against
 * https://meteoalarm.org if that happens.
 *
 * Every failure mode here (unmapped country, network error, unexpected feed
 * shape) resolves to `null`/`[]` rather than throwing, so a bad feed can
 * never take down the rest of the app — it just means this section stays
 * hidden.
 */

const FEED_BASE = 'https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-';

// MeteoAlarm covers EU/EEA + a few neighbors. Extend this map if you add
// favorite cities in other covered countries — the country name has to match
// whatever the geocoding provider returns (see js/geocoding.js).
const COUNTRY_SLUGS = {
  Poland: 'poland',
  Czechia: 'czechia',
  'Czech Republic': 'czechia',
  Austria: 'austria',
  Germany: 'germany',
  Slovakia: 'slovakia',
  Hungary: 'hungary',
  France: 'france',
  Italy: 'italy',
  Spain: 'spain',
  Netherlands: 'netherlands',
  Belgium: 'belgium',
  Switzerland: 'switzerland',
  'United Kingdom': 'united-kingdom',
};

const SEVERITY_PATTERNS = [
  { pattern: /red warning/i, emoji: '🔴' },
  { pattern: /orange warning/i, emoji: '🟠' },
  { pattern: /yellow warning/i, emoji: '🟡' },
];

function detectSeverityEmoji(title) {
  const match = SEVERITY_PATTERNS.find((p) => p.pattern.test(title));
  return match ? match.emoji : '⚠️';
}

/**
 * @param {string} countryName as returned by the geocoding provider
 * @returns {Promise<Array<{title:string, summary:string, emoji:string}> | null>}
 *   null means "country not covered / lookup not possible", [] means
 *   "covered, but no active warnings right now".
 */
export async function fetchMeteoAlarmWarnings(countryName) {
  const slug = COUNTRY_SLUGS[countryName];
  if (!slug) return null;

  try {
    const response = await fetch(`${FEED_BASE}${slug}`);
    if (!response.ok) return null;
    const text = await response.text();
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror')) return null;

    const entries = Array.from(doc.querySelectorAll('entry'));
    const warnings = [];
    for (const entry of entries) {
      const title = entry.querySelector('title')?.textContent?.trim();
      const summary = entry.querySelector('summary')?.textContent?.trim() || '';
      if (!title || /no warnings? in force/i.test(title)) continue;
      warnings.push({ title, summary, emoji: detectSeverityEmoji(title) });
    }
    return warnings;
  } catch (err) {
    console.warn('MeteoAlarm fetch/parse failed:', err);
    return null;
  }
}
