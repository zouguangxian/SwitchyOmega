import * as U2 from 'uglify-js';
import * as ShexpUtils from './shexp_utils.js';
import * as Conditions from './conditions.js';
import * as RuleList from './rule_list.js';
import { AttachedCache, Revision } from './utils.js';

interface Proxy {
  scheme: string;
  host: string;
  port: number;
}

interface Profile {
  name: string;
  profileType: string;
  color?: string;
  builtin?: boolean;
  revision?: string;
  defaultProfileName?: string;
  bypassList?: any[];
  [key: string]: any;
}

interface ProfileHandler {
  includable?: boolean | ((profile: Profile) => boolean);
  inclusive?: boolean;
  updateUrl?: (profile: Profile) => void;
  updateContentTypeHints?: (profile: Profile) => void;
  update?: (profile: Profile, data: any) => void;
  create?: (profile: Profile) => void;
  replaceRef?: (profile: Profile, fromName: string, toName: string) => boolean;
  analyze?: (profile: Profile) => any;
  directReferenceSet?: (profile: Profile) => { [key: string]: string };
  match?: (profile: Profile, request: any, cache: any) => any;
  compile: (profile: Profile, cache?: any) => U2.AST_Node;
}

interface ProfileTypes {
  [key: string]: ProfileHandler | string;
}

interface ProfileCache {
  analyzed?: any;
  directReferenceSet?: { [key: string]: string };
  compiled?: U2.AST_Node;
}

class AST_Raw extends U2.AST_SymbolRef {
  constructor(raw: string) {
    super({ name: raw });
  }

  aborts(): boolean {
    return false;
  }
}

const builtinProfiles: { [key: string]: Profile } = {
  '+direct': {
    name: 'direct',
    profileType: 'DirectProfile',
    color: '#aaaaaa',
    builtin: true
  },
  '+system': {
    name: 'system',
    profileType: 'SystemProfile',
    color: '#000000',
    builtin: true
  }
};

const schemes = [
  { scheme: 'http', prop: 'proxyForHttp' },
  { scheme: 'https', prop: 'proxyForHttps' },
  { scheme: 'ftp', prop: 'proxyForFtp' },
  { scheme: '', prop: 'fallbackProxy' }
];

const pacProtocols: { [key: string]: string } = {
  'http': 'PROXY',
  'https': 'HTTPS',
  'socks4': 'SOCKS',
  'socks5': 'SOCKS5'
};

const formatByType: { [key: string]: string } = {
  'SwitchyRuleListProfile': 'Switchy',
  'AutoProxyRuleListProfile': 'AutoProxy'
};

const ruleListFormats = [
  'Switchy',
  'AutoProxy'
];

const _profileCache = new AttachedCache<Profile, ProfileCache>('_cache', (profile) => profile.revision || '');

const _profileTypes: ProfileTypes = {
  'SystemProfile': {
    compile: (profile: Profile): never => {
      throw new Error("SystemProfile cannot be used in PAC scripts");
    },
    update: () => {}
  },
  'DirectProfile': {
    includable: true,
    compile: (profile: Profile): U2.AST_Node => {
      return new U2.AST_String({ value: pacResult() });
    },
    update: () => {}
  },
  'FixedProfile': {
    includable: true,
    create: (profile: Profile): void => {
      profile.bypassList = profile.bypassList ?? [
        {
          conditionType: 'BypassCondition',
          pattern: '127.0.0.1'
        },
        {
          conditionType: 'BypassCondition',
          pattern: '[::1]'
        }
      ];
    },
    compile: (profile: Profile): U2.AST_Node => {
      return new U2.AST_String({ value: 'DIRECT' });
    },
    update: () => {}
  }
};

function _handler(profileType: string | Profile): ProfileHandler {
  if (typeof profileType !== 'string') {
    profileType = profileType.profileType;
  }

  let handler: ProfileHandler | string = profileType;
  while (typeof handler === 'string') {
    handler = _profileTypes[handler];
  }
  if (!handler) {
    throw new Error(`Unknown profile type: ${profileType}`);
  }
  return handler;
}

