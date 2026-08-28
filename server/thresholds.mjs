// Threshold estimation from mean-maximal curves.
//
// Model: the 2-parameter critical power hyperbola  P(t) = W'/t + CP,
// fitted by least squares on P against 1/t. CP (or critical speed for
// running) is the classic proxy for the second lactate threshold (LT2 /
// MLSS); FTP and LT1 are derived from it with the conventional factors
// documented in THRESHOLD_NOTES below. Everything here is an estimate from
// field data, not a lab measurement.

const FIT_MIN_SEC = 120; // 2 min — below this the anaerobic contribution dominates
const FIT_MAX_SEC = 1800; // 30 min — above this pacing/fuelling confound the fit

/** FTP is conventionally a touch below CP; 20-min tests use the 95% rule. */
const FTP_FROM_CP = 0.95;
const FTP_FROM_20MIN = 0.95;
/** LT1 (aerobic threshold) as a fraction of threshold intensity. */
const LT1_POWER_RATIO = 0.75;
const LT1_SPEED_RATIO = 0.8;
const LT1_HR_RATIO = 0.85;

export const THRESHOLD_NOTES = {
  cp: 'CP/CSモデル: P(t) = W\'/t + CP を2〜30分のベスト値に最小二乗フィット',
  ftp: 'FTP: 20分ベスト×0.95（テスト法）またはCP×0.95',
  lt2: 'LT2 ≈ CP/CS（MLSS相当）、LT2心拍は20〜30分の最高平均心拍',
  lt1: `LT1 ≈ 閾値パワーの${LT1_POWER_RATIO * 100}% / 閾値速度の${LT1_SPEED_RATIO * 100}% / LTHRの${LT1_HR_RATIO * 100}%（経験則）`,
};

/** Least-squares fit of y = a*x + b over the given points. */
function linearFit(points) {
  const n = points.length;
  const sx = points.reduce((s, p) => s + p.x, 0);
  const sy = points.reduce((s, p) => s + p.y, 0);
  const sxx = points.reduce((s, p) => s + p.x * p.x, 0);
  const sxy = points.reduce((s, p) => s + p.x * p.y, 0);
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-12) return null;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  const meanY = sy / n;
  const ssTot = points.reduce((s, p) => s + (p.y - meanY) ** 2, 0);
  const ssRes = points.reduce((s, p) => s + (p.y - (slope * p.x + intercept)) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;
  return { slope, intercept, r2 };
}

/**
 * Fit the critical-power hyperbola to a {duration: best} curve.
 * `critical` is in the curve's own unit; `slope` is the finite work capacity
 * in unit·seconds (W·s = joules for power, km/h·s for speed).
 */
function fitCriticalModel(curve) {
  const points = Object.entries(curve ?? {})
    .map(([d, v]) => ({ d: Number(d), v }))
    .filter((p) => p.d >= FIT_MIN_SEC && p.d <= FIT_MAX_SEC && p.v > 0)
    .sort((a, b) => a.d - b.d);
  if (points.length < 3) return null;
  const fit = linearFit(points.map((p) => ({ x: 1 / p.d, y: p.v })));
  if (!fit || fit.intercept <= 0 || fit.slope <= 0) return null;
  return {
    critical: Math.round(fit.intercept * 100) / 100,
    slope: fit.slope,
    r2: Math.round(fit.r2 * 1000) / 1000,
    durationsUsed: points.map((p) => p.d),
  };
}

/** Best sustained HR over 20–30 min, falling back to shorter windows. */
function estimateLthr(hrCurve) {
  if (!hrCurve) return null;
  for (const windows of [[1800, 1200], [900, 600], [300]]) {
    const values = windows.map((d) => hrCurve[d]).filter((v) => typeof v === 'number');
    if (values.length > 0) {
      return { value: Math.round(Math.max(...values)), fromDurationSec: windows[0] };
    }
  }
  return null;
}

const round1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

