var RETRYABLE_ERRORS = ['Could not establish connection. Receiving end does not exist.'];
var MAX_RETRIES = 5;
var RETRY_DELAY_MS = 150;

function sendMessageWithRetry(payload, retries, onSuccess, onFailure) {
  chrome.runtime.sendMessage(payload, function (response) {
    var error = chrome.runtime.lastError;
    if (error) {
      var retryable = false;
      var message = error.message || '';
      for (var i = 0; i < RETRYABLE_ERRORS.length; i++) {
        if (message.indexOf(RETRYABLE_ERRORS[i]) >= 0) {
          retryable = true;
          break;
        }
      }

      if (retryable && retries > 0) {
        setTimeout(function () {
          sendMessageWithRetry(payload, retries - 1, onSuccess, onFailure);
        }, RETRY_DELAY_MS);
      } else if (onFailure) {
        onFailure(error);
      }
      return;
    }
    if (onSuccess) onSuccess(response);
  });
}

function callBackgroundNoReply(method, args, cb) {
  var payload = {
    method: method,
    args: args,
    noReply: true,
    refreshActivePage: true,
  };

  sendMessageWithRetry(
    payload,
    MAX_RETRIES,
    function () {
      if (cb) cb();
    },
    function (error) {
      console.warn('callBackgroundNoReply failed:', error);
      if (cb) cb(error);
    },
  );
}

function callBackground(method, args, cb) {
  var payload = {
    method: method,
    args: args,
  };

  sendMessageWithRetry(
    payload,
    MAX_RETRIES,
    function (response) {
      if (!response) {
        return cb && cb(new Error('Empty response from background'));
      }
      if (response.error) {
        return cb && cb(response.error);
      }
      return cb && cb(null, response.result);
    },
    function (error) {
      return cb && cb(error);
    },
  );
}

var requestInfoCallback = null;

OmegaTargetPopup = {
  getState: function (keys, cb) {
    callBackground('getState', [keys], cb);
  },
  setState: function (name, value, cb) {
    var payload = {};
    payload[name] = value;
    callBackground('setState', [payload], cb);
  },
  applyProfile: function (name, cb) {
    callBackgroundNoReply('applyProfile', [name], cb);
  },
  openOptions: function (hash, cb) {
    var options_url = chrome.runtime.getURL('options.html');

    chrome.tabs.query(
      {
        url: options_url,
      },
      function (tabs) {
        if (!chrome.runtime.lastError && tabs && tabs.length > 0) {
          var props = {
            active: true,
          };
          if (hash) {
            var url = options_url + hash;
            props.url = url;
          }
          chrome.tabs.update(tabs[0].id, props);
        } else {
          chrome.tabs.create({
            url: options_url,
          });
        }
        if (cb) return cb();
      },
    );
  },
  addCondition: function (condition, profileName, cb) {
    callBackground('addCondition', [condition, profileName], cb);
  },
  getTempRules: function (cb) {
    callBackground('getTempRules', [], cb);
  },
  getActivePageInfo: function (cb) {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, function (tabs) {
      if (tabs.length === 0 || !(tabs[0].pendingUrl || tabs[0].url)) return cb();
      var args = { tabId: tabs[0].id, url: tabs[0].pendingUrl || tabs[0].url };
      callBackground('getPageInfo', [args], cb);
    });
  },
  setDefaultProfile: function (profileName, defaultProfileName, cb) {
    callBackgroundNoReply('setDefaultProfile', [profileName, defaultProfileName], cb);
  },
  addTempRule: function (domain, profileName, cb) {
    callBackgroundNoReply('addTempRule', [domain, profileName], cb);
  },
  openManage: function (domain, profileName, cb) {
    chrome.tabs.create(
      {
        url: 'chrome://extensions/?id=' + chrome.runtime.id,
      },
      cb,
    );
  },
  getMessage: chrome.i18n.getMessage.bind(chrome.i18n),
};
