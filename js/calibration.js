/**
 * calibration.js
 * ---------------------------------------------------------------------------
 * NOTE on scope: a "real" auto-calibration against Garmin Connect would need
 * OAuth2, a backend to hold the client secret, and Garmin's Health API
 * approval — none of which fits a static, keyless PWA. This module is the
 * pragmatic alternative: the runner taps how a run felt right after finishing
 * it, and once a clear pattern shows up (3+ consistent reports), the app
 * suggests — and can apply — a tolerance adjustment automatically. It's a
 * much smaller feature, but it doesn't require any server-side component.
 */

const HISTORY_KEY = 'weatherApp.runFeedback';
const MAX_HISTORY = 12;
const SUGGESTION_THRESHOLD = 3; // consecutive same-direction reports before suggesting a change

function readHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

function writeHistory(history) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-MAX_HISTORY)));
}

/**
 * Records how a run felt relative to the conditions at the time.
 * @param {'hot'|'ok'|'cold'} feeling
 * @param {number} feelsLikeAtRunTime apparent temperature when logged
 */
export function recordRunFeedback(feeling, feelsLikeAtRunTime) {
  const history = readHistory();
  history.push({ feeling, feelsLike: feelsLikeAtRunTime, at: Date.now() });
  writeHistory(history);
  return history;
}

/**
 * Looks at the most recent feedback entries and suggests a profile change
 * if there's a consistent pattern (e.g. repeatedly saying a warm run felt
 * "hot" suggests the runner is more heat-sensitive than the current setting).
 * @param {object} currentProfile { heatTolerance, coldTolerance }
 * @returns {{kind: 'heatTolerance'|'coldTolerance', suggestedValue: string, reason: string} | null}
 */
export function suggestProfileAdjustment(currentProfile) {
  const history = readHistory();
  const recentHot = history.filter((h) => h.feeling === 'hot' && h.feelsLike >= 15).slice(-SUGGESTION_THRESHOLD);
  const recentCold = history.filter((h) => h.feeling === 'cold' && h.feelsLike <= 10).slice(-SUGGESTION_THRESHOLD);

  if (recentHot.length >= SUGGESTION_THRESHOLD && currentProfile.heatTolerance !== 'sensitive') {
    const next = currentProfile.heatTolerance === 'adapted' ? 'average' : 'sensitive';
    return { kind: 'heatTolerance', suggestedValue: next, reason: `Последние ${SUGGESTION_THRESHOLD} тёплых пробежки ощущались как жаркие` };
  }
  if (recentCold.length >= SUGGESTION_THRESHOLD && currentProfile.coldTolerance !== 'sensitive') {
    const next = currentProfile.coldTolerance === 'adapted' ? 'average' : 'sensitive';
    return { kind: 'coldTolerance', suggestedValue: next, reason: `Последние ${SUGGESTION_THRESHOLD} прохладных пробежки ощущались как холодные` };
  }
  return null;
}

export function getRunFeedbackHistory() {
  return readHistory();
}
