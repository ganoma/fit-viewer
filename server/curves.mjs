// 平均最大カーブ（Mean-maximal curve）の抽出。
// 各時間幅について「その時間だけ続けられた最高の平均値」を求める。
// アクティビティ単位で算出した結果をSQLiteにキャッシュしておき、
// あとで全期間分をまとめて CP/FTP/LT1/LT2 の推定に使う。

/** カーブをサンプリングする時間幅（秒）。対数に近い間隔で並べている。 */
export const DURATIONS = [
  5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300, 420, 600, 900, 1200, 1800, 2400, 3600, 5400,
];

/** これ以上レコード間隔が空いたら「一時停止」とみなしてセグメントを分割する秒数。 */
const GAP_SEC = 10;

/**
 * レコードを1秒刻みのグリッドに展開する。
 * スマートレコーディング（可変間隔記録）でも移動平均の窓が実時間の秒数と
 * 一致するようにするための前処理。連続した区間ごとの配列を返す。
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
      // 前のサンプルとの間に空いた秒を、直前の値で埋める。
      const fill = current.values.length ? current.values[current.values.length - 1] : v;
      for (let i = 1; i < t - prevT; i++) current.values.push(fill);
    }
    current.values.push(v);
    prevT = t;
  }
  return segments.filter((s) => s.values.length > 0).map((s) => s.values);
}

/** 全セグメントを通して、各時間幅での最高の移動平均を求める。 */
function bestAverages(segments) {
  const best = {};
  for (const values of segments) {
    // 累積和を先に作っておき、各窓の平均を O(1) で求める。
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
 * パース済みFIT 1件分から、スポーツ別の平均最大カーブを作る。
 * 戻り値の形: { cycling: { power: {60: 320, ...}, speed: {...}, hr: {...} }, ... }
 */
export function buildCurves(data) {
  const records = (data.records ?? []).filter((r) => r.timestamp);
  if (records.length === 0) return {};
  records.sort((a, b) => +new Date(a.timestamp) - +new Date(b.timestamp));

  const sessions = (data.sessions ?? [])
    .filter((s) => s.start_time && s.sport && s.sport !== 'transition')
    .sort((a, b) => +new Date(a.start_time) - +new Date(b.start_time));

  // セッション情報がないファイルは、全体を1つのスポーツとして扱う。
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

    // マルチスポーツのファイルには同じスポーツのセッションが複数入りうるので、
    // その場合は時間幅ごとに良いほうの値を残す。
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
