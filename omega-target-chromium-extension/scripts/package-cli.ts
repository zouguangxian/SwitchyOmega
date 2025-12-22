#!/usr/bin/env tsx
import * as fs from 'fs';
import * as path from 'path';

import archiver from 'archiver';

async function zipDir(inputDir: string, outZip: string) {
  await fs.promises.mkdir(path.dirname(outZip), { recursive: true });

  const output = fs.createWriteStream(outZip);
  const archive = archiver('zip', { zlib: { level: 9 } });

  const done = new Promise<void>((resolve, reject) => {
    output.on('close', () => resolve());
    output.on('error', reject);
    archive.on('warning', (err) => {
      // warnings are non-fatal (e.g. stat failures)
      console.warn('⚠️ zip warning:', err);
    });
    archive.on('error', reject);
  });

  archive.pipe(output);
  archive.directory(inputDir, false);
  await archive.finalize();
  await done;
}

async function main() {
  const buildDir = path.resolve(__dirname, '..', 'build');
  const outZip = path.resolve(__dirname, '..', 'release.zip');

  if (!fs.existsSync(buildDir)) {
    throw new Error(`Missing build directory: ${buildDir}. Run yarn build first.`);
  }

  console.log(`📦 Packaging ${buildDir} -> ${outZip}`);
  await zipDir(buildDir, outZip);
  console.log('✅ release.zip ready');
}

main().catch((err) => {
  console.error('❌ Packaging failed:', err);
  process.exit(1);
});
