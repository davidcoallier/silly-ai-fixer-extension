// Content script that adds the AI Fixer button to ChatGPT response actions

// Create a simple SVG icon for the AI Fixer
const fixerIconSvg = `
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon-md-heavy">
  <path fill-rule="evenodd" clip-rule="evenodd" d="M20 5H4V19H20V5ZM4 3C2.89543 3 2 3.89543 2 5V19C2 20.1046 2.89543 21 4 21H20C21.1046 21 22 20.1046 22 19V5C22 3.89543 21.1046 3 20 3H4ZM9.5 8C9.5 7.44772 9.94772 7 10.5 7H16.5C17.0523 7 17.5 7.44772 17.5 8C17.5 8.55228 17.0523 9 16.5 9H10.5C9.94772 9 9.5 8.55228 9.5 8ZM6.5 8C6.5 8.55228 6.94772 9 7.5 9C8.05228 9 8.5 8.55228 8.5 8C8.5 7.44772 8.05228 7 7.5 7C6.94772 7 6.5 7.44772 6.5 8ZM9.5 12C9.5 11.4477 9.94772 11 10.5 11H16.5C17.0523 11 17.5 11.4477 17.5 12C17.5 12.5523 17.0523 13 16.5 13H10.5C9.94772 13 9.5 12.5523 9.5 12ZM6.5 12C6.5 12.5523 6.94772 13 7.5 13C8.05228 13 8.5 12.5523 8.5 12C8.5 11.4477 8.05228 11 7.5 11C6.94772 11 6.5 11.4477 6.5 12ZM9.5 16C9.5 15.4477 9.94772 15 10.5 15H16.5C17.0523 15 17.5 15.4477 17.5 16C17.5 16.5523 17.0523 17 16.5 17H10.5C9.94772 17 9.5 16.5523 9.5 16ZM6.5 16C6.5 16.5523 6.94772 17 7.5 17C8.05228 17 8.5 16.5523 8.5 16C8.5 15.4477 8.05228 15 7.5 15C6.94772 15 6.5 15.4477 6.5 16Z" fill="currentColor"/>
</svg>
`;

