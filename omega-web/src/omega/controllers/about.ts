/** @module omega-web/controllers/about */

declare const angular: any;

angular.module('omega').controller('AboutCtrl', ['$scope', '$rootScope', '$modal', 'omegaDebug',
  function($scope: any, $rootScope: any, $modal: any, omegaDebug: any) {
    $scope.downloadLog = omegaDebug.downloadLog;
    $scope.reportIssue = omegaDebug.reportIssue;

    $scope.showResetOptionsModal = () => {
      $modal.open({ templateUrl: 'partials/reset_options_confirm.html' }).result
        .then(() => omegaDebug.resetOptions());
    };

    try {
      $scope.version = omegaDebug.getProjectVersion();
    } catch (e) {
      $scope.version = '?.?.?';
    }
  }
]);

