import autoprefixer from 'autoprefixer';
import chokidar from 'chokidar';
import * as esbuild from 'esbuild';
import fg from 'fast-glob';
import { cp, mkdir, readFile, rm, stat, writeFile } from 'fs/promises';
import less from 'less';
import path from 'path';
import postcss from 'postcss';
import pug from 'pug';

const isWatch = process.argv.includes('--watch');
const isProd = process.env.NODE_ENV === 'production';

console.log(`Building omega-web (${isWatch ? 'watch' : isProd ? 'production' : 'development'} mode)...`);

const buildDir = 'build';
const jsDir = path.join(buildDir, 'js');
const cssDir = path.join(buildDir, 'css');

const styleEntries = [
  { src: 'src/less/options.less', dest: path.join(cssDir, 'options.css') },
  { src: 'src/less/popup.less', dest: path.join(cssDir, 'popup.css') },
];

const staticTargets = [
  { label: 'lib assets', src: 'lib', dest: path.join(buildDir, 'lib'), watch: 'lib/**/*' },
  { label: 'images', src: 'img', dest: path.join(buildDir, 'img'), watch: 'img/**/*' },
  { label: 'popup assets', src: 'src/popup', dest: path.join(buildDir, 'popup'), watch: 'src/popup/**/*' },
];

const vendorFiles = [
  {
    label: 'script.js',
    src: 'bower_components/script.js/dist/script.min.js',
    dest: path.join(buildDir, 'lib', 'script.js', 'script.min.js'),
  },
] as const;

