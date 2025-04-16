(function() {
  // Configuration - Updated selectors to match latest ChatGPT UI
  const CONVERSATION_LIST_SELECTOR = 'nav > div > div, nav ol, .overflow-y-auto';
  const CONVERSATION_ITEM_SELECTOR = 'a[href^="/c/"], li a[href^="/c/"], a[data-history-item-link="true"]';
  const DROPDOWN_BUTTON_SELECTOR = 'button[aria-label="Chat actions"], button[class*="relative"], button[id*="chat-actions"]'; 
  const DROPDOWN_MENU_SELECTOR = 'div[role="menu"], div[class*="dropdown-content"]';
  const PINNED_CLASS = 'chatgpt-pinned';
  const PINNED_SECTION_CLASS = 'chatgpt-pinned-section';
  const REGULAR_SECTION_CLASS = 'chatgpt-regular-section';
  const PIN_MENU_ITEM_CLASS = 'chatgpt-pin-menu-item';
  const CONVERSATION_TOP_SELECTOR = 'main h1, main div[role="heading"], header h1';
  
  // State
  let pinnedConversations = [];
  let isProcessing = false; // Flag to prevent concurrent processing
  let debug = false; // Set to true only for debugging
  
  // Debug logging
  function debugLog(message, obj = null) {
    if (debug) {
      console.log(`[ChatGPT Pinner] ${message}`, obj || '');
    }
  }
  
  // Initialize the extension
  function init() {
    debugLog('Extension initialized on: ' + window.location.href);
    loadPinnedConversations();
    
    // Add styles to the page
    addStyles();
    
    // Monitor for dropdown menus being added
    setupDropdownMenuObserver();
    
    // Monitor for DOM changes but with a longer debounce time
    const observer = new MutationObserver(debounce(handleDOMChanges, 1000));
    observer.observe(document.body, { childList: true, subtree: true });
    
    // First run
    setTimeout(() => {
      handleDOMChanges();
    }, 2000); // Give the page a bit more time to load
  }
  
  // Add styles to the page
  function addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .${PINNED_CLASS} {
        background-color: rgba(0, 0, 0, 0.1);
        border-left: 3px solid #10a37f !important;
      }
      .chatgpt-section-title {
        padding: 8px 12px;
        font-size: 12px;
        font-weight: bold;
        color: #888;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .${PINNED_SECTION_CLASS} {
        margin-bottom: 16px;
        border-bottom: 1px solid rgba(0,0,0,0.1);
      }
      .${PIN_MENU_ITEM_CLASS} {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        padding: 8px 12px;
        color: inherit;
        font-size: 14px;
        transition: background-color 0.2s;
      }
      .${PIN_MENU_ITEM_CLASS}:hover {
        background-color: rgba(0, 0, 0, 0.05);
      }
      .${PIN_MENU_ITEM_CLASS} svg {
        width: 18px;
        height: 18px;
      }
      
      /* Dark mode adjustments */
      @media (prefers-color-scheme: dark) {
        .${PINNED_CLASS} {
          background-color: rgba(255, 255, 255, 0.1);
        }
        .${PINNED_SECTION_CLASS} {
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .${PIN_MENU_ITEM_CLASS}:hover {
          background-color: rgba(255,255,255,0.1);
        }
      }
    `;
    document.head.appendChild(style);
  }
  
  // Load pinned conversations from storage
  function loadPinnedConversations() {
    debugLog('Loading pinned conversations from storage');
    try {
      browser.runtime.sendMessage({ action: "getPinnedConversations" })
        .then(response => {
          pinnedConversations = response.pinnedConversations || [];
          debugLog('Loaded pinned conversations:', pinnedConversations.length);
          
          // Only perform DOM update if we have pinned conversations
          if (pinnedConversations.length > 0) {
            handleDOMChanges();
          }
        })
        .catch(error => {
          debugLog('Error loading pinned conversations:', error);
        });
    } catch (error) {
      debugLog('Exception when loading pinned conversations:', error);
    }
  }
  
  // Setup observer for dropdown menu
  function setupDropdownMenuObserver() {
    // This observer will watch for dropdown menus being added to the DOM
    const dropdownObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const dropdown = node.matches(DROPDOWN_MENU_SELECTOR) ? 
                node : node.querySelector(DROPDOWN_MENU_SELECTOR);
                
              if (dropdown && !dropdown.getAttribute('data-pin-processed')) {
                // Mark this dropdown as processed
                dropdown.setAttribute('data-pin-processed', 'true');
                
                // Add our pin option
                addPinOptionToDropdown(dropdown);
              }
            }
          });
        }
      }
    });
    
    // Observe the entire document
    dropdownObserver.observe(document.body, { childList: true, subtree: true });
  }
  
  // Add pin option to dropdown menu
  function addPinOptionToDropdown(dropdown) {
    // First, find the conversation element this dropdown belongs to
    const conversationId = findConversationIdForDropdown(dropdown);
    
    if (!conversationId) {
      debugLog('Could not determine conversation ID for dropdown');
      return;
    }
    
    // Get conversation title
    const conversationTitle = getConversationTitleById(conversationId);
    
    // Check if THIS specific conversation is pinned (not just any conversation)
    const isPinned = pinnedConversations.some(conv => conv.id === conversationId);
    
    // Create the pin menu item
    const pinMenuItem = document.createElement('div');
    pinMenuItem.className = PIN_MENU_ITEM_CLASS;
    pinMenuItem.role = 'menuitem';
    pinMenuItem.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2L12 12"></path>
        <path d="M18 8L18 12"></path>
        <path d="M6 8L6 12"></path>
        <path d="M2 15L22 15"></path>
        <path d="M5 15L5 22"></path>
        <path d="M19 15L19 22"></path>
      </svg>
      ${isPinned ? 'Unpin conversation' : 'Pin conversation'}
    `;
    
    // Store the conversation ID and title directly on the menu item
    pinMenuItem.setAttribute('data-conversation-id', conversationId);
    pinMenuItem.setAttribute('data-conversation-title', conversationTitle);
    
    // Add click handler
    pinMenuItem.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Get the specific conversation ID from this menu item
      const menuItemId = pinMenuItem.getAttribute('data-conversation-id');
      const menuItemTitle = pinMenuItem.getAttribute('data-conversation-title');
      
      // Toggle the pin status for THIS conversation
      togglePinWithoutRefresh(menuItemId, menuItemTitle);
      
      // Close the dropdown
      const closeButton = dropdown.querySelector('button[aria-label="Close"], button.close');
      if (closeButton) {
        closeButton.click();
      } else {
        // If there's no close button, click outside the dropdown
        document.body.click();
      }
    });
    
    // Find a good position to insert in the dropdown
    const menuItems = Array.from(dropdown.querySelectorAll('div[role="menuitem"], button[role="menuitem"], a[role="menuitem"]'));
    
    let insertAfterItem = menuItems.find(item => 
      item.textContent.toLowerCase().includes('rename') || 
      item.textContent.toLowerCase().includes('share')
    );
    
    if (insertAfterItem) {
      insertAfterItem.insertAdjacentElement('afterend', pinMenuItem);
    } else {
      // If we can't find a good spot, just add it to the beginning
      dropdown.prepend(pinMenuItem);
    }
  }
  
  // Find the conversation ID that a dropdown belongs to
  function findConversationIdForDropdown(dropdown) {
    // Method 1: Look for conversation links in the closest list item
    const listItem = dropdown.closest('li');
    if (listItem) {
      const conversationLink = listItem.querySelector(CONVERSATION_ITEM_SELECTOR);
      if (conversationLink && conversationLink.getAttribute('href')) {
        return conversationLink.getAttribute('href').replace('/c/', '');
      }
    }
    
    // Method 2: Find the button that opened this dropdown and trace to its conversation
    const allDropdownButtons = document.querySelectorAll(DROPDOWN_BUTTON_SELECTOR);
    for (const button of allDropdownButtons) {
      // Check position to see if this button likely opened the dropdown
      const buttonRect = button.getBoundingClientRect();
      const dropdownRect = dropdown.getBoundingClientRect();
      
      // If the dropdown is near this button
      if (Math.abs(buttonRect.left - dropdownRect.left) < 150 && 
          Math.abs(buttonRect.top - dropdownRect.top) < 150) {
        
        // Find the conversation this button belongs to
        const parentLi = button.closest('li');
        if (parentLi) {
          const link = parentLi.querySelector(CONVERSATION_ITEM_SELECTOR);
          if (link && link.getAttribute('href')) {
            return link.getAttribute('href').replace('/c/', '');
          }
        }
        
        // If the button has a data-conversation-id attribute itself
        if (button.hasAttribute('data-conversation-id')) {
          return button.getAttribute('data-conversation-id');
        }
      }
    }
    
    // Method 3: If we're on a conversation page and the dropdown is not in the sidebar
    if (window.location.pathname.startsWith('/c/') && !dropdown.closest('nav')) {
      return window.location.pathname.replace('/c/', '');
    }
    
    // Could not determine the conversation ID
    return null;
  }
  
  // Get conversation title by ID
  function getConversationTitleById(id) {
    // Try to find the conversation in the DOM
    const link = document.querySelector(`a[href="/c/${id}"]`);
    if (link) {
      const titleEl = link.querySelector('div');
      if (titleEl) {
        return titleEl.textContent.trim();
      }
    }
    
    // If we're on this conversation page, get the title from the header
    if (window.location.pathname === `/c/${id}`) {
      const header = document.querySelector(CONVERSATION_TOP_SELECTOR);
      if (header) {
        return header.textContent.trim();
      }
    }
    
    // If we have it in our pinned conversations array
    const pinnedConvo = pinnedConversations.find(conv => conv.id === id);
    if (pinnedConvo && pinnedConvo.title) {
      return pinnedConvo.title;
    }
    
    return 'Untitled Conversation';
  }
  
  // Toggle pin without triggering a full UI refresh
  function togglePinWithoutRefresh(id, title) {
    const isPinned = pinnedConversations.some(conv => conv.id === id);
    
    try {
      browser.runtime.sendMessage({
        action: "togglePin",
        pin: !isPinned,
        conversation: { id, title }
      }).then(() => {
        // Update our local state
        if (isPinned) {
          pinnedConversations = pinnedConversations.filter(conv => conv.id !== id);
        } else {
          pinnedConversations.push({ id, title });
        }
        
        // Schedule a lightweight update (just the organization) after a delay
        setTimeout(() => {
          if (!isProcessing) {
            updatePinnedSections();
          }
        }, 1000);
      });
    } catch (error) {
      debugLog('Error toggling pin:', error);
    }
  }
  
  // Get conversation title
  function getConversationTitle(element) {
    // If it's the current conversation URL
    if (typeof element.getAttribute === 'function' && element.getAttribute('href')) {
      // Try to find the title in the header if we're on a chat page
      if (window.location.pathname.startsWith('/c/')) {
        const header = document.querySelector(CONVERSATION_TOP_SELECTOR);
        if (header) {
          return header.textContent.trim();
        }
      }
      
      // Otherwise try to get it from the sidebar
      const link = document.querySelector(`a[href="${element.getAttribute('href')}"]`);
      if (link) {
        const titleEl = link.querySelector('div');
        if (titleEl) {
          return titleEl.textContent.trim();
        }
      }
    } else if (typeof element.getAttribute === 'function') {
      // It's a DOM element
      const titleEl = element.querySelector('div');
      if (titleEl) {
        return titleEl.textContent.trim();
      }
    }
    
    return 'Untitled';
  }
  
  // Handle DOM changes - check for conversation list and organize if needed
  function handleDOMChanges() {
    // Prevent concurrent processing
    if (isProcessing) {
      debugLog('Already processing, skipping');
      return;
    }
    
    isProcessing = true;
    
    try {
      // Find conversation list
      const conversationList = findConversationList();
      
      if (!conversationList) {
        isProcessing = false;
        return;
      }
      
      // Ensure sections exist
      ensureSectionsExist(conversationList);
      
      // Get pinned and unpinned conversations
      updatePinnedSections();
      
    } finally {
      // Always reset the processing flag
      isProcessing = false;
    }
  }
  
  // Find the conversation list in the DOM
  function findConversationList() {
    // First, check for a conversation list in the sidebar using each selector individually
    const selectors = CONVERSATION_LIST_SELECTOR.split(',').map(s => s.trim());
    
    for (const selector of selectors) {
      const candidates = document.querySelectorAll(selector);
      for (const candidate of candidates) {
        if (candidate.querySelector(CONVERSATION_ITEM_SELECTOR)) {
          return candidate;
        }
      }
    }
    
    return null;
  }
  
  // Update pinned sections without full reprocessing
  function updatePinnedSections() {
    const conversationList = findConversationList();
    if (!conversationList) return;
    
    const pinnedSection = conversationList.querySelector(`.${PINNED_SECTION_CLASS}`);
    const regularSection = conversationList.querySelector(`.${REGULAR_SECTION_CLASS}`);
    
    if (!pinnedSection || !regularSection) return;
    
    // Clear any existing items in pinned section except the header
    while (pinnedSection.children.length > 1) {
      pinnedSection.removeChild(pinnedSection.lastChild);
    }
    
    // If we have no pinned conversations, hide the section and return
    if (!pinnedConversations || pinnedConversations.length === 0) {
      pinnedSection.style.display = 'none';
      return;
    }
    
    // At this point, we have pinned conversations, so show the section
    pinnedSection.style.display = 'block';
    
    // Debug - log our pinned conversations
    if (debug) {
      console.log('Pinned conversations:', JSON.stringify(pinnedConversations));
    }
    
    // First try to find conversations in the regular section
    const existingItems = Array.from(
      document.querySelectorAll(CONVERSATION_ITEM_SELECTOR)
    );
    
    // For each pinned conversation, find or create a corresponding element
    pinnedConversations.forEach(pinnedConv => {
      // Try to find a matching conversation in the DOM
      let matchingItem = existingItems.find(item => {
        const href = item.getAttribute('href');
        if (href) {
          const id = href.replace('/c/', '');
          return id === pinnedConv.id;
        }
        return false;
      });
      
      if (matchingItem) {
        // We found a matching item, clone it to the pinned section
        const clone = matchingItem.cloneNode(true);
        clone.classList.add(PINNED_CLASS);
        
        // Make sure the clone is working as a link
        if (!clone.getAttribute('href')) {
          clone.setAttribute('href', `/c/${pinnedConv.id}`);
        }
        
        pinnedSection.appendChild(clone);
      } else {
        // Create a new element for this pinned conversation
        const newItem = document.createElement('a');
        newItem.className = PINNED_CLASS;
        newItem.href = `/c/${pinnedConv.id}`;
        newItem.setAttribute('data-history-item-link', 'true');
        
        // Create the inner content structure similar to regular conversation items
        const innerDiv = document.createElement('div');
        innerDiv.className = 'relative grow overflow-hidden whitespace-nowrap';
        innerDiv.textContent = pinnedConv.title || 'Untitled Conversation';
        
        newItem.appendChild(innerDiv);
        pinnedSection.appendChild(newItem);
        
        // Copy styles from existing conversation items
        const existingConvoItem = document.querySelector(CONVERSATION_ITEM_SELECTOR);
        if (existingConvoItem) {
          // Copy classes except for pinned class (which we added ourselves)
          const classes = Array.from(existingConvoItem.classList)
            .filter(c => c !== PINNED_CLASS);
          
          newItem.classList.add(...classes);
        }
      }
    });
  }
  
  // Helper to extract conversation ID
  function extractConversationId(element) {
    let id = '';
    if (typeof element.getAttribute === 'function' && element.getAttribute('href')) {
      id = element.getAttribute('href').replace('/c/', '');
    } else if (typeof element.getAttribute === 'function' && element.getAttribute('data-conversation-id')) {
      id = element.getAttribute('data-conversation-id');
    } else if (typeof element === 'object' && element.getAttribute) {
      // It's a pathname object
      id = element.getAttribute().replace('/c/', '');
    }
    return id;
  }
  
  // Create pinned and regular sections if they don't exist
  function ensureSectionsExist(container) {
    const pinnedSectionExists = container.querySelector(`.${PINNED_SECTION_CLASS}`);
    const regularSectionExists = container.querySelector(`.${REGULAR_SECTION_CLASS}`);
    
    if (!pinnedSectionExists) {
      const pinnedSection = document.createElement('div');
      pinnedSection.className = PINNED_SECTION_CLASS;
      pinnedSection.innerHTML = '<h3 class="chatgpt-section-title">Pinned Conversations</h3>';
      pinnedSection.style.display = 'none'; // Hide initially
      container.prepend(pinnedSection);
    }
    
    if (!regularSectionExists) {
      const regularSection = document.createElement('div');
      regularSection.className = REGULAR_SECTION_CLASS;
      regularSection.innerHTML = '<h3 class="chatgpt-section-title">Conversations</h3>';
      container.appendChild(regularSection);
      
      // Move all direct children of container that are conversation items to regularSection
      const directConversations = Array.from(container.querySelectorAll(':scope > ' + CONVERSATION_ITEM_SELECTOR));
      directConversations.forEach(item => {
        // Only process items that are actually direct children
        if (item.parentElement === container) {
          const clone = item.cloneNode(true);
          regularSection.appendChild(clone);
          item.remove(); // Remove the original
        }
      });
    }
  }
  
  // Utility function: Debounce to prevent excessive processing
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
  
  // Start the extension
  init();
})();
