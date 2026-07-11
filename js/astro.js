/**
 * astro.js
 * ---------------------------------------------------------------------------
 * Small astronomy helpers that Open-Meteo does not provide directly:
 * moon phase (name + illumination + emoji) and human-friendly duration
 * formatting for sunrise/sunset/daylight values.
 */

const SYNODIC_MONTH_DAYS = 29.530588853;
// A known new moon reference instant (2000-01-06 18:14 UTC).
const KNOWN_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14, 0);

const PHASES = [
  { max: 0.033, name: 'Новолуние', emoji: '🌑' },
  { max: 0.235, name: 'Растущий серп', emoji: '🌒' },
  { max: 0.283, name: 'Первая четверть', emoji: '🌓' },
  { max: 0.467, name: 'Растущая луна', emoji: '🌔' },
  { max: 0.533, name: 'Полнолуние', emoji: '🌕' },
  { max: 0.717, name: 'Убывающая луна', emoji: '🌖' },
  { max: 0.783, name: 'Последняя четверть', emoji: '🌗' },
  { max: 0.967, name: 'Убывающий серп', emoji: '🌘' },
  { max: 1.001, name: 'Новолуние', emoji: '🌑' },
];

/**
 * Computes the moon phase for a given date.
 * @param {Date} date
 * @returns {{ name: string, emoji: string, illumination: number, age: number }}
 *   illumination is 0..1 (fraction of the disc lit), age is days since new moon.
 */
export function getMoonPhase(date = new Date()) {
  const daysSinceKnownNewMoon = (date.getTime() - KNOWN_NEW_MOON_MS) / 86400000;
  const age = daysSinceKnownNewMoon % SYNODIC_MONTH_DAYS;
  const normalizedAge = age < 0 ? age + SYNODIC_MONTH_DAYS : age;
  const cyclePosition = normalizedAge / SYNODIC_MONTH_DAYS; // 0..1

  // Illumination approximated as a cosine curve peaking at full moon (cyclePosition = 0.5).
  const illumination = (1 - Math.cos(2 * Math.PI * cyclePosition)) / 2;

  const phase = PHASES.find((p) => cyclePosition <= p.max) || PHASES[PHASES.length - 1];
  return {
    name: phase.name,
    emoji: phase.emoji,
    illumination: Math.round(illumination * 100) / 100,
    age: Math.round(normalizedAge * 10) / 10,
  };
}

/** Formats a duration given in seconds as "Хч Мм" (e.g. "14ч 32м"). */
export function formatDurationHM(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  return `${hours}ч ${minutes.toString().padStart(2, '0')}м`;
}

/** Formats an ISO time string as a locale-aware "HH:MM". */
export function formatTimeHM(isoString) {
  const date = new Date(isoString);
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}
