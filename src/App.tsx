import { useCallback, useMemo, useState } from 'react';
import type { ParsedFit } from './fit';
import { fmtDuration, parseFitFile } from './fit';
import { buildMapFigure, buildSegmentFigure } from './charts';
import Plot from './Plot';
import BikeDetails from './BikeDetails';
import SwimDetails from './SwimDetails';
import './App.css';

export default function App() {
  const [parsed, setParsed] = useState<ParsedFit | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      setParsed(await parseFitFile(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setParsed(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const mapFigure = useMemo(() => (parsed ? buildMapFigure(parsed.segments) : null), [parsed]);
  const segmentFigures = useMemo(
    () =>
      parsed
        ? parsed.segments.map((seg) => ({ label: seg.label, figure: buildSegmentFigure(seg) }))
        : [],
    [parsed],
  );

  return (
    <div className="container">
      <header>
        <div>
          <h1>🏁 FIT File Viewer</h1>
          <p className="subtitle">.fit ファイルを選択すると解析してグラフと地図を表示します</p>
        </div>
        <label className="file-button">
          FITファイルを選択
          <input
            type="file"
            accept=".fit"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = '';
            }}
          />
        </label>
      </header>

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
          <p className="dropzone-main">ここに .fit ファイルをドラッグ&ドロップ</p>
          <p className="dropzone-sub">または右上のボタンから選択（解析はすべてブラウザ内で完結します）</p>
        </div>
      )}

      {loading && <p className="status">⏳ 解析中…</p>}
      {error && <p className="status error">⚠️ {error}</p>}

      {parsed && !loading && (
        <>
          <h2 className="file-name">📄 {parsed.fileName}</h2>

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

          {segmentFigures.map(
            ({ label, figure }) =>
              figure && (
                <div className="card" key={label}>
                  <h3>{label} セグメント</h3>
                  <Plot figure={figure} />
                </div>
              ),
          )}

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
    </div>
  );
}
