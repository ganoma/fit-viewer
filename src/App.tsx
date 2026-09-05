import { useCallback, useEffect, useState } from 'react';
import type { ParsedFit } from './fit';
import { parseFitFile } from './fit';
import { UNAUTHORIZED_EVENT, getAuthStatus, logout, uploadActivity } from './api';
import { dateBasedName, extractSingleFit, isZipFile } from './zip';
import ActivityView from './ActivityView';
import TrendsView from './TrendsView';
import HomeView from './HomeView';
import ThresholdsView from './ThresholdsView';
import LoginView from './LoginView';
import ChangePasswordCard from './ChangePasswordCard';
import './App.css';

export type Tab = 'home' | 'activity' | 'trends' | 'thresholds';

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
  if (segments[0] === 'thresholds') return { tab: 'thresholds', sport: null };
  if (segments[0] === 'trends') {
    const sport = TREND_SPORTS.includes(segments[1]) ? segments[1] : null;
    return { tab: 'trends', sport };
  }
  return { tab: 'home', sport: null };
}

function navigate(tab: Tab, sport: string | null = null) {
  window.location.hash =
    tab === 'home'
      ? '/'
      : tab === 'activity'
        ? '/activity'
        : tab === 'thresholds'
          ? '/thresholds'
          : sport
            ? `/trends/${sport}`
            : '/trends';
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseHash);
  const [parsed, setParsed] = useState<ParsedFit | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  // Server-side id of the activity currently displayed (enables the diary).
  const [currentActivityId, setCurrentActivityId] = useState<string | null>(null);
  // Bumped whenever the server-side activity list may have changed.
  const [savedVersion, setSavedVersion] = useState(0);
  // 認証状態。null は問い合わせ中（画面を出さずに待つ）。
  const [auth, setAuth] = useState<{ configured: boolean; authenticated: boolean } | null>(null);

  const refreshAuth = useCallback(() => {
    getAuthStatus()
      .then(setAuth)
      // サーバーに繋がらない場合は認証なしで見られる状態にしておく（開発時など）。
      .catch(() => setAuth({ configured: false, authenticated: true }));
  }, []);

  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  // セッション切れ（他APIが401を返した）ときはログイン画面に戻す。
  useEffect(() => {
    const onUnauthorized = () => setAuth({ configured: true, authenticated: false });
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

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
      // Garmin Connect exports arrive as a zip holding one .fit — unzip it
      // and name the file after the activity date (JST).
      let workFile = file;
      let fromZip = false;
      if (isZipFile(file)) {
        const { bytes, entryName } = await extractSingleFit(file);
        workFile = new File([bytes as BlobPart], entryName);
        fromZip = true;
      }
      let result = await parseFitFile(workFile);
      if (fromZip) {
        const start =
          result.segments[0]?.session.start_time ?? result.allRecords[0]?.timestamp;
        const name = dateBasedName(start ? new Date(start) : undefined, workFile.name);
        workFile = new File([await workFile.arrayBuffer()], name);
        result = { ...result, fileName: name };
      }
      setParsed(result);
      try {
        const summary = await uploadActivity(workFile);
        setUploadNote(`💾 保存しました（${summary.fileName}）`);
        setCurrentActivityId(summary.id);
        setSavedVersion((v) => v + 1);
      } catch (e) {
        setCurrentActivityId(null);
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

  if (auth == null) {
    return <div className="container" />;
  }
  if (!auth.authenticated) {
    return (
      <LoginView
        configured={auth.configured}
        onAuthenticated={() => setAuth({ configured: true, authenticated: true })}
      />
    );
  }

  return (
    <div className="container">
      <header>
        <div>
          <h1>🏁 FIT File Viewer</h1>
          <p className="subtitle">.fit ファイルの解析・保存・傾向分析</p>
        </div>
        <div className="header-actions">
          {tab === 'activity' && (
            <label className="file-button">
              FITファイルを選択
              <input
                type="file"
                accept=".fit,.zip"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                  e.target.value = '';
                }}
              />
            </label>
          )}
          <button
            className="logout-button"
            onClick={async () => {
              await logout().catch(() => {});
              setAuth({ configured: true, authenticated: false });
            }}
          >
            ログアウト
          </button>
        </div>
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
        <button
          className={`tab ${tab === 'thresholds' ? 'active' : ''}`}
          onClick={() => navigate('thresholds')}
        >
          ⚡ 閾値
        </button>
      </nav>

      {tab === 'home' && (
        <>
          <HomeView
            onNavigate={(t) => navigate(t)}
            onOpenSportTrends={(s) => navigate('trends', s)}
          />
          <ChangePasswordCard />
        </>
      )}
      {tab === 'activity' && (
        <ActivityView
          parsed={parsed}
          currentActivityId={currentActivityId}
          loading={loading}
          error={error}
          uploadNote={uploadNote}
          savedVersion={savedVersion}
          onFile={handleFile}
          onSavedDeleted={() => setSavedVersion((v) => v + 1)}
          onNoteSaved={() => setSavedVersion((v) => v + 1)}
        />
      )}
      {tab === 'thresholds' && <ThresholdsView savedVersion={savedVersion} />}
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
