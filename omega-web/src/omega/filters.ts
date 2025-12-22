/** @module omega-web/filters */

declare const angular: any;
declare const OmegaPac: any;

angular
  .module('omega')
  .filter('profiles', [
    'builtinProfiles',
    'profileOrder',
    'isProfileNameHidden',
    'isProfileNameReserved',
    function (
      builtinProfiles: any,
      profileOrder: any,
      isProfileNameHidden: any,
      isProfileNameReserved: any,
    ) {
      const charCodePlus = '+'.charCodeAt(0);
      const builtinProfileList: any[] = [];
      for (const key in builtinProfiles) {
        if (builtinProfiles.hasOwnProperty(key)) {
          builtinProfileList.push(builtinProfiles[key]);
        }
      }

      return (options: any, filter: any): any[] => {
        let result: any[] = [];
        for (const name in options) {
          if (options.hasOwnProperty(name) && name.charCodeAt(0) === charCodePlus) {
            result.push(options[name]);
          }
        }

        if (
          typeof filter === 'object' ||
          (typeof filter === 'string' && filter.charCodeAt(0) === charCodePlus)
        ) {
          if (typeof filter === 'string') {
            filter = filter.substr(1);
          }
          result = OmegaPac.Profiles.validResultProfilesFor(filter, options);
        }

        if (filter === 'all') {
          result = result.filter((profile: any) => !isProfileNameHidden(profile.name));
          result = result.concat(builtinProfileList);
        } else {
          result = result.filter((profile: any) => !isProfileNameReserved(profile.name));
        }

        if (filter === 'sorted') {
          result.sort(profileOrder);
        }

        return result;
      };
    },
  ])
  .filter('tr', [
    'omegaTarget',
    function (omegaTarget: any) {
      return omegaTarget.getMessage;
    },
  ])
  .filter('dispName', [
    'omegaTarget',
    function (omegaTarget: any) {
      return (name: any): string => {
        if (typeof name === 'object') {
          name = name.name;
        }
        return omegaTarget.getMessage('profile_' + name) || name;
      };
    },
  ]);
