window.OmegaPopup = {};
$script(['js/i18n.js']);

function loadMainScripts() {
  if (window.OmegaPopup._mainLoaded) return;
  window.OmegaPopup._mainLoaded = true;
  $script(['js/index.js', 'js/profiles.js', 'js/keyboard.js'], 'om-main');
}

$script('../js/omega_target_popup.js', 'om-target', function() {
  OmegaTargetPopup.getState([
    'availableProfiles',
    'currentProfileName',
    'validResultProfiles',
    'isSystemProfile',
    'currentProfileCanAddRule',
    'proxyNotControllable',
    'externalProfile',
    'showExternalProfile',
  ], function(err, state) {
    window.OmegaPopup.state = state || {};
    loadMainScripts();
    $script.done('om-state');
  });

  OmegaTargetPopup.getActivePageInfo(function(err, info) {
    window.OmegaPopup.pageInfo = info;
    $script.done('om-page-info');
  });
});
