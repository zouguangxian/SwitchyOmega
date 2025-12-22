/** @module omega-web/popup */

declare const angular: any;
declare const jQuery: any;

const module = angular.module('omegaPopup', [
  'omegaTarget',
  'omegaDecoration',
  'ui.bootstrap',
  'ui.validate',
]);

module.filter('tr', ['omegaTarget', (omegaTarget: any) => omegaTarget.getMessage]);
module.filter('dispName', [
  'omegaTarget',
  (omegaTarget: any) => {
    return (name: any) => {
      if (typeof name === 'object') {
        name = name.name;
      }
      return omegaTarget.getMessage('profile_' + name) || name;
    };
  },
]);

const moveUp = (activeIndex: number, items: any) => {
  const i = activeIndex - 1;
  if (i >= 0) {
    items.eq(i)[0]?.focus();
  }
};
const moveDown = (activeIndex: number, items: any) => items.eq(activeIndex + 1)[0]?.focus();

const shortcutKeys: Record<number, string | number | ((i: number, items: any) => void)> = {
  38: moveUp, // Up
  40: moveDown, // Down
  74: moveDown, // j
  75: moveUp, // k
  48: '+direct', // 0
  83: '+system', // s
  191: 'help', // /
  63: 'help', // ?
  69: 'external', // e
  65: 'addRule', // a
  43: 'addRule', // +
  61: 'addRule', // =
  84: 'tempRule', // t
  79: 'option', // o
  82: 'requestInfo', // r
};

for (let i = 1; i <= 9; i++) {
  shortcutKeys[48 + i] = i;
}

const customProfiles = (() => {
  let _customProfiles: any = null;
  return () => {
    if (!_customProfiles) {
      _customProfiles = jQuery('.custom-profile:not(.ng-hide) > a');
    }
    return _customProfiles;
  };
})();

jQuery(document).on('keydown', (e: any) => {
  const handler = shortcutKeys[e.keyCode];
  if (!handler) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  switch (typeof handler) {
    case 'string':
      switch (handler) {
        case 'help': {
          const showHelp = (element: any, key: string) => {
            if (typeof element === 'string') {
              element = jQuery(`a[data-shortcut='${element}']`);
            }
            let span = jQuery('.shortcut-help', element);
            if (span.length === 0) {
              span = jQuery('<span/>').addClass('shortcut-help');
            }
            span.text(key);
            element.find('.glyphicon').after(span);
          };
          const keys: Record<string, string> = {
            '+direct': '0',
            '+system': 'S',
            external: 'E',
            addRule: 'A',
            tempRule: 'T',
            option: 'O',
            requestInfo: 'R',
          };
          for (const shortcut in keys) {
            if (keys.hasOwnProperty(shortcut)) {
              showHelp(shortcut, keys[shortcut]);
            }
          }
          customProfiles().each((i: number, el: any) => {
            if (i <= 8) {
              showHelp(jQuery(el), (i + 1).toString());
            }
          });
          break;
        }
        default:
          jQuery(`a[data-shortcut='${handler}']`)[0]?.click();
      }
      break;
    case 'number':
      customProfiles()
        .eq(handler - 1)
        ?.click();
      break;
    case 'function': {
      const items = jQuery('.popup-menu-nav > li:not(.ng-hide) > a');
      let i = items.index(jQuery(e.target).closest('a'));
      if (i === -1) {
        i = items.index(jQuery('.popup-menu-nav > li.active > a'));
      }
      handler(i, items);
      break;
    }
  }

  return false;
});

