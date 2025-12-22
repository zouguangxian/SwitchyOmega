import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import puppeteer from 'puppeteer-core';

function fail(message) {
  console.error(`❌ ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

function ok(message) {
  console.log(`✅ ${message}`);
}

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function findChromiumExecutable() {
  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (fromEnv && exists(fromEnv)) return fromEnv;

  const candidates = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];

  for (const c of candidates) {
    if (exists(c)) return c;
  }

  return null;
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function waitForExtensionId(browser, timeoutMs = 15_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const targets = browser.targets();
    for (const t of targets) {
      const url = t.url();
      if (url.startsWith('chrome-extension://')) {
        const m = url.match(/^chrome-extension:\/\/([a-p]{32})\//);
        if (m?.[1]) return m[1];
      }
    }
    await sleep(250);
  }
  return null;
}

async function run() {
  const repoRoot = process.cwd();
  const extensionPath = path.resolve(repoRoot, 'omega-target-chromium-extension', 'build');

  if (!exists(extensionPath)) {
    fail(`Missing build output at ${extensionPath}. Run: yarn build`);
  }

  const executablePath = findChromiumExecutable();
  if (!executablePath) {
    fail(
      `Could not find Chromium/Chrome. Set PUPPETEER_EXECUTABLE_PATH or install chromium.\n` +
        `CI hint: sudo apt-get install -y chromium xvfb`,
    );
  }

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'switchyomega-e2e-'));

  const needsXvfb = process.platform === 'linux' && !process.env.DISPLAY;
  if (needsXvfb) {
    console.warn(`⚠️ DISPLAY is not set. For Linux CI, run via xvfb-run (e.g., yarn test:e2e:ci).`);
  }

  const browser = await puppeteer.launch({
    executablePath,
    headless: false, // extensions are not reliable in headless mode
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });

  try {
    const extId = await waitForExtensionId(browser);
    if (!extId) {
      fail(`Failed to discover extension ID (service worker target not found).`);
    }
    ok(`Extension loaded with id: ${extId}`);

    const page = await browser.newPage();
    await page.goto(`chrome-extension://${extId}/options.html`, {
      waitUntil: 'domcontentloaded',
    });

    await page.waitForFunction(() => !!(globalThis.chrome && chrome.runtime && chrome.storage), {
      timeout: 15_000,
    });
    ok(`Opened options page`);

    // 1) Storage roundtrip (MV3-safe persistence)
    const storageRoundtrip = await page.evaluate(async () => {
      const key = `e2e.${Date.now()}.k`;
      const value = `v-${Math.random()}`;
      await new Promise((resolve, reject) => {
        chrome.storage.local.set({ [key]: value }, () => {
          const err = chrome.runtime.lastError;
          if (err) reject(new Error(err.message));
          else resolve();
        });
      });
      const got = await new Promise((resolve, reject) => {
        chrome.storage.local.get([key], (items) => {
          const err = chrome.runtime.lastError;
          if (err) reject(new Error(err.message));
          else resolve(items[key]);
        });
      });
      return { ok: got === value, got, value };
    });
    if (!storageRoundtrip.ok) {
      fail(
        `Storage roundtrip failed (got=${String(storageRoundtrip.got)} expected=${String(storageRoundtrip.value)})`,
      );
    }
    ok(`Storage roundtrip OK`);

    // Helper for talking to the MV3 service worker
    const swCall = async (method, args = []) => {
      const res = await page.evaluate(
        ({ method, args }) =>
          new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ method, args }, (response) => {
              const err = chrome.runtime.lastError;
              if (err) return reject(new Error(err.message));
              resolve(response);
            });
          }),
        { method, args },
      );
      if (res?.error) {
        throw new Error(`SW error (${method}): ${res.error?.message ?? JSON.stringify(res.error)}`);
      }
      return res?.result;
    };

    // 2) Proxy set/get (core functionality)
    const proxyResult = await swCall('e2eProxyDirect');
    if (proxyResult?.mode !== 'direct') {
      fail(`Proxy direct check failed: ${JSON.stringify(proxyResult)}`);
    }
    ok(`Proxy set/get OK (mode=direct)`);

    // 3) Offscreen drawIcon (MV3 DOM/canvas workaround)
    const draw = await swCall('e2eDrawIcon', ['#ff0000', '#00ff00', 19]);
    if (!draw?.ok) {
      fail(`Offscreen drawIcon failed: ${JSON.stringify(draw)}`);
    }
    ok(`Offscreen drawIcon OK (${draw.width}x${draw.height})`);
  } finally {
    await browser.close();
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

run().catch((e) => {
  if (!process.exitCode) process.exitCode = 1;
  console.error(`❌ E2E failed:`, e?.stack ?? e);
  process.exit(process.exitCode);
});
