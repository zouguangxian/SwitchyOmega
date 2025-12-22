/** @module omega-target/options */

import * as jsondiffpatch from 'jsondiffpatch';
import * as OmegaPac from 'omega-pac';

import defaultOptions from './default_options';
import Log from './log';
import OptionsSync from './options_sync';
import Storage from './storage';


import type {
  Profile,
  SwitchProfile,
  SwitchRule,
  OmegaOptions,
  ApplyProfileOptions,
  ProfileUpdateResult,
  Mutable,
} from './types';

// Re-export types for backward compatibility
export type { Profile, OmegaOptions, ApplyProfileOptions, SwitchProfile, SwitchRule };

export interface LoadOptionsArgs {
  readonly retry?: number;
}

export interface ProxyImpl {
  readonly features?: readonly string[];
  applyProfile(profile: Profile, baseProfile: Profile, options: OmegaOptions): Promise<void>;
  watchProxyChange?(callback: (details: unknown) => void): void | null;
  parseExternalProfile?(details: unknown, options: OmegaOptions): Profile | null;
  setProxyAuth?(profile: Profile, options: OmegaOptions): Promise<void>;
}

export interface SetExternalProfileArgs {
  readonly noRevert?: boolean;
  readonly internal?: boolean;
}

export interface SetOptionsSyncArgs {
  readonly force?: boolean;
}

export interface SetOptionsArgs {
  readonly checkRevision?: boolean;
  readonly persist?: boolean;
}

class Options {
  /**
   * All the options, in a map from key to value.
   */
  protected _options: Mutable<OmegaOptions> = {} as Mutable<OmegaOptions>;
  protected _storage: Storage<unknown>;
  protected _state: Storage<unknown>;
  protected _currentProfileName: string | null = null;
  protected _revertToProfileName: string | null = null;
  protected _watchingProfiles: Record<string, string> = {};
  protected _tempProfile: SwitchProfile | null = null;
  protected _tempProfileActive: boolean = false;
  protected _tempProfileRules: Record<string, SwitchRule> = {};
  protected _tempProfileRulesByProfile: Record<string, SwitchRule[]> = {};
  protected _externalProfile: Profile | null = null;
  protected _syncWatchStop: (() => void) | null = null;
  protected _watchStop: (() => void) | null = null;
  protected _isSystem: boolean = false;

  readonly fallbackProfileName: string = 'system';
  readonly debugStr: string = 'Options';

  log: typeof Log;
  sync: OptionsSync | null;
  proxyImpl: ProxyImpl;

  ready: Promise<OmegaOptions> | null = null;
  optionsLoaded: Promise<OmegaOptions> | null = null;

  static ProfileNotExistError = class ProfileNotExistError extends Error {
    profileName: string;

    constructor(profileName: string) {
      super(`Profile ${profileName} does not exist!`);
      this.profileName = profileName;
    }
  };

  static NoOptionsError = class NoOptionsError extends Error {
    constructor() {
      super();
    }
  };

  /**
   * Transform options values (especially profiles) for syncing.
   * Removes dynamic/cached fields that shouldn't be synced.
   * @param value The value to transform
   * @param key The key of the options
   * @returns The transformed value
   */
  static transformValueForSync(value: unknown, key: string): unknown {
    if (key[0] === '+' && value && typeof value === 'object') {
      const profile = value as Partial<Profile>;
      if (OmegaPac.Profiles.updateUrl(profile)) {
        // Remove cached/dynamic fields from sync
        const syncProfile: Record<string, unknown> = {};
        for (const k in profile) {
          if (!Object.prototype.hasOwnProperty.call(profile, k)) continue;

          // Skip cached fields
          if (k === 'lastUpdate' || k === 'ruleList' || k === 'pacScript') {
            continue;
          }
          syncProfile[k] = (profile as Record<string, unknown>)[k];
        }
        return syncProfile;
      }
    }
    return value;
  }

  constructor(
    options: OmegaOptions | null,
    storage?: Storage<unknown>,
    state?: Storage<unknown>,
    log?: typeof Log,
    sync?: OptionsSync | null,
    proxyImpl?: ProxyImpl,
  ) {
    this._storage = storage || new Storage<unknown>();
    this._state = state || new Storage<unknown>();
    this.log = log || Log;
    this.sync = sync ?? null;
    this.proxyImpl = proxyImpl!; // Required parameter

    if (options == null) {
      this.init();
    } else {
      this.ready = this._storage
        .remove()
        .then(() => {
          return this._storage.set(options as Record<string, unknown>);
        })
        .then(() => {
          return this.init();
        });
    }
  }