export function parseHostPort(str: string, scheme: string): Proxy | undefined {
  const sep = str.lastIndexOf(':');
  if (sep < 0) return undefined;
  
  const port = parseInt(str.substr(sep + 1)) || 80;
  const host = str.substr(0, sep);
  if (!host) return undefined;
  
  return {
    scheme,
    host,
    port
  };
}

export function pacResult(proxy?: Proxy): string {
  if (proxy) {
    if (proxy.scheme === 'socks5') {
      return `SOCKS5 ${proxy.host}:${proxy.port}; SOCKS ${proxy.host}:${proxy.port}`;
    } else {
      return `${pacProtocols[proxy.scheme]} ${proxy.host}:${proxy.port}`;
    }
  } else {
    return 'DIRECT';
  }
}

export function isFileUrl(url?: string): boolean {
  return !!(url?.substr(0, 5).toUpperCase() === 'FILE:');
}

export function nameAsKey(profileName: string | Profile): string {
  if (typeof profileName !== 'string') {
    profileName = profileName.name;
  }
  return '+' + profileName;
}

export function byName(profileName: string | Profile, options: { [key: string]: Profile }): Profile | undefined {
  if (typeof profileName === 'string') {
    const key = nameAsKey(profileName);
    profileName = builtinProfiles[key] ?? options[key];
  }
  return profileName;
}

export function byKey(key: string | Profile, options: { [key: string]: Profile }): Profile | undefined {
  if (typeof key === 'string') {
    key = builtinProfiles[key] ?? options[key];
  }
  return key;
}

export function each(options: { [key: string]: Profile }, callback: (key: string, profile: Profile) => void): void {
  const charCodePlus = '+'.charCodeAt(0);
  for (const [key, profile] of Object.entries(options)) {
    if (key.charCodeAt(0) === charCodePlus) {
      callback(key, profile);
    }
  }
  for (const [key, profile] of Object.entries(builtinProfiles)) {
    if (key.charCodeAt(0) === charCodePlus) {
      callback(key, profile);
    }
  }
}

export function profileResult(profileName: string): U2.AST_Node {
  let key = nameAsKey(profileName);
  if (key === '+direct') {
    key = pacResult();
  }
  return new U2.AST_String({ value: key });
}

export function isIncludable(profile: Profile): boolean {
  const includable = _handler(profile).includable;
  if (typeof includable === 'function') {
    return !!includable(profile);
  }
  return !!includable;
}

export function isInclusive(profile: Profile): boolean {
  return !!_handler(profile).inclusive;
}

export function updateUrl(profile: Profile): void {
  _handler(profile).updateUrl?.(profile);
}

export function updateContentTypeHints(profile: Profile): void {
  _handler(profile).updateContentTypeHints?.(profile);
}

export function update(profile: Profile, data: any): void {
  _handler(profile).update?.(profile, data);
}

export function tag(profile: Profile): string {
  return profile.revision || '';
}

export function create(profile: string | Profile, optProfileType?: string): Profile {
  if (typeof profile === 'string') {
    profile = {
      name: profile,
      profileType: optProfileType!
    };
  } else if (optProfileType) {
    profile.profileType = optProfileType;
  }
  const handler = _handler(profile);
  if (!handler.create) return profile;
  handler.create(profile);
  return profile;
}

export function updateRevision(profile: Profile, revision?: string): void {
  revision = revision ?? Revision.fromTime();
  profile.revision = revision;
}

export function replaceRef(profile: Profile, fromName: string, toName: string): boolean {
  if (!isInclusive(profile)) return false;
  const handler = _handler(profile);
  return handler.replaceRef?.(profile, fromName, toName) ?? false;
}

export function analyze(profile: Profile): ProfileCache {
  const cache = _profileCache.get(profile, {});
  if (!Object.prototype.hasOwnProperty.call(cache, 'analyzed')) {
    const analyze = _handler(profile).analyze;
    const result = analyze?.(profile);
    cache.analyzed = result;
  }
  return cache;
}

