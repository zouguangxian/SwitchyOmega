/** @module omega-target-chromium-extension */

import Storage from './storage';
import Options from './options';
import ChromeTabs from './tabs';
import SwitchySharp from './switchysharp';
import ExternalApi from './external_api';
import WebRequestMonitor from './web_request_monitor';
import Inspect from './inspect';
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
  proxy,
};

// Re-export everything from omega-target
export * from 'omega-target';
