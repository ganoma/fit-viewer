import { useState } from 'react';
import { changePassword } from './api';

/** パスワード変更フォーム。ホーム画面の下部に置く。 */
export default function ChangePasswordCard() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    if (next !== confirm) {
      setStatus('⚠️ 新しいパスワードが一致しません');
      return;
    }
    setBusy(true);
    try {
      await changePassword(current, next);
      setStatus('✅ パスワードを変更しました（他の端末のログインは無効になります）');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setStatus(`⚠️ ${err instanceof Error ? err.message : err}`);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <p className="pw-toggle">
        <button className="pw-link" onClick={() => setOpen(true)}>
          🔑 パスワードを変更する
        </button>
      </p>
    );
  }

  return (
    <form className="card pw-card" onSubmit={submit}>
      <h3>🔑 パスワード変更</h3>
      <input
        className="login-input"
        type="password"
        autoComplete="current-password"
        placeholder="現在のパスワード"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
      />
      <input
        className="login-input"
        type="password"
        autoComplete="new-password"
        placeholder="新しいパスワード（8文字以上）"
        value={next}
        onChange={(e) => setNext(e.target.value)}
      />
      <input
        className="login-input"
        type="password"
        autoComplete="new-password"
        placeholder="新しいパスワード（確認）"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
      {status && <p className="pw-status">{status}</p>}
      <div className="pw-actions">
        <button className="login-button" type="submit" disabled={busy || !current || !next}>
          {busy ? '変更中…' : '変更する'}
        </button>
        <button type="button" className="pw-link" onClick={() => setOpen(false)}>
          閉じる
        </button>
      </div>
    </form>
  );
}
