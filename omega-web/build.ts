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

const pacSource = 'node_modules/omega-pac/omega_pac.min.js';
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

async function copyPacBundle() {
  if (!(await pathExists(pacSource))) {
    console.warn(`⚠️ Skipped PAC bundle (missing ${pacSource})`);
    return;
  }

  await ensureDir(path.dirname(pacDest));
  await cp(pacSource, pacDest, { force: true });
  console.log(`📦 Copied ${pacSource} -> ${pacDest}`);
}

async function removePacBundle() {
  await rm(pacDest, { force: true });
  console.log(`🗑️ Removed ${pacDest}`);
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
  const pacQueue = createSerialExecutor('PAC copy');

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
    .watch(pacSource, { ignoreInitial: true })
    .on('add', () => pacQueue(() => copyPacBundle()))
    .on('change', () => pacQueue(() => copyPacBundle()))
    .on('unlink', () => pacQueue(() => removePacBundle()));
}

async function createEsbuildContexts() {
  const builds: Array<{ entryPoints: string | string[] | Record<string, string>; outfile?: string; outdir?: string }> = [
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

  await Promise.all([buildTemplates(), buildStyles(), copyStaticAssets(), copyPacBundle()]);

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

