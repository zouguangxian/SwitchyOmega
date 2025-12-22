/** @module omega-web/controllers/master */

declare const angular: any;
declare const browser: any;
declare const OmegaPac: any;
declare const jsondiffpatch: any;
declare const $script: any;

angular.module('omega').controller('MasterCtrl', [
  '$scope',
  '$rootScope',
  '$window',
  '$q',
  '$uibModal',
  '$state',
  'profileColors',
  'profileIcons',
  'omegaTarget',
  '$timeout',
  '$location',
  '$filter',
  'getAttachedName',
  'isProfileNameReserved',
  'isProfileNameHidden',
  'dispNameFilter',
  'downloadFile',
  function (
    $scope: any,
    $rootScope: any,
    $window: any,
    $q: any,
    $uibModal: any,
    $state: any,
    profileColors: any,
    profileIcons: any,
    omegaTarget: any,
    $timeout: any,
    $location: any,
    $filter: any,
    getAttachedName: any,
    isProfileNameReserved: any,
    isProfileNameHidden: any,
    dispNameFilter: any,
    downloadFile: any,
  ) {
    if ((browser as any)?.proxy?.register || (browser as any)?.proxy?.registerProxyScript) {
      $scope.isExperimental = true;
      $scope.pacProfilesUnsupported = true;
    }

    const tr = $filter('tr');

    $rootScope.options = null;

    omegaTarget.addOptionsChangeCallback((newOptions: any) => {
      $rootScope.options = angular.copy(newOptions);
      $rootScope.optionsOld = angular.copy(newOptions);

      omegaTarget.state('syncOptions').then((syncOptions: any) => {
        $scope.syncOptions = syncOptions;
      });

      $timeout(() => {
        $rootScope.optionsDirty = false;
        showFirstRun();
      });
    });

    $rootScope.revertOptions = () => {
      $window.location.reload();
    };

    $rootScope.exportScript = (name?: string) => {
      const getProfileName = name ? $q.when(name) : omegaTarget.state('currentProfileName');

      getProfileName.then((profileName: string) => {
        if (!profileName) return;
        const profile = $rootScope.profileByName(profileName);
        if (['DirectProfile', 'SystemProfile'].includes(profile.profileType)) return;

        let missingProfile: string | null = null;
        const profileNotFound = (name: string) => {
          missingProfile = name;
          return 'dumb';
        };
        const ast = OmegaPac.PacGenerator.script($rootScope.options, profileName, {
          profileNotFound,
        });
        const pac = OmegaPac.PacGenerator.ascii(
          ast.print_to_string({ beautify: true, comments: true }),
        );
        const blob = new Blob([pac], { type: 'text/plain;charset=utf-8' });
        const fileName = profileName.replace(/\W+/g, '_');
        downloadFile(blob, `OmegaProfile_${fileName}.pac`);
        if (missingProfile) {
          $timeout(() => {
            $rootScope.showAlert({
              type: 'error',
              message: tr('options_profileNotFound', [missingProfile]),
            });
          });
        }
      });
    };

    const diff = jsondiffpatch.create({
      objectHash: (obj: any) => JSON.stringify(obj),
      textDiff: { minLength: 1 / 0 },
    });

    $rootScope.showAlert = (alert: any) =>
      $timeout(() => {
        $scope.alert = alert;
        $scope.alertShown = true;
        $scope.alertShownAt = Date.now();
        $timeout($rootScope.hideAlert, 3000);
      });

    $rootScope.hideAlert = () =>
      $timeout(() => {
        if (Date.now() - $scope.alertShownAt >= 1000) {
          $scope.alertShown = false;
        }
      });

    const checkFormValid = () => {
      const fields = angular.element('.ng-invalid');
      if (fields.length > 0) {
        fields[0].focus();
        $rootScope.showAlert({
          type: 'error',
          i18n: 'options_formInvalid',
        });
        return false;
      }
      return true;
    };

    $rootScope.applyOptions = () => {
      if (!checkFormValid()) return;
      if ($rootScope.$broadcast('omegaApplyOptions').defaultPrevented) return;
      const plainOptions = angular.fromJson(angular.toJson($rootScope.options));
      const patch = diff.diff($rootScope.optionsOld, plainOptions);
      omegaTarget.optionsPatch(patch).then(() => {
        $rootScope.showAlert({
          type: 'success',
          i18n: 'options_saveSuccess',
        });
      });
    };

    $rootScope.resetOptions = (options?: any) => {
      omegaTarget
        .resetOptions(options)
        .then(() => {
          $rootScope.showAlert({
            type: 'success',
            i18n: 'options_resetSuccess',
          });
        })
        .catch((err: any) => {
          $rootScope.showAlert({
            type: 'error',
            message: err,
          });
          return $q.reject(err);
        });
    };

    $rootScope.profileByName = (name: string) => {
      return OmegaPac.Profiles.byName(name, $rootScope.options);
    };

    $rootScope.systemProfile = $rootScope.profileByName('system');
    $rootScope.externalProfile = {
      color: '#49afcd',
      name: tr('popup_externalProfile'),
      profileType: 'FixedProfile',
      fallbackProxy: { host: '127.0.0.1', port: 42, scheme: 'http' },
    };

    $rootScope.applyOptionsConfirm = () => {
      if (!checkFormValid()) return $q.reject('form_invalid');
      if (!$rootScope.optionsDirty) return $q.when(true);
      return $uibModal
        .open({ templateUrl: 'partials/apply_options_confirm.html' })
        .result.then(() => $rootScope.applyOptions());
    };

    $rootScope.newProfile = () => {
      const scope = $rootScope.$new('isolate');
      scope.options = $rootScope.options;
      scope.isProfileNameReserved = isProfileNameReserved;
      scope.isProfileNameHidden = isProfileNameHidden;
      scope.profileByName = $rootScope.profileByName;
      scope.validateProfileName = {
        conflict: '!$value || !profileByName($value)',
        reserved: '!$value || !isProfileNameReserved($value)',
      };
      scope.profileIcons = profileIcons;
      scope.dispNameFilter = dispNameFilter;
      scope.options = $scope.options;
      scope.pacProfilesUnsupported = $scope.pacProfilesUnsupported;

      $uibModal
        .open({
          templateUrl: 'partials/new_profile.html',
          scope,
        })
        .result.then((profile: any) => {
          profile = OmegaPac.Profiles.create(profile);
          const choice = Math.floor(Math.random() * profileColors.length);
          profile.color = profile.color || profileColors[choice];
          OmegaPac.Profiles.updateRevision(profile);
          $rootScope.options[OmegaPac.Profiles.nameAsKey(profile)] = profile;
          $state.go('profile', { name: profile.name });
        });
    };

    $rootScope.replaceProfile = (fromName: string, toName: string) => {
      $rootScope.applyOptionsConfirm().then(() => {
        const scope = $rootScope.$new('isolate');
        scope.options = $rootScope.options;
        scope.fromName = fromName;
        scope.toName = toName;
        scope.profileByName = $rootScope.profileByName;
        scope.dispNameFilter = dispNameFilter;
        scope.options = $scope.options;
        scope.profileSelect = (model: string) => {
          return `
            <div omega-profile-select="options | profiles:profile"
              ng-model="${model}" options="options"
              disp-name="dispNameFilter" style="display: inline-block;">
            </div>
          `;
        };

        $uibModal
          .open({
            templateUrl: 'partials/replace_profile.html',
            scope,
          })
          .result.then(({ fromName, toName }: { fromName: string; toName: string }) => {
            omegaTarget
              .replaceRef(fromName, toName)
              .then(() => {
                $rootScope.showAlert({
                  type: 'success',
                  i18n: 'options_replaceProfileSuccess',
                });
              })
              .catch((err: any) => {
                $rootScope.showAlert({
                  type: 'error',
                  message: err,
                });
              });
          });
      });
    };

    $rootScope.renameProfile = (fromName: string) => {
      $rootScope.applyOptionsConfirm().then(() => {
        const profile = $rootScope.profileByName(fromName);
        const scope = $rootScope.$new('isolate');
        scope.options = $rootScope.options;
        scope.fromName = fromName;
        scope.isProfileNameReserved = isProfileNameReserved;
        scope.isProfileNameHidden = isProfileNameHidden;
        scope.profileByName = $rootScope.profileByName;
        scope.validateProfileName = {
          conflict: '!$value || $value == fromName || !profileByName($value)',
          reserved: '!$value || !isProfileNameReserved($value)',
        };
        scope.dispNameFilter = $scope.dispNameFilter;
        scope.options = $scope.options;

        $uibModal
          .open({
            templateUrl: 'partials/rename_profile.html',
            scope,
          })
          .result.then((toName: string) => {
            if (toName !== fromName) {
              let rename = omegaTarget.renameProfile(fromName, toName);
              const attachedName = getAttachedName(fromName);
              if ($rootScope.profileByName(attachedName)) {
                const toAttachedName = getAttachedName(toName);
                let defaultProfileName: string | undefined;
                if ($rootScope.profileByName(toAttachedName)) {
                  defaultProfileName = profile.defaultProfileName;
                  rename = rename.then(() => {
                    const toAttachedKey = OmegaPac.Profiles.nameAsKey(toAttachedName);
                    const profile = $rootScope.profileByName(toName);
                    profile.defaultProfileName = 'direct';
                    OmegaPac.Profiles.updateRevision(profile);
                    delete $rootScope.options[toAttachedKey];
                    $rootScope.applyOptions();
                  });
                }
                rename = rename.then(() => {
                  return omegaTarget.renameProfile(attachedName, toAttachedName);
                });
                if (defaultProfileName) {
                  rename = rename.then(() => {
                    const profile = $rootScope.profileByName(toName);
                    profile.defaultProfileName = defaultProfileName;
                    $rootScope.applyOptions();
                  });
                }
              }
              rename
                .then(() => {
                  $state.go('profile', { name: toName });
                })
                .catch((err: any) => {
                  $rootScope.showAlert({
                    type: 'error',
                    message: err,
                  });
                });
            }
          });
      });
    };

    $scope.updatingProfile = {};

    $rootScope.updateProfile = (name?: string) => {
      $rootScope.applyOptionsConfirm().then(() => {
        if (name) {
          $scope.updatingProfile[name] = true;
        } else {
          OmegaPac.Profiles.each($scope.options, (key: string, profile: any) => {
            if (!profile.builtin) {
              $scope.updatingProfile[profile.name] = true;
            }
          });
        }

        omegaTarget
          .updateProfile(name, 'bypass_cache')
          .then((results: any) => {
            let success = 0;
            let error = 0;
            for (const profileName in results) {
              if (results.hasOwnProperty(profileName)) {
                const result = results[profileName];
                if (result instanceof Error) {
                  error++;
                } else {
                  success++;
                }
              }
            }
            if (error === 0) {
              $rootScope.showAlert({
                type: 'success',
                i18n: 'options_profileDownloadSuccess',
              });
            } else {
              if (error === 1) {
                const singleErr = results[OmegaPac.Profiles.nameAsKey(name)];
                if (singleErr) {
                  return $q.reject(singleErr);
                }
              }
              return $q.reject(results);
            }
          })
          .catch((err: any) => {
            const message = tr('options_profileDownloadError_' + err.name, [
              err.statusCode || err.original?.statusCode || '',
            ]);
            if (message) {
              $rootScope.showAlert({
                type: 'error',
                message,
              });
            } else {
              $rootScope.showAlert({
                type: 'error',
                i18n: 'options_profileDownloadError',
              });
            }
          })
          .finally(() => {
            if (name) {
              $scope.updatingProfile[name] = false;
            } else {
              $scope.updatingProfile = {};
            }
          });
      });
    };

    const onOptionChange = (options: any, oldOptions: any) => {
      if (options === oldOptions || !oldOptions) return;
      $rootScope.optionsDirty = true;
    };
    $rootScope.$watch('options', onOptionChange, true);

    $rootScope.$on('$stateChangeStart', (event: any, _: any, __: any, fromState: any) => {
      if (!checkFormValid()) {
        event.preventDefault();
      }
    });

    $rootScope.$on('$stateChangeSuccess', () => {
      omegaTarget.lastUrl($location.url());
    });

    $window.onbeforeunload = () => {
      if ($rootScope.optionsDirty) {
        return tr('options_optionsNotSaved');
      } else {
        return null;
      }
    };

    document.addEventListener(
      'click',
      () => {
        $rootScope.hideAlert();
      },
      false,
    );

    $scope.profileIcons = profileIcons;
    $scope.dispNameFilter = dispNameFilter;

    for (const type in OmegaPac.Profiles.formatByType) {
      if (OmegaPac.Profiles.formatByType.hasOwnProperty(type)) {
        $scope.profileIcons[type] = $scope.profileIcons['RuleListProfile'];
      }
    }

    $scope.alertIcons = {
      success: 'glyphicon-ok',
      warning: 'glyphicon-warning-sign',
      error: 'glyphicon-remove',
      danger: 'glyphicon-danger',
    };

    $scope.alertClassForType = (type: string) => {
      if (!type) return '';
      if (type === 'error') {
        type = 'danger';
      }
      return 'alert-' + type;
    };

    $scope.downloadIntervals = [15, 60, 180, 360, 720, 1440, -1];
    $scope.downloadIntervalI18n = (interval: number) => {
      return 'options_downloadInterval_' + (interval < 0 ? 'never' : interval);
    };

    $scope.openShortcutConfig = omegaTarget.openShortcutConfig.bind(omegaTarget);

    let showFirstRunOnce = true;
    const showFirstRun = () => {
      if (!showFirstRunOnce) return;
      showFirstRunOnce = false;
      omegaTarget.state('firstRun').then((firstRun: string) => {
        if (!firstRun) return;
        omegaTarget.state('firstRun', '');

        let profileName: string | null = null;
        OmegaPac.Profiles.each($rootScope.options, (key: string, profile: any) => {
          if (!profileName && profile.profileType === 'FixedProfile') {
            profileName = profile.name;
          }
        });
        if (!profileName) return;

        const scope = $rootScope.$new('isolate');
        scope.upgrade = firstRun === 'upgrade';
        $uibModal
          .open({
            templateUrl: 'partials/options_welcome.html',
            keyboard: false,
            scope,
            backdrop: 'static',
            backdropClass: 'opacity-half',
          })
          .result.then((r: string) => {
            switch (r) {
              case 'later':
                return;
              case 'show':
                $state.go('profile', { name: profileName }).then(() => {
                  $script('js/options_guide.js');
                });
                break;
            }
          });
      });
    };

    omegaTarget.refresh();
  },
]);
