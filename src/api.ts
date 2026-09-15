// Client for the persistence API (server/index.mjs).

export interface SportSummary {
  sport: string;
  startTime: string;
  durationSec: number | null;
  distanceM: number | null;
  avgHr: number | null;
  avgPower: number | null;
  normalizedPower: number | null;
  avgSpeedKmh: number | null;
  avgCadence: number | null;
  avgStepLengthM: number | null;
  avgStrokesPerLength: number | null;
  avgSwolf: number | null;
}

export interface ActivitySummary {
  id: string;
  fileName: string;
  uploadedAt: string;
  startTime: string | null;
  sports: SportSummary[];
  hasNote?: boolean;
  shoe?: string | null;
}

/** 日記つきアクティビティ（GET /api/notes の1件）。本文と、一覧に出す指標を含む。 */
export interface DiaryEntry {
  id: string;
  fileName: string;
  /** UTC の ISO 文字列。表示・検索用の YYYY-MM-DD 変換は diarySearch.dateKey が行う。 */
  startTime: string | null;
  sports: SportSummary[];
  note: string;
}

/** セッション切れを検知したときに App 側へ知らせるためのイベント名。 */
export const UNAUTHORIZED_EVENT = 'fv:unauthorized';

async function toJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    // 認証系API以外で401が返ったら、セッション切れとみなして再ログインを促す。
    if (res.status === 401 && !res.url.includes('/api/auth/')) {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    }
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* keep default */
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export async function listActivities(): Promise<ActivitySummary[]> {
  return toJson(await fetch('/api/activities'));
}

export async function listNotes(): Promise<DiaryEntry[]> {
  return toJson(await fetch('/api/notes'));
}

export async function uploadActivity(file: File): Promise<ActivitySummary> {
  const form = new FormData();
  form.append('file', file);
  return toJson(await fetch('/api/activities', { method: 'POST', body: form }));
}

export async function fetchActivityFile(activity: { id: string; fileName: string }): Promise<File> {
  const res = await fetch(`/api/activities/${activity.id}/fit`);
  if (!res.ok) throw new Error(`保存ファイルの取得に失敗しました (HTTP ${res.status})`);
  return new File([await res.arrayBuffer()], activity.fileName);
}

export async function deleteActivity(id: string): Promise<void> {
  await toJson(await fetch(`/api/activities/${id}`, { method: 'DELETE' }));
}

export async function getNote(id: string): Promise<string> {
  const res = await toJson<{ note: string }>(await fetch(`/api/activities/${id}/note`));
  return res.note;
}

export async function saveNote(id: string, note: string): Promise<void> {
  await toJson(
    await fetch(`/api/activities/${id}/note`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note }),
    }),
  );
}

export interface ShoeStats {
  name: string;
  runCount: number;
  totalKm: number;
  lastUsed: string | null;
}

export async function saveShoe(id: string, shoe: string | null): Promise<void> {
  await toJson(
    await fetch(`/api/activities/${id}/shoe`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shoe: shoe ?? '' }),
    }),
  );
}

export async function listShoes(): Promise<ShoeStats[]> {
  return toJson(await fetch('/api/shoes'));
}

export interface CriticalFit {
  value?: number;
  valueKmh?: number;
  wPrimeJ?: number;
  dPrimeM?: number;
  r2: number;
  durationsUsed: number[];
}

export interface SportThresholds {
  sport: string;
  activityCount: number;
  powerCurve: Record<string, number> | null;
  speedCurve: Record<string, number> | null;
  hrCurve: Record<string, number> | null;
  lthr: { value: number; fromDurationSec: number } | null;
  cp: CriticalFit | null;
  cs: CriticalFit | null;
  ftp: { value: number; method: string; best20min: number | null } | null;
  lt1: { power?: number; speedKmh?: number; hr?: number };
  lt2: { power?: number; speedKmh?: number; hr?: number };
  zones: {
    power: { name: string; from: number; to: number | null }[] | null;
    hr: { name: string; from: number; to: number | null }[] | null;
  };
}

export interface ThresholdsResponse {
  days: number;
  activityCount: number;
  newlyComputed: number;
  notes: Record<string, string>;
  sports: Record<string, SportThresholds>;
}

export async function getThresholds(days: number): Promise<ThresholdsResponse> {
  return toJson(await fetch(`/api/thresholds?days=${days}`));
}

// --- 認証 ---

export interface AuthStatus {
  configured: boolean;
  authenticated: boolean;
}

export async function getAuthStatus(): Promise<AuthStatus> {
  return toJson(await fetch('/api/auth/status'));
}

/** 初回セットアップ。パスワードは呼び出し元（ログイン画面）から渡される。 */
export async function setupPassword(password: string): Promise<void> {
  await toJson(
    await fetch('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    }),
  );
}

export async function login(password: string): Promise<void> {
  await toJson(
    await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    }),
  );
}

export async function logout(): Promise<void> {
  await toJson(await fetch('/api/auth/logout', { method: 'POST' }));
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await toJson(
    await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  );
}
