import { useCallback, useRef, useState } from 'react';
import { useActions, useScheme } from './common';
import { KeyboardView } from './KeyboardView';
import { ALL, statsFor } from '../lib/analysis';
import { drawLoupes, drawMissKeys, placeLoupes, type Loupe } from '../lib/draw';
import { hitTest, KEY, lab, TRAINABLE } from '../lib/keys';
import type { Kb } from '../lib/keyboard';
import type { Tap } from '../lib/store';

/**
 * The round's most-missed keys in context: the full keyboard with those keys outlined and every tap on them,
 * plus a magnifier above each one. Tapping a magnifier opens that key's full history.
 */
export function MissMap({ keys, taps }: { keys: [string, Tap[]][]; taps: Tap[] }) {
  const { openKey } = useActions();
  const scheme = useScheme();
  const over = useRef<HTMLCanvasElement>(null);
  const [layout, setLayout] = useState<{ loupes: Loupe[]; D: number } | null>(null);
  const D = layout?.D ?? 104, stripH = D + 26;

  const paint = useCallback((kb: Kb) => {
    const ids = keys.map(([k]) => k);
    const cv = kb.el.parentElement?.querySelector<HTMLCanvasElement>('canvas.dots');
    if (cv) drawMissKeys(cv, kb, taps, ids);
    const W = kb.el.clientWidth, d = Math.min(112, Math.floor((W - 20) / 3)), strip = d + 26;
    const xs = placeLoupes(ids.map((k) => kb.toPx(KEY[k].cx, 0).x), d, W);
    const loupes = keys.map(([k, arr], i) => {
      const onto: Record<string, number> = {};
      arr.forEach((t) => (onto[t.h] = (onto[t.h] || 0) + 1));
      const top = Object.entries(onto).sort((a, b) => b[1] - a[1])[0];
      return { k, x: xs[i], label: `${lab(k)} ×${arr.length} → ${lab(top[0])}` };
    });
    setLayout({ loupes, D: d });
    if (over.current) drawLoupes(over.current, kb, loupes, (k) => statsFor(taps, k, ALL), d, strip);
  }, [keys, taps, scheme]);
  const onTap = useCallback((x: number, y: number) => {
    const k = hitTest(x, y);
    if (TRAINABLE.includes(k)) openKey(k);
  }, [openKey]);

  return (
    <div className="missmap" style={{ paddingTop: stripH }}>
      <KeyboardView className="mapwrap" paint={paint} onTap={onTap}><canvas className="dots" /></KeyboardView>
      <canvas ref={over} className="missmap-over" aria-hidden="true" />
      {layout?.loupes.map((l) => (
        <button key={l.k} className="missmap-loupe" style={{ left: l.x - D / 2, width: D, height: D }} aria-label={`${l.label.replace('→', 'onto')}. Open ${lab(l.k)} details`} onClick={() => openKey(l.k)} />
      ))}
    </div>
  );
}
