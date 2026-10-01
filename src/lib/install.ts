import { IN_FRAME } from './util';

/* Dead Center only runs from the Home Screen on iPhone: in Safari the toolbar pushes the practice keyboard up and
   changes how it sits under your thumbs, so taps there wouldn't match real typing. iOS tells a page whether it is
   running from the Home Screen, but has no install prompt a page can trigger, so Safari gets instructions instead. */
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1);
const isStandalone = () => !!(navigator as { standalone?: boolean }).standalone || matchMedia('(display-mode: standalone)').matches;

/** True in iOS Safari: not the installed app, not embedded, not a computer. */
export const needsInstall = () => !IN_FRAME && isIOS() && !isStandalone();
