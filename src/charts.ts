// Builders that turn a parsed segment into Plotly figure specs.
import type { FitLength, FitRecord, Segment } from './fit';
import { fmtDuration, paceStr, rolling30s } from './fit';

export interface Figure {
  data: any[];
  layout: any;
}

const GRID = '#334155';
const PAPER = 'rgba(0,0,0,0)';

const SEGMENT_COLORS: Record<string, string> = {
  Swim: '#10b981',
  Bike: '#3b82f6',
  Run: '#f59e0b',
};

function pick(records: FitRecord[], key: keyof FitRecord): (number | null)[] {
  return records.map((r) => {
    const v = r[key];
    return typeof v === 'number' && !Number.isNaN(v) ? v : null;
  });
}

function hasSignal(values: (number | null)[]): boolean {
  const set = new Set(values.filter((v) => v != null));
  return set.size >= 2;
}

export function buildSegmentFigure(segment: Segment): Figure | null {
  const { records } = segment;
  if (records.length === 0) return null;
  const isRun = segment.sport === 'running';
  const x = records.map((r) => r.timestamp);

  const rows: { values: (number | null)[]; title: string; color: string; reversed?: boolean; text?: string[] }[] = [];

  const hr = pick(records, 'heart_rate');
  if (hasSignal(hr)) rows.push({ values: hr, title: 'Heart Rate (bpm)', color: '#ef4444' });

  const power = pick(records, 'power');
  if (hasSignal(power)) rows.push({ values: rolling30s(power), title: 'Power 30s Avg (W)', color: '#3b82f6' });

  const cadence = pick(records, 'cadence');
  if (hasSignal(cadence)) {
    rows.push({
      values: isRun ? cadence.map((v) => (v != null ? v * 2 : null)) : cadence,
      title: isRun ? 'Cadence (spm)' : 'Cadence (rpm)',
      color: '#10b981',
    });
  }

  const speedRaw = records.map((r) => {
    const v = r.enhanced_speed ?? r.speed;
    return typeof v === 'number' && !Number.isNaN(v) ? v : null;
  });
  if (hasSignal(speedRaw)) {
    if (isRun) {
      const pace = speedRaw.map((v) => (v != null && v >= 3.0 && v <= 25.0 ? 60 / v : null));
      rows.push({
        values: pace,
        title: 'Pace (min/km)',
        color: '#f59e0b',
        reversed: true,
        text: speedRaw.map((v) => paceStr(v ?? undefined)),
      });
    } else {
      rows.push({ values: speedRaw, title: 'Speed (km/h)', color: '#f59e0b' });
    }
  }

  const alt = records.map((r) => {
    const v = r.enhanced_altitude ?? r.altitude;
    return typeof v === 'number' && !Number.isNaN(v) ? v : null;
  });
  if (hasSignal(alt)) rows.push({ values: alt, title: 'Altitude (m)', color: '#a78bfa' });

  if (rows.length === 0) return null;

  const n = rows.length;
  const data = rows.map((row, i) => ({
    x,
    y: row.values,
    name: row.title,
    type: 'scatter',
    mode: 'lines',
    line: { color: row.color, width: 1.5 },
    yaxis: i === 0 ? 'y' : `y${i + 1}`,
    text: row.text,
    hovertemplate: row.text ? `${row.title}: %{text} /km<extra></extra>` : `${row.title}: %{y:.1f}<extra></extra>`,
  }));

  const layout: any = {
    height: 170 * n + 60,
    margin: { l: 60, r: 30, t: 30, b: 30 },
    showlegend: false,
    paper_bgcolor: PAPER,
    plot_bgcolor: PAPER,
    font: { color: '#94a3b8' },
    hovermode: 'x unified',
    xaxis: { gridcolor: GRID, anchor: n === 1 ? 'y' : `y${n}` },
  };
  const domainH = 1 / n;
  rows.forEach((row, i) => {
    const top = 1 - i * domainH;
    const bottom = top - domainH + 0.05;
    layout[i === 0 ? 'yaxis' : `yaxis${i + 1}`] = {
      title: { text: row.title, font: { size: 11, color: row.color } },
      domain: [Math.max(0, bottom), top],
      gridcolor: GRID,
      color: row.color,
      ...(row.reversed ? { autorange: 'reversed' } : {}),
    };
  });

  return { data, layout };
}

