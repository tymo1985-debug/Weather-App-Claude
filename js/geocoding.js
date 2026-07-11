/**
 * geocoding.js
 * ---------------------------------------------------------------------------
 * Resolves free-text city search and device coordinates into a normalized
 * `City` shape:
 *   { id, name, country, admin1, latitude, longitude, timezone }
 *
 * Two independent providers are used (both free, keyless):
 *  - Open-Meteo Geocoding API for forward search (name -> coordinates)
 *  - BigDataCloud reverse-geocoding for coordinates -> place name
 * Both are wrapped so that swapping either provider later only means
 * touching this file.
 */

const GEOCODING_SEARCH_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const REVERSE_GEOCODING_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client';

/** Builds a stable id for a city so it can be compared/deduplicated. */
function buildCityId(latitude, longitude) {
  return `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
}

function normalizeSearchResult(result) {
  return {
    id: buildCityId(result.latitude, result.longitude),
    name: result.name,
    country: result.country || '',
    admin1: result.admin1 || '',
    latitude: result.latitude,
    longitude: result.longitude,
    timezone: result.timezone || 'auto',
  };
}

/**
 * Searches for cities matching a free-text query.
 * @param {string} query
 * @param {string} language two-letter UI language code, used to localize names
 * @returns {Promise<Array>} up to 10 matching cities
 */
export async function searchCities(query, language = 'ru') {
  if (!query || query.trim().length < 2) return [];
  const url = new URL(GEOCODING_SEARCH_URL);
  url.searchParams.set('name', query.trim());
  url.searchParams.set('count', '10');
  url.searchParams.set('language', language);
  url.searchParams.set('format', 'json');

  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`Geocoding search failed: ${response.status}`);
  const data = await response.json();
  return (data.results || []).map(normalizeSearchResult);
}

/**
 * Resolves device coordinates to a human-readable city name.
 * Falls back to raw coordinates if the reverse lookup fails, so the caller
 * always gets a usable City object.
 */
export async function reverseGeocode(latitude, longitude) {
  const fallback = {
    id: buildCityId(latitude, longitude),
    name: `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`,
    country: '',
    admin1: '',
    latitude,
    longitude,
    timezone: 'auto',
  };

  try {
    const url = new URL(REVERSE_GEOCODING_URL);
    url.searchParams.set('latitude', latitude);
    url.searchParams.set('longitude', longitude);
    url.searchParams.set('localityLanguage', 'ru');

    const response = await fetch(url.toString());
    if (!response.ok) return fallback;
    const data = await response.json();

    const name = data.city || data.locality || data.principalSubdivision || fallback.name;
    return {
      id: buildCityId(latitude, longitude),
      name,
      country: data.countryName || '',
      admin1: data.principalSubdivision || '',
      latitude,
      longitude,
      timezone: 'auto',
    };
  } catch (err) {
    console.warn('reverseGeocode failed, using coordinates as name', err);
    return fallback;
  }
}

/**
 * Wraps the browser Geolocation API in a Promise with a sane timeout.
 * @returns {Promise<{latitude:number, longitude:number}>}
 */
export function getDeviceLocation() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation is not supported on this device'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5 * 60 * 1000 }
    );
  });
}
