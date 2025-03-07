import zeroLocalStorage from "./localstorage-polyfill.js"
import ZeroLogFactory from './log.js'
import ZeroIndexedDBFactory from './indexedDB.js'

import "./lib/compare-versions.js"
import "./js/background_preload.js"
import "./lib/idb-keyval.js"
import "./lib/moment-with-locales.js"
import "./lib/csso.js"
import "./js/log_error.js"
import "./js/omega_debug.js"
import "./js/omega_pac.min.js"
import "./js/omega_target.min.js"
import "./js/omega_target_chromium_extension.min.js"
import "./img/icons/draw_omega.js"
import "./js/background.js"

const isFirefox = !!globalThis.localStorage
const zcb = globalThis.zeroDetectModeCB

globalThis.POPUPHTMLURL = './popup-iframe.html'
//if android, use default popup/index.html
if (globalThis.navigator && /Android/i.test(globalThis.navigator.userAgent)){
  globalThis.POPUPHTMLURL = './popup/index.html'
}

// keepAlive
setInterval(chrome.runtime.getPlatformInfo, 25 * 1000)

function detectPrivateMode(cb) {
  var db, tempMode, on, off;
  if (zcb) {
    on = zcb(cb, true);
    off = zcb(cb, false);
  } else {
    on = () => { setTimeout(cb.bind(null, true), 1) };
    off = () => { setTimeout(cb.bind(null, false), 1) };
  }
  if (isFirefox) {
    // in private mode, localStorage will be erased when browser restart
    tempMode = localStorage.getItem('zeroOmega.isPrivateMode')
    if (tempMode) {
      tempMode == 'true' ? on() : off()
    } else {
      db = indexedDB.open("zeroOmega-test"), db.onerror = on, db.onsuccess = off
    }
  } else {
    off()
  }
}

detectPrivateMode(function (isPrivateMode) {
  if (isFirefox) {
    localStorage.setItem('zeroOmega.isPrivateMode', isPrivateMode ? 'true' : 'false')
  }

  if (isPrivateMode && isFirefox) {
    // fake indexedDB
    ZeroIndexedDBFactory()
  }
  ZeroLogFactory()
  const zeroStorage = isFirefox ? localStorage : zeroLocalStorage
  globalThis.zeroBackground(zeroStorage)
  console.log('is private mode: ' + isPrivateMode)
}) 