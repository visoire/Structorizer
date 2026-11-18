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
      js = js.replace(/<\/script/gi, '<\\/script');
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
    plugins: [react(), cspPlugin(), ...(single ? [singleFilePlugin()] : [])],
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
          modulePreload: false,
          rollupOptions: { input: 'index.html', output: { inlineDynamicImports: true } },
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
