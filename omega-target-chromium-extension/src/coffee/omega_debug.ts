/** @module omega-target-chromium-extension/omega_debug */

import { storageWrapper } from '../module/storage_wrapper';

(globalThis as any).OmegaDebug = {
  getProjectVersion(): string {
    return chrome.runtime.getManifest().version;
  },

  getExtensionVersion(): string {
    return chrome.runtime.getManifest().version;
  },

  async downloadLog(): Promise<void> {
    const log = await storageWrapper.getItem('log') || '';
    const blob = new Blob([log], { type: "text/plain;charset=utf-8" });
    const filename = `OmegaLog_${Date.now()}.txt`;

    if (typeof chrome !== 'undefined' && chrome?.downloads?.download) {
      const url = URL.createObjectURL(blob);
      chrome.downloads.download({ url, filename, saveAs: true });
    } else if ((globalThis as any)?.saveAs) {
      (globalThis as any).saveAs(blob, filename);
    }
  },

  async resetOptions(): Promise<void> {
    await storageWrapper.clear();
    // Prevent options loading from sync storage after reload.
    await storageWrapper.setItem('omega.local.syncOptions', '"conflict"');
    await chrome.storage.local.clear();
    chrome.runtime.reload();
  },

  reportIssue(): void {
    const url = 'https://github.com/FelisCatus/SwitchyOmega/issues/new?title=&body=';
    let finalUrl = url;
    
    try {
      const projectVersion = (globalThis as any).OmegaDebug.getProjectVersion();
      const extensionVersion = (globalThis as any).OmegaDebug.getExtensionVersion();
      const env = {
        extensionVersion,
        projectVersion: extensionVersion,
        userAgent: navigator.userAgent
      };
      
      let body = chrome.i18n.getMessage('popup_issueTemplate', [
        env.projectVersion, env.userAgent
      ]);
      
      body = body || `
        \n\n
        <!-- Please write your comment ABOVE this line. -->
        SwitchyOmega ${env.projectVersion}
        ${env.userAgent}
      `;
      
      finalUrl = url + encodeURIComponent(body);
      const err = storageWrapper.get('logLastError');
      
      if (err) {
        body += `\n\`\`\`\n${err}\n\`\`\``;
        finalUrl = (url + encodeURIComponent(body)).substr(0, 2000);
      }
    } catch (e) {
      // Use default URL if error occurs
    }

    chrome.tabs.create({ url: finalUrl });
  }
};

