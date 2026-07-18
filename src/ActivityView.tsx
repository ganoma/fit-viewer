import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ParsedFit } from './fit';
import { fmtDuration } from './fit';
import { buildMapFigure } from './charts';
import type { ActivitySummary } from './api';
import { deleteActivity, fetchActivityFile, listActivities } from './api';
import Plot from './Plot';
import SegmentChart from './SegmentChart';
import BikeDetails from './BikeDetails';
import SwimDetails from './SwimDetails';
import DiaryCard from './DiaryCard';
import ShoeTagCard from './ShoeTagCard';

const SPORT_EMOJI: Record<string, string> = {
  swimming: '🏊',
  cycling: '🚴',
  running: '🏃',
};

export default function ActivityView({
  parsed,
  currentActivityId,
  loading,
  error,
  uploadNote,
  savedVersion,
  onFile,
  onSavedDeleted,
  onNoteSaved,
}: {
  parsed: ParsedFit | null;
  currentActivityId: string | null;
  loading: boolean;
  error: string | null;
  uploadNote: string | null;
  savedVersion: number;
  onFile: (file: File) => void;
  onSavedDeleted: () => void;
  onNoteSaved: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [saved, setSaved] = useState<ActivitySummary[] | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  // Shoe-tag filter for the saved list (null = show all).
  const [shoeFilter, setShoeFilter] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listActivities()
      .then((list) => {
        if (!cancelled) {
          setSaved(list);
          setServerError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setServerError('保存サーバーに接続できません（保存機能なしで利用できます）');
      });
    return () => {
      cancelled = true;
    };
  }, [savedVersion]);

  const openSaved = useCallback(
    async (activity: ActivitySummary) => {
      try {
        onFile(await fetchActivityFile(activity));
      } catch (e) {
        setServerError(e instanceof Error ? e.message : String(e));
      }
    },
    [onFile],
  );

  const removeSaved = useCallback(
    async (activity: ActivitySummary) => {
      if (!confirm(`「${activity.fileName}」を削除しますか？`)) return;
      try {
        await deleteActivity(activity.id);
        onSavedDeleted();
      } catch (e) {
        setServerError(e instanceof Error ? e.message : String(e));
      }
    },
    [onSavedDeleted],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    },
    [onFile],
  );

  const mapFigure = useMemo(() => (parsed ? buildMapFigure(parsed.segments) : null), [parsed]);

  return (
    <>
      {saved && saved.length > 0 && (
        <div className="card">
          <h3>💾 保存済みアクティビティ</h3>
          {(() => {
            const shoes = [...new Set(saved.map((a) => a.shoe).filter((s): s is string => !!s))];
            if (shoes.length === 0) return null;
            return (
              <div className="metric-toggles">
                <label className={`metric-toggle ${shoeFilter == null ? 'checked' : ''}`}>
                  <input
                    type="checkbox"
                    checked={shoeFilter == null}
                    onChange={() => setShoeFilter(null)}
                  />
                  すべて
                </label>
                {shoes.map((s) => (
                  <label key={s} className={`metric-toggle ${shoeFilter === s ? 'checked' : ''}`}>
                    <input
                      type="checkbox"
                      checked={shoeFilter === s}
                      onChange={() => setShoeFilter(shoeFilter === s ? null : s)}
                    />
                    👟 {s}
                  </label>
                ))}
              </div>
            );
          })()}
          <ul className="saved-list">
            {[...saved]
              .reverse()
              .filter((a) => shoeFilter == null || a.shoe === shoeFilter)
              .map((a) => (
                <li key={a.id}>
                  <button className="saved-item" onClick={() => openSaved(a)}>
                    <span className="saved-date">
                      {a.startTime ? new Date(a.startTime).toLocaleDateString('ja-JP') : '-'}
                    </span>
                    <span className="saved-name">
                      {a.fileName}
                      {a.hasNote && <span title="日記あり"> 📝</span>}
                      {a.shoe && <span className="saved-shoe">👟 {a.shoe}</span>}
                    </span>
                    <span className="saved-sports">
                      {a.sports.map((s) => SPORT_EMOJI[s.sport] ?? '🏅').join(' ')}
                    </span>
                  </button>
                  <button
                    className="saved-delete"
                    title="削除"
                    onClick={() => removeSaved(a)}
                  >
                    ✕
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}

      {serverError && <p className="status">ℹ️ {serverError}</p>}
      {uploadNote && <p className="status">{uploadNote}</p>}

      {!parsed && !loading && (
        <div
          className={`dropzone ${dragOver ? 'drag-over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <p className="dropzone-main">ここに .fit / .zip ファイルをドラッグ&ドロップ</p>
          <p className="dropzone-sub">
            または右上のボタンから選択（解析後、サーバーに保存され傾向分析に反映されます）。
            .fitを1つ含むzip（Garmin Connectエクスポート等）は自動解凍し、アクティビティ日付をファイル名にして保存します
          </p>
        </div>
      )}

      {loading && <p className="status">⏳ 解析中…</p>}
      {error && <p className="status error">⚠️ {error}</p>}

      {parsed && !loading && (
        <>
          <h2 className="file-name">📄 {parsed.fileName}</h2>

          {currentActivityId && (
            <DiaryCard activityId={currentActivityId} onSaved={onNoteSaved} />
          )}

          {currentActivityId && parsed.segments.some((s) => s.sport === 'running') && (
            <ShoeTagCard
              activityId={currentActivityId}
              initialShoe={saved?.find((a) => a.id === currentActivityId)?.shoe ?? null}
              onSaved={onNoteSaved}
            />
          )}

          {(() => {
            const segs = parsed.segments;
            const hasSummary = segs.some((s) => (s.session.total_timer_time ?? 0) > 0);
            if (!hasSummary) return null;
            // Show only columns that at least one segment can fill.
            const cols = [
              {
                header: 'Distance',
                show: segs.some((s) => (s.session.total_distance ?? 0) > 0),
                cell: (s: (typeof segs)[number]) =>
                  `${((s.session.total_distance ?? 0) / 1000).toFixed(2)} km`,
              },
              {
                header: 'Avg HR',
                show: segs.some((s) => s.session.avg_heart_rate != null),
                cell: (s: (typeof segs)[number]) => s.session.avg_heart_rate ?? '-',
              },
              {
                header: 'Avg Power',
                show: segs.some((s) => s.session.avg_power != null),
                cell: (s: (typeof segs)[number]) => s.session.avg_power ?? '-',
              },
              {
                header: 'Avg Cadence',
                show: segs.some((s) => s.session.avg_cadence != null),
                cell: (s: (typeof segs)[number]) => s.session.avg_cadence ?? '-',
              },
            ].filter((c) => c.show);

            return (
              <div className="card">
                <table>
                  <thead>
                    <tr>
                      <th>Segment</th>
                      <th>Time</th>
                      {cols.map((c) => (
                        <th key={c.header}>{c.header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {segs.map((seg) => (
                      <tr key={seg.label}>
                        <td className="seg-label">{seg.label}</td>
                        <td>{fmtDuration(seg.session.total_timer_time)}</td>
                        {cols.map((c) => (
                          <td key={c.header}>{c.cell(seg)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}

          {mapFigure ? (
            <div className="card">
              <h3>🗺️ コース地図（GPSトラック）</h3>
              <Plot figure={mapFigure} />
            </div>
          ) : (
            <p className="status">GPSデータが見つからないため地図描画はスキップしました。</p>
          )}

          {parsed.segments.map((seg) => (
            <SegmentChart segment={seg} key={seg.label} />
          ))}

          {(() => {
            const swim = parsed.segments.find((s) => s.sport === 'swimming');
            const showSwim =
              swim && (parsed.lengths.length > 0 || swim.session.pool_length != null);
            return showSwim ? (
              <SwimDetails segment={swim} laps={parsed.laps} lengths={parsed.lengths} />
            ) : null;
          })()}

          {(() => {
            const bike = parsed.segments.find((s) => s.sport === 'cycling');
            return bike ? <BikeDetails segment={bike} laps={parsed.laps} /> : null;
          })()}
        </>
      )}
    </>
  );
}
