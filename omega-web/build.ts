import * as esbuild from 'esbuild';
import * as fs from 'fs';

const isDev = process.argv.includes('--watch');
const isProd = process.env.NODE_ENV === 'production';

console.log(`Building omega-web (${isDev ? 'watch' : isProd ? 'production' : 'development'} mode)...`);

// Common options
const commonOptions: esbuild.BuildOptions = {
  bundle: true,
  platform: 'browser',
  target: 'es2015',
  sourcemap: true,
  minify: false, // Angular 1.x doesn't minify well
  format: 'iife',
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
    // Options page
    esbuild.context({
      ...commonOptions,
      entryPoints: ['src/coffee/options.ts'],
      outfile: 'build/js/options.js',
      external: ['chrome'],
    }),

    // Options guide
    esbuild.context({
      ...commonOptions,
      entryPoints: ['src/coffee/options_guide.ts'],
      outfile: 'build/js/options_guide.js',
      external: ['chrome'],
    }),

    // Switch profile guide
    esbuild.context({
      ...commonOptions,
      entryPoints: ['src/coffee/switch_profile_guide.ts'],
      outfile: 'build/js/switch_profile_guide.js',
      external: ['chrome'],
    }),

    // Popup
    esbuild.context({
      ...commonOptions,
      entryPoints: ['src/coffee/popup.ts'],
      outfile: 'build/js/popup.js',
      external: ['chrome'],
    }),

    // Log error
    esbuild.context({
      ...commonOptions,
      entryPoints: ['src/coffee/log_error.ts'],
      outfile: 'build/js/log_error.js',
      external: ['chrome'],
    }),

    // Omega decoration
    esbuild.context({
      ...commonOptions,
      entryPoints: ['src/coffee/omega_decoration.ts'],
      outfile: 'build/js/omega_decoration.js',
      external: ['chrome'],
    }),

    // Omega bundle (all Angular controllers, directives, filters, app)
    esbuild.context({
      ...commonOptions,
      entryPoints: [
        'src/omega/app.ts',
        'src/omega/directives.ts',
        'src/omega/filters.ts',
        'src/omega/controllers/about.ts',
        'src/omega/controllers/fixed_profile.ts',
        'src/omega/controllers/io.ts',
        'src/omega/controllers/master.ts',
        'src/omega/controllers/pac_profile.ts',
        'src/omega/controllers/profile.ts',
        'src/omega/controllers/quick_switch.ts',
        'src/omega/controllers/rule_list_profile.ts',
        'src/omega/controllers/switch_profile.ts',
      ],
      outfile: 'build/js/omega.js',
      external: ['chrome'],
    }),
  ]);

  if (isDev) {
    console.log('👀 Watching for TypeScript changes...');
    await Promise.all(contexts.map((ctx) => ctx.watch()));
    
    // Keep process alive
    await new Promise(() => {});
  } else {
    // Build once and dispose
    await Promise.all(contexts.map((ctx) => ctx.rebuild()));
    await Promise.all(contexts.map((ctx) => ctx.dispose()));
    console.log('✅ TypeScript build complete!');
  }
}

build().catch((err) => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});

