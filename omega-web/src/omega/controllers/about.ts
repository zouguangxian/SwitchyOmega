/** @module omega-web/controllers/about */

declare const angular: any;

angular.module('omega').controller('AboutCtrl', [
  '$scope',
  '$rootScope',
  '$uibModal',
  'omegaDebug',
  function ($scope: any, $rootScope: any, $uibModal: any, omegaDebug: any) {
    $scope.downloadLog = omegaDebug.downloadLog;
    $scope.reportIssue = omegaDebug.reportIssue;

    $scope.showResetOptionsModal = () => {
      $uibModal
        .open({ templateUrl: 'partials/reset_options_confirm.html' })
        .result.then(() => omegaDebug.resetOptions());
    };

    try {
      $scope.version = omegaDebug.getProjectVersion();
    } catch (e) {
      $scope.version = '?.?.?';
    }
  },
]);
