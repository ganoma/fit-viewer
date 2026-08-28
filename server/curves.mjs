// Mean-maximal curves: for each duration, the best rolling average a
// session achieved. These per-activity curves are cached in SQLite and
// combined later to estimate CP/FTP/LT1/LT2.

/** Durations (seconds) sampled on the curve — log-ish spacing. */
export const DURATIONS = [
  5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300, 420, 600, 900, 1200, 1800, 2400, 3600, 5400,
];

/** Records more than this far apart count as a pause and split the segment. */
const GAP_SEC = 10;

/**
 * Expand records onto a 1 Hz grid so rolling windows mean real seconds even
 * when the device used smart recording. Returns one array per continuous
 * segment.
 */
function toSecondGrid(samples) {
  const segments = [];
  let current = null;
  let prevT = null;
  for (const { t, v } of samples) {
    if (prevT == null || t - prevT > GAP_SEC || t < prevT) {
      current = { start: t, values: [] };
      segments.push(current);
    } else {
      // Forward-fill the seconds between the previous sample and this one.
      const fill = current.values.length ? current.values[current.values.length - 1] : v;
      for (let i = 1; i < t - prevT; i++) current.values.push(fill);
    }
    current.values.push(v);
    prevT = t;
  }
  return segments.filter((s) => s.values.length > 0).map((s) => s.values);
}

/** Best rolling average over each duration, across all segments. */
function bestAverages(segments) {
  const best = {};
  for (const values of segments) {
    const prefix = new Float64Array(values.length + 1);
    for (let i = 0; i < values.length; i++) prefix[i + 1] = prefix[i] + values[i];
    for (const d of DURATIONS) {
      if (d > values.length) break;
      let max = -Infinity;
      for (let i = 0; i + d <= values.length; i++) {
        const avg = (prefix[i + d] - prefix[i]) / d;
        if (avg > max) max = avg;
      }
      if (max > -Infinity && (best[d] == null || max > best[d])) {
        best[d] = Math.round(max * 100) / 100;
      }
    }
  }
  return best;
}

const epochSec = (ts) => Math.round(+new Date(ts) / 1000);

/**
 * Per-sport mean-maximal curves for one parsed FIT file.
 * Shape: { cycling: { power: {60: 320, ...}, speed: {...}, hr: {...} }, ... }
 */
export function buildCurves(data) {
  const records = (data.records ?? []).filter((r) => r.timestamp);
  if (records.length === 0) return {};
  records.sort((a, b) => +new Date(a.timestamp) - +new Date(b.timestamp));

  const sessions = (data.sessions ?? [])
    .filter((s) => s.start_time && s.sport && s.sport !== 'transition')
    .sort((a, b) => +new Date(a.start_time) - +new Date(b.start_time));

  // Without session metadata, treat the whole file as one sport.
  const windows =
    sessions.length > 0
      ? sessions.map((s) => {
          const start = epochSec(s.start_time);
          const dur = Math.round(s.total_elapsed_time ?? s.total_timer_time ?? 0);
          return { sport: s.sport, start, end: start + dur + 1 };
        })
      : [{ sport: data.sports?.[0]?.sport ?? 'other', start: -Infinity, end: Infinity }];

  const out = {};
  for (const w of windows) {
    const inWindow = records.filter((r) => {
      const t = epochSec(r.timestamp);
      return t >= w.start && t < w.end;
    });
    if (inWindow.length < 30) continue;

    const pick = (fn) =>
      inWindow
        .map((r) => ({ t: epochSec(r.timestamp), v: fn(r) }))
        .filter((s) => typeof s.v === 'number' && !Number.isNaN(s.v));

    const power = pick((r) => r.power);
    const speed = pick((r) => r.enhanced_speed ?? r.speed);
    const hr = pick((r) => r.heart_rate);

    const curves = {};
    if (power.length >= 30) curves.power = bestAverages(toSecondGrid(power));
    if (speed.length >= 30) curves.speed = bestAverages(toSecondGrid(speed));
    if (hr.length >= 30) curves.hr = bestAverages(toSecondGrid(hr));
    if (Object.keys(curves).length === 0) continue;

    // A multisport file can hold several sessions of one sport: keep the best.
    const prev = out[w.sport];
    if (!prev) {
      out[w.sport] = curves;
    } else {
      for (const key of ['power', 'speed', 'hr']) {
        if (!curves[key]) continue;
        prev[key] = prev[key] ?? {};
        for (const [d, v] of Object.entries(curves[key])) {
          if (prev[key][d] == null || v > prev[key][d]) prev[key][d] = v;
        }
      }
    }
  }
  return out;
}