/** km/h -> "m:ss" per km. Kept for reference; the client formats per sport. */
export function paceFromKmh(kmh) {
  if (!kmh || kmh <= 0) return null;
  const total = 60 / kmh;
  let m = Math.floor(total);
  let s = Math.round((total - m) * 60);
  if (s === 60) {
    m += 1;
    s = 0;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Merge per-activity curves into one best-of curve. */
function mergeCurves(curveList, key) {
  const merged = {};
  for (const curves of curveList) {
    const c = curves?.[key];
    if (!c) continue;
    for (const [d, v] of Object.entries(c)) {
      if (merged[d] == null || v > merged[d]) merged[d] = v;
    }
  }
  return Object.keys(merged).length > 0 ? merged : null;
}

/**
 * Estimate thresholds for one sport from its per-activity curves.
 * `curveList` is an array of { power?, speed?, hr? } objects.
 */
export function estimateThresholds(sport, curveList) {
  const powerCurve = mergeCurves(curveList, 'power');
  const speedCurve = mergeCurves(curveList, 'speed');
  const hrCurve = mergeCurves(curveList, 'hr');
  const lthr = estimateLthr(hrCurve);

  const result = {
    sport,
    activityCount: curveList.length,
    powerCurve,
    speedCurve,
    hrCurve,
    lthr,
    lt1: {},
    lt2: {},
    ftp: null,
    cp: null,
    cs: null,
  };

  // --- Power side (cycling, and running power if present) ---
  const cp = fitCriticalModel(powerCurve);
  if (cp) {
    // slope is W·s, i.e. joules of anaerobic work capacity.
    result.cp = { value: round1(cp.critical), wPrimeJ: Math.round(cp.slope), r2: cp.r2, durationsUsed: cp.durationsUsed };
    const best20 = powerCurve?.[1200];
    const ftpValue = best20 != null ? best20 * FTP_FROM_20MIN : cp.critical * FTP_FROM_CP;
    result.ftp = {
      value: Math.round(ftpValue),
      method: best20 != null ? '20min_test' : 'cp_model',
      best20min: best20 != null ? round1(best20) : null,
    };
    result.lt2.power = round1(cp.critical);
    result.lt1.power = Math.round(result.ftp.value * LT1_POWER_RATIO);
  }

  // --- Speed side (running / swimming) ---
  const cs = fitCriticalModel(speedCurve);
  if (cs) {
    // slope is (km/h)·s; divide by 3.6 for D' in metres.
    result.cs = {
      valueKmh: round1(cs.critical),
      dPrimeM: Math.round(cs.slope / 3.6),
      r2: cs.r2,
      durationsUsed: cs.durationsUsed,
    };
    result.lt2.speedKmh = round1(cs.critical);
    result.lt1.speedKmh = round1(cs.critical * LT1_SPEED_RATIO);
  }

  // --- Heart rate side ---
  if (lthr) {
    result.lt2.hr = lthr.value;
    result.lt1.hr = Math.round(lthr.value * LT1_HR_RATIO);
  }

  const hasAny = result.cp || result.cs || lthr;
  return hasAny ? result : null;
}

/** Coggan-style power zones anchored on FTP. */
export function powerZones(ftp) {
  if (!ftp) return null;
  const z = (lo, hi) => ({ from: Math.round(ftp * lo), to: hi == null ? null : Math.round(ftp * hi) });
  return [
    { name: 'Z1 回復', ...z(0, 0.55) },
    { name: 'Z2 有酸素（〜LT1）', ...z(0.55, 0.75) },
    { name: 'Z3 テンポ', ...z(0.75, 0.9) },
    { name: 'Z4 閾値（LT2周辺）', ...z(0.9, 1.05) },
    { name: 'Z5 VO2max', ...z(1.05, 1.2) },
    { name: 'Z6 無酸素', ...z(1.2, null) },
  ];
}

/** HR zones anchored on LTHR (Friel-style). */
export function hrZones(lthr) {
  if (!lthr) return null;
  const z = (lo, hi) => ({ from: Math.round(lthr * lo), to: hi == null ? null : Math.round(lthr * hi) });
  return [
    { name: 'Z1 回復', ...z(0, 0.81) },
    { name: 'Z2 有酸素（〜LT1）', ...z(0.81, 0.89) },
    { name: 'Z3 テンポ', ...z(0.89, 0.94) },
    { name: 'Z4 閾値（LT2周辺）', ...z(0.94, 1.0) },
    { name: 'Z5 VO2max超', ...z(1.0, null) },
  ];
}