export function buildMapFigure(segments: Segment[]): Figure | null {
  const traces: any[] = [];
  let allLats: number[] = [];
  let allLons: number[] = [];

  for (const seg of segments) {
    const pts = seg.records.filter(
      (r) =>
        typeof r.position_lat === 'number' &&
        typeof r.position_long === 'number' &&
        (Math.abs(r.position_lat) > 0.01 || Math.abs(r.position_long) > 0.01),
    );
    if (pts.length === 0) continue;
    const lat = pts.map((r) => r.position_lat!);
    const lon = pts.map((r) => r.position_long!);
    allLats = allLats.concat(lat);
    allLons = allLons.concat(lon);
    traces.push({
      type: 'scattermap',
      lat,
      lon,
      mode: 'lines',
      line: { width: 3, color: SEGMENT_COLORS[seg.label] ?? '#94a3b8' },
      name: seg.label,
      hoverinfo: 'name',
    });
  }

  if (allLats.length === 0) return null;

  traces.push({
    type: 'scattermap',
    lat: [allLats[0]],
    lon: [allLons[0]],
    mode: 'markers',
    marker: { size: 14, color: '#22c55e' },
    name: 'Start',
  });
  traces.push({
    type: 'scattermap',
    lat: [allLats[allLats.length - 1]],
    lon: [allLons[allLons.length - 1]],
    mode: 'markers',
    marker: { size: 14, color: '#ef4444' },
    name: 'Finish',
  });

  const layout = {
    map: {
      style: 'open-street-map',
      center: {
        lat: allLats.reduce((a, b) => a + b, 0) / allLats.length,
        lon: allLons.reduce((a, b) => a + b, 0) / allLons.length,
      },
      zoom: 12,
    },
    height: 620,
    margin: { l: 0, r: 0, t: 0, b: 0 },
    paper_bgcolor: PAPER,
    font: { color: '#94a3b8' },
    legend: { bgcolor: 'rgba(15,23,42,0.75)', font: { color: '#e2e8f0' } },
  };

  return { data: traces, layout };
}

// ---- Bike detail figures ----

/** Best average power for a set of window durations (records assumed ~1s apart). */
export function buildPeakPowerFigure(records: FitRecord[]): Figure | null {
  const power = records.map((r) => (typeof r.power === 'number' ? r.power : 0));
  if (power.filter((v) => v > 0).length < 10) return null;

  const prefix = new Float64Array(power.length + 1);
  for (let i = 0; i < power.length; i++) prefix[i + 1] = prefix[i] + power[i];

  const durations = [5, 10, 30, 60, 120, 300, 600, 1200, 1800, 2700, 3600].filter(
    (d) => d <= power.length,
  );
  if (durations[durations.length - 1] !== power.length) durations.push(power.length);

  const best = durations.map((d) => {
    let max = 0;
    for (let i = 0; i + d <= power.length; i++) {
      const avg = (prefix[i + d] - prefix[i]) / d;
      if (avg > max) max = avg;
    }
    return Math.round(max * 10) / 10;
  });

  const labels = durations.map((d) => fmtDuration(d));

  return {
    data: [
      {
        x: labels,
        y: best,
        type: 'scatter',
        mode: 'lines+markers+text',
        text: best.map((v) => `${Math.round(v)}W`),
        textposition: 'top center',
        textfont: { size: 10, color: '#93c5fd' },
        line: { color: '#3b82f6', width: 2 },
        marker: { size: 7, color: '#60a5fa' },
        hovertemplate: '%{x}: %{y:.1f} W<extra></extra>',
      },
    ],
    layout: {
      height: 320,
      margin: { l: 60, r: 30, t: 20, b: 40 },
      paper_bgcolor: PAPER,
      plot_bgcolor: PAPER,
      font: { color: '#94a3b8' },
      xaxis: { title: { text: 'Duration' }, gridcolor: GRID, type: 'category' },
      yaxis: { title: { text: 'Best Avg Power (W)' }, gridcolor: GRID },
      showlegend: false,
    },
  };
}