// Function to inject the button into the action bar
function injectFixerButton() {
  // Try multiple selectors to find action bars (ChatGPT UI may change)
  let actionBars = document.querySelectorAll(
    ".flex.absolute.start-0.end-0.flex.justify-start"
  );

  // If no action bars found, try alternative selectors
  if (actionBars.length === 0) {
    // Look for elements that contain the typical action buttons
    actionBars = document.querySelectorAll(
      'div[class*="flex"] > div > span > button[aria-label="Copy"]'
    );
    actionBars = Array.from(actionBars).map((button) =>
      button.closest('div[class*="flex"]')
    );

    // Filter out duplicates
    actionBars = [...new Set(actionBars)].filter(Boolean);
  }

  // If still no action bars, try a more general approach
  if (actionBars.length === 0) {
    // Look for elements near markdown prose divs
    const markdownDivs = document.querySelectorAll("div.markdown.prose");
    const potentialActionBars = [];

    markdownDivs.forEach((div) => {
      // Look for action button containers near markdown divs
      let parent = div.parentElement;
      for (let i = 0; i < 5 && parent; i++) {
        const buttons = parent.querySelectorAll("button[aria-label]");
        if (buttons.length >= 3) {
          // Usually there are at least 3 action buttons
          potentialActionBars.push(parent);
          break;
        }
        parent = parent.parentElement;
      }
    });

    if (potentialActionBars.length > 0) {
      actionBars = potentialActionBars;
    }
  }

  if (actionBars.length === 0) {
    console.log("No action bars found to inject buttons into");
    return; // No action bars found, exit
  }

  // Process each action bar
  actionBars.forEach((actionBar) => {
    // Check if we've already added our button to this action bar
    if (actionBar.querySelector(".ai-fixer-button")) {
      return; // Skip if already added
    }

    // Find an existing button span to copy
    let buttonSpans = Array.from(
      actionBar.querySelectorAll("span[data-state]")
    );

    // If no button spans found directly, try to find buttons and get their parent spans
    if (buttonSpans.length === 0) {
      const buttons = actionBar.querySelectorAll("button[aria-label]");
      buttonSpans = Array.from(buttons)
        .map((button) => button.closest("span"))
        .filter(Boolean);
    }

    // Get the last button span if available
    const lastButtonSpan = buttonSpans.pop();

    if (!lastButtonSpan) {
      console.log("No button spans found in action bar", actionBar);
      return; // No button spans found, skip
    }

    // Create a new span for our button
    const newButtonSpan = document.createElement("span");
    newButtonSpan.className =
      lastButtonSpan.className || "ai-fixer-button-span";
    newButtonSpan.setAttribute("data-state", "closed");

    // Create button element
    const newButton = document.createElement("button");
    newButton.className =
      "ai-fixer-button text-token-text-secondary hover:bg-token-main-surface-secondary rounded-lg";
    newButton.setAttribute("aria-label", "Fix AI Text");
    newButton.setAttribute("data-testid", "fix-ai-text-button");

    // Create button content
    const buttonContent = document.createElement("span");
    buttonContent.className =
      "touch:w-[38px] flex h-[30px] w-[30px] items-center justify-center";
    buttonContent.innerHTML = fixerIconSvg;

    // Add button content to button
    newButton.appendChild(buttonContent);

    // Add tooltip
    const tooltip = document.createElement("div");
    tooltip.className =
      "absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded hidden";
    tooltip.textContent = "Fix AI Text";
    newButton.addEventListener("mouseenter", () =>
      tooltip.classList.remove("hidden")
    );
    newButton.addEventListener("mouseleave", () =>
      tooltip.classList.add("hidden")
    );
    newButton.appendChild(tooltip);

    // Add click handler to the button
    newButton.addEventListener("click", (event) => {
      try {
        fixAIText(event);
      } catch (error) {
        console.error("Error in fixAIText:", error);

        // Fallback: Try to find and fix the closest markdown div if the regular method fails
        try {
          const button = event.currentTarget;
          const allMarkdownDivs =
            document.querySelectorAll("div.markdown.prose");

          if (allMarkdownDivs.length > 0) {
            // Just fix all markdown divs, rather than trying to find the specific one
            let fixCount = 0;

            allMarkdownDivs.forEach((markdownDiv) => {
              // Apply the fix to each markdown div
              const stats = fixMarkdownDiv(markdownDiv);
              fixCount +=
                stats.emdash +
                stats.apostrophe +
                stats.openQuote +
                stats.closeQuote +
                stats.ellipsis;
            });

            showNotification(
              `Fixed ${fixCount} characters across all responses`
            );
            console.log("Fixed all markdown divs as fallback");
          } else {
            showNotification("No content found to fix");
          }
        } catch (fallbackError) {
          console.error("Fallback also failed:", fallbackError);
          showNotification("Could not fix text, please try the popup instead");
        }
      }
    });

    // Add button to span
    newButtonSpan.appendChild(newButton);

    // Insert after the last button
    lastButtonSpan.after(newButtonSpan);

    console.log("Successfully injected AI Fixer button");
  });
}

