/** @module omega-web/controllers/pac_profile */

declare const angular: any;
declare const OmegaPac: any;

angular.module('omega').controller('PacProfileCtrl', ['$scope', '$uibModal',
  function($scope: any, $uibModal: any) {
    // https://github.com/angular/angular.js/blob/master/src/ng/directive/input.js#L13
    $scope.urlRegex = /^(ftp|http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?$/;
    // With the file: scheme added to the pattern:
    $scope.urlWithFile = /^(ftp|http|https|file):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?$/;
    
    $scope.isFileUrl = OmegaPac.Profiles.isFileUrl;
    $scope.pacUrlCtrl = { ctrl: null };

    const set = OmegaPac.Profiles.referencedBySet($scope.profile, $scope.options);
    $scope.referenced = Object.keys(set).length > 0;

    let oldPacUrl: string | null = null;
    let oldLastUpdate: any = null;
    let oldPacScript: any = null;
    
    const onProfileChange = (profile: any, oldProfile: any) => {
      if (!profile || !oldProfile) return;
      
      if (profile.pacUrl !== oldProfile.pacUrl) {
        if (profile.lastUpdate) {
          oldPacUrl = oldProfile.pacUrl;
          oldLastUpdate = profile.lastUpdate;
          oldPacScript = oldProfile.pacScript;
          profile.lastUpdate = null;
        } else if (oldPacUrl && profile.pacUrl === oldPacUrl) {
          profile.lastUpdate = oldLastUpdate;
          profile.pacScript = oldPacScript;
        }
      }
      $scope.pacUrlIsFile = $scope.isFileUrl(profile.pacUrl);
    };
    $scope.$watch('profile', onProfileChange, true);

    $scope.editProxyAuth = (scheme: string) => {
      const prop = 'all';
      const auth = $scope.profile.auth?.[prop];
      const scope = $scope.$new('isolate');
      scope.auth = auth && angular.copy(auth);
      
      $uibModal.open({
        templateUrl: 'partials/fixed_auth_edit.html',
        scope,
        size: 'sm'
      }).result.then((auth: any) => {
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
  }
]);

