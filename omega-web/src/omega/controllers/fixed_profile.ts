/** @module omega-web/controllers/fixed_profile */

declare const angular: any;
declare const browser: any;

angular.module('omega').controller('FixedProfileCtrl', [
  '$scope',
  '$uibModal',
  'trFilter',
  function ($scope: any, $uibModal: any, trFilter: any) {
    $scope.urlSchemes = ['', 'http', 'https', 'ftp'];
    $scope.urlSchemeDefault = 'fallbackProxy';

    const proxyProperties: Record<string, string> = {
      '': 'fallbackProxy',
      http: 'proxyForHttp',
      https: 'proxyForHttps',
      ftp: 'proxyForFtp',
    };

    $scope.schemeDisp = {
      '': null,
      http: 'http://',
      https: 'https://',
      ftp: 'ftp://',
    };

    const defaultPort: Record<string, number> = {
      http: 80,
      https: 443,
      socks4: 1080,
      socks5: 1080,
    };

    $scope.showAdvanced = false;

    $scope.optionsForScheme = {};
    for (const scheme of $scope.urlSchemes) {
      const defaultLabel = scheme
        ? trFilter('options_protocol_useDefault')
        : trFilter('options_protocol_direct');
      $scope.optionsForScheme[scheme] = [
        { label: defaultLabel, value: undefined },
        { label: 'HTTP', value: 'http' },
        { label: 'HTTPS', value: 'https' },
        { label: 'SOCKS4', value: 'socks4' },
        { label: 'SOCKS5', value: 'socks5' },
      ];
    }

    $scope.proxyEditors = {};

    const socks5AuthSupported = !!(browser as any)?.proxy?.register;
    $scope.authSupported = {
      http: true,
      https: true,
      socks5: socks5AuthSupported,
    };

    $scope.isProxyAuthActive = (scheme: string) => {
      return $scope.profile.auth?.[proxyProperties[scheme]] != null;
    };

    $scope.editProxyAuth = (scheme: string) => {
      const prop = proxyProperties[scheme];
      const proxy = $scope.profile[prop];
      const scope = $scope.$new('isolate');
      scope.proxy = proxy;
      const auth = $scope.profile.auth?.[prop];
      scope.auth = auth && angular.copy(auth);
      scope.authSupported = $scope.authSupported[proxy.scheme];
      scope.protocolDisp = proxy.scheme;

      $uibModal
        .open({
          templateUrl: 'partials/fixed_auth_edit.html',
          scope,
          size: scope.authSupported ? 'sm' : 'lg',
        })
        .result.then((auth: any) => {
          if (!auth?.username) {
            if ($scope.profile.auth) {
              $scope.profile.auth[prop] = undefined;
            }
          } else {
            $scope.profile.auth = $scope.profile.auth || {};
            $scope.profile.auth[prop] = auth;
          }
        });
    };

    const onProxyChange = (proxyEditors: any, oldProxyEditors: any) => {
      if (!proxyEditors) return;

      for (const scheme of $scope.urlSchemes) {
        const proxy = proxyEditors[scheme];
        if ($scope.profile.auth && !$scope.authSupported[proxy.scheme]) {
          delete $scope.profile.auth[proxyProperties[scheme]];
        }
        if (!proxy.scheme) {
          if (!scheme) {
            proxyEditors[scheme] = {};
          }
          delete $scope.profile[proxyProperties[scheme]];
          continue;
        } else if (!oldProxyEditors[scheme].scheme) {
          if (proxy.scheme === proxyEditors[''].scheme) {
            proxy.port = proxy.port || proxyEditors[''].port;
          }
          proxy.port = proxy.port || defaultPort[proxy.scheme];
          proxy.host = proxy.host || proxyEditors[''].host || 'example.com';
        }
        $scope.profile[proxyProperties[scheme]] = $scope.profile[proxyProperties[scheme]] || proxy;
      }
    };

    for (const scheme of $scope.urlSchemes) {
      ((scheme) => {
        $scope.$watch(
          () => $scope.profile[proxyProperties[scheme]],
          (proxy: any) => {
            if (scheme && proxy) {
              $scope.showAdvanced = true;
            }
            $scope.proxyEditors[scheme] = proxy || {};
          },
        );
      })(scheme);
    }
    $scope.$watch('proxyEditors', onProxyChange, true);

    const onBypassListChange = (list: any[]) => {
      $scope.bypassList = list.map((item: any) => item.pattern).join('\n');
    };

    $scope.$watch('profile.bypassList', onBypassListChange, true);

    $scope.$watch('bypassList', (bypassList: string, oldList: string) => {
      if (!bypassList || bypassList === oldList) return;
      $scope.profile.bypassList = [];
      for (const entry of bypassList.split(/\r?\n/)) {
        if (entry) {
          $scope.profile.bypassList.push({
            conditionType: 'BypassCondition',
            pattern: entry,
          });
        }
      }
    });
  },
]);
