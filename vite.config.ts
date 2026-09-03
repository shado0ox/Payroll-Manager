import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(({ command }) => {
  const buildId = command === 'build' ? String(process.env.APP_BUILD_ID || Date.now()) : 'development';
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'masar-build-metadata',
        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: 'build-meta.json',
            source: JSON.stringify({ buildId }),
          });
        },
      },
    ],
    define: {
      __MASAR_BUILD_ID__: JSON.stringify(buildId),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
