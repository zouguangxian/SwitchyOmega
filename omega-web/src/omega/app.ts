/** @module omega-web/app */

import './directives';
import './filters';
import './controllers/about';
import './controllers/fixed_profile';
import './controllers/io';
import './controllers/master';
import './controllers/pac_profile';
import './controllers/profile';
import './controllers/quick_switch';
import './controllers/rule_list_profile';
import './controllers/switch_profile';

declare const angular: any;
declare const OmegaPac: any;
declare const browser: any;
declare const saveAs: any;

angular.module('omega').constant('builtinProfiles', OmegaPac.Profiles.builtinProfiles);

const profileColors = [
  '#9ce', '#9d9', '#fa8', '#fe9', '#d497ee', '#47b', '#5b5', '#d63', '#ca0'
];
const colors = [].concat(profileColors);
const profileColorPalette: string[][] = [];
while (colors.length) {
  profileColorPalette.push(colors.splice(0, 3));
}

angular.module('omega').constant('profileColors', profileColors);
angular.module('omega').constant('profileColorPalette', profileColorPalette);

const attachedPrefix = '__ruleListOf_';
angular.module('omega').constant('getAttachedName', (name: string) => {
  return attachedPrefix + name;
});
angular.module('omega').constant('getParentName', (name: string) => {
  if (name.indexOf(attachedPrefix) === 0) {
    return name.substr(attachedPrefix.length);
  } else {
    return undefined;
  }
});

const charCodeUnderscore = '_'.charCodeAt(0);
angular.module('omega').constant('charCodeUnderscore', charCodeUnderscore);
angular.module('omega').constant('isProfileNameHidden', (name: string) => {
  // Hide profiles beginning with underscore.
  return name.charCodeAt(0) === charCodeUnderscore;
});
angular.module('omega').constant('isProfileNameReserved', (name: string) => {
  // Reserve profile names beginning with double-underscore.
  return (name.charCodeAt(0) === charCodeUnderscore &&
    name.charCodeAt(1) === charCodeUnderscore);
});

angular.module('omega').config([
  '$stateProvider', '$urlRouterProvider', '$httpProvider', '$animateProvider', '$compileProvider',
  function($stateProvider: any, $urlRouterProvider: any, $httpProvider: any, $animateProvider: any, $compileProvider: any) {
    $compileProvider.aHrefSanitizationWhitelist(
      /^\s*(https?|ftp|mailto|chrome-extension|moz-extension):/);
    $compileProvider.imgSrcSanitizationWhitelist(
      /^\s*(https?|local|data|chrome-extension|moz-extension):/);
    $animateProvider.classNameFilter(/angular-animate/);

    $urlRouterProvider.otherwise('/about');
    
    $urlRouterProvider.otherwise(($injector: any, $location: any) => {
      if ($location.path() === '') {
        return $injector.get('omegaTarget').lastUrl() || '/about';
      } else {
        return '/about';
      }
    });
    
    $stateProvider
      .state('ui', {
        url: '/ui',
        templateUrl: 'partials/ui.html'
      })
      .state('general', {
        url: '/general',
        templateUrl: 'partials/general.html'
      })
      .state('io', {
        url: '/io',
        templateUrl: 'partials/io.html',
        controller: 'IoCtrl'
      })
      .state('profile', {
        url: '/profile/*name',
        templateUrl: 'partials/profile.html',
        controller: 'ProfileCtrl'
      })
      .state('about', {
        url: '/about',
        templateUrl: 'partials/about.html',
        controller: 'AboutCtrl'
      });
  }
]);

angular.module('omega').factory('$exceptionHandler', ['$log', function($log: any) {
  return (exception: any, cause?: any) => {
    if (exception.message === 'transition aborted') return;
    if (exception.message === 'transition superseded') return;
    if (exception.message === 'transition prevented') return;
    if (exception.message === 'transition failed') return;
    $log.error(exception, cause);
  };
}]);

angular.module('omega').factory('omegaDebug', ['$window', '$rootScope', '$injector',
  function($window: any, $rootScope: any, $injector: any) {
    const omegaDebug = $window.OmegaDebug || {};

    if (!omegaDebug.downloadLog) {
      omegaDebug.downloadLog = () => {
        const downloadFile = $injector.get('downloadFile') || saveAs;
        const blob = new Blob([localStorage['log']], { type: "text/plain;charset=utf-8" });
        downloadFile(blob, `OmegaLog_${Date.now()}.txt`);
      };
    }

    if (!omegaDebug.reportIssue) {
      omegaDebug.reportIssue = () => {
        $window.open('https://github.com/FelisCatus/SwitchyOmega/issues/new?title=&body=');
      };
    }

    if (!omegaDebug.resetOptions) {
      omegaDebug.resetOptions = () => {
        $rootScope.resetOptions();
      };
    }

    return omegaDebug;
  }
]);

angular.module('omega').factory('downloadFile', () => {
  if (browser?.downloads?.download) {
    return (blob: Blob, filename?: string) => {
      const url = URL.createObjectURL(blob);
      if (filename) {
        browser.downloads.download({ url, filename });
      } else {
        browser.downloads.download({ url });
      }
    };
  } else {
    return (blob: Blob, filename: string) => {
      const noAutoBom = true;
      saveAs(blob, filename, noAutoBom);
    };
  }
});

