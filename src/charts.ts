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

// ---- Overlay segment chart (checkbox-selected metrics on one plot) ----

export interface Metric {
  key: string;
  title: string;
  unit: string;
  color: string;
  values: (number | null)[];
  reversed?: boolean;
  text?: string[];
}

export function extractSegmentMetrics(segment: Segment): { x: Date[]; metrics: Metric[] } {
  const { records } = segment;
  const isRun = segment.sport === 'running';
  const x = records.map((r) => r.timestamp);
  const metrics: Metric[] = [];

  const hr = pick(records, 'heart_rate');
  if (hasSignal(hr))
    metrics.push({ key: 'hr', title: 'Heart Rate', unit: 'bpm', color: '#ef4444', values: hr });

  const power = pick(records, 'power');
  if (hasSignal(power))
    metrics.push({
      key: 'power',
      title: 'Power 30s Avg',
      unit: 'W',
      color: '#3b82f6',
      values: rolling30s(power),
    });

  const cadence = pick(records, 'cadence');
  if (hasSignal(cadence))
    metrics.push({
      key: 'cadence',
      title: 'Cadence',
      unit: isRun ? 'spm' : 'rpm',
      color: '#10b981',
      values: isRun ? cadence.map((v) => (v != null ? v * 2 : null)) : cadence,
    });

  const speedRaw = records.map((r) => {
    const v = r.enhanced_speed ?? r.speed;
    return typeof v === 'number' && !Number.isNaN(v) ? v : null;
  });
  if (hasSignal(speedRaw)) {
    if (isRun) {
      metrics.push({
        key: 'pace',
        title: 'Pace',
        unit: 'min/km',
        color: '#f59e0b',
        values: speedRaw.map((v) => (v != null && v >= 3.0 && v <= 25.0 ? 60 / v : null)),
        reversed: true,
        text: speedRaw.map((v) => paceStr(v ?? undefined)),
      });
    } else {
      metrics.push({
        key: 'speed',
        title: 'Speed',
        unit: 'km/h',
        color: '#f59e0b',
        values: speedRaw,
      });
    }
  }

  const alt = records.map((r) => {
    const v = r.enhanced_altitude ?? r.altitude;
    return typeof v === 'number' && !Number.isNaN(v) ? v : null;
  });
  if (hasSignal(alt))
    metrics.push({ key: 'alt', title: 'Altitude', unit: 'm', color: '#a78bfa', values: alt });

  return { x, metrics };
}

/**
 * One plot, one y-axis per selected metric. Axes alternate left/right;
 * beyond two they are stacked outward with free positioning.
 */
export function buildOverlayFigure(x: Date[], metrics: Metric[]): Figure | null {
  if (metrics.length === 0) return null;

  const n = metrics.length;
  const sides = metrics.map((_, i) => (i % 2 === 0 ? 'left' : 'right') as 'left' | 'right');
  const leftCount = sides.filter((s) => s === 'left').length;
  const rightCount = n - leftCount;
  const OFFSET = 0.07;

  const xDomain: [number, number] = [
    Math.max(0, (leftCount - 1) * OFFSET),
    Math.min(1, 1 - (rightCount - 1) * OFFSET),
  ];

  const data = metrics.map((m, i) => ({
    x,
    y: m.values,
    name: `${m.title} (${m.unit})`,
    type: 'scatter',
    mode: 'lines',
    line: { color: m.color, width: 1.4 },
    yaxis: i === 0 ? 'y' : `y${i + 1}`,
    text: m.text,
    hovertemplate: m.text
      ? `${m.title}: %{text} /km<extra></extra>`
      : `${m.title}: %{y:.1f} ${m.unit}<extra></extra>`,
  }));

  const layout: any = {
    height: 460,
    margin: { l: 55, r: 55, t: 40, b: 40 },
    showlegend: true,
    legend: { orientation: 'h', y: 1.12, font: { size: 11 } },
    paper_bgcolor: PAPER,
    plot_bgcolor: PAPER,
    font: { color: '#94a3b8' },
    hovermode: 'x unified',
    xaxis: { gridcolor: GRID, domain: xDomain },
  };

  let leftSeen = 0;
  let rightSeen = 0;
  metrics.forEach((m, i) => {
    const side = sides[i];
    // Innermost axis sits at the plot edge; later same-side axes step outward.
    const position =
      side === 'left'
        ? xDomain[0] - leftSeen * OFFSET
        : xDomain[1] + rightSeen * OFFSET;
    if (side === 'left') leftSeen++;
    else rightSeen++;

    const axis: any = {
      title: { text: m.unit, font: { size: 10, color: m.color } },
      color: m.color,
      side,
      showgrid: i === 0,
      gridcolor: GRID,
      zeroline: false,
      ...(m.reversed ? { autorange: 'reversed' } : {}),
    };
    if (i === 0) {
      axis.anchor = 'x';
    } else {
      axis.overlaying = 'y';
      if (i <= 1) {
        axis.anchor = 'x';
      } else {
        axis.anchor = 'free';
        axis.position = Math.min(1, Math.max(0, position));
      }
    }
    layout[i === 0 ? 'yaxis' : `yaxis${i + 1}`] = axis;
  });

  return { data, layout };
}
