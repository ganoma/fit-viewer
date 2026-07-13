import { useEffect, useRef, useState } from 'react';
import { getNote, saveNote } from './api';

/** Free-form training diary attached to a stored activity. */
export default function DiaryCard({
  activityId,
  onSaved,
}: {
  activityId: string;
  onSaved: () => void;
}) {
  const [note, setNote] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const saving = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setStatus(null);
    setDirty(false);
    getNote(activityId)
      .then((n) => {
        if (!cancelled) {
          setNote(n);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setNote('');
          setLoaded(true);
          setStatus('サーバーから日記を取得できませんでした');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activityId]);

  const save = async () => {
    if (saving.current) return;
    saving.current = true;
    setStatus('保存中…');
    try {
      await saveNote(activityId, note);
      setStatus(`✅ 保存しました（${new Date().toLocaleTimeString('ja-JP')}）`);
      setDirty(false);
      onSaved();
    } catch (e) {
      setStatus(`⚠️ 保存に失敗しました: ${e instanceof Error ? e.message : e}`);
    } finally {
      saving.current = false;
    }
  };

  return (
    <div className="card">
      <div className="diary-header">
        <h3>📝 トレーニング日記</h3>
        <button className="diary-save" onClick={save} disabled={!loaded || !dirty}>
          保存
        </button>
      </div>
      <textarea
        className="diary-textarea"
        placeholder={
          loaded
            ? 'コンディション、補給、レース展開、反省点など自由に記録できます。ここに書いた内容は後からFITデータと合わせて分析に使えます。'
            : '読み込み中…'
        }
        value={note}
        disabled={!loaded}
        onChange={(e) => {
          setNote(e.target.value);
          setDirty(true);
        }}
      />
      <div className="diary-footer">
        <span className="diary-status">{status ?? (dirty ? '未保存の変更があります' : '')}</span>
        <span className="diary-count">{note.length} 文字</span>
      </div>
    </div>
  );
}
