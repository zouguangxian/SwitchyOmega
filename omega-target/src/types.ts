/** @module omega-target/types */

/**
 * Core domain types for SwitchyOmega
 * Using TypeScript best practices: discriminated unions, branded types, and strict typing
 */

// ============================================================================
// Proxy Server Types
// ============================================================================

export type ProxyScheme = 'http' | 'https' | 'socks4' | 'socks5';

export interface ProxyServer {
  readonly scheme: ProxyScheme;
  readonly host: string;
  readonly port: number;
}

export interface ProxyAuth {
  readonly username: string;
  readonly password: string;
}

// ============================================================================
// Profile Types - Using Discriminated Unions
// ============================================================================

export type ProfileType =
  | 'DirectProfile'
  | 'SystemProfile'
  | 'FixedProfile'
  | 'PacProfile'
  | 'SwitchProfile'
  | 'RuleListProfile'
  | 'VirtualProfile';

/** Base profile properties shared by all profiles */
interface BaseProfile {
  readonly name: string;
  readonly profileType: ProfileType;
  readonly color?: string;
  readonly revision?: string;
  readonly builtin?: boolean;
}

/** Direct connection profile */
export interface DirectProfile extends BaseProfile {
  readonly profileType: 'DirectProfile';
}

/** System proxy profile */
export interface SystemProfile extends BaseProfile {
  readonly profileType: 'SystemProfile';
}

/** Fixed proxy server profile */
export interface FixedProfile extends BaseProfile {
  readonly profileType: 'FixedProfile';
  readonly fallbackProxy?: ProxyServer;
  readonly proxyForHttp?: ProxyServer;
  readonly proxyForHttps?: ProxyServer;
  readonly proxyForFtp?: ProxyServer;
  readonly bypassList?: BypassCondition[];
  readonly auth?: Record<string, ProxyAuth>;
}

/** PAC script profile */
export interface PacProfile extends BaseProfile {
  readonly profileType: 'PacProfile';
  readonly pacUrl?: string;
  readonly pacScript?: string;
  readonly lastUpdate?: string | null;
  readonly auth?: Record<string, ProxyAuth>;
}

/** Switch profile with rules */
export interface SwitchProfile extends BaseProfile {
  readonly profileType: 'SwitchProfile';
  readonly defaultProfileName: string;
  readonly rules: SwitchRule[];
}

/** Rule list profile */
export interface RuleListProfile extends BaseProfile {
  readonly profileType: 'RuleListProfile';
  readonly sourceUrl?: string;
  readonly lastUpdate?: string | null;
  readonly ruleList?: string;
  readonly format?: string;
  readonly defaultProfileName: string;
  readonly matchProfileName?: string;
}

/** Virtual profile pointing to another profile */
export interface VirtualProfile extends BaseProfile {
  readonly profileType: 'VirtualProfile';
  readonly defaultProfileName: string;
}

/** Union type of all profiles - enables exhaustive checking */
export type Profile =
  | DirectProfile
  | SystemProfile
  | FixedProfile
  | PacProfile
  | SwitchProfile
  | RuleListProfile
  | VirtualProfile;

// ============================================================================
// Condition Types - Discriminated Union
// ============================================================================

export type ConditionType =
  | 'HostWildcardCondition'
  | 'HostRegexCondition'
  | 'HostLevelsCondition'
  | 'IpCondition'
  | 'UrlWildcardCondition'
  | 'UrlRegexCondition'
  | 'KeywordCondition'
  | 'WeekdayCondition'
  | 'TimeCondition'
  | 'BypassCondition'
  | 'FalseCondition'
  | 'TrueCondition';

interface BaseCondition {
  readonly conditionType: ConditionType;
}

export interface HostWildcardCondition extends BaseCondition {
  readonly conditionType: 'HostWildcardCondition';
  readonly pattern: string;
}

export interface HostRegexCondition extends BaseCondition {
  readonly conditionType: 'HostRegexCondition';
  readonly pattern: string;
}

export interface HostLevelsCondition extends BaseCondition {
  readonly conditionType: 'HostLevelsCondition';
  readonly minValue: number;
  readonly maxValue: number;
}

export interface IpCondition extends BaseCondition {
  readonly conditionType: 'IpCondition';
  readonly ip: string;
  readonly prefixLength: number;
}

export interface UrlWildcardCondition extends BaseCondition {
  readonly conditionType: 'UrlWildcardCondition';
  readonly pattern: string;
}

export interface UrlRegexCondition extends BaseCondition {
  readonly conditionType: 'UrlRegexCondition';
  readonly pattern: string;
}

export interface KeywordCondition extends BaseCondition {
  readonly conditionType: 'KeywordCondition';
  readonly pattern: string;
}

export interface WeekdayCondition extends BaseCondition {
  readonly conditionType: 'WeekdayCondition';
  readonly days?: string;
  readonly startDay?: number;
  readonly endDay?: number;
}

export interface TimeCondition extends BaseCondition {
  readonly conditionType: 'TimeCondition';
  readonly startHour: number;
  readonly startMinute: number;
  readonly endHour: number;
  readonly endMinute: number;
}

export interface BypassCondition extends BaseCondition {
  readonly conditionType: 'BypassCondition';
  readonly pattern: string;
}

export interface FalseCondition extends BaseCondition {
  readonly conditionType: 'FalseCondition';
}

export interface TrueCondition extends BaseCondition {
  readonly conditionType: 'TrueCondition';
}

/** Union type of all conditions */
export type Condition =
  | HostWildcardCondition
  | HostRegexCondition
  | HostLevelsCondition
  | IpCondition
  | UrlWildcardCondition
  | UrlRegexCondition
  | KeywordCondition
  | WeekdayCondition
  | TimeCondition
  | BypassCondition
  | FalseCondition
  | TrueCondition;

