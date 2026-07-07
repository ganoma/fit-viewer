// Server-side FIT parsing: extracts a compact per-sport summary used by the
// trends page. The raw file is kept alongside, so anything not summarized
// here can still be re-parsed by the client viewer.
import crypto from 'node:crypto';
import FitParser from 'fit-file-parser';

export function parseFitBuffer(buf) {
  return new Promise((resolve, reject) => {
    const parser = new FitParser({
      force: true,
      speedUnit: 'km/h',
      lengthUnit: 'm',
      temperatureUnit: 'celsius',
      mode: 'list',
    });
    parser.parse(buf, (err, data) => (err ? reject(new Error(String(err))) : resolve(data)));
  });
}

const avg = (values) => {
  const v = values.filter((x) => typeof x === 'number' && !Number.isNaN(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

const round = (v, digits = 2) =>
  v == null ? null : Math.round(v * 10 ** digits) / 10 ** digits;

export function buildSummary(fileName, data, buf) {
  const records = (data.records ?? []).filter((r) => r.timestamp);
  const lengths = (data.lengths ?? []).filter((l) => l.start_time);
  const sessions = (data.sessions ?? [])
    .filter((s) => s.start_time && s.sport && s.sport !== 'transition')
    .sort((a, b) => +new Date(a.start_time) - +new Date(b.start_time));

  const sports = sessions.map((s) => {
    const start = +new Date(s.start_time);
    const durMs = (s.total_elapsed_time ?? s.total_timer_time ?? 0) * 1000;
    const end = start + durMs + 1000;
    const inWindow = (t) => t >= start && t < end;

    let avgStepLengthM = null;
    if (s.sport === 'running') {
      const stepLengths = records
        .filter((r) => inWindow(+new Date(r.timestamp)))
        .map((r) => r.step_length)
        .filter((v) => typeof v === 'number' && v > 0);
      const m = avg(stepLengths);
      if (m != null) avgStepLengthM = m / 1000; // mm -> m
    }

    let avgStrokesPerLength = null;
    let avgSwolf = null;
    if (s.sport === 'swimming') {
      const active = lengths.filter(
        (l) => inWindow(+new Date(l.start_time)) && l.length_type === 'active',
      );
      avgStrokesPerLength = avg(active.map((l) => l.total_strokes));
      avgSwolf = avg(
        active
          .filter((l) => l.total_strokes != null && (l.total_timer_time ?? l.total_elapsed_time) != null)
          .map((l) => (l.total_timer_time ?? l.total_elapsed_time) + l.total_strokes),
      );
    }

    return {
      sport: s.sport,
      startTime: new Date(s.start_time).toISOString(),
      durationSec: round(s.total_timer_time ?? null, 1),
      distanceM: round(s.total_distance ?? null, 1),
      avgHr: s.avg_heart_rate ?? null,
      avgPower: s.avg_power ?? null,
      normalizedPower: s.normalized_power ?? null,
      avgSpeedKmh: round(s.enhanced_avg_speed ?? null),
      avgCadence: s.avg_cadence ?? null,
      avgStepLengthM: round(avgStepLengthM),
      avgStrokesPerLength: round(avgStrokesPerLength, 1),
      avgSwolf: round(avgSwolf, 1),
    };
  });

  const startTime =
    sessions[0]?.start_time != null
      ? new Date(sessions[0].start_time).toISOString()
      : records[0]?.timestamp != null
        ? new Date(records[0].timestamp).toISOString()
        : null;

  return {
    id: crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16),
    fileName,
    uploadedAt: new Date().toISOString(),
    startTime,
    sports,
  };
}
