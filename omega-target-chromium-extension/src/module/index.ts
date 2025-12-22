/** @module omega-target-chromium-extension */

import ExternalApi from './external_api';
import Inspect from './inspect';
import Options from './options';
import * as proxy from './proxy';
import Storage from './storage';
import SwitchySharp from './switchysharp';
import ChromeTabs from './tabs';
import WebRequestMonitor from './web_request_monitor';

// Export all module components
export {
  Storage,
  Options,
  ChromeTabs,
  SwitchySharp,
  ExternalApi,
  WebRequestMonitor,
  Inspect,
  proxy,
};

// Re-export everything from omega-target
export * from 'omega-target';
