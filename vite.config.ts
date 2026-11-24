import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      // i18n dict files export both `vi` and `en`. Give the English registry (src/i18n/en.ts) its own module
      // instances of every dict (`?en` query) so the bundler can tree-shake `en` out of the eager Vietnamese
      // chunk (and `vi` out of the lazy English chunk). No changes needed in dict files or registries.
      {
        name: 'i18n-split-en-dicts',
        enforce: 'pre' as const,
        async resolveId(this: any, source: string, importer: string | undefined, options: any) {
          if (!importer || !/dict\//.test(source) || source.includes('?')) return null;
          if (!/[\\/]src[\\/]i18n[\\/]en\.ts$/.test(importer.split('?')[0])) return null;
          const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
          return resolved ? `${resolved.id}?en-only` : null;
        },
      },
      // Production only: do not let the entry bundle compete with (or block) the first paint. The built
      // <script type=module> + modulepreload tags are replaced by a tiny inline loader that injects them right after
      // the first frame (with a timer fallback for background tabs where rAF is paused). When the static shell is present the loader instead waits for the browser to report the shell's LCP candidate (a candidate whose element is removed before it is reported is dropped, which would make the later React render the LCP). The static first-run shell in
      // index.html and the render-blocking CSS therefore paint before any app JS is fetched/executed.
      {
        name: 'defer-entry-after-first-paint',
        apply: 'build' as const,
        transformIndexHtml: {
          order: 'post' as const,
          handler(html: string): string {
            const scriptRe = /<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>\s*/;
            const entry = html.match(scriptRe);
            if (!entry) return html;
            const preRe = /<link rel="modulepreload"[^>]*href="([^"]+)"[^>]*>\s*/g;
            const preloads = [...html.matchAll(preRe)].map((m) => m[1]);
            const stripped = html.replace(scriptRe, '').replace(preRe, '');
            const loader =
              '<script>(function(){var d=document,done=0,P=' +
              JSON.stringify(preloads) +
              ',E=' +
              JSON.stringify(entry[1]) +
              ';function go(){if(done)return;done=1;P.forEach(function(h){var l=d.createElement("link");l.rel="modulepreload";l.crossOrigin="";l.href=h;d.head.appendChild(l)});var s=d.createElement("script");s.type="module";s.crossOrigin="";s.src=E;d.head.appendChild(s)}' +
              'if(window.__ctapShell&&window.PerformanceObserver){try{new PerformanceObserver(function(l,o){if(l.getEntries().length){o.disconnect();setTimeout(go,0)}}).observe({type:"largest-contentful-paint",buffered:true})}catch(e){}setTimeout(go,1500)}else{requestAnimationFrame(function(){setTimeout(go,0)});setTimeout(go,600)}})();</script>';
            return stripped.replace('</body>', `    ${loader}
  </body>`);
          },
        },
      },
      react(),
      tailwindcss(),
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(import.meta.dirname, 'dist');
          const srcAssets = path.resolve(import.meta.dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    build: {
      rolldownOptions: {
        output: {
          // Split large vendor libraries into their own long-cacheable chunks.
          codeSplitting: {
            groups: [
              {
                // Core Firebase libs shared by auth and firestore: keep them out of the firestore chunk so
                // the (large) firestore chunk is a leaf that loads only on demand.
                name: 'vendor-firebase',
                test: /[\\/]node_modules[\\/]@firebase[\\/](app|util|component|logger|installations)[\\/]/,
                priority: 50,
              },
              {
                // Firebase Auth is loaded after first paint (see src/firebase.ts getAuthModules).
                name: 'vendor-auth',
                test: /[\\/]node_modules[\\/](@firebase[\\/]auth|firebase[\\/]auth)[\\/]/,
                priority: 48,
              },
              {
                name: 'vendor-firestore',
                test: /[\\/]node_modules[\\/](@firebase[\\/](firestore|webchannel-wrapper)|firebase[\\/]firestore)[\\/]/,
                priority: 40,
              },
              {
                name: 'vendor-firebase',
                test: /[\\/]node_modules[\\/](firebase|@firebase)[\\/]/,
                priority: 30,
              },
              {
                // Tiny vite dynamic-import helper: must not be co-located with heavy lazy-only libs.
                name: 'preload-helper',
                test: /preload-helper/,
                priority: 60,
              },
              {
                // Heavy libs that are only reached through dynamic import() (certificate PDF). Keeping them out of the
                // catch-all `vendor` chunk stops the entry from downloading ~1 MB it never executes.
                name: 'vendor-pdf',
                test: /[\\/]node_modules[\\/](jspdf|html2canvas|canvg|pako|fflate|dompurify|fast-png|stackblur-canvas|iobuffer|core-js|rgbcolor|svg-pathdata|raf|performance-now|@babel[\\/]runtime|text-segmentation|utrie|css-line-break)[\\/]/,
                priority: 45,
              },
              {
                name: 'vendor-charts',
                test: /[\\/]node_modules[\\/]lightweight-charts[\\/]/,
                priority: 44,
              },
              {
                name: 'vendor-react',
                test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
                priority: 20,
              },
              {
                name: 'vendor',
                test: /[\\/]node_modules[\\/]/,
                priority: 10,
              },
            ],
          },
        },
      },
    },
    optimizeDeps: {
      include: ['lightweight-charts', 'lucide-react', 'zod'],
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