  /**
   * Attempt to load options from local and remote storage.
   * @param args Extra arguments
   * @returns The loaded options
   */
  loadOptions(args: LoadOptionsArgs = {}): Promise<OmegaOptions> {
    const { retry = 3 } = args;

    if (this._syncWatchStop) {
      this._syncWatchStop();
    }
    this._syncWatchStop = null;

    if (this._watchStop) {
      this._watchStop();
    }
    this._watchStop = null;

    const loadRaw = !this.sync?.enabled
      ? (() => {
          if (!this.sync) {
            this._state.set({ syncOptions: 'unsupported' });
          }
          return this._storage.get(null);
        })()
      : (() => {
          this._state.set({ syncOptions: 'sync' });
          this._syncWatchStop = this.sync!.watchAndPull(this._storage);
          return this.sync!.copyTo(this._storage)
            .catch((e: any) => {
              if (e instanceof Storage.StorageUnavailableError) {
                console.error(
                  'Warning: Sync storage is not available in this ' +
                    'browser! Disabling options sync.',
                );
                if (this._syncWatchStop) {
                  this._syncWatchStop();
                }
                this._syncWatchStop = null;
                this.sync = null;
                this._state.set({ syncOptions: 'unsupported' });
              }
            })
            .then(() => {
              return this._storage.get(null);
            });
        })();

    this.optionsLoaded = loadRaw
      .then((options) => {
        return this.upgrade(options as Mutable<OmegaOptions>);
      })
      .then(([options, changes]) => {
        return this._storage.apply({ changes }).then(() => options);
      })
      .then((options) => {
        this._options = options as Mutable<OmegaOptions>;
        this._watchStop = this._watch();
        // Try to set syncOptions to some value if not initialized.
        this._state.get({ syncOptions: '' }).then(({ syncOptions }) => {
          if (syncOptions) return;
          this._state.set({ syncOptions: 'conflict' });
          if (this.sync?.storage) {
            this.sync.storage.get({ schemaVersion: undefined }).then(({ schemaVersion }) => {
              if (!schemaVersion) {
                this._state.set({ syncOptions: 'pristine' });
              }
            });
          }
        });
        return options;
      })
      .catch((e: unknown) => {
        if (retry <= 0) {
          return Promise.reject(e);
        }

        const getFallbackOptions = Promise.resolve().then(() => {
          if (e instanceof Options.NoOptionsError) {
            return this._state
              .get({
                firstRun: 'new',
                'web.switchGuide': 'showOnFirstUse',
              })
              .then((items) => this._state.set(items))
              .then(() => {
                if (!this.sync) return null;
                return this._state.get({ syncOptions: '' }).then(({ syncOptions }) => {
                  if (syncOptions === 'conflict') return null;
                  // Try to fetch options from sync storage.
                  return this.sync!.storage.get(null)
                    .then((options) => {
                      if (!options['schemaVersion']) {
                        this._state.set({ syncOptions: 'pristine' });
                        return null;
                      } else {
                        this._state.set({ syncOptions: 'sync' });
                        this.sync!.enabled = true;
                        this.log.log('Options#loadOptions::fromSync', options);
                        return options;
                      }
                    })
                    .catch(() => null);
                });
              });
          } else {
            this.log.error((e as Error).stack);
            // Some serious error happened when loading options. Disable syncing
            // and use fallback options.
            this._state.remove(['syncOptions']);
            return null;
          }
        });

        return getFallbackOptions.then((options) => {
          if (!options) {
            options = this.parseOptions(this.getDefaultOptions());
          }
          if (this.sync) {
            const prevEnabled = this.sync.enabled;
            this.sync.enabled = false;
            return this._storage
              .remove()
              .then(() => {
                return this._storage.set(options);
              })
              .then(() => {
                if (this.sync) {
                  this.sync.enabled = prevEnabled;
                }
                return this.loadOptions({ retry: retry - 1 });
              });
          } else {
            return this._storage
              .remove()
              .then(() => {
                return this._storage.set(options);
              })
              .then(() => {
                return this.loadOptions({ retry: retry - 1 });
              });
          }
        });
      });

    return this.optionsLoaded;
  }

  /**
   * Attempt to initialize (or reinitialize) options.
   * @returns A promise that is fulfilled on ready.
   */
  init(): Promise<OmegaOptions> {
    this.ready = this.loadOptions()
      .then(() => {
        if (this._options['-startupProfileName']) {
          return this.applyProfile(this._options['-startupProfileName']);
        } else {
          return this._state
            .get({
              currentProfileName: this.fallbackProfileName,
              isSystemProfile: false,
            })
            .then((st) => {
              if (st['isSystemProfile']) {
                return this.applyProfile('system');
              } else {
                const profileName = st['currentProfileName'];
                return this.applyProfile(
                  typeof profileName === 'string' ? profileName : this.fallbackProfileName,
                );
              }
            });
        }
      })
      .catch((err) => {
        if (!(err instanceof Options.ProfileNotExistError)) {
          this.log.error(err);
        }
        return this.applyProfile(this.fallbackProfileName);
      })
      .catch((err) => {
        this.log.error(err);
      })
      .then(() => this.getAll());

    this.ready.then(() => {
      if (this.sync?.enabled) {
        this.sync.requestPush(this._options);
      }

      this._state.get({ firstRun: '' }).then(({ firstRun }) => {
        if (typeof firstRun === 'string' && firstRun) {
          this.onFirstRun(firstRun);
        }
      });

      const downloadInterval = this._options['-downloadInterval'];
      if (typeof downloadInterval === 'number' && downloadInterval > 0) {
        this.updateProfile();
      }
    });

    return this.ready;
  }

  toString(): string {
    return '<Options>';
  }

  /**
   * Return a localized, human-readable description of the given profile.
   * In base class, this method is not implemented and will always return null.
   * @param profile The profile to print
   * @returns Description of the profile with details
   */
  printProfile(profile: any): string | null {
    return null;
  }

  /**
   * Upgrade options from previous versions.
   * @param options The legacy options to upgrade
   * @param changes Previous pending changes to be applied.
   * @returns The new options and the changes.
   */
  upgrade(
    options: Mutable<OmegaOptions> | null,
    changes?: Record<string, unknown>,
  ): Promise<[OmegaOptions, Record<string, unknown>]> {
    const result = changes || {};
    const version = options?.['schemaVersion'];

    if (version === 1) {
      let autoDetectUsed = false;
      OmegaPac.Profiles.each(options, (key: string, profile: unknown) => {
        if (!autoDetectUsed) {
          const refs = OmegaPac.Profiles.directReferenceSet(profile);
          if (refs['+auto_detect']) {
            autoDetectUsed = true;
          }
        }
      });

      if (autoDetectUsed) {
        options!['+auto_detect'] = OmegaPac.Profiles.create({
          name: 'auto_detect',
          profileType: 'PacProfile',
          pacUrl: 'http://wpad/wpad.dat',
          color: '#00cccc',
        });
      }
      result['schemaVersion'] = options!['schemaVersion'] = 2;
    }

    if (options?.['schemaVersion'] === 2) {
      // Current schemaVersion.
      return Promise.resolve([options as OmegaOptions, result]);
    } else {
      return Promise.reject(new Error(`Invalid schemaVersion ${version}!`));
    }
  }

