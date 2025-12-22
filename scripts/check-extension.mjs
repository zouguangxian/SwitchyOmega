import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function fail(message) {
  console.error(`❌ ${message}`);
  process.exitCode = 1;
}

function warn(message) {
  console.warn(`⚠️ ${message}`);
}

function ok(message) {
  console.log(`✅ ${message}`);
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    fail(`Failed to read JSON: ${p} (${e?.message ?? e})`);
    return null;
  }
}

function toArray(v) {
  return Array.isArray(v) ? v : [];
}

function checkManifest(buildDir) {
  const manifestPath = path.join(buildDir, 'manifest.json');
  if (!isFile(manifestPath)) {
    fail(`Missing built manifest: ${manifestPath}`);
    return null;
  }
  const manifest = readJson(manifestPath);
  if (!manifest) return null;

  if (manifest.manifest_version !== 3) {
    fail(`manifest_version must be 3 (got: ${manifest.manifest_version})`);
  }
  if (!manifest.background?.service_worker) {
    fail(`Missing background.service_worker (MV3 requires a service worker)`);
  }
  if (manifest.background?.page) {
    fail(`Found background.page (MV2-only). Use background.service_worker in MV3.`);
  }

  if (manifest.browser_action) {
    fail(`Found browser_action (MV2-only). Use action in MV3.`);
  }
  if (!manifest.action) {
    warn(`No action section found. If you expect toolbar behavior, add "action".`);
  }

  const permissions = new Set(toArray(manifest.permissions));
  const hostPermissions = toArray(manifest.host_permissions);

  if (permissions.has('<all_urls>')) {
    fail(`"<all_urls>" must be in host_permissions, not permissions (MV3).`);
  }
  if (hostPermissions.length === 0) {
    warn(`host_permissions is empty. If you need access to sites, add host_permissions.`);
  }
  if (permissions.has('webRequestBlocking')) {
    fail(`webRequestBlocking is not expected in MV3 builds for this project.`);
  }

  // Make sure we don't accidentally drop the permission your build logic expects.
  if (permissions.has('offscreen')) {
    ok(`manifest.json includes "offscreen" permission`);
  } else {
    warn(
      `manifest.json does not include "offscreen". Icon generation may fail if it relies on offscreen documents.`,
    );
  }

  return manifest;
}

function checkReferencedFiles(buildDir, manifest) {
  // Background SW
  const sw = manifest.background?.service_worker;
  if (sw) {
    const swPath = path.join(buildDir, sw);
    if (!isFile(swPath)) {
      fail(`Service worker file missing: ${swPath}`);
    } else {
      ok(`Service worker exists: ${sw}`);
      checkServiceWorkerFootguns(swPath);
    }
  }

  // Options
  const optionsCandidates = [manifest.options_page, manifest.options_ui?.page].filter(Boolean);
  for (const rel of optionsCandidates) {
    const p = path.join(buildDir, rel);
    if (!isFile(p)) fail(`Options page missing: ${rel}`);
  }

  // Popup
  const popup = manifest.action?.default_popup;
  if (popup) {
    const p = path.join(buildDir, popup);
    if (!isFile(p)) fail(`Popup missing: ${popup}`);
  }

  // Icons
  const icons = manifest.icons ?? {};
  for (const rel of Object.values(icons)) {
    const p = path.join(buildDir, rel);
    if (!isFile(p)) fail(`Icon missing: ${rel}`);
  }

  // Offscreen doc (only required if permission is present)
  if (toArray(manifest.permissions).includes('offscreen')) {
    const offscreen = path.join(buildDir, 'offscreen.html');
    if (!isFile(offscreen)) {
      fail(`offscreen.html missing in build output (required when using MV3 offscreen documents).`);
    } else {
      ok(`offscreen.html exists`);
      const html = fs.readFileSync(offscreen, 'utf8');
      const match = html.match(/<script\s+src="([^"]+)"/i);
      if (match?.[1]) {
        const scriptRel = match[1];
        const scriptAbs = path.join(buildDir, scriptRel);
        if (!isFile(scriptAbs)) fail(`Offscreen script missing: ${scriptRel}`);
      } else {
        warn(`Could not find a <script src="..."> tag in offscreen.html`);
      }
    }
  }
}

function checkServiceWorkerFootguns(swPath) {
  const code = fs.readFileSync(swPath, 'utf8');

  // These are common causes of MV3 runtime failures. We treat them as warnings
  // because the string may appear in bundled deps, comments, etc.
  const warnings = [
    {
      re: /\blocalStorage\b/,
      msg: `Service worker bundle contains "localStorage" (MV3 SW has no localStorage).`,
    },
    { re: /\bdocument\b/, msg: `Service worker bundle contains "document" (MV3 SW has no DOM).` },
    { re: /\bwindow\b/, msg: `Service worker bundle contains "window" (MV3 SW has no window).` },
    { re: /\beval\s*\(/, msg: `Service worker bundle contains "eval(" (MV3 CSP may block this).` },
    {
      re: /\bnew\s+Function\s*\(/,
      msg: `Service worker bundle contains "new Function(" (MV3 CSP will block this).`,
    },
  ];

  for (const w of warnings) {
    if (w.re.test(code)) warn(`${w.msg} (${path.basename(swPath)})`);
  }
}

function main() {
  const repoRoot = process.cwd();
  const buildDir = path.join(repoRoot, 'omega-target-chromium-extension', 'build');

  if (!isDir(buildDir)) {
    fail(`Build output directory does not exist: ${buildDir}\nRun: yarn build`);
    return;
  }

  ok(`Found build directory: ${buildDir}`);
  const manifest = checkManifest(buildDir);
  if (!manifest) return;
  checkReferencedFiles(buildDir, manifest);

  if (process.exitCode) {
    console.error(`\nFailed extension checks. Fix issues above before loading into Chrome.`);
    process.exit(process.exitCode);
  } else {
    console.log(
      `\n✅ Extension checks passed. Safe to load unpacked into Chrome for runtime testing.`,
    );
  }
}

main();
