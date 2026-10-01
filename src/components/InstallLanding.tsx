import { Icon } from './Icon';
import { toast } from '../lib/feedback';
import { realSessions, store } from '../lib/store';

/**
 * The whole app in iPhone Safari. Dead Center measures taps on a copy of the iPhone keyboard, which only sits and
 * feels like the real one full screen from the Home Screen, so there is no way past this page in Safari. Anyone who
 * already typed rounds here can copy them out and restore them in the installed app (Progress > Settings > Restore).
 */
export function InstallLanding() {
  const rounds = realSessions().length;
  const copy = () => {
    const txt = JSON.stringify(store.S);
    navigator.clipboard.writeText(txt).then(
      () => toast('copy', 'Rounds copied', 'Paste into Restore in the installed app'),
      () => toast('close', 'Could not copy', 'Try again, or allow clipboard access'),
    );
  };
  return (
    <main className="landing">
      <div className="brand">
        <Icon name="logo" />
        <b>Dead Center</b>
      </div>
      <h1>Add it to your Home&nbsp;Screen to play</h1>
      <p>Dead Center measures exactly where your thumb lands on a copy of the iPhone keyboard. In Safari, the toolbar pushes that keyboard up and changes how it sits under your thumbs, so the results wouldn't match how you really type. From your Home Screen it runs full screen, with the keyboard right where the real one is.</p>
      <ol className="install-steps">
        <li><span className="ic"><Icon name="share" /></span><span>Tap <b>Share</b> in Safari<small>On iOS 26 it is under •••</small></span></li>
        <li><span className="ic"><Icon name="addbox" /></span><span>Choose <b>Add to Home Screen</b></span></li>
        <li><span className="ic logo"><Icon name="logo" /></span><span>Open <b>Dead Center</b> from your Home Screen</span></li>
      </ol>
      {rounds > 0 && (
        <div className="landing-move">
          <span>You have {rounds} round{rounds > 1 ? 's' : ''} saved in Safari. Copy them, then paste into Progress › Settings › Restore in the app.</span>
          <button className="btn ghost" onClick={copy}><Icon name="copy" />Copy my rounds</button>
        </div>
      )}
    </main>
  );
}