// Function to fix AI text in the current response
function fixAIText(event) {
  // Find the nearest markdown prose div
  const button = event.currentTarget;
  const actionBar = button.closest(
    ".flex.absolute.start-0.end-0.flex.justify-start"
  );

  if (!actionBar) {
    console.error("Cannot find action bar container");
    return;
  }

  // Try different strategies to find the parent message container
  let messageContainer = null;

  // Strategy 1: Look for data-message-author-role attribute
  messageContainer = actionBar.closest("[data-message-author-role]");

  // Strategy 2: Walk up the DOM to find the main message container
  if (!messageContainer) {
    // Go up multiple levels to find a likely container
    let parent = actionBar.parentElement;
    for (let i = 0; i < 5; i++) {
      // Try up to 5 levels up
      if (!parent) break;

      // Try to find the markdown div from this level
      const markdownDiv = parent.querySelector("div.markdown.prose");
      if (markdownDiv) {
        messageContainer = parent;
        break;
      }
      parent = parent.parentElement;
    }
  }

  // Strategy 3: Look for nearby div with markdown prose
  if (!messageContainer) {
    // Find the nearest common parent that likely contains both the actionBar and markdown
    let parent = actionBar.parentElement;
    while (parent && parent !== document.body) {
      // Find all markdown divs in this parent
      const markdownDivs = parent.querySelectorAll("div.markdown.prose");
      if (markdownDivs.length > 0) {
        // Use the closest markdown div to our action bar
        messageContainer = parent;
        break;
      }
      parent = parent.parentElement;
    }
  }

  if (!messageContainer) {
    console.error("Cannot find message container");
    return;
  }

  // Find the markdown prose div in this message
  const markdownDiv = messageContainer.querySelector("div.markdown.prose");

  if (!markdownDiv) {
    // Last resort: find the closest markdown div by proximity in the DOM
    // Calculate the position of the action bar
    const actionBarRect = actionBar.getBoundingClientRect();

    // Find all markdown divs in the document
    const allMarkdownDivs = document.querySelectorAll("div.markdown.prose");

    if (allMarkdownDivs.length === 0) {
      console.error("Cannot find any markdown prose divs");
      return;
    }

    // Find the closest one by vertical position (likely to be in the same message)
    let closestDiv = null;
    let closestDistance = Infinity;

    allMarkdownDivs.forEach((div) => {
      const divRect = div.getBoundingClientRect();
      // Calculate vertical distance between the action bar and this div
      const distance = Math.abs(divRect.bottom - actionBarRect.top);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestDiv = div;
      }
    });

    if (closestDistance > 200) {
      // If the closest div is too far away, probably not related
      console.error("Cannot find a nearby markdown prose div");
      return;
    }

    markdownDiv = closestDiv;
  }

  // Apply the fixes to the found markdown div
  const stats = fixMarkdownDiv(markdownDiv);

  // Show a brief notification with the stats
  const total =
    stats.emdash +
    stats.apostrophe +
    stats.openQuote +
    stats.closeQuote +
    stats.ellipsis;

  if (total > 0) {
    showNotification(`Fixed ${total} characters`);
  } else {
    showNotification("No characters needed fixing");
  }

  console.log("AI text fixed successfully", stats);
}

// Function to fix text in a markdown div
function fixMarkdownDiv(markdownDiv) {
  // Helper function to walk through all text nodes and apply replacements
  function walkTextNodes(node, callback) {
    if (node.nodeType === Node.TEXT_NODE) {
      // Process text node
      callback(node);
    } else {
      // Process child nodes recursively
      for (let i = 0; i < node.childNodes.length; i++) {
        walkTextNodes(node.childNodes[i], callback);
      }
    }
  }

  // Stats object to track replacements
  const stats = {
    emdash: 0,
    apostrophe: 0,
    openQuote: 0,
    closeQuote: 0,
    ellipsis: 0,
  };

  // Replace characters and count occurrences
  walkTextNodes(markdownDiv, (node) => {
    // Replace emdash with hyphen
    node.textContent = node.textContent.replace(/—/g, (match) => {
      stats.emdash += 1;
      return "-";
    });

    // Replace curly apostrophe
    node.textContent = node.textContent.replace(/’/g, (match) => {
      stats.apostrophe += 1;
      return "'";
    });

    // Replace opening curly quotes
    node.textContent = node.textContent.replace(/“/g, (match) => {
      stats.openQuote += 1;
      return '"';
    });

    // Replace closing curly quotes
    node.textContent = node.textContent.replace(/”/g, (match) => {
      stats.closeQuote += 1;
      return '"';
    });

    // Replace ellipsis character
    node.textContent = node.textContent.replace(/…/g, (match) => {
      stats.ellipsis += 1;
      return "...";
    });
  });

  return stats;
}

// Function to show a brief notification
function showNotification(message) {
  // Create notification element
  const notification = document.createElement("div");
  notification.className =
    "fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded shadow-lg z-50";
  notification.textContent = message;

  // Add to document
  document.body.appendChild(notification);

  // Remove after 2 seconds
  setTimeout(() => {
    notification.style.opacity = "0";
    notification.style.transition = "opacity 0.5s";

    // Remove from DOM after fade out
    setTimeout(() => {
      notification.remove();
    }, 500);
  }, 2000);
}

// Watch for DOM changes to inject our button into new responses
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.addedNodes.length) {
      injectFixerButton();
    }
  }
});

// Start observing DOM changes
observer.observe(document.body, { childList: true, subtree: true });

// Initial injection when the script loads
injectFixerButton();
