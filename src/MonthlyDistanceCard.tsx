import { useMemo } from 'react';
import type { ActivitySummary } from './api';
import type { Figure } from './charts';
import Plot from './Plot';

const SPORTS = [
  { sport: 'swimming', label: '🏊 スイム', color: '#22d3ee' },
  { sport: 'cycling', label: '🚴 バイク', color: '#818cf8' },
  { sport: 'running', label: '🏃 ラン', color: '#fb923c' },
];

/** 日時をJSTの "YYYY-MM" に変換する（月またぎを日本時間で判定するため）。 */
function monthKeyJst(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }).slice(0, 7);
}

/** start〜end の "YYYY-MM" を欠けなく並べる（練習のない月も0として表示するため）。 */
function monthRange(start: string, end: string): string[] {
  const out: string[] = [];
  let [y, m] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** 種目ごとの月間距離（km）の積算を、棒グラフと表で表示するカード。 */
export default function MonthlyDistanceCard({
  activities,
  sport,
}: {
  activities: ActivitySummary[];
  sport: string | null;
}) {
  const sports = SPORTS.filter((s) => sport == null || s.sport === sport);

  const { months, totals, counts } = useMemo(() => {
    // totals[sport][month] = km、counts[sport][month] = 回数
    const totals: Record<string, Record<string, number>> = {};
    const counts: Record<string, Record<string, number>> = {};
    const keys: string[] = [];
    for (const a of activities) {
      for (const s of a.sports) {
        if (!SPORTS.some((x) => x.sport === s.sport) || !s.startTime) continue;
        const key = monthKeyJst(s.startTime);
        keys.push(key);
        totals[s.sport] ??= {};
        counts[s.sport] ??= {};
        totals[s.sport][key] = (totals[s.sport][key] ?? 0) + (s.distanceM ?? 0) / 1000;
        counts[s.sport][key] = (counts[s.sport][key] ?? 0) + 1;
      }
    }
    keys.sort();
    const months = keys.length ? monthRange(keys[0], keys[keys.length - 1]) : [];
    return { months, totals, counts };
  }, [activities]);

  const visibleSports = sports.filter((s) => totals[s.sport]);
  if (months.length === 0 || visibleSports.length === 0) return null;

  const figure: Figure = {
    data: visibleSports.map((s) => ({
      x: months,
      y: months.map((m) => Math.round((totals[s.sport][m] ?? 0) * 10) / 10),
      name: s.label,
      type: 'bar',
      marker: { color: s.color },
      hovertemplate: `${s.label}: %{y:.1f} km<extra>%{x}</extra>`,
    })),
    layout: {
      height: 360,
      margin: { l: 55, r: 20, t: 30, b: 50 },
      barmode: 'group',
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      font: { color: '#94a3b8' },
      legend: { orientation: 'h', y: 1.12, font: { size: 11 } },
      xaxis: { type: 'category', gridcolor: '#334155' },
      yaxis: { title: { text: '距離 (km)', font: { size: 11 } }, gridcolor: '#334155' },
    },
  };

  // 表は新しい月を上にする。スイムは距離が小さいので小数2桁で表示する。
  const rows = [...months].reverse();
  const fmt = (sp: string, km: number) => (sp === 'swimming' ? km.toFixed(2) : km.toFixed(1));

  return (
    <div className="card">
      <h3>📅 月間距離</h3>
      {sport == null && visibleSports.length > 1 && (
        <p className="threshold-sub" style={{ margin: '0 4px 8px' }}>
          種目ごとに距離の桁が違うため、スイムが見づらい場合は上のチップで種目を絞ってください
        </p>
      )}
      <Plot figure={figure} />
      <div className="monthly-table">
        <table>
          <thead>
            <tr>
              <th>月</th>
              {visibleSports.map((s) => (
                <th key={s.sport}>{s.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m}>
                <td className="seg-label">{m.replace('-', '/')}</td>
                {visibleSports.map((s) => {
                  const km = totals[s.sport][m] ?? 0;
                  const n = counts[s.sport][m] ?? 0;
                  return (
                    <td key={s.sport}>
                      {n > 0 ? `${fmt(s.sport, km)} km（${n}回）` : '-'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
