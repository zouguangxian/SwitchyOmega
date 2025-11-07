/** @module omega-target-chromium-extension/proxy/proxy_impl */

import * as OmegaTarget from 'omega-target';
const Promise = OmegaTarget.Promise;
const OmegaPac = OmegaTarget.OmegaPac;
import ProxyAuth = require('./proxy_auth');

interface ProxyImplFeatures {
  [key: string]: boolean;
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

  applyProfile(profile: any, meta?: any, options?: any): Promise<void> {
    return Promise.reject(new Error('Not implemented'));
  }

  watchProxyChange(callback: (details: any) => void): void | null {
    return null;
  }

  parseExternalProfile(details: any, options: any): any {
    return null;
  }

  protected _profileNotFound(name: string): any {
    this.log.error(`Profile ${name} not found! Things may go very, very wrong.`);
    return OmegaPac.Profiles.create({
      name,
      profileType: 'VirtualProfile',
      defaultProfileName: 'direct'
    });
  }

  setProxyAuth(profile: any, options: any): Promise<void> {
    return Promise.try(() => {
      if (!this._proxyAuth) {
        this._proxyAuth = new ProxyAuth(this.log);
      }
      this._proxyAuth.listen();
      
      const referenced_profiles: any[] = [];
      const ref_set = OmegaPac.Profiles.allReferenceSet(
        profile,
        options,
        { profileNotFound: this._profileNotFound.bind(this) }
      );
      
      for (const key in ref_set) {
        if (ref_set.hasOwnProperty(key)) {
          const name = ref_set[key];
          const referencedProfile = OmegaPac.Profiles.byName(name, options);
          if (referencedProfile) {
            referenced_profiles.push(referencedProfile);
          }
        }
      }
      
      this._proxyAuth.setProxies(referenced_profiles);
    });
  }

  getProfilePacScript(profile: any, meta: any, options: any): string {
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

export = ProxyImpl;