// ============================================================================
// Switch Rules
// ============================================================================

export interface SwitchRule {
  readonly condition: Condition;
  readonly profileName: string;
  readonly note?: string;
  readonly isTempRule?: boolean;
}

// ============================================================================
// Options Structure
// ============================================================================

/** Profile key prefix */
export type ProfileKey = `+${string}`;

/** Setting key prefix */
export type SettingKey = `-${string}`;

/** Core options structure with branded keys */
export interface OmegaOptions {
  /** Schema version */
  readonly schemaVersion: number;

  /** Startup profile name */
  readonly '-startupProfileName'?: string;

  /** Quick switch profiles */
  readonly '-quickSwitchProfiles'?: readonly string[];

  /** Download interval in minutes */
  readonly '-downloadInterval'?: number;

  /** Confirm deletion flag */
  readonly '-confirmDeletion'?: boolean;

  /** Refresh on profile change */
  readonly '-refreshOnProfileChange'?: boolean;

  /** Show condition types */
  readonly '-showConditionTypes'?: number;

  /** Export legacy rule list */
  readonly '-exportLegacyRuleList'?: boolean;

  /** Profiles indexed by key (+profileName) */
  readonly [key: ProfileKey]: Profile;

  /** Settings indexed by key (-settingName) */
  readonly [key: SettingKey]: any;

  /** Allow additional string keys for flexibility */
  readonly [key: string]: any;
}

// ============================================================================
// Storage Types
// ============================================================================

export type StorageArea = 'local' | 'sync' | 'managed';

export interface StorageChanges {
  readonly [key: string]: {
    readonly oldValue?: any;
    readonly newValue?: any;
  };
}

export type StorageChangeCallback = (changes: StorageChanges, area: StorageArea) => void;

// ============================================================================
// State Types
// ============================================================================

export interface OmegaState {
  readonly currentProfileName?: string;
  readonly isSystemProfile?: boolean;
  readonly currentProfileCanAddRule?: boolean;
  readonly availableProfiles?: Record<string, Profile>;
  readonly validResultProfiles?: readonly string[];
  readonly refreshOnProfileChange?: boolean;
  readonly externalProfile?: Profile;
  readonly proxyNotControllable?: boolean;
  readonly lastProfileNameForCondition?: string;
  readonly syncOptions?: 'enabled' | 'disabled' | 'conflict';
  readonly firstRun?: string;
  readonly [key: string]: any;
}

// ============================================================================
// Sync Types
// ============================================================================

export interface SyncMetadata {
  readonly type: 'created' | 'modified' | 'deleted';
  readonly timestamp: number;
  readonly revision?: string;
}

export interface SyncPushRequest {
  readonly options: Partial<OmegaOptions>;
  readonly metadata: Record<string, SyncMetadata>;
}

// ============================================================================
// Proxy Implementation Types
// ============================================================================

export interface ProxyImplFeatures {
  readonly fullUrl?: boolean;
  readonly fullUrlHttp?: boolean;
  readonly socks5Auth?: boolean;
  readonly pacScript?: boolean;
  readonly watchProxyChange?: boolean;
}

export interface ApplyProfileOptions {
  readonly proxy?: boolean;
  readonly update?: boolean;
  readonly system?: boolean;
  readonly reason?: string;
}

// ============================================================================
// Error Types
// ============================================================================

export interface NetworkErrorDetails {
  readonly statusCode?: number;
  readonly message: string;
  readonly original?: Error;
}

// ============================================================================
// Update/Download Types
// ============================================================================

export interface ProfileUpdateResult {
  readonly [profileName: string]: Error | Profile;
}

export interface UpdateProfileOptions {
  readonly bypassCache?: boolean;
  readonly contentType?: readonly string[];
}

// ============================================================================
// Type Guards for Runtime Type Checking
// ============================================================================

export function isProfile(value: unknown): value is Profile {
  return typeof value === 'object' && value !== null && 'profileType' in value && 'name' in value;
}

export function isFixedProfile(profile: Profile): profile is FixedProfile {
  return profile.profileType === 'FixedProfile';
}

export function isPacProfile(profile: Profile): profile is PacProfile {
  return profile.profileType === 'PacProfile';
}

export function isSwitchProfile(profile: Profile): profile is SwitchProfile {
  return profile.profileType === 'SwitchProfile';
}

export function isRuleListProfile(profile: Profile): profile is RuleListProfile {
  return profile.profileType === 'RuleListProfile';
}

export function isVirtualProfile(profile: Profile): profile is VirtualProfile {
  return profile.profileType === 'VirtualProfile';
}

/** Check if a profile can have rules added to it */
export function canAddRules(profile: Profile): profile is SwitchProfile {
  return profile.profileType === 'SwitchProfile';
}

/** Check if a profile can be used as a fallback */
export function isIncludable(profile: Profile): boolean {
  return profile.profileType !== 'SystemProfile' && profile.profileType !== 'DirectProfile';
}

// ============================================================================
// Utility Types
// ============================================================================

/** Make all properties mutable (opposite of Readonly) */
export type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

/** Deep partial type */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/** Extract profile by type */
export type ProfileOfType<T extends ProfileType> = Extract<Profile, { profileType: T }>;

// ============================================================================
// Options Operation Types
// ============================================================================

/** Options for applying a profile */
export interface ApplyProfileOptions {
  readonly proxy?: boolean;
  readonly update?: boolean;
  readonly system?: boolean;
  readonly reason?: string;
}
