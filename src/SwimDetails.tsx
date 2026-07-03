import { useMemo } from 'react';
import type { FitLap, FitLength, Segment } from './fit';
import { fmtDuration, pace100Str } from './fit';
import { buildLengthsFigure } from './charts';
import Plot from './Plot';

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

export default function SwimDetails({
  segment,
  laps,
  lengths,
}: {
  segment: Segment;
  laps: FitLap[];
  lengths: FitLength[];
}) {
  const s = segment.session;

  const lengthsFigure = useMemo(() => buildLengthsFigure(lengths), [lengths]);
  const swimLaps = useMemo(() => laps.filter((l) => l.sport === 'swimming'), [laps]);
  const active = useMemo(() => lengths.filter((l) => l.length_type === 'active'), [lengths]);

  const totalStrokes = active.reduce((sum, l) => sum + (l.total_strokes ?? 0), 0);
  const swolfs = active
    .map((l) =>
      l.total_strokes != null && (l.total_timer_time ?? l.total_elapsed_time) != null
        ? (l.total_timer_time ?? l.total_elapsed_time)! + l.total_strokes
        : null,
    )
    .filter((v): v is number => v != null);
  const avgSwolf = swolfs.length ? swolfs.reduce((a, b) => a + b, 0) / swolfs.length : null;

  const poolLength = s.pool_length;
  const distPerStroke =
    totalStrokes > 0 && s.total_distance ? s.total_distance / totalStrokes : null;

  const kpis: { label: string; value: string; unit?: string }[] = [];
  if (poolLength) kpis.push({ label: 'Pool Length', value: String(poolLength), unit: 'm' });
  if (s.total_distance) kpis.push({ label: 'Distance', value: String(Math.round(s.total_distance)), unit: 'm' });
  if (s.enhanced_avg_speed)
    kpis.push({ label: 'Avg Pace', value: pace100Str(s.enhanced_avg_speed), unit: '/100m' });
  if (s.enhanced_max_speed)
    kpis.push({ label: 'Best Pace', value: pace100Str(s.enhanced_max_speed), unit: '/100m' });
  if (s.num_active_lengths)
    kpis.push({ label: 'Active Lengths', value: String(s.num_active_lengths), unit: '本' });
  if (totalStrokes > 0) kpis.push({ label: 'Total Strokes', value: String(totalStrokes) });
  if (avgSwolf) kpis.push({ label: `Avg SWOLF${poolLength ? ` (${poolLength}m)` : ''}`, value: avgSwolf.toFixed(1) });
  if (distPerStroke) kpis.push({ label: 'Distance / Stroke', value: distPerStroke.toFixed(2), unit: 'm' });
  if (s.avg_cadence) kpis.push({ label: 'Avg Cadence', value: String(s.avg_cadence), unit: 'spm' });
  if (s.total_calories) kpis.push({ label: 'Calories', value: String(s.total_calories), unit: 'kcal' });
  if (s.total_training_effect)
    kpis.push({
      label: 'Training Effect (Aerobic/Anaerobic)',
      value: `${s.total_training_effect.toFixed(1)} / ${s.total_anaerobic_training_effect?.toFixed(1) ?? '-'}`,
    });
  if (s.workout_rpe) kpis.push({ label: 'RPE (自己申告強度)', value: `${s.workout_rpe} / 10` });

  if (kpis.length === 0 && !lengthsFigure && swimLaps.length <= 1) return null;

  return (
    <>
      <h2 className="file-name">🏊 スイム詳細</h2>

      {kpis.length > 0 && (
        <div className="kpi-grid">
          {kpis.map((k) => (
            <Kpi key={k.label} {...k} />
          ))}
        </div>
      )}

      {lengthsFigure && (
        <div className="card">
          <h3>レングス分析（1本ごとのタイム・ストローク・SWOLF）</h3>
          <Plot figure={lengthsFigure} />
        </div>
      )}

      {swimLaps.length > 1 && (
        <div className="card">
          <h3>ラップ（スイム）</h3>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Time</th>
                <th>Distance</th>
                <th>Lengths</th>
                <th>Stroke</th>
                <th>Pace /100m</th>
                <th>Avg HR</th>
              </tr>
            </thead>
            <tbody>
              {swimLaps.map((l, i) => (
                <tr key={i}>
                  <td className="seg-label">{i + 1}</td>
                  <td>{fmtDuration(l.total_timer_time)}</td>
                  <td>{Math.round(l.total_distance ?? 0)} m</td>
                  <td>{l.num_active_lengths ?? l.num_lengths ?? '-'}</td>
                  <td>{l.swim_stroke ?? '-'}</td>
                  <td>{pace100Str(l.enhanced_avg_speed)}</td>
                  <td>{l.avg_heart_rate ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
