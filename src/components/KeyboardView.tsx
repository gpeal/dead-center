import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createKeyboard, attachInput, type Kb, type Point } from '../lib/keyboard';

/** Mounts the imperative keyboard. `paint` runs after layout and on every resize; `onKey` makes it live (typing). */
export function KeyboardView({ live = false, className, paint, onKey, onTap, children }: {
  live?: boolean; className?: string; paint?: (kb: Kb) => void; onKey?: (key: string, down: Point) => void;
  onTap?: (x: number, y: number) => void; children?: ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const kbRef = useRef<Kb | null>(null);
  const paintRef = useRef(paint), keyRef = useRef(onKey), tapRef = useRef(onTap);
  paintRef.current = paint;
  keyRef.current = onKey;
  tapRef.current = onTap;

  useLayoutEffect(() => {
    const el = host.current!;
    const kb = createKeyboard(el, { live });
    el.insertBefore(kb.el, el.firstChild);
    kbRef.current = kb;
    if (live) attachInput(kb, (k, d) => keyRef.current?.(k, d));
    else
      kb.el.addEventListener('click', (e) => {
        const p = kb.toKb(e.clientX, e.clientY);
        tapRef.current?.(p.x, p.y);
      });
    if (!live) kb.el.style.width = '100%';
    kb.layout();
    paintRef.current?.(kb);
    let t = 0;
    const ro = new ResizeObserver(() => {
      clearTimeout(t);
      t = window.setTimeout(() => {
        kb.layout();
        paintRef.current?.(kb);
      }, 60);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      clearTimeout(t);
      kb.el.remove();
      kbRef.current = null;
    };
  }, [live]);

  // repaint when the caller's paint function changes (new data or mode)
  useEffect(() => {
    if (kbRef.current) paint?.(kbRef.current);
  }, [paint]);

  return (
    <div ref={host} className={className}>
      {children}
    </div>
  );
}
