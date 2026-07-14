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
}

async function toJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
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

export async function uploadActivity(file: File): Promise<ActivitySummary> {
  const form = new FormData();
  form.append('file', file);
  return toJson(await fetch('/api/activities', { method: 'POST', body: form }));
}

export async function fetchActivityFile(activity: ActivitySummary): Promise<File> {
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
