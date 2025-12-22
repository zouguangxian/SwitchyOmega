/** @module omega-web/controllers/rule_list_profile */

declare const angular: any;
declare const OmegaPac: any;

angular.module('omega').controller('RuleListProfileCtrl', [
  '$scope',
  function ($scope: any) {
    $scope.ruleListFormats = OmegaPac.Profiles.ruleListFormats;
  },
]);
