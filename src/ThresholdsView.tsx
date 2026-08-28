import { useEffect, useMemo, useState } from 'react';
import type { SportThresholds, ThresholdsResponse } from './api';
import { getThresholds } from './api';
import { fmtDuration } from './fit';
import Plot from './Plot';

const PERIODS = [
  { days: 90, label: '直近90日' },
  { days: 180, label: '直近180日' },
  { days: 365, label: '直近1年' },
  { days: 0, label: '全期間' },
];

const SPORT_META: Record<string, { title: string; color: string; order: number }> = {
  cycling: { title: '🚴 バイク', color: '#818cf8', order: 1 },
  running: { title: '🏃 ラン', color: '#fb923c', order: 2 },
  swimming: { title: '🏊 スイム', color: '#22d3ee', order: 3 },
};

/** Speed formatted the way each sport is normally read. */
function speedLabel(sport: string, kmh: number | undefined): string {
  if (kmh == null || kmh <= 0) return '-';
  if (sport === 'cycling') return `${kmh.toFixed(1)} km/h`;
  const minPerUnit = sport === 'swimming' ? 6 / kmh : 60 / kmh; // /100m or /km
  let m = Math.floor(minPerUnit);
  let s = Math.round((minPerUnit - m) * 60);
  if (s === 60) {
    m += 1;
    s = 0;
  }
  return `${m}:${String(s).padStart(2, '0')} ${sport === 'swimming' ? '/100m' : '/km'}`;
}

function Kpi({
  label,
  value,
  unit,
  sub,
  accent,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className={`kpi ${accent ? 'kpi-accent' : ''}`}>
      <p className="kpi-label">{label}</p>
      <p className="kpi-value">
        {value}
        {unit && <span className="kpi-unit"> {unit}</span>}
      </p>
      {sub && <p className="threshold-sub">{sub}</p>}
    </div>
  );
}

/** Measured mean-maximal curve plus the fitted CP/CS model line. */
function curveFigure(sport: string, t: SportThresholds) {
  const usePower = t.powerCurve != null && t.cp != null;
  const curve = usePower ? t.powerCurve : t.speedCurve;
  const fit = usePower ? t.cp : t.cs;
  if (!curve) return null;

  const points = Object.entries(curve)
    .map(([d, v]) => ({ d: Number(d), v }))
    .sort((a, b) => a.d - b.d);
  const critical = usePower ? fit?.value : fit?.valueKmh;
  const finite = usePower ? fit?.wPrimeJ : fit?.dPrimeM != null ? fit.dPrimeM * 3.6 : undefined;

  const data: Record<string, unknown>[] = [
    {
      x: points.map((p) => p.d),
      y: points.map((p) => p.v),
      name: '実測ベスト',
      type: 'scatter',
      mode: 'lines+markers',
      line: { color: SPORT_META[sport]?.color ?? '#60a5fa', width: 2 },
      marker: { size: 6 },
      hovertemplate: '%{customdata}: %{y:.1f}<extra></extra>',
      customdata: points.map((p) => fmtDuration(p.d)),
    },
  ];

  if (critical != null && finite != null) {
    // Only draw the model over the range it was fitted on — the hyperbola is
    // not valid for very short efforts and would look wrong there.
    const used = fit?.durationsUsed ?? [];
    const lo = used[0] ?? points[0].d;
    const hi = used[used.length - 1] ?? points[points.length - 1].d;
    const modelX = Array.from({ length: 40 }, (_, i) =>
      Math.round(lo * (hi / lo) ** (i / 39)),
    );
    data.push({
      x: modelX,
      y: modelX.map((d) => finite / d + critical),
      name: 'CPモデル（適合範囲）',
      type: 'scatter',
      mode: 'lines',
      line: { color: '#94a3b8', width: 1.5, dash: 'dash' },
      hoverinfo: 'skip',
    });
    data.push({
      x: [points[0].d, points[points.length - 1].d],
      y: [critical, critical],
      name: usePower ? `CP ${critical.toFixed(0)} W` : `CS ${critical.toFixed(1)} km/h`,
      type: 'scatter',
      mode: 'lines',
      line: { color: '#ef4444', width: 1.5, dash: 'dot' },
      hoverinfo: 'skip',
    });
  }

  return {
    data,
    layout: {
      height: 340,
      margin: { l: 60, r: 20, t: 30, b: 50 },
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      font: { color: '#94a3b8' },
      legend: { orientation: 'h', y: 1.15, font: { size: 10 } },
      xaxis: {
        title: { text: '持続時間', font: { size: 11 } },
        type: 'log',
        gridcolor: '#334155',
        tickvals: [10, 60, 300, 1200, 3600],
        ticktext: ['10秒', '1分', '5分', '20分', '60分'],
      },
      yaxis: {
        title: { text: usePower ? 'ベスト平均パワー (W)' : 'ベスト平均速度 (km/h)', font: { size: 11 } },
        gridcolor: '#334155',
      },
    },
  };
}

