/** @module omega-web/controllers/quick_switch */

declare const angular: any;

angular.module('omega').controller('QuickSwitchCtrl', [
  '$scope',
  '$filter',
  function ($scope: any, $filter: any) {
    $scope.sortableOptions = {
      tolerance: 'pointer',
      axis: 'y',
      forceHelperSize: true,
      forcePlaceholderSize: true,
      connectWith: '.cycle-profile-container',
      containment: '#quick-switch-settings',
    };

    $scope.$watchCollection('options', (options: any) => {
      if (!options) return;
      $scope.notCycledProfiles = [];
      for (const profile of $filter('profiles')(options, 'all')) {
        if (options['-quickSwitchProfiles'].indexOf(profile.name) < 0) {
          $scope.notCycledProfiles.push(profile.name);
        }
      }
    });
  },
]);
