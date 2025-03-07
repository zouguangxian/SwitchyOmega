/// <reference types="chrome"/>

declare global {
  interface Window {
    browser?: {
      downloads?: {
        download?: (options: { url: string; filename: string }) => Promise<any>;
      };
    };
    saveAs?: (blob: Blob, filename: string) => void;
  }
}

interface OmegaDebug {
  getProjectVersion(): string;
  getExtensionVersion(): string;
  downloadLog(): void;
  resetOptions(): void;
  reportIssue(): void;
}

const OmegaDebug: OmegaDebug = {
  getProjectVersion(): string {
    return chrome.runtime.getManifest().version;
  },

  getExtensionVersion(): string {
    return chrome.runtime.getManifest().version;
  },

  downloadLog(): void {
    const blob = new Blob([localStorage['log']], { type: "text/plain;charset=utf-8" });
    const filename = `OmegaLog_${Date.now()}.txt`;

    if (window.browser?.downloads?.download) {
      const url = URL.createObjectURL(blob);
      window.browser.downloads.download({ url, filename });
    } else if (window.saveAs) {
      window.saveAs(blob, filename);
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
    const baseUrl = 'https://github.com/FelisCatus/SwitchyOmega/issues/new?title=&body=';
    let finalUrl = baseUrl;

    try {
      const projectVersion = this.getProjectVersion();
      const extensionVersion = this.getExtensionVersion();
      const env = {
        extensionVersion,
        projectVersion: extensionVersion,
        userAgent: navigator.userAgent
      };

      let body = chrome.i18n.getMessage('popup_issueTemplate', [
        env.projectVersion,
        env.userAgent
      ]);

      if (!body) {
        body = `\n\n
          <!-- Please write your comment ABOVE this line. -->
          SwitchyOmega ${env.projectVersion}
          ${env.userAgent}`;
      }

      finalUrl = baseUrl + encodeURIComponent(body);
      const err = localStorage['logLastError'];
      if (err) {
        body += `\n\`\`\`\n${err}\n\`\`\``;
        finalUrl = (baseUrl + encodeURIComponent(body)).substr(0, 2000);
      }
    } catch (error) {
      console.error('Error preparing issue report:', error);
    }

    chrome.tabs.create({ url: finalUrl });
  }
};

export default OmegaDebug; 