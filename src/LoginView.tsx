import { useState } from 'react';
import { login, setupPassword } from './api';

/**
 * ログイン画面。パスワード未設定（初回起動）のときは設定画面になる。
 * 入力されたパスワードはここからサーバーに送るだけで、画面側には保存しない。
 */
export default function LoginView({
  configured,
  onAuthenticated,
}: {
  configured: boolean;
  onAuthenticated: () => void;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!configured && password !== confirm) {
      setError('確認用パスワードが一致しません');
      return;
    }
    setBusy(true);
    try {
      if (configured) {
        await login(password);
      } else {
        await setupPassword(password);
      }
      setPassword('');
      setConfirm('');
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1 className="login-title">🏁 FIT File Viewer</h1>
        <p className="login-sub">
          {configured
            ? 'パスワードを入力してください'
            : '初回セットアップ：アプリを保護するパスワードを設定してください'}
        </p>

        <input
          className="login-input"
          type="password"
          autoComplete={configured ? 'current-password' : 'new-password'}
          placeholder="パスワード"
          value={password}
          autoFocus
          onChange={(e) => setPassword(e.target.value)}
        />

        {!configured && (
          <input
            className="login-input"
            type="password"
            autoComplete="new-password"
            placeholder="パスワード（確認）"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        )}

        {!configured && (
          <p className="login-hint">8文字以上。設定後は変更画面から変えられます。</p>
        )}

        {error && <p className="login-error">⚠️ {error}</p>}

        <button className="login-button" type="submit" disabled={busy || password.length === 0}>
          {busy ? '処理中…' : configured ? 'ログイン' : 'パスワードを設定'}
        </button>
      </form>
    </div>
  );
}
