import { useEffect, useRef } from 'react';
// @ts-expect-error no type definitions shipped
import Plotly from 'plotly.js-dist-min';
import type { Figure } from './charts';

export default function Plot({ figure }: { figure: Figure }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    Plotly.react(el, figure.data, figure.layout, { responsive: true, displaylogo: false });
    return () => {
      Plotly.purge(el);
    };
  }, [figure]);

  return <div ref={ref} />;
}
