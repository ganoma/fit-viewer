import { useEffect, useState } from 'react';
import type { Tab } from './App';
import { listActivities } from './api';

const SPORTS = [
  {
    key: 'swim',
    sport: 'swimming',
    no: '01',
    name: 'SWIM',
    jp: 'スイム',
    hint: 'ペース /100m · ストローク · SWOLF',
    color: '#22d3ee',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <path className="draw d1" d="M4 30 q5 -6 10 0 t10 0 t10 0 t10 0" />
        <path className="draw d2" d="M4 38 q5 -6 10 0 t10 0 t10 0 t10 0" />
        <circle className="draw d3" cx="30" cy="16" r="4.5" />
        <path className="draw d4" d="M12 22 q8 -10 16 -3" />
      </svg>
    ),
  },
  {
    key: 'bike',
    sport: 'cycling',
    no: '02',
    name: 'BIKE',
    jp: 'バイク',
    hint: 'パワー · NP · ケイデンス',
    color: '#818cf8',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <circle className="draw d1" cx="12" cy="32" r="8" />
        <circle className="draw d2" cx="36" cy="32" r="8" />
        <path className="draw d3" d="M12 32 L20 18 L31 18 L36 32 M20 18 L26 32 L12 32" strokeLinejoin="round" />
        <path className="draw d4" d="M31 18 l-3 -6 h6" />
      </svg>
    ),
  },
  {
    key: 'run',
    sport: 'running',
    no: '03',
    name: 'RUN',
    jp: 'ラン',
    hint: 'ペース · 歩幅 · ピッチ',
    color: '#fb923c',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <circle className="draw d1" cx="30" cy="10" r="4.5" />
        <path className="draw d2" d="M18 20 l8 -2 l6 6 l-6 8 l4 10" strokeLinejoin="round" />
        <path className="draw d3" d="M26 24 l-8 6 l-6 -2 M28 32 l-10 4" />
        <path className="draw d4" d="M6 16 h8 M4 24 h6" />
      </svg>
    ),
  },
];

/** Top page: hero + per-sport cards linking to the other views. */
export default function HomeView({
  onNavigate,
  onOpenSportTrends,
}: {
  onNavigate: (tab: Tab) => void;
  onOpenSportTrends: (sport: string) => void;
}) {
  const [stats, setStats] = useState<{ count: number; sports: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    listActivities()
      .then((list) => {
        if (cancelled) return;
        const sports = new Set(list.flatMap((a) => a.sports.map((s) => s.sport)));
        setStats({ count: list.length, sports: sports.size });
      })
      .catch(() => {
        /* stats are decorative */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="stylish-home">
      <section className="sh-hero">
        <div className="sh-glow sh-glow-1" />
        <div className="sh-glow sh-glow-2" />
        <div className="sh-glow sh-glow-3" />
        <div className="sh-grid" />

        <p className="sh-eyebrow">
          <span style={{ color: '#22d3ee' }}>SWIM</span>
          <span className="sh-dot">·</span>
          <span style={{ color: '#818cf8' }}>BIKE</span>
          <span className="sh-dot">·</span>
          <span style={{ color: '#fb923c' }}>RUN</span>
        </p>
        <h2 className="sh-title">
          TRIATHLON
          <br />
          <span>ANALYTICS</span>
        </h2>
        <p className="sh-sub">
          FITファイルを解析して、レースとトレーニングのすべてを可視化する
        </p>

        <div className="sh-ctas">
          <button className="sh-cta primary" onClick={() => onNavigate('activity')}>
            アクティビティを開く
            <span className="sh-arrow">→</span>
          </button>
          <button className="sh-cta ghost" onClick={() => onNavigate('trends')}>
            傾向分析を見る
          </button>
        </div>

        {stats && stats.count > 0 && (
          <p className="sh-stats">
            <strong>{stats.count}</strong> activities saved
            <span className="sh-dot">·</span>
            <strong>{stats.sports}</strong> sports tracked
          </p>
        )}
      </section>

      <div className="sh-sports">
        {SPORTS.map((s) => (
          <button
            key={s.key}
            className="sh-sport"
            style={{ '--sport-color': s.color } as React.CSSProperties}
            onClick={() => onOpenSportTrends(s.sport)}
          >
            <span className="sh-sport-no">{s.no}</span>
            <span className="sh-sport-icon">{s.icon}</span>
            <span className="sh-sport-name">{s.name}</span>
            <span className="sh-sport-jp">{s.jp}</span>
            <span className="sh-sport-hint">{s.hint}</span>
            <span className="sh-sport-go">傾向を見る →</span>
          </button>
        ))}
      </div>
    </div>
  );
}