  /**
   * Parse options in various formats (including JSON & base64).
   * @param options The options to parse
   * @returns The parsed options.
   */
  parseOptions(options: OmegaOptions | string): OmegaOptions {
    let parsed: OmegaOptions;

    if (typeof options === 'string') {
      let str = options;
      if (str[0] !== '{') {
        try {
          const Buffer = require('buffer').Buffer;
          str = new Buffer(str, 'base64').toString('utf8');
        } catch (e) {
          throw new Error('Invalid options!');
        }
      }
      try {
        parsed = JSON.parse(str) as OmegaOptions;
      } catch (e) {
        throw new Error('Invalid options!');
      }
    } else {
      parsed = options;
    }

    if (!parsed) {
      throw new Error('Invalid options!');
    }

    return parsed;
  }

  /**
   * Reset the options to the given options or initial options.
   * @param options The options to set. Defaults to initial.
   * @returns The options just applied
   */
  reset(options?: OmegaOptions | string): Promise<OmegaOptions> {
    this.log.method('Options#reset', this, arguments);

    if (!options) {
      options = this.getDefaultOptions();
    }

    return this.upgrade(this.parseOptions(options)).then(([opt]) => {
      // Disable syncing when resetting to avoid affecting sync storage.
      if (this.sync) {
        this.sync.enabled = false;
      }
      this._state.remove(['syncOptions']);
      return this._storage
        .remove()
        .then(() => {
          return this._storage.set(opt);
        })
        .then(() => {
          return this.init();
        });
    });
  }

  /**
   * Called on the first initialization of options.
   * @param reason The value of 'firstRun' in state.
   */
  onFirstRun(reason: string): void {
    // Override in subclass
  }

  /**
   * Return the default options used initially and on resets.
   * @returns The default options.
   */
  getDefaultOptions(): OmegaOptions {
    return defaultOptions();
  }

  /**
   * Return all options.
   * @returns The options.
   */
  getAll(): OmegaOptions {
    return this._options;
  }

  /**
   * Get profile by name.
   * @returns The profile, or undefined if no such profile.
   */
  profile(name: string): any {
    return OmegaPac.Profiles.byName(name, this._options);
  }

  /**
   * Apply the patch to the current options.
   * @param patch The patch to apply
   * @returns The updated options
   */
  patch(patch: any): Promise<OmegaOptions> | void {
    if (!patch) return;

    this.log.method('Options#patch', this, arguments);

    this._options = jsondiffpatch.patch(this._options, patch);
    // Only set the keys whose values have changed.
    const changes: Record<string, any> = {};

    for (const key in patch) {
      if (patch.hasOwnProperty(key)) {
        const delta = patch[key];
        if (Array.isArray(delta) && delta.length === 3 && delta[1] === 0 && delta[2] === 0) {
          // [previousValue, 0, 0] indicates that the key was removed.
          changes[key] = undefined;
        } else {
          changes[key] = this._options[key];
        }
      }
    }

    return this._setOptions(changes);
  }

  protected _setOptions(
    changes: Record<string, unknown>,
    args?: SetOptionsArgs,
  ): Promise<OmegaOptions> {
    const removed: string[] = [];
    const checkRev = args?.checkRevision ?? false;
    let profilesChanged = false;
    let currentProfileAffected: boolean | string = false;

    for (const key in changes) {
      if (!Object.prototype.hasOwnProperty.call(changes, key)) continue;

      const value = changes[key];
      if (typeof value === 'undefined') {
        delete this._options[key];
        removed.push(key);
        if (key[0] === '+') {
          profilesChanged = true;
          if (key === '+' + this._currentProfileName) {
            currentProfileAffected = 'removed';
          }
        }
      } else {
        if (key[0] === '+') {
          if (checkRev && this._options[key]) {
            const existingProfile = this._options[key] as Profile;
            const newProfile = value as Profile;
            const result = OmegaPac.Revision.compare(
              existingProfile.revision || '',
              newProfile.revision || '',
            );
            if (result >= 0) continue;
          }
          profilesChanged = true;
        }
        this._options[key] = value;
      }

      if (!currentProfileAffected && this._watchingProfiles[key]) {
        currentProfileAffected = 'changed';
      }
    }

    switch (currentProfileAffected) {
      case 'removed':
        this.applyProfile(this.fallbackProfileName);
        break;
      case 'changed':
        this.applyProfile(this._currentProfileName!, { update: false });
        break;
      default:
        if (profilesChanged) {
          this._setAvailableProfiles();
        }
    }

    if (args?.persist ?? true) {
      if (this.sync?.enabled) {
        this.sync.requestPush(changes);
      }
      for (const key of removed) {
        delete changes[key];
      }
      return this._storage
        .set(changes)
        .then(() => {
          return this._storage.remove(removed);
        })
        .then(() => this._options);
    }

    return Promise.resolve(this._options);
  }

