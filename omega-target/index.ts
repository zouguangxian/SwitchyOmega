/** @module omega-target */

import Log from './src/log';
import Storage from './src/storage';
import BrowserStorage from './src/browser_storage';
import Options from './src/options';
import OptionsSync from './src/options_sync';
import * as OmegaPac from 'omega-pac';

export { Log, Storage, BrowserStorage, Options, OptionsSync, OmegaPac };

// Re-export core domain types
export * from './src/types';

// Re-export storage types (excluding types already exported from types.ts)
export type { WriteOperations, OperationsArgs, StorageKeys, StorageChange } from './src/storage';

// Re-export utils
export * from './src/utils';

// Re-export errors
export * from './src/errors';

// Re-export default options
export { default as defaultOptions } from './src/default_options';

