chrome.action.onClicked.addListener((tab) => {
  if (tab.url.includes('chat.openai.com') || tab.url.includes('chatgpt.com')) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['js/content.js']
    });
  }
});
