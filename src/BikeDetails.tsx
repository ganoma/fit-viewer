import { useMemo } from 'react';
import type { FitLap, Segment } from './fit';
import { fmtDuration } from './fit';
import { buildDynamicsFigure, buildPeakPowerFigure, buildPowerHistFigure } from './charts';
import Plot from './Plot';

function balanceStr(b?: { value: number; right?: boolean }): string {
  if (!b || typeof b.value !== 'number') return '-';
  // Sessions/laps use the *_100 format (5072 = 50.72%), records use whole percent.
  const pct = b.value > 100 ? b.value / 100 : b.value;
  if (pct > 100) return '-';
  const right = b.right ? pct : 100 - pct;
  return `L ${(100 - right).toFixed(1)} / R ${right.toFixed(1)}`;
}

function Kpi({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="kpi">
      <p className="kpi-label">{label}</p>
      <p className="kpi-value">
        {value}
        {unit && <span className="kpi-unit"> {unit}</span>}
      </p>
    </div>
  );
}

export default function BikeDetails({ segment, laps }: { segment: Segment; laps: FitLap[] }) {
  const s = segment.session;

  const peakFigure = useMemo(() => buildPeakPowerFigure(segment.records), [segment]);
  const histFigure = useMemo(() => buildPowerHistFigure(segment.records), [segment]);
  const dynamicsFigure = useMemo(() => buildDynamicsFigure(segment.records), [segment]);

  const bikeLaps = useMemo(() => laps.filter((l) => l.sport === 'cycling'), [laps]);

  const np = s.normalized_power;
  const ftp = s.threshold_power;
  const intensityFactor = np && ftp ? np / ftp : null;
  const vi = np && s.avg_power ? np / s.avg_power : null;

  const kpis: { label: string; value: string; unit?: string }[] = [];
  if (np) kpis.push({ label: 'Normalized Power', value: String(np), unit: 'W' });
  if (intensityFactor) kpis.push({ label: `IF (FTP ${ftp}W)`, value: intensityFactor.toFixed(2) });
  if (vi) kpis.push({ label: 'VI (NP / Avg)', value: vi.toFixed(2) });
  if (s.total_work) kpis.push({ label: 'Work', value: Math.round(s.total_work / 1000).toString(), unit: 'kJ' });
  if (s.total_calories) kpis.push({ label: 'Calories', value: String(s.total_calories), unit: 'kcal' });
  if (s.enhanced_avg_speed)
    kpis.push({
      label: 'Avg / Max Speed',
      value: `${s.enhanced_avg_speed.toFixed(1)} / ${(s.enhanced_max_speed ?? 0).toFixed(1)}`,
      unit: 'km/h',
    });
  if (s.left_right_balance) kpis.push({ label: 'L/R Balance', value: balanceStr(s.left_right_balance), unit: '%' });
  if (s.avg_left_torque_effectiveness || s.avg_right_torque_effectiveness)
    kpis.push({
      label: 'Torque Eff. L/R',
      value: `${s.avg_left_torque_effectiveness?.toFixed(1) ?? '-'} / ${s.avg_right_torque_effectiveness?.toFixed(1) ?? '-'}`,
      unit: '%',
    });
  if (s.avg_left_pedal_smoothness || s.avg_right_pedal_smoothness)
    kpis.push({
      label: 'Pedal Smooth. L/R',
      value: `${s.avg_left_pedal_smoothness?.toFixed(1) ?? '-'} / ${s.avg_right_pedal_smoothness?.toFixed(1) ?? '-'}`,
      unit: '%',
    });
  if (s.total_training_effect)
    kpis.push({
      label: 'Training Effect (Aerobic/Anaerobic)',
      value: `${s.total_training_effect.toFixed(1)} / ${s.total_anaerobic_training_effect?.toFixed(1) ?? '-'}`,
    });
  if (s.avg_temperature) kpis.push({ label: 'Avg Temp', value: s.avg_temperature.toFixed(0), unit: '°C' });

  return (
    <>
      <h2 className="file-name">🚴 バイク詳細</h2>

      {kpis.length > 0 && (
        <div className="kpi-grid">
          {kpis.map((k) => (
            <Kpi key={k.label} {...k} />
          ))}
        </div>
      )}

      {peakFigure && (
        <div className="card">
          <h3>ピークパワーカーブ（区間最大平均パワー）</h3>
          <Plot figure={peakFigure} />
        </div>
      )}

      {histFigure && (
        <div className="card">
          <h3>パワー分布（25W刻み）</h3>
          <Plot figure={histFigure} />
        </div>
      )}

      {dynamicsFigure && (
        <div className="card">
          <h3>ペダリングダイナミクス</h3>
          <Plot figure={dynamicsFigure} />
        </div>
      )}

      {bikeLaps.length > 1 && (
        <div className="card">
          <h3>ラップ（バイク）</h3>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Time</th>
                <th>Distance</th>
                <th>Avg Power</th>
                <th>NP</th>
                <th>Max Power</th>
                <th>Avg HR</th>
                <th>Avg Cadence</th>
                <th>Avg Speed</th>
              </tr>
            </thead>
            <tbody>
              {bikeLaps.map((l, i) => (
                <tr key={i}>
                  <td className="seg-label">{i + 1}</td>
                  <td>{fmtDuration(l.total_timer_time)}</td>
                  <td>{((l.total_distance ?? 0) / 1000).toFixed(2)} km</td>
                  <td>{l.avg_power ?? '-'}</td>
                  <td>{l.normalized_power ?? '-'}</td>
                  <td>{l.max_power ?? '-'}</td>
                  <td>{l.avg_heart_rate ?? '-'}</td>
                  <td>{l.avg_cadence ?? '-'}</td>
                  <td>{l.enhanced_avg_speed ? `${l.enhanced_avg_speed.toFixed(1)} km/h` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
