// FIT file parsing and segmentation logic.
// fit-file-parser converts semicircles -> degrees and applies the
// unit options given to the constructor (speed in km/h, length in m).
import FitParser from 'fit-file-parser';

export interface LeftRightBalance {
  value: number;
  right?: boolean;
}

export interface FitRecord {
  timestamp: Date;
  position_lat?: number;
  position_long?: number;
  heart_rate?: number;
  cadence?: number;
  power?: number;
  speed?: number; // km/h
  enhanced_speed?: number;
  altitude?: number;
  enhanced_altitude?: number;
  distance?: number;
  left_right_balance?: LeftRightBalance;
  left_torque_effectiveness?: number;
  right_torque_effectiveness?: number;
  left_pedal_smoothness?: number;
  right_pedal_smoothness?: number;
  temperature?: number;
  stamina?: number;
}

export interface FitLap {
  sport?: string;
  start_time?: Date;
  total_timer_time?: number;
  total_distance?: number;
  avg_power?: number;
  max_power?: number;
  normalized_power?: number;
  avg_heart_rate?: number;
  avg_cadence?: number;
  enhanced_avg_speed?: number;
  total_work?: number;
  total_ascent?: number;
  num_lengths?: number;
  num_active_lengths?: number;
  swim_stroke?: string;
  total_calories?: number;
}

export interface FitLength {
  start_time?: Date;
  total_elapsed_time?: number;
  total_timer_time?: number;
  total_strokes?: number;
  avg_speed?: number; // km/h
  swim_stroke?: string;
  avg_swimming_cadence?: number;
  length_type?: string; // 'active' | 'idle'
}

export interface FitSession {
  sport?: string;
  sub_sport?: string;
  start_time?: Date;
  total_timer_time?: number;
  total_distance?: number;
  avg_heart_rate?: number;
  max_heart_rate?: number;
  avg_power?: number;
  max_power?: number;
  avg_cadence?: number;
  total_ascent?: number;
  normalized_power?: number;
  threshold_power?: number;
  total_work?: number;
  total_calories?: number;
  enhanced_avg_speed?: number;
  enhanced_max_speed?: number;
  left_right_balance?: LeftRightBalance;
  avg_left_torque_effectiveness?: number;
  avg_right_torque_effectiveness?: number;
  avg_left_pedal_smoothness?: number;
  avg_right_pedal_smoothness?: number;
  avg_temperature?: number;
  total_training_effect?: number;
  total_anaerobic_training_effect?: number;
  pool_length?: number;
  num_active_lengths?: number;
  num_laps?: number;
  total_cycles?: number;
  avg_stroke_distance?: number;
  workout_rpe?: number;
  workout_feel?: number;
}

export interface Segment {
  label: string;
  sport: string;
  session: FitSession;
  records: FitRecord[];
}

export interface ParsedFit {
  fileName: string;
  segments: Segment[];
  allRecords: FitRecord[];
  laps: FitLap[];
  lengths: FitLength[];
}

const SPORT_LABELS: Record<string, string> = {
  swimming: 'Swim',
  cycling: 'Bike',
  running: 'Run',
};

export function parseFitFile(file: File): Promise<ParsedFit> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
    reader.onload = () => {
      const parser = new FitParser({
        force: true,
        speedUnit: 'km/h',
        lengthUnit: 'm',
        temperatureUnit: 'celsius',
        mode: 'list',
      });
      parser.parse(reader.result as ArrayBuffer, (err: unknown, data: any) => {
        if (err) {
          reject(new Error(`FITパース失敗: ${err}`));
          return;
        }
        try {
          resolve(buildParsedFit(file.name, data));
        } catch (e) {
          reject(e);
        }
      });
    };
    reader.readAsArrayBuffer(file);
  });
}

function sportLabel(sport: string): string {
  return SPORT_LABELS[sport] ?? sport.charAt(0).toUpperCase() + sport.slice(1);
}

