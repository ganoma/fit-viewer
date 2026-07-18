import { useEffect, useState } from 'react';
import { listShoes, saveShoe } from './api';

/** Shoe tag editor for run activities, with autocomplete of known shoes. */
export default function ShoeTagCard({
  activityId,
  initialShoe,
  onSaved,
}: {
  activityId: string;
  initialShoe: string | null;
  onSaved: () => void;
}) {
  const [shoe, setShoe] = useState(initialShoe ?? '');
  const [known, setKnown] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setShoe(initialShoe ?? '');
    setDirty(false);
    setStatus(null);
  }, [activityId, initialShoe]);

  useEffect(() => {
    listShoes()
      .then((list) => setKnown(list.map((s) => s.name)))
      .catch(() => {
        /* autocomplete is optional */
      });
  }, [activityId]);

  const save = async () => {
    try {
      await saveShoe(activityId, shoe.trim() || null);
      setStatus(shoe.trim() ? `✅ 「${shoe.trim()}」を設定しました` : '✅ タグを外しました');
      setDirty(false);
      onSaved();
    } catch (e) {
      setStatus(`⚠️ 保存に失敗しました: ${e instanceof Error ? e.message : e}`);
    }
  };

  return (
    <div className="card shoe-card">
      <div className="shoe-row">
        <h3>👟 使用シューズ</h3>
        <input
          className="shoe-input"
          list="known-shoes"
          placeholder="例: Nike Pegasus 41"
          value={shoe}
          onChange={(e) => {
            setShoe(e.target.value);
            setDirty(true);
          }}
        />
        <datalist id="known-shoes">
          {known.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <button className="diary-save" onClick={save} disabled={!dirty}>
          保存
        </button>
      </div>
      {status && <p className="shoe-status">{status}</p>}
    </div>
  );
}
