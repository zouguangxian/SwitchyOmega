/** @module omega-target-chromium-extension/background_preload */

(window as any).UglifyJS_NoUnsafeEval = true;
localStorage['log'] = '';
localStorage['logLastError'] = '';

(window as any).OmegaContextMenuQuickSwitchHandler = () => null;

if (chrome.contextMenus) {
  // We don't need this API. However its presence indicates that Chrome >= 35
  // which provides info.checked we need in contextMenu callback.
  // https://developer.chrome.com/extensions/contextMenus
  if ((chrome.i18n as any).getUILanguage) {
    // We must create the menu item here before others to make it first in menu.
    chrome.contextMenus.create({
      id: 'enableQuickSwitch',
      title: chrome.i18n.getMessage('contextMenu_enableQuickSwitch') || 'Enable Quick Switch',
      type: 'checkbox',
      checked: false,
      contexts: ["browser_action"],
      onclick: (info: chrome.contextMenus.OnClickData) => 
        (window as any).OmegaContextMenuQuickSwitchHandler(info)
    });
  }

  chrome.contextMenus.create({
    title: chrome.i18n.getMessage('popup_reportIssues') || 'Report Issues',
    contexts: ["browser_action"],
    onclick: (window as any).OmegaDebug.reportIssue
  });

  chrome.contextMenus.create({
    title: chrome.i18n.getMessage('popup_errorLog') || 'Error Log',
    contexts: ["browser_action"],
    onclick: (window as any).OmegaDebug.downloadLog
  });
}