/** Guess the sport when the file has no session summary. */
function inferSport(data: any, records: FitRecord[]): string {
  const fromSports = data.sports?.[0]?.sport;
  if (fromSports) return fromSports;
  const withPower = records.filter((r) => (r.power ?? 0) > 10).length;
  const speeds = records
    .map((r) => r.enhanced_speed ?? r.speed)
    .filter((v): v is number => typeof v === 'number' && v > 1);
  if (speeds.length === 0) return 'other';
  const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
  if (withPower > records.length * 0.3 && avgSpeed > 16) return 'cycling';
  if (avgSpeed > 16) return 'cycling';
  if (avgSpeed > 5.5) return 'running';
  return 'swimming';
}

export function buildParsedFit(fileName: string, data: any): ParsedFit {
  const records: FitRecord[] = (data.records ?? []).filter((r: any) => r.timestamp);
  records.sort((a, b) => +new Date(a.timestamp) - +new Date(b.timestamp));

  const sessions: FitSession[] = (data.sessions ?? [])
    .filter((s: any) => s.start_time)
    .sort((a: any, b: any) => +new Date(a.start_time) - +new Date(b.start_time));

  let segments: Segment[];
  if (sessions.length > 0) {
    let transitionCount = 0;
    const labeled = sessions.map((s) => {
      const sport = s.sport ?? 'other';
      let label: string;
      if (sport === 'transition') {
        transitionCount += 1;
        label = `T${transitionCount}`;
      } else {
        label = sportLabel(sport);
      }
      return { label, sport, session: s, records: [] as FitRecord[] };
    });

    const starts = labeled.map((s) => +new Date(s.session.start_time!));
    for (const rec of records) {
      const t = +new Date(rec.timestamp);
      let idx = 0;
      for (let i = 0; i < starts.length; i++) {
        if (starts[i] <= t) idx = i;
        else break;
      }
      labeled[idx].records.push(rec);
    }
    // Drop sessions that ended up with no records and no summary values.
    segments = labeled.filter(
      (s) => s.records.length > 0 || (s.session.total_timer_time ?? 0) > 0,
    );
  } else {
    const sport = inferSport(data, records);
    segments = [{ label: sportLabel(sport), sport, session: {}, records }];
  }

  const laps: FitLap[] = (data.laps ?? [])
    .filter((l: any) => l.start_time)
    .sort((a: any, b: any) => +new Date(a.start_time) - +new Date(b.start_time));

  const lengths: FitLength[] = (data.lengths ?? [])
    .filter((l: any) => l.start_time)
    .sort((a: any, b: any) => +new Date(a.start_time) - +new Date(b.start_time));

  return { fileName, segments, allRecords: records, laps, lengths };
}

export function fmtDuration(seconds?: number): string {
  const s = Math.round(seconds ?? 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}

export function paceStr(speedKmh?: number): string {
  if (!speedKmh || speedKmh < 3.0 || speedKmh > 25.0) return '--:--';
  const totalMin = 60 / speedKmh;
  let m = Math.floor(totalMin);
  let s = Math.round((totalMin - m) * 60);
  if (s === 60) {
    m += 1;
    s = 0;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** min:sec per 100 m from a speed in km/h. */
export function pace100Str(speedKmh?: number): string {
  if (!speedKmh || speedKmh <= 0) return '--:--';
  const totalMin = 6 / speedKmh; // 0.1 km / (km/h) * 60
  let m = Math.floor(totalMin);
  let s = Math.round((totalMin - m) * 60);
  if (s === 60) {
    m += 1;
    s = 0;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function rolling30s(values: (number | null)[]): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  let count = 0;
  const win: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    win.push(v);
    if (v != null) {
      sum += v;
      count++;
    }
    if (win.length > 30) {
      const dropped = win.shift();
      if (dropped != null) {
        sum -= dropped;
        count--;
      }
    }
    out[i] = count > 0 ? Math.round((sum / count) * 10) / 10 : null;
  }
  return out;
}
