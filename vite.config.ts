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
          if (!/[\/]src[\/]i18n[\/]en\.ts$/.test(importer.split('?')[0])) return null;
          const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
          return resolved ? `${resolved.id}?en-only` : null;
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
                test: /[\\/]node_modules[\\/]@firebase[\\/](app|util|component|logger|auth|installations)[\\/]/,
                priority: 50,
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