const vendorAssets = [
  { label: 'angular-loader', src: 'bower_components/angular-loader/angular-loader.min.js', dest: path.join(buildDir, 'lib', 'angular-loader', 'angular-loader.min.js') },
  { label: 'angular', src: 'bower_components/angular/angular.min.js', dest: path.join(buildDir, 'lib', 'angular', 'angular.min.js') },
  { label: 'angular-animate', src: 'bower_components/angular-animate/angular-animate.min.js', dest: path.join(buildDir, 'lib', 'angular-animate', 'angular-animate.min.js') },
  { label: 'angular-sanitize', src: 'bower_components/angular-sanitize/angular-sanitize.min.js', dest: path.join(buildDir, 'lib', 'angular-sanitize', 'angular-sanitize.min.js') },
  { label: 'angular-bootstrap', src: 'bower_components/angular-bootstrap/ui-bootstrap-tpls.min.js', dest: path.join(buildDir, 'lib', 'angular-bootstrap', 'ui-bootstrap-tpls.min.js') },
  { label: 'angular-i18n en-us', src: 'bower_components/angular-i18n/angular-locale_en-us.js', dest: path.join(buildDir, 'lib', 'angular-i18n', 'angular-locale_en-us.js') },
  { label: 'angular-i18n zh-cn', src: 'bower_components/angular-i18n/angular-locale_zh-cn.js', dest: path.join(buildDir, 'lib', 'angular-i18n', 'angular-locale_zh-cn.js') },
  { label: 'angular-i18n zh-hk', src: 'bower_components/angular-i18n/angular-locale_zh-hk.js', dest: path.join(buildDir, 'lib', 'angular-i18n', 'angular-locale_zh-hk.js') },
  { label: 'angular-i18n zh-tw', src: 'bower_components/angular-i18n/angular-locale_zh-tw.js', dest: path.join(buildDir, 'lib', 'angular-i18n', 'angular-locale_zh-tw.js') },
  { label: 'angular-ladda', src: 'bower_components/angular-ladda/dist/angular-ladda.min.js', dest: path.join(buildDir, 'lib', 'angular-ladda', 'angular-ladda.min.js') },
  { label: 'angular-spectrum-colorpicker', src: 'bower_components/angular-spectrum-colorpicker/dist/angular-spectrum-colorpicker.min.js', dest: path.join(buildDir, 'lib', 'angular-spectrum-colorpicker', 'angular-spectrum-colorpicker.min.js') },
  { label: 'angular-ui-router', src: 'bower_components/angular-ui-router/release/angular-ui-router.min.js', dest: path.join(buildDir, 'lib', 'angular-ui-router', 'angular-ui-router.min.js') },
  { label: 'angular-ui-router stateEvents', src: 'bower_components/angular-ui-router/release/stateEvents.min.js', dest: path.join(buildDir, 'lib', 'angular-ui-router', 'stateEvents.min.js') },
  { label: 'angular-ui-sortable', src: 'bower_components/angular-ui-sortable/sortable.min.js', dest: path.join(buildDir, 'lib', 'angular-ui-sortable', 'sortable.min.js') },
  { label: 'FileSaver', src: 'bower_components/FileSaver/FileSaver.min.js', dest: path.join(buildDir, 'lib', 'FileSaver', 'FileSaver.min.js') },
  { label: 'blob', src: 'bower_components/blob/Blob.js', dest: path.join(buildDir, 'lib', 'blob', 'Blob.js') },
  { label: 'jquery', src: 'bower_components/jquery/dist/jquery.min.js', dest: path.join(buildDir, 'lib', 'jquery', 'jquery.min.js') },
  { label: 'jqueryui-touch-punch', src: 'bower_components/jqueryui-touch-punch/jquery.ui.touch-punch.min.js', dest: path.join(buildDir, 'lib', 'jqueryui-touch-punch', 'jquery.ui.touch-punch.min.js') },
  { label: 'ngprogress', src: 'bower_components/ngprogress/build/ngProgress.min.js', dest: path.join(buildDir, 'lib', 'ngprogress', 'ngProgress.min.js') },
  { label: 'spectrum js', src: 'bower_components/spectrum/spectrum.js', dest: path.join(buildDir, 'lib', 'spectrum', 'spectrum.js') },
  { label: 'spectrum css', src: 'bower_components/spectrum/spectrum.css', dest: path.join(buildDir, 'lib', 'spectrum', 'spectrum.css') },
  { label: 'shepherd.js', src: 'bower_components/shepherd.js/shepherd.min.js', dest: path.join(buildDir, 'lib', 'shepherd.js', 'shepherd.min.js') },
  { label: 'shepherd.css', src: 'bower_components/shepherd.js/css/shepherd-theme-arrows.css', dest: path.join(buildDir, 'lib', 'shepherd.js', 'shepherd-theme-arrows.css') },
  { label: 'tether', src: 'bower_components/tether/js/tether.js', dest: path.join(buildDir, 'lib', 'tether', 'tether.js') },
  { label: 'bootstrap css', src: 'bower_components/bootstrap/dist/css/bootstrap.min.css', dest: path.join(buildDir, 'lib', 'bootstrap', 'css', 'bootstrap.min.css') },
  { label: 'bootstrap font eot', src: 'bower_components/bootstrap/dist/fonts/glyphicons-halflings-regular.eot', dest: path.join(buildDir, 'lib', 'bootstrap', 'fonts', 'glyphicons-halflings-regular.eot') },
  { label: 'bootstrap font woff2', src: 'bower_components/bootstrap/dist/fonts/glyphicons-halflings-regular.woff2', dest: path.join(buildDir, 'lib', 'bootstrap', 'fonts', 'glyphicons-halflings-regular.woff2') },
  { label: 'bootstrap font woff', src: 'bower_components/bootstrap/dist/fonts/glyphicons-halflings-regular.woff', dest: path.join(buildDir, 'lib', 'bootstrap', 'fonts', 'glyphicons-halflings-regular.woff') },
  { label: 'bootstrap font ttf', src: 'bower_components/bootstrap/dist/fonts/glyphicons-halflings-regular.ttf', dest: path.join(buildDir, 'lib', 'bootstrap', 'fonts', 'glyphicons-halflings-regular.ttf') },
  { label: 'bootstrap font svg', src: 'bower_components/bootstrap/dist/fonts/glyphicons-halflings-regular.svg', dest: path.join(buildDir, 'lib', 'bootstrap', 'fonts', 'glyphicons-halflings-regular.svg') },
  { label: 'ladda css', src: 'node_modules/ladda/dist/ladda-themeless.min.css', dest: path.join(buildDir, 'lib', 'ladda', 'ladda-themeless.min.css') },
] as const;

