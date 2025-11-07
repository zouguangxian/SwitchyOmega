import * as fs from 'fs';
import * as path from 'path';
import { cp, mkdir } from 'fs/promises';
import fg from 'fast-glob';

interface CopyConfig {
  src: string;
  dest: string;
  cwd?: string;
  expand?: boolean;
}

/**
 * Copy files from source to destination
 * Supports both single files and glob patterns
 */
export async function copyFiles(config: CopyConfig): Promise<void> {
  const { src, dest, cwd = '.', expand = false } = config;
  
  if (expand) {
    // Glob pattern - copy multiple files
    const files = await fg(src, { cwd, onlyFiles: false });
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
    // Single file
    await mkdir(path.dirname(dest), { recursive: true });
    await cp(src, dest);
    console.log(`📦 Copied ${src} to ${dest}`);
  }
}

/**
 * Copy all required files for the Chrome extension build
 */
export async function copyAllFiles(): Promise<void> {
  console.log('📦 Copying files...');
  
  // Copy omega-web build
  await copyFiles({
    src: '**/*',
    dest: 'build/',
    cwd: 'node_modules/omega-web/build',
    expand: true
  });
  
  // Copy omega-target bundle
  await copyFiles({
    src: 'node_modules/omega-target/omega_target.min.js',
    dest: 'build/js/omega_target.min.js'
  });
  
  // Copy self bundle
  await copyFiles({
    src: 'omega_target_chromium_extension.min.js',
    dest: 'build/js/omega_target_chromium_extension.min.js'
  });
  
  // Copy popup script
  await copyFiles({
    src: 'src/js/omega_target_popup.js',
    dest: 'build/js/omega_target_popup.js'
  });
  
  // Copy overlay files
  await copyFiles({
    src: '**/*',
    dest: 'build/',
    cwd: 'overlay',
    expand: true
  });
  
  // Copy docs
  await copyFiles({
    src: '../COPYING',
    dest: 'build/COPYING'
  });
  await copyFiles({
    src: '../AUTHORS',
    dest: 'build/AUTHORS'
  });
  
  console.log('✅ Files copied');
}

