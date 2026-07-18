// Zip upload support: Garmin Connect exports activities as a zip that
// contains a single .fit file. We unzip in the browser and rename the
// file after the activity date, so the stored name is meaningful.
import { unzipSync } from 'fflate';

export function isZipFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.zip');
}

export interface ExtractedFit {
  bytes: Uint8Array;
  entryName: string;
}

export async function extractSingleFit(file: File): Promise<ExtractedFit> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new Error('zipファイルを解凍できませんでした');
  }
  const fitNames = Object.keys(entries).filter((n) => {
    const base = n.split('/').pop() ?? '';
    return (
      n.toLowerCase().endsWith('.fit') && !n.startsWith('__MACOSX/') && !base.startsWith('.')
    );
  });
  if (fitNames.length === 0) {
    throw new Error('zip内に.fitファイルが見つかりません');
  }
  if (fitNames.length > 1) {
    throw new Error(`zip内に.fitファイルが${fitNames.length}個あります（1個のみ対応しています）`);
  }
  return { bytes: entries[fitNames[0]], entryName: fitNames[0].split('/').pop()! };
}

/** Activity start (JST) -> "YYYYMMDD.fit"; falls back to the zip entry name. */
export function dateBasedName(start: Date | undefined, fallback: string): string {
  if (!start || Number.isNaN(+start)) return fallback;
  const ymd = start
    .toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
    .replaceAll('-', '');
  return `${ymd}.fit`;
}
