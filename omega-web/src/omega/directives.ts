/** @module omega-web/directives */

declare const angular: any;
declare const OmegaPac: any;

angular
  .module('omega')
  .directive('inputGroupClear', [
    '$timeout',
    function ($timeout: any) {
      return {
        restrict: 'A',
        templateUrl: 'partials/input_group_clear.html',
        scope: {
          model: '=model',
          type: '@type',
          ngPattern: '=?ngPattern',
          placeholder: '@placeholder',
          controller: '=?controller',
        },
        link: (scope: any, element: any, attrs: any) => {
          scope.catchAll = new RegExp('');
          $timeout(() => {
            scope.controller = element.find('input').controller('ngModel');
          });

          scope.oldModel = '';
          scope.controller = scope.input;
          scope.modelChange = () => {
            if (scope.model) {
              scope.oldModel = '';
            }
          };
          scope.toggleClear = () => {
            [scope.model, scope.oldModel] = [scope.oldModel, scope.model];
          };
        },
      };
    },
  ])
  .directive('omegaUpload', () => {
    return {
      restrict: 'A',
      scope: {
        success: '&omegaUpload',
        error: '&omegaError',
      },
      link: (scope: any, element: any, attrs: any) => {
        const input = element[0];
        element.on('change', () => {
          if (input.files.length > 0 && input.files[0].name.length > 0) {
            const reader = new FileReader();
            reader.addEventListener('load', (e: any) => {
              scope.$apply(() => {
                scope.success({ $content: e.target.result });
              });
            });
            reader.addEventListener('error', (e: any) => {
              scope.$apply(() => {
                scope.error({ $error: e.target.error });
              });
            });
            reader.readAsText(input.files[0]);
            input.value = '';
          }
        });
      },
    };
  })
  .directive('omegaIp2str', () => {
    return {
      restrict: 'A',
      priority: 2, // Run post-link after input directive (0) and ngModel (1).
      require: 'ngModel',
      link: (scope: any, element: any, attr: any, ngModel: any) => {
        ngModel.$parsers.push((value: string) => {
          if (value) {
            return OmegaPac.Conditions.fromStr('Ip: ' + value);
          } else {
            return { conditionType: 'IpCondition', ip: '0.0.0.0', prefixLength: 0 };
          }
        });
        ngModel.$formatters.push((value: any) => {
          if (value?.ip) {
            return OmegaPac.Conditions.str(value).split(' ', 2)[1];
          } else {
            return '';
          }
        });
      },
    };
  });
