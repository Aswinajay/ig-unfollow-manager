// Relay events from content script to storage so popup can read them
chrome.runtime.onMessage.addListener((msg, _sender, _sendResponse) => {
  const VALID = ['status','progress','partial_scan_result','scan_result','action_progress','action_done','error'];
  if (VALID.includes(msg.type)) {
    chrome.storage.local.set({ lastEvent: { ...msg, ts: Date.now() } });
  }
  return false;
});

// Allow profile images to load across origins
chrome.declarativeNetRequest.updateDynamicRules({
  removeRuleIds: [1, 2],
  addRules: [
    {
      id: 1, priority: 1,
      action: { type: 'modifyHeaders', responseHeaders: [{ header: 'cross-origin-resource-policy', operation: 'remove' }] },
      condition: { urlFilter: '||cdninstagram.com', resourceTypes: ['image'] }
    },
    {
      id: 2, priority: 1,
      action: { type: 'modifyHeaders', responseHeaders: [{ header: 'cross-origin-resource-policy', operation: 'remove' }] },
      condition: { urlFilter: '||fbcdn.net', resourceTypes: ['image'] }
    }
  ]
});
