/** @module omega-target-chromium-extension/upgrade */

import * as OmegaTarget from 'omega-target';
const OmegaPac = OmegaTarget.OmegaPac;

interface I18nMessages {
  upgrade_profile_auto: string;
}

interface OldConfig {
  confirmDeletion?: boolean;
  refreshTab?: boolean;
  quickSwitch?: boolean;
  preventProxyChanges?: boolean;
  ruleListReload?: string;
  ruleListAutoProxy?: boolean;
  ruleListUrl?: string;
  startupProfileId?: string;
  ruleListProfileId?: string;
  ruleListEnabled?: boolean;
}

interface OldProfile {
  id?: string;
  name?: string;
  proxyMode?: string;
  proxyConfigUrl?: string;
  useSameProxy?: boolean;
  proxySocks?: string;
  socksVersion?: number;
  proxyHttp?: string;
  proxyHttps?: string;
  proxyFtp?: string;
  proxyExceptions?: string;
  color?: string;
}

interface OldRule {
  patternType?: string;
  urlPattern?: string;
  profileId?: string;
  name?: string;
}

interface OldDefaultRule {
  profileId?: string;
}

const upgrade = (oldOptions: Record<string, any>, i18n: I18nMessages): Record<string, any> | undefined => {
  let config: OldConfig | null = null;
  
  try {
    config = JSON.parse(oldOptions['config']);
  } catch (e) {
    config = null;
  }
  
  if (!config) return undefined;
  
  const options: Record<string, any> = {};
  options['schemaVersion'] = 2;
  
  const boolItems: Record<string, string> = {
    '-confirmDeletion': 'confirmDeletion',
    '-refreshOnProfileChange': 'refreshTab',
    '-enableQuickSwitch': 'quickSwitch',
    '-revertProxyChanges': 'preventProxyChanges'
  };
  
  for (const key in boolItems) {
    if (boolItems.hasOwnProperty(key)) {
      const oldKey = boolItems[key];
      options[key] = !!(config as any)[oldKey];
    }
  }
  
  options['-downloadInterval'] = parseInt(config['ruleListReload'] || '15') || 15;

  const auto = OmegaPac.Profiles.create({
    profileType: 'SwitchProfile',
    name: i18n.upgrade_profile_auto,
    color: '#55bb55',
    defaultProfileName: 'direct' // We will set this to rulelist.name soon.
  });
  OmegaPac.Profiles.updateRevision(auto);
  options[OmegaPac.Profiles.nameAsKey(auto.name)] = auto;

  const rulelist = OmegaPac.Profiles.create({
    profileType: 'RuleListProfile',
    name: '__ruleListOf_' + auto.name,
    color: '#dd6633',
    format: config['ruleListAutoProxy'] ? 'AutoProxy' : 'Switchy',
    defaultProfileName: 'direct',
    sourceUrl: config['ruleListUrl'] || ''
  });
  options[OmegaPac.Profiles.nameAsKey(rulelist.name)] = rulelist;

  auto.defaultProfileName = rulelist.name;

  const nameMap: Record<string, string> = { 'auto': auto.name, 'direct': 'direct' };
  let oldProfiles: Record<string, OldProfile> = {};
  
  try {
    oldProfiles = JSON.parse(oldOptions['profiles']) || {};
  } catch (e) {
    oldProfiles = {};
  }
  
  const colorTranslations: Record<string, string> = {
    'blue': '#99ccee',
    'green': '#99dd99',
    'red': '#ffaa88',
    'yellow': '#ffee99',
    'purple': '#d497ee',
    '': '#99ccee'
  };

  let seenFixedProfile = false;
  
  for (const oldProfileId in oldProfiles) {
    if (!oldProfiles.hasOwnProperty(oldProfileId)) continue;
    
    const oldProfile = oldProfiles[oldProfileId];
    let profile: any = null;
    
    switch (oldProfile['proxyMode']) {
      case 'auto':
        profile = OmegaPac.Profiles.create({
          profileType: 'PacProfile'
        });
        
        const url = oldProfile['proxyConfigUrl'] || '';
        if (url.substr(0, 5) === 'data:') {
          let text = url.substr(url.indexOf(',') + 1);
          const Buffer = require('buffer').Buffer;
          text = new Buffer(text, 'base64').toString('utf8');
          profile.pacScript = text;
        } else {
          profile.pacUrl = url;
        }
        break;
      
      case 'manual':
        seenFixedProfile = true;
        profile = OmegaPac.Profiles.create({
          profileType: 'FixedProfile'
        });
        
        if (!!oldProfile['useSameProxy']) {
          profile.fallbackProxy = OmegaPac.Profiles.parseHostPort(
            oldProfile['proxyHttp'],
            'http'
          );
        } else if (oldProfile['proxySocks']) {
          const protocol = oldProfile['socksVersion'] === 5 ? 'socks5' : 'socks4';
          profile.fallbackProxy = OmegaPac.Profiles.parseHostPort(
            oldProfile['proxySocks'],
            protocol
          );
        } else {
          profile.proxyForHttp = OmegaPac.Profiles.parseHostPort(
            oldProfile['proxyHttp'],
            'http'
          );
          profile.proxyForHttps = OmegaPac.Profiles.parseHostPort(
            oldProfile['proxyHttps'],
            'http'
          );
          profile.proxyForFtp = OmegaPac.Profiles.parseHostPort(
            oldProfile['proxyFtp'],
            'http'
          );
        }
        
        if (oldProfile['proxyExceptions'] != null) {
          let hasLocalPattern = false;
          profile.bypassList = [];
          
          oldProfile['proxyExceptions'].split(';').forEach((line) => {
            line = line.trim();
            if (!line) return;
            if (line === '<local>') hasLocalPattern = true;
            profile.bypassList.push({
              conditionType: 'BypassCondition',
              pattern: line
            });
          });
          
          if (hasLocalPattern) {
            profile.bypassList = profile.bypassList.filter((cond: any) => 
              OmegaPac.Conditions.localHosts.indexOf(cond.pattern) < 0
            );
          }
        }
        break;
    }
    
    if (profile) {
      const color = oldProfile['color'];
      profile.color = colorTranslations[color || ''] || colorTranslations[''];
      
      let name = oldProfile['name'] || oldProfile['id'] || '';
      name = name.trim();
      if (name[0] === '_') {
        name = 'p' + name;
      }
      profile.name = name;
      
      let num = 1;
      while (OmegaPac.Profiles.byName(profile.name, options)) {
        profile.name = name + num;
        num++;
      }
      
      nameMap[oldProfile['id'] || ''] = profile.name;
      OmegaPac.Profiles.updateRevision(profile);
      options[OmegaPac.Profiles.nameAsKey(profile.name)] = profile;
    }
  }

  if (!seenFixedProfile) {
    const exampleFixedProfileName = 'Example Profile';
    options[OmegaPac.Profiles.nameAsKey(exampleFixedProfileName)] = {
      bypassList: [
        {
          pattern: "127.0.0.1",
          conditionType: "BypassCondition"
        },
        {
          pattern: "::1",
          conditionType: "BypassCondition"
        },
        {
          pattern: "localhost",
          conditionType: "BypassCondition"
        }
      ],
      profileType: "FixedProfile",
      name: exampleFixedProfileName,
      color: "#99ccee",
      fallbackProxy: {
        port: 8080,
        scheme: "http",
        host: "proxy.example.com"
      }
    };
  }

  const startupId = config['startupProfileId'];
  options['-startupProfileName'] = nameMap[startupId || ''] || '';

  let quickSwitch: string[] | null = null;
  try {
    quickSwitch = JSON.parse(oldOptions['quickSwitchProfiles']);
  } catch (e) {
    quickSwitch = null;
  }
  
  options['-quickSwitchProfiles'] = quickSwitch == null ? [] :
    quickSwitch.map((p) => nameMap[p]);

  if (config['ruleListProfileId']) {
    rulelist.matchProfileName = nameMap[config['ruleListProfileId']] || 'direct';
  }

  let defaultRule: OldDefaultRule | null = null;
  try {
    defaultRule = JSON.parse(oldOptions['defaultRule']);
  } catch (e) {
    defaultRule = null;
  }
  
  if (defaultRule) {
    rulelist.defaultProfileName = nameMap[defaultRule.profileId || ''] || 'direct';
    if (!config.ruleListEnabled) {
      auto.defaultProfileName = rulelist.defaultProfileName;
    }
  }
  OmegaPac.Profiles.updateRevision(rulelist);

  let rules: Record<string, OldRule> | null = null;
  try {
    rules = JSON.parse(oldOptions['rules']);
  } catch (e) {
    rules = null;
  }
  
  if (rules) {
    const conditionFromRule = (rule: OldRule): any => {
      switch (rule['patternType']) {
        case 'wildcard':
          const pattern = rule['urlPattern'] || '';
          return OmegaPac.RuleList['Switchy'].conditionFromLegacyWildcard(pattern);
        default:
          return {
            conditionType: 'UrlRegexCondition',
            pattern: rule['urlPattern'] || ''
          };
      }
    };
    
    auto.rules = [];
    for (const ruleId in rules) {
      if (rules.hasOwnProperty(ruleId)) {
        const rule = rules[ruleId];
        auto.rules.push({
          profileName: nameMap[rule['profileId'] || ''] || 'direct',
          condition: conditionFromRule(rule),
          note: rule.name
        });
      }
    }
  }
  
  return options;
};

export default upgrade;

