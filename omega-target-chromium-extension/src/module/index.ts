/** @module omega-target-chromium-extension */

import Storage from './storage';
import Options from './options';
import ChromeTabs from './tabs';
import SwitchySharp from './switchysharp';
import ExternalApi from './external_api';
import WebRequestMonitor from './web_request_monitor';
import Inspect from './inspect';
import * as Url from 'url';
import * as proxy from './proxy';

// Export all module components
export {
  Storage,
  Options,
  ChromeTabs,
  SwitchySharp,
  ExternalApi,
  WebRequestMonitor,
  Inspect,
  Url,
  proxy
};

// Re-export everything from omega-target
import * as OmegaTarget from 'omega-target';

// Merge omega-target exports
for (const name in OmegaTarget) {
  if (OmegaTarget.hasOwnProperty(name)) {
    if (!(exports as any)[name]) {
      (exports as any)[name] = (OmegaTarget as any)[name];
    }
  }
}