const pacSource = path.join('..', 'omega-pac', 'index.ts');
const pacDest = path.join(jsDir, 'omega_pac.min.js');

const pugOptions = {
  basedir: path.resolve('src'),
  pretty: !isProd,
} satisfies pug.Options;

const commonOptions: esbuild.BuildOptions = {
  bundle: true,
  platform: 'browser',
  target: 'es2015',
  sourcemap: true,
  minify: false, // Angular 1.x doesn't minify well
  format: 'iife',
  external: ['chrome'],
  define: {
    'process.env.NODE_ENV': JSON.stringify(isProd ? 'production' : 'development'),
  },
};

async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

async function pathExists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function templateOutputPath(srcPath: string) {
  const relative = path.relative('src', srcPath);
  return path.join(buildDir, relative).replace(/\.jade$/, '.html');
}

async function compileTemplate(srcPath: string) {
  const html = pug.renderFile(srcPath, pugOptions);
  const dest = templateOutputPath(srcPath);
  await ensureDir(path.dirname(dest));
  await writeFile(dest, html);
  console.log(`📄 Rendered ${srcPath} -> ${dest}`);
}

async function removeTemplate(srcPath: string) {
  const dest = templateOutputPath(srcPath);
  await rm(dest, { force: true });
  console.log(`🗑️ Removed ${dest}`);
}

async function buildTemplates() {
  const files = await fg('src/**/*.jade');
  await Promise.all(files.map((file) => compileTemplate(file)));
  console.log('✅ Templates ready');
}

async function buildStyles() {
  await ensureDir(cssDir);

  for (const { src, dest } of styleEntries) {
    if (!(await pathExists(src))) {
      await rm(dest, { force: true });
      continue;
    }

    const source = await readFile(src, 'utf8');
    const rendered = await less.render(source, {
      filename: path.resolve(src),
      compress: isProd,
    });

    const result = await postcss([autoprefixer]).process(rendered.css, {
      from: src,
      to: dest,
      map: false,
    });

    await ensureDir(path.dirname(dest));
    await writeFile(dest, result.css);
    console.log(`🎨 Compiled ${src} -> ${dest}`);
  }

  console.log('✅ Styles ready');
}

type StaticTarget = (typeof staticTargets)[number];

async function copyStaticTarget(target: StaticTarget) {
  if (!(await pathExists(target.src))) {
    await rm(target.dest, { recursive: true, force: true });
    console.log(`⚠️ Skipped ${target.label} (source missing)`);
    return;
  }

  await ensureDir(path.dirname(target.dest));
  await rm(target.dest, { recursive: true, force: true });
  await cp(target.src, target.dest, { force: true, recursive: true });
  console.log(`📦 Copied ${target.label}`);
}

async function copyStaticAssets() {
  await Promise.all(staticTargets.map((target) => copyStaticTarget(target)));
  console.log('✅ Static assets ready');
}

async function copyVendorAsset(src: string, dest: string, label: string) {
  if (!(await pathExists(src))) {
    console.warn(`⚠️ Skipped ${label} (missing ${src})`);
    return;
  }
  await ensureDir(path.dirname(dest));
  await cp(src, dest, { force: true });
  console.log(`📦 Copied ${label}`);
}

async function copyVendorAssets() {
  await Promise.all([
    ...vendorFiles.map((file) => copyVendorAsset(file.src, file.dest, file.label)),
    ...vendorAssets.map((asset) => copyVendorAsset(asset.src, asset.dest, asset.label)),
  ]);
  await bundleSpin();
  await bundleLadda();
  await bundleJsonDiffPatch();
  console.log('✅ Vendor assets ready');
}

