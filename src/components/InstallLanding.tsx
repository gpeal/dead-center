import { Icon } from './Icon';

/** The first thing a new visitor sees in iPhone Safari: how to put Dead Center on the Home Screen, before the baseline. */
export function InstallLanding({ onContinue }: { onContinue: () => void }) {
  return (
    <main className="landing">
      <div className="brand">
        <Icon name="logo" />
        <b>Dead Center</b>
      </div>
      <h1>Put it on your Home&nbsp;Screen</h1>
      <p>It opens full screen like an app, works offline, and keeps all your rounds in one place.</p>
      <ol className="install-steps">
        <li><span className="ic"><Icon name="share" /></span><span>Tap <b>Share</b> in Safari<small>On iOS 26 it is under •••</small></span></li>
        <li><span className="ic"><Icon name="addbox" /></span><span>Choose <b>Add to Home Screen</b></span></li>
        <li><span className="ic logo"><Icon name="logo" /></span><span>Open <b>Dead Center</b> from your Home Screen</span></li>
      </ol>
      <p className="small muted">Rounds typed in Safari stay in Safari, so it is best to install before your first one.</p>
      <button className="btn ghost block" onClick={onContinue}>Continue in Safari</button>
    </main>
  );
}
