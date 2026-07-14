/**
 * share.js
 * ---------------------------------------------------------------------------
 * Draws a square "share card" (current conditions + runner verdict) onto an
 * offscreen canvas, then hands it to the Web Share API (with the file
 * attached, so it drops straight into Messages/Telegram/etc.) or falls back
 * to a plain image download where Web Share isn't available (e.g. desktop).
 */

/**
 * @param {HTMLCanvasElement} canvas offscreen canvas element to draw into
 * @param {{city:object, current:object, dailyToday:object, recommendation:object, settings:object}} data
 */
export function drawShareCard(canvas, { city, current, dailyToday, recommendation, settings }) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  const bgGradient = ctx.createLinearGradient(0, 0, W, H);
  if (isDark) {
    bgGradient.addColorStop(0, '#171C33');
    bgGradient.addColorStop(1, '#2F3B8F');
  } else {
    bgGradient.addColorStop(0, '#6C8CFF');
    bgGradient.addColorStop(1, '#3E5EEA');
  }
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#FFFFFF';
  ctx.textBaseline = 'alphabetic';

  ctx.font = '600 42px -apple-system, Roboto, sans-serif';
  ctx.fillText(city.name, 60, 110);

  ctx.font = '200 220px -apple-system, Roboto, sans-serif';
  const tempUnit = settings.units === 'imperial' ? '°F' : '°C';
  const tempValue = settings.units === 'imperial' ? Math.round(current.temperature_2m * 9 / 5 + 32) : Math.round(current.temperature_2m);
  ctx.fillText(`${tempValue}°`, 60, 380);

  ctx.font = '500 38px -apple-system, Roboto, sans-serif';
  ctx.globalAlpha = 0.9;
  ctx.fillText(`Ощущается как ${Math.round(current.apparent_temperature)}°${tempUnit === '°F' ? 'F' : 'C'}`, 60, 440);
  ctx.globalAlpha = 1;

  if (dailyToday) {
    ctx.font = '500 34px -apple-system, Roboto, sans-serif';
    ctx.fillText(`↓ ${Math.round(dailyToday.temperature_2m_min)}°  ↑ ${Math.round(dailyToday.temperature_2m_max)}°`, 60, 495);
  }

  // Runner verdict card
  const cardY = 600;
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  roundRect(ctx, 60, cardY, W - 120, 340, 32);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 32px -apple-system, Roboto, sans-serif';
  ctx.fillText('Для бегуна', 96, cardY + 60);

  ctx.font = '700 56px -apple-system, Roboto, sans-serif';
  ctx.fillText(`${recommendation.level.emoji} ${recommendation.score}/100`, 96, cardY + 140);

  ctx.font = '500 30px -apple-system, Roboto, sans-serif';
  wrapText(ctx, recommendation.level.label, 96, cardY + 190, W - 220, 38);

  ctx.font = '400 26px -apple-system, Roboto, sans-serif';
  ctx.globalAlpha = 0.85;
  ctx.fillText(recommendation.clothing, 96, cardY + 290);
  ctx.globalAlpha = 1;

  ctx.font = '400 24px -apple-system, Roboto, sans-serif';
  ctx.globalAlpha = 0.7;
  ctx.fillText('Погода — для бегунов', 60, H - 50);
  ctx.globalAlpha = 1;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let cy = y;
  for (const word of words) {
    const test = line + word + ' ';
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      line = word + ' ';
      cy += lineHeight;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, cy);
}

/** Shares the canvas as a PNG via Web Share API, or downloads it where sharing files isn't supported. */
export async function shareCanvas(canvas, filename = 'weather-card.png') {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Failed to render share image');

  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title: 'Погода' });
    return 'shared';
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return 'downloaded';
}
