// Content script that adds the AI Fixer button to ChatGPT response actions

// Use extension icon as the button icon
const extensionIconUrl = chrome.runtime.getURL("icons/icon32.png");

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

    // Create img element for the icon
    const iconImg = document.createElement("img");
    iconImg.src = extensionIconUrl;
    iconImg.alt = "AI Fixer";
    iconImg.style.width = "20px";
    iconImg.style.height = "20px";

    // Add the icon to the button content
    buttonContent.appendChild(iconImg);

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

  // Convert the content to markdown
  function convertToMarkdown(node) {
    // Try a simple approach first for plain text content
    if (node.textContent && node.children.length === 0) {
      console.log("Using simple text extraction");
      return node.textContent.trim();
    }

    // For simple content with just paragraphs, try a direct approach
    if (
      node.children.length > 0 &&
      node.querySelectorAll("p, hr, pre, code, ul, ol, table, blockquote")
        .length === 0
    ) {
      console.log("Using simplified paragraph extraction");
      return Array.from(node.children)
        .map((child) => child.textContent.trim())
        .filter((text) => text.length > 0)
        .join("\n\n");
    }

    console.log("Using full HTML to Markdown conversion");
    // Get all the HTML content as a string
    const htmlContent = node.innerHTML;

    // Create a more robust markdown conversion
    let markdown = "";

    // Process the DOM tree to generate markdown
    function processNode(node, listPrefix = "") {
      if (!node) return "";

      let result = "";

      // Process based on node type
      console.log(`Node name: ${node.nodeName}`);
      switch (node.nodeName) {
        case "H1":
          return `# ${getTextContent(node)}\n\n`;
        case "H2":
          return `## ${getTextContent(node)}\n\n`;
        case "H3":
          return `### ${getTextContent(node)}\n\n`;
        case "H4":
          return `#### ${getTextContent(node)}\n\n`;
        case "H5":
          return `##### ${getTextContent(node)}\n\n`;
        case "H6":
          return `###### ${getTextContent(node)}\n\n`;
        case "P":
          return `${processChildNodes(node)}\n\n`;
        case "BR":
          return "\n";
        case "UL":
          return processListItems(node, "- ");
        case "OL":
          return processOrderedListItems(node);
        case "LI":
          // This should be handled by UL/OL processing
          return `${listPrefix}${processChildNodes(node)}\n`;
        case "BLOCKQUOTE":
          // Process blockquote content with > prefix
          const blockquoteContent = processChildNodes(node);
          return (
            blockquoteContent
              .split("\n")
              .map((line) => `> ${line}`)
              .join("\n") + "\n\n"
          );
        case "PRE":
          // Handle code blocks
          const codeElement = node.querySelector("code");
          if (codeElement) {
            let language = "";
            if (
              codeElement.className &&
              codeElement.className.includes("language-")
            ) {
              language = codeElement.className.replace(
                /.*language-([^\s]+).*/,
                "$1"
              );
            }
            return (
              "```" + language + "\n" + codeElement.textContent + "\n```\n\n"
            );
          } else {
            return "```\n" + node.textContent + "\n```\n\n";
          }
        case "CODE":
          // Handle inline code (not inside a PRE)
          if (node.parentNode.nodeName !== "PRE") {
            return "`" + node.textContent + "`";
          }
          return node.textContent;
        case "STRONG":
        case "B":
          return `**${processChildNodes(node)}**`;
        case "EM":
        case "I":
          return `*${processChildNodes(node)}*`;
        case "A":
          const href = node.getAttribute("href") || "#";
          return `[${processChildNodes(node)}](${href})`;
        case "IMG":
          const src = node.getAttribute("src") || "";
          const alt = node.getAttribute("alt") || "";
          return `![${alt}](${src})`;
        case "TABLE":
          return processTable(node);
        case "HR":
          return "---\n\n";
        case "DIV":
          // For most divs, just process the content
          return processChildNodes(node);
        case "#text":
          // Text node - just return the content
          return node.textContent;
        default:
          // For other elements, process their children
          return processChildNodes(node);
      }
    }

    // Helper function to get text content without extra whitespace
    function getTextContent(node) {
      return node.textContent.trim().replace(/\s+/g, " ");
    }

    // Process child nodes and combine their results
    function processChildNodes(node) {
      let result = "";
      for (const child of node.childNodes) {
        result += processNode(child);
      }
      return result;
    }

    // Process unordered list items
    function processListItems(ulNode, prefix) {
      let result = "\n";
      const items = ulNode.querySelectorAll(":scope > li");
      for (const item of items) {
        result += `${prefix}${processChildNodes(item)}\n`;
      }
      return result + "\n";
    }

    // Process ordered list items
    function processOrderedListItems(olNode) {
      let result = "\n";
      const items = olNode.querySelectorAll(":scope > li");
      let counter = olNode.getAttribute("start") || 1;
      counter = parseInt(counter, 10);

      for (const item of items) {
        result += `${counter}. ${processChildNodes(item)}\n`;
        counter++;
      }
      return result + "\n";
    }

    // Process tables
    function processTable(tableNode) {
      let result = "\n";
      const rows = tableNode.querySelectorAll("tr");
      let hasProcessedHeader = false;

      for (const row of rows) {
        const cells = row.querySelectorAll("th, td");
        if (cells.length === 0) continue;

        // Process cells into a row
        const rowContent = Array.from(cells)
          .map((cell) => {
            return processChildNodes(cell).trim();
          })
          .join(" | ");

        result += `| ${rowContent} |\n`;

        // Add header separator after first row
        if (!hasProcessedHeader) {
          result +=
            "| " +
            Array.from(cells)
              .map(() => "---")
              .join(" | ") +
            " |\n";
          hasProcessedHeader = true;
        }
      }

      return result + "\n";
    }

    // Start processing from the root node
    markdown = processNode(node);

    // Clean up extra line breaks
    markdown = markdown.replace(/\n{3,}/g, "\n\n");

    return markdown.trim();
  }

  // Convert the content to markdown
  const markdown = convertToMarkdown(markdownDiv);

  // Copy to clipboard
  try {
    navigator.clipboard
      .writeText(markdown)
      .then(() => {
        if (total > 0) {
          showNotification(`Fixed ${total} characters and copied to clipboard`);
        } else {
          showNotification("Content copied to clipboard");
        }
      })
      .catch((err) => {
        console.error("Clipboard write failed:", err);
        if (total > 0) {
          showNotification(
            `Fixed ${total} characters but clipboard copy failed`
          );
        } else {
          showNotification("No characters needed fixing");
        }
      });
  } catch (error) {
    console.error("Error copying to clipboard:", error);
    if (total > 0) {
      showNotification(`Fixed ${total} characters`);
    } else {
      showNotification("No characters needed fixing");
    }
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
