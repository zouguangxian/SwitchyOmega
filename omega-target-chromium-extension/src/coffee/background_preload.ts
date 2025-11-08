/** @module omega-target-chromium-extension/background_preload */

import { storageWrapper } from '../module/storage_wrapper';

// Initialize storage
storageWrapper.set('log', '');
storageWrapper.set('logLastError', '');

// Context menu handler (will be set by background.ts)
let contextMenuQuickSwitchHandler: ((info: chrome.contextMenus.OnClickData) => void) | null = null;

export function setQuickSwitchHandler(handler: (info: chrome.contextMenus.OnClickData) => void) {
  contextMenuQuickSwitchHandler = handler;
}

if (chrome.contextMenus) {
  // Create context menu items
  if (chrome.i18n?.getUILanguage) {
    // We must create the menu item here before others to make it first in menu.
    chrome.contextMenus.create({
      id: 'enableQuickSwitch',
      title: chrome.i18n.getMessage('contextMenu_enableQuickSwitch') || 'Enable Quick Switch',
      type: 'checkbox',
      checked: false,
      contexts: ["action"]
    });
  }

  chrome.contextMenus.create({
    id: 'reportIssues',
    title: chrome.i18n.getMessage('popup_reportIssues') || 'Report Issues',
    contexts: ["action"]
  });

  chrome.contextMenus.create({
    id: 'errorLog',
    title: chrome.i18n.getMessage('popup_errorLog') || 'Error Log',
    contexts: ["action"]
  });

  // Handle context menu clicks
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    switch (info.menuItemId) {
      case 'enableQuickSwitch':
        if (contextMenuQuickSwitchHandler) {
          contextMenuQuickSwitchHandler(info);
        }
        break;
      case 'reportIssues':
        // Will be handled by OmegaDebug
        if (typeof (globalThis as any).OmegaDebug !== 'undefined') {
          (globalThis as any).OmegaDebug.reportIssue();
        }
        break;
      case 'errorLog':
        // Will be handled by OmegaDebug
        if (typeof (globalThis as any).OmegaDebug !== 'undefined') {
          (globalThis as any).OmegaDebug.downloadLog();
        }
        break;
    }
  });
}

