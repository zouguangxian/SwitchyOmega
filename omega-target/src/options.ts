/** @module omega-target/options */
import { Promise } from './utils';
import { Log } from './log';
import { Storage, StorageItems } from './storage';
import * as OmegaPac from 'omega-pac';
import * as jsondiffpatch from 'jsondiffpatch';
import defaultOptions from './default_options';

export interface OmegaOptions {
  [key: string]: any;
}

export interface OptionsState {
  [key: string]: any;
}

export class ProfileNotExistError extends Error {
  profileName: string;

  constructor(profileName: string) {
    super(`Profile ${profileName} does not exist!`);
    this.profileName = profileName;
    this.name = 'ProfileNotExistError';
  }
}

export class NoOptionsError extends Error {
  constructor() {
    super('No options available!');
    this.name = 'NoOptionsError';
  }
}

export class Options {
  /**
   * All the options, in a map from key to value.
   */
  private _options: OmegaOptions = {};
  private _storage: Storage;
  private _state: OptionsState = {};
  private _currentProfileName: string | null = null;
  private _revertToProfileName: string | null = null;
  private _watchingProfiles: { [key: string]: boolean } = {};
  private _tempProfile: any | null = null;
  private _tempProfileActive: boolean = false;
  private _isSystem: boolean = false;

  public fallbackProfileName: string = 'system';
  public debugStr: string = 'Options';
  public ready: Promise<void>;

  static ProfileNotExistError = ProfileNotExistError;
  static NoOptionsError = NoOptionsError;

  /**
   * Transform options values (especially profiles) for syncing.
   * @param value The value to transform
   * @param key The key of the options
   * @returns The transformed value
   */
  static transformValueForSync(value: any, key: string): any {
    if (key[0] === '+') {
      if (OmegaPac.Profiles.updateUrl(value)) {
        return {};
      }
    }
    return value;
  }

  constructor(storage: Storage) {
    this._storage = storage;
    this.ready = this._loadOptions();
  }

  private _loadOptions(): Promise<void> {
    return this._storage.get(null).then((options) => {
      if (!options || Object.keys(options).length === 0) {
        this._options = defaultOptions();
        return this._storage.set(this._options).then(() => undefined);
      }
      this._options = options;
      return;
    });
  }

  /**
   * Get all options or a specific option by key.
   */
  get(key?: string): Promise<any> {
    if (Object.keys(this._options).length === 0) {
      return Promise.reject(new NoOptionsError());
    }
    if (typeof key === 'undefined') {
      return Promise.resolve({ ...this._options });
    }
    return Promise.resolve(this._options[key]);
  }

  /**
   * Set multiple options by key.
   */
  set(items: OmegaOptions): Promise<void> {
    if (Object.keys(this._options).length === 0) {
      return Promise.reject(new NoOptionsError());
    }
    Object.assign(this._options, items);
    return this._storage.set(items).then(() => undefined);
  }

  /**
   * Remove options by keys.
   */
  remove(keys: string | string[]): Promise<void> {
    if (Object.keys(this._options).length === 0) {
      return Promise.reject(new NoOptionsError());
    }
    if (typeof keys === 'string') {
      keys = [keys];
    }
    for (const key of keys) {
      delete this._options[key];
    }
    return this._storage.remove(keys);
  }

  /**
   * Get the current active profile.
   */
  currentProfile(): Promise<any> {
    if (!this._currentProfileName) {
      return Promise.resolve(null);
    }
    return this.get('+' + this._currentProfileName);
  }

  /**
   * Get a profile by name.
   */
  profile(name: string): Promise<any> {
    if (name === 'direct' || name === 'system') {
      return Promise.resolve({ name, profileType: name });
    }
    return this.get('+' + name).then((profile) => {
      if (!profile) {
        throw new ProfileNotExistError(name);
      }
      return profile;
    });
  }

  /**
   * Apply a profile as the current active profile.
   */
  applyProfile(name: string): Promise<void> {
    if (this._tempProfileActive) {
      this._tempProfileActive = false;
      this._tempProfile = null;
    }
    return this.profile(name).then((profile) => {
      this._currentProfileName = name;
      return;
    });
  }

  /**
   * Apply a temporary profile.
   */
  applyTempProfile(profile: any): Promise<void> {
    this._tempProfile = profile;
    this._tempProfileActive = true;
    return Promise.resolve();
  }

  /**
   * Get the state of options.
   */
  state(): Promise<OptionsState> {
    return Promise.resolve({ ...this._state });
  }

  /**
   * Set the state of options.
   */
  setState(state: OptionsState): Promise<void> {
    Object.assign(this._state, state);
    return Promise.resolve();
  }

  /**
   * Watch for changes in options.
   */
  watch(callback: (changes: OmegaOptions) => void): () => void {
    return this._storage.watch(null, callback);
  }

  /**
   * Watch for changes in profiles.
   */
  watchProfile(name: string, callback: (profile: any) => void): () => void {
    this._watchingProfiles[name] = true;
    return this._storage.watch('+' + name, (changes) => {
      const profile = changes['+' + name];
      if (profile) {
        callback(profile);
      }
    });
  }

  /**
   * Reset options to default.
   */
  reset(): Promise<void> {
    this._options = defaultOptions();
    return this._storage.remove().then(() => {
      return this._storage.set(this._options).then(() => undefined);
    });
  }
} 