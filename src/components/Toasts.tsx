import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { dismissToast, useToasts } from '../lib/feedback';
import { useUpdateReady } from '../lib/updates';

/** Shows queued toasts one at a time. */
export function Toasts() {
  const q = useToasts(), t = q[0];
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (!t) return;
    setLeaving(false);
    const a = setTimeout(() => setLeaving(true), 2600), b = setTimeout(() => dismissToast(t.id), 2900);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [t]);
  if (!t) return null;
  return (
    <div key={t.id} className="toast" role="status" style={leaving ? { transition: 'opacity .3s,transform .3s', opacity: 0, transform: 'translate(-50%,-10px)' } : undefined}>
      <div className="ic"><Icon name={t.icon} /></div>
      <div>{t.title}{t.sub && <span>{t.sub}</span>}</div>
    </div>
  );
}

export function UpdateBanner() {
  if (!useUpdateReady()) return null;
  return (
    <div className="updbar" role="status">
      <span>New version ready</span>
      <button className="btn primary" onClick={() => location.reload()}>Reload</button>
    </div>
  );
}
