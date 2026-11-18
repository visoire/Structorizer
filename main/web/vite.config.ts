/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json' with { type: 'json' };

/**
 * Content Security Policy for the production builds (GDPR, D-03): the app may not
 * contact any server. connect-src 'none' blocks fetch/XHR/WebSocket entirely.
 * Not applied in dev mode because Vite's HMR needs inline scripts and a websocket.
 */
const csp = (scriptSrc: string) => [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

function cspPlugin(): Plugin {
  return {
    name: 'structorizer-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp("'self'")}" />`);
    },
  };
}

/**
 * PWA precache service worker generator (P1-26): precaches the build assets and offline shell
 * without runtime caching of external origins.
 */
function pwaPlugin(): Plugin {
  return {
    name: 'structorizer-pwa',
    apply: 'build',
    enforce: 'post',
    generateBundle(_opts, bundle) {
      const assets = new Set<string>([
        './',
        './index.html',
        './manifest.webmanifest',
        './favicon.ico',
        './favicon-32.png',
        './apple-touch-icon.png',
        './icon-192.png',
        './icon-512.png',
        './icon-maskable-512.png',
        './docs/index.html',
      ]);
      for (const name of Object.keys(bundle)) {
        if (!name.endsWith('.map') && !name.endsWith('.pdf')) {
          assets.add('./' + name);
        }
      }
      const cacheName = `structorizer-web-${pkg.version}`;
      const swSource = `// SPDX-License-Identifier: GPL-3.0-or-later
const CACHE_NAME = ${JSON.stringify(cacheName)};
const PRECACHE = ${JSON.stringify([...assets], null, 2)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const url of PRECACHE) {
        try { await cache.add(url); } catch { /* ignore optional asset */ }
      }
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME && k.startsWith('structorizer-web-')).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => cached || fetch(req))
  );
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: swSource });
    },
  };
}

/**
 * Single-file build (like the GridCraft/WordCraft web packages, but one file): JavaScript,
 * CSS and the icon are inlined into index.html. The CSP allows exactly this one script by
 * its sha256 hash.
 */
function singleFilePlugin(): Plugin {
  return {
    name: 'structorizer-single-file',
    apply: 'build',
    enforce: 'post',
    generateBundle(_opts, bundle) {
      const html = Object.values(bundle).find((f) => f.fileName === 'index.html');
      if (!html || html.type !== 'asset') return;
      let page = String(html.source);
      let js = '';
      let css = '';
      for (const [name, f] of Object.entries(bundle)) {
        if (f.type === 'chunk' && name.endsWith('.js')) { js += f.code; delete bundle[name]; }
        else if (f.type === 'asset' && name.endsWith('.css')) { css += String(f.source); delete bundle[name]; }
      }
      // Vite leaves __VITE_PRELOAD__ unreplaced when codeSplitting: false inlines dynamic imports;
      // void 0 tells Vite's preload helper there are no external chunk URLs to preload.
      js = js.replace(/<\/script/gi, '<\\/script').replace(/\b__VITE_PRELOAD__\b/g, 'void 0');
      const hash = createHash('sha256').update(js).digest('base64');
      // function replacers: the inlined code contains `$&` and similar sequences that a
      // replacement string would expand
      const icon = `data:image/png;base64,${readFileSync('public/favicon-32.png').toString('base64')}`;
      page = page
        .replace(/<script type="module" crossorigin src="[^"]+"><\/script>/, () => '')
        .replace(/<link rel="stylesheet" crossorigin href="[^"]+">/, () => '')
        .replace(/<link rel="modulepreload"[^>]*>/g, () => '')
        .replace(/<link rel="icon"[^>]*>\s*/g, () => '')
        .replace(/<link rel="apple-touch-icon"[^>]*>\s*/g, () => '')
        .replace(/<link rel="manifest"[^>]*>\s*/g, () => '')
        .replace(/<meta http-equiv="Content-Security-Policy" content="[^"]*" \/>/, () => `<meta http-equiv="Content-Security-Policy" content="${csp(`'sha256-${hash}'`)}" />`)
        .replace('</head>', () => `    <link rel="icon" type="image/png" href="${icon}" />\n  <style>${css}</style>\n  </head>`)
        .replace('</body>', () => `  <script type="module">${js}</script>\n  </body>`);
      html.source = page;
    },
  };
}

export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    // base './' so the build works from any sub folder (XAMPP, GitHub Pages, USB stick).
    base: './',
    plugins: [react(), cspPlugin(), ...(single ? [singleFilePlugin()] : [pwaPlugin()])],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __SINGLE_FILE__: JSON.stringify(single),
      // the "single" mode is still a production build (React's production code)
      ...(single ? { 'process.env.NODE_ENV': JSON.stringify('production') } : {}),
    },
    publicDir: single ? false : 'public',
    build: single
      ? {
          outDir: 'dist-single',
          emptyOutDir: true,
          sourcemap: false,
          assetsInlineLimit: 100_000_000,
          cssCodeSplit: false,
          modulePreload: { polyfill: false },
          rollupOptions: { input: 'index.html', output: { codeSplitting: false } },
        }
      : {
          outDir: 'dist',
          sourcemap: false,
          rollupOptions: { input: { main: 'index.html', docs: 'docs/index.html' } },
        },
    test: {
      environment: 'node',
      include: ['tests/**/*.test.ts'],
    },
  };
});