/** Power distribution histogram in 25 W buckets. */
export function buildPowerHistFigure(records: FitRecord[]): Figure | null {
  const power = records
    .map((r) => r.power)
    .filter((v): v is number => typeof v === 'number' && v > 0);
  if (power.length < 10) return null;

  return {
    data: [
      {
        x: power,
        type: 'histogram',
        xbins: { size: 25 },
        marker: { color: '#3b82f6', line: { color: '#0f172a', width: 1 } },
        hovertemplate: '%{x} W: %{y}秒<extra></extra>',
      },
    ],
    layout: {
      height: 300,
      margin: { l: 60, r: 30, t: 20, b: 40 },
      paper_bgcolor: PAPER,
      plot_bgcolor: PAPER,
      font: { color: '#94a3b8' },
      xaxis: { title: { text: 'Power (W)' }, gridcolor: GRID },
      yaxis: { title: { text: '時間 (秒)' }, gridcolor: GRID },
      showlegend: false,
      bargap: 0.05,
    },
  };
}

/** Pedaling dynamics: L/R balance, torque effectiveness, pedal smoothness (+stamina if present). */
export function buildDynamicsFigure(records: FitRecord[]): Figure | null {
  const x = records.map((r) => r.timestamp);

  // Garmin reports balance relative to the flagged side (right=true -> value is right %).
  const rightPct = records.map((r) => {
    const b = r.left_right_balance;
    if (!b || typeof b.value !== 'number' || b.value > 100) return null;
    return b.right ? b.value : 100 - b.value;
  });

  const teL = records.map((r) => r.left_torque_effectiveness ?? null);
  const teR = records.map((r) => r.right_torque_effectiveness ?? null);
  const psL = records.map((r) => r.left_pedal_smoothness ?? null);
  const psR = records.map((r) => r.right_pedal_smoothness ?? null);
  const stamina = records.map((r) => r.stamina ?? null);

  const nonNull = (a: (number | null)[]) => a.filter((v) => v != null).length;

  const rows: { traces: any[]; title: string }[] = [];
  if (nonNull(rightPct) > 10) {
    rows.push({
      title: 'R Balance (%)',
      traces: [
        {
          x,
          y: rolling30s(rightPct),
          name: 'Right Balance 30s (%)',
          line: { color: '#f472b6', width: 1.5 },
        },
      ],
    });
  }
  if (nonNull(teL) > 10 || nonNull(teR) > 10) {
    rows.push({
      title: 'Torque Eff. (%)',
      traces: [
        { x, y: rolling30s(teL), name: 'TE Left (%)', line: { color: '#38bdf8', width: 1.2 } },
        { x, y: rolling30s(teR), name: 'TE Right (%)', line: { color: '#fb923c', width: 1.2 } },
      ],
    });
  }
  if (nonNull(psL) > 10 || nonNull(psR) > 10) {
    rows.push({
      title: 'Pedal Smooth. (%)',
      traces: [
        { x, y: rolling30s(psL), name: 'PS Left (%)', line: { color: '#38bdf8', width: 1.2 } },
        { x, y: rolling30s(psR), name: 'PS Right (%)', line: { color: '#fb923c', width: 1.2 } },
      ],
    });
  }
  if (nonNull(stamina) > 10) {
    rows.push({
      title: 'Stamina (%)',
      traces: [{ x, y: stamina, name: 'Stamina (%)', line: { color: '#a3e635', width: 1.5 } }],
    });
  }

  if (rows.length === 0) return null;

  const n = rows.length;
  const data: any[] = [];
  rows.forEach((row, i) => {
    for (const t of row.traces) {
      data.push({
        ...t,
        type: 'scatter',
        mode: 'lines',
        yaxis: i === 0 ? 'y' : `y${i + 1}`,
        hovertemplate: `${t.name}: %{y:.1f}<extra></extra>`,
      });
    }
  });

  const layout: any = {
    height: 150 * n + 80,
    margin: { l: 60, r: 30, t: 30, b: 30 },
    showlegend: true,
    legend: { orientation: 'h', y: 1.06, font: { size: 10 } },
    paper_bgcolor: PAPER,
    plot_bgcolor: PAPER,
    font: { color: '#94a3b8' },
    hovermode: 'x unified',
    xaxis: { gridcolor: GRID, anchor: n === 1 ? 'y' : `y${n}` },
  };
  const domainH = 1 / n;
  rows.forEach((row, i) => {
    const top = 1 - i * domainH;
    const bottom = top - domainH + 0.06;
    layout[i === 0 ? 'yaxis' : `yaxis${i + 1}`] = {
      title: { text: row.title, font: { size: 10 } },
      domain: [Math.max(0, bottom), top],
      gridcolor: GRID,
    };
  });

  return { data, layout };
}