module.controller('PopupCtrl', [
  '$scope',
  '$window',
  '$q',
  'omegaTarget',
  'profileIcons',
  'profileOrder',
  'dispNameFilter',
  'getVirtualTarget',
  function (
    $scope: any,
    $window: any,
    $q: any,
    omegaTarget: any,
    profileIcons: any,
    profileOrder: any,
    dispNameFilter: any,
    getVirtualTarget: any,
  ) {
    $scope.closePopup = () => {
      $window.close();
    };

    $scope.openManage = () => {
      omegaTarget.openManage();
      $window.close();
    };

    let refreshOnProfileChange = false;
    const refresh = () => {
      if (refreshOnProfileChange) {
        omegaTarget.refreshActivePage().then(() => {
          $window.close();
        });
      } else {
        $window.close();
      }
    };

    $scope.profileIcons = profileIcons;
    $scope.dispNameFilter = dispNameFilter;

    $scope.isActive = (profileName: string) => {
      if ($scope.isSystemProfile) {
        return profileName === 'system';
      } else {
        return $scope.currentProfileName === profileName;
      }
    };

    $scope.isEffective = (profileName: string) => {
      return $scope.isSystemProfile && $scope.currentProfileName === profileName;
    };

    $scope.getIcon = (profile: any, normal: boolean) => {
      if (!profile) return;
      if (!normal && $scope.isEffective(profile.name)) {
        return 'glyphicon-ok';
      } else {
        return undefined;
      }
    };

    $scope.getProfileTitle = (profile: any, normal: boolean) => {
      let desc = '';
      while (profile) {
        desc = profile.desc;
        profile = getVirtualTarget(profile, $scope.availableProfiles);
      }
      return desc || profile?.name || '';
    };

    $scope.openOptions = (hash?: string) => {
      omegaTarget.openOptions(hash).then(() => {
        $window.close();
      });
    };

    $scope.openConditionHelp = () => {
      const pname = encodeURIComponent($scope.currentProfileName);
      $scope.openOptions(`#/profile/${pname}?help=condition`);
    };

    $scope.applyProfile = (profile: any) => {
      const next = () => {
        if (profile.profileType === 'SwitchProfile') {
          return omegaTarget.state('web.switchGuide').then((switchGuide: string) => {
            if (switchGuide === 'showOnFirstUse') {
              return $scope.openOptions(`#/profile/${profile.name}`);
            }
          });
        }
      };

      let apply: any;
      if (!refreshOnProfileChange) {
        omegaTarget.applyProfileNoReply(profile.name);
        apply = next();
      } else {
        apply = omegaTarget
          .applyProfile(profile.name)
          .then(() => {
            return omegaTarget.refreshActivePage();
          })
          .then(next);
      }

      if (apply) {
        apply.then(() => $window.close());
      } else {
        $window.close();
      }
    };

    $scope.tempRuleMenu = { open: false };
    $scope.nameExternal = { open: false };

    $scope.addTempRule = (domain: string, profileName: string) => {
      $scope.tempRuleMenu.open = false;
      omegaTarget.addTempRule(domain, profileName).then(() => {
        omegaTarget.state('lastProfileNameForCondition', profileName);
        refresh();
      });
    };

    $scope.setDefaultProfile = (profileName: string, defaultProfileName: string) => {
      omegaTarget.setDefaultProfile(profileName, defaultProfileName).then(() => {
        refresh();
      });
    };

    $scope.addCondition = (condition: any, profileName: string) => {
      omegaTarget.addCondition(condition, profileName).then(() => {
        omegaTarget.state('lastProfileNameForCondition', profileName);
        refresh();
      });
    };

    $scope.addConditionForDomains = (domains: Record<string, boolean>, profileName: string) => {
      const conditions: any[] = [];
      for (const domain in domains) {
        if (domains.hasOwnProperty(domain) && domains[domain]) {
          conditions.push({
            conditionType: 'HostWildcardCondition',
            pattern: domain,
          });
        }
      }
      omegaTarget.addCondition(conditions, profileName).then(() => {
        omegaTarget.state('lastProfileNameForCondition', profileName);
        refresh();
      });
    };

    $scope.validateProfileName = {
      conflict: '!$value || !availableProfiles["+" + $value]',
      hidden: '!$value || $value[0] != "_"',
    };

    $scope.saveExternal = () => {
      $scope.nameExternal.open = false;
      const name = $scope.externalProfile.name;
      if (name) {
        omegaTarget.addProfile($scope.externalProfile).then(() => {
          omegaTarget.applyProfile(name).then(() => {
            refresh();
          });
        });
      }
    };

    $scope.returnToMenu = () => {
      if (location.hash.indexOf('!') >= 0) {
        location.href = 'popup/index.html';
        return;
      }
      $scope.showConditionForm = false;
      $scope.showRequestInfo = false;
    };

    let preselectedProfileNameForCondition = 'direct';

    if ($window.location.hash === '#!requestInfo') {
      $scope.showRequestInfo = true;
    } else if ($window.location.hash === '#!external') {
      $scope.nameExternal = { open: true };
    }

    omegaTarget
      .state([
        'availableProfiles',
        'currentProfileName',
        'isSystemProfile',
        'validResultProfiles',
        'refreshOnProfileChange',
        'externalProfile',
        'proxyNotControllable',
        'lastProfileNameForCondition',
      ])
      .then((values: any[]) => {
        const [
          availableProfiles,
          currentProfileName,
          isSystemProfile,
          validResultProfiles,
          refresh,
          externalProfile,
          proxyNotControllable,
          lastProfileNameForCondition,
        ] = values;

        $scope.proxyNotControllable = proxyNotControllable;
        if (proxyNotControllable) return;

        $scope.availableProfiles = availableProfiles;
        $scope.currentProfile = availableProfiles['+' + currentProfileName];
        $scope.currentProfileName = currentProfileName;
        $scope.isSystemProfile = isSystemProfile;
        $scope.externalProfile = externalProfile;
        refreshOnProfileChange = refresh;

        const charCodeUnderscore = '_'.charCodeAt(0);
        const profilesByNames = (names: string[]) => {
          const profiles: any[] = [];
          for (const name of names) {
            const shown =
              name.charCodeAt(0) !== charCodeUnderscore ||
              name.charCodeAt(1) !== charCodeUnderscore;
            if (shown) {
              profiles.push(availableProfiles['+' + name]);
            }
          }
          return profiles;
        };

        $scope.validResultProfiles = profilesByNames(validResultProfiles);

        if (lastProfileNameForCondition) {
          for (const profile of $scope.validResultProfiles) {
            if (profile.name === lastProfileNameForCondition) {
              preselectedProfileNameForCondition = lastProfileNameForCondition;
              break;
            }
          }
        }

        $scope.builtinProfiles = [];
        $scope.customProfiles = [];
        for (const key in availableProfiles) {
          if (availableProfiles.hasOwnProperty(key)) {
            const profile = availableProfiles[key];
            if (profile.builtin) {
              $scope.builtinProfiles.push(profile);
            } else if (profile.name.charCodeAt(0) !== charCodeUnderscore) {
              $scope.customProfiles.push(profile);
            }
            if (profile.validResultProfiles) {
              profile.validResultProfiles = profilesByNames(profile.validResultProfiles);
            }
          }
        }

        $scope.customProfiles.sort(profileOrder);
      });

    $scope.domainsForCondition = {};
    $scope.requestInfoProvided = null;

    omegaTarget.setRequestInfoCallback((info: any) => {
      info.domains = [];
      for (const domain in info.summary) {
        if (info.summary.hasOwnProperty(domain)) {
          const domainInfo = info.summary[domain];
          domainInfo.domain = domain;
          info.domains.push(domainInfo);
        }
      }
      info.domains.sort((a: any, b: any) => b.errorCount - a.errorCount);
      $scope.$apply(() => {
        $scope.requestInfo = info;
        $scope.requestInfoProvided = $scope.requestInfoProvided ?? info?.domains.length > 0;
        for (const domain of info.domains) {
          $scope.domainsForCondition[domain.domain] =
            $scope.domainsForCondition[domain.domain] ?? true;
        }
        $scope.profileForDomains = $scope.profileForDomains ?? preselectedProfileNameForCondition;
      });
    });

    $q.all([omegaTarget.state('currentProfileCanAddRule'), omegaTarget.getActivePageInfo()]).then(
      (values: any[]) => {
        const [canAddRule, info] = values;
        $scope.currentProfileCanAddRule = canAddRule;
        if (info) {
          $scope.currentTempRuleProfile = info.tempRuleProfileName;
          if ($scope.currentTempRuleProfile) {
            preselectedProfileNameForCondition = $scope.currentTempRuleProfile;
          }
          $scope.currentDomain = info.domain;
          if ($window.location.hash === '#!addRule') {
            $scope.prepareConditionForm();
          }
        }
      },
    );

    $scope.prepareConditionForm = () => {
      let currentDomain = $scope.currentDomain;
      let currentDomainEscaped = currentDomain.replace(/\./g, '\\.');
      let domainLooksLikeIp = false;

      if (currentDomain.indexOf(':') >= 0) {
        domainLooksLikeIp = true;
        if (currentDomain[0] !== '[') {
          currentDomain = '[' + currentDomain + ']';
          currentDomainEscaped = currentDomain
            .replace(/\./g, '\\.')
            .replace(/\[/g, '\\[')
            .replace(/\]/g, '\\]');
        }
      } else if (currentDomain[currentDomain.length - 1] >= 0) {
        domainLooksLikeIp = true;
      }

      let conditionSuggestion: Record<string, string>;
      if (domainLooksLikeIp) {
        conditionSuggestion = {
          HostWildcardCondition: currentDomain,
          HostRegexCondition: '^' + currentDomainEscaped + '$',
          UrlWildcardCondition: '*://' + currentDomain + '/*',
          UrlRegexCondition: '://' + currentDomainEscaped + '(:\\d+)?/',
          KeywordCondition: currentDomain,
        };
      } else {
        conditionSuggestion = {
          HostWildcardCondition: '*.' + currentDomain,
          HostRegexCondition: '(^|\\.)' + currentDomainEscaped + '$',
          UrlWildcardCondition: '*://*.' + currentDomain + '/*',
          UrlRegexCondition: '://([^/.]+\\.)*' + currentDomainEscaped + '(:\\d+)?/',
          KeywordCondition: currentDomain,
        };
      }

      $scope.rule = {
        condition: {
          conditionType: 'HostWildcardCondition',
          pattern: conditionSuggestion['HostWildcardCondition'],
        },
        profileName: preselectedProfileNameForCondition,
      };

      $scope.$watch('rule.condition.conditionType', (type: string) => {
        $scope.rule.condition.pattern = conditionSuggestion[type];
      });

      $scope.showConditionForm = true;
    };
  },
]);
