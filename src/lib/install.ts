import { IN_FRAME } from './util';

/* Add to Home Screen. iOS tells a page whether it is running from the Home Screen, but not whether it has been added
   there, and has no install prompt a page can trigger, so the app explains the steps in Safari and remembers when
   you have chosen to carry on without installing. */
const DISMISS_KEY = 'dc.installDismissed';
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1);
const isStandalone = () => !!(navigator as { standalone?: boolean }).standalone || matchMedia('(display-mode: standalone)').matches;

/** True in iOS Safari (not the installed app, not embedded, not a computer) until the prompt is dismissed. */
export function shouldSuggestInstall() {
  if (IN_FRAME || !isIOS() || isStandalone()) return false;
  try {
    return localStorage.getItem(DISMISS_KEY) !== '1';
  } catch {
    return true;
  }
}
export function dismissInstall() {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    /* ignore */
  }
}
