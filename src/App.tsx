import { useCallback, useEffect, useState } from 'react';
import type { ParsedFit } from './fit';
import { parseFitFile } from './fit';
import { uploadActivity } from './api';
import ActivityView from './ActivityView';
import TrendsView from './TrendsView';
import HomeView from './HomeView';
import './App.css';

export type Tab = 'home' | 'activity' | 'trends';

interface Route {
  tab: Tab;
  sport: string | null;
}

const TREND_SPORTS = ['running', 'cycling', 'swimming'];

// The URL hash is the source of truth for navigation, so the browser's
// back/forward buttons walk through tab and sport-filter changes.
//   #/          -> home
//   #/activity  -> activity viewer
//   #/trends    -> trends (all sports)
//   #/trends/<sport> -> trends filtered to one sport
function parseHash(): Route {
  const segments = window.location.hash.replace(/^#\/?/, '').split('/');
  if (segments[0] === 'activity') return { tab: 'activity', sport: null };
  if (segments[0] === 'trends') {
    const sport = TREND_SPORTS.includes(segments[1]) ? segments[1] : null;
    return { tab: 'trends', sport };
  }
  return { tab: 'home', sport: null };
}

function navigate(tab: Tab, sport: string | null = null) {
  window.location.hash =
    tab === 'home' ? '/' : tab === 'activity' ? '/activity' : sport ? `/trends/${sport}` : '/trends';
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseHash);
  const [parsed, setParsed] = useState<ParsedFit | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  // Bumped whenever the server-side activity list may have changed.
  const [savedVersion, setSavedVersion] = useState(0);

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const { tab, sport } = route;

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
          onClick={() => navigate('home')}
        >
          🏠 ホーム
        </button>
        <button
          className={`tab ${tab === 'activity' ? 'active' : ''}`}
          onClick={() => navigate('activity')}
        >
          📊 アクティビティ
        </button>
        <button
          className={`tab ${tab === 'trends' ? 'active' : ''}`}
          onClick={() => navigate('trends')}
        >
          📈 傾向分析
        </button>
      </nav>

      {tab === 'home' && (
        <HomeView
          onNavigate={(t) => navigate(t)}
          onOpenSportTrends={(s) => navigate('trends', s)}
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
          sport={sport}
          onSportChange={(s) => navigate('trends', s)}
        />
      )}
    </div>
  );
}