async function bundleJsonDiffPatch() {
  const entry = path.join('node_modules', 'jsondiffpatch', 'lib', 'index.js');
  if (!(await pathExists(entry))) {
    console.warn(`⚠️ Skipped jsondiffpatch bundle (missing ${entry})`);
    return;
  }

  const outfile = path.join(buildDir, 'lib', 'jsondiffpatch', 'jsondiffpatch.min.js');
  await ensureDir(path.dirname(outfile));
  try {
    await esbuild.build({
      entryPoints: [entry],
      outfile,
      bundle: true,
      minify: true,
      format: 'iife',
      platform: 'browser',
      target: 'es2015',
      globalName: 'jsondiffpatch',
      sourcemap: false,
      logLevel: 'silent',
    });
    console.log('📦 Bundled jsondiffpatch');
  } catch (err) {
    console.error('❌ Failed to bundle jsondiffpatch:', err);
  }
}

async function bundleSpin() {
  const outfile = path.join(buildDir, 'lib', 'spin.js', 'spin.js');
  const contents = `
    import { Spinner } from 'spin.js';
    if (typeof window !== 'undefined') {
      window.Spinner = Spinner;
    }
  `;
  await ensureDir(path.dirname(outfile));
  try {
    await esbuild.build({
      stdin: {
        contents,
        sourcefile: 'spin-wrapper.js',
        resolveDir: path.resolve('.'),
      },
      outfile,
      bundle: true,
      platform: 'browser',
      target: 'es2015',
      format: 'iife',
      minify: isProd,
      sourcemap: false,
      logLevel: 'silent',
    });
    console.log('📦 Bundled spin.js');
  } catch (err) {
    console.error('❌ Failed to bundle spin.js:', err);
  }
}

async function bundleLadda() {
  const outfile = path.join(buildDir, 'lib', 'ladda', 'ladda.min.js');
  const contents = `
    import * as LaddaModule from 'ladda';
    if (typeof window !== 'undefined') {
      window.Ladda = LaddaModule;
    }
  `;
  await ensureDir(path.dirname(outfile));
  try {
    await esbuild.build({
      stdin: {
        contents,
        sourcefile: 'ladda-wrapper.js',
        resolveDir: path.resolve('.'),
      },
      outfile,
      bundle: true,
      platform: 'browser',
      target: 'es2015',
      format: 'iife',
      minify: isProd,
      sourcemap: false,
      logLevel: 'silent',
    });
    console.log('📦 Bundled ladda');
  } catch (err) {
    console.error('❌ Failed to bundle ladda:', err);
  }
}

async function bundleOmegaPac() {
  if (!(await pathExists(pacSource))) {
    console.warn(`⚠️ Skipped omega-pac bundle (missing ${pacSource})`);
    return;
  }

  await ensureDir(path.dirname(pacDest));
  try {
    await esbuild.build({
      entryPoints: [pacSource],
      outfile: pacDest,
      bundle: true,
      platform: 'browser',
      target: 'es2015',
      format: 'iife',
      globalName: 'OmegaPac',
      minify: isProd,
      sourcemap: false,
      logLevel: 'silent',
      nodePaths: [path.resolve('node_modules')],
      inject: [path.join(__dirname, 'inject-buffer.js')],
      define: {
        ...commonOptions.define,
        'global.isBuffer': 'false',
      },
    });
    console.log('📦 Bundled omega-pac');
  } catch (err) {
    console.error('❌ Failed to bundle omega-pac:', err);
  }
}

function createSerialExecutor(label: string) {
  let current = Promise.resolve();
  return (task: () => Promise<void>) => {
    current = current
      .then(() => task())
      .catch((err) => {
        console.error(`❌ ${label} failed:`, err);
      });
    return current;
  };
}