  protected _watch(): () => void {
    const handler = (changes?: Record<string, unknown>) => {
      if (changes) {
        this._setOptions(changes, { checkRevision: true, persist: false });
      } else {
        // Initial update.
        changes = this._options;
      }

      const refresh = changes['-refreshOnProfileChange'];
      if (refresh != null) {
        this._state.set({ refreshOnProfileChange: refresh });
      }

      if (Object.prototype.hasOwnProperty.call(changes, '-showExternalProfile')) {
        let showExternal = changes['-showExternalProfile'];
        if (showExternal == null) {
          showExternal = true;
          this._setOptions({ '-showExternalProfile': true }, { persist: true });
        }
        this._state.set({ showExternalProfile: showExternal });
      }

      const quickSwitchProfiles = this._cleanUpQuickSwitchProfiles(
        changes['-quickSwitchProfiles'] as string[] | undefined,
      );
      if (changes['-enableQuickSwitch'] != null || quickSwitchProfiles != null) {
        this.reloadQuickSwitch();
      }

      if (changes['-downloadInterval'] != null) {
        this.schedule('updateProfile', this._options['-downloadInterval'] as number, () => {
          this.updateProfile();
        });
      }

      if (changes['-showInspectMenu'] != null || changes === this._options) {
        let showMenu = this._options['-showInspectMenu'];
        if (showMenu == null) {
          showMenu = true;
          this._setOptions({ '-showInspectMenu': true }, { persist: true });
        }
        this.setInspect({ showMenu });
      }

      if (changes['-monitorWebRequests'] != null || changes === this._options) {
        let monitorWebRequests = this._options['-monitorWebRequests'];
        if (monitorWebRequests == null) {
          monitorWebRequests = true;
          this._setOptions({ '-monitorWebRequests': true }, { persist: true });
        }
        this.setMonitorWebRequests(monitorWebRequests as boolean);
      }
    };

    handler();
    return this._storage.watch(null, handler);
  }

  protected _cleanUpQuickSwitchProfiles(
    quickSwitchProfiles: string[] | undefined,
  ): string[] | undefined {
    if (!quickSwitchProfiles) return undefined;

    const seenQuickSwitchProfile: Record<string, boolean> = {};
    const validQuickSwitchProfiles = quickSwitchProfiles.filter((name) => {
      if (!name) return false;
      const key = OmegaPac.Profiles.nameAsKey(name);
      if (seenQuickSwitchProfile[key]) return false;
      if (!OmegaPac.Profiles.byName(name, this._options)) return false;
      seenQuickSwitchProfile[key] = true;
      return true;
    });

    if (validQuickSwitchProfiles.length !== quickSwitchProfiles.length) {
      this._setOptions({ '-quickSwitchProfiles': validQuickSwitchProfiles }, { persist: true });
    }

    return validQuickSwitchProfiles;
  }

  /**
   * Reload the quick switch according to settings.
   * @returns A promise which is fulfilled when the quick switch is set
   */
  reloadQuickSwitch(): Promise<void> {
    let profiles = this._options['-quickSwitchProfiles'];
    let profilesOrNull: string[] | null =
      profiles && profiles.length >= 2 ? (profiles as string[]) : null;

    if (this._options['-enableQuickSwitch']) {
      return this.setQuickSwitch(profilesOrNull, !!profilesOrNull);
    } else {
      return this.setQuickSwitch(null, !!profilesOrNull);
    }
  }

  /**
   * Apply the settings related to element proxy inspection.
   * In base class, this method is not implemented and will not do anything.
   * @param settings
   * @returns A promise which is fulfilled when the settings apply
   */
  setInspect(settings: { showMenu: boolean }): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Apply the settings related to web request monitoring.
   * In base class, this method is not implemented and will not do anything.
   * @param enabled Whether network shall be monitored or not
   * @returns A promise which is fulfilled when the settings apply
   */
  setMonitorWebRequests(enabled: boolean): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Watch for any changes to the options
   * @param callback Called everytime the value of a key changes
   * @returns Calling the returned function will stop watching.
   */
  watch(callback: (changes: Record<string, any>) => void): () => void {
    return this._storage.watch(null, callback);
  }

  _profileNotFound(name: string): any {
    this.log.error(`Profile ${name} not found! Things may go very, very wrong.`);
    return OmegaPac.Profiles.create({
      name,
      profileType: 'VirtualProfile',
      defaultProfileName: 'direct',
    });
  }

  /**
   * Get PAC script for profile.
   * @param profile The name of the profile, or the profile.
   * @param compress Compress the script if true.
   * @returns The compiled PAC script
   */
  pacForProfile(profile: string | any, compress: boolean = false): Promise<string> {
    let ast = OmegaPac.PacGenerator.script(this._options, profile, {
      profileNotFound: this._profileNotFound.bind(this),
    });

    if (compress) {
      ast = OmegaPac.PacGenerator.compress(ast);
    }

    return Promise.resolve(OmegaPac.PacGenerator.ascii(ast.print_to_string()));
  }

  _setAvailableProfiles(): void {
    const profile = this._currentProfileName ? this.currentProfile() : null;
    const profiles: Record<string, any> = {};
    const currentIncludable = profile && OmegaPac.Profiles.isIncludable(profile);
    let allReferenceSet: Record<string, string> | null = null;
    let results: string[] | null = null;

    if (!profile || !OmegaPac.Profiles.isInclusive(profile)) {
      results = [];
    }

    OmegaPac.Profiles.each(this._options, (key: string, p: any) => {
      profiles[key] = {
        name: p.name,
        profileType: p.profileType,
        color: p.color,
        desc: this.printProfile(p),
        builtin: p.builtin ? true : undefined,
      };

      if (p.profileType === 'VirtualProfile') {
        profiles[key].defaultProfileName = p.defaultProfileName;
        if (allReferenceSet == null) {
          allReferenceSet = profile
            ? OmegaPac.Profiles.allReferenceSet(profile, this._options, {
                profileNotFound: this._profileNotFound.bind(this),
              })
            : {};
        }
        if (allReferenceSet && allReferenceSet[key]) {
          profiles[key].validResultProfiles = OmegaPac.Profiles.validResultProfilesFor(
            p,
            this._options,
          ).map((result: any) => result.name);
        }
      }

      if (currentIncludable && OmegaPac.Profiles.isIncludable(p)) {
        results?.push(p.name);
      }
    });

    if (profile && OmegaPac.Profiles.isInclusive(profile)) {
      results = OmegaPac.Profiles.validResultProfilesFor(profile, this._options).map(
        (p: any) => p.name,
      );
    }

    this._state.set({
      availableProfiles: profiles,
      validResultProfiles: results,
    });
  }

