import { useEffect, useMemo, useState } from 'react';
import type { ActivitySummary, SportSummary } from './api';
import { listActivities } from './api';
import { extractTrendMetrics } from './charts';
import MetricToggleChart from './MetricToggleChart';

const SPORT_SECTIONS: { sport: string; title: string; defaults: string[] }[] = [
  { sport: 'running', title: '🏃 ラン傾向', defaults: ['hr', 'stride'] },
  { sport: 'cycling', title: '🚴 バイク傾向', defaults: ['hr', 'power'] },
  { sport: 'swimming', title: '🏊 スイム傾向', defaults: ['hr', 'strokes'] },
];

export default function TrendsView({ savedVersion }: { savedVersion: number }) {
  const [activities, setActivities] = useState<ActivitySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <>
      <p className="subtitle" style={{ marginBottom: 16 }}>
        保存済み {activities.length} 件のアクティビティから、スポーツごとの指標の推移を表示しています
      </p>
      {SPORT_SECTIONS.map(({ sport, title, defaults }) => {
        const entries = bySport.get(sport);
        if (!entries || entries.length === 0) return null;
        const { x, metrics } = extractTrendMetrics(entries);
        if (metrics.length === 0) return null;
        return (
          <MetricToggleChart
            key={sport}
            title={`${title}（${entries.length}回）`}
            x={x}
            metrics={metrics}
            defaultKeys={defaults.filter((k) => metrics.some((m) => m.key === k))}
            mode="lines+markers"
          />
        );
      })}
    </>
  );
}