function setupAssetWatchers() {
  const templateQueue = createSerialExecutor('Template build');
  const styleQueue = createSerialExecutor('Style build');
  const pacQueue = createSerialExecutor('PAC bundle');
  const vendorQueue = createSerialExecutor('Vendor asset copy');

  chokidar
    .watch('src/**/*.jade', { ignoreInitial: true })
    .on('add', (filePath) => templateQueue(() => compileTemplate(filePath)))
    .on('change', (filePath) => templateQueue(() => compileTemplate(filePath)))
    .on('unlink', (filePath) => templateQueue(() => removeTemplate(filePath)));

  chokidar
    .watch('src/less/**/*.less', { ignoreInitial: true })
    .on('all', (event, filePath) => {
      console.log(`🔁 Less change detected (${event}): ${filePath}`);
      return styleQueue(() => buildStyles());
    });

  for (const target of staticTargets) {
    const queue = createSerialExecutor(`${target.label} copy`);
    chokidar
      .watch(target.watch, { ignoreInitial: true })
      .on('all', (event, filePath) => {
        console.log(`🔁 ${target.label} change detected (${event}): ${filePath}`);
        return queue(() => copyStaticTarget(target));
      });
  }

  chokidar
    .watch(['../omega-pac/**/*.ts', '../omega-pac/**/*.js'], { ignoreInitial: true })
    .on('all', (event) => {
      console.log(`🔁 omega-pac change detected (${event})`);
      return pacQueue(() => bundleOmegaPac());
    });

  for (const vendor of [...vendorFiles, ...vendorAssets]) {
    chokidar
      .watch(vendor.src, { ignoreInitial: true })
      .on('all', (event) => {
        console.log(`🔁 ${vendor.label} change detected (${event})`);
        return vendorQueue(() => copyVendorAssets());
      });
  }
  chokidar
    .watch('node_modules/jsondiffpatch/**/*.js', { ignoreInitial: true })
    .on('all', (event) => {
      console.log(`🔁 jsondiffpatch change detected (${event})`);
      return vendorQueue(() => bundleJsonDiffPatch());
    });
  chokidar
    .watch('node_modules/spin.js/**/*.js', { ignoreInitial: true })
    .on('all', (event) => {
      console.log(`🔁 spin.js change detected (${event})`);
      return vendorQueue(() => bundleSpin());
    });
  chokidar
    .watch('node_modules/ladda/js/**/*.js', { ignoreInitial: true })
    .on('all', (event) => {
      console.log(`🔁 ladda change detected (${event})`);
      return vendorQueue(() => bundleLadda());
    });
}

async function createEsbuildContexts() {
  const builds: Array<{ entryPoints: string[]; outfile?: string; outdir?: string }> = [
    { entryPoints: ['src/coffee/options.ts'], outfile: path.join(jsDir, 'options.js') },
    { entryPoints: ['src/coffee/options_guide.ts'], outfile: path.join(jsDir, 'options_guide.js') },
    { entryPoints: ['src/coffee/switch_profile_guide.ts'], outfile: path.join(jsDir, 'switch_profile_guide.js') },
    { entryPoints: ['src/coffee/popup.ts'], outfile: path.join(jsDir, 'popup.js') },
    { entryPoints: ['src/coffee/log_error.ts'], outfile: path.join(jsDir, 'log_error.js') },
    { entryPoints: ['src/coffee/omega_decoration.ts'], outfile: path.join(jsDir, 'omega_decoration.js') },
    {
      entryPoints: ['src/omega/app.ts'],
      outfile: path.join(jsDir, 'omega.js'),
    },
  ];

  return Promise.all(
    builds.map((config) => esbuild.context({ ...commonOptions, ...config }))
  );
}

async function build() {
  await ensureDir(jsDir);
  await ensureDir(cssDir);

  const contexts = await createEsbuildContexts();

  await Promise.all([buildTemplates(), buildStyles()]);
  await copyStaticAssets();
  await copyVendorAssets();
  await bundleOmegaPac();

  if (isWatch) {
    setupAssetWatchers();
    console.log('👀 Watching for changes...');
    await Promise.all(contexts.map((ctx) => ctx.watch()));
  } else {
    await Promise.all(contexts.map((ctx) => ctx.rebuild()));
    await Promise.all(contexts.map((ctx) => ctx.dispose()));
    console.log('✅ Build complete!');
  }
}

build().catch((err) => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});

