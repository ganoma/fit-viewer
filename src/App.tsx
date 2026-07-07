import { useCallback, useState } from 'react';
import type { ParsedFit } from './fit';
import { parseFitFile } from './fit';
import { uploadActivity } from './api';
import ActivityView from './ActivityView';
import TrendsView from './TrendsView';
import HomeView from './HomeView';
import './App.css';

export type Tab = 'home' | 'activity' | 'trends';

export default function App() {
  const [tab, setTab] = useState<Tab>('home');
  // Sport filter for the trends tab (null = all sports).
  const [trendsSport, setTrendsSport] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedFit | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  // Bumped whenever the server-side activity list may have changed.
  const [savedVersion, setSavedVersion] = useState(0);

  const handleFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    setUploadNote(null);
    try {
      setParsed(await parseFitFile(file));
      try {
        const summary = await uploadActivity(file);
        setUploadNote(`💾 保存しました（${summary.fileName}）`);
        setSavedVersion((v) => v + 1);
      } catch (e) {
        setUploadNote(
          `ℹ️ サーバー保存はスキップされました: ${e instanceof Error ? e.message : e}`,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setParsed(null);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="container">
      <header>
        <div>
          <h1>🏁 FIT File Viewer</h1>
          <p className="subtitle">.fit ファイルの解析・保存・傾向分析</p>
        </div>
        {tab === 'activity' && (
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
        )}
      </header>

      <nav className="tabs">
        <button
          className={`tab ${tab === 'home' ? 'active' : ''}`}
          onClick={() => setTab('home')}
        >
          🏠 ホーム
        </button>
        <button
          className={`tab ${tab === 'activity' ? 'active' : ''}`}
          onClick={() => setTab('activity')}
        >
          📊 アクティビティ
        </button>
        <button
          className={`tab ${tab === 'trends' ? 'active' : ''}`}
          onClick={() => setTab('trends')}
        >
          📈 傾向分析
        </button>
      </nav>

      {tab === 'home' && (
        <HomeView
          onNavigate={(t) => {
            if (t === 'trends') setTrendsSport(null);
            setTab(t);
          }}
          onOpenSportTrends={(sport) => {
            setTrendsSport(sport);
            setTab('trends');
          }}
        />
      )}
      {tab === 'activity' && (
        <ActivityView
          parsed={parsed}
          loading={loading}
          error={error}
          uploadNote={uploadNote}
          savedVersion={savedVersion}
          onFile={handleFile}
          onSavedDeleted={() => setSavedVersion((v) => v + 1)}
        />
      )}
      {tab === 'trends' && (
        <TrendsView
          savedVersion={savedVersion}
          sport={trendsSport}
          onSportChange={setTrendsSport}
        />
      )}
    </div>
  );
}
