import { useEffect, useRef } from 'react';
// @ts-expect-error 型定義が同梱されていない
import Plotly from 'plotly.js-dist-min';
import type { Figure } from './charts';

export default function Plot({ figure }: { figure: Figure }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Plotly.react は差分更新なので、描画済みの図でも高さを保ったまま更新される。
    Plotly.react(el, figure.data, figure.layout, { responsive: true, displaylogo: false });
  }, [figure]);

  // 破棄はアンマウント時だけ。figureが変わるたびに purge すると一瞬グラフの高さが
  // 0になり、ページ全体が縮んでスクロール位置が上（地図の方）へ飛んでしまう。
  useEffect(() => {
    const el = ref.current;
    return () => {
      if (el) Plotly.purge(el);
    };
  }, []);

  // 描画前・再描画中も場所を確保しておく（同じくスクロール位置のずれ防止）。
  const height = typeof figure.layout?.height === 'number' ? figure.layout.height : undefined;
  return <div ref={ref} style={height ? { minHeight: height } : undefined} />;
}
