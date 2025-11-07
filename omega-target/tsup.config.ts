import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['index.ts'],
  format: ['cjs', 'esm', 'iife'],
  globalName: 'OmegaTarget',
  dts: true,
  sourcemap: true,
  clean: true,
  minify: false,
  splitting: false,
  external: ['bluebird', 'jsondiffpatch', 'omega-pac'],
  outDir: 'dist',
  // For browser compatibility
  platform: 'browser',
  target: 'es2019',
  // Generate standalone browser bundle
  outExtension({ format }) {
    if (format === 'iife') {
      return { js: '.browser.js' };
    }
    return { js: '.js' };
  },
});

