#!/usr/bin/env tsx
import * as fs from 'fs';
import { cp, mkdir, writeFile } from 'fs/promises';
import * as path from 'path';

import fg from 'fast-glob';

interface CopyConfig {
  src: string;
  dest: string;
  cwd?: string;
  expand?: boolean;
  ignore?: string[];
}

function firstExistingPath(...candidates: string[]): string {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    `None of the candidate paths exist:\n${candidates.map((c) => `- ${c}`).join('\n')}`,
  );
}

async function copyFiles(config: CopyConfig): Promise<void> {
  const { src, dest, cwd = '.', expand = false, ignore = [] } = config;

  if (expand) {
    const files = await fg(src, { cwd, onlyFiles: false, ignore });
    for (const file of files) {
      const srcPath = path.join(cwd, file);
      const destPath = path.join(dest, file);

      await mkdir(path.dirname(destPath), { recursive: true });

      if (fs.statSync(srcPath).isDirectory()) {
        await mkdir(destPath, { recursive: true });
      } else {
        await cp(srcPath, destPath);
      }
    }
    console.log(`📦 Copied ${files.length} files from ${cwd}/${src} to ${dest}`);
  } else {
    await mkdir(path.dirname(dest), { recursive: true });
    await cp(src, dest);
    console.log(`📦 Copied ${src} to ${dest}`);
  }
}

async function writeBuildManifest(repoRoot: string): Promise<void> {
  const manifestPath = path.join(
    repoRoot,
    'omega-target-chromium-extension',
    'overlay',
    'manifest.json',
  );
  const raw = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(raw) as { permissions?: unknown };

  // Match master behavior: strip "downloads" permission by default.
  // Set SWITCHYOMEGA_KEEP_DOWNLOADS_PERMISSION=1 to keep it.
  if (
    process.env.SWITCHYOMEGA_KEEP_DOWNLOADS_PERMISSION !== '1' &&
    Array.isArray(manifest.permissions)
  ) {
    manifest.permissions = manifest.permissions.filter((p) => p !== 'downloads');
  }

  const outPath = path.join(repoRoot, 'omega-target-chromium-extension', 'build', 'manifest.json');
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(manifest, null, 2));
}

async function copyAllFiles(): Promise<void> {
  console.log('📦 Copying files...');

  // Support both npm-style installs (node_modules in each package) and Yarn workspaces
  const repoRoot = path.resolve(__dirname, '..', '..');
  const omegaWebBuildDir = firstExistingPath(
    path.join(repoRoot, 'omega-web', 'build'),
    path.join('node_modules', 'omega-web', 'build'),
  );
  const omegaTargetMinJs = firstExistingPath(
    path.join(repoRoot, 'omega-target', 'omega_target.min.js'),
    path.join('node_modules', 'omega-target', 'omega_target.min.js'),
  );

  // Copy omega-web build
  await copyFiles({
    src: '**/*',
    dest: 'build/',
    cwd: omegaWebBuildDir,
    expand: true,
  });

  // Copy omega-target bundle
  await copyFiles({
    src: omegaTargetMinJs,
    dest: 'build/js/omega_target.min.js',
  });

  // Copy self bundle
  await copyFiles({
    src: 'omega_target_chromium_extension.min.js',
    dest: 'build/js/omega_target_chromium_extension.min.js',
  });

  // Copy popup script
  await copyFiles({
    src: 'src/js/omega_target_popup.js',
    dest: 'build/js/omega_target_popup.js',
  });

  // Copy overlay files (excluding manifest.json; we'll generate build/manifest.json)
  await copyFiles({
    src: '**/*',
    dest: 'build/',
    cwd: 'overlay',
    expand: true,
    ignore: ['manifest.json'],
  });

  await writeBuildManifest(repoRoot);

  // Explicitly copy offscreen.html to build root (if not already copied)
  try {
    await copyFiles({
      src: 'overlay/offscreen.html',
      dest: 'build/offscreen.html',
    });
  } catch {
    // Might already be copied, ignore error
  }

  // Copy docs
  await copyFiles({
    src: '../COPYING',
    dest: 'build/COPYING',
  });
  await copyFiles({
    src: '../AUTHORS',
    dest: 'build/AUTHORS',
  });

  console.log('✅ Files copied');
}

copyAllFiles().catch((err) => {
  console.error('❌ Copy failed:', err);
  process.exit(1);
});
