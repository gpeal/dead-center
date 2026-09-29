import { Icon } from './Icon';

/**
 * Shown in iPhone Safari before the first round. Dead Center is played on a copy of the iPhone keyboard, which only
 * sits and feels like the real one when the app runs full screen from the Home Screen.
 */
export function InstallLanding({ onContinue, onBack }: { onContinue: () => void; onBack: () => void }) {
  return (
    <main className="landing">
      <button className="iconbtn back" aria-label="Back" onClick={onBack}><Icon name="close" /></button>
      <h1>Best from your Home&nbsp;Screen</h1>
      <p>Dead Center is a typing game played on a copy of the iPhone keyboard. From your Home Screen it runs full screen with no Safari bars, so the keyboard sits where the real one does and feels the same under your thumbs.</p>
      <ol className="install-steps">
        <li><span className="ic"><Icon name="share" /></span><span>Tap <b>Share</b> in Safari<small>On iOS 26 it is under •••</small></span></li>
        <li><span className="ic"><Icon name="addbox" /></span><span>Choose <b>Add to Home Screen</b></span></li>
        <li><span className="ic logo"><Icon name="logo" /></span><span>Open <b>Dead Center</b> from your Home Screen</span></li>
      </ol>
      <p className="small muted">Rounds typed in Safari stay in Safari.</p>
      <button className="btn ghost block" onClick={onContinue}>Continue in Safari</button>
    </main>
  );
}
