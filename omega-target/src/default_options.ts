interface BypassCondition {
  pattern: string;
  conditionType: 'BypassCondition';
}

interface HostWildcardCondition {
  pattern: string;
  conditionType: 'HostWildcardCondition';
}

interface FallbackProxy {
  port: number;
  scheme: string;
  host: string;
}

interface FixedProfile {
  bypassList: BypassCondition[];
  profileType: 'FixedProfile';
  name: string;
  color: string;
  fallbackProxy: FallbackProxy;
}

interface SwitchRule {
  condition: HostWildcardCondition;
  profileName: string;
}

interface SwitchProfile {
  profileType: 'SwitchProfile';
  rules: SwitchRule[];
  name: string;
  color: string;
  defaultProfileName: string;
}

interface DefaultOptions {
  schemaVersion: number;
  '-enableQuickSwitch': boolean;
  '-refreshOnProfileChange': boolean;
  '-startupProfileName': string;
  '-quickSwitchProfiles': string[];
  '-revertProxyChanges': boolean;
  '-confirmDeletion': boolean;
  '-showInspectMenu': boolean;
  '-addConditionsToBottom': boolean;
  '-showExternalProfile': boolean;
  '-downloadInterval': number;
  '+proxy': FixedProfile;
  '+auto switch': SwitchProfile;
}

export default function defaultOptions(): DefaultOptions {
  return {
    schemaVersion: 2,
    '-enableQuickSwitch': false,
    '-refreshOnProfileChange': true,
    '-startupProfileName': '',
    '-quickSwitchProfiles': [],
    '-revertProxyChanges': true,
    '-confirmDeletion': true,
    '-showInspectMenu': true,
    '-addConditionsToBottom': false,
    '-showExternalProfile': true,
    '-downloadInterval': 1440,
    '+proxy': {
      bypassList: [
        {
          pattern: '127.0.0.1',
          conditionType: 'BypassCondition'
        },
        {
          pattern: '::1',
          conditionType: 'BypassCondition'
        },
        {
          pattern: 'localhost',
          conditionType: 'BypassCondition'
        }
      ],
      profileType: 'FixedProfile',
      name: 'proxy',
      color: '#99ccee',
      fallbackProxy: {
        port: 8080,
        scheme: 'http',
        host: 'proxy.example.com'
      }
    },
    '+auto switch': {
      profileType: 'SwitchProfile',
      rules: [
        {
          condition: {
            pattern: 'internal.example.com',
            conditionType: 'HostWildcardCondition'
          },
          profileName: 'direct'
        },
        {
          condition: {
            pattern: '*.example.com',
            conditionType: 'HostWildcardCondition'
          },
          profileName: 'proxy'
        }
      ],
      name: 'auto switch',
      color: '#99dd99',
      defaultProfileName: 'direct'
    }
  };
} 