  /**
   * Apply the profile by name.
   * @param name The name of the profile, or null for default.
   * @param options Some options
   * @returns A promise which is fulfilled when the profile is applied.
   */
  applyProfile(name: string, options?: ApplyProfileOptions): Promise<void> {
    this.log.method('Options#applyProfile', this, arguments);

    const profile = OmegaPac.Profiles.byName(name, this._options);
    if (!profile) {
      return Promise.reject(new Options.ProfileNotExistError(name));
    }

    this._currentProfileName = profile.name;
    this._isSystem = options?.system || profile.profileType === 'SystemProfile';
    this._watchingProfiles = OmegaPac.Profiles.allReferenceSet(profile, this._options, {
      profileNotFound: this._profileNotFound.bind(this),
    });

    this._state.set({
      currentProfileName: this._currentProfileName,
      isSystemProfile: this._isSystem,
      currentProfileCanAddRule: profile.rules != null && profile.profileType !== 'VirtualProfile',
    });
    this._setAvailableProfiles();

    this.currentProfileChanged(options?.reason);

    if (options && options.proxy === false) {
      return Promise.resolve();
    }

    this._tempProfileActive = false;
    let applyProxy: Promise<void>;

    if (this._tempProfile != null && OmegaPac.Profiles.isIncludable(profile)) {
      this._tempProfileActive = true;
      if (this._tempProfile.defaultProfileName !== profile.name) {
        (this._tempProfile as Mutable<SwitchProfile>).defaultProfileName = profile.name;
        if (profile.color) {
          (this._tempProfile as Mutable<SwitchProfile>).color = profile.color;
        }
        OmegaPac.Profiles.updateRevision(this._tempProfile);
      }

      const removedKeys: string[] = [];
      for (const key in this._tempProfileRulesByProfile) {
        if (Object.prototype.hasOwnProperty.call(this._tempProfileRulesByProfile, key)) {
          const list = this._tempProfileRulesByProfile[key];
          if (!OmegaPac.Profiles.byKey(key, this._options)) {
            removedKeys.push(key);
            const tempRules = (this._tempProfile as Mutable<SwitchProfile>).rules;
            for (const rule of list) {
              (rule as Mutable<SwitchRule>).profileName = this.fallbackProfileName;
              const index = tempRules.indexOf(rule);
              if (index >= 0) {
                tempRules.splice(index, 1);
              }
            }
          }
        }
      }

      if (removedKeys.length > 0) {
        for (const key of removedKeys) {
          delete this._tempProfileRulesByProfile[key];
        }
        OmegaPac.Profiles.updateRevision(this._tempProfile);
      }

      this._watchingProfiles = OmegaPac.Profiles.allReferenceSet(this._tempProfile, this._options, {
        profileNotFound: this._profileNotFound.bind(this),
      });

      applyProxy = this.proxyImpl.applyProfile(this._tempProfile, profile!, this._options);
    } else {
      applyProxy = this.proxyImpl.applyProfile(profile!, profile!, this._options);
    }

    if (options && options.update === false) {
      return applyProxy;
    }

    applyProxy.then(() => {
      const downloadInterval = this._options['-downloadInterval'];
      if (typeof downloadInterval !== 'number' || downloadInterval <= 0) return;
      if (this._currentProfileName !== profile!.name) return;

      const updateProfiles: string[] = [];
      for (const key in this._watchingProfiles) {
        if (this._watchingProfiles.hasOwnProperty(key)) {
          updateProfiles.push(this._watchingProfiles[key]);
        }
      }

      if (updateProfiles.length > 0) {
        this.updateProfile(updateProfiles);
      }
    });

    return applyProxy;
  }

  /**
   * Get the current applied profile.
   * @returns The current profile or null if none is set
   */
  currentProfile(): Profile | null {
    if (this._currentProfileName) {
      return OmegaPac.Profiles.byName(this._currentProfileName, this._options) as Profile | null;
    } else {
      return this._externalProfile;
    }
  }

  /**
   * Return true if in system mode.
   * @returns True if system mode is activated
   */
  isSystem(): boolean {
    return this._isSystem;
  }

  /**
   * Called when current profile has changed.
   * In base class, this method is not implemented and will not do anything.
   */
  currentProfileChanged(reason?: string): void {
    // Override in subclass
  }

  /**
   * Set or disable the quick switch profiles.
   * In base class, this method is not implemented and will not do anything.
   * @param quickSwitch The profile names, or null to disable
   * @param canEnable Whether user can enable quick switch or not.
   * @returns A promise which is fulfilled when the quick switch is set
   */
  setQuickSwitch(quickSwitch: string[] | null, canEnable: boolean): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Schedule a task that runs every periodInMinutes.
   * In base class, this method is not implemented and will not do anything.
   * @param name The name of the schedule.
   * @param periodInMinutes The interval of the schedule
   * @param callback The callback to call when the task runs
   * @returns A promise which is fulfilled when the schedule is set
   */
  schedule(name: string, periodInMinutes: number, callback: () => void): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Return true if the match result of current profile does not change with URLs
   * @returns Whether match always return the same result for requests
   */
  isCurrentProfileStatic(): boolean {
    if (!this._currentProfileName) return true;
    if (this._tempProfileActive) return false;
    const currentProfile = this.currentProfile();
    if (OmegaPac.Profiles.isInclusive(currentProfile)) return false;
    return true;
  }

