/** @module omega-target */

import Log = require('./src/log');
import Storage = require('./src/storage');
import BrowserStorage = require('./src/browser_storage');
import Options = require('./src/options');
import OptionsSync = require('./src/options_sync');
import * as OmegaPac from 'omega-pac';

export { Log, Storage, BrowserStorage, Options, OptionsSync, OmegaPac };

// Re-export core domain types
export * from './src/types';

// Re-export storage types
export * from './src/storage';

// Re-export utils
export * from './src/utils';

// Re-export errors
export * from './src/errors';

// Re-export default options
export { default as defaultOptions } from './src/default_options';

