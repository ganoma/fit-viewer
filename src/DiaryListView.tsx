import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { DiaryEntry, SportSummary } from './api';
import { listNotes } from './api';
import { dateKey, matchesAll, parseQuery } from './diarySearch';
import { fmtDuration, pace100Str, paceStr } from './fit';
import MarkdownNote from './MarkdownNote';

// TrendsView の SPORT_SECTIONS.label と同じ文言。文言を変えるときは両方直す。
const SPORT_LABEL: Record<string, string> = {
  swimming: '🏊 スイム',
  cycling: '🚴 バイク',
  running: '🏃 ラン',
};

/** 1種目ぶんの指標を、既存画面と同じ単位・書式の文字列配列にする。値が無いものは出さない。 */
function sportMetrics(s: SportSummary): string[] {
  const out: string[] = [];
  if (s.distanceM) {
    out.push(
      s.sport === 'swimming'
        ? `${Math.round(s.distanceM)} m`
        : `${(s.distanceM / 1000).toFixed(2)} km`,
    );
  }
  if (s.durationSec) out.push(fmtDuration(s.durationSec));
  if (s.avgSpeedKmh) {
    if (s.sport === 'running') {
      const p = paceStr(s.avgSpeedKmh);
      if (p !== '--:--') out.push(`${p} /km`); // paceStr は範囲外で '--:--' を返す
    } else if (s.sport === 'swimming') {
      const p = pace100Str(s.avgSpeedKmh);
      if (p !== '--:--') out.push(`${p} /100m`);
    } else {
      out.push(`${s.avgSpeedKmh.toFixed(1)} km/h`);
    }
  }
  if (s.sport === 'cycling' && s.normalizedPower != null) out.push(`${s.normalizedPower} W`);
  if (s.avgHr != null) out.push(`${s.avgHr} bpm`);
  return out;
}

export default function DiaryListView({
  savedVersion,
  onOpenActivity,
}: {
  savedVersion: number;
  onOpenActivity: (entry: DiaryEntry) => void;
}) {
  const [entries, setEntries] = useState<DiaryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query); // 入力の反応を落とさない

  useEffect(() => {
    let cancelled = false;
    listNotes()
      .then((list) => {
        if (!cancelled) {
          setEntries(list);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled)
          setError(
            '保存サーバーに接続できません。コンテナまたは `npm run dev:server` を起動してください。',
          );
      });
    return () => {
      cancelled = true;
    };
  }, [savedVersion]);

  const terms = useMemo(() => parseQuery(deferredQuery), [deferredQuery]);
  const filtered = useMemo(
    () => (entries ?? []).filter((e) => matchesAll([e.note, dateKey(e.startTime)], terms)),
    [entries, terms],
  );

  if (error) return <p className="status error">⚠️ {error}</p>;
  if (entries == null) return <p className="status">⏳ 読み込み中…</p>;
  if (entries.length === 0)
    return (
      <div className="dropzone">
        <p className="dropzone-main">まだ日記が保存されていません</p>
        <p className="dropzone-sub">
          「📊 アクティビティ」タブでアクティビティを開き、📝 トレーニング日記に書くとここに並びます
        </p>
      </div>
    );

  return (
    <>
      <div className="card diary-search">
        <input
          className="diary-search-input"
          type="search"
          placeholder="本文・日付で絞り込み（例: LT走 / 2026-07）。スペース区切りはAND"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="status">該当する日記がありません</p>
      ) : (
        filtered.map((e) => (
          <article className="card diary-entry" key={e.id}>
            <div className="diary-entry-head">
              <span className="diary-entry-date">{dateKey(e.startTime) || '-'}</span>
              <div className="diary-entry-sports">
                {e.sports.map((s, i) => (
                  <span className="diary-entry-sport" key={i}>
                    {SPORT_LABEL[s.sport] ?? `🏅 ${s.sport}`} {sportMetrics(s).join(' · ')}
                  </span>
                ))}
              </div>
              <button className="diary-entry-open" onClick={() => onOpenActivity(e)}>
                📊 アクティビティを開く
              </button>
            </div>
            <MarkdownNote source={e.note} terms={terms} />
          </article>
        ))
      )}
    </>
  );
}