  /**
   * Update the profile by name.
   * @param name The name of the profiles, or null for all.
   * @param opt_bypass_cache Do not read from the cache if true
   * @returns A map from keys to updated profiles or errors.
   */
  updateProfile(
    name?: string | string[] | null,
    opt_bypass_cache?: boolean,
  ): Promise<Record<string, Profile | Error>> {
    this.log.method('Options#updateProfile', this, arguments);

    const results: Record<string, Promise<Profile | Error>> = {};

    OmegaPac.Profiles.each(this._options, (key: string, profile: unknown) => {
      const typedProfile = profile as Profile;
      if (name != null) {
        if (Array.isArray(name)) {
          if (name.indexOf(typedProfile.name) < 0) return;
        } else {
          if (typedProfile.name !== name) return;
        }
      }

      const url = OmegaPac.Profiles.updateUrl(typedProfile);
      if (url) {
        const type_hints = OmegaPac.Profiles.updateContentTypeHints(typedProfile);
        const fetchResult = this.fetchUrl(url, opt_bypass_cache, type_hints);
        results[key] = fetchResult
          .then((data) => {
            // Errors and unsuccessful response codes should have been already
            // rejected by fetchUrl and will not end up here.
            // So empty data indicates success without any update (e.g. 304).
            if (!data) return Promise.resolve<Profile | Error>(typedProfile);

            const currentProfile = OmegaPac.Profiles.byKey(key, this._options) as Mutable<Profile>;
            (currentProfile as Mutable<Profile & { lastUpdate?: string }>).lastUpdate =
              new Date().toISOString();

            if (OmegaPac.Profiles.update(currentProfile, data)) {
              OmegaPac.Profiles.dropCache(currentProfile);
              const changes: Record<string, Profile> = {};
              changes[key] = currentProfile;
              return this._setOptions(changes).then(() => currentProfile as Profile | Error);
            } else {
              return Promise.resolve<Profile | Error>(currentProfile);
            }
          })
          .catch((reason: unknown): Promise<Error> => {
            return Promise.resolve(reason instanceof Error ? reason : new Error(String(reason)));
          });
      }
    });

    // Convert Promise.props (Bluebird) to Promise.all for native Promise support
    const keys = Object.keys(results);
    return Promise.all(keys.map((k) => results[k])).then((values) => {
      const resolved = {} as Record<string, Profile | Error>;
      keys.forEach((k, i) => (resolved[k] = values[i]));
      return resolved;
    }) as Promise<ProfileUpdateResult>;
  }

  /**
   * Make an HTTP GET request to fetch the content of the url.
   * In base class, this method is not implemented and will always reject.
   * @param url The URL to fetch
   * @param opt_bypass_cache Do not read from the cache if true
   * @param opt_type_hints MIME type hints for downloaded content.
   * @returns The text content fetched from the url
   */
  fetchUrl(url: string, opt_bypass_cache?: boolean, opt_type_hints?: string): Promise<string> {
    return Promise.reject(new Error('not implemented'));
  }

  protected _replaceRefChanges(
    fromName: string,
    toName: string,
    changes?: Record<string, unknown>,
  ): Record<string, unknown> {
    const result = changes || {};

    OmegaPac.Profiles.each(this._options, (key: string, p: unknown) => {
      const profile = p as Profile;
      if (profile.name === fromName || profile.name === toName) return;
      if (OmegaPac.Profiles.replaceRef(profile, fromName, toName)) {
        OmegaPac.Profiles.updateRevision(profile);
        result[OmegaPac.Profiles.nameAsKey(profile)] = profile;
      }
    });

    if (this._options['-startupProfileName'] === fromName) {
      result['-startupProfileName'] = toName;
    }

    const quickSwitch = this._options['-quickSwitchProfiles'] as string[] | undefined;
    // Change fromName to toName in Quick Switch, but only if it does not contain
    // toName already. Otherwise it may cause duplicates.
    if (quickSwitch && quickSwitch.indexOf(toName) < 0) {
      const updatedQuickSwitch = [...quickSwitch];
      for (let i = 0; i < updatedQuickSwitch.length; i++) {
        if (updatedQuickSwitch[i] === fromName) {
          updatedQuickSwitch[i] = toName;
          result['-quickSwitchProfiles'] = updatedQuickSwitch;
        }
      }
    }

    return result;
  }

  /**
   * Replace all references of profile fromName to toName.
   * @param fromName The original profile name
   * @param toName The target profile name
   * @returns The updated options
   */
  replaceRef(fromName: string, toName: string): Promise<OmegaOptions> {
    this.log.method('Options#replaceRef', this, arguments);

    const profile = OmegaPac.Profiles.byName(fromName, this._options);
    if (!profile) {
      return Promise.reject(new Options.ProfileNotExistError(fromName));
    }

    const changes = this._replaceRefChanges(fromName, toName);
    for (const key in changes) {
      if (changes.hasOwnProperty(key)) {
        this._options[key] = changes[key];
      }
    }

    const fromKey = OmegaPac.Profiles.nameAsKey(fromName);
    if (this._watchingProfiles[fromKey]) {
      if (this._currentProfileName === fromName) {
        this._currentProfileName = toName;
      }
      this.applyProfile(this._currentProfileName!);
    }

    return this._setOptions(changes);
  }

