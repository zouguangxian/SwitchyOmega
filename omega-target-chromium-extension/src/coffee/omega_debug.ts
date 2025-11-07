/** @module omega-target-chromium-extension/omega_debug */

(window as any).OmegaDebug = {
  getProjectVersion(): string {
    return chrome.runtime.getManifest().version;
  },

  getExtensionVersion(): string {
    return chrome.runtime.getManifest().version;
  },

  downloadLog(): void {
    const blob = new Blob([localStorage['log']], { type: "text/plain;charset=utf-8" });
    const filename = `OmegaLog_${Date.now()}.txt`;

    if ((browser as any)?.downloads?.download) {
      const url = URL.createObjectURL(blob);
      (browser as any).downloads.download({ url, filename });
    } else {
      (window as any).saveAs(blob, filename);
    }
  },

  resetOptions(): void {
    localStorage.clear();
    // Prevent options loading from sync storage after reload.
    localStorage['omega.local.syncOptions'] = '"conflict"';
    chrome.storage.local.clear();
    chrome.runtime.reload();
  },

  reportIssue(): void {
    const url = 'https://github.com/FelisCatus/SwitchyOmega/issues/new?title=&body=';
    let finalUrl = url;
    
    try {
      const projectVersion = (window as any).OmegaDebug.getProjectVersion();
      const extensionVersion = (window as any).OmegaDebug.getExtensionVersion();
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
      const err = localStorage['logLastError'];
      
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