export function dropCache(profile: Profile): void {
  _profileCache.drop(profile);
}

export function directReferenceSet(profile: Profile): { [key: string]: string } {
  if (!isInclusive(profile)) return {};
  const cache = _profileCache.get(profile, {});
  if (cache.directReferenceSet) return cache.directReferenceSet;
  const handler = _handler(profile);
  cache.directReferenceSet = handler.directReferenceSet?.(profile) ?? {};
  return cache.directReferenceSet;
}

export function profileNotFound(name: string, action?: ((name: string) => any) | string | Profile): Profile | null {
  if (action === undefined) {
    throw new Error(`Profile ${name} does not exist!`);
  }
  if (typeof action === 'function') {
    action = action(name);
  }
  if (typeof action === 'object' && 'profileType' in action) {
    return action as Profile;
  }
  switch (action) {
    case 'ignore':
      return null;
    case 'dumb':
      return create({
        name: name,
        profileType: 'VirtualProfile',
        defaultProfileName: 'direct'
      });
    default:
      throw action;
  }
}

interface AllReferenceSetArgs {
  out?: { [key: string]: string };
  profileNotFound?: (name: string) => any;
}

export function allReferenceSet(
  profile: string | Profile,
  options: { [key: string]: Profile },
  optArgs: AllReferenceSetArgs = {}
): { [key: string]: string } {
  const oProfile = profile;
  const resolvedProfile = byName(profile, options);
  if (!resolvedProfile) {
    const profileName = typeof oProfile === 'string' ? oProfile : oProfile.name;
    const fallbackProfile = profileNotFound(profileName, optArgs.profileNotFound);
    if (!fallbackProfile) return {};
    profile = fallbackProfile;
  } else {
    profile = resolvedProfile;
  }
  
  const hasOut = 'out' in optArgs;
  const result = optArgs.out = optArgs.out ?? {};
  
  result[nameAsKey(profile.name)] = profile.name;
  for (const [key, name] of Object.entries(directReferenceSet(profile))) {
    allReferenceSet(name, options, optArgs);
  }
  
  if (!hasOut) {
    delete optArgs.out;
  }
  return result;
}

export function referencedBySet(
  profile: string | Profile,
  options: { [key: string]: Profile },
  optArgs: { out?: { [key: string]: string } } = {}
): { [key: string]: string } {
  const profileKey = nameAsKey(profile);
  const hasOut = 'out' in optArgs;
  const result = optArgs.out = optArgs.out ?? {};
  
  each(options, (key, prof) => {
    if (directReferenceSet(prof)[profileKey]) {
      result[key] = prof.name;
      referencedBySet(prof, options, optArgs);
    }
  });
  
  if (!hasOut) {
    delete optArgs.out;
  }
  return result;
}

export function validResultProfilesFor(profile: string | Profile, options: { [key: string]: Profile }): Profile[] {
  profile = byName(profile, options)!;
  if (!isInclusive(profile)) return [];
  
  const profileKey = nameAsKey(profile);
  const ref = referencedBySet(profile, options);
  ref[profileKey] = profileKey;
  
  const result: Profile[] = [];
  each(options, (key, prof) => {
    if (!ref[key] && isIncludable(prof)) {
      result.push(prof);
    }
  });
  return result;
}

export function match(profile: Profile, request: any, optProfileType?: string): any {
  optProfileType = optProfileType ?? profile.profileType;
  const cache = analyze(profile);
  const matchFn = _handler(optProfileType).match;
  return matchFn?.(profile, request, cache);
}

export function compile(profile: Profile, optProfileType?: string): U2.AST_Node {
  optProfileType = optProfileType ?? profile.profileType;
  const cache = analyze(profile);
  if (cache.compiled) return cache.compiled;
  
  const handler = _handler(optProfileType);
  cache.compiled = handler.compile(profile, cache);
  return cache.compiled;
}

export {
  builtinProfiles,
  schemes,
  pacProtocols,
  formatByType,
  ruleListFormats
}; 