  /**
   * Rename a profile and update references and options
   * @param fromName The original profile name
   * @param toName The target profile name
   * @returns The updated options
   */
  renameProfile(fromName: string, toName: string): Promise<OmegaOptions> {
    this.log.method('Options#renameProfile', this, arguments);

    if (OmegaPac.Profiles.byName(toName, this._options)) {
      return Promise.reject(new Error(`Target name ${toName} already taken!`));
    }

    const profile = OmegaPac.Profiles.byName(fromName, this._options);
    if (!profile) {
      return Promise.reject(new Options.ProfileNotExistError(fromName));
    }

    profile.name = toName;
    const changes: Record<string, any> = {};
    changes[OmegaPac.Profiles.nameAsKey(profile)] = profile;

    this._replaceRefChanges(fromName, toName, changes);
    for (const key in changes) {
      if (changes.hasOwnProperty(key)) {
        this._options[key] = changes[key];
      }
    }

    const fromKey = OmegaPac.Profiles.nameAsKey(fromName);
    changes[fromKey] = undefined;
    delete this._options[fromKey];

    if (this._watchingProfiles[fromKey]) {
      if (this._currentProfileName === fromName) {
        this._currentProfileName = toName;
      }
      this.applyProfile(this._currentProfileName!);
    }

    return this._setOptions(changes);
  }

  /**
   * Add a temp rule.
   * @param domain The domain for the temp rule.
   * @param profileName The profile to apply for the domain.
   * @returns A promise which is fulfilled when the rule is applied.
   */
  addTempRule(domain: string, profileName: string): Promise<void> {
    this.log.method('Options#addTempRule', this, arguments);

    if (!this._currentProfileName) {
      return Promise.resolve();
    }

    const profile = OmegaPac.Profiles.byName(profileName, this._options);
    if (!profile) {
      return Promise.reject(new Options.ProfileNotExistError(profileName));
    }

    if (!this._tempProfile) {
      this._tempProfile = OmegaPac.Profiles.create('', 'SwitchProfile');
      const currentProfile = this.currentProfile();
      const mutableTemp = this._tempProfile as Mutable<SwitchProfile>;
      mutableTemp.color = currentProfile?.color;
      mutableTemp.defaultProfileName = currentProfile?.name || this.fallbackProfileName;
    }

    let changed = false;
    let rule = this._tempProfileRules[domain];

    if (rule && rule.profileName) {
      if (rule.profileName !== profileName) {
        const key = OmegaPac.Profiles.nameAsKey(rule.profileName);
        const list = this._tempProfileRulesByProfile[key];
        list.splice(list.indexOf(rule), 1);

        (rule as Mutable<SwitchRule>).profileName = profileName;
        changed = true;
      }
    } else {
      rule = {
        condition: {
          conditionType: 'HostWildcardCondition',
          pattern: '*.' + domain,
        },
        profileName,
        isTempRule: true,
      } as SwitchRule;
      (this._tempProfile as Mutable<SwitchProfile>).rules.push(rule);
      this._tempProfileRules[domain] = rule;
      changed = true;
    }

    const key = OmegaPac.Profiles.nameAsKey(profileName);
    let rulesByProfile = this._tempProfileRulesByProfile[key];
    if (!rulesByProfile) {
      rulesByProfile = this._tempProfileRulesByProfile[key] = [];
    }
    rulesByProfile.push(rule);

    if (changed) {
      OmegaPac.Profiles.updateRevision(this._tempProfile);
      return this.applyProfile(this._currentProfileName);
    } else {
      return Promise.resolve();
    }
  }

  /**
   * Find a temp rule by domain.
   * @param domain The domain of the temp rule.
   * @returns The profile name for the domain, or null if such rule does not exist.
   */
  queryTempRule(domain: string): string | null {
    const rule = this._tempProfileRules[domain];
    if (rule) {
      if (rule.profileName) {
        return rule.profileName;
      } else {
        delete this._tempProfileRules[domain];
      }
    }
    return null;
  }

  /**
   * Add a condition to the current active switch profile.
   * @param condition The condition to add
   * @param profileName The name of the result profile of the rule.
   * @returns A promise which is fulfilled when the condition is saved.
   */
  addCondition(condition: any | any[], profileName: string): Promise<OmegaOptions> {
    this.log.method('Options#addCondition', this, arguments);

    if (!this._currentProfileName) {
      return Promise.resolve(this._options);
    }

    const profile = OmegaPac.Profiles.byName(this._currentProfileName, this._options);
    if (!profile?.rules) {
      return Promise.reject(
        new Error(`Cannot add condition to Profile ${profile?.name} (${profile?.type})`),
      );
    }

    const target = OmegaPac.Profiles.byName(profileName, this._options);
    if (!target) {
      return Promise.reject(new Options.ProfileNotExistError(profileName));
    }

    const conditions = Array.isArray(condition) ? condition : [condition];

    for (const cond of conditions) {
      // Try to remove rules with the same condition first.
      const tag = OmegaPac.Conditions.tag(cond);
      for (let i = 0; i < profile.rules.length; i++) {
        if (OmegaPac.Conditions.tag(profile.rules[i].condition) === tag) {
          profile.rules.splice(i, 1);
          break;
        }
      }

      if (this._options['-addConditionsToBottom']) {
        profile.rules.push({
          condition: cond,
          profileName,
        });
      } else {
        profile.rules.unshift({
          condition: cond,
          profileName,
        });
      }
    }

    OmegaPac.Profiles.updateRevision(profile);
    const changes: Record<string, any> = {};
    changes[OmegaPac.Profiles.nameAsKey(profile)] = profile;
    return this._setOptions(changes);
  }

  /**
   * Set the defaultProfileName of the profile.
   * @param profileName The name of the profile to modify.
   * @param defaultProfileName The defaultProfileName to set.
   * @returns A promise which is fulfilled when the profile is saved.
   */
  setDefaultProfile(profileName: string, defaultProfileName: string): Promise<OmegaOptions> {
    this.log.method('Options#setDefaultProfile', this, arguments);

    const profile = OmegaPac.Profiles.byName(profileName, this._options);
    if (!profile) {
      return Promise.reject(new Options.ProfileNotExistError(profileName));
    } else if (profile.defaultProfileName == null) {
      return Promise.reject(
        new Error(`Profile ${profile.name} (${profile.type}) does not have defaultProfileName!`),
      );
    }

    const target = OmegaPac.Profiles.byName(defaultProfileName, this._options);
    if (!target) {
      return Promise.reject(new Options.ProfileNotExistError(defaultProfileName));
    }

    profile.defaultProfileName = defaultProfileName;
    OmegaPac.Profiles.updateRevision(profile);
    const changes: Record<string, any> = {};
    changes[OmegaPac.Profiles.nameAsKey(profile)] = profile;
    return this._setOptions(changes);
  }

