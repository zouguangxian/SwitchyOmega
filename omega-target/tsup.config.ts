import { defineConfig } from 'tsup';

export default defineConfig([
  // Main builds (CJS, ESM, with type definitions)
  {
    entry: ['index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    minify: false,
    splitting: false,
    external: ['jsondiffpatch', 'omega-pac'],
    outDir: 'dist',
    platform: 'browser',
    target: 'es2019',
  },
  // Browser IIFE bundle (minified, for extension)
  {
    entry: { omega_target: 'index.ts' },
    format: ['iife'],
    globalName: 'OmegaTarget',
    sourcemap: true,
    minify: true,
    splitting: false,
    external: ['jsondiffpatch', 'omega-pac'],
    outDir: '.',
    platform: 'browser',
    target: 'es2019',
    esbuildOptions(options) {
      options.alias = {
        'url': 'url',
        'buffer': 'buffer',
      };
    },
    outExtension() {
      return { js: '.min.js' };
    },
  },
]);

