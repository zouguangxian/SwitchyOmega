window.OmegaPopup = {};
$script(['js/i18n.js']);

function loadMainScripts() {
  if (window.OmegaPopup._mainLoaded) return;
  window.OmegaPopup._mainLoaded = true;
  $script(['js/index.js', 'js/profiles.js', 'js/keyboard.js'], 'om-main');
}

function doneAfterMain(signalName) {
  // Avoid race: OmegaTargetPopup.getState may resolve before om-main scripts have
  // registered their `$script.ready('om-state', ...)` handlers.
  $script.ready('om-main', function () {
    $script.done(signalName);
  });
}

$script('../js/omega_target_popup.js', 'om-target', function () {
  OmegaTargetPopup.getState(
    [
      'availableProfiles',
      'currentProfileName',
      'validResultProfiles',
      'isSystemProfile',
      'currentProfileCanAddRule',
      'proxyNotControllable',
      'externalProfile',
      'showExternalProfile',
    ],
    function (err, state) {
      window.OmegaPopup.state = state || {};
      loadMainScripts();
      doneAfterMain('om-state');
    },
  );

  OmegaTargetPopup.getActivePageInfo(function (err, info) {
    window.OmegaPopup.pageInfo = info;
    loadMainScripts();
    doneAfterMain('om-page-info');
  });
});