// ---- Swim detail figures ----

const STROKE_COLORS: Record<string, string> = {
  freestyle: '#3b82f6',
  backstroke: '#10b981',
  breaststroke: '#a78bfa',
  butterfly: '#ef4444',
  drill: '#f59e0b',
  mixed: '#94a3b8',
  im: '#ec4899',
};

/** Per-length view: time bars colored by stroke, then strokes + SWOLF, then cadence. */
export function buildLengthsFigure(lengths: FitLength[]): Figure | null {
  const active = lengths.filter((l) => l.length_type === 'active');
  if (active.length < 2) return null;

  const idx = active.map((_, i) => i + 1);
  const time = active.map((l) => l.total_timer_time ?? l.total_elapsed_time ?? null);
  const strokes = active.map((l) => l.total_strokes ?? null);
  const swolf = active.map((_, i) =>
    time[i] != null && strokes[i] != null ? Math.round(time[i]! + strokes[i]!) : null,
  );
  const cadence = active.map((l) => l.avg_swimming_cadence ?? null);

  const data: any[] = [];

  // Row 1: one bar trace per stroke type so the legend doubles as a stroke map.
  const strokeTypes = [...new Set(active.map((l) => l.swim_stroke ?? 'unknown'))];
  for (const stroke of strokeTypes) {
    data.push({
      x: idx.filter((_, i) => (active[i].swim_stroke ?? 'unknown') === stroke),
      y: time.filter((_, i) => (active[i].swim_stroke ?? 'unknown') === stroke),
      name: stroke,
      type: 'bar',
      marker: { color: STROKE_COLORS[stroke] ?? '#64748b' },
      yaxis: 'y',
      hovertemplate: `${stroke}: %{y:.1f}秒<extra>本目 %{x}</extra>`,
    });
  }

  // Row 2: strokes + SWOLF
  data.push({
    x: idx,
    y: strokes,
    name: 'Strokes',
    type: 'bar',
    marker: { color: '#475569' },
    yaxis: 'y2',
    hovertemplate: 'Strokes: %{y}<extra></extra>',
  });
  data.push({
    x: idx,
    y: swolf,
    name: 'SWOLF',
    type: 'scatter',
    mode: 'lines+markers',
    line: { color: '#f472b6', width: 2 },
    marker: { size: 5 },
    yaxis: 'y2',
    hovertemplate: 'SWOLF: %{y}<extra></extra>',
  });

  // Row 3: cadence
  const hasCadence = cadence.some((v) => v != null && v > 0);
  if (hasCadence) {
    data.push({
      x: idx,
      y: cadence,
      name: 'Cadence (spm)',
      type: 'scatter',
      mode: 'lines+markers',
      line: { color: '#10b981', width: 1.5 },
      marker: { size: 4 },
      yaxis: 'y3',
      hovertemplate: 'Cadence: %{y} spm<extra></extra>',
    });
  }

  const n = hasCadence ? 3 : 2;
  const domainH = 1 / n;
  const layout: any = {
    height: 170 * n + 80,
    margin: { l: 60, r: 30, t: 30, b: 40 },
    showlegend: true,
    legend: { orientation: 'h', y: 1.08, font: { size: 10 } },
    paper_bgcolor: PAPER,
    plot_bgcolor: PAPER,
    font: { color: '#94a3b8' },
    barmode: 'overlay',
    xaxis: {
      title: { text: '本数（アクティブレングス）' },
      gridcolor: GRID,
      anchor: `y${n}`,
      dtick: 5,
    },
  };
  const titles = ['Time (s)', 'Strokes / SWOLF', 'Cadence (spm)'].slice(0, n);
  titles.forEach((t, i) => {
    const top = 1 - i * domainH;
    const bottom = top - domainH + 0.06;
    layout[i === 0 ? 'yaxis' : `yaxis${i + 1}`] = {
      title: { text: t, font: { size: 10 } },
      domain: [Math.max(0, bottom), top],
      gridcolor: GRID,
    };
  });

  return { data, layout };
}
