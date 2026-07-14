/**
 * radar.js
 * ---------------------------------------------------------------------------
 * Renders a small precipitation radar loop centered on the active city,
 * using RainViewer's free public tile API (no key required). We don't pull
 * in a full map library (Leaflet etc.) since the brief asks to avoid heavy
 * frameworks — instead we composite a 3x3 grid of raw XYZ tiles onto a
 * <canvas>, which is enough for a compact "is it raining nearby" view.
 *
 * RainViewer API docs: https://www.rainviewer.com/api.html
 */

const FRAMES_URL = 'https://api.rainviewer.com/public/weather-maps.json';
const ZOOM = 6;         // regional zoom level — enough to see nearby precipitation cells
const TILE_PX = 100;    // each tile is drawn at 100x100 so a 3x3 grid fills a 300x300 canvas
const GRID_RADIUS = 1;  // 1 => 3x3 grid of tiles

/** Converts lat/lon to slippy-map tile coordinates at the given zoom. */
function latLonToTile(lat, lon, zoom) {
  const n = 2 ** zoom;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}

/** Fetches the current list of available radar frames (past + nowcast) from RainViewer. */
export async function fetchRadarFrames() {
  const response = await fetch(FRAMES_URL);
  if (!response.ok) throw new Error('RainViewer frames request failed');
  const data = await response.json();
  const frames = [...(data.radar?.past || []), ...(data.radar?.nowcast || [])];
  return { host: data.host, frames };
}

function loadTileImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // missing tile (e.g. edge of coverage) — just skip it
    img.src = url;
  });
}

/**
 * Draws one radar frame (a 3x3 tile grid centered on lat/lon) onto the canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {{host: string, frames: Array}} radarMeta from fetchRadarFrames()
 * @param {number} frameIndex which frame in `frames` to draw
 * @param {{latitude:number, longitude:number}} center
 */
export async function drawRadarFrame(canvas, radarMeta, frameIndex, center) {
  const ctx = canvas.getContext('2d');
  const frame = radarMeta.frames[frameIndex];
  if (!frame) return;

  const { x: cx, y: cy } = latLonToTile(center.latitude, center.longitude, ZOOM);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const tilePromises = [];
  for (let dx = -GRID_RADIUS; dx <= GRID_RADIUS; dx++) {
    for (let dy = -GRID_RADIUS; dy <= GRID_RADIUS; dy++) {
      const url = `${radarMeta.host}${frame.path}/256/${ZOOM}/${cx + dx}/${cy + dy}/4/1_1.png`;
      tilePromises.push(
        loadTileImage(url).then((img) => ({ img, dx, dy }))
      );
    }
  }
  const tiles = await Promise.all(tilePromises);
  for (const { img, dx, dy } of tiles) {
    if (!img) continue;
    const px = (dx + GRID_RADIUS) * TILE_PX;
    const py = (dy + GRID_RADIUS) * TILE_PX;
    ctx.drawImage(img, px, py, TILE_PX, TILE_PX);
  }

  // Marker for the city itself, always at the canvas center.
  ctx.beginPath();
  ctx.arc(canvas.width / 2, canvas.height / 2, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#4C6FFF';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();
}

/** Formats a RainViewer frame's unix timestamp as a short local time label. */
export function formatFrameTime(radarMeta, frameIndex) {
  const frame = radarMeta.frames[frameIndex];
  if (!frame) return '—';
  return new Date(frame.time * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}
