import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Emits sw.js with the list of built files to precache, and a cache name derived from them,
// so every deploy that changes the app installs a new service worker (which shows the update banner).
function serviceWorker(): Plugin {
  return {
    name: 'dead-center-sw',
    apply: 'build',
    generateBundle(_, bundle) {
      const icons = readdirSync('public/icons').map((f) => `./icons/${f}`);
      const files = ['./', './index.html', './manifest.webmanifest', ...icons, ...Object.keys(bundle).filter((f) => f !== 'index.html').map((f) => `./${f}`)];
      const version = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 10);
      const source = readFileSync('src/sw.js', 'utf8').replace('__PRECACHE__', JSON.stringify(files)).replace('__VERSION__', version);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), serviceWorker()],
});