function SportPanel({ sport, t }: { sport: string; t: SportThresholds }) {
  const meta = SPORT_META[sport] ?? { title: sport, color: '#94a3b8', order: 9 };
  const figure = useMemo(() => curveFigure(sport, t), [sport, t]);
  const isCycling = sport === 'cycling';
  const powerLabel = isCycling ? 'FTP' : '閾値パワー';

  return (
    <>
      <h2 className="file-name">
        {meta.title}
        <span className="threshold-count">{t.activityCount} 件のデータから推定</span>
      </h2>

      <div className="kpi-grid">
        {t.ftp && (
          <Kpi
            label={powerLabel}
            value={String(t.ftp.value)}
            unit="W"
            accent
            sub={
              t.ftp.method === '20min_test'
                ? `20分ベスト ${t.ftp.best20min}W × 0.95`
                : 'CPモデル × 0.95'
            }
          />
        )}
        {t.cp && (
          <Kpi
            label="CP（クリティカルパワー）"
            value={String(t.cp.value)}
            unit="W"
            sub={`W' ${((t.cp.wPrimeJ ?? 0) / 1000).toFixed(1)}kJ · 適合度 R²=${t.cp.r2}`}
          />
        )}
        {t.cs && (
          <Kpi
            label={isCycling ? 'CS（クリティカル速度）' : '閾値ペース（CS）'}
            value={speedLabel(sport, t.cs.valueKmh)}
            accent={!isCycling}
            sub={`D' ${t.cs.dPrimeM}m · 適合度 R²=${t.cs.r2}`}
          />
        )}
        {t.lthr && (
          <Kpi
            label="LTHR（閾値心拍）"
            value={String(t.lthr.value)}
            unit="bpm"
            sub={`${fmtDuration(t.lthr.fromDurationSec)}の最高平均心拍`}
          />
        )}
      </div>

      <div className="card">
        <h3>閾値の推定値</h3>
        <table>
          <thead>
            <tr>
              <th>閾値</th>
              {t.lt2.power != null && <th>パワー</th>}
              {t.lt2.speedKmh != null && <th>{isCycling ? '速度' : 'ペース'}</th>}
              {t.lt2.hr != null && <th>心拍</th>}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="seg-label">LT2（無酸素性作業閾値）</td>
              {t.lt2.power != null && <td>{t.lt2.power} W</td>}
              {t.lt2.speedKmh != null && <td>{speedLabel(sport, t.lt2.speedKmh)}</td>}
              {t.lt2.hr != null && <td>{t.lt2.hr} bpm</td>}
            </tr>
            <tr>
              <td className="seg-label">LT1（有酸素性作業閾値）</td>
              {t.lt2.power != null && <td>{t.lt1.power ?? '-'} W</td>}
              {t.lt2.speedKmh != null && <td>{speedLabel(sport, t.lt1.speedKmh)}</td>}
              {t.lt2.hr != null && <td>{t.lt1.hr ?? '-'} bpm</td>}
            </tr>
          </tbody>
        </table>
      </div>

      {figure && (
        <div className="card">
          <h3>パワー/スピードカーブとCPモデル</h3>
          <Plot figure={figure} />
        </div>
      )}

      {(t.zones.power || t.zones.hr) && (
        <div className="card">
          <h3>トレーニングゾーン</h3>
          <div className="zone-grid">
            {t.zones.power && (
              <table>
                <thead>
                  <tr>
                    <th>パワーゾーン</th>
                    <th>範囲</th>
                  </tr>
                </thead>
                <tbody>
                  {t.zones.power.map((z) => (
                    <tr key={z.name}>
                      <td className="seg-label">{z.name}</td>
                      <td>{z.to == null ? `${z.from}W 以上` : `${z.from} – ${z.to} W`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {t.zones.hr && (
              <table>
                <thead>
                  <tr>
                    <th>心拍ゾーン</th>
                    <th>範囲</th>
                  </tr>
                </thead>
                <tbody>
                  {t.zones.hr.map((z) => (
                    <tr key={z.name}>
                      <td className="seg-label">{z.name}</td>
                      <td>{z.to == null ? `${z.from}bpm 以上` : `${z.from} – ${z.to} bpm`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default function ThresholdsView({ savedVersion }: { savedVersion: number }) {
  const [days, setDays] = useState(90);
  const [data, setData] = useState<ThresholdsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getThresholds(days)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days, savedVersion]);

  const sports = useMemo(
    () =>
      Object.entries(data?.sports ?? {}).sort(
        ([a], [b]) => (SPORT_META[a]?.order ?? 9) - (SPORT_META[b]?.order ?? 9),
      ),
    [data],
  );

  return (
    <>
      <div className="metric-toggles" style={{ marginBottom: 16 }}>
        {PERIODS.map((p) => (
          <label key={p.days} className={`metric-toggle ${days === p.days ? 'checked' : ''}`}>
            <input type="checkbox" checked={days === p.days} onChange={() => setDays(p.days)} />
            {p.label}
          </label>
        ))}
      </div>

      {loading && <p className="status">⏳ パワーカーブを解析中…（初回は時間がかかります）</p>}
      {error && <p className="status error">⚠️ {error}</p>}

      {!loading && data && sports.length === 0 && (
        <div className="dropzone">
          <p className="dropzone-main">この期間に推定できるデータがありません</p>
          <p className="dropzone-sub">
            期間を広げるか、「アクティビティ」タブでFITファイルを追加してください
          </p>
        </div>
      )}

      {!loading && sports.length > 0 && (
        <>
          <p className="subtitle" style={{ marginBottom: 20 }}>
            期間内 {data?.activityCount} 件のアクティビティのベスト値からCP/CSモデルで推定しています
          </p>
          {sports.map(([sport, t]) => (
            <SportPanel key={sport} sport={sport} t={t} />
          ))}
          <div className="card threshold-notes">
            <h3>ℹ️ 推定方法と注意</h3>
            <ul>
              {Object.values(data?.notes ?? {}).map((n) => (
                <li key={n}>{n}</li>
              ))}
              <li>
                実験室での乳酸測定やガス分析の代替ではなく、記録済みデータの
                <strong>ベスト値からの推定</strong>です。
              </li>
              <li>
                各時間幅で全力に近い走行が含まれていないと過小評価になります。
                特にデータ件数が少ない期間では参考値として扱ってください。
              </li>
            </ul>
          </div>
        </>
      )}
    </>
  );
}
