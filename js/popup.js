document.addEventListener("DOMContentLoaded", function () {
  const fixButton = document.getElementById("fixButton");
  const copyButton = document.getElementById("copyButton");
  const statsDiv = document.getElementById("stats");
  const copyStatus = document.getElementById("copyStatus");

  // Add button click listener
  fixButton.addEventListener("click", async () => {
    // Get the current active tab
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (
      tab.url.includes("chat.openai.com") ||
      tab.url.includes("chatgpt.com")
    ) {
      // Execute the content script that does the replacement
      const [results] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: injectAndRunFixer,
      });

      // Show the stats from the replacements
      if (results && results.result) {
        const stats = results.result;

        document.getElementById("emdash-count").textContent = stats.emdash || 0;
        document.getElementById("apostrophe-count").textContent =
          stats.apostrophe || 0;
        document.getElementById("open-quote-count").textContent =
          stats.openQuote || 0;
        document.getElementById("close-quote-count").textContent =
          stats.closeQuote || 0;
        document.getElementById("ellipsis-count").textContent =
          stats.ellipsis || 0;

        const total =
          (stats.emdash || 0) +
          (stats.apostrophe || 0) +
          (stats.openQuote || 0) +
          (stats.closeQuote || 0) +
          (stats.ellipsis || 0);

        document.getElementById("total-count").textContent = total;

        // Show stats section and copy button
        statsDiv.classList.remove("hidden");
        copyButton.classList.remove("hidden");
      }
    } else {
      alert("This extension only works on chat.openai.com or chatgpt.com");
    }
  });

  // Add copy button click listener
  copyButton.addEventListener("click", async () => {
    try {
      // Disable the button during operation
      copyButton.disabled = true;
      copyButton.textContent = "Copying...";

      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      // Execute the script to get the content
      const [results] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: getLastMarkdownContent,
      });

      console.log(`Resulst: ${JSON.stringify(results)}`);
      // If we couldn't get anything, try the fallback method
      if (
        !results?.result ||
        results.result === "No content found" ||
        results.result.startsWith("Error")
      ) {
        console.log("Primary method failed, trying fallback method");

        // Try the fallback method - just get all visible text from all assistant responses
        const [fallbackResults] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: getFallbackContent,
        });

        if (fallbackResults?.result) {
          console.log("Using fallback content instead");
          results.result = fallbackResults.result;
        }
      }

      if (results && results.result) {
        // Copy to clipboard
        await navigator.clipboard.writeText(results.result);

        // Show the copy success message
        copyStatus.textContent = "Copied to clipboard!";
        copyStatus.classList.remove("hidden");

        // Log the copied content
        console.log("Copied content length:", results.result.length);
        if (results.result.length < 100) {
          console.log("Copied content:", results.result);
        } else {
          console.log(
            "Copied content (first 100 chars):",
            results.result.substring(0, 100) + "..."
          );
        }

        // Hide the message after 2 seconds
        setTimeout(() => {
          copyStatus.classList.add("hidden");
        }, 2000);
      } else {
        // Show error if no content found
        copyStatus.textContent = "No content found to copy";
        copyStatus.style.color = "red";
        copyStatus.classList.remove("hidden");

        setTimeout(() => {
          copyStatus.classList.add("hidden");
          copyStatus.style.color = "green"; // Reset for next time
        }, 2000);
      }
    } catch (error) {
      console.error("Error copying content:", error);

      // Show error message
      copyStatus.textContent = "Error copying: " + error.message;
      copyStatus.style.color = "red";
      copyStatus.classList.remove("hidden");

      setTimeout(() => {
        copyStatus.classList.add("hidden");
        copyStatus.style.color = "green"; // Reset for next time
      }, 3000);
    } finally {
      // Re-enable the button
      copyButton.disabled = false;
      copyButton.textContent = "Copy Last Response to Clipboard";
    }
  });
});

