/**
 * runner-engine.test.js
 * ---------------------------------------------------------------------------
 * Run with: npm install && npm test  (see package.json)
 *
 * Covers the boundary cases that matter most for a safety-relevant scoring
 * function: severe weather overrides, extreme heat/cold, and personalization
 * shifting the comfort bounds in the expected direction.
 */

import { describe, it, expect } from 'vitest';
import {
  scoreHour,
  levelForScore,
  findBestWindow,
  estimatePaceAdjustment,
  checkDeteriorationWarning,
} from '../js/runner-engine.js';

/** Builds a minimal hourly row, filling in comfortable defaults for anything unspecified. */
function hour(overrides = {}) {
  return {
    time: '2026-07-14T12:00',
    temperature_2m: 15,
    apparent_temperature: 15,
    relative_humidity_2m: 50,
    wind_speed_10m: 8,
    wind_gusts_10m: 12,
    precipitation_probability: 0,
    precipitation: 0,
    uv_index: 2,
    weather_code: 1,
    pm2_5: 8,
    ...overrides,
  };
}

describe('scoreHour — comfort scoring', () => {
  it('scores an ideal running hour near 100', () => {
    const { score } = scoreHour(hour());
    expect(score).toBeGreaterThanOrEqual(90);
  });

  it('heavily penalizes thunderstorms regardless of otherwise-mild conditions', () => {
    const { score, factors } = scoreHour(hour({ weather_code: 95 }));
    expect(score).toBeLessThanOrEqual(15);
    expect(factors.join(' ')).toMatch(/гроза/);
  });

  it('penalizes extreme heat and flags overheating risk', () => {
    const { score, factors } = scoreHour(hour({ temperature_2m: 34, apparent_temperature: 38, relative_humidity_2m: 80 }));
    expect(score).toBeLessThan(50);
    expect(factors.join(' ')).toMatch(/перегрева/);
  });

  it('penalizes extreme cold and flags hypothermia risk factor', () => {
    const { score, factors } = scoreHour(hour({ temperature_2m: -18, apparent_temperature: -25 }));
    expect(score).toBeLessThanOrEqual(50);
    expect(factors.join(' ')).toMatch(/переохлаждения/);
  });

  it('never returns a score outside [0, 100]', () => {
    const worst = scoreHour(hour({
      temperature_2m: 45, apparent_temperature: 48, relative_humidity_2m: 95,
      wind_speed_10m: 80, wind_gusts_10m: 110, weather_code: 99, pm2_5: 300,
    }));
    expect(worst.score).toBeGreaterThanOrEqual(0);
    expect(worst.score).toBeLessThanOrEqual(100);
  });

  it('applies personalization: a heat-adapted profile scores a warm hour higher than a heat-sensitive one', () => {
    const warmHour = hour({ temperature_2m: 24, apparent_temperature: 26 });
    const adapted = scoreHour(warmHour, { heatTolerance: 'adapted', coldTolerance: 'average' });
    const sensitive = scoreHour(warmHour, { heatTolerance: 'sensitive', coldTolerance: 'average' });
    expect(adapted.score).toBeGreaterThan(sensitive.score);
  });

  it('applies personalization: a cold-adapted profile scores a cold hour higher than a cold-sensitive one', () => {
    const coldHour = hour({ temperature_2m: -2, apparent_temperature: -4 });
    const adapted = scoreHour(coldHour, { heatTolerance: 'average', coldTolerance: 'adapted' });
    const sensitive = scoreHour(coldHour, { heatTolerance: 'average', coldTolerance: 'sensitive' });
    expect(adapted.score).toBeGreaterThan(sensitive.score);
  });
});

describe('levelForScore — five-tier classification', () => {
  it('maps scores to the expected emoji/label tiers', () => {
    expect(levelForScore(95).key).toBe('excellent');
    expect(levelForScore(80).key).toBe('good');
    expect(levelForScore(60).key).toBe('caution');
    expect(levelForScore(40).key).toBe('poor');
    expect(levelForScore(10).key).toBe('bad');
  });
});

describe('findBestWindow', () => {
  it('picks the highest-scoring contiguous window', () => {
    const timeline = Array.from({ length: 24 }, (_, i) => ({
      time: `2026-07-14T${String(i).padStart(2, '0')}:00`,
      score: i === 18 || i === 19 ? 95 : 40,
      level: levelForScore(i === 18 || i === 19 ? 95 : 40),
    }));
    const best = findBestWindow(timeline, 2);
    expect(best).not.toBeNull();
    expect(best.startTime).toBe('2026-07-14T18:00');
  });

  it('returns null when nothing in the day is good enough', () => {
    const timeline = Array.from({ length: 24 }, (_, i) => ({
      time: `2026-07-14T${String(i).padStart(2, '0')}:00`,
      score: 20,
      level: levelForScore(20),
    }));
    expect(findBestWindow(timeline, 2)).toBeNull();
  });
});

describe('estimatePaceAdjustment', () => {
  it('adds no adjustment in the comfortable range', () => {
    expect(estimatePaceAdjustment(10).secPerKm).toBe(0);
  });

  it('adds a positive adjustment for heat, capped at 60 sec/km', () => {
    expect(estimatePaceAdjustment(20).secPerKm).toBeGreaterThan(0);
    expect(estimatePaceAdjustment(60).secPerKm).toBeLessThanOrEqual(60);
  });

  it('adds a small capped adjustment for deep cold', () => {
    expect(estimatePaceAdjustment(-15).secPerKm).toBeGreaterThan(0);
    expect(estimatePaceAdjustment(-15).secPerKm).toBeLessThanOrEqual(20);
  });
});

describe('checkDeteriorationWarning', () => {
  it('flags a new thunderstorm appearing later in the day', () => {
    const rows = [hour({ time: 't0' }), hour({ time: 't1' }), hour({ time: 't2', weather_code: 95 })];
    const warning = checkDeteriorationWarning(rows, 6);
    expect(warning).not.toBeNull();
  });

  it('returns null when conditions stay flat', () => {
    const rows = [hour({ time: 't0' }), hour({ time: 't1' }), hour({ time: 't2' })];
    expect(checkDeteriorationWarning(rows, 6)).toBeNull();
  });
});
