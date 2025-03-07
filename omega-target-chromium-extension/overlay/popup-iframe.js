// Handle messages between popup iframe and background service worker
const frame = document.getElementById('popup-frame');

// Forward messages from iframe to background
window.addEventListener('message', function(event) {
  if (event.source === frame.contentWindow) {
    chrome.runtime.sendMessage(event.data, function(response) {
      frame.contentWindow.postMessage({
        type: 'response',
        id: event.data.id,
        response: response
      }, '*');
    });
  }
});

// Forward messages from background to iframe
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (sender.id === chrome.runtime.id) {
    frame.contentWindow.postMessage(message, '*');
    return true;
  }
}); 