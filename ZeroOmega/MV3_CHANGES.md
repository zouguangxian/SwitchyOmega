# ZeroOmega Chrome Manifest V3 Migration Notes

_Comparison basis: `HEAD` (af79d9e2…) vs. legacy commit `489e54ff…` in the [ZeroOmega repository](https://github.com/zero-peak/ZeroOmega)._  

This document highlights the substantive changes ZeroOmega introduced to make the Chromium extension work under Chrome Manifest V3 (MV3). File paths are relative to the repository root.

## 1. Manifest & Packaging
- `omega-target-chromium-extension/overlay/manifest.json` now declares `manifest_version: 3`, replaces `browser_action` with `action`, and maps the `"_execute_browser_action"` command to `"_execute_action"`.
- Background execution is moved from `background.html` to an ES module service worker: `"service_worker": "x-background.js"` with `"type": "module"`.
- Host access is split between `"permissions"` and `"host_permissions"`, removing the MV2-only `"webRequestBlocking"` entitlement.
- The minimum supported Chrome version is raised (`"minimum_chrome_version": "88"`).
- Popup default switches from `popup/index.html` to the new iframe wrapper `popup-iframe.html` (with runtime fallbacks for Android browsers).

## 2. Background Runtime Architecture
- MV2 background page (`overlay/background.html`) is deleted. New module entrypoint `overlay/x-background.js` bootstraps the worker, imports dependencies, and keeps it alive via periodic `chrome.runtime.getPlatformInfo` calls.
- Polyfills introduced for DOM-dependent APIs that MV3 workers lack:
  - `overlay/localstorage-polyfill.js` wraps worker-scoped storage in an in-memory map.
  - `overlay/indexedDB.js` wires up `fake-indexeddb` so existing IndexedDB consumers continue to work.
- `src/coffee/background.coffee` is extensively refactored to run headless:
  - Replaces `<canvas>` drawing with `OffscreenCanvas` and `willReadFrequently` contexts.
  - Adds centralized context-menu handling (`chrome.contextMenus.onClicked`) because MV3 forbids inline handlers.
  - Implements upgrade and sync routines (`upgradeMigrateFn`, built-in gist sync watcher) within the worker lifecycle.
  - Adjusts logging to use the injected storage polyfill instead of `localStorage`.
  - Adds helpers such as `resetAllOptions`, startup detection, and message routing adaptations for async worker messaging.

## 3. Storage & Sync Adaptations
- `omega-target-chromium-extension/src/module/options.coffee` and related modules switch from direct `localStorage` access to the injected polyfill and add guards for pending tab URLs (a MV3/Chrome 96+ behaviour).
- Built-in sync handling now monitors a dedicated `zeroOmegaSync` key and coordinates with the new service worker message endpoints.
- `omega-target/src/options_sync.coffee` and associated core modules include minor updates to cooperate with the revised storage APIs (e.g., handling of promise-based storage calls).

## 4. Popup & UI Integration
- New MV3-friendly popup wrapper `overlay/popup-iframe.html` + `popup-iframe.js` embeds the legacy SPA inside an iframe, resizing it via `iframe-resizer` and loading shared assets with `$script`.
- Popup communication logic (`src/coffee/omega_target_web.coffee`) now resolves the active tab via query parameters or `tabs.query`, accounts for `pendingUrl`, and proxies state get/set through background messages (`getState` / `setState`) since direct storage access is no longer available in MV3.
- Additional network/temp-rules popups are reorganized under `omega-web/src/popup/*`, each loading through modular `loader.js` entry scripts compatible with MV3 packaging.

## 5. Auxiliary Library & Asset Updates
- The build includes `lib/script.js/script.min.js`, `iframeResizer`, `fake-indexeddb`, `compare-versions`, and other zero-dependency bundles required by the worker and popup.
- Icon assets are refreshed (SVG/PNG variants) to align with the new action icon pipeline.
- `omega-web` assets and build scripts are updated to package the new libraries and styles needed by the iframe popup and worker context.

## 6. Messaging & API Adjustments
- Background message handler now exposes additional actions (`resetAllOptions`, `setState`, `checkOptionsSyncChange`, etc.) and standardizes responses via `encodeError`.
- Context menu registration moves to startup logic in `x-background.js` with runtime gating for Android (Edge, Arc) quirks.
- Tab refresh & info routines consider `tabs.pendingUrl`, ensuring correct reload behaviour when MV3 service workers resume after suspension.

---

These changes collectively migrate the legacy MV2 architecture to MV3, replacing persistent background pages with a service worker, providing storage polyfills, and reworking UI and messaging pathways so the extension continues to function within Chrome’s MV3 constraints. For detailed diffs, examine the `git diff 489e54ff..HEAD` output within the project.