  /**
   * Add a profile to the options
   * @param profile The profile to create
   * @returns The saved profile
   */
  addProfile(profile: any): Promise<OmegaOptions> {
    this.log.method('Options#addProfile', this, arguments);

    if (OmegaPac.Profiles.byName(profile.name, this._options)) {
      return Promise.reject(new Error(`Target name ${profile.name} already taken!`));
    }

    const changes: Record<string, any> = {};
    changes[OmegaPac.Profiles.nameAsKey(profile)] = profile;
    return this._setOptions(changes);
  }

  /**
   * Get the matching results of a request
   * @param request The request to test
   * @returns The last matched profile and the matching details
   */
  matchProfile(request: any): Promise<{ profile: any; results: any[] }> {
    if (!this._currentProfileName) {
      return Promise.resolve({ profile: this._externalProfile, results: [] });
    }

    const results: any[] = [];
    let profile = this._tempProfileActive
      ? this._tempProfile
      : OmegaPac.Profiles.byName(this._currentProfileName, this._options);

    let lastProfile = profile;

    while (profile) {
      lastProfile = profile;
      const result = OmegaPac.Profiles.match(profile, request);
      if (result == null) break;

      results.push(result);

      let next: string;
      if (Array.isArray(result)) {
        next = result[0];
      } else if (result.profileName) {
        next = OmegaPac.Profiles.nameAsKey(result.profileName);
      } else {
        break;
      }

      profile = OmegaPac.Profiles.byKey(next, this._options);
    }

    return Promise.resolve({ profile: lastProfile, results });
  }

  /**
   * Notify Options that the proxy settings are set externally.
   * @param profile The external profile
   * @param args Extra arguments
   * @returns A promise which is fulfilled when the profile is set
   */
  setExternalProfile(profile: Profile, args?: SetExternalProfileArgs): Promise<void> | void {
    if (this._options['-revertProxyChanges'] && !this._isSystem) {
      if (profile.name !== this._currentProfileName && this._currentProfileName) {
        if (!args?.noRevert) {
          this.applyProfile(this._revertToProfileName!);
          this._revertToProfileName = null;
          return;
        } else {
          if (!this._revertToProfileName) {
            this._revertToProfileName = this._currentProfileName;
          }
        }
      }
    }

    const p = OmegaPac.Profiles.byName(profile.name, this._options);
    if (p) {
      if (args?.internal) {
        this.applyProfile(p.name, { proxy: false });
      } else {
        this.applyProfile(p.name, {
          proxy: false,
          system: this._isSystem,
          reason: 'external',
        });
      }
    } else {
      this._currentProfileName = null;
      this._externalProfile = profile;
      const mutableProfile = profile as Mutable<Profile>;
      if (!mutableProfile.color) {
        mutableProfile.color = '#49afcd';
      }
      this._state.set({
        currentProfileName: '',
        externalProfile: profile,
        validResultProfiles: [],
        currentProfileCanAddRule: false,
      });
      this.currentProfileChanged('external');
    }
  }

  /**
   * Switch options syncing on and off.
   * @param enabled Whether to enable syncing
   * @param args Extra arguments
   * @returns A promise which is fulfilled when the syncing is switched
   */
  setOptionsSync(enabled: boolean, args?: SetOptionsSyncArgs): Promise<void> {
    this.log.method('Options#setOptionsSync', this, arguments);

    if (!this.sync) {
      return Promise.reject(new Error('Options syncing is unsupported.'));
    }

    return this._state.get({ syncOptions: '' }).then(({ syncOptions }) => {
      if (!enabled) {
        if (syncOptions === 'sync') {
          this._state.set({ syncOptions: 'conflict' });
        }
        this.sync!.enabled = false;
        if (this._syncWatchStop) {
          this._syncWatchStop();
        }
        this._syncWatchStop = null;
        return;
      }

      if (syncOptions === 'conflict') {
        if (!args?.force) {
          return Promise.reject(
            new Error(
              'Syncing not enabled due to conflict. Retry with force to overwrite ' +
                'local options and enable syncing.',
            ),
          );
        }
      }

      if (syncOptions === 'sync') return;

      return this._state.set({ syncOptions: 'sync' }).then(() => {
        if (syncOptions === 'conflict') {
          // Try to re-init options from sync.
          this.sync!.enabled = false;
          return this._storage.remove().then(() => {
            this.sync!.enabled = true;
            return this.init().then(() => {});
          });
        } else {
          this.sync!.enabled = true;
          if (this._syncWatchStop) {
            this._syncWatchStop();
          }
          this.sync!.requestPush(this._options);
          this._syncWatchStop = this.sync!.watchAndPull(this._storage);
          return;
        }
      });
    });
  }

  /**
   * Clear the sync storage, resetting syncing state to pristine.
   * @returns A promise which is fulfilled when the syncing is reset.
   */
  resetOptionsSync(): Promise<void> {
    this.log.method('Options#resetOptionsSync', this, arguments);

    if (!this.sync) {
      return Promise.reject(new Error('Options syncing is unsupported.'));
    }

    this.sync.enabled = false;
    if (this._syncWatchStop) {
      this._syncWatchStop();
    }
    this._syncWatchStop = null;
    this._state.set({ syncOptions: 'conflict' });

    return this.sync.storage.remove().then(() => {
      this._state.set({ syncOptions: 'pristine' });
    });
  }
}

export default Options;
