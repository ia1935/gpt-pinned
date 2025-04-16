browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getPinnedConversations") {
    browser.storage.local.get("pinnedConversations").then((result) => {
      sendResponse({ pinnedConversations: result.pinnedConversations || [] });
    });
    return true; // Required for async response
  } else if (message.action === "togglePin") {
    browser.storage.local.get("pinnedConversations").then((result) => {
      let pinnedConversations = result.pinnedConversations || [];
      
      if (message.pin) {
        // Add to pinned if not already there
        if (!pinnedConversations.some(conv => conv.id === message.conversation.id)) {
          pinnedConversations.push(message.conversation);
        }
      } else {
        // Remove from pinned
        pinnedConversations = pinnedConversations.filter(conv => conv.id !== message.conversation.id);
      }
      
      browser.storage.local.set({ pinnedConversations }).then(() => {
        sendResponse({ success: true });
      });
    });
    return true; // Required for async response
  }
});
