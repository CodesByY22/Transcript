// TranscriptKit - Background Service Worker
// Listens for keyboard shortcuts (e.g. Alt+Shift+C) and coordinates actions.

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'copy_transcript') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url || !/^https:\/\/www\.youtube\.com\/(watch|shorts|live)/.test(tab.url)) {
      return;
    }

    try {
      chrome.tabs.sendMessage(tab.id, { type: 'SHORTCUT_COPY' }, (response) => {
        // Handled in content script (which has DOM & clipboard access and shows a toast)
        if (chrome.runtime.lastError) {
          // Tab might need reload
        }
      });
    } catch (_) {}
  }
});
