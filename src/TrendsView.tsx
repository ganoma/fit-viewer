import { useEffect, useMemo, useState } from 'react';
import type { ActivitySummary, ShoeStats, SportSummary } from './api';
import { listActivities, listShoes } from './api';
import { extractTrendMetrics } from './charts';
import MetricToggleChart from './MetricToggleChart';

const SPORT_SECTIONS: { sport: string; title: string; label: string; defaults: string[] }[] = [
  { sport: 'running', title: '🏃 ラン傾向', label: '🏃 ラン', defaults: ['hr', 'stride'] },
  { sport: 'cycling', title: '🚴 バイク傾向', label: '🚴 バイク', defaults: ['hr', 'power'] },
  { sport: 'swimming', title: '🏊 スイム傾向', label: '🏊 スイム', defaults: ['hr', 'strokes'] },
];

export default function TrendsView({
  savedVersion,
  sport,
  onSportChange,
}: {
  savedVersion: number;
  sport: string | null;
  onSportChange: (sport: string | null) => void;
}) {
  const [activities, setActivities] = useState<ActivitySummary[] | null>(null);
  const [shoes, setShoes] = useState<ShoeStats[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listShoes()
      .then(setShoes)
      .catch(() => {
        /* optional section */
      });
  }, [savedVersion]);

  useEffect(() => {
    let cancelled = false;
    listActivities()
      .then((list) => {
        if (!cancelled) {
          setActivities(list);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled)
          setError(
            '保存サーバーに接続できません。コンテナまたは `npm run dev:server` を起動してください。',
          );
      });
    return () => {
      cancelled = true;
    };
  }, [savedVersion]);

  const bySport = useMemo(() => {
    const map = new Map<string, SportSummary[]>();
    for (const a of activities ?? []) {
      for (const s of a.sports) {
        if (!map.has(s.sport)) map.set(s.sport, []);
        map.get(s.sport)!.push(s);
      }
    }
    return map;
  }, [activities]);

  if (error) return <p className="status error">⚠️ {error}</p>;
  if (activities == null) return <p className="status">⏳ 読み込み中…</p>;
  if (activities.length === 0)
    return (
      <div className="dropzone">
        <p className="dropzone-main">まだ保存されたアクティビティがありません</p>
        <p className="dropzone-sub">
          「アクティビティ」タブで .fit ファイルを読み込むと自動的に保存され、ここに傾向が表示されます
        </p>
      </div>
    );

  const visibleSections = SPORT_SECTIONS.filter((s) => sport == null || s.sport === sport);

  return (
    <>
      <p className="subtitle" style={{ marginBottom: 16 }}>
        保存済み {activities.length} 件のアクティビティから、スポーツごとの指標の推移を表示しています
      </p>

      <div className="metric-toggles" style={{ marginBottom: 20 }}>
        <label className={`metric-toggle ${sport == null ? 'checked' : ''}`}>
          <input type="checkbox" checked={sport == null} onChange={() => onSportChange(null)} />
          すべて
        </label>
        {SPORT_SECTIONS.map((s) => (
          <label key={s.sport} className={`metric-toggle ${sport === s.sport ? 'checked' : ''}`}>
            <input
              type="checkbox"
              checked={sport === s.sport}
              onChange={() => onSportChange(sport === s.sport ? null : s.sport)}
            />
            {s.label}
          </label>
        ))}
      </div>

      {(() => {
        const rendered = visibleSections
          .map(({ sport: sp, title, defaults }) => {
            const entries = bySport.get(sp);
            if (!entries || entries.length === 0) return null;
            const { x, metrics } = extractTrendMetrics(entries);
            if (metrics.length === 0) return null;
            return (
              <MetricToggleChart
                key={sp}
                title={`${title}（${entries.length}回）`}
                x={x}
                metrics={metrics}
                defaultKeys={defaults.filter((k) => metrics.some((m) => m.key === k))}
                mode="lines+markers"
              />
            );
          })
          .filter((n) => n != null);
        return rendered.length > 0 ? (
          rendered
        ) : (
          <p className="status">このスポーツの保存データはまだありません。</p>
        );
      })()}

      {(sport == null || sport === 'running') && shoes.length > 0 && (
        <div className="card">
          <h3>👟 シューズ走行距離</h3>
          <table>
            <thead>
              <tr>
                <th>シューズ</th>
                <th>ラン回数</th>
                <th>合計距離</th>
                <th>最終使用日</th>
              </tr>
            </thead>
            <tbody>
              {shoes.map((s) => (
                <tr key={s.name}>
                  <td className="seg-label">{s.name}</td>
                  <td>{s.runCount} 回</td>
                  <td>{s.totalKm.toFixed(1)} km</td>
                  <td>
                    {s.lastUsed ? new Date(s.lastUsed).toLocaleDateString('ja-JP') : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
