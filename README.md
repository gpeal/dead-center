# Dead Center

Train your iPhone typing accuracy, one key at a time. Dead Center records where every tap lands on a true-size iPhone keyboard, finds the keys you miss and why, and builds drills to fix them.

Live at https://gpeal.github.io/dead-center/

## Install on iPhone

1. Open the link in Safari.
2. Tap Share, then Add to Home Screen.

It launches full screen, works offline after the first visit, and keeps your progress in the browser's local storage on that device. Use Progress > Backup to move your data between browsers. When a new version is deployed, the app shows a "New version ready" banner.

## Development

```sh
npm install
npm run dev      # local dev server
npm run build    # type-check and build to dist/
```

Built with React 19 and TypeScript on Vite. The three tabs are kept mounted with `<Activity>`, so each keeps its state and scroll position while hidden. Pushing to `main` builds and deploys to GitHub Pages through `.github/workflows/deploy.yml`.

- `src/lib/`: keyboard geometry, tap analysis, the practice engine (`round.ts`), storage and sync, canvas drawing
- `src/screens/`, `src/components/`: the React UI
- `src/sw.js`: service worker template; the build fills in the precache list (see `vite.config.ts`)
