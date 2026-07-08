import { useMemo, useState } from 'react';
import type { Metric } from './charts';
import { buildOverlayFigure } from './charts';
import Plot from './Plot';

/** Card with metric checkboxes and a single overlay plot of the checked ones. */
export default function MetricToggleChart({
  title,
  x,
  metrics,
  defaultKeys,
  mode = 'lines',
}: {
  title: string;
  x: (Date | string)[];
  metrics: Metric[];
  defaultKeys?: string[];
  mode?: string;
}) {
  const [selected, setSelected] = useState<string[]>(
    () => defaultKeys ?? metrics.slice(0, 2).map((m) => m.key),
  );

  const chosen = useMemo(
    () => metrics.filter((m) => selected.includes(m.key)),
    [metrics, selected],
  );
  const figure = useMemo(() => buildOverlayFigure(x, chosen, mode), [x, chosen, mode]);

  if (metrics.length === 0) return null;

  const toggle = (key: string) => {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  return (
    <div className="card">
      <h3>{title}</h3>
      <div className="metric-toggles">
        {metrics.map((m) => {
          const checked = selected.includes(m.key);
          return (
            <label
              key={m.key}
              className={`metric-toggle ${checked ? 'checked' : ''}`}
              style={checked ? { borderColor: m.color, color: m.color } : undefined}
            >
              <input type="checkbox" checked={checked} onChange={() => toggle(m.key)} />
              {m.title}
              {m.unit ? ` (${m.unit})` : ''}
            </label>
          );
        })}
      </div>
      {figure ? (
        <Plot figure={figure} />
      ) : (
        <p className="status">表示する項目をチェックしてください。</p>
      )}
    </div>
  );
}
