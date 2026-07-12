/**
 * units.js
 * ---------------------------------------------------------------------------
 * Pure conversion helpers. The weather provider always returns metric values
 * (°C, km/h); these functions convert for display only, right at the UI
 * boundary, so all scoring/business logic (runner-engine.js) can keep
 * working in metric internally regardless of the user's display preference.
 */

/** Converts a Celsius value to the user's preferred display unit and rounds it. */
export function formatTemp(celsius, units) {
  const value = units === 'imperial' ? celsius * 9 / 5 + 32 : celsius;
  return `${Math.round(value)}°`;
}

/** Converts a km/h wind speed to the user's preferred display unit, with its label. */
export function formatWind(kmh, windUnit) {
  switch (windUnit) {
    case 'ms': return `${Math.round(kmh / 3.6)} м/с`;
    case 'mph': return `${Math.round(kmh / 1.60934)} миль/ч`;
    default: return `${Math.round(kmh)} км/ч`;
  }
}

export const UNIT_LABELS = {
  units: { metric: '°C', imperial: '°F' },
  windUnit: { kmh: 'км/ч', ms: 'м/с', mph: 'миль/ч' },
};