// Fallback function to get content when other methods fail
function getFallbackContent() {
  console.log("Using fallback content extraction method");

  try {
    // Try to find assistant messages
    const assistantMessages = document.querySelectorAll(
      '[data-message-author-role="assistant"]'
    );

    if (assistantMessages.length > 0) {
      // Get the last assistant message
      const lastMessage = assistantMessages[assistantMessages.length - 1];

      // Get all the text from the message
      const text = lastMessage.textContent.trim();

      // Clean up the text (remove button text, etc.)
      const cleanText = text.replace(
        /Copy|Regenerate response|New chat|Share|Like|Dislike|Read aloud|Edit in canvas|More/,
        ""
      );

      return cleanText;
    }

    // If no assistant messages found, try to find any content with text
    const contentElements = document.querySelectorAll(
      '.markdown, [class*="markdown"], [class*="content"]'
    );

    if (contentElements.length > 0) {
      const lastElement = contentElements[contentElements.length - 1];
      return lastElement.textContent.trim();
    }

    // As a last resort, look for any paragraph elements
    const paragraphs = document.querySelectorAll("p");
    if (paragraphs.length > 0) {
      // Get the last 5 paragraphs (or fewer if there aren't 5)
      const start = Math.max(0, paragraphs.length - 5);
      let text = "";

      for (let i = start; i < paragraphs.length; i++) {
        text += paragraphs[i].textContent.trim() + "\n\n";
      }

      return text.trim();
    }

    return "No content found with fallback method";
  } catch (error) {
    console.error("Error in fallback content extraction:", error);
    return "Error in fallback extraction: " + error.message;
  }
}

// This function will be injected into the page and contains all necessary helper functions
function injectAndRunFixer() {
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

  // Find all markdown prose divs
  const markdownDivs = document.querySelectorAll("div.markdown.prose");

  if (markdownDivs.length === 0) {
    console.log("No ChatGPT response content found");
    return stats;
  }

  // Process each prose div
  markdownDivs.forEach((div) => {
    // Replace characters and count occurrences
    walkTextNodes(div, (node) => {
      const originalText = node.textContent;

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
  });

  console.log("AI text fixed successfully", stats);
  return stats;
}

// Function to convert HTML to markdown text
function convertToMarkdown(node) {
  // Try a simple approach first for plain text content
  if (node.textContent && node.children.length === 0) {
    console.log("Using simple text extraction");
    return node.textContent.trim();
  }

  // For simple content with just paragraphs, try a direct approach
  if (
    node.children.length > 0 &&
    node.querySelectorAll("pre, code, ul, ol, table, blockquote").length === 0
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
// Function to convert HTML to markdown
function getLastMarkdownContent() {
  try {
    console.log("Starting to get markdown content");

    // Define convertToMarkdown function within the scope
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

    // Try different selectors to find the markdown content
    let markdownDivs = document.querySelectorAll("div.markdown.prose");

    // If the standard selector didn't work, try alternatives
    if (markdownDivs.length === 0) {
      console.log("No div.markdown.prose elements found, trying alternatives");

      // Try more general selector
      markdownDivs = document.querySelectorAll("div.markdown");

      if (markdownDivs.length === 0) {
        // Try to find by class name containing 'markdown'
        markdownDivs = document.querySelectorAll("div[class*='markdown']");
      }

      if (markdownDivs.length === 0) {
        // Last attempt - look for elements that might be response containers
        const responseElements = document.querySelectorAll(
          "[data-message-author-role='assistant']"
        );
        if (responseElements.length > 0) {
          // Try to get content divs from these elements
          const contentDivs = [];
          responseElements.forEach((element) => {
            const divs = element.querySelectorAll("div > div > div");
            if (divs.length > 0) {
              contentDivs.push(...Array.from(divs));
            }
          });

          if (contentDivs.length > 0) {
            markdownDivs = contentDivs;
          }
        }
      }
    }

    console.log(
      "Found " + markdownDivs.length + " potential markdown elements"
    );

    if (markdownDivs.length === 0) {
      console.log("No ChatGPT response content found");
      return "No content found";
    }

    // Get the last markdown div
    const lastDiv = markdownDivs[markdownDivs.length - 1];
    console.log("Selected last div:", lastDiv);

    // Create a text representation of the content
    const markdown = convertToMarkdown(lastDiv);

    console.log("Converted markdown content length:", markdown.length);
    if (markdown.length < 100) {
      console.log("Full markdown:", markdown);
    } else {
      console.log("Markdown preview:", markdown.substring(0, 100) + "...");
    }

    return markdown;
  } catch (error) {
    console.error("Error in getLastMarkdownContent:", error);
    return "Error getting content: " + error.message;
  }
}
