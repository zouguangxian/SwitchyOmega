import * as esbuild from 'esbuild';
import * as fs from 'fs';

const isDev = process.argv.includes('--watch');
const isProd = process.env.NODE_ENV === 'production';

console.log(`Building omega-target-chromium-extension (${isDev ? 'watch' : isProd ? 'production' : 'development'} mode)...`);

// Common options
const commonOptions: esbuild.BuildOptions = {
  bundle: true,
  platform: 'browser',
  target: 'es2015',
  sourcemap: true,
  minify: isProd,
  define: {
    'process.env.NODE_ENV': JSON.stringify(isProd ? 'production' : 'development'),
  },
};

async function build() {
  // Ensure build directory exists
  if (!fs.existsSync('build/js')) {
    fs.mkdirSync('build/js', { recursive: true });
  }

  const contexts = await Promise.all([
    // Main module (entry point)
    esbuild.context({
      ...commonOptions,
      entryPoints: ['index.ts'],
      outfile: 'build/omega_target_chromium_extension.js',
      format: 'iife',
      globalName: 'OmegaTargetChromium',
      external: ['bluebird', 'omega-pac', 'omega-target'],
    }),

    // Background script
    esbuild.context({
      ...commonOptions,
      entryPoints: ['src/coffee/background.ts'],
      outfile: 'build/js/background.js',
      external: ['omega-pac'],
    }),

    // Background preload
    esbuild.context({
      ...commonOptions,
      entryPoints: ['src/coffee/background_preload.ts'],
      outfile: 'build/js/background_preload.js',
      external: ['omega-pac', 'omega-target'],
    }),

    // Omega debug
    esbuild.context({
      ...commonOptions,
      entryPoints: ['src/coffee/omega_debug.ts'],
      outfile: 'build/js/omega_debug.js',
    }),

    // Omega target web
    esbuild.context({
      ...commonOptions,
      entryPoints: ['src/coffee/omega_target_web.ts'],
      outfile: 'build/js/omega_target_web.js',
      external: ['omega-target'],
    }),

    // Omega webext proxy script
    esbuild.context({
      ...commonOptions,
      entryPoints: ['src/js/omega_webext_proxy_script.js'],
      outfile: 'build/js/omega_webext_proxy_script.min.js',
      external: ['omega-pac'],
    }),
  ]);

  if (isDev) {
    console.log('👀 Watching for changes...');
    await Promise.all(contexts.map((ctx) => ctx.watch()));
    
    // Keep process alive
    await new Promise(() => {});
  } else {
    // Build once and dispose
    await Promise.all(contexts.map((ctx) => ctx.rebuild()));
    await Promise.all(contexts.map((ctx) => ctx.dispose()));
    console.log('✅ Build complete!');
  }
}

build().catch((err) => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});

