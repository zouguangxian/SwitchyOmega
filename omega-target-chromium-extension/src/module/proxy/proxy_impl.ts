/** @module omega-target-chromium-extension/proxy/proxy_impl */

import * as OmegaTarget from 'omega-target';
import type { Profile, OmegaOptions, VirtualProfile } from 'omega-target';
const OmegaPac = OmegaTarget.OmegaPac;
import ProxyAuth from './proxy_auth';

interface ProxyImplFeatures {
  readonly [key: string]: boolean;
}

class ProxyImpl {
  log: typeof OmegaTarget.Log;
  features?: string[];
  protected _proxyAuth?: ProxyAuth;

  constructor(log: typeof OmegaTarget.Log) {
    this.log = log;
  }

  static isSupported(): boolean {
    return false;
  }

  applyProfile(profile: Profile, meta?: Profile, options?: OmegaOptions): Promise<void> {
    return Promise.reject(new Error('Not implemented'));
  }

  watchProxyChange(callback: (details: unknown) => void): void | null {
    return null;
  }

  parseExternalProfile(details: unknown, options: OmegaOptions): Profile | null {
    return null;
  }

  protected _profileNotFound(name: string): VirtualProfile {
    this.log.error(`Profile ${name} not found! Things may go very, very wrong.`);
    return OmegaPac.Profiles.create({
      name,
      profileType: 'VirtualProfile',
      defaultProfileName: 'direct'
    }) as VirtualProfile;
  }

  setProxyAuth(profile: Profile, options: OmegaOptions): Promise<void> {
    return Promise.resolve().then(() => {
      if (!this._proxyAuth) {
        this._proxyAuth = new ProxyAuth(this.log);
      }
      this._proxyAuth.listen();
      
      const referenced_profiles: Profile[] = [];
      const ref_set = OmegaPac.Profiles.allReferenceSet(
        profile,
        options,
        { profileNotFound: this._profileNotFound.bind(this) }
      );
      
      for (const key in ref_set) {
        if (Object.prototype.hasOwnProperty.call(ref_set, key)) {
          const name = ref_set[key];
          const referencedProfile = OmegaPac.Profiles.byName(name, options) as Profile | null;
          if (referencedProfile) {
            referenced_profiles.push(referencedProfile);
          }
        }
      }
      
      this._proxyAuth.setProxies(referenced_profiles);
    });
  }

  getProfilePacScript(profile: Profile, meta: Profile, options: OmegaOptions): string {
    if (!meta) {
      meta = profile;
    }
    
    let ast = OmegaPac.PacGenerator.script(options, profile, {
      profileNotFound: this._profileNotFound.bind(this)
    });
    ast = OmegaPac.PacGenerator.compress(ast);
    const script = OmegaPac.PacGenerator.ascii(ast.print_to_string());
    
    let profileName = OmegaPac.PacGenerator.ascii(JSON.stringify(meta.name));
    profileName = profileName.replace(/\*/g, '\\u002a');
    profileName = profileName.replace(/\\/g, '\\u002f');
    
    const prefix = `/*OmegaProfile*${profileName}*${meta.revision}*/`;
    return prefix + script;
  }
}

export default ProxyImpl